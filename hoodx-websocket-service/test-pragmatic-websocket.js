const WebSocket = require('ws');

const RAILWAY_WS_URL = 'wss://websocket-blaze-production.up.railway.app';
const USER_ID = 'test-pragmatic-' + Date.now();

console.log('🧪 TESTE ESPECÍFICO: Railway → Pragmatic Play');
console.log('='.repeat(60));
console.log(`📡 Conectando em: ${RAILWAY_WS_URL}?userId=${USER_ID}`);

const ws = new WebSocket(`${RAILWAY_WS_URL}?userId=${USER_ID}`);

let startTime = Date.now();
let railwayConnected = false;
let pragmaticConnected = false;
let receivedWelcome = false;

// Monitorar eventos de conexão
ws.on('open', function open() {
  console.log('✅ RAILWAY: Conectado ao servidor Railway');
  railwayConnected = true;
  console.log('⏱️ Aguardando auto-inicialização do monitoramento...');
});

ws.on('message', function message(data) {
  try {
    const message = JSON.parse(data.toString());
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    
    console.log(`[${timestamp}] 📨 Mensagem recebida:`, {
      type: message.type,
      message: message.message?.substring(0, 100) || 'N/A'
    });
    
    // Analisar mensagens específicas
    switch (message.type) {
      case 'welcome':
        receivedWelcome = true;
        console.log('👋 WELCOME: Recebido do Railway');
        break;
        
      case 'pragmatic_connected':
        pragmaticConnected = true;
        console.log('🎉 PRAGMATIC CONECTADO! ✅');
        break;
        
      case 'pragmatic_error':
        console.log('❌ ERRO PRAGMATIC:', message.error);
        analyzePragmaticError(message.error);
        break;
        
      case 'authentication_success':
        console.log('🔑 AUTENTICAÇÃO: Sucesso');
        console.log('   - JSESSIONID obtido');
        break;
        
      case 'authentication_error':
        console.log('❌ AUTENTICAÇÃO: Falhou');
        console.log('   - Problema na Edge Function do Supabase');
        break;
        
      case 'game_result':
        console.log('🎯 JOGO: Resultado recebido do Pragmatic!');
        console.log('   - Number:', message.data?.number);
        console.log('   - Color:', message.data?.color);
        break;
        
      case 'monitoring_started':
        console.log('👀 MONITORAMENTO: Iniciado');
        break;
        
      case 'error':
        console.log('⚠️ ERRO GERAL:', message.message);
        break;
        
      default:
        console.log(`📋 OUTRO: ${message.type}`);
    }
    
  } catch (error) {
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] 📄 Mensagem não-JSON:`, data.toString());
  }
});

ws.on('error', function error(err) {
  console.log('❌ ERRO WEBSOCKET:', err.message);
});

ws.on('close', function close(code, reason) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n' + '='.repeat(60));
  console.log('🚪 CONEXÃO FECHADA');
  console.log('='.repeat(60));
  console.log(`⏰ Duração: ${duration}s`);
  console.log(`🔢 Código: ${code}`);
  console.log(`📝 Razão: ${reason || 'N/A'}`);
  
  console.log('\n📊 RELATÓRIO FINAL:');
  console.log(`✅ Railway Conectado: ${railwayConnected ? '✅' : '❌'}`);
  console.log(`👋 Welcome Recebido: ${receivedWelcome ? '✅' : '❌'}`);
  console.log(`🎯 Pragmatic Conectado: ${pragmaticConnected ? '✅' : '❌'}`);
  
  if (railwayConnected && !pragmaticConnected) {
    console.log('\n🔍 DIAGNÓSTICO:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Frontend → Railway: OK');
    console.log('❌ Railway → Pragmatic: PROBLEMA');
    console.log('');
    console.log('🛠️ POSSÍVEIS CAUSAS:');
    console.log('  1. Edge Function Supabase não está funcionando');
    console.log('  2. JSESSIONID inválido ou expirado');
    console.log('  3. URL do WebSocket Pragmatic incorreta');
    console.log('  4. Pragmatic Play bloqueando conexões');
    console.log('  5. Variáveis de ambiente SUPABASE não configuradas');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
});

function analyzePragmaticError(error) {
  console.log('\n🔍 ANÁLISE DO ERRO PRAGMATIC:');
  console.log('━'.repeat(40));
  
  if (error.includes('authentication')) {
    console.log('🔑 PROBLEMA DE AUTENTICAÇÃO');
    console.log('   - Verificar Edge Function do Supabase');
    console.log('   - Verificar variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  } else if (error.includes('timeout')) {
    console.log('⏰ TIMEOUT');
    console.log('   - Pragmatic Play não respondeu a tempo');
    console.log('   - Possível problema de rede');
  } else if (error.includes('WebSocket')) {
    console.log('🔌 PROBLEMA WEBSOCKET');
    console.log('   - URL pode estar incorreta');
    console.log('   - JSESSIONID pode estar inválido');
  } else {
    console.log('❓ ERRO DESCONHECIDO');
    console.log('   - Verificar logs do servidor Railway');
  }
  
  console.log('━'.repeat(40));
}

// Fechar após 2 minutos para análise
setTimeout(() => {
  console.log('\n⏰ Tempo limite atingido (2 minutos)');
  ws.close();
}, 120000);

console.log('⏱️ Teste rodará por 2 minutos...');
console.log('🔍 Monitorando especificamente a conexão Railway → Pragmatic Play');
console.log(''); 