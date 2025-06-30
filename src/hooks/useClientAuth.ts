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

      // Etapa 1: Buscar token da Blaze do usuário
      const tokenResult = await getUserBlazeToken();
      
      if (!tokenResult.success || !tokenResult.token) {
        setError(tokenResult.error || 'Token da Blaze não encontrado');
        setIsAuthenticating(false);
        return false;
      }

      // Etapa 2: Fazer autenticação client-side
      const authResult = await authenticateClientSide(tokenResult.token);
      
      if (!authResult.success || !authResult.data) {
        setError(authResult.error || 'Falha na autenticação');
        setIsAuthenticating(false);
        return false;
      }

      // Sucesso!
      setAuthTokens(authResult.data);
      setIsAuthenticating(false);
      
      console.log('✅ [CLIENT-AUTH] Autenticação client-side completa!');
      return true;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
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