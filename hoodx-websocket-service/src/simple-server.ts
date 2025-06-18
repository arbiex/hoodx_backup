import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rotas básicas
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WebSocket Server is running!',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Criar servidor HTTP
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🌐 Server rodando na porta ${PORT}`);
});

// WebSocket na mesma porta
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId') || 'anonymous';
  
  console.log(`🔌 Nova conexão WebSocket: ${userId}`);
  
  // Enviar mensagem de boas-vindas
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Conectado ao WebSocket!',
    userId: userId,
    timestamp: Date.now()
  }));
  
  // Ouvir mensagens
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Mensagem de ${userId}:`, message);
      
      // Responder ao ping
      if (message.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`❌ Conexão fechada: ${userId}`);
  });
  
  ws.on('error', (error) => {
    console.error(`❌ Erro WebSocket ${userId}:`, error);
  });
});

console.log(`🔌 WebSocket Server rodando junto com HTTP na porta ${PORT}`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, fechando servidor...');
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
}); 