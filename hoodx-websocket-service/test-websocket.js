const WebSocket = require('ws');

// Teste local (se estiver rodando localmente)
const localUrl = 'ws://localhost:8080?userId=test123';

// Teste Railway (WebSocket na mesma porta do HTTP)
const railwayUrl = 'wss://websocket-blaze-production.up.railway.app?userId=test123';

function testWebSocket(url, name) {
  console.log(`\n🔌 Testando ${name}: ${url}`);
  
  const ws = new WebSocket(url);
  
  ws.on('open', () => {
    console.log(`✅ ${name}: Conectado!`);
    
    // Enviar ping
    ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log(`📨 ${name} Recebido:`, message);
  });
  
  ws.on('close', () => {
    console.log(`❌ ${name}: Conexão fechada`);
  });
  
  ws.on('error', (error) => {
    console.log(`❌ ${name} Erro:`, error.message);
  });
  
  // Fechar após 2 minutos (120 segundos)
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log(`⏰ ${name}: Fechando conexão após 2 minutos`);
      ws.close();
    }
  }, 120000); // 2 minutos
  
  // Enviar ping a cada 30 segundos para manter viva
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log(`🏓 ${name}: Enviando ping...`);
      ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    } else {
      clearInterval(pingInterval);
    }
  }, 30000); // 30 segundos
}

// Testar Railway primeiro
testWebSocket(railwayUrl, 'Railway');

// Se quiser testar local, descomente:
// setTimeout(() => testWebSocket(localUrl, 'Local'), 6000); 