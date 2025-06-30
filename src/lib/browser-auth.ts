/**
 * 🌐 Autenticação via iframe com postMessage (contorna CORS)
 * Esta abordagem usa comunicação entre iframes para executar
 * a autenticação com o IP real do usuário sem proxies
 */

interface AuthTokens {
  ppToken: string;
  jsessionId: string;
  pragmaticUserId: string;
  blazeToken: string;
  timestamp: string;
}

/**
 * 🚀 Executar autenticação usando iframe e postMessage
 */
export async function authenticateViaBrowser(blazeToken: string): Promise<{ success: boolean; data?: AuthTokens; error?: string }> {
  try {
    console.log('🌐 [BROWSER-AUTH] Iniciando autenticação via iframe...');
    console.log('📱 [BROWSER-AUTH] IP será preservado (sem proxy server-side)');

    // Etapa 1: Gerar ppToken
    const ppToken = await generatePpTokenViaIframe(blazeToken);
    if (!ppToken) {
      throw new Error('Falha ao gerar ppToken via iframe');
    }

    // Etapa 2: Gerar jsessionId
    const jsessionData = await generateJsessionViaIframe(ppToken);
    if (!jsessionData.jsessionId) {
      throw new Error('Falha ao gerar jsessionId via iframe');
    }

    console.log('✅ [BROWSER-AUTH] Autenticação concluída via iframe (IP real preservado)');
    
    return {
      success: true,
      data: {
        ppToken,
        jsessionId: jsessionData.jsessionId,
        pragmaticUserId: jsessionData.pragmaticUserId || '',
        blazeToken,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('❌ [BROWSER-AUTH] Erro na autenticação via iframe:', error);
    return {
      success: false,
      error: `Erro na autenticação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

/**
 * 🔥 Gerar ppToken usando iframe para contornar CORS
 */
async function generatePpTokenViaIframe(blazeToken: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    try {
      console.log('🔥 [IFRAME-BLAZE] Criando iframe para Blaze...');

      // Criar iframe oculto
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
      
      // HTML do iframe que fará a requisição para Blaze
      const iframeContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Blaze Auth</title>
        </head>
        <body>
          <script>
            console.log('🔥 [IFRAME] Iniciando autenticação Blaze...');
            
            // Função para enviar requisição para Blaze
            async function authenticateBlaze() {
              try {
                const response = await fetch('https://blaze.bet.br/api/games/mega-roulette---brazilian/play', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ${blazeToken}',
                    'Content-Type': 'application/json',
                    'Origin': 'https://blaze.bet.br',
                    'Referer': 'https://blaze.bet.br/'
                  },
                  body: JSON.stringify({
                    selected_currency_type: 'BRL'
                  })
                });

                console.log('📊 [IFRAME] Status Blaze:', response.status);

                if (response.ok) {
                  const data = await response.json();
                  console.log('📊 [IFRAME] Resposta Blaze recebida');
                  
                  if (data.url && data.url.includes('playGame.do')) {
                    const tokenMatch = data.url.match(/token%3D([^%]+)/);
                    if (tokenMatch) {
                      console.log('✅ [IFRAME] ppToken extraído');
                      parent.postMessage({
                        type: 'blaze_auth_success',
                        ppToken: tokenMatch[1]
                      }, '*');
                      return;
                    }
                  }
                }

                console.error('❌ [IFRAME] Falha na autenticação Blaze');
                parent.postMessage({
                  type: 'blaze_auth_error',
                  error: 'ppToken não encontrado'
                }, '*');

              } catch (error) {
                console.error('❌ [IFRAME] Erro:', error);
                parent.postMessage({
                  type: 'blaze_auth_error',
                  error: error.message
                }, '*');
              }
            }

            // Executar autenticação quando carregar
            authenticateBlaze();
          </script>
        </body>
        </html>
      `;

      // Listener para mensagens do iframe
      const messageHandler = (event: MessageEvent) => {
        if (event.data.type === 'blaze_auth_success') {
          cleanup();
          console.log('✅ [IFRAME-BLAZE] ppToken recebido via postMessage');
          resolve(event.data.ppToken);
        } else if (event.data.type === 'blaze_auth_error') {
          cleanup();
          console.error('❌ [IFRAME-BLAZE] Erro:', event.data.error);
          resolve(null);
        }
      };

      const cleanup = () => {
        window.removeEventListener('message', messageHandler);
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      };

      // Timeout para cleanup
      setTimeout(() => {
        cleanup();
        console.log('⚠️ [IFRAME-BLAZE] Timeout - removendo iframe');
        reject(new Error('Timeout na autenticação Blaze'));
      }, 15000);

      // Adicionar listener e iframe
      window.addEventListener('message', messageHandler);
      document.body.appendChild(iframe);

      // Definir conteúdo do iframe
      iframe.srcdoc = iframeContent;

    } catch (error) {
      console.error('❌ [IFRAME-BLAZE] Erro ao criar iframe:', error);
      reject(error);
    }
  });
}

/**
 * 🎮 Gerar jsessionId usando iframe para contornar CORS
 */
async function generateJsessionViaIframe(ppToken: string): Promise<{ jsessionId: string | null; pragmaticUserId: string | null }> {
  return new Promise((resolve, reject) => {
    try {
      console.log('🎮 [IFRAME-PRAGMATIC] Criando iframe para Pragmatic...');

      // Aguardar 2 segundos
      setTimeout(async () => {
        const extraData = {
          lobbyUrl: 'https://blaze.bet.br',
          requestCountryCode: 'BR',
          cashierUrl: 'https://blaze.bet.br/?modal=cashier&type=deposit',
          language: 'pt',
          currency: 'BRL',
          technology: 'H5',
          platform: 'WEB'
        };

        const params = new URLSearchParams({
          environmentID: '247',
          gameid: '287',
          secureLogin: 'sfws_blazecombrsw',
          requestCountryCode: 'BR',
          userEnvId: '247',
          ppCasinoId: '6376',
          ppGame: '287',
          ppToken: ppToken,
          ppExtraData: btoa(JSON.stringify(extraData)),
          isGameUrlApiCalled: 'true',
          stylename: 'sfws_blazecombrsw'
        });

        const pragmaticUrl = `https://games.pragmaticplaylive.net/api/secure/GameLaunch?${params}`;

                 // Criar iframe oculto
         const iframe = document.createElement('iframe');
         iframe.style.display = 'none';
         iframe.style.width = '1px';
         iframe.style.height = '1px';
         iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');

        // HTML do iframe que fará a requisição para Pragmatic
        const iframeContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Pragmatic Auth</title>
          </head>
          <body>
            <script>
              console.log('🎮 [IFRAME] Iniciando autenticação Pragmatic...');
              
              // Função para enviar requisição para Pragmatic
              async function authenticatePragmatic() {
                try {
                  const response = await fetch('${pragmaticUrl}', {
                    method: 'GET',
                    headers: {
                      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    redirect: 'manual'
                  });

                  console.log('📊 [IFRAME] Status Pragmatic:', response.status);

                  let jsessionId = null;
                  let pragmaticUserId = null;

                  // Verificar redirect
                  if (response.status === 302) {
                    const location = response.headers.get('location');
                    
                    if (location) {
                      const jsessionMatch = location.match(/JSESSIONID=([^&]+)/);
                      if (jsessionMatch) {
                        jsessionId = jsessionMatch[1];
                      }

                      const userIdMatch = location.match(/userId=([^&]+)/);
                      if (userIdMatch) {
                        pragmaticUserId = userIdMatch[1];
                      }
                    }
                  }

                  // Verificar cookies
                  if (!jsessionId) {
                    const setCookieHeader = response.headers.get('set-cookie');
                    if (setCookieHeader && setCookieHeader.includes('JSESSIONID=')) {
                      const jsessionMatch = setCookieHeader.match(/JSESSIONID=([^;]+)/);
                      if (jsessionMatch) {
                        jsessionId = jsessionMatch[1];
                      }
                    }
                  }

                  if (jsessionId) {
                    console.log('✅ [IFRAME] jsessionId extraído');
                    parent.postMessage({
                      type: 'pragmatic_auth_success',
                      jsessionId: jsessionId,
                      pragmaticUserId: pragmaticUserId
                    }, '*');
                  } else {
                    console.error('❌ [IFRAME] jsessionId não encontrado');
                    parent.postMessage({
                      type: 'pragmatic_auth_error',
                      error: 'jsessionId não encontrado'
                    }, '*');
                  }

                } catch (error) {
                  console.error('❌ [IFRAME] Erro:', error);
                  parent.postMessage({
                    type: 'pragmatic_auth_error',
                    error: error.message
                  }, '*');
                }
              }

              // Executar autenticação quando carregar
              authenticatePragmatic();
            </script>
          </body>
          </html>
        `;

        // Listener para mensagens do iframe
        const messageHandler = (event: MessageEvent) => {
          if (event.data.type === 'pragmatic_auth_success') {
            cleanup();
            console.log('✅ [IFRAME-PRAGMATIC] jsessionId recebido via postMessage');
            resolve({
              jsessionId: event.data.jsessionId,
              pragmaticUserId: event.data.pragmaticUserId
            });
          } else if (event.data.type === 'pragmatic_auth_error') {
            cleanup();
            console.error('❌ [IFRAME-PRAGMATIC] Erro:', event.data.error);
            resolve({ jsessionId: null, pragmaticUserId: null });
          }
        };

        const cleanup = () => {
          window.removeEventListener('message', messageHandler);
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        };

        // Timeout para cleanup
        setTimeout(() => {
          cleanup();
          console.log('⚠️ [IFRAME-PRAGMATIC] Timeout - removendo iframe');
          reject(new Error('Timeout na autenticação Pragmatic'));
        }, 15000);

        // Adicionar listener e iframe
        window.addEventListener('message', messageHandler);
        document.body.appendChild(iframe);

        // Definir conteúdo do iframe
        iframe.srcdoc = iframeContent;

      }, 2000);

    } catch (error) {
      console.error('❌ [IFRAME-PRAGMATIC] Erro ao criar iframe:', error);
      reject(error);
    }
  });
} 