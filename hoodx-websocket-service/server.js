const { WebSocketServer } = require('ws');
const WebSocket = require('ws');
const http = require('http');
const fetch = require('node-fetch');

const server = http.createServer();
const wss = new WebSocketServer({ server });

console.log('🚀 Iniciando servidor WebSocket Railway...');

// Armazenar conexões ativas
const activeConnections = new Map();
const pragmaticConnections = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId') || 'anonimo';
  const supabaseUrl = url.searchParams.get('supabaseUrl');
  const supabaseKey = url.searchParams.get('supabaseKey');
  
  console.log(`🔌 Nova conexão: ${userId}`);
  
  // Armazenar conexão
  activeConnections.set(userId, ws);
  
  // Mensagem de boas-vindas
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Conectado ao servidor Railway!',
    timestamp: Date.now()
  }));

  // Função para conectar ao Pragmatic Play
  const connectToPragmatic = async () => {
    try {
      console.log(`🔐 Iniciando autenticação para ${userId}...`);
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Credenciais Supabase não fornecidas');
      }

      // Chamar Edge Function para autenticação
      const authResponse = await fetch(`${supabaseUrl}/functions/v1/machine_learning_blaze_megaroulette`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'authenticate',
          userId: userId
        })
      });

      if (!authResponse.ok) {
        throw new Error(`Erro na autenticação: ${authResponse.status}`);
      }

      const authData = await authResponse.json();
      
      if (!authData.success) {
        throw new Error(`Falha na autenticação: ${authData.error}`);
      }

      const { ppToken, jsessionId, originalUserId } = authData.data;
      
      console.log(`✅ Autenticação bem-sucedida para ${userId}`);
      
      ws.send(JSON.stringify({
        type: 'auth_success',
        message: 'Autenticação realizada com sucesso',
        data: { ppToken, jsessionId, originalUserId },
        timestamp: Date.now()
      }));

      // Conectar ao WebSocket do Pragmatic Play
      const pragmaticWs = new WebSocket(`wss://pragmaticplaylive.net/websocket?pp_token=${ppToken}`, [], {
        headers: {
          'Cookie': `JSESSIONID=${jsessionId}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://pragmaticplaylive.net'
        }
      });

      pragmaticConnections.set(userId, pragmaticWs);

      pragmaticWs.on('open', () => {
        console.log(`🎰 Conectado ao Pragmatic Play para ${userId}`);
        
        ws.send(JSON.stringify({
          type: 'pragmatic_connected',
          message: 'Conectado ao Pragmatic Play',
          timestamp: Date.now()
        }));

        // Entrar na mesa Mega Roulette
        pragmaticWs.send(JSON.stringify({
          id: 'roulette_table',
          command: 'join_table',
          params: {
            tableId: 'MegaRouletteBrazilian',
            language: 'pt'
          }
        }));
      });

      pragmaticWs.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`📨 Pragmatic → ${userId}:`, message.command || message.type || 'unknown');
          
          // Repassar mensagem para o frontend
          ws.send(JSON.stringify({
            type: 'pragmatic_message',
            data: message,
            timestamp: Date.now()
          }));

          // Processar resultados de jogos
          if (message.command === 'game_result' || message.type === 'result') {
            const gameResult = extractGameResult(message);
            if (gameResult) {
              ws.send(JSON.stringify({
                type: 'game_result',
                gameId: gameResult.gameId,
                number: gameResult.number,
                color: gameResult.color,
                timestamp: Date.now()
              }));
            }
          }
        } catch (error) {
          console.error(`❌ Erro ao processar mensagem Pragmatic:`, error);
        }
      });

      pragmaticWs.on('close', () => {
        console.log(`🔌 Desconectado do Pragmatic Play: ${userId}`);
        pragmaticConnections.delete(userId);
        
        ws.send(JSON.stringify({
          type: 'pragmatic_disconnected',
          message: 'Desconectado do Pragmatic Play',
          timestamp: Date.now()
        }));
      });

      pragmaticWs.on('error', (error) => {
        console.error(`❌ Erro Pragmatic WebSocket:`, error);
        
        ws.send(JSON.stringify({
          type: 'pragmatic_error',
          message: `Erro na conexão Pragmatic: ${error.message}`,
          timestamp: Date.now()
        }));
      });

    } catch (error) {
      console.error(`❌ Erro na conexão Pragmatic para ${userId}:`, error);
      
      ws.send(JSON.stringify({
        type: 'pragmatic_error',
        message: `Erro na conexão: ${error.message}`,
        timestamp: Date.now()
      }));
    }
  };

  // Iniciar conexão com Pragmatic após 1 segundo
  setTimeout(connectToPragmatic, 1000);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Frontend → ${userId}:`, message.type);
      
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
      
      // Repassar mensagens para o Pragmatic se necessário
      if (message.type === 'pragmatic_command') {
        const pragmaticWs = pragmaticConnections.get(userId);
        if (pragmaticWs && pragmaticWs.readyState === WebSocket.OPEN) {
          pragmaticWs.send(JSON.stringify(message.data));
        }
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`🔌 Desconectado: ${userId}`);
    activeConnections.delete(userId);
    
    // Fechar conexão Pragmatic se existir
    const pragmaticWs = pragmaticConnections.get(userId);
    if (pragmaticWs) {
      pragmaticWs.close();
      pragmaticConnections.delete(userId);
    }
  });
  
  ws.on('error', (error) => {
    console.error(`❌ Erro WebSocket:`, error);
  });
});

// Função para extrair resultado do jogo
function extractGameResult(message) {
  try {
    // Diferentes formatos possíveis de resultado
    if (message.data && message.data.result) {
      const result = message.data.result;
      return {
        gameId: message.data.gameId || `GAME_${Date.now()}`,
        number: result.score || result.number,
        color: result.color || getColorFromNumber(result.score || result.number)
      };
    }
    
    if (message.result) {
      return {
        gameId: message.gameId || `GAME_${Date.now()}`,
        number: message.result.score || message.result.number,
        color: message.result.color || getColorFromNumber(message.result.score || message.result.number)
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao extrair resultado:', error);
    return null;
  }
}

// Função para determinar cor baseada no número
function getColorFromNumber(number) {
  if (number === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(number) ? 'red' : 'black';
}

// Health check
server.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      activeConnections: activeConnections.size,
      pragmaticConnections: pragmaticConnections.size
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
  console.log(`📡 WebSocket: wss://websocket-blaze-megaroulette-production.up.railway.app?userId=USER_ID&supabaseUrl=SUPABASE_URL&supabaseKey=SUPABASE_KEY`);
  console.log(`💚 Health: https://websocket-blaze-megaroulette-production.up.railway.app/health`);
}); 