const PRAGMATIC_CONFIG = {
  gameSymbol: '287',
  environmentID: '247',
  userEnvId: '247',
  ppCasinoId: '6376',
  secureLogin: 'sfws_blazecombrsw',
  stylename: 'sfws_blazecombrsw'
};

export async function authenticateUser(supabase: any, userId: string) {
  try {
    console.log('🔐 [AUTH] Iniciando autenticação para usuário:', userId);
    if (!supabase) {
      console.error('❌ [AUTH] Cliente Supabase não configurado');
      return {
        success: false,
        error: 'Cliente Supabase não configurado',
        status: 500
      };
    }
    if (!userId) {
      console.error('❌ [AUTH] ID do usuário não fornecido');
      return {
        success: false,
        error: 'ID do usuário é obrigatório',
        status: 400
      };
    }
    console.log('🔍 [AUTH] Buscando token da Blaze no banco...');
    const { data: tokenData, error: tokenError } = await supabase.from('user_tokens').select('token').eq('casino_code', 'BLAZE').eq('user_id', userId).eq('is_active', true).single();
    if (tokenError) {
      console.error('❌ [AUTH] Erro ao buscar token:', tokenError);
      return {
        success: false,
        error: `Erro ao buscar token da Blaze: ${tokenError.message}`,
        status: 500
      };
    }
    if (!tokenData?.token) {
      console.error('❌ [AUTH] Token não encontrado para usuário:', userId);
      return {
        success: false,
        error: 'Token da Blaze não encontrado para este usuário',
        status: 404
      };
    }
    console.log('✅ [AUTH] Token encontrado, gerando ppToken...');
    const blazeToken = tokenData.token;
    const ppToken = await generatePpToken(blazeToken);
    if (!ppToken) {
      console.error('❌ [AUTH] Falha ao gerar ppToken');
      return {
        success: false,
        error: 'Erro ao gerar ppToken - possível problema com token da Blaze',
        status: 500
      };
    }
    console.log('✅ [AUTH] ppToken gerado, gerando jsessionId...');
    const jsessionId = await generateJsessionId(ppToken);
    if (!jsessionId) {
      console.error('❌ [AUTH] Falha ao gerar jsessionId');
      return {
        success: false,
        error: 'Erro ao gerar jsessionId - possível problema com Pragmatic Play',
        status: 500
      };
    }
    console.log('✅ [AUTH] Autenticação completa com sucesso');
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
    console.error('❌ [AUTH] Erro geral na autenticação:', error);
    return {
      success: false,
      error: `Erro na autenticação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      status: 500
    };
  }
}

async function generatePpToken(blazeToken: string) {
  try {
    if (!blazeToken) {
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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        selected_currency_type: 'BRL'
      })
    });
    if (!response.ok) {
      console.error('❌ [AUTH] Erro na requisição ppToken:', response.status, response.statusText);
      return null;
    }
    const data = await response.json();
    if (data.url && data.url.includes('playGame.do')) {
      const tokenMatch = data.url.match(/token%3D([^%]+)/);
      if (tokenMatch) {
        console.log('✅ [AUTH] ppToken gerado com sucesso');
        return tokenMatch[1];
      }
    }
    console.error('❌ [AUTH] ppToken não encontrado na resposta');
    return null;
  } catch (error) {
    console.error('❌ [AUTH] Erro ao gerar ppToken:', error);
    return null;
  }
}

async function generateJsessionId(ppToken: string) {
  try {
    console.log('⏳ [AUTH] Aguardando 2 segundos antes de gerar jsessionId...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!ppToken) {
      console.error('❌ [AUTH] ppToken não fornecido');
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
    console.log('🌐 [AUTH] Fazendo requisição para Pragmatic Play...');
    // CORREÇÃO: Adicionar timeout e melhor tratamento de erro
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout
    try {
      const response = await fetch(gameUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        },
        redirect: 'manual',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      console.log('📊 [AUTH] Status da resposta Pragmatic:', response.status);
      // Verificar redirect (302)
      if (response.status === 302) {
        const location = response.headers.get('location');
        console.log('🔄 [AUTH] Redirect detectado');
        if (location && location.includes('JSESSIONID=')) {
          const jsessionMatch = location.match(/JSESSIONID=([^&]+)/);
          if (jsessionMatch) {
            console.log('✅ [AUTH] jsessionId extraído do redirect');
            return jsessionMatch[1];
          }
        }
      }
      // Verificar set-cookie header
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader && setCookieHeader.includes('JSESSIONID=')) {
        const jsessionMatch = setCookieHeader.match(/JSESSIONID=([^;]+)/);
        if (jsessionMatch) {
          console.log('✅ [AUTH] jsessionId extraído do cookie');
          return jsessionMatch[1];
        }
      }
      // CORREÇÃO: Verificar múltiplos headers set-cookie
      const allSetCookieHeaders = response.headers.getSetCookie?.() || [];
      for (const cookieHeader of allSetCookieHeaders) {
        if (cookieHeader.includes('JSESSIONID=')) {
          const jsessionMatch = cookieHeader.match(/JSESSIONID=([^;]+)/);
          if (jsessionMatch) {
            console.log('✅ [AUTH] jsessionId extraído de múltiplos cookies');
            return jsessionMatch[1];
          }
        }
      }
      console.error('❌ [AUTH] jsessionId não encontrado na resposta');
      console.log('🔍 [AUTH] Headers da resposta:', Object.fromEntries(response.headers.entries()));
      return null;
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('❌ [AUTH] Timeout na requisição para Pragmatic Play');
        return null;
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('❌ [AUTH] Erro ao gerar jsessionId:', error);
    return null;
  }
}
