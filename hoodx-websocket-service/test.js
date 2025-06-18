const WebSocket = require('ws');

console.log('🧪 Testando WebSocket...');

const ws = new WebSocket('ws://localhost:3000?userId=teste');

ws.on('open', () => {
  console.log('✅ Conectado!');
  
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

// Fechar após 10 segundos
setTimeout(() => {
  console.log('⏰ Encerrando teste...');
  ws.close();
}, 10000); 