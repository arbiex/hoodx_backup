import { useState, useCallback } from 'react';
import { authenticateClientSide, getUserBlazeToken } from '@/lib/blaze-auth';

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

      // Etapa 2: Fazer autenticação client-side
      console.log('🎮 [CLIENT-AUTH] Fazendo autenticação client-side...');
      const authResult = await authenticateClientSide(tokenResult.token);
      
      console.log('📊 [CLIENT-AUTH] Resultado autenticação:', { 
        success: authResult.success, 
        hasData: !!authResult.data,
        error: authResult.error 
      });
      
      if (!authResult.success || !authResult.data) {
        const errorMsg = authResult.error || 'Falha na autenticação';
        console.error('❌ [CLIENT-AUTH] Falha na autenticação:', errorMsg);
        setError(errorMsg);
        setIsAuthenticating(false);
        return false;
      }

      // Sucesso!
      console.log('✅ [CLIENT-AUTH] Tokens gerados:', {
        ppToken: authResult.data.ppToken ? 'OK' : 'MISSING',
        jsessionId: authResult.data.jsessionId ? 'OK' : 'MISSING',
        pragmaticUserId: authResult.data.pragmaticUserId ? 'OK' : 'MISSING'
      });
      
      setAuthTokens(authResult.data);
      setIsAuthenticating(false);
      
      console.log('✅ [CLIENT-AUTH] Autenticação client-side completa!');
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