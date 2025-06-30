import { NextRequest, NextResponse } from 'next/server';

// Configuração do Pragmatic Play
const PRAGMATIC_CONFIG = {
  gameSymbol: '287',
  environmentID: '247',
  userEnvId: '247',
  ppCasinoId: '6376',
  secureLogin: 'sfws_blazecombrsw',
  stylename: 'sfws_blazecombrsw'
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ppToken } = body;

    if (!ppToken) {
      return NextResponse.json({
        success: false,
        error: 'ppToken é obrigatório'
      }, { status: 400 });
    }

    // ✅ Capturar APENAS o IP real do usuário (primeiro da cadeia)
    const forwardedIPs = request.headers.get('x-forwarded-for');
    const realUserIP = forwardedIPs ? forwardedIPs.split(',')[0].trim() : 
                      request.headers.get('x-real-ip') || 
                      request.headers.get('cf-connecting-ip') ||
                      'unknown';

    // ✅ Capturar headers do usuário
    const userAgent = request.headers.get('user-agent') || 'Mozilla/5.0 (compatible)';
    const acceptLanguage = request.headers.get('accept-language') || 'pt-BR,pt;q=0.9';

    console.log('🎮 [PRAGMATIC-PROXY] Fazendo requisição para Pragmatic...');
    console.log('🌐 [PRAGMATIC-PROXY] IP REAL do usuário (apenas):', realUserIP);
    console.log('📱 [PRAGMATIC-PROXY] User-Agent:', userAgent);
    console.log('⚠️ [PRAGMATIC-PROXY] IMPORTANTE: Enviando APENAS IP real, sem rastros de servidor');

    // ✅ Aguardar 2 segundos antes de gerar jsessionId
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
    
    // ✅ Fazer requisição para Pragmatic preservando IP e headers do usuário
    const response = await fetch(gameUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': acceptLanguage,
        // ✅ Enviar APENAS IP real do usuário (sem IPs de datacenter)
        'X-Forwarded-For': realUserIP,
        'X-Real-IP': realUserIP,
        'X-Client-IP': realUserIP,
        'CF-Connecting-IP': realUserIP,
        'X-Original-IP': realUserIP
      },
      redirect: 'manual'
    });

    console.log('📊 [PRAGMATIC-PROXY] Status da resposta:', response.status);

    let jsessionId = null;
    let pragmaticUserId = null;

    // ✅ Verificar redirect (302)
    if (response.status === 302) {
      const location = response.headers.get('location');
      console.log('🔄 [PRAGMATIC-PROXY] Redirect detectado');
      
      if (location) {
        // Extrair JSESSIONID
        const jsessionMatch = location.match(/JSESSIONID=([^&]+)/);
        if (jsessionMatch) {
          jsessionId = jsessionMatch[1];
          console.log('✅ [PRAGMATIC-PROXY] jsessionId extraído do redirect');
        }

        // Extrair User ID do Pragmatic
        const userIdMatch = location.match(/userId=([^&]+)/);
        if (userIdMatch) {
          pragmaticUserId = userIdMatch[1];
          console.log('✅ [PRAGMATIC-PROXY] Pragmatic userId extraído');
        }
      }
    }

    // ✅ Verificar cookies se não encontrou no redirect
    if (!jsessionId) {
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader && setCookieHeader.includes('JSESSIONID=')) {
        const jsessionMatch = setCookieHeader.match(/JSESSIONID=([^;]+)/);
        if (jsessionMatch) {
          jsessionId = jsessionMatch[1];
          console.log('✅ [PRAGMATIC-PROXY] jsessionId extraído do cookie');
        }
      }
    }

    if (!jsessionId) {
      console.error('❌ [PRAGMATIC-PROXY] jsessionId não encontrado');
      return NextResponse.json({
        success: false,
        error: 'jsessionId não encontrado na resposta do Pragmatic',
        status: response.status,
        headers: Object.fromEntries(response.headers.entries())
      }, { status: 400 });
    }

    console.log('✅ [PRAGMATIC-PROXY] Dados extraídos com sucesso');
    return NextResponse.json({
      success: true,
      jsessionId,
      pragmaticUserId
    });

  } catch (error) {
    console.error('❌ [PRAGMATIC-PROXY] Erro no proxy:', error);
    return NextResponse.json({
      success: false,
      error: `Erro interno do proxy: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    }, { status: 500 });
  }
} 