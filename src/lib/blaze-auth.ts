// 🌐 Autenticação Client-Side - Browser do usuário faz requisições diretas
// Garante que Blaze receba o IP real do usuário

interface AuthTokens {
  ppToken: string;
  jsessionId: string;
  blazeToken: string;
  pragmaticUserId: string;
  timestamp: string;
}

// Configuração do Pragmatic Play
const PRAGMATIC_CONFIG = {
  gameSymbol: '287',
  environmentID: '247',
  userEnvId: '247',
  ppCasinoId: '6376',
  secureLogin: 'sfws_blazecombrsw',
  stylename: 'sfws_blazecombrsw'
};

/**
 * 🎯 Função principal: Autenticação completa client-side
 * Executa no browser do usuário com seu IP real
 */
export async function authenticateClientSide(blazeToken: string): Promise<{ success: boolean; data?: AuthTokens; error?: string }> {
  try {
    console.log('🔐 [CLIENT-AUTH] Iniciando autenticação client-side...');
    
    if (!blazeToken) {
      return {
        success: false,
        error: 'Token da Blaze é obrigatório'
      };
    }

    // Etapa 1: Gerar ppToken (browser → Blaze)
    console.log('📱 [CLIENT-AUTH] Gerando ppToken com IP do usuário...');
    const ppToken = await generatePpTokenClient(blazeToken);
    
    if (!ppToken) {
      return {
        success: false,
        error: 'Erro ao gerar ppToken - verifique seu token da Blaze'
      };
    }

    // Etapa 2: Gerar jsessionId (browser → Pragmatic Play)
    console.log('🎮 [CLIENT-AUTH] Gerando jsessionId com IP do usuário...');
    const jsessionData = await generateJsessionIdClient(ppToken);
    
    if (!jsessionData.jsessionId || !jsessionData.pragmaticUserId) {
      return {
        success: false,
        error: 'Erro ao gerar jsessionId - problema com Pragmatic Play'
      };
    }

    console.log('✅ [CLIENT-AUTH] Autenticação client-side completa!');
    
    return {
      success: true,
      data: {
        ppToken,
        jsessionId: jsessionData.jsessionId,
        blazeToken,
        pragmaticUserId: jsessionData.pragmaticUserId,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('❌ [CLIENT-AUTH] Erro na autenticação:', error);
    return {
      success: false,
      error: `Erro na autenticação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

/**
 * 🔥 Gerar ppToken - Requisição direta do browser para Blaze
 */
async function generatePpTokenClient(blazeToken: string): Promise<string | null> {
  try {
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
      console.error('❌ [CLIENT-AUTH] Erro na requisição ppToken:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.url && data.url.includes('playGame.do')) {
      const tokenMatch = data.url.match(/token%3D([^%]+)/);
      if (tokenMatch) {
        console.log('✅ [CLIENT-AUTH] ppToken gerado (IP real do usuário)');
        return tokenMatch[1];
      }
    }

    console.error('❌ [CLIENT-AUTH] ppToken não encontrado na resposta');
    return null;
    
  } catch (error) {
    console.error('❌ [CLIENT-AUTH] Erro ao gerar ppToken:', error);
    return null;
  }
}

/**
 * 🎮 Gerar jsessionId - Requisição direta do browser para Pragmatic Play
 */
async function generateJsessionIdClient(ppToken: string): Promise<{ jsessionId: string | null; pragmaticUserId: string | null }> {
  try {
    console.log('⏳ [CLIENT-AUTH] Aguardando 2 segundos...');
    await new Promise(resolve => setTimeout(resolve, 2000));

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
    
    console.log('🌐 [CLIENT-AUTH] Requisição para Pragmatic (IP real)...');

    const response = await fetch(gameUrl, {
      method: 'GET',
      headers: {
        'User-Agent': navigator.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': navigator.language
      },
      redirect: 'manual'
    });

    console.log('📊 [CLIENT-AUTH] Status Pragmatic:', response.status);

    let jsessionId = null;
    let pragmaticUserId = null;

    // Verificar redirect (302)
    if (response.status === 302) {
      const location = response.headers.get('location');
      console.log('🔄 [CLIENT-AUTH] Redirect detectado');
      
      if (location) {
        // Extrair JSESSIONID
        const jsessionMatch = location.match(/JSESSIONID=([^&]+)/);
        if (jsessionMatch) {
          jsessionId = jsessionMatch[1];
          console.log('✅ [CLIENT-AUTH] jsessionId extraído do redirect');
        }

        // Extrair User ID do Pragmatic
        const userIdMatch = location.match(/userId=([^&]+)/);
        if (userIdMatch) {
          pragmaticUserId = userIdMatch[1];
          console.log('✅ [CLIENT-AUTH] Pragmatic userId extraído');
        }
      }
    }

    // Verificar cookies se não encontrou no redirect
    if (!jsessionId) {
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader && setCookieHeader.includes('JSESSIONID=')) {
        const jsessionMatch = setCookieHeader.match(/JSESSIONID=([^;]+)/);
        if (jsessionMatch) {
          jsessionId = jsessionMatch[1];
          console.log('✅ [CLIENT-AUTH] jsessionId extraído do cookie');
        }
      }
    }

    return { jsessionId, pragmaticUserId };
    
  } catch (error) {
    console.error('❌ [CLIENT-AUTH] Erro ao gerar jsessionId:', error);
    return { jsessionId: null, pragmaticUserId: null };
  }
}

/**
 * 🔍 Buscar token da Blaze do usuário logado
 */
export async function getUserBlazeToken(): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    // Importar Supabase client-side para obter token do usuário
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      return {
        success: false,
        error: 'Usuário não autenticado'
      };
    }

    const response = await fetch('/api/user/blaze-token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error || 'Erro ao buscar token da Blaze'
      };
    }

    const data = await response.json();
    
    if (!data.success || !data.token) {
      return {
        success: false,
        error: 'Token da Blaze não encontrado'
      };
    }

    return {
      success: true,
      token: data.token
    };
    
  } catch (error) {
    return {
      success: false,
      error: 'Erro ao buscar token da Blaze'
    };
  }
} 