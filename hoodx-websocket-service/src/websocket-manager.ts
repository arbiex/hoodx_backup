import 'dotenv/config';
import { WebSocket, WebSocketServer } from 'ws';
import { PragmaticClient } from './pragmatic-client';
import { createClient } from '@supabase/supabase-js';

interface UserConnection {
  userId: string;
  clientWs: WebSocket;
  pragmaticClient: PragmaticClient | null;
  connectedAt: number;
  lastActivity: number;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, UserConnection>();
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  start(port: number) {
    this.wss = new WebSocketServer({ port });
    
    console.log(`🔌 WebSocket Server rodando na porta ${port}`);

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Cleanup de conexões inativas a cada 5 minutos
    setInterval(() => {
      this.cleanupInactiveConnections();
    }, 5 * 60 * 1000);
  }

  startOnServer(server: any) {
    this.wss = new WebSocketServer({ server });
    
    console.log(`🔌 WebSocket Server attached to HTTP server`);

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Cleanup de conexões inativas a cada 5 minutos
    setInterval(() => {
      this.cleanupInactiveConnections();
    }, 5 * 60 * 1000);
  }

  private handleConnection(ws: WebSocket, req: any) {
    const url = new URL(req.url!, `http://${req.headers.host}`);
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
    const connection: UserConnection = {
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

  private async initializePragmaticConnection(userId: string) {
    const connection = this.connections.get(userId);
    if (!connection) return;

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
      const pragmaticClient = new PragmaticClient(jsessionId, userId);
      
      // Setup callbacks
      pragmaticClient.on('connected', () => {
        this.sendToClient(userId, {
          type: 'status',
          status: 'connected',
          message: 'Conectado ao Pragmatic Play'
        });
      });

      pragmaticClient.on('message', (data: string) => {
        this.sendToClient(userId, {
          type: 'game-data',
          data: data
        });
        connection.lastActivity = Date.now();
      });

      pragmaticClient.on('error', (error: string) => {
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

    } catch (error: any) {
      console.error(`❌ Erro ao conectar ${userId}:`, error.message);
      this.sendToClient(userId, {
        type: 'error',
        message: `Erro na conexão: ${error.message}`
      });
    }
  }

  private handleMessage(userId: string, message: string) {
    const connection = this.connections.get(userId);
    if (!connection) return;

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

    } catch (error) {
      console.error(`❌ Erro ao processar mensagem de ${userId}:`, error);
    }
  }

  private sendToClient(userId: string, data: any) {
    const connection = this.connections.get(userId);
    if (connection && connection.clientWs.readyState === WebSocket.OPEN) {
      connection.clientWs.send(JSON.stringify(data));
    }
  }

  private closeUserConnection(userId: string) {
    const connection = this.connections.get(userId);
    if (connection) {
      connection.pragmaticClient?.disconnect();
      connection.clientWs.close();
      this.connections.delete(userId);
    }
  }

  private cleanupInactiveConnections() {
    const now = Date.now();
    const INACTIVE_TIMEOUT = 10 * 60 * 1000; // 10 minutos

    for (const [userId, connection] of this.connections) {
      if (now - connection.lastActivity > INACTIVE_TIMEOUT) {
        console.log(`🧹 Limpando conexão inativa: ${userId}`);
        this.closeUserConnection(userId);
      }
    }
  }

  getActiveConnections(): number {
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