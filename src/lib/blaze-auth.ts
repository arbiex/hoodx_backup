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
 * 🔥 Gerar ppToken - Via proxy interno (APENAS IP real do usuário)
 */
async function generatePpTokenClient(blazeToken: string): Promise<string | null> {
  try {
    console.log('🔥 [BLAZE-CLIENT] Usando proxy interno (APENAS IP real)...');
    console.log('📱 [BLAZE-CLIENT] User-Agent:', navigator.userAgent);
    
    const response = await fetch('/api/blaze-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': navigator.userAgent,
        'Accept-Language': navigator.language
      },
      body: JSON.stringify({
        blazeToken,
        selectedCurrencyType: 'BRL'
      })
    });

    console.log('📊 [BLAZE-CLIENT] Status do proxy:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ [BLAZE-CLIENT] Erro no proxy:', response.status, errorData);
      return null;
    }

    const data = await response.json();
    console.log('📊 [BLAZE-CLIENT] Resposta do proxy:', { success: data.success, hasPpToken: !!data.ppToken });
    
    if (data.success && data.ppToken) {
      console.log('✅ [BLAZE-CLIENT] ppToken gerado (APENAS IP real preservado)');
      return data.ppToken;
    }

    console.error('❌ [BLAZE-CLIENT] ppToken não encontrado na resposta do proxy');
    return null;
    
  } catch (error) {
    console.error('❌ [BLAZE-CLIENT] Erro ao gerar ppToken via proxy:', error);
    return null;
  }
}

/**
 * 🎮 Gerar jsessionId - Via proxy interno (APENAS IP real do usuário)
 */
async function generateJsessionIdClient(ppToken: string): Promise<{ jsessionId: string | null; pragmaticUserId: string | null }> {
  try {
    console.log('🎮 [PRAGMATIC-CLIENT] Usando proxy interno (APENAS IP real)...');
    console.log('📱 [PRAGMATIC-CLIENT] User-Agent:', navigator.userAgent);
    
    const response = await fetch('/api/pragmatic-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': navigator.userAgent,
        'Accept-Language': navigator.language
      },
      body: JSON.stringify({
        ppToken
      })
    });

    console.log('📊 [PRAGMATIC-CLIENT] Status do proxy:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ [PRAGMATIC-CLIENT] Erro no proxy:', response.status, errorData);
      return { jsessionId: null, pragmaticUserId: null };
    }

    const data = await response.json();
    console.log('📊 [PRAGMATIC-CLIENT] Resposta do proxy:', { 
      success: data.success, 
      hasJsessionId: !!data.jsessionId,
      hasPragmaticUserId: !!data.pragmaticUserId 
    });

    if (data.success && data.jsessionId) {
      console.log('✅ [PRAGMATIC-CLIENT] jsessionId gerado (APENAS IP real preservado)');
      return { 
        jsessionId: data.jsessionId, 
        pragmaticUserId: data.pragmaticUserId || null 
      };
    }

    console.error('❌ [PRAGMATIC-CLIENT] jsessionId não encontrado na resposta do proxy');
    return { jsessionId: null, pragmaticUserId: null };
    
  } catch (error) {
    console.error('❌ [PRAGMATIC-CLIENT] Erro ao gerar jsessionId via proxy:', error);
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