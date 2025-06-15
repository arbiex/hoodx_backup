import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Tipos consolidados
interface GameResult {
  gameId: string;
  gameResult: string;
  number: number;
  color: 'red' | 'black' | 'green';
  timestamp: number;
}

interface BotState {
  isActive: boolean;
  loading: boolean;
  error: string | null;
  jsessionId: string | null;
  balance: {
    total: number;
    currency: string;
  } | null;
  history: GameResult[];
  lastUpdate: Date | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  patterns: any[];
}

// Hook simplificado sem duplicação
export function useSimplifiedMegaRoulette() {
  const [state, setState] = useState<BotState>({
    isActive: false,
    loading: false,
    error: null,
    jsessionId: null,
    balance: null,
    history: [],
    lastUpdate: null,
    connectionStatus: 'disconnected',
    patterns: []
  });

  // Refs para controle de sessão
  const monitoringRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isMonitoringRef = useRef(false);

  // Função para obter userId
  const getCurrentUserId = useCallback(async (): Promise<string | null> => {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || null;
    } catch (error) {
      console.error('Erro ao obter userId:', error);
      return null;
    }
  }, []);

  // Função para parsear resultado
  const parseGameResult = useCallback((gameResult: string): { number: number; color: 'red' | 'black' | 'green' } => {
    const parts = gameResult.split(' ');
    const number = parseInt(parts[0]) || 0;
    
    let color: 'red' | 'black' | 'green' = 'green';
    if (number === 0) {
      color = 'green';
    } else {
      const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
      color = redNumbers.includes(number) ? 'red' : 'black';
    }
    
    return { number, color };
  }, []);

  // Função para limpar monitoramento
  const clearMonitoring = useCallback(() => {
    if (monitoringRef.current) {
      clearTimeout(monitoringRef.current);
      monitoringRef.current = null;
    }
    isMonitoringRef.current = false;
    sessionIdRef.current = null;
  }, []);

  // Função de monitoramento consolidada
  const startMonitoring = useCallback(async () => {
    if (isMonitoringRef.current || !state.jsessionId) return;

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionIdRef.current = sessionId;
    isMonitoringRef.current = true;
    
    const userId = await getCurrentUserId();
    if (!userId) return;

    const monitor = async () => {
      // Verificar se sessão ainda é válida
      if (sessionIdRef.current !== sessionId || !isMonitoringRef.current) {
        return;
      }

      try {
        setState(prev => ({ ...prev, connectionStatus: 'connecting' }));

        const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Session-Id': sessionId
          },
          body: JSON.stringify({
            action: 'monitor',
            jsessionId: state.jsessionId,
            userId
          })
        });

        const data = await response.json();

        if (data.success && data.data?.results) {
          const processedResults: GameResult[] = data.data.results.map((item: any) => {
            const parsed = parseGameResult(item.gameResult);
            return {
              gameId: item.gameId,
              gameResult: item.gameResult,
              timestamp: item.timestamp || Date.now(),
              number: parsed.number,
              color: parsed.color
            };
          });

          setState(prev => ({
            ...prev,
            history: processedResults,
            lastUpdate: new Date(),
            connectionStatus: 'connected',
            patterns: data.data.rouletteSignals?.patterns || [],
            error: null
          }));
        } else {
          setState(prev => ({ 
            ...prev, 
            connectionStatus: 'disconnected',
            error: data.error || 'Erro no monitoramento'
          }));
        }

        // Continuar monitoramento se sessão ainda ativa
        if (sessionIdRef.current === sessionId && isMonitoringRef.current) {
          monitoringRef.current = setTimeout(monitor, 3000);
        }

      } catch (error) {
        setState(prev => ({ 
          ...prev, 
          connectionStatus: 'disconnected',
          error: error instanceof Error ? error.message : 'Erro desconhecido'
        }));

        // Tentar novamente em caso de erro
        if (sessionIdRef.current === sessionId && isMonitoringRef.current) {
          monitoringRef.current = setTimeout(monitor, 5000);
        }
      }
    };

    // Iniciar monitoramento
    monitor();
  }, [state.jsessionId, getCurrentUserId, parseGameResult]);

  // Função para iniciar bot
  const startBot = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId,
          numberOfGames: 50 
        })
      });

      const data = await response.json();

      if (data.success) {
        setState(prev => ({
          ...prev,
          isActive: true,
          loading: false,
          jsessionId: data.data.auth.jsessionId,
          balance: {
            total: data.data.balance.totalBalance,
            currency: data.data.balance.currency
          },
          error: null
        }));

        // Iniciar monitoramento após conectar
        setTimeout(startMonitoring, 1000);
      } else {
        throw new Error(data.error || 'Erro ao conectar bot');
      }
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        isActive: false
      }));
    }
  }, [getCurrentUserId, startMonitoring]);

  // Função para parar bot
  const stopBot = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));

    try {
      clearMonitoring();

      const userId = await getCurrentUserId();
      if (userId) {
        // Limpar sessões no backend
        await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cleanup-sessions',
            userId
          })
        });
      }

      setState(prev => ({
        ...prev,
        isActive: false,
        loading: false,
        jsessionId: null,
        balance: null,
        history: [],
        connectionStatus: 'disconnected',
        patterns: [],
        error: null
      }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        loading: false,
        error: error instanceof Error ? error.message : 'Erro ao parar bot'
      }));
    }
  }, [clearMonitoring, getCurrentUserId]);

  // Limpar recursos ao desmontar
  useEffect(() => {
    return () => {
      clearMonitoring();
    };
  }, [clearMonitoring]);

  return {
    // Estado
    ...state,
    
    // Ações
    startBot,
    stopBot,
    
    // Computed
    isConnected: state.connectionStatus === 'connected',
    hasHistory: state.history.length > 0,
    latestResult: state.history[0] || null,
    
    // Helpers
    formatCurrency: (value: number) => new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  };
} 