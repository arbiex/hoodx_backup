import { useState, useCallback } from 'react';
import { authenticateClientSide, getUserBlazeToken } from '@/lib/blaze-auth';
import { authenticateViaBrowser } from '@/lib/browser-auth';

// Autenticação via popup (zero CORS)
async function authenticateViaPopup(blazeToken: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    console.log('🪟 [POPUP-AUTH] Iniciando autenticação via popup...');
    
    // Criar popup simples que redireciona para Blaze
    const popup = window.open(
      `https://blaze.bet.br/api/games/mega-roulette---brazilian/play`,
      '_blank',
      'width=600,height=500,scrollbars=yes,resizable=yes'
    );
    
    if (!popup) {
      throw new Error('Popup bloqueada pelo navegador');
    }
    
    // Aguardar popup fechar ou timeout
    return new Promise((resolve) => {
      let resolved = false;
      
      const checkClosed = setInterval(() => {
        if (popup.closed && !resolved) {
          resolved = true;
          clearInterval(checkClosed);
          console.log('🪟 [POPUP-AUTH] Popup fechada - usando fallback');
          resolve({ success: false, error: 'Popup fechada - tentando método alternativo' });
        }
      }, 1000);
      
      // Timeout de 10 segundos
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearInterval(checkClosed);
          if (!popup.closed) {
            popup.close();
          }
          console.log('🪟 [POPUP-AUTH] Timeout - usando fallback');
          resolve({ success: false, error: 'Timeout - tentando método alternativo' });
        }
      }, 10000);
    });
    
  } catch (error) {
    console.error('❌ [POPUP-AUTH] Erro:', error);
    return { success: false, error: 'Erro na popup - tentando método alternativo' };
  }
}

interface AuthTokens {
  ppToken: string;
  jsessionId: string;
  blazeToken: string;
  pragmaticUserId: string;
  timestamp: string;
}

interface UseClientAuthReturn {
  isAuthenticating: boolean;
  authTokens: AuthTokens | null;
  error: string | null;
  authenticate: () => Promise<boolean>;
  clearAuth: () => void;
}

export function useClientAuth(): UseClientAuthReturn {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authTokens, setAuthTokens] = useState<AuthTokens | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authenticate = useCallback(async (): Promise<boolean> => {
    setIsAuthenticating(true);
    setError(null);

    try {
      console.log('🔐 [CLIENT-AUTH] Iniciando autenticação no browser...');
      console.log('🌐 [CLIENT-AUTH] Environment:', process.env.NODE_ENV);
      console.log('🌐 [CLIENT-AUTH] URL atual:', window.location.href);

      // Etapa 1: Buscar token da Blaze do usuário
      console.log('🔍 [CLIENT-AUTH] Buscando token da Blaze...');
      const tokenResult = await getUserBlazeToken();
      
      console.log('📊 [CLIENT-AUTH] Resultado busca token:', { 
        success: tokenResult.success, 
        hasToken: !!tokenResult.token,
        error: tokenResult.error 
      });
      
      if (!tokenResult.success || !tokenResult.token) {
        const errorMsg = tokenResult.error || 'Token da Blaze não encontrado';
        console.error('❌ [CLIENT-AUTH] Falha na busca do token:', errorMsg);
        setError(errorMsg);
        setIsAuthenticating(false);
        return false;
      }

      // Etapa 2: Tentar múltiplas estratégias (popup > iframe > proxy)
      console.log('🚀 [CLIENT-AUTH] Testando múltiplas estratégias de autenticação...');
      
      let authResult;
      let usedStrategy = 'proxy';
      
      // Estratégia 1: Popup (zero CORS, IP real)
      console.log('🪟 [CLIENT-AUTH] Estratégia 1: Popup window...');
      const popupResult = await authenticateViaPopup(tokenResult.token);
      
      if (popupResult.success && popupResult.data) {
        console.log('✅ [CLIENT-AUTH] Popup bem-sucedida (zero CORS)');
        authResult = popupResult;
        usedStrategy = 'popup';
      } else {
        // Estratégia 2: Iframe
        console.log('🌐 [CLIENT-AUTH] Estratégia 2: Iframe...');
        const iframeResult = await authenticateViaBrowser(tokenResult.token);
        
        if (iframeResult.success && iframeResult.data) {
          console.log('✅ [CLIENT-AUTH] Iframe bem-sucedida');
          authResult = iframeResult;
          usedStrategy = 'iframe';
        } else {
          // Estratégia 3: Proxy interno (último recurso)
          console.log('🔄 [CLIENT-AUTH] Estratégia 3: Proxy interno (último recurso)...');
          
          authResult = await authenticateClientSide(tokenResult.token);
          usedStrategy = 'proxy';
          
          console.log('📊 [CLIENT-AUTH] Resultado proxy:', { 
            success: authResult.success, 
            hasData: !!authResult.data,
            error: authResult.error 
          });
        }
      }
      
      if (!authResult.success || !authResult.data) {
        const errorMsg = authResult.error || 'Todas as tentativas de autenticação falharam';
        console.error('❌ [CLIENT-AUTH] Falha total na autenticação:', errorMsg);
        setError(errorMsg);
        setIsAuthenticating(false);
        return false;
      }

      // Sucesso!
      const strategyNames = {
        popup: 'popup (zero CORS)',
        iframe: 'iframe',
        proxy: 'proxy interno'
      };
      
      const authMethod = strategyNames[usedStrategy as keyof typeof strategyNames];
      
      console.log(`✅ [CLIENT-AUTH] Tokens gerados via ${authMethod}:`, {
        ppToken: authResult.data.ppToken ? 'OK' : 'MISSING',
        jsessionId: authResult.data.jsessionId ? 'OK' : 'MISSING',
        pragmaticUserId: authResult.data.pragmaticUserId ? 'OK' : 'MISSING'
      });
      
      setAuthTokens(authResult.data);
      setIsAuthenticating(false);
      
      console.log(`✅ [CLIENT-AUTH] Autenticação completa via ${authMethod}!`);
      return true;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('❌ [CLIENT-AUTH] Erro na autenticação:', error);
      setError(`Erro na autenticação: ${errorMsg}`);
      setIsAuthenticating(false);
      return false;
    }
  }, []);

  const clearAuth = useCallback(() => {
    setAuthTokens(null);
    setError(null);
  }, []);

  return {
    isAuthenticating,
    authTokens,
    error,
    authenticate,
    clearAuth
  };
} 