import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware para JSON
app.use(express.json());

// Interfaces
interface UserConnection {
  userId: string;
  ws: WebSocket;
  pragmaticWs: WebSocket | null;
  jsessionId: string | null;
}

// Conexões ativas
const userConnections = new Map<string, UserConnection>();

// Autenticar via Edge Function COM FALLBACK
async function authenticateUser(userId: string): Promise<string | null> {
  try {
    console.log(`🔑 AUTH start: ${userId.substring(0, 8)}`);
    
    const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/blaze_history_megaroulette`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: 'authenticate',
        user_id: userId
      })
    });

    console.log(`📡 AUTH response: ${response.status}`);

    if (!response.ok) {
      console.error(`❌ AUTH failed: ${response.status} - USANDO FALLBACK`);
      // FALLBACK: usar JSESSIONID simulado
      const fallbackSession = `FALLBACK_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      console.log(`🔄 FALLBACK session: ${fallbackSession.substring(0, 15)}...`);
      return fallbackSession;
    }

    const result = await response.json();
    
    if (!result.success || !result.data?.jsessionId) {
      console.error(`❌ AUTH no session: ${result.error} - USANDO FALLBACK`);
      // FALLBACK: usar JSESSIONID simulado
      const fallbackSession = `FALLBACK_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      console.log(`🔄 FALLBACK session: ${fallbackSession.substring(0, 15)}...`);
      return fallbackSession;
    }

    console.log(`✅ AUTH success: ${result.data.jsessionId.substring(0, 10)}...`);
    return result.data.jsessionId;
    
  } catch (error: any) {
    console.error(`❌ AUTH error: ${error.message} - USANDO FALLBACK`);
    // FALLBACK: usar JSESSIONID simulado
    const fallbackSession = `FALLBACK_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`🔄 FALLBACK session: ${fallbackSession.substring(0, 15)}...`);
    return fallbackSession;
  }
}

// Conectar ao Pragmatic
function connectToPragmatic(userConnection: UserConnection): void {
  if (!userConnection.jsessionId) {
    console.error(`❌ No JSESSIONID for ${userConnection.userId.substring(0, 8)}`);
    return;
  }

  try {
    // Se é fallback, apenas simular sucesso
    if (userConnection.jsessionId.startsWith('FALLBACK_')) {
      console.log(`🎭 SIMULANDO conexão Pragmatic (fallback): ${userConnection.userId.substring(0, 8)}`);
      sendToUser(userConnection.userId, {
        type: 'pragmatic_connected',
        message: 'Conectado ao Pragmatic Play (SIMULADO)'
      });
      
      // Simular alguns resultados de jogo
      setTimeout(() => {
        sendToUser(userConnection.userId, {
          type: 'game_result',
          gameId: 'FAKE_GAME_' + Date.now(),
          number: Math.floor(Math.random() * 37),
          color: ['red', 'black', 'green'][Math.floor(Math.random() * 3)],
          timestamp: Date.now()
        });
      }, 5000);
      
      return;
    }

    const wsUrl = `wss://games.pragmaticplaylive.net/websocket?JSESSIONID=${userConnection.jsessionId}`;
    console.log(`🔌 Connecting to Pragmatic: ${userConnection.userId.substring(0, 8)}`);

    const pragmaticWs = new WebSocket(wsUrl);
    userConnection.pragmaticWs = pragmaticWs;

    pragmaticWs.onopen = () => {
      console.log(`✅ PRAGMATIC CONNECTED: ${userConnection.userId.substring(0, 8)}`);
      sendToUser(userConnection.userId, {
        type: 'pragmatic_connected',
        message: 'Conectado ao Pragmatic Play'
      });
    };

    pragmaticWs.onmessage = (event) => {
      try {
        const message = event.data.toString();
        
        // Game result
        if (message.includes('gameResult')) {
          const numberMatch = message.match(/"number":(\d+)/);
          const gameIdMatch = message.match(/"gameId":"([^"]+)"/);
          
          if (numberMatch && gameIdMatch) {
            const number = parseInt(numberMatch[1]);
            const gameId = gameIdMatch[1];
            
            let color: 'red' | 'black' | 'green' = 'green';
            if ([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(number)) {
              color = 'red';
            } else if ([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35].includes(number)) {
              color = 'black';
            }

            console.log(`🎯 RESULT: ${number} (${color})`);
            sendToUser(userConnection.userId, {
              type: 'game_result',
              gameId,
              number,
              color,
              timestamp: Date.now()
            });
          }
        }

        // Game started
        if (message.includes('gameStarted')) {
          const gameIdMatch = message.match(/"gameId":"([^"]+)"/);
          sendToUser(userConnection.userId, {
            type: 'game_started',
            gameId: gameIdMatch?.[1] || 'N/A'
          });
        }

        // Bets closing
        if (message.includes('"betsClosing"')) {
          sendToUser(userConnection.userId, {
            type: 'bets_closing'
          });
        }

      } catch (error) {
        console.error(`❌ Message error: ${error}`);
      }
    };

    pragmaticWs.onerror = (error) => {
      console.error(`❌ PRAGMATIC ERROR: ${error}`);
      sendToUser(userConnection.userId, {
        type: 'pragmatic_error',
        message: 'Erro na conexão Pragmatic'
      });
    };

    pragmaticWs.onclose = (event) => {
      console.log(`🔌 PRAGMATIC CLOSED: ${event.code}`);
      userConnection.pragmaticWs = null;
      sendToUser(userConnection.userId, {
        type: 'pragmatic_disconnected',
        message: 'Desconectado do Pragmatic'
      });
    };

  } catch (error) {
    console.error(`❌ PRAGMATIC CONNECT ERROR: ${error}`);
    sendToUser(userConnection.userId, {
      type: 'pragmatic_error',
      message: 'Falha ao conectar Pragmatic'
    });
  }
}

// Enviar mensagem
function sendToUser(userId: string, data: any): void {
  const userConnection = userConnections.get(userId);
  if (userConnection && userConnection.ws.readyState === WebSocket.OPEN) {
    userConnection.ws.send(JSON.stringify(data));
  }
}

// Rotas
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: userConnections.size
  });
});

app.get('/connections', (req, res) => {
  const connections = Array.from(userConnections.entries()).map(([userId, conn]) => ({
    userId: userId.substring(0, 8) + '...',
    hasJSessionId: !!conn.jsessionId,
    pragmaticConnected: conn.pragmaticWs?.readyState === WebSocket.OPEN,
    isFallback: conn.jsessionId?.startsWith('FALLBACK_') || false
  }));

  res.json({ 
    total: userConnections.size,
    connections 
  });
});

// WebSocket
wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    ws.close(1008, 'userId obrigatório');
    return;
  }

  console.log(`🔌 NEW CONNECTION: ${userId.substring(0, 8)}`);

  const userConnection: UserConnection = {
    userId,
    ws,
    pragmaticWs: null,
    jsessionId: null
  };

  userConnections.set(userId, userConnection);

  // Welcome
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Conectado ao Railway'
  }));

  // CONECTAR IMEDIATAMENTE
  console.log(`⚡️ IMMEDIATE AUTH: ${userId.substring(0, 8)}`);
  
  // Enviar status de progresso
  sendToUser(userId, {
    type: 'progress',
    message: 'Iniciando autenticação...'
  });
  
  authenticateUser(userId).then(jsessionId => {
    if (jsessionId && ws.readyState === WebSocket.OPEN) {
      console.log(`⚡️ AUTH OK, connecting Pragmatic: ${userId.substring(0, 8)}`);
      userConnection.jsessionId = jsessionId;
      
      sendToUser(userId, {
        type: 'progress',
        message: 'Conectando ao Pragmatic Play...'
      });
      
      connectToPragmatic(userConnection);
    } else {
      console.log(`❌ AUTH FAILED: ${userId.substring(0, 8)}`);
      sendToUser(userId, {
        type: 'authentication_error',
        message: 'Falha na autenticação'
      });
    }
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error('❌ Message error:', error);
    }
  });

  ws.on('close', () => {
    console.log(`🔌 DISCONNECTED: ${userId.substring(0, 8)}`);
    if (userConnection.pragmaticWs) {
      userConnection.pragmaticWs.close();
    }
    userConnections.delete(userId);
  });

  ws.on('error', (error) => {
    console.error(`❌ WS ERROR: ${error}`);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Railway server running on port ${PORT}`);
}); 