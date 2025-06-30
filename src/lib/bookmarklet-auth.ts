/**
 * 📋 Autenticação via Bookmarklet
 * O usuário clica em um bookmarklet que abre a Blaze e executa autenticação
 */

export function generateBookmarkletCode(blazeToken: string, callbackUrl: string): string {
  const bookmarkletCode = `
    javascript:(function(){
      console.log('🔥 [BOOKMARKLET] Iniciando autenticação na Blaze...');
      
      // Verificar se estamos na Blaze
      if (!window.location.hostname.includes('blaze.bet.br')) {
        alert('❌ Execute este bookmarklet na página da Blaze!');
        return;
      }
      
      // Função para autenticar
      async function authenticate() {
        try {
          console.log('🎯 [BOOKMARKLET] Fazendo requisição autenticação...');
          
          const response = await fetch('/api/games/mega-roulette---brazilian/play', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ${blazeToken}',
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              selected_currency_type: 'BRL'
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('✅ [BOOKMARKLET] Autenticação bem-sucedida!', data);
            
            if (data.url && data.url.includes('token%3D')) {
              const tokenMatch = data.url.match(/token%3D([^%]+)/);
              if (tokenMatch) {
                const ppToken = tokenMatch[1];
                console.log('🎫 [BOOKMARKLET] ppToken extraído:', ppToken);
                
                // Enviar resultado de volta para nossa app
                const resultWindow = window.open('${callbackUrl}', '_blank');
                resultWindow.postMessage({
                  type: 'blaze_auth_result',
                  success: true,
                  ppToken: ppToken,
                  timestamp: Date.now()
                }, '*');
                
                alert('✅ Autenticação realizada! Verifique a outra aba.');
                return;
              }
            }
          }
          
          alert('❌ Falha na autenticação. Verifique seu token.');
          
        } catch (error) {
          console.error('❌ [BOOKMARKLET] Erro:', error);
          alert('❌ Erro na autenticação: ' + error.message);
        }
      }
      
      // Executar autenticação
      authenticate();
      
    })();
  `;
  
  return bookmarkletCode.replace(/\s+/g, ' ').trim();
}

export function createBookmarkletInstructions(blazeToken: string): {
  bookmarkletUrl: string;
  instructions: string[];
} {
  const callbackUrl = `${window.location.origin}/auth-callback`;
  const bookmarkletCode = generateBookmarkletCode(blazeToken, callbackUrl);
  
  return {
    bookmarkletUrl: bookmarkletCode,
    instructions: [
      '1. 📌 Arraste o link abaixo para sua barra de favoritos',
      '2. 🌐 Abra blaze.bet.br em uma nova aba',
      '3. 🔐 Faça login na sua conta Blaze',
      '4. 📋 Clique no bookmarklet na barra de favoritos',
      '5. ✅ A autenticação será executada automaticamente'
    ]
  };
} 