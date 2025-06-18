"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketManager = void 0;
require("dotenv/config");
const ws_1 = require("ws");
const pragmatic_client_1 = require("./pragmatic-client");
const supabase_js_1 = require("@supabase/supabase-js");
class WebSocketManager {
    constructor() {
        this.wss = null;
        this.connections = new Map();
        this.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
    start(port) {
        this.wss = new ws_1.WebSocketServer({ port });
        console.log(`🔌 WebSocket Server rodando na porta ${port}`);
        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });
        // Cleanup de conexões inativas a cada 5 minutos
        setInterval(() => {
            this.cleanupInactiveConnections();
        }, 5 * 60 * 1000);
    }
    startOnServer(server) {
        this.wss = new ws_1.WebSocketServer({ server });
        console.log(`🔌 WebSocket Server attached to HTTP server`);
        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });
        // Cleanup de conexões inativas a cada 5 minutos
        setInterval(() => {
            this.cleanupInactiveConnections();
        }, 5 * 60 * 1000);
    }
    handleConnection(ws, req) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const userId = url.searchParams.get('userId');
        if (!userId) {
            console.log('❌ Conexão rejeitada: userId não fornecido');
            ws.close(1008, 'userId é obrigatório');
            return;
        }
        console.log(`🔌 Nova conexão: ${userId}`);
        // Fechar conexão anterior se existir
        if (this.connections.has(userId)) {
            console.log(`🔄 Fechando conexão anterior para ${userId}`);
            this.closeUserConnection(userId);
        }
        // Criar nova conexão
        const connection = {
            userId,
            clientWs: ws,
            pragmaticClient: null,
            connectedAt: Date.now(),
            lastActivity: Date.now()
        };
        this.connections.set(userId, connection);
        // Setup event listeners
        ws.on('message', (message) => {
            this.handleMessage(userId, message.toString());
        });
        ws.on('close', () => {
            console.log(`🔌 Conexão fechada: ${userId}`);
            this.closeUserConnection(userId);
        });
        ws.on('error', (error) => {
            console.error(`❌ Erro WebSocket ${userId}:`, error);
            this.closeUserConnection(userId);
        });
        // Inicializar conexão com Pragmatic
        this.initializePragmaticConnection(userId);
    }
    async initializePragmaticConnection(userId) {
        const connection = this.connections.get(userId);
        if (!connection)
            return;
        try {
            // Autenticar usuário
            console.log(`🔑 Autenticando usuário ${userId}...`);
            const { data, error } = await this.supabase.functions.invoke('machine_learning_blaze_megaroulette', {
                body: { action: 'authenticate', user_id: userId }
            });
            if (error || !data?.success) {
                throw new Error(data?.error || 'Falha na autenticação');
            }
            const jsessionId = data.data.jsessionId;
            // Criar cliente Pragmatic
            const pragmaticClient = new pragmatic_client_1.PragmaticClient(jsessionId, userId);
            // Setup callbacks
            pragmaticClient.on('connected', () => {
                this.sendToClient(userId, {
                    type: 'status',
                    status: 'connected',
                    message: 'Conectado ao Pragmatic Play'
                });
            });
            pragmaticClient.on('message', (data) => {
                this.sendToClient(userId, {
                    type: 'game-data',
                    data: data
                });
                connection.lastActivity = Date.now();
            });
            pragmaticClient.on('error', (error) => {
                this.sendToClient(userId, {
                    type: 'error',
                    message: error
                });
            });
            pragmaticClient.on('disconnected', () => {
                this.sendToClient(userId, {
                    type: 'status',
                    status: 'disconnected',
                    message: 'Desconectado do Pragmatic Play'
                });
            });
            // Conectar
            await pragmaticClient.connect();
            connection.pragmaticClient = pragmaticClient;
        }
        catch (error) {
            console.error(`❌ Erro ao conectar ${userId}:`, error.message);
            this.sendToClient(userId, {
                type: 'error',
                message: `Erro na conexão: ${error.message}`
            });
        }
    }
    handleMessage(userId, message) {
        const connection = this.connections.get(userId);
        if (!connection)
            return;
        connection.lastActivity = Date.now();
        try {
            const data = JSON.parse(message);
            // Ping/Pong
            if (data.type === 'ping') {
                this.sendToClient(userId, { type: 'pong', timestamp: Date.now() });
                return;
            }
            // Encaminhar para Pragmatic se necessário
            if (data.type === 'bet' && connection.pragmaticClient) {
                connection.pragmaticClient.sendBet(data.payload);
            }
        }
        catch (error) {
            console.error(`❌ Erro ao processar mensagem de ${userId}:`, error);
        }
    }
    sendToClient(userId, data) {
        const connection = this.connections.get(userId);
        if (connection && connection.clientWs.readyState === ws_1.WebSocket.OPEN) {
            connection.clientWs.send(JSON.stringify(data));
        }
    }
    closeUserConnection(userId) {
        const connection = this.connections.get(userId);
        if (connection) {
            connection.pragmaticClient?.disconnect();
            connection.clientWs.close();
            this.connections.delete(userId);
        }
    }
    cleanupInactiveConnections() {
        const now = Date.now();
        const INACTIVE_TIMEOUT = 10 * 60 * 1000; // 10 minutos
        for (const [userId, connection] of this.connections) {
            if (now - connection.lastActivity > INACTIVE_TIMEOUT) {
                console.log(`🧹 Limpando conexão inativa: ${userId}`);
                this.closeUserConnection(userId);
            }
        }
    }
    getActiveConnections() {
        return this.connections.size;
    }
    getStats() {
        const stats = {
            totalConnections: this.connections.size,
            connections: Array.from(this.connections.values()).map(conn => ({
                userId: conn.userId,
                connectedAt: conn.connectedAt,
                lastActivity: conn.lastActivity,
                pragmaticConnected: conn.pragmaticClient?.isConnected() || false
            }))
        };
        return stats;
    }
    shutdown() {
        console.log('🛑 Fechando todas as conexões...');
        for (const userId of this.connections.keys()) {
            this.closeUserConnection(userId);
        }
        this.wss?.close();
    }
}
exports.WebSocketManager = WebSocketManager;
