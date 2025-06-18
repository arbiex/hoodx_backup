import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocket } from 'ws';
import { WebSocketManager } from './websocket-manager';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors({
  origin: [
    'https://hoodx.ai',
    'https://hoodx.vercel.app',
    'http://localhost:3000'
  ]
}));
app.use(express.json());

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
const wsManager = new WebSocketManager();
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