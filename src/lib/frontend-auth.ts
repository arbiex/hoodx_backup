import { useState, useCallback } from 'react';

/**
 * 🎯 Autenticação Frontend - Mesma lógica da Edge Function porém no browser
 * Executa as requisições direto do browser do usuário preservando IP real
 */

const PRAGMATIC_CONFIG = {
  gameSymbol: '287',
  environmentID: '247',
  userEnvId: '247',
  ppCasinoId: '6376',
  secureLogin: 'sfws_blazecombrsw',
  stylename: 'sfws_blazecombrsw'
};

interface AuthResult {
  success: boolean;
  data?: {
    blazeToken: string;
    ppToken: string;
    jsessionId: string;
    timestamp: string;
  };
  error?: string;
}

/**
 * 🔥 1ª Etapa: Gerar ppToken da Blaze (mesma função da Edge Function)
 */
async function generatePpToken(blazeToken: string): Promise<string | null> {
  try {
    console.log('🔥 [FRONTEND-AUTH] Gerando ppToken da Blaze...');
    
    if (!blazeToken) {
      console.error('❌ [FRONTEND-AUTH] blazeToken não fornecido');
      return null;
    }

    const blazeUrl = 'mega-roulette---brazilian';
    const response = await fetch(`https://blaze.bet.br/api/games/${blazeUrl}/play`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${blazeToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://blaze.bet.br',
        'Referer': 'https://blaze.bet.br/',
        'User-Agent': navigator.userAgent
      },
      body: JSON.stringify({
        selected_currency_type: 'BRL'
      })
    });

    if (!response.ok) {
      console.error('❌ [FRONTEND-AUTH] Erro na requisição ppToken:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    console.log('📊 [FRONTEND-AUTH] Resposta da Blaze:', data);

    if (data.url && data.url.includes('playGame.do')) {
      const tokenMatch = data.url.match(/token%3D([^%]+)/);
      if (tokenMatch) {
        console.log('✅ [FRONTEND-AUTH] ppToken gerado com sucesso');
        return tokenMatch[1];
      }
    }

    console.error('❌ [FRONTEND-AUTH] ppToken não encontrado na resposta');
    return null;

  } catch (error) {
    console.error('❌ [FRONTEND-AUTH] Erro ao gerar ppToken:', error);
    return null;
  }
}

/**
 * 🎮 2ª Etapa: Gerar jsessionId do Pragmatic (mesma função da Edge Function)
 */
async function generateJsessionId(ppToken: string): Promise<string | null> {
  try {
    console.log('🎮 [FRONTEND-AUTH] Gerando jsessionId do Pragmatic...');
    
    // Aguardar 2 segundos (mesmo da Edge Function)
    console.log('⏳ [FRONTEND-AUTH] Aguardando 2 segundos...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (!ppToken) {
      console.error('❌ [FRONTEND-AUTH] ppToken não fornecido');
      return null;
    }

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
      environmentID: PRAGMATIC_CONFIG.environmentID,
      gameid: PRAGMATIC_CONFIG.gameSymbol,
      secureLogin: PRAGMATIC_CONFIG.secureLogin,
      requestCountryCode: 'BR',
      userEnvId: PRAGMATIC_CONFIG.userEnvId,
      ppCasinoId: PRAGMATIC_CONFIG.ppCasinoId,
      ppGame: PRAGMATIC_CONFIG.gameSymbol,
      ppToken: ppToken,
      ppExtraData: btoa(JSON.stringify(extraData)),
      isGameUrlApiCalled: 'true',
      stylename: PRAGMATIC_CONFIG.stylename
    });

    const gameUrl = `https://games.pragmaticplaylive.net/api/secure/GameLaunch?${params}`;
    console.log('🌐 [FRONTEND-AUTH] Fazendo requisição para Pragmatic Play...');

    // Timeout de 10 segundos (mesmo da Edge Function)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(gameUrl, {
        method: 'GET',
        headers: {
          'User-Agent': navigator.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        },
        redirect: 'manual',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('📊 [FRONTEND-AUTH] Status da resposta Pragmatic:', response.status);

      // Verificar redirect (302) - mesmo da Edge Function
      if (response.status === 302) {
        const location = response.headers.get('location');
        console.log('🔄 [FRONTEND-AUTH] Redirect detectado');
        if (location && location.includes('JSESSIONID=')) {
          const jsessionMatch = location.match(/JSESSIONID=([^&]+)/);
          if (jsessionMatch) {
            console.log('✅ [FRONTEND-AUTH] jsessionId extraído do redirect');
            return jsessionMatch[1];
          }
        }
      }

      // Verificar set-cookie header - mesmo da Edge Function
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader && setCookieHeader.includes('JSESSIONID=')) {
        const jsessionMatch = setCookieHeader.match(/JSESSIONID=([^;]+)/);
        if (jsessionMatch) {
          console.log('✅ [FRONTEND-AUTH] jsessionId extraído do cookie');
          return jsessionMatch[1];
        }
      }

      console.error('❌ [FRONTEND-AUTH] jsessionId não encontrado na resposta');
      console.log('🔍 [FRONTEND-AUTH] Headers da resposta:', Object.fromEntries(response.headers.entries()));
      return null;

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('❌ [FRONTEND-AUTH] Timeout na requisição para Pragmatic Play');
        return null;
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('❌ [FRONTEND-AUTH] Erro ao gerar jsessionId:', error);
    return null;
  }
}

/**
 * 🔐 Função principal: Autenticação completa no frontend
 * Replica exatamente a lógica da Edge Function
 */
export async function authenticateUserFrontend(blazeToken: string): Promise<AuthResult> {
  try {
    console.log('🔐 [FRONTEND-AUTH] Iniciando autenticação completa...');

    if (!blazeToken) {
      return {
        success: false,
        error: 'Token da Blaze é obrigatório'
      };
    }

    console.log('✅ [FRONTEND-AUTH] Token encontrado, gerando ppToken...');
    const ppToken = await generatePpToken(blazeToken);

    if (!ppToken) {
      return {
        success: false,
        error: 'Erro ao gerar ppToken - possível problema com token da Blaze'
      };
    }

    console.log('✅ [FRONTEND-AUTH] ppToken gerado, gerando jsessionId...');
    const jsessionId = await generateJsessionId(ppToken);

    if (!jsessionId) {
      return {
        success: false,
        error: 'Erro ao gerar jsessionId - possível problema com Pragmatic Play'
      };
    }

    console.log('✅ [FRONTEND-AUTH] Autenticação completa com sucesso');
    return {
      success: true,
      data: {
        blazeToken,
        ppToken,
        jsessionId,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('❌ [FRONTEND-AUTH] Erro geral na autenticação:', error);
    return {
      success: false,
      error: `Erro na autenticação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

/**
 * 📱 SOLUÇÃO 1: Executar via JavaScript direto no console da Blaze
 */
export function generateConsoleScript(blazeToken: string): string {
  return `
// 🔥 Script para executar no console da Blaze
(async function() {
  console.log('🔥 [CONSOLE-AUTH] Iniciando autenticação...');
  
  try {
    // 1ª Etapa: Gerar ppToken
    const response1 = await fetch('/api/games/mega-roulette---brazilian/play', {
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
    
    if (!response1.ok) throw new Error('Falha na 1ª etapa');
    
    const data1 = await response1.json();
    const ppTokenMatch = data1.url?.match(/token%3D([^%]+)/);
    
    if (!ppTokenMatch) throw new Error('ppToken não encontrado');
    const ppToken = ppTokenMatch[1];
    
    console.log('✅ [CONSOLE-AUTH] ppToken:', ppToken);
    
    // Aguardar 2 segundos
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2ª Etapa: Gerar jsessionId
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
    
    const gameUrl = \`https://games.pragmaticplaylive.net/api/secure/GameLaunch?\${params}\`;
    
    const response2 = await fetch(gameUrl, {
      method: 'GET',
      redirect: 'manual'
    });
    
    let jsessionId = null;
    
    // Verificar redirect
    if (response2.status === 302) {
      const location = response2.headers.get('location');
      const jsessionMatch = location?.match(/JSESSIONID=([^&]+)/);
      if (jsessionMatch) jsessionId = jsessionMatch[1];
    }
    
    // Verificar cookies
    if (!jsessionId) {
      const setCookie = response2.headers.get('set-cookie');
      const jsessionMatch = setCookie?.match(/JSESSIONID=([^;]+)/);
      if (jsessionMatch) jsessionId = jsessionMatch[1];
    }
    
    if (!jsessionId) throw new Error('jsessionId não encontrado');
    
    console.log('✅ [CONSOLE-AUTH] jsessionId:', jsessionId);
    
    // Enviar resultado para nossa app
    const result = {
      success: true,
      blazeToken: '${blazeToken}',
      ppToken: ppToken,
      jsessionId: jsessionId,
      timestamp: new Date().toISOString()
    };
    
    // Tentar enviar via postMessage se houver janela pai
    if (window.opener) {
      window.opener.postMessage({
        type: 'blaze_auth_result',
        data: result
      }, '*');
    }
    
    // Salvar no localStorage para nossa app pegar
    localStorage.setItem('hoodx_auth_result', JSON.stringify(result));
    
    console.log('🎉 [CONSOLE-AUTH] Autenticação completa!', result);
    alert('✅ Autenticação realizada! Verifique sua aplicação.');
    
  } catch (error) {
    console.error('❌ [CONSOLE-AUTH] Erro:', error);
    alert('❌ Erro na autenticação: ' + error.message);
  }
})();
`;
}

/**
 * 🎯 Hook para usar autenticação frontend
 */
export function useFrontendAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);

  const authenticateWithConsole = useCallback(async (blazeToken: string) => {
    setIsAuthenticating(true);
    
    try {
      // Gerar script para console
      const script = generateConsoleScript(blazeToken);
      
      // Abrir Blaze em nova aba
      const blazeWindow = window.open('https://blaze.bet.br', '_blank');
      
      if (!blazeWindow) {
        throw new Error('Popup bloqueado. Permita popups para este site.');
      }
      
      // Aguardar usuário fazer login e executar script
      const instructions = `
🔥 INSTRUÇÕES DE AUTENTICAÇÃO:

1. Faça login na sua conta Blaze
2. Abra o Console do Desenvolvedor (F12)
3. Cole e execute o script abaixo:

${script}

4. Aguarde a confirmação "✅ Autenticação realizada!"
      `;
      
      // Copiar script para clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(script);
        alert('📋 Script copiado! Siga as instruções no console.');
      } else {
        alert(instructions);
      }
      
      // Monitorar resultado via localStorage
      const checkResult = setInterval(() => {
        const result = localStorage.getItem('hoodx_auth_result');
        if (result) {
          try {
            const authData = JSON.parse(result);
            setAuthResult(authData);
            localStorage.removeItem('hoodx_auth_result');
            clearInterval(checkResult);
            setIsAuthenticating(false);
          } catch (e) {
            console.error('Erro ao parsear resultado:', e);
          }
        }
      }, 1000);
      
      // Timeout após 5 minutos
      setTimeout(() => {
        clearInterval(checkResult);
        setIsAuthenticating(false);
      }, 5 * 60 * 1000);
      
    } catch (error) {
      setIsAuthenticating(false);
      setAuthResult({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  }, []);

  const authenticateDirectly = useCallback(async (blazeToken: string) => {
    setIsAuthenticating(true);
    
    try {
      const result = await authenticateUserFrontend(blazeToken);
      setAuthResult(result);
    } catch (error) {
      setAuthResult({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  return {
    isAuthenticating,
    authResult,
    authenticateWithConsole,
    authenticateDirectly,
    clearResult: () => setAuthResult(null)
  };
} 