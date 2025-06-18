const WebSocket = require('ws');

const RAILWAY_WS_URL = 'wss://websocket-blaze-production.up.railway.app';
const USER_ID = 'test123';

console.log('🚀 Testando servidor WebSocket Railway com integração Pragmatic Play');
console.log(`📡 Conectando em: ${RAILWAY_WS_URL}?userId=${USER_ID}`);

const ws = new WebSocket(`${RAILWAY_WS_URL}?userId=${USER_ID}`);

let messageCount = 0;
let startTime = Date.now();

ws.on('open', function open() {
  console.log('✅ Conectado ao servidor Railway');
  
  // Aguardar um pouco e depois iniciar monitoramento
  setTimeout(() => {
    console.log('🎯 Iniciando monitoramento...');
    ws.send(JSON.stringify({
      type: 'start_monitoring',
      userId: USER_ID
    }));
  }, 1000);
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data.toString());
    messageCount++;
    
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    
    switch (parsed.type) {
      case 'welcome':
        console.log(`🎉 [${timestamp}] Boas-vindas: ${parsed.message}`);
        break;
        
      case 'pragmatic_connected':
        console.log(`🎰 [${timestamp}] ✅ Conectado ao Pragmatic Play!`);
        break;
        
      case 'pragmatic_disconnected':
        console.log(`🔌 [${timestamp}] ❌ Desconectado do Pragmatic Play`);
        break;
        
      case 'game_started':
        console.log(`🎮 [${timestamp}] 🟢 Jogo iniciado: ${parsed.gameId}`);
        break;
        
      case 'bets_closing':
        console.log(`⏰ [${timestamp}] 🔔 Apostas fechando...`);
        break;
        
      case 'game_result':
        const { gameId, number, color } = parsed;
        const colorEmoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';
        console.log(`🎯 [${timestamp}] 🎲 Resultado: ${number} ${colorEmoji} (Game: ${gameId})`);
        break;
        
      case 'dealer_info':
        console.log(`👤 [${timestamp}] 👨‍💼 Dealer: ${parsed.dealerName}`);
        break;
        
      case 'pong':
        console.log(`💓 [${timestamp}] Pong recebido`);
        break;
        
      case 'error':
        console.log(`❌ [${timestamp}] Erro: ${parsed.message}`);
        break;
        
      default:
        console.log(`📦 [${timestamp}] Mensagem: ${parsed.type}`, parsed);
    }
  } catch (error) {
    console.log(`📡 [${new Date().toLocaleTimeString('pt-BR')}] Dados brutos:`, data.toString());
  }
});

ws.on('error', function error(err) {
  console.error('❌ Erro WebSocket:', err.message);
});

ws.on('close', function close(code, reason) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`🔌 Conexão fechada - Código: ${code}, Motivo: ${reason || 'N/A'}`);
  console.log(`📊 Estatísticas: ${messageCount} mensagens em ${duration}s`);
});

// Enviar ping a cada 30 segundos
const pingInterval = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log('🏓 Enviando ping...');
    ws.send(JSON.stringify({ type: 'ping' }));
  } else {
    clearInterval(pingInterval);
  }
}, 30000);

// Simular aposta após 2 minutos (se tudo estiver funcionando)
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log('🎰 Testando funcionalidade de aposta...');
    ws.send(JSON.stringify({
      type: 'place_bet',
      userId: USER_ID,
      bet: {
        tableId: 'mrbras531mrbr532',
        betType: 'color',
        betValue: 'red',
        amount: 10
      }
    }));
  }
}, 120000);

// Parar monitoramento após 3 minutos
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log('⏹️ Parando monitoramento...');
    ws.send(JSON.stringify({
      type: 'stop_monitoring',
      userId: USER_ID
    }));
  }
}, 180000);

// Fechar conexão após 4 minutos
setTimeout(() => {
  console.log('🏁 Finalizando teste...');
  clearInterval(pingInterval);
  ws.close();
}, 240000);

// Capturar Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Encerrando teste...');
  clearInterval(pingInterval);
  ws.close();
  process.exit(0);
}); 