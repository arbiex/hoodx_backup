import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// Tipos
interface AuthData {
  userId?: string;
  casino?: string;
  provider?: string;
  game?: string;
  ppToken?: string;
  jsessionId?: string;
  timestamp?: string;
}

interface Balance {
  balance: number;
  bonusBalance: number;
  totalBalance: number;
  currency: string;
}

interface HistoryItem {
  gameId: string;
  gameResult: string;
  timestamp?: number;
  number?: number;
  color?: string;
}

interface BotState {
  isActive: boolean;
  loading: boolean;
  error: string | null;
  authData: AuthData | null;
  balance: Balance | null;
  balanceLoading: boolean;
  balanceError: string | null;
  lastBalanceUpdate: Date | null;
  logs: string[];
  lastAuth: string | null;
  history: HistoryItem[];
  historyLoading: boolean;
  lastHistoryUpdate: Date | null;
  _historyUpdateCounter?: number;
  lastHistoryHash?: string; // Hash do histórico para detectar mudanças reais
  lastRequestTime?: number; // Timestamp da última requisição
  sessionExpired?: boolean; // Detectar se sessão expirou
  missedHeartbeats?: number; // Contador de heartbeats perdidos
  lastHeartbeat?: number; // Timestamp do último heartbeat
}

// Adicionar após as interfaces, antes do export function
let activeMonitoringSession: string | null = null;
let monitoringTimeoutRef: NodeJS.Timeout | null = null;

export function useMegaRouletteBlaze() {
  const [state, setState] = useState<BotState>({
    isActive: false,
    loading: false,
    error: null,
    authData: null,
    balance: null,
    balanceLoading: false,
    balanceError: null,
    lastBalanceUpdate: null,
    logs: [],
    lastAuth: null,
    history: [],
    historyLoading: false,
    lastHistoryUpdate: null,
  });

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const logMessage = `[${timestamp}] ${message}`;
    setState(prev => ({
      ...prev,
      logs: [...prev.logs.slice(-9), logMessage] // Manter apenas os últimos 10 logs
    }));
  }, []);

  const clearLogs = useCallback(() => {
    setState(prev => ({ ...prev, logs: [] }));
  }, []);

  // Função para parar monitoramento existente antes de iniciar novo
  const stopExistingMonitoring = useCallback(() => {
    if (monitoringTimeoutRef) {
      clearTimeout(monitoringTimeoutRef);
      monitoringTimeoutRef = null;
    }
    activeMonitoringSession = null;
    addLog('🛑 Monitoramento anterior interrompido');
  }, [addLog]);

  // Função para parsear resultado do jogo
  const parseGameResult = useCallback((gameResult: string): { number: number; color: string } => {
    const parts = gameResult.split(' ');
    const number = parseInt(parts[0]);
    let color = 'green';
    
    if (number === 0) {
      color = 'green';
    } else {
      // Números vermelhos na roleta europeia
      const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
      color = redNumbers.includes(number) ? 'red' : 'black';
    }
    
    return { number, color };
  }, []);

  // Função para gerar hash do histórico (detectar mudanças reais)
  const generateHistoryHash = useCallback((history: HistoryItem[]): string => {
    if (!history || history.length === 0) return '';
    // Usar os primeiros 10 resultados para gerar hash
    const first10 = history.slice(0, 10).map(item => item.gameId).join('|');
    return first10;
  }, []);

  // Sistema de heartbeat baseado na Pragmatic Play
  const performHeartbeat = useCallback(async () => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return false;

      // Verificar se bot ainda ativo
      let isActive = false;
      setState(prev => {
        isActive = prev.isActive;
        return prev;
      });

      if (!isActive) return false;

      // Fazer heartbeat via balance (como a Pragmatic faz)
      const response = await fetch('/api/bots/blaze/pragmatic/api/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();
      const now = Date.now();

      if (data.success) {
        // Heartbeat bem-sucedido
        setState(prev => ({
          ...prev,
          missedHeartbeats: 0,
          lastHeartbeat: now,
          sessionExpired: false
        }));
        return true;
      } else {
        // Heartbeat falhou
        setState(prev => {
          const missed = (prev.missedHeartbeats || 0) + 1;
          const sessionExpired = missed > 2; // Limite como na Pragmatic
          
          if (sessionExpired) {
            addLog('🚨 Sessão expirada - Renovando autenticação...');
          }
          
          return {
            ...prev,
            missedHeartbeats: missed,
            lastHeartbeat: now,
            sessionExpired
          };
        });
        return false;
      }
    } catch (error) {
      setState(prev => {
        const missed = (prev.missedHeartbeats || 0) + 1;
        return {
          ...prev,
          missedHeartbeats: missed,
          lastHeartbeat: Date.now()
        };
      });
      return false;
    }
  }, [addLog]);

  // SISTEMA ÚNICO DE MONITORAMENTO EM TEMPO REAL (SEM CACHE)
  const startRealTimeMonitoring = useCallback(async () => {
    
    // Parar qualquer monitoramento existente primeiro
    stopExistingMonitoring();
    
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        addLog('❌ Usuário não autenticado');
        return;
      }

      // Criar sessionId único para este monitoramento
      const sessionId = `monitoring_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      activeMonitoringSession = sessionId;

      addLog('🚀 Iniciando monitoramento em tempo real...');
      
      let isMonitoring = false;
      let lastGameId = '';

      const monitorHistory = async () => {
        
        // Verificar se esta sessão ainda é ativa
        if (activeMonitoringSession !== sessionId) {
          return;
        }
        
        try {
          // Evitar requisições simultâneas
          if (isMonitoring) return;
          
          // Verificar se bot ainda ativo
          let shouldContinue = false;
          setState(prev => {
            shouldContinue = prev.isActive;
            return prev;
          });

          if (!shouldContinue) {
            return;
          }

          isMonitoring = true;

          // Buscar histórico da Pragmatic
          const response = await fetch('/api/bots/blaze/pragmatic/api/fetch-history', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-Session-Id': sessionId // Identificar a sessão
            },
            body: JSON.stringify({ userId })
          });

          const data = await response.json();
          
          addLog(`🔍 Resposta da API: ${data.success ? 'Sucesso' : 'Erro'}`);

          if (data.success && data.data?.history && data.data.history.length > 0) {
            const latestGame = data.data.history[0];
            addLog(`📋 Histórico recebido: ${data.data.history.length} resultados`);
            
            // Na primeira carga OU se há novo resultado
            const isFirstLoad = lastGameId === '';
            const hasNewResult = latestGame.gameId !== lastGameId;
            
            if (isFirstLoad || hasNewResult) {
              lastGameId = latestGame.gameId;
              
              // Processar histórico completo
              const processedHistory: HistoryItem[] = data.data.history.map((item: any) => {
                const parsed = parseGameResult(item.gameResult);
                return {
                  gameId: item.gameId,
                  gameResult: item.gameResult,
                  timestamp: item.timestamp || Date.now(),
                  number: parsed.number,
                  color: parsed.color
                };
              });

              // Atualizar estado apenas se sessão ainda ativa
              if (activeMonitoringSession === sessionId) {
                setState(prev => ({
                  ...prev,
                  history: processedHistory,
                  historyLoading: false,
                  lastHistoryUpdate: new Date()
                }));

                // Log do resultado
                const latest = processedHistory[0];
                if (isFirstLoad) {
                  addLog(`📊 Histórico inicial carregado: ${processedHistory.length} resultados`);
                  addLog(`🎯 Último: ${latest.number} ${latest.color} (${latestGame.gameId})`);
                } else {
                  addLog(`🎯 NOVO: ${latest.number} ${latest.color} (${latestGame.gameId})`);
                }
              }
            } else {
              addLog(`⏸️ Sem novos resultados (último: ${lastGameId})`);
            }
          } else {
            // Se não conseguiu buscar histórico
            if (activeMonitoringSession === sessionId) {
              setState(prev => ({ ...prev, historyLoading: false }));
              addLog('❌ Nenhum histórico encontrado na resposta');
            }
          }

          isMonitoring = false;

          // Continuar monitoramento apenas se sessão ainda ativa e bot ativo
          if (activeMonitoringSession === sessionId) {
            setState(prev => {
              if (prev.isActive) {
                monitoringTimeoutRef = setTimeout(monitorHistory, 3000); // 3 segundos - otimizado!
              }
              return prev;
            });
          }

        } catch (error) {
          isMonitoring = false;
          
          // Tentar novamente em caso de erro apenas se sessão ainda ativa
          if (activeMonitoringSession === sessionId) {
            setState(prev => {
              if (prev.isActive) {
                monitoringTimeoutRef = setTimeout(monitorHistory, 5000); // 5 segundos em caso de erro
              }
              return prev;
            });
          }
        }
      };

      // Carregar histórico inicial
      setState(prev => ({ ...prev, historyLoading: true }));
      
      // Buscar histórico inicial da API
      addLog('🔍 Carregando histórico inicial...');
      await monitorHistory();
      
      addLog('✅ Monitoramento em tempo real ativo (3s)');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      addLog(`❌ Erro no monitoramento: ${errorMessage}`);
      setState(prev => ({ ...prev, historyLoading: false }));
      
      // Limpar sessão ativa em caso de erro
      if (activeMonitoringSession) {
        activeMonitoringSession = null;
      }
    }
  }, [addLog, parseGameResult, stopExistingMonitoring]);

  // Função para obter userId atual
  const getCurrentUserId = async (): Promise<string | null> => {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || null;
    } catch (error) {
      return null;
    }
  };

  // Buscar saldo
  const fetchBalance = useCallback(async () => {
    setState(prev => ({ ...prev, balanceLoading: true, balanceError: null }));

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const response = await fetch('/api/bots/blaze/pragmatic/api/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();

      if (data.success && data.data) {
        const balance: Balance = {
          balance: data.data.balance || 0,
          bonusBalance: data.data.bonusBalance || 0,
          totalBalance: (data.data.balance || 0) + (data.data.bonusBalance || 0),
          currency: data.data.currency || 'BRL'
        };

        setState(prev => ({
          ...prev,
          balance,
          balanceLoading: false,
          lastBalanceUpdate: new Date()
        }));

        addLog(`💰 Saldo atualizado: R$ ${balance.totalBalance.toFixed(2)}`);
      } else {
        throw new Error(data.error || 'Erro ao buscar saldo');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setState(prev => ({ 
        ...prev, 
        balanceLoading: false, 
        balanceError: errorMessage 
      }));
      addLog(`❌ Erro no saldo: ${errorMessage}`);
    }
  }, [addLog]);

  // Iniciar bot
  const startBot = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    addLog('🚀 Iniciando bot Mega Roulette...');

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      // Fazer requisição para conectar o bot
      const response = await fetch('/api/bots/blaze/pragmatic/mega-roulette', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          action: 'connect'
        })
      });

      const data = await response.json();

      if (data.success) {
        // Atualizar estado com dados de autenticação
        const authData: AuthData = {
          userId: data.data.userId,
          casino: 'BLAZE',
          provider: 'PRAGMATIC_PLAY',
          game: data.data.game,
          ppToken: data.data.auth?.ppToken,
          jsessionId: data.data.auth?.jsessionId,
          timestamp: data.data.timestamp
        };

        setState(prev => ({
          ...prev,
          isActive: true,
          loading: false,
          authData,
          lastAuth: new Date().toLocaleTimeString('pt-BR')
        }));

        addLog('✅ Bot conectado com sucesso');
        addLog(`🎰 Jogo: ${data.data.game}`);
        
        if (data.data.liveHistory?.status === 'active') {
          addLog('📊 Histórico em tempo real ativo');
        }

        // Buscar saldo e histórico iniciais
        fetchBalance();
        startRealTimeMonitoring();
      } else {
        throw new Error(data.error || 'Erro ao conectar bot');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage,
        isActive: false
      }));
      addLog(`❌ Erro: ${errorMessage}`);
    }
  }, [addLog, fetchBalance, startRealTimeMonitoring]);

  // Parar bot  
  const stopBot = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    addLog('⏹️ Parando bot...');

    try {
      // Parar monitoramento primeiro
      stopExistingMonitoring();
      
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      // Limpar sessões no backend
      const cleanupResponse = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cleanup-sessions',
          userId
        })
      });

      if (cleanupResponse.ok) {
        addLog('🧹 Sessões limpas no backend');
      }

      setState(prev => ({
        ...prev,
        isActive: false,
        loading: false,
        error: null,
        authData: null,
        balance: null,
        balanceError: null,
        history: [], // Limpar histórico também
        historyLoading: false
      }));

      addLog('✅ Bot parado com sucesso');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setState(prev => ({ 
        ...prev, 
        loading: false,
        error: errorMessage
      }));
      addLog(`❌ Erro ao parar: ${errorMessage}`);
    }
  }, [addLog, stopExistingMonitoring]);

  // Autenticar (caso necessário)
  const authenticate = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    addLog('🔐 Autenticando...');

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const response = await fetch('/api/bots/blaze/pragmatic/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();

      if (data.success) {
        setState(prev => ({
          ...prev,
          loading: false,
          lastAuth: new Date().toLocaleTimeString('pt-BR')
        }));
        addLog('✅ Autenticação realizada com sucesso');
      } else {
        throw new Error(data.error || 'Erro na autenticação');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      addLog(`❌ Erro na autenticação: ${errorMessage}`);
    }
  }, [addLog]);

  // Computed values
  const isAuthenticated = !!state.authData;
  const isOperational = state.isActive && !state.error;
  const hasBalance = !!state.balance && state.balance.totalBalance > 0;
  const totalBalance = state.balance?.totalBalance || 0;

  // Helper para formatar moeda
  const formatCurrency = useCallback((value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }, []);

  // Dados para exibição nos cards
  const casino = state.authData?.casino || 'BLAZE';
  const provider = state.authData?.provider || 'PRAGMATIC_PLAY';
  const game = state.authData?.game || 'MEGA_ROULETTE';
  const ppToken = state.authData?.ppToken;
  const jsessionId = state.authData?.jsessionId; 
  const userId = state.authData?.userId;

  // Iniciar monitoramento quando bot ativo
  useEffect(() => {
    if (!state.isActive) return;
    
    startRealTimeMonitoring();
  }, [state.isActive]);

  return {
    // Estado
    isActive: state.isActive,
    loading: state.loading,
    authData: state.authData,
    balance: state.balance,
    balanceLoading: state.balanceLoading,
    balanceError: state.balanceError,
    lastBalanceUpdate: state.lastBalanceUpdate,
    logs: state.logs,
    error: state.error,
    lastAuth: state.lastAuth,
    history: state.history,
    historyLoading: state.historyLoading,
    lastHistoryUpdate: state.lastHistoryUpdate,
    
    // Ações
    startBot,
    stopBot,
    authenticate,
    fetchBalance,
    clearLogs,
    
    // Computed
    isAuthenticated,
    isOperational,
    hasBalance,
    totalBalance,
    
    // Helpers
    formatCurrency,
    parseGameResult,
    
    // Dados para cards
    casino,
    provider,
    game,
    ppToken,
    jsessionId,
    userId,
    
  };
} 