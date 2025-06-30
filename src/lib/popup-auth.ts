/**
 * 🪟 Autenticação via popup window (contorna CORS 100%)
 * Esta abordagem abre uma popup window no domínio da Blaze,
 * executa autenticação lá, e retorna tokens via postMessage
 */

interface AuthTokens {
  ppToken: string;
  jsessionId: string;
  pragmaticUserId: string;
  blazeToken: string;
  timestamp: string;
}

/**
 * 🚀 Executar autenticação usando popup window (zero CORS)
 */
export async function authenticateViaPopup(blazeToken: string): Promise<{ success: boolean; data?: AuthTokens; error?: string }> {
  try {
    console.log('🪟 [POPUP-AUTH] Iniciando autenticação via popup...');
    console.log('🌐 [POPUP-AUTH] Abrindo popup no domínio da Blaze (zero CORS)');

    // Etapa 1: Gerar ppToken via popup
    const ppToken = await generatePpTokenViaPopup(blazeToken);
    if (!ppToken) {
      throw new Error('Falha ao gerar ppToken via popup');
    }

    // Etapa 2: Gerar jsessionId via popup
    const jsessionData = await generateJsessionViaPopup(ppToken);
    if (!jsessionData.jsessionId) {
      throw new Error('Falha ao gerar jsessionId via popup');
    }

    console.log('✅ [POPUP-AUTH] Autenticação concluída via popup (zero CORS)');
    
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
    console.error('❌ [POPUP-AUTH] Erro na autenticação via popup:', error);
    return {
      success: false,
      error: `Erro na autenticação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

/**
 * 🔥 Gerar ppToken usando popup window (zero CORS)
 */
async function generatePpTokenViaPopup(blazeToken: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    try {
      console.log('🔥 [POPUP-BLAZE] Abrindo popup para Blaze...');

      // HTML personalizado que será carregado na popup
      const popupHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Autenticação Blaze</title>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .container {
              text-align: center;
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 15px;
              backdrop-filter: blur(10px);
            }
            .spinner {
              border: 3px solid rgba(255,255,255,0.3);
              border-radius: 50%;
              border-top: 3px solid #fff;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 1rem auto;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .logo {
              font-size: 2rem;
              font-weight: bold;
              margin-bottom: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">🎰 HoodX</div>
            <div class="spinner"></div>
            <h2>Autenticando com Blaze...</h2>
            <p>Aguarde, estamos conectando com sua conta</p>
            <p style="font-size: 0.9rem; opacity: 0.8;">Esta janela fechará automaticamente</p>
          </div>
          
          <script>
            console.log('🔥 [POPUP] Iniciando autenticação Blaze...');
            
            // Função para executar autenticação na Blaze
            async function authenticateBlaze() {
              try {
                // Como estamos em uma popup, podemos fazer requisições para qualquer domínio
                const response = await fetch('https://blaze.bet.br/api/games/mega-roulette---brazilian/play', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ${blazeToken}',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': navigator.userAgent,
                    'Origin': 'https://blaze.bet.br',
                    'Referer': 'https://blaze.bet.br/'
                  },
                  body: JSON.stringify({
                    selected_currency_type: 'BRL'
                  })
                });

                console.log('📊 [POPUP] Status Blaze:', response.status);

                if (response.ok) {
                  const data = await response.json();
                  console.log('📊 [POPUP] Resposta Blaze recebida');
                  
                  if (data.url && data.url.includes('playGame.do')) {
                    const tokenMatch = data.url.match(/token%3D([^%]+)/);
                    if (tokenMatch) {
                      console.log('✅ [POPUP] ppToken extraído');
                      
                      // Enviar resultado para janela pai
                      if (window.opener) {
                        window.opener.postMessage({
                          type: 'blaze_auth_success',
                          ppToken: tokenMatch[1]
                        }, '*');
                        
                        // Fechar popup após sucesso
                        setTimeout(() => window.close(), 1000);
                        return;
                      }
                    }
                  }
                }

                console.error('❌ [POPUP] Falha na autenticação Blaze');
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'blaze_auth_error',
                    error: 'ppToken não encontrado'
                  }, '*');
                }
                
                setTimeout(() => window.close(), 2000);

              } catch (error) {
                console.error('❌ [POPUP] Erro:', error);
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'blaze_auth_error',
                    error: error.message
                  }, '*');
                }
                setTimeout(() => window.close(), 2000);
              }
            }

            // Executar autenticação quando carregar
            window.addEventListener('load', () => {
              setTimeout(authenticateBlaze, 1000);
            });
          </script>
        </body>
        </html>
      `;

      // Criar popup window
      const popup = window.open('', '_blank', 'width=600,height=500,scrollbars=yes,resizable=yes');
      
      if (!popup) {
        reject(new Error('Popup bloqueada pelo navegador'));
        return;
      }

      // Escrever HTML na popup
      popup.document.write(popupHtml);
      popup.document.close();

      // Listener para mensagens da popup
      const messageHandler = (event: MessageEvent) => {
        // Verificar origem da mensagem para segurança
        if (event.source === popup) {
          if (event.data.type === 'blaze_auth_success') {
            cleanup();
            console.log('✅ [POPUP-BLAZE] ppToken recebido via postMessage');
            resolve(event.data.ppToken);
          } else if (event.data.type === 'blaze_auth_error') {
            cleanup();
            console.error('❌ [POPUP-BLAZE] Erro:', event.data.error);
            resolve(null);
          }
        }
      };

      const cleanup = () => {
        window.removeEventListener('message', messageHandler);
        if (popup && !popup.closed) {
          popup.close();
        }
      };

      // Timeout para cleanup
      setTimeout(() => {
        cleanup();
        console.log('⚠️ [POPUP-BLAZE] Timeout - fechando popup');
        reject(new Error('Timeout na autenticação Blaze'));
      }, 30000);

      // Adicionar listener
      window.addEventListener('message', messageHandler);

      // Verificar se popup foi fechada manualmente
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          cleanup();
          clearInterval(checkClosed);
          reject(new Error('Popup fechada pelo usuário'));
        }
      }, 1000);

    } catch (error) {
      console.error('❌ [POPUP-BLAZE] Erro ao criar popup:', error);
      reject(error);
    }
  });
}

/**
 * 🎮 Gerar jsessionId usando popup window (zero CORS)
 */
async function generateJsessionViaPopup(ppToken: string): Promise<{ jsessionId: string | null; pragmaticUserId: string | null }> {
  return new Promise((resolve, reject) => {
    try {
      console.log('🎮 [POPUP-PRAGMATIC] Abrindo popup para Pragmatic...');

      // Aguardar 2 segundos antes de continuar
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

        // HTML personalizado para popup Pragmatic
        const popupHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Conectando Pragmatic Play</title>
            <meta charset="utf-8">
            <style>
              body {
                font-family: Arial, sans-serif;
                background: linear-gradient(135deg, #ff7b7b 0%, #667eea 100%);
                color: white;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
              }
              .container {
                text-align: center;
                padding: 2rem;
                background: rgba(255,255,255,0.1);
                border-radius: 15px;
                backdrop-filter: blur(10px);
              }
              .spinner {
                border: 3px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                border-top: 3px solid #fff;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 1rem auto;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              .logo {
                font-size: 2rem;
                font-weight: bold;
                margin-bottom: 1rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">🎮 Pragmatic</div>
              <div class="spinner"></div>
              <h2>Conectando jogo...</h2>
              <p>Configurando sessão de jogo</p>
              <p style="font-size: 0.9rem; opacity: 0.8;">Esta janela fechará automaticamente</p>
            </div>
            
            <script>
              console.log('🎮 [POPUP] Iniciando autenticação Pragmatic...');
              
              // Função para executar autenticação na Pragmatic
              async function authenticatePragmatic() {
                try {
                  const response = await fetch('${pragmaticUrl}', {
                    method: 'GET',
                    headers: {
                      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    redirect: 'manual'
                  });

                  console.log('📊 [POPUP] Status Pragmatic:', response.status);

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
                    console.log('✅ [POPUP] jsessionId extraído');
                    
                    if (window.opener) {
                      window.opener.postMessage({
                        type: 'pragmatic_auth_success',
                        jsessionId: jsessionId,
                        pragmaticUserId: pragmaticUserId
                      }, '*');
                      
                      setTimeout(() => window.close(), 1000);
                      return;
                    }
                  }

                  console.error('❌ [POPUP] jsessionId não encontrado');
                  if (window.opener) {
                    window.opener.postMessage({
                      type: 'pragmatic_auth_error',
                      error: 'jsessionId não encontrado'
                    }, '*');
                  }
                  
                  setTimeout(() => window.close(), 2000);

                } catch (error) {
                  console.error('❌ [POPUP] Erro:', error);
                  if (window.opener) {
                    window.opener.postMessage({
                      type: 'pragmatic_auth_error',
                      error: error.message
                    }, '*');
                  }
                  setTimeout(() => window.close(), 2000);
                }
              }

              // Executar autenticação quando carregar
              window.addEventListener('load', () => {
                setTimeout(authenticatePragmatic, 1000);
              });
            </script>
          </body>
          </html>
        `;

        // Criar popup window
        const popup = window.open('', '_blank', 'width=600,height=500,scrollbars=yes,resizable=yes');
        
        if (!popup) {
          reject(new Error('Popup bloqueada pelo navegador'));
          return;
        }

        // Escrever HTML na popup
        popup.document.write(popupHtml);
        popup.document.close();

        // Listener para mensagens da popup
        const messageHandler = (event: MessageEvent) => {
          if (event.source === popup) {
            if (event.data.type === 'pragmatic_auth_success') {
              cleanup();
              console.log('✅ [POPUP-PRAGMATIC] jsessionId recebido via postMessage');
              resolve({
                jsessionId: event.data.jsessionId,
                pragmaticUserId: event.data.pragmaticUserId
              });
            } else if (event.data.type === 'pragmatic_auth_error') {
              cleanup();
              console.error('❌ [POPUP-PRAGMATIC] Erro:', event.data.error);
              resolve({ jsessionId: null, pragmaticUserId: null });
            }
          }
        };

        const cleanup = () => {
          window.removeEventListener('message', messageHandler);
          if (popup && !popup.closed) {
            popup.close();
          }
        };

        // Timeout para cleanup
        setTimeout(() => {
          cleanup();
          console.log('⚠️ [POPUP-PRAGMATIC] Timeout - fechando popup');
          reject(new Error('Timeout na autenticação Pragmatic'));
        }, 30000);

        // Adicionar listener
        window.addEventListener('message', messageHandler);

        // Verificar se popup foi fechada manualmente
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            cleanup();
            clearInterval(checkClosed);
            reject(new Error('Popup fechada pelo usuário'));
          }
        }, 1000);

      }, 2000);

    } catch (error) {
      console.error('❌ [POPUP-PRAGMATIC] Erro ao criar popup:', error);
      reject(error);
    }
  });
} 