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

// Interfaces simples
interface UserConnection {
  userId: string;
  ws: WebSocket;
  pragmaticWs: WebSocket | null;
  jsessionId: string | null;
  isMonitoring: boolean;
  lastPing: number;
}

interface GameResult {
  gameId: string;
  number: number;
  color: 'red' | 'black' | 'green';
  timestamp: number;
}

// Armazenar conexões ativas
const userConnections = new Map<string, UserConnection>();

// Função para autenticar usuário via Edge Function
async function authenticateUser(userId: string): Promise<{ jsessionId: string; pragmaticUserId: string } | null> {
  try {
    console.log(`🔑 [AUTH] Iniciando autenticação para: ${userId.substring(0, 8)}...`);
    
    const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/blaze_history_megaroulette`;
    console.log(`📡 [AUTH] Chamando: ${edgeFunctionUrl}`);
    
    const requestBody = {
      action: 'authenticate',
      user_id: userId
    };
    
    console.log(`📤 [AUTH] Enviando:`, { action: requestBody.action, user_id: userId.substring(0, 8) + '...' });
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📥 [AUTH] Resposta HTTP: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [AUTH] Erro ${response.status}:`, errorText.substring(0, 200));
      return null;
    }

    const result = await response.json();
    console.log(`📋 [AUTH] Resultado:`, { 
      success: result.success, 
      hasData: !!result.data,
      hasJsessionId: !!result.data?.jsessionId,
      error: result.error 
    });
    
    if (!result.success || !result.data?.jsessionId) {
      console.error(`❌ [AUTH] Edge Function falhou:`, result.error || 'Sem jsessionId');
      return null;
    }

    console.log(`✅ [AUTH] SUCESSO! JSESSIONID: ${result.data.jsessionId.substring(0, 10)}...`);
    
    return {
      jsessionId: result.data.jsessionId,
      pragmaticUserId: result.data.pragmaticUserId || userId
    };
    
  } catch (error: any) {
    console.error(`❌ [AUTH] ERRO CATCH:`, {
      name: error.name,
      message: error.message,
      code: error.code
    });
    return null;
  }
}

// Função para conectar ao Pragmatic Play
function connectToPragmatic(userConnection: UserConnection): void {
  if (!userConnection.jsessionId) {
    console.error(`❌ Sem JSESSIONID para usuário ${userConnection.userId}`);
    return;
  }

  try {
    const wsUrl = `wss://games.pragmaticplaylive.net/websocket?JSESSIONID=${userConnection.jsessionId}`;
    console.log(`🔌 Conectando ao Pragmatic Play...`);

    const pragmaticWs = new WebSocket(wsUrl);
    userConnection.pragmaticWs = pragmaticWs;

    pragmaticWs.onopen = () => {
      console.log(`✅ Conectado ao Pragmatic Play`);
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
            
            // Determinar cor
            let color: 'red' | 'black' | 'green' = 'green';
            if ([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(number)) {
              color = 'red';
            } else if ([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35].includes(number)) {
              color = 'black';
            }

            const gameResult: GameResult = {
              gameId,
              number,
              color,
              timestamp: Date.now()
            };

            console.log(`🎯 Resultado: ${number} (${color})`);
            sendToUser(userConnection.userId, {
              type: 'game_result',
              ...gameResult
            });
          }
        }

        // Game started
        if (message.includes('gameStarted')) {
          const gameIdMatch = message.match(/"gameId":"([^"]+)"/);
          const gameId = gameIdMatch?.[1] || 'N/A';
          
          sendToUser(userConnection.userId, {
            type: 'game_started',
            gameId: gameId
          });
        }

        // Bets closing
        if (message.includes('"betsClosing"')) {
          sendToUser(userConnection.userId, {
            type: 'bets_closing'
          });
        }

      } catch (error) {
        console.error(`❌ Erro ao processar mensagem do Pragmatic:`, error);
      }
    };

    pragmaticWs.onerror = (error) => {
      console.error(`❌ Erro WebSocket Pragmatic:`, error);
      sendToUser(userConnection.userId, {
        type: 'pragmatic_error',
        message: 'Erro na conexão com Pragmatic Play'
      });
    };

    pragmaticWs.onclose = (event) => {
      console.log(`🔌 Desconectado do Pragmatic Play - Código: ${event.code}`);
      userConnection.pragmaticWs = null;
      sendToUser(userConnection.userId, {
        type: 'pragmatic_disconnected',
        message: 'Desconectado do Pragmatic Play'
      });
    };

  } catch (error) {
    console.error(`❌ Erro ao conectar ao Pragmatic Play:`, error);
    sendToUser(userConnection.userId, {
      type: 'pragmatic_error',
      message: 'Falha ao conectar com Pragmatic Play'
    });
  }
}

// Função para enviar mensagem para usuário
function sendToUser(userId: string, data: any): void {
  const userConnection = userConnections.get(userId);
  if (userConnection && userConnection.ws.readyState === WebSocket.OPEN) {
    userConnection.ws.send(JSON.stringify(data));
  }
}

// Rotas básicas
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/connections', (req, res) => {
  const connections = Array.from(userConnections.entries()).map(([userId, conn]) => ({
    userId: userId.substring(0, 8) + '...',
    isMonitoring: conn.isMonitoring,
    hasJSessionId: !!conn.jsessionId,
    pragmaticConnected: conn.pragmaticWs?.readyState === WebSocket.OPEN,
    lastPing: new Date(conn.lastPing).toISOString()
  }));

  res.json({ 
    totalConnections: userConnections.size,
    connections 
  });
});

// WebSocket handler
wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    ws.close(1008, 'userId é obrigatório');
    return;
  }

  console.log(`🔌 Nova conexão WebSocket para usuário: ${userId.substring(0, 8)}...`);

  // Criar conexão do usuário
  const userConnection: UserConnection = {
    userId,
    ws,
    pragmaticWs: null,
    jsessionId: null,
    isMonitoring: false,
    lastPing: Date.now()
  };

  userConnections.set(userId, userConnection);

  // Enviar mensagem de boas-vindas
  ws.send(JSON.stringify({
    type: 'welcome',
    message: `Conectado ao servidor HoodX Railway`
  }));

  // Auto-iniciar monitoramento IMEDIATAMENTE
  console.log(`🎯 Iniciando monitoramento IMEDIATO para usuário ${userId.substring(0, 8)}...`);
  
  // Autenticar usuário (sem delay)
  authenticateUser(userId).then(authResult => {
    if (authResult && ws.readyState === WebSocket.OPEN) {
      console.log(`✅ Autenticação OK para ${userId.substring(0, 8)}, conectando ao Pragmatic...`);
      userConnection.jsessionId = authResult.jsessionId;
      userConnection.isMonitoring = true;
      
      // Conectar ao Pragmatic Play
      connectToPragmatic(userConnection);
    } else {
      console.log(`❌ Autenticação FALHOU para ${userId.substring(0, 8)}`);
      sendToUser(userId, {
        type: 'authentication_error',
        message: 'Falha na autenticação'
      });
    }
  }).catch(error => {
    console.error(`❌ Erro na autenticação para ${userId.substring(0, 8)}:`, error);
    sendToUser(userId, {
      type: 'authentication_error',
      message: 'Erro na autenticação'
    });
  });

  // Handlers do WebSocket
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'ping':
          userConnection.lastPing = Date.now();
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
          
        case 'start_monitoring':
          // Já iniciado automaticamente
          break;
          
        case 'stop_monitoring':
          userConnection.isMonitoring = false;
          if (userConnection.pragmaticWs) {
            userConnection.pragmaticWs.close();
            userConnection.pragmaticWs = null;
          }
          break;
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem WebSocket:', error);
    }
  });

  ws.on('close', () => {
    console.log(`🔌 Desconectado: ${userId.substring(0, 8)}...`);
    
    // Fechar conexão Pragmatic se existir
    if (userConnection.pragmaticWs) {
      userConnection.pragmaticWs.close();
    }
    
    // Remover da lista de conexões
    userConnections.delete(userId);
  });

  ws.on('error', (error) => {
    console.error(`❌ Erro WebSocket para ${userId.substring(0, 8)}:`, error);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor Railway rodando na porta ${PORT}`);
  console.log(`🔗 WebSocket disponível em: ws://localhost:${PORT}`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
}); 