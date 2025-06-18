const WebSocket = require('ws');

console.log('🧪 Testando WebSocket no Railway...');

const ws = new WebSocket('wss://websocket-blaze-megaroulette-production.up.railway.app?userId=teste-railway');

ws.on('open', () => {
  console.log('✅ Conectado ao Railway!');
  
  // Enviar ping
  ws.send(JSON.stringify({ type: 'ping' }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📨 Mensagem recebida:', message);
});

ws.on('error', (error) => {
  console.error('❌ Erro:', error);
});

ws.on('close', () => {
  console.log('🔌 Conexão fechada');
  process.exit(0);
});

// Fechar após 15 segundos para ver todos os dados simulados
setTimeout(() => {
  console.log('⏰ Encerrando teste...');
  ws.close();
}, 15000); 