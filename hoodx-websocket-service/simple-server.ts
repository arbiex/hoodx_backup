import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Inicializar cliente Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Middleware para JSON
app.use(express.json());

// Interfaces
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

// Armazenar conexões dos usuários
const userConnections = new Map<string, UserConnection>();

// Função para autenticar usuário no Pragmatic Play
async function authenticateUser(userId: string): Promise<{ jsessionId: string; pragmaticUserId: string } | null> {
  try {
    console.log(`🔑 Iniciando autenticação para usuário: ${userId}`);
    
    // Tentar via Edge Function primeiro
    try {
      const { data: authData, error: authError } = await supabase.functions.invoke('machine_learning_blaze_megaroulette', {
        body: { action: 'authenticate', user_id: userId }
      });

      if (!authError && authData?.success && authData.data?.jsessionId) {
        console.log(`✅ Autenticação via Edge Function realizada para ${userId}`);
        return {
          jsessionId: authData.data.jsessionId,
          pragmaticUserId: authData.data.pragmaticUserId || userId
        };
      }
    } catch (edgeError) {
      console.warn(`⚠️ Edge Function falhou para ${userId}:`, edgeError);
    }

    // Fallback para simulação básica (para desenvolvimento)
    console.log(`⚠️ Usando autenticação simulada para ${userId}`);
    const simulatedSessionId = `SIM_${userId}_${Date.now()}`;
    return {
      jsessionId: simulatedSessionId,
      pragmaticUserId: userId
    };

  } catch (error) {
    console.error(`❌ Erro na autenticação para ${userId}:`, error);
    return null;
  }
}

// Função para conectar ao Pragmatic Play WebSocket
function connectToPragmatic(userConnection: UserConnection): void {
  if (!userConnection.jsessionId) {
    console.error(`❌ Sem JSESSIONID para usuário ${userConnection.userId}`);
    return;
  }

  try {
    const wsUrl = `wss://games.pragmaticplaylive.net/websocket?JSESSIONID=${userConnection.jsessionId}`;
    console.log(`🔌 Conectando ao Pragmatic Play para usuário ${userConnection.userId}...`);

    const pragmaticWs = new WebSocket(wsUrl);
    userConnection.pragmaticWs = pragmaticWs;

    pragmaticWs.onopen = () => {
      console.log(`✅ Conectado ao Pragmatic Play para usuário ${userConnection.userId}`);
      sendToUser(userConnection.userId, {
        type: 'pragmatic_connected',
        message: 'Conectado ao Pragmatic Play'
      });

      // Iniciar ping/pong para manter conexão viva
      const pingInterval = setInterval(() => {
        if (pragmaticWs.readyState === WebSocket.OPEN) {
          const timestamp = Date.now();
          const pingMessage = `{"id":"1","jsonrpc":"2.0","method":"protocol/v1/ping","params":{"time":"${timestamp}","seq":"${timestamp}"}}`;
          pragmaticWs.send(pingMessage);
          console.log(`🏓 Ping enviado para Pragmatic (usuário: ${userConnection.userId})`);
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    };

    pragmaticWs.onmessage = (event) => {
      try {
        const message = event.data.toString();
        
        // Processar diferentes tipos de mensagem
        if (message.includes('"pong"')) {
          console.log(`💓 Pong recebido do Pragmatic para usuário ${userConnection.userId}`);
          sendToUser(userConnection.userId, { type: 'pong' });
          return;
        }

        // Game started (apostas abertas)
        if (message.includes('gameStarted')) {
          const gameIdMatch = message.match(/"gameId":"([^"]+)"/);
          const gameId = gameIdMatch?.[1] || 'N/A';
          
          console.log(`🎮 Jogo iniciado: ${gameId} (usuário: ${userConnection.userId})`);
          sendToUser(userConnection.userId, {
            type: 'game_started',
            gameId: gameId
          });
        }

        // Bets closing
        if (message.includes('"betsClosing"')) {
          console.log(`⏰ Apostas fechando para usuário ${userConnection.userId}`);
          sendToUser(userConnection.userId, {
            type: 'bets_closing'
          });
        }

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

            console.log(`🎯 Resultado: ${number} (${color}) para usuário ${userConnection.userId}`);
            sendToUser(userConnection.userId, {
              type: 'game_result',
              ...gameResult
            });

            // Salvar resultado no Supabase (opcional)
            saveGameResult(userConnection.userId, gameResult);
          }
        }

        // Dealer info
        if (message.includes('"dealerName"')) {
          const dealerMatch = message.match(/"dealerName":"([^"]+)"/);
          const dealerName = dealerMatch?.[1] || 'N/A';
          
          sendToUser(userConnection.userId, {
            type: 'dealer_info',
            dealerName: dealerName
          });
        }

      } catch (error) {
        console.error(`❌ Erro ao processar mensagem do Pragmatic para usuário ${userConnection.userId}:`, error);
        sendToUser(userConnection.userId, {
          type: 'error',
          message: 'Erro ao processar mensagem do Pragmatic Play'
        });
      }
    };

    pragmaticWs.onerror = (error) => {
      console.error(`❌ Erro WebSocket Pragmatic para usuário ${userConnection.userId}:`, error);
      sendToUser(userConnection.userId, {
        type: 'error',
        message: 'Erro na conexão com Pragmatic Play'
      });
    };

    pragmaticWs.onclose = (event) => {
      console.log(`🔌 Desconectado do Pragmatic Play para usuário ${userConnection.userId} - Código: ${event.code}`);
      userConnection.pragmaticWs = null;
      sendToUser(userConnection.userId, {
        type: 'pragmatic_disconnected',
        message: 'Desconectado do Pragmatic Play'
      });

      // Tentar reconectar após 5 segundos se a conexão principal ainda existir
      setTimeout(() => {
        if (userConnections.has(userConnection.userId) && userConnection.isMonitoring) {
          console.log(`🔄 Tentando reconectar ao Pragmatic Play para usuário ${userConnection.userId}`);
          connectToPragmatic(userConnection);
        }
      }, 5000);
    };

  } catch (error) {
    console.error(`❌ Erro ao conectar ao Pragmatic Play para usuário ${userConnection.userId}:`, error);
    sendToUser(userConnection.userId, {
      type: 'error',
      message: 'Falha ao conectar com Pragmatic Play'
    });
  }
}

// Função para enviar mensagem para usuário específico
function sendToUser(userId: string, data: any): void {
  const userConnection = userConnections.get(userId);
  if (userConnection && userConnection.ws.readyState === WebSocket.OPEN) {
    userConnection.ws.send(JSON.stringify(data));
  }
}

// Função para salvar resultado no Supabase
async function saveGameResult(userId: string, result: GameResult): Promise<void> {
  try {
    // Aqui você pode implementar a lógica para salvar o resultado
    // Por exemplo, chamar a Edge Function para processar o resultado
    await supabase.functions.invoke('machine_learning_blaze_megaroulette', {
      body: { 
        action: 'process_result', 
        user_id: userId,
        game_result: result
      }
    });
  } catch (error) {
    console.error(`❌ Erro ao salvar resultado para usuário ${userId}:`, error);
  }
}

// Configurar WebSocket Server
wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    console.error('❌ Conexão rejeitada: userId não fornecido');
    ws.close(1008, 'userId é obrigatório');
    return;
  }

  console.log(`🔗 Nova conexão WebSocket para usuário: ${userId}`);

  // Criar conexão do usuário
  const userConnection: UserConnection = {
    userId,
    ws,
    pragmaticWs: null,
    jsessionId: null,
    isMonitoring: false,
    lastPing: Date.now()
  };

  // Armazenar conexão
  userConnections.set(userId, userConnection);

  // Enviar mensagem de boas-vindas
  ws.send(JSON.stringify({
    type: 'welcome',
    message: `Conectado ao servidor HoodX Railway para usuário ${userId}`
  }));

  // Automaticamente iniciar monitoramento após conexão
  setTimeout(async () => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log(`🎯 Auto-iniciando monitoramento para usuário ${userId}`);
      
      // Autenticar usuário
      const authResult = await authenticateUser(userId);
      if (authResult) {
        userConnection.jsessionId = authResult.jsessionId;
        userConnection.isMonitoring = true;
        
        // Conectar ao Pragmatic Play
        connectToPragmatic(userConnection);
      } else {
        sendToUser(userId, {
          type: 'error',
          message: 'Falha na autenticação automática'
        });
      }
    }
  }, 2000); // Aguardar 2 segundos após conexão

  // Lidar com mensagens do cliente
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'start_monitoring':
          console.log(`🎯 Iniciando monitoramento para usuário ${userId}`);
          
          // Autenticar usuário
          const authResult = await authenticateUser(userId);
          if (!authResult) {
            sendToUser(userId, {
              type: 'error',
              message: 'Falha na autenticação'
            });
            return;
          }

          userConnection.jsessionId = authResult.jsessionId;
          userConnection.isMonitoring = true;
          
          // Conectar ao Pragmatic Play
          connectToPragmatic(userConnection);
          break;

        case 'stop_monitoring':
          console.log(`⏹️ Parando monitoramento para usuário ${userId}`);
          userConnection.isMonitoring = false;
          if (userConnection.pragmaticWs) {
            userConnection.pragmaticWs.close();
            userConnection.pragmaticWs = null;
          }
          break;

        case 'place_bet':
          console.log(`🎰 Solicitação de aposta recebida do usuário ${userId}:`, message.bet);
          // Aqui você pode implementar a lógica de apostas
          // Por enquanto, apenas confirmar recebimento
          sendToUser(userId, {
            type: 'bet_placed',
            message: 'Aposta recebida (implementar lógica de apostas)'
          });
          break;

        case 'ping':
          userConnection.lastPing = Date.now();
          sendToUser(userId, { type: 'pong' });
          break;

        default:
          console.log(`📦 Mensagem não reconhecida de ${userId}:`, message.type);
      }
    } catch (error) {
      console.error(`❌ Erro ao processar mensagem de ${userId}:`, error);
      sendToUser(userId, {
        type: 'error',
        message: 'Erro ao processar mensagem'
      });
    }
  });

  // Lidar com desconexão
  ws.on('close', () => {
    console.log(`🔌 Usuário ${userId} desconectado`);
    
    // Fechar conexão com Pragmatic Play
    if (userConnection.pragmaticWs) {
      userConnection.pragmaticWs.close();
    }
    
    // Remover da lista de conexões
    userConnections.delete(userId);
  });

  ws.on('error', (error) => {
    console.error(`❌ Erro WebSocket para usuário ${userId}:`, error);
  });
});

// Rota de health check
app.get('/health', (req, res) => {
  const activeConnections = userConnections.size;
  const pragmaticConnections = Array.from(userConnections.values())
    .filter(conn => conn.pragmaticWs?.readyState === WebSocket.OPEN).length;

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeConnections,
    pragmaticConnections,
    uptime: process.uptime()
  });
});

// Rota para listar conexões ativas (para debug)
app.get('/connections', (req, res) => {
  const connections = Array.from(userConnections.entries()).map(([userId, conn]) => ({
    userId: userId.substring(0, 8) + '...', // Mascarar ID por privacidade
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

// Cleanup: Verificar conexões órfãs a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutos

  for (const [userId, conn] of userConnections.entries()) {
    if (now - conn.lastPing > timeout) {
      console.log(`🧹 Removendo conexão inativa do usuário ${userId}`);
      
      if (conn.pragmaticWs) {
        conn.pragmaticWs.close();
      }
      
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close();
      }
      
      userConnections.delete(userId);
    }
  }
}, 5 * 60 * 1000);

// Iniciar servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Servidor WebSocket HoodX rodando na porta ${PORT}`);
  console.log(`📡 WebSocket endpoint: wss://localhost:${PORT}?userId=<USER_ID>`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
}); 