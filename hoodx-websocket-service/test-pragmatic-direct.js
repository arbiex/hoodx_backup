const axios = require('axios');

console.log('🧪 Testando conexão Railway → Pragmatic Play');

async function testPragmaticConnection() {
  try {
    console.log('📡 Fazendo requisição para Railway...');
    
    const response = await axios.post('https://websocket-blaze-production.up.railway.app/test-pragmatic', {
      userId: 'test-direct-connection-' + Date.now()
    }, {
      timeout: 15000
    });
    
    const result = response.data;
    
    console.log('\n🎯 RESULTADO DO TESTE:');
    console.log('='.repeat(50));
    console.log(`✨ Sucesso: ${result.success ? '✅' : '❌'}`);
    console.log(`📍 Etapa: ${result.step}`);
    
    if (result.success) {
      console.log(`💚 ${result.message}`);
      console.log(`🔑 JSESSIONID: ${result.jsessionId}`);
      console.log(`🌐 WebSocket URL: ${result.wsUrl}`);
      console.log('\n🎉 PRAGMATIC PLAY CONECTOU COM SUCESSO! 🎉');
    } else {
      console.log(`❌ Erro: ${result.error}`);
      
      if (result.jsessionId) {
        console.log(`🔑 JSESSIONID: ${result.jsessionId}`);
      }
      
      if (result.wsUrl) {
        console.log(`🌐 WebSocket URL: ${result.wsUrl}`);
      }
      
      console.log('\n🔍 DIAGNÓSTICO:');
      
      switch (result.step) {
        case 'authentication':
          console.log('💡 Problema na autenticação com Supabase Edge Function');
          console.log('   - Verificar variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
          console.log('   - Verificar se a Edge Function machine_learning_blaze_megaroulette está funcionando');
          break;
          
        case 'websocket_timeout':
          console.log('⏰ Timeout na conexão WebSocket');
          console.log('   - O JSESSIONID pode estar inválido');
          console.log('   - Problemas de rede ou firewall');
          console.log('   - Servidor Pragmatic Play pode estar indisponível');
          break;
          
        case 'websocket_error':
          console.log('🔌 Erro específico na conexão WebSocket');
          console.log('   - Verificar URL do WebSocket Pragmatic');
          console.log('   - Problema com certificados SSL');
          console.log('   - JSESSIONID pode estar expirado');
          break;
          
        case 'websocket_closed':
          console.log('🚪 WebSocket fechou inesperadamente');
          console.log('   - Servidor Pragmatic rejeitou a conexão');
          console.log('   - JSESSIONID inválido ou expirado');
          break;
          
        default:
          console.log('❓ Erro desconhecido');
      }
    }
    
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('\n❌ ERRO NA REQUISIÇÃO:');
    console.error('='.repeat(50));
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Servidor Railway não está acessível');
      console.error('   - Verificar se o deploy terminou');
      console.error('   - Verificar URL do Railway');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🌐 DNS não encontrado');
      console.error('   - Verificar URL do Railway');
    } else if (error.response) {
      console.error(`📡 Resposta HTTP: ${error.response.status}`);
      console.error(`📄 Dados: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`💥 Erro: ${error.message}`);
    }
    
    console.error('='.repeat(50));
  }
}

// Executar teste
testPragmaticConnection(); 