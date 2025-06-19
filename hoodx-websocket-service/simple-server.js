const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Mapa para armazenar clientes conectados
const clients = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeConnections: clients.size
  });
});

// Criar servidor HTTP
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

// Criar servidor WebSocket usando o mesmo servidor HTTP
const wss = new WebSocket.Server({ server });

wss.on('connection', async (ws, req) => {
  console.log('📡 Nova conexão WebSocket recebida');
  
  // Extrair parâmetros da URL
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const userId = url.searchParams.get('userId');
  const supabaseUrl = url.searchParams.get('supabaseUrl');
  const supabaseKey = url.searchParams.get('supabaseKey');
  const accessToken = url.searchParams.get('accessToken');
  
  console.log('🔑 Parâmetros recebidos:', { userId, supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey, accessToken: !!accessToken });
  
  if (!userId || !supabaseUrl || !supabaseKey) {
    console.log('❌ Parâmetros obrigatórios ausentes');
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Parâmetros obrigatórios ausentes: userId, supabaseUrl, supabaseKey'
    }));
    ws.close();
    return;
  }
  
  // Armazenar informações do cliente
  const clientInfo = {
    userId,
    ws,
    supabaseUrl,
    supabaseKey,
    accessToken,
    pragmaticWs: null,
    connected: true,
    lastPing: Date.now()
  };
  
  clients.set(userId, clientInfo);
  
  // Enviar mensagem de boas-vindas
  ws.send(JSON.stringify({
    type: 'welcome',
    message: `Conectado ao servidor WebSocket! UserId: ${userId}`
  }));
  
  // Inicializar cliente Supabase
  let supabase;
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    
    // Se temos accessToken, configurar a sessão
    if (accessToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: '' // Não precisamos do refresh token para essa operação
      });
    }
    
    ws.send(JSON.stringify({
      type: 'auth_success',
      message: 'Autenticação realizada com sucesso'
    }));
    
    console.log('✅ Cliente Supabase configurado para usuário:', userId);
  } catch (error) {
    console.error('❌ Erro ao configurar Supabase:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Erro de autenticação: ${error.message}`
    }));
  }
  
  // Não conectar ao Pragmatic Play automaticamente
  // A conexão será feita quando receber credenciais válidas do frontend
  ws.send(JSON.stringify({
    type: 'info',
    message: 'Aguardando credenciais do Pragmatic Play...'
  }));
  
  // Gerenciar mensagens do cliente
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'ping':
          clientInfo.lastPing = Date.now();
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
          
        case 'pragmatic_connect':
          // Conectar ao Pragmatic Play com credenciais fornecidas
          const { jsessionId, tableId } = data;
          console.log(`🔑 Recebidas credenciais para usuário ${userId}:`, { 
            jsessionId: jsessionId?.substring(0, 20) + '...', 
            tableId 
          });
          
          if (jsessionId && tableId) {
            connectToPragmatic(clientInfo, jsessionId, tableId);
          } else {
            console.log('❌ Credenciais inválidas recebidas:', { jsessionId: !!jsessionId, tableId: !!tableId });
            ws.send(JSON.stringify({
              type: 'error',
              message: 'JSESSIONID e tableId são obrigatórios para conectar ao Pragmatic Play'
            }));
          }
          break;
          
        case 'refresh_credentials':
          // Solicitar novas credenciais do frontend
          console.log(`🔄 Solicitando credenciais frescas para usuário ${userId}`);
          ws.send(JSON.stringify({
            type: 'request_fresh_credentials',
            message: 'Por favor, forneça credenciais atualizadas do Pragmatic Play'
          }));
          break;
          
        case 'pragmatic_command':
          // Repassar comando para o Pragmatic Play
          if (clientInfo.pragmaticWs && clientInfo.pragmaticWs.readyState === WebSocket.OPEN) {
            clientInfo.pragmaticWs.send(JSON.stringify(data.command));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Não conectado ao Pragmatic Play. Use pragmatic_connect primeiro.'
            }));
          }
          break;
          
        default:
          console.log('📦 Mensagem recebida:', data.type);
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Erro ao processar mensagem: ${error.message}`
      }));
    }
  });
  
  // Gerenciar desconexão
  ws.on('close', () => {
    console.log('🔌 Cliente desconectado:', userId);
    clientInfo.connected = false;
    
    // Fechar conexão com Pragmatic Play
    if (clientInfo.pragmaticWs) {
      clientInfo.pragmaticWs.close();
    }
    
    clients.delete(userId);
  });
  
  // Gerenciar erros
  ws.on('error', (error) => {
    console.error('❌ Erro WebSocket:', error);
    clientInfo.connected = false;
    clients.delete(userId);
  });
});

// Função para conectar ao Pragmatic Play
function connectToPragmatic(clientInfo, jsessionId, tableId) {
  const pragmaticUrl = `wss://gs9.pragmaticplaylive.net/game?JSESSIONID=${jsessionId}&tableId=${tableId}`;
  
  console.log(`🎰 Conectando ao Pragmatic Play para usuário ${clientInfo.userId}...`);
  
  // Armazenar credenciais para reconexão
  clientInfo.jsessionId = jsessionId;
  clientInfo.tableId = tableId;
  
  const pragmaticWs = new WebSocket(pragmaticUrl, {
    headers: {
      'Origin': 'https://client.pragmaticplaylive.net',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Protocol': 'chat'
    }
  });
  clientInfo.pragmaticWs = pragmaticWs;
  
  pragmaticWs.on('open', () => {
    console.log(`✅ Conectado ao Pragmatic Play para usuário ${clientInfo.userId}`);
    
    if (clientInfo.connected) {
      clientInfo.ws.send(JSON.stringify({
        type: 'pragmatic_connected',
        message: 'Conectado ao Pragmatic Play'
      }));
    }
    
    // Enviar comando inicial para se inscrever nos eventos da Mega Roulette
    const subscribeCommand = {
      action: 'join',
      game: 'megaroulette',
      table: 'brazilian'
    };
    
    pragmaticWs.send(JSON.stringify(subscribeCommand));
  });
  
  pragmaticWs.on('message', (message) => {
    const messageStr = message.toString();
    
    try {
      // Tentar processar como JSON primeiro
      const data = JSON.parse(messageStr);
      
      // Processar mensagens JSON específicas do Pragmatic Play
      if (data.action === 'game_result' || data.type === 'result' || (data.data && data.data.result)) {
        const gameId = data.gameId || data.id || `game_${Date.now()}`;
        const resultData = data.result || data.data?.result || data;
        const number = resultData?.number || resultData?.value || 0;
        const color = getRouletteColor(number);
        
        console.log(`🎯 Resultado JSON para usuário ${clientInfo.userId}: ${number} (${color})`);
        
        if (clientInfo.connected) {
          clientInfo.ws.send(JSON.stringify({
            type: 'game_result',
            gameId,
            number,
            color,
            timestamp: Date.now(),
            originalData: data
          }));
        }
      }
      
      // Repassar mensagem JSON para o cliente
      if (clientInfo.connected) {
        clientInfo.ws.send(JSON.stringify({
          type: 'pragmatic_message',
          data: data
        }));
      }
      
    } catch (jsonError) {
      // Mensagem não é JSON - processar como XML
      console.log(`📋 XML do Pragmatic (${clientInfo.userId}): ${messageStr.substring(0, 100)}...`);
      
      try {
        // Processar mensagens XML específicas
        if (messageStr.includes('<game id=')) {
          // Novo jogo iniciado
          const gameIdMatch = messageStr.match(/id="([^"]+)"/);
          const gameId = gameIdMatch ? gameIdMatch[1] : 'unknown';
          
          if (clientInfo.connected) {
            clientInfo.ws.send(JSON.stringify({
              type: 'game_started',
              gameId: gameId,
              timestamp: Date.now(),
              message: 'Novo jogo iniciado'
            }));
          }
        } else if (messageStr.includes('<timer')) {
          // Timer do jogo
          const timerMatch = messageStr.match(/>(\d+)</);
          const timeLeft = timerMatch ? parseInt(timerMatch[1]) : 0;
          
          if (timeLeft > 0 && clientInfo.connected) {
            clientInfo.ws.send(JSON.stringify({
              type: 'game_timer',
              timeLeft: timeLeft,
              timestamp: Date.now()
            }));
          }
        } else if (messageStr.includes('<StatisticHistory')) {
          // Histórico de resultados - extrair números
          try {
            const historyMatch = messageStr.match(/{"history":\[.*?\]/);
            if (historyMatch) {
              const historyData = JSON.parse(historyMatch[0] + '}');
              const results = historyData.history.slice(0, 20).map(item => ({
                number: parseInt(item.gr),
                color: getRouletteColor(parseInt(item.gr)),
                gameId: `history_${item.gr}_${Date.now()}`
              }));
              
              console.log(`📊 Histórico recebido para usuário ${clientInfo.userId}: ${results.length} resultados`);
              
              if (clientInfo.connected) {
                clientInfo.ws.send(JSON.stringify({
                  type: 'game_history',
                  results: results,
                  timestamp: Date.now()
                }));
              }
            }
          } catch (historyError) {
            console.log('❌ Erro ao processar histórico:', historyError.message);
          }
        }
        
        // Sempre repassar mensagem XML original (sem erro)
        if (clientInfo.connected) {
          clientInfo.ws.send(JSON.stringify({
            type: 'pragmatic_xml',
            message: messageStr,
            timestamp: Date.now()
          }));
        }
        
      } catch (xmlError) {
        console.error('❌ Erro ao processar XML do Pragmatic:', xmlError);
        
        if (clientInfo.connected) {
          clientInfo.ws.send(JSON.stringify({
            type: 'pragmatic_error',
            message: `Erro ao processar XML: ${xmlError.message}`
          }));
        }
      }
    }
  });
  
  pragmaticWs.on('close', (code, reason) => {
    console.log(`🔌 Desconectado do Pragmatic Play para usuário ${clientInfo.userId} (${code}: ${reason.toString()})`);
    console.log(`🔍 Detalhes da desconexão - Code: ${code}, Reason: ${reason.toString()}, Intencional: ${code === 1000}`);
    clientInfo.pragmaticWs = null;
    
    if (clientInfo.connected) {
      clientInfo.ws.send(JSON.stringify({
        type: 'pragmatic_disconnected',
        message: 'Desconectado do Pragmatic Play',
        code: code,
        reason: reason.toString()
      }));
    }
    
    // Tentar reconectar automaticamente após 5 segundos se a desconexão não foi intencional
    if (clientInfo.connected && code !== 1000 && clientInfo.jsessionId && clientInfo.tableId) {
      console.log(`🔄 Tentando reconectar ao Pragmatic Play para usuário ${clientInfo.userId} em 5 segundos...`);
      setTimeout(() => {
        if (clientInfo.connected && !clientInfo.pragmaticWs) {
          console.log(`🔄 Reconectando ao Pragmatic Play para usuário ${clientInfo.userId}...`);
          console.log(`🔑 Usando credenciais salvas - JSESSIONID: ${clientInfo.jsessionId?.substring(0, 20)}..., TableID: ${clientInfo.tableId}`);
          connectToPragmatic(clientInfo, clientInfo.jsessionId, clientInfo.tableId);
        }
      }, 5000);
    } else if (clientInfo.connected) {
      console.log(`📋 Não reconectando - Code: ${code}, JSESSIONID: ${!!clientInfo.jsessionId}, TableID: ${!!clientInfo.tableId}`);
      clientInfo.ws.send(JSON.stringify({
        type: 'info',
        message: 'Conexão com Pragmatic Play perdida. Use pragmatic_connect para reconectar.'
      }));
    }
  });
  
  pragmaticWs.on('error', (error) => {
    console.error(`❌ Erro Pragmatic Play para usuário ${clientInfo.userId}:`, error);
    
    if (clientInfo.connected) {
      clientInfo.ws.send(JSON.stringify({
        type: 'pragmatic_error',
        message: `Erro de conexão: ${error.message}`
      }));
    }
  });
}

// Função para determinar a cor do número na roleta
function getRouletteColor(number) {
  if (number === 0) return 'green';
  
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(number) ? 'red' : 'black';
}

// Limpar conexões inativas a cada 60 segundos
setInterval(() => {
  const now = Date.now();
  const timeout = 60000; // 60 segundos
  
  for (const [userId, clientInfo] of clients.entries()) {
    if (now - clientInfo.lastPing > timeout) {
      console.log(`🧹 Removendo conexão inativa: ${userId}`);
      if (clientInfo.ws.readyState === WebSocket.OPEN) {
        clientInfo.ws.close();
      }
      if (clientInfo.pragmaticWs) {
        clientInfo.pragmaticWs.close();
      }
      clients.delete(userId);
    }
  }
}, 60000);

console.log('🎮 Servidor WebSocket HoodX iniciado!');
console.log(`📡 WebSocket URL: ws://localhost:${PORT}`);
console.log(`🌐 Health check: http://localhost:${PORT}/health`); 