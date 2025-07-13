import { useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export interface BMGBROperationsConfig {
  onSuccess?: (message: string) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: { connected: boolean; operating: boolean }) => void;
}

export function useBMGBROperations(config: BMGBROperationsConfig = {}) {
  const monitoringRef = useRef<boolean>(false);
  const userIdRef = useRef<string>('');

  // Função para conectar e iniciar operação
  const startOperation = useCallback(async (
    stake: number,
    betType: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' = 'red'
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      userIdRef.current = user.id;

      // 1. Obter token da Blaze
      const tokenResponse = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'get-blaze-token'
        })
      });

      const tokenData = await tokenResponse.json();
      if (!tokenData.success || !tokenData.token) {
        throw new Error('Token da Blaze não configurado. Acesse /config para configurar.');
      }

      // 2. Gerar tokens de autenticação via Edge Function
            const authResponse = await fetch('https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
        },
        body: JSON.stringify({
          action: 'generate-tokens',
          blazeToken: tokenData.token,
          userAgent: navigator.userAgent,
          acceptLanguage: navigator.language,
          selectedCurrencyType: 'BRL',
          realBrowserHeaders: {
            'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'DNT': '1',
            'Upgrade-Insecure-Requests': '1',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache'
          }
        })
      });

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        throw new Error(`Erro na geração de tokens: ${authResponse.status} - ${errorText}`);
      }

      const authResult = await authResponse.json();
      if (!authResult.success || !authResult.data) {
        throw new Error(authResult.error || 'Falha na geração de tokens');
      }

      // 3. Calcular sequência Martingale
      const martingaleSequence = [
        stake,        // M1 = 1x stake
        stake * 4,    // M2 = 4x stake
        stake * 10,   // M3 = 10x stake
        stake * 22    // M4 = 22x stake
      ];

      // 4. Conectar ao WebSocket
      const connectResponse = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'bet-connect',
          tipValue: stake,
          customMartingaleSequence: martingaleSequence,
          stakeBased: true,
          authTokens: authResult.data,
          userFingerprint: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screenResolution: `${screen.width}x${screen.height}`,
            colorDepth: screen.colorDepth,
            pixelRatio: window.devicePixelRatio,
            hardwareConcurrency: navigator.hardwareConcurrency
          },
          m4DirectModeEnabled: true,
          m4DirectBetType: betType
        })
      });

      const connectResult = await connectResponse.json();
      if (!connectResult.success) {
        throw new Error(connectResult.error || 'Erro ao conectar');
      }

      // 5. Iniciar operação
      const operationResponse = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'start-operation'
        })
      });

      const operationResult = await operationResponse.json();
      if (!operationResult.success) {
        throw new Error(operationResult.error || 'Erro ao iniciar operação');
      }

      config.onSuccess?.('Operação iniciada com sucesso');
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      config.onError?.(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [config]);

  // Função para parar operação
  const stopOperation = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const response = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'stop-operation'
        })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Erro ao parar operação');
      }

      // Parar monitoramento
      monitoringRef.current = false;
      
      config.onSuccess?.('Operação parada com sucesso');
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      config.onError?.(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [config]);

  // Função para monitorar logs
  const startMonitoring = useCallback(async () => {
    if (!userIdRef.current) return;

    monitoringRef.current = true;
    
    while (monitoringRef.current) {
      try {
        const response = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userIdRef.current,
            action: 'get-websocket-logs'
          })
        });

        const result = await response.json();
        
        if (result.success && result.data) {
          const operationActive = result.data.operationActive || false;
          const connected = result.data.connectionStatus?.connected || false;
          
          config.onStatusChange?.({ connected, operating: operationActive });
          
          // Se operação parou, parar monitoramento
          if (!operationActive && !connected) {
            monitoringRef.current = false;
            break;
          }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Erro no monitoramento:', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Aguardar mais tempo em caso de erro
      }
    }
  }, [config]);

  // Função para obter status atual
  const getStatus = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const response = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'get-connection-status'
        })
      });

      const result = await response.json();
      return result.success ? result.data : null;
    } catch (error) {
      console.error('Erro ao obter status:', error);
      return null;
    }
  }, []);

  return {
    startOperation,
    stopOperation,
    startMonitoring,
    getStatus,
    isMonitoring: monitoringRef.current
  };
} 