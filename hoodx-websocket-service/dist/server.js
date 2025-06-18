"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const websocket_manager_1 = require("./websocket-manager");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middlewares
app.use((0, cors_1.default)({
    origin: [
        'https://hoodx.ai',
        'https://hoodx.vercel.app',
        'http://localhost:3000'
    ]
}));
app.use(express_1.default.json());
// Rotas HTTP
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'WebSocket Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
app.get('/stats', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Stats endpoint - WebSocket manager will be added here'
    });
});
// Criar servidor HTTP
const httpServer = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🌐 Server rodando na porta ${PORT}`);
});
// Inicializar WebSocket Manager na mesma porta
const wsManager = new websocket_manager_1.WebSocketManager();
wsManager.startOnServer(httpServer);
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Recebido SIGTERM, fechando servidores...');
    wsManager.shutdown();
    httpServer.close(() => {
        console.log('✅ Servidores fechados');
        process.exit(0);
    });
});
