import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blazeToken, selectedCurrencyType = 'BRL' } = body;

    if (!blazeToken) {
      return NextResponse.json({
        success: false,
        error: 'Token da Blaze é obrigatório'
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

    console.log('🔥 [BLAZE-PROXY] Fazendo requisição para Blaze...');
    console.log('🌐 [BLAZE-PROXY] IP REAL do usuário (apenas):', realUserIP);
    console.log('📱 [BLAZE-PROXY] User-Agent:', userAgent);
    console.log('⚠️ [BLAZE-PROXY] IMPORTANTE: Enviando APENAS IP real, sem rastros de servidor');

    // ✅ Fazer requisição para Blaze enviando APENAS IP real do usuário
    const response = await fetch('https://blaze.bet.br/api/games/mega-roulette---brazilian/play', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${blazeToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://blaze.bet.br',
        'Referer': 'https://blaze.bet.br/',
        'User-Agent': userAgent,
        'Accept-Language': acceptLanguage,
        // ✅ Enviar APENAS IP real do usuário (sem IPs de datacenter)
        'X-Forwarded-For': realUserIP,
        'X-Real-IP': realUserIP,
        'X-Client-IP': realUserIP,
        'CF-Connecting-IP': realUserIP,
        'X-Original-IP': realUserIP
      },
      body: JSON.stringify({
        selected_currency_type: selectedCurrencyType
      })
    });

    console.log('📊 [BLAZE-PROXY] Status da resposta:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [BLAZE-PROXY] Erro na requisição:', response.status, errorText);
      
      return NextResponse.json({
        success: false,
        error: `Erro da Blaze: ${response.status} - ${errorText}`,
        blazeError: true
      }, { status: response.status });
    }

    const data = await response.json();
    console.log('✅ [BLAZE-PROXY] Resposta recebida da Blaze');
    
    // ✅ Extrair ppToken da resposta
    if (data.url && data.url.includes('playGame.do')) {
      const tokenMatch = data.url.match(/token%3D([^%]+)/);
      if (tokenMatch) {
        console.log('✅ [BLAZE-PROXY] ppToken extraído com sucesso');
        return NextResponse.json({
          success: true,
          ppToken: tokenMatch[1],
          originalResponse: data
        });
      }
    }

    console.error('❌ [BLAZE-PROXY] ppToken não encontrado na resposta');
    return NextResponse.json({
      success: false,
      error: 'ppToken não encontrado na resposta da Blaze',
      originalResponse: data
    }, { status: 400 });

  } catch (error) {
    console.error('❌ [BLAZE-PROXY] Erro no proxy:', error);
    return NextResponse.json({
      success: false,
      error: `Erro interno do proxy: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    }, { status: 500 });
  }
} 