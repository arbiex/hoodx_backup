import { createClient } from '@supabase/supabase-js';

// Interface para resultado de autenticação
export interface AuthResult {
  userId: string;
  originalUserId: string;
  ppToken: string;
  jsessionId: string;
  timestamp: string;
}

/**
 * 🔑 Buscar token da Blaze do usuário no Supabase
 */
export async function getUserBlazeToken(userId: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    console.log('🔑 [GET-BLAZE-TOKEN] Buscando token para usuário:', userId);
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
    );

    // Primeiro, tentar buscar na tabela user_tokens (estrutura nova)
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('token')
      .eq('casino_code', 'BLAZE')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (!tokenError && tokenData?.token) {
      console.log('✅ [GET-BLAZE-TOKEN] Token encontrado');
      return {
        success: true,
        token: tokenData.token
      };
    }

    // Se não encontrar na user_tokens, buscar na users (estrutura antiga - fallback)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('blaze_access_token')
      .eq('id', userId)
      .single();

    if (userError || !userData?.blaze_access_token) {
      console.error('❌ [GET-BLAZE-TOKEN] Token não encontrado:', tokenError || userError);
      return {
        success: false,
        error: 'Token da Blaze não encontrado. Configure na página de configurações.'
      };
    }

    console.log('✅ [GET-BLAZE-TOKEN] Token encontrado (fallback)');
    return {
      success: true,
      token: userData.blaze_access_token
    };

  } catch (error) {
    console.error('❌ [GET-BLAZE-TOKEN] Erro:', error);
    return {
      success: false,
      error: `Erro ao buscar token: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

/**
 * 🔐 Validar tokens vindos do client-side (apenas validação, não geração)
 */
export async function authenticateUserFrontend(blazeToken: string, userAgent?: string, acceptLanguage?: string, realBrowserHeaders?: any): Promise<{ success: boolean; data?: { ppToken: string; jsessionId: string }; error?: string }> {
  try {
    console.log('🔐 [FRONTEND-AUTH] Validando autenticação client-side...');
    
    if (!blazeToken) {
      return {
        success: false,
        error: 'Token da Blaze é obrigatório'
      };
    }

    console.log('✅ [FRONTEND-AUTH] Token válido - autenticação deve ser feita no client-side');
    
    return {
      success: false,
      error: 'Esta função foi desabilitada. Use client-side para gerar ppToken e jsessionId.'
    };

  } catch (error) {
    console.error('❌ [FRONTEND-AUTH] Erro:', error);
    return {
      success: false,
      error: `Erro na autenticação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

/**
 * ✅ Validar tokens vindos do client-side
 */
export async function validateClientTokens(userId: string, tokens: { ppToken: string; jsessionId: string; pragmaticUserId: string }): Promise<{ success: boolean; data?: AuthResult; error?: string }> {
  try {
    console.log('🔍 [VALIDATE-CLIENT-TOKENS] Validando tokens do client...');
    
    if (!tokens.ppToken || !tokens.jsessionId) {
      return {
        success: false,
        error: 'ppToken e jsessionId são obrigatórios'
      };
    }

    // Validação básica de formato
    if (tokens.ppToken.length < 10 || tokens.jsessionId.length < 10) {
      return {
        success: false,
        error: 'Formato de tokens inválido'
      };
    }

    // Verificar se o usuário tem token da Blaze
    const tokenResult = await getUserBlazeToken(userId);
    if (!tokenResult.success) {
      return {
        success: false,
        error: tokenResult.error || 'Token da Blaze não encontrado'
      };
    }

    console.log('✅ [VALIDATE-CLIENT-TOKENS] Tokens client-side válidos');
    
    return {
      success: true,
      data: {
        userId: tokens.pragmaticUserId,
        originalUserId: userId,
        ppToken: tokens.ppToken,
        jsessionId: tokens.jsessionId,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('❌ [VALIDATE-CLIENT-TOKENS] Erro:', error);
    return {
      success: false,
      error: `Erro na validação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

/**
 * 🛠️ Sistema de debug (mantido para testes)
 */
export async function debugAuth(testType: string, userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log(`🔧 [DEBUG-AUTH] Executando teste: ${testType}`);
    
    switch (testType) {
      case 'check-blaze-token':
        const tokenResult = await getUserBlazeToken(userId);
        return {
          success: true,
          data: {
            testType,
            result: tokenResult,
            timestamp: new Date().toISOString()
          }
        };
      
      case 'validate-format':
        return {
          success: true,
          data: {
            testType,
            message: 'Sistema configurado para client-side auth',
            clientSideRequired: true,
            timestamp: new Date().toISOString()
          }
        };
      
      default:
        return {
          success: false,
          error: `Tipo de teste desconhecido: ${testType}`
        };
    }

  } catch (error) {
    console.error('❌ [DEBUG-AUTH] Erro:', error);
    return {
      success: false,
      error: `Erro no debug: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
} 