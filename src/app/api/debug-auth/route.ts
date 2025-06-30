import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('🔍 [DEBUG-AUTH] Iniciando debug da autenticação...');
  
  try {
    const { blazeToken, action } = await request.json();
    
    if (!blazeToken) {
      return NextResponse.json({
        success: false,
        error: 'Token da Blaze não fornecido'
      });
    }

    console.log('📱 [DEBUG-AUTH] Token recebido:', blazeToken.substring(0, 20) + '...');
    console.log('🎯 [DEBUG-AUTH] Ação:', action);

    if (action === 'test-blaze-direct') {
      // Teste 1: Requisição direta para Blaze
      console.log('🔥 [DEBUG-AUTH] Testando requisição direta para Blaze...');
      
      const blazeResponse = await fetch('https://blaze.bet.br/api/games/mega-roulette---brazilian/play', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${blazeToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Origin': 'https://blaze.bet.br',
          'Referer': 'https://blaze.bet.br/'
        },
        body: JSON.stringify({
          selected_currency_type: 'BRL'
        })
      });

      console.log('📊 [DEBUG-AUTH] Status Blaze:', blazeResponse.status);
      console.log('📊 [DEBUG-AUTH] Headers Blaze:', Object.fromEntries(blazeResponse.headers.entries()));

      const responseText = await blazeResponse.text();
      console.log('📄 [DEBUG-AUTH] Resposta Blaze (primeiros 200 chars):', responseText.substring(0, 200));

      return NextResponse.json({
        success: blazeResponse.ok,
        status: blazeResponse.status,
        headers: Object.fromEntries(blazeResponse.headers.entries()),
        responsePreview: responseText.substring(0, 500),
        isHtml: responseText.includes('<!DOCTYPE html>'),
        isCloudflareError: responseText.includes('Cloudflare') && responseText.includes('Error')
      });
    }

    if (action === 'test-token-validity') {
      // Teste 2: Verificar se token é válido
      console.log('🔐 [DEBUG-AUTH] Testando validade do token...');
      
      const profileResponse = await fetch('https://blaze.bet.br/api/users/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${blazeToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      console.log('📊 [DEBUG-AUTH] Status profile:', profileResponse.status);
      
      const profileText = await profileResponse.text();
      console.log('📄 [DEBUG-AUTH] Profile response:', profileText.substring(0, 200));

      return NextResponse.json({
        success: profileResponse.ok,
        status: profileResponse.status,
        responsePreview: profileText.substring(0, 500),
        tokenValid: profileResponse.ok
      });
    }

    if (action === 'test-simple-get') {
      // Teste 3: GET simples para Blaze
      console.log('🌐 [DEBUG-AUTH] Testando GET simples...');
      
      const getResponse = await fetch('https://blaze.bet.br', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      console.log('📊 [DEBUG-AUTH] Status GET:', getResponse.status);
      
      const getText = await getResponse.text();
      
      return NextResponse.json({
        success: getResponse.ok,
        status: getResponse.status,
        canConnectToBlaze: getResponse.ok,
        responsePreview: getText.substring(0, 200)
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Ação não reconhecida. Use: test-blaze-direct, test-token-validity, test-simple-get'
    });

  } catch (error) {
    console.error('❌ [DEBUG-AUTH] Erro:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
} 