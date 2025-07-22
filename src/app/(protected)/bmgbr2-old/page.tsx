/**
 * 🧪 BMGBR2 - VERSÃO DE TESTES
 * 
 * Esta é uma cópia da página BMGBR original para testar novas funcionalidades
 * sem interferir no sistema em produção.
 * 
 * API: /api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr
 * Página: /bmgbr2
 */
'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchWithCacheBusting } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, RefreshCw, Zap, Key, Settings, BarChart3, Power, Target, TrendingUp, TrendingDown, Shield, Brain, Bot, AlertTriangle, CheckCircle } from 'lucide-react';
import MatrixRain from '@/components/MatrixRain';
import Modal, { useModal } from '@/components/ui/modal';
import InlineAlert from '@/components/ui/inline-alert';
import CreditDisplay from '@/components/CreditDisplay';

import OperationsCard from '@/components/OperationsCard';

// import GameStatisticsCard from '@/components/GameStatisticsCard'; // 🛑 DESATIVADO

/**
 * 🔇 SISTEMA DE POLLING ULTRA-SILENCIOSO - Versão 3.0
 * 
 * 🛑 TODOS OS POLLING REMOVIDOS:
 *    - GameStatisticsCard: 30s ❌ (REMOVIDO)
 *    - Update interval histórico: 30s ❌ (REMOVIDO)
 *    - Hash comparisons & gap recovery ❌ (REMOVIDO)
 *    - FrequencyAnalysisCard auto-refresh ❌ (REMOVIDO)
 *    - Logs e console.warn ❌ (REMOVIDO)
 *
 * ✅ ÚNICO POLLING ATIVO:
 *    - Insights polling: 3s (Monitoramento URL silencioso)
 *    - Só dispara atualizações quando gameId muda
 *    - Zero logs, zero re-renders desnecessários
 *
 * 🎯 RESULTADO: Sistema ultra-eficiente, polling verdadeiramente silencioso
 */

export default function BMGBR2() {
  // Estados básicos
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ NOVO: Estado para tokens de autenticação
  const [authTokens, setAuthTokens] = useState<{
    ppToken: string;
    jsessionId: string;
    pragmaticUserId?: string;
  } | null>(null);

  // 💰 NOVA LÓGICA: Sistema de stakes com multiplicador
  const [stakeMultiplier, setStakeMultiplier] = useState<number>(1); // Multiplicador: 1x, 2x, 3x, 4x, 5x
  const [martingaleSequence, setMartingaleSequence] = useState<number[]>([]);
  const [totalMartingaleAmount, setTotalMartingaleAmount] = useState<number>(0); // M1 sempre fixo em R$ 1,00

  // Estados para WebSocket logs
  const [websocketLogs, setWebsocketLogs] = useState<Array<{ 
    timestamp: number; 
    message: string; 
    type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' 
  }>>([]);

  // Estados para últimos 10 resultados (nova estratégia)
  const [lastTenResults, setLastTenResults] = useState<Array<{ 
    number: number; 
      color: string;
    gameId: string; 
    timestamp: number 
  }>>([]);

  // 📊 NOVO: Estado para rastreamento de uso do martingale (agora M1-M2)
  const [martingaleUsage, setMartingaleUsage] = useState<number[]>(new Array(2).fill(0));
  
  // 📊 NOVO: Estado para rastreamento de rodadas analisadas por nível
  const [analysisRounds, setAnalysisRounds] = useState<number[]>(new Array(2).fill(0));

  // 📈 NOVO: Estado para rastreamento do histórico de apostas
  const [betHistory, setBetHistory] = useState<Array<{ 
    type: 'win' | 'loss' | 'placed'; 
    timestamp: number; 
    value: number;
    gameId?: string;
    martingaleLevel?: number;
  }>>([]);

  // Estados da operação
  const [operationActive, setOperationActive] = useState(false);
  // Atualizar o tipo de operationState para incluir 'mode'
  const [operationState, setOperationState] = useState<{
    mode?: 'real' | 'analysis';
    pattern: string;
    level: number;
    martingaleLevel: number;
    waitingForResult: boolean;
    stats: {
      totalBets: number;
      wins: number;
      losses: number;
      profit: number;
      startedAt: number;
    };
      // M4 Direct mode
  m4DirectBetType?: 'await' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';
  } | null>(null);

  // Estados de conexão
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    error?: string;
    lastUpdate: number;
  }>({ connected: false, lastUpdate: Date.now() });

  // Estados para operação
  const [isOperating, setIsOperating] = useState(false);
  const [operationLoading, setOperationLoading] = useState(false);
  const [operationStatus, setOperationStatus] = useState<string>('INATIVO');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationSuccess, setOperationSuccess] = useState<string | null>(null);
  
  // Estados para token da Blaze
  const blazeConfigModal = useModal();
  const [blazeToken, setBlazeToken] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [userTokens, setUserTokens] = useState<Array<{
    casino_name: string;
    casino_code: string;
    token: string;
    is_active: boolean;
  }>>([]);
  const [alertMessage, setAlertMessage] = useState<{ 
    type: 'success' | 'error' | 'warning' | 'info', 
    message: string 
  } | null>(null);
  
  // Estados para relatório
  const [operationReport, setOperationReport] = useState<{
    summary: {
      totalBets: number;
      wins: number;
      losses: number;
      profit: number;
      winRate: number;
      startedAt: number;
    };
  } | null>(null);

  // Estados para modal de estratégia - REMOVIDOS
  // const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  // const [strategyLoading, setStrategyLoading] = useState(false);
  // const [selectedTipValue, setSelectedTipValue] = useState<number | null>(null);

  // NOVO: Estado da janela de apostas
  const [bettingWindow, setBettingWindow] = useState<{
    isOpen: boolean;
    currentGameId?: string;
    lastUpdate?: number;
  }>({ isOpen: false });

  const monitoringRef = useRef<boolean>(false);
  const operationRef = useRef<boolean>(false);
  const userIdRef = useRef<string>('');

  // Estados para dados históricos do FrequencyAnalysisCard
  const [historyRecords, setHistoryRecords] = useState<Array<{
    id: number
    game_id: string
    number: number
    color: string
    game_result: string
    timestamp: string
    created_at: string
  }>>([]);

  // 📊 NOVO: Estados para análise de sequências (para o card comparativo)
  const [fullHistoryRecords, setFullHistoryRecords] = useState<Array<{
    id: number
    game_id: string
    number: number
    color: string
    game_result: string
    timestamp: string
    created_at: string
  }>>([]);

  // 🔥 NOVO: Estados para o sistema de insights local
  const [insightsData, setInsightsData] = useState<{
    results: Array<{
      id: string;
      gameId: string;
      number: number;
      color: string;
      timestamp: number;
      gameResult: string;
    }>;
    totalResults: number;
    lastUpdate: number;
    isActive: boolean;
    isOnline: boolean;
    lastGameId: string;
  } | null>(null);

  // 🔇 ESTADO MINIMALISTA: Apenas o essencial para comparação
  const [lastKnownGameId, setLastKnownGameId] = useState<string | null>(null);

  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [isInsightsActive, setIsInsightsActive] = useState(false);
  const insightsPollingRef = useRef<NodeJS.Timeout | null>(null);

  // 🔥 NOVO: Estado para controlar quantos resultados mostrar
  const [visibleResultsCount, setVisibleResultsCount] = useState(20); // 20 resultados fixos



  // ✅ NOVO: Estado para controlar quando é seguro parar
  const [canSafelyStop, setCanSafelyStop] = useState(true);
  
  // 🛑 NOVO: Estado para controle do botão baseado no modo (análise/real)
  const [stopButtonControl, setStopButtonControl] = useState<{
    canStop: boolean;
    mode: 'analysis' | 'real';
    isBlocked: boolean;
  } | null>(null);



  // ✅ NOVO: Estado para forçar exibição como operando (evita piscar)
  const [forceOperatingDisplay, setForceOperatingDisplay] = useState(false);

  // Estados para controle de segurança baseado em status foram removidos - apenas M4 Direto

  // Removed: Auto Bot and Stop Gain states
  
  // 🔧 NOVO: Estados para controlar se debug está rodando
  const [debugRunning, setDebugRunning] = useState<boolean>(false);
  const [syncRunning, setSyncRunning] = useState<boolean>(false);
  const [lastDebugAction, setLastDebugAction] = useState<string | null>(null);
  const [previousWaitingState, setPreviousWaitingState] = useState<boolean>(false);
  const [debugHidden, setDebugHidden] = useState<boolean>(false);
  const [lastProcessedInsightGameId, setLastProcessedInsightGameId] = useState<string | null>(null);
  
  // 📈 NOVO: Estados para Progressão de Stake por Rodadas
  const [stakeProgressionEnabled, setStakeProgressionEnabled] = useState(false);
  const [stakeProgressionRounds, setStakeProgressionRounds] = useState(30);
  const [stakeProgressionMultiplier, setStakeProgressionMultiplier] = useState(2);
  const [stakeProgressionMaxMultiplications, setStakeProgressionMaxMultiplications] = useState(3);
  const [stakeProgressionCurrentMultiplications, setStakeProgressionCurrentMultiplications] = useState(0);
  const [stakeProgressionRoundCounter, setStakeProgressionRoundCounter] = useState(0);
  const [stakeProgressionInitialStake, setStakeProgressionInitialStake] = useState(0.50);

  // Removed: Stop Gain states

  // Estado para controlar regra de frequência foi removido - apenas M4 Direto

  // 🔥 NOVO: Modo M4 direto sempre habilitado nativamente
  const m4DirectModeEnabled = true;

  // 🔥 NOVO: Estado para tipo de aposta do modo M4 direto
  const [m4DirectBetType, setM4DirectBetType] = useState<'await' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high'>('await');

  // 🔄 NOVO: Estado para controlar última atualização dos dados históricos
  const [lastHistoryUpdate, setLastHistoryUpdate] = useState<Date | null>(null);

  // 🔥 NOVO: Estado para controlar ativação automática do modo real
  const [realModeActivationAttempted, setRealModeActivationAttempted] = useState(false);
  
  // 🔥 NOVO: Timestamp da última verificação de ativação (para throttling)
  const lastActivationCheckRef = useRef<number>(0);

  // Estados removidos - stake agora é aplicada diretamente

  // Função checkFrequencyThresholds removida - não mais necessária no modo M4 direto

  // 💰 NOVA LÓGICA: Array dos níveis de stake fixos com custos
  const STAKE_LEVELS = [
    { level: 1, m1: 1.00, m2: 1.00, cost: 2.00 },
    { level: 2, m1: 1.00, m2: 2.00, cost: 3.00 },
    { level: 3, m1: 1.50, m2: 2.50, cost: 4.00 },
    { level: 4, m1: 2.00, m2: 3.50, cost: 5.50 },
    { level: 5, m1: 2.50, m2: 5.00, cost: 7.50 },
    { level: 6, m1: 3.50, m2: 6.50, cost: 10.00 },
    { level: 7, m1: 4.50, m2: 9.00, cost: 13.50 },
    { level: 8, m1: 6.00, m2: 12.00, cost: 18.00 },
    { level: 9, m1: 8.00, m2: 16.00, cost: 24.00 },
    { level: 10, m1: 10.50, m2: 21.50, cost: 32.00 },
    { level: 11, m1: 14.00, m2: 28.50, cost: 42.50 },
    { level: 12, m1: 19.00, m2: 37.50, cost: 56.50 },
    { level: 13, m1: 25.00, m2: 50.50, cost: 75.50 },
    { level: 14, m1: 33.50, m2: 67.00, cost: 100.50 },
    { level: 15, m1: 44.50, m2: 89.50, cost: 134.00 },
    { level: 16, m1: 59.50, m2: 119.00, cost: 178.50 },
    { level: 17, m1: 79.50, m2: 158.50, cost: 238.00 },
    { level: 18, m1: 106.00, m2: 211.50, cost: 317.50 },
    { level: 19, m1: 141.00, m2: 282.00, cost: 423.00 },
    { level: 20, m1: 188.00, m2: 376.00, cost: 564.00 },
    { level: 21, m1: 250.00, m2: 502.00, cost: 752.00 },
    { level: 22, m1: 334.00, m2: 668.00, cost: 1002.00 },
    { level: 23, m1: 445.00, m2: 1336.00, cost: 1781.00 },
    { level: 24, m1: 593.00, m2: 1781.00, cost: 2374.00 },
    { level: 25, m1: 791.00, m2: 2374.00, cost: 3165.00 },
    { level: 26, m1: 1055.00, m2: 3165.00, cost: 4220.00 },
    { level: 27, m1: 1406.00, m2: 4220.00, cost: 5626.00 },
    { level: 28, m1: 1875.00, m2: 3751.00, cost: 5626.00 },
    { level: 29, m1: 2500.00, m2: 5001.00, cost: 7501.00 }
  ];

  // 💰 NOVA FUNÇÃO: Calcular stakes com multiplicador
  const calculateStakesWithMultiplier = (level: number, multiplier: number) => {
    const baseLevel = STAKE_LEVELS.find(l => l.level === level) || STAKE_LEVELS[0];
    return {
      m1: baseLevel.m1 * multiplier,
      m2: baseLevel.m2 * multiplier
    };
  };

  // 💰 NOVA FUNÇÃO: Calcular sequência de martingale (Nível 1 com multiplicador)
  const calculateMartingaleSequence = (): number[] => {
    const stakes = calculateStakesWithMultiplier(1, stakeMultiplier);
    return [stakes.m1, stakes.m2];
  };

  // 💰 NOVA FUNÇÃO: Calcular valor total acumulado
  const calculateTotalAmount = (sequence: number[]): number => {
    return sequence.reduce((total, value) => total + value, 0);
  };

  // 💰 FUNÇÃO HELPER: Obter stake atual (M1) - Nível 1 com multiplicador
  const getCurrentStake = (): number => {
    const stakes = calculateStakesWithMultiplier(1, stakeMultiplier);
    return stakes.m1;
  };

  // 🚀 NOVA FUNÇÃO: Atualizar multiplicador de stake
  const updateStakeMultiplier = async (newMultiplier: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ Usuário não autenticado');
        return;
      }

      const response = await fetchWithCacheBusting('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'update-strategy',
          stakeMultiplier: newMultiplier
        })
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Multiplicador de stake atualizado para ${newMultiplier}x`);
      } else {
        console.error('❌ Erro na resposta do backend:', result.error);
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar multiplicador de stake:', error);
    }
  };

  // 💰 EFEITO: Recalcular sequência quando multiplicador muda
  useEffect(() => {
    const newSequence = calculateMartingaleSequence();
    setMartingaleSequence(newSequence);
    setTotalMartingaleAmount(calculateTotalAmount(newSequence));
  }, [stakeMultiplier]);

  // 💰 EFEITO: Inicializar sequência na primeira renderização
  useEffect(() => {
    if (martingaleSequence.length === 0) {
      const initialSequence = calculateMartingaleSequence();
      setMartingaleSequence(initialSequence);
      setTotalMartingaleAmount(calculateTotalAmount(initialSequence));
    }
  }, []);

  // 🚀 REMOVIDO: Função de progressão automática não aplicável à nova lógica

  // 🔥 NOVO: Inicializar coleta de insights automaticamente
  useEffect(() => {
    const initializeInsights = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Verificar se o usuário tem token configurado
        const { data: userTokens } = await supabase
          .from('user_tokens')
          .select('*')
          .eq('user_id', user.id)
          .eq('casino_code', 'BLAZE');
        
        // Se tem token configurado, iniciar coleta automaticamente
        if (userTokens && userTokens.length > 0 && userTokens.some(token => token.is_active && token.token && token.token.trim() !== '')) {
          console.log('🔥 Iniciando coleta de insights automaticamente...');
          await startInsightsCollection();
        }
      }
    };

    initializeInsights();
  }, []);

  // 🔥 REMOVIDO: Funções para carregar mais resultados - agora fixo em 20 resultados
  // const loadMoreResults = () => {
  //   setVisibleResultsCount(prev => prev + 20);
  // };

  // const resetToStart = () => {
  //   setVisibleResultsCount(19);
  // };

  // 🔥 REMOVIDO: Não resetar contador quando novos dados chegam - agora fixo em 20
  // useEffect(() => {
  //   // ✅ CORREÇÃO: Verificar insightsData.results em vez de insightsData diretamente
  //   if (insightsData && insightsData.results && Array.isArray(insightsData.results) && insightsData.results.length > 0) {
  //     // ✅ Debug: Verificar se dados estão na ordem correta no estado
  //     console.log('🔄 Dados no estado após atualização:', {
  //       totalResults: insightsData.results.length,
  //       primeiros3: insightsData.results.slice(0, 3).map((r: any) => `${r.number} (${r.game_id})`),
  //       lastGameId: insightsData.lastGameId,
  //       lastUpdate: new Date(insightsData.lastUpdate).toLocaleTimeString()
  //     });
  //     
  //     setVisibleResultsCount(20); // Mantém fixo em 20
  //   }
  // }, [insightsData]);



  // Função updateSafetyConfig removida - não mais necessária no modo M4 direto

  // 💰 NOVA FUNÇÃO: Formatar valor monetário
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // 💰 NOVA FUNÇÃO: Formatar número com vírgula (para inputs)
  const formatNumberInput = (value: number): string => {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  // 💰 NOVA FUNÇÃO: Aplicar máscara brasileira automaticamente
  const applyBrazilianMask = (value: string): string => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');
    
    // Se vazio, retorna vazio
    if (!numbers) return '';
    
    // Converte para centavos (últimos 2 dígitos são centavos)
    const cents = parseInt(numbers);
    const reais = cents / 100;
    
    // Formata no padrão brasileiro
    return reais.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // 💰 NOVA FUNÇÃO: Converter valor formatado para número
  const parseBrazilianNumber = (formattedValue: string): number => {
    // Remove pontos e substitui vírgula por ponto
    const cleanValue = formattedValue.replace(/\./g, '').replace(',', '.');
    return parseFloat(cleanValue) || 0;
  };

  // 🎯 NOVA FUNÇÃO: Calcular valor alvo do Stop Gain baseado no stake
  const calculateStopGainTarget = (percentage: number): number => {
    const baseAmount = totalMartingaleAmount * 6; // 6x o total do martingale como base
    return (baseAmount * percentage) / 100;
  };

  // 📊 FUNÇÃO SIMPLIFICADA: Agora os dados vêm diretamente da API
  const processMartingaleLogs = (logs: any[]) => {
    // Função mantida para compatibilidade, mas os dados principais vêm da API
    // Pode ser usada para processamento adicional se necessário
  };

  // 🔄 NOVA FUNÇÃO: Resetar estatísticas de martingale quando operação iniciar
  const resetMartingaleStats = () => {
    setMartingaleUsage(new Array(2).fill(0)); // Agora M1-M2
    setAnalysisRounds(new Array(2).fill(0)); // Resetar rodadas analisadas
  };

  // 🔄 NOVA FUNÇÃO: Resetar histórico de apostas
  const resetBetHistory = () => {
    setBetHistory([]);
  };

  // 🔄 NOVA FUNÇÃO: Reset completo de todos os gráficos para nova sessão
  const resetAllGraphs = async () => {
    // Resetar gráficos locais
    resetMartingaleStats();
    resetBetHistory();
    
    // Resetar relatório no backend
    await resetOperationReport();
    
    // Limpar estados locais
    setWebsocketLogs([]);
    setOperationReport(null);
    setOperationState(null);
    setLastTenResults([]);
    
    // Função removida
  };

  // 🚀 NOVA FUNÇÃO: Verificar se progressão pode ser reativada
  const checkProgressionReactivation = () => {
    // Função removida - progressão automática removida
  };

  // 🚀 NOVA FUNÇÃO: Processar aposta para progressão automática
  const processProgressionBet = async () => {
    // Função removida - progressão automática removida
  };

  // 🚀 NOVA FUNÇÃO: Calcular quantas apostas faltam para próxima progressão
  const getProgressionStatus = () => {
    // Função removida - progressão automática removida
    return null;
  };

  // 🚀 NOVA FUNÇÃO: Enviar configurações de progressão para o backend
  const updateProgressionSettings = async () => {
    // Função removida - progressão automática removida
  };

  // 🚀 EFEITO: Atualizar configurações no backend quando mudarem
  useEffect(() => {
    // Efeito removido - progressão automática removida
  }, []);

  // 🚀 EFEITO: Processar totalizado do histórico
  useEffect(() => {
    // Função removida - progressão automática removida
  }, []);

  // 🚀 NOVA: Resetar progressão automática
  const resetProgressionEffect = () => {
    // Função removida - progressão automática removida
  };

  // 🚀 REMOVIDO: Efeito de progressão automática não aplicável à nova lógica

  // 🎯 FUNÇÃO INTELIGENTE: Determina quando é seguro parar a operação
  const checkCanSafelyStop = () => {
    if (!isOperating || !operationActive) {
      setCanSafelyStop(true);
      return;
    }

    // 🛑 NOVO: Se backend enviou controle específico, usar essa informação
    if (stopButtonControl !== null) {
      setCanSafelyStop(stopButtonControl.canStop);
      return;
    }

    // ❌ Lógica fallback (caso backend não envie controle)
    // NÃO pode parar durante:
    // - Aguardando resultado de aposta
    // - No meio de sequência martingale
    // - Janela de apostas aberta + bot vai apostar
    if (operationState?.waitingForResult || 
        (operationState && operationState.martingaleLevel > 0) ||
        (bettingWindow?.isOpen && operationActive)) {
      setCanSafelyStop(false);
      return;
    }

    // ✅ Seguro para parar - momento entre operações
    setCanSafelyStop(true);
  };

  // 🔄 Executar verificação sempre que estados mudarem
  useEffect(() => {
    checkCanSafelyStop();
  }, [isOperating, operationActive, operationState, bettingWindow, stopButtonControl]);

  // 🔄 NOVO: Função para resetar configurações de segurança
  const resetSafetySettings = () => {
    // Estados de status seguro e frequência removidos - apenas M4 direto
    // 🔥 MODO M4 DIRETO: sempre habilitado nativamente
    setM4DirectBetType('await'); // 🔥 NOVO: Resetar tipo de aposta para aguardar
    setRealModeActivationAttempted(false);
    // 🔄 NOVO: Limpar também mensagens de erro/sucesso
    setOperationError(null);
    setOperationSuccess(null);
    // 🚀 NOVA: Resetar progressão automática - função removida
    console.log('🔄 Configurações resetadas - Bot funcionará em modo aguardar');
  };

  // 🔄 NOVO: Resetar configurações de segurança na inicialização
  useEffect(() => {
    resetSafetySettings();
  }, []);

  // 🚀 NOVA: Verificar reativação da progressão quando limite máximo muda
  useEffect(() => {
    // Função removida - progressão automática removida
  }, []);

  // ✅ NOVO: Verificar estado quando conexão mudar
  useEffect(() => {
    // Se desconectado e ainda operando, forçar parada
    if (!connectionStatus.connected && isOperating) {
      setIsOperating(false);
      setOperationActive(false);
    }
  }, [connectionStatus.connected, isOperating]);

  useEffect(() => {
    checkUser();
    checkBlazeConfiguration();
    loadHistoryRecords();
    loadFullHistoryRecords();
  }, []);

  // 🔄 NOVO: Atualizar timestamp quando fullHistoryRecords mudarem (similar ao GameStatisticsCard)
  useEffect(() => {
    if (fullHistoryRecords.length > 0) {
      setLastHistoryUpdate(new Date());
    }
  }, [fullHistoryRecords]);

  // 🛑 POLLING DESATIVADO: Dados atualizados apenas via insights polling
  // useEffect(() => {
  //   if (historyRecords.length > 0) {
  //     const updateInterval = setInterval(() => {
  //       loadFullHistoryRecords();
  //     }, 30000);
  //     return () => clearInterval(updateInterval);
  //   }
  // }, [historyRecords]);

  // 🤖 REMOVIDO: Monitoramento de limiares não é mais necessário - agora é em tempo real via WebSocket

  // �� REMOVIDO: Verificações complexas não são mais necessárias

  // 🎯 REMOVIDO: Verificação imediata não é mais necessária

  // Função para buscar dados históricos do Supabase
  const loadHistoryRecords = async () => {
    try {
      const { data, error } = await supabase
        .from('history-megaroulettebr')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(5000); // Limite alto para análise

      if (error) {
        return;
      }

      setHistoryRecords(data || []);
    } catch (error) {
    }
  };

  // 📊 NOVO: Carregar ~7000 registros das últimas 72h para análise comparativa
  const loadFullHistoryRecords = async () => {
    try {
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      
      let allRecords: any[] = [];
      let offset = 0;
      const limit = 1000;
      const targetRecords = 7000;
      let hasMore = true;
      
      while (hasMore && allRecords.length < targetRecords) {
        const { data, error } = await supabase
          .from('history-megaroulettebr')
          .select('id, game_id, number, color, game_result, timestamp, created_at')
          .gte('timestamp', seventyTwoHoursAgo)
          .order('timestamp', { ascending: false })
          .range(offset, offset + limit - 1);
        
        if (error) {
          break;
        }
        
        const recordsReceived = data?.length || 0;
        
        if (recordsReceived > 0) {
          allRecords = [...allRecords, ...data];
          offset += limit;
          hasMore = recordsReceived === limit;
        } else {
          hasMore = false;
        }
      }
      
      // Filtrar duplicatas
      const uniqueRecords = allRecords.filter((record, index, arr) => 
        arr.findIndex(r => r.id === record.id) === index
      );
      
      setFullHistoryRecords(uniqueRecords);
      
    } catch (error) {
      console.error('❌ Erro ao carregar histórico das últimas 72h:', error);
    }
  };

  // 🔥 NOVO: Funções para o sistema de insights local
  const startInsightsCollection = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      setInsightsLoading(true);
      setInsightsError(null);

      const response = await fetchWithCacheBusting('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr/insights', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: user.id,
          action: 'start'
        })
      });

      const result = await response.json();

      if (result.success) {
        setIsInsightsActive(true);
        startInsightsPolling();
      } else {
        setInsightsError(result.error || 'Erro ao iniciar coleta');
      }
    } catch (error) {
      setInsightsError('Erro de conexão');
    } finally {
      setInsightsLoading(false);
    }
  };

  const stopInsightsCollection = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      setInsightsLoading(true);

      const response = await fetchWithCacheBusting('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr/insights', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: user.id,
          action: 'stop'
        })
      });

      const result = await response.json();

      if (result.success) {
        setIsInsightsActive(false);
        stopInsightsPolling();
        setInsightsData(null);
      } else {
        setInsightsError(result.error || 'Erro ao parar coleta');
      }
    } catch (error) {
      setInsightsError('Erro de conexão');
    } finally {
      setInsightsLoading(false);
    }
  };

  const startInsightsPolling = () => {
    // Limpar polling anterior se existir
    if (insightsPollingRef.current) {
      clearInterval(insightsPollingRef.current);
    }

    // Fazer primeira requisição imediatamente
    pollInsightsData();

    // 🔇 POLLING ULTRA-SILENCIOSO: Só dispara quando há mudanças REAIS
    // 🎯 POLLING OTIMIZADO: Menos frequente para reduzir "piscar" dos dados
    insightsPollingRef.current = setInterval(pollInsightsData, 8000); // 8s balanceado
  };

  const stopInsightsPolling = () => {
    if (insightsPollingRef.current) {
      clearInterval(insightsPollingRef.current);
      insightsPollingRef.current = null;
    }
  };

  // 🔇 POLLING ULTRA-SILENCIOSO: Zero logs, só dispara quando há mudanças REAIS
  const pollInsightsData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const response = await fetchWithCacheBusting('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr/insights', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: user.id,
          action: 'get'
        })
      });

      const result = await response.json();
      
      // 🔇 SILENCIOSO TOTAL: Ignorar TODOS os erros sem logs
      if (!result.success) return;

      if (result.success && result.data) {
        // 🚀 HASH ULTRA-RÁPIDO: Apenas gameId do primeiro resultado
        const latestGameId = result.data.results[0]?.gameId || '';
        
        // ✅ COMPARAÇÃO INSTANTÂNEA: Só gameId mais recente
        if (latestGameId !== lastKnownGameId && latestGameId !== '') {
          
          // 🎯 ATUALIZAÇÃO BATCHED: Processar e atualizar de uma vez
        const formattedData = result.data.results.map((item: any) => ({
          id: item.id,
          game_id: item.gameId,
          number: item.number,
          color: item.color,
          game_result: item.gameResult,
          timestamp: new Date(item.timestamp).toISOString(),
          created_at: new Date(item.timestamp).toISOString()
        }));
        
        const sortedData = formattedData.sort((a: any, b: any) => {
          return parseInt(b.game_id) - parseInt(a.game_id);
        });
        
          // 🔇 ATUALIZAÇÃO INTELIGENTE: Sem dupla verificação desnecessária
          setInsightsData({
            results: sortedData,
            totalResults: result.data.totalResults || sortedData.length,
            lastUpdate: Date.now(),
            isActive: result.data.isActive || true,
            isOnline: result.data.isOnline || true,
            lastGameId: latestGameId
          });
          
          setLastKnownGameId(latestGameId);
          setInsightsError(null);
          
          // 🎯 SISTEMA AUTOMÁTICO: O backend já processa automaticamente quando gameId corresponde
          // Não há necessidade de processamento manual no frontend
        }
        // ✅ DADOS IGUAIS: Retorno silencioso absoluto, zero re-renders
      }
    } catch (error) {
      // 🔇 SILENCIOSO TOTAL: Zero logs, zero console
    }
  };

  // 📊 NOVA FUNÇÃO: Calcular sequências para todos os tipos de aposta
  const calculateSequences = (dataRecords: any[]) => {
    // ✅ CORREÇÃO: Não ordenar os dados aqui - manter ordem original da API
    // A API Pragmatic já entrega ordenada (gameId decrescente = mais recente primeiro)
    const sortedRecords = dataRecords; // Usar dados na ordem original
    
    // ✅ Debug: Verificar se dados estão na ordem correta aqui
    
    let redSequenceCount = 0;
    let blackSequenceCount = 0;
    let evenSequenceCount = 0;
    let oddSequenceCount = 0;
    let lowSequenceCount = 0;
    let highSequenceCount = 0;
    
    let currentRedSequence = 0;
    let currentBlackSequence = 0;
    let currentEvenSequence = 0;
    let currentOddSequence = 0;
    let currentLowSequence = 0;
    let currentHighSequence = 0;
    
    sortedRecords.forEach(record => {
      const number = record.number;
      const isRed = record.color === 'red' || record.color === 'R';
      const isBlack = record.color === 'black' || record.color === 'B';
      const isEven = number % 2 === 0;
      const isOdd = number % 2 === 1;
      const isLow = number >= 1 && number <= 18;
      const isHigh = number >= 19 && number <= 36;
      
      // Verificar se é verde (reseta tudo)
      if (number === 0) {
        // Finalizar sequências se >= 2
        if (currentRedSequence >= 2) redSequenceCount++;
        if (currentBlackSequence >= 2) blackSequenceCount++;
        if (currentEvenSequence >= 2) evenSequenceCount++;
        if (currentOddSequence >= 2) oddSequenceCount++;
        if (currentLowSequence >= 2) lowSequenceCount++;
        if (currentHighSequence >= 2) highSequenceCount++;
        
        // Resetar tudo
        currentRedSequence = 0;
        currentBlackSequence = 0;
        currentEvenSequence = 0;
        currentOddSequence = 0;
        currentLowSequence = 0;
        currentHighSequence = 0;
        return;
      }
      
      // Cores - Red/Black
      if (isRed) {
        currentRedSequence++;
        if (currentBlackSequence >= 2) blackSequenceCount++;
        currentBlackSequence = 0;
      } else if (isBlack) {
        currentBlackSequence++;
        if (currentRedSequence >= 2) redSequenceCount++;
        currentRedSequence = 0;
      }
      
      // Paridade - Even/Odd
      if (isEven) {
        currentEvenSequence++;
        if (currentOddSequence >= 2) oddSequenceCount++;
        currentOddSequence = 0;
      } else if (isOdd) {
        currentOddSequence++;
        if (currentEvenSequence >= 2) evenSequenceCount++;
        currentEvenSequence = 0;
      }
      
      // Intervalos - Low/High
      if (isLow) {
        currentLowSequence++;
        if (currentHighSequence >= 2) highSequenceCount++;
        currentHighSequence = 0;
      } else if (isHigh) {
        currentHighSequence++;
        if (currentLowSequence >= 2) lowSequenceCount++;
        currentLowSequence = 0;
      }
    });
    
    // Verificar últimas sequências
    if (currentRedSequence >= 2) redSequenceCount++;
    if (currentBlackSequence >= 2) blackSequenceCount++;
    if (currentEvenSequence >= 2) evenSequenceCount++;
    if (currentOddSequence >= 2) oddSequenceCount++;
    if (currentLowSequence >= 2) lowSequenceCount++;
    if (currentHighSequence >= 2) highSequenceCount++;
    
    return {
      redSequenceCount,
      blackSequenceCount,
      evenSequenceCount,
      oddSequenceCount,
      lowSequenceCount,
      highSequenceCount,
      totalRounds: sortedRecords.length,
      redFrequency: redSequenceCount > 0 ? Math.round(sortedRecords.length / redSequenceCount) : 0,
      blackFrequency: blackSequenceCount > 0 ? Math.round(sortedRecords.length / blackSequenceCount) : 0,
      evenFrequency: evenSequenceCount > 0 ? Math.round(sortedRecords.length / evenSequenceCount) : 0,
      oddFrequency: oddSequenceCount > 0 ? Math.round(sortedRecords.length / oddSequenceCount) : 0,
      lowFrequency: lowSequenceCount > 0 ? Math.round(sortedRecords.length / lowSequenceCount) : 0,
      highFrequency: highSequenceCount > 0 ? Math.round(sortedRecords.length / highSequenceCount) : 0,
    };
  };

  // 📊 NOVA FUNÇÃO: Calcular comparativo dos últimos 4 períodos
  const calculateYesterdayComparison = () => {
    const now = new Date();
    
    // Período da última 1 hora (agora - 1h até agora)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const todayStart = oneHourAgo;
    const todayEnd = now;
    
    // Mesmo período de 1h há 24 horas atrás
    const yesterdayStart = new Date(oneHourAgo.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Mesmo período de 1h há 48 horas atrás
    const dayBeforeYesterdayStart = new Date(oneHourAgo.getTime() - 48 * 60 * 60 * 1000);
    const dayBeforeYesterdayEnd = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    
    // Buscar registros dos períodos
    const yesterdayRecords = fullHistoryRecords.filter((record: any) => {
      const recordTime = new Date(record.timestamp);
      return recordTime >= yesterdayStart && recordTime <= yesterdayEnd;
    });
    
    const dayBeforeYesterdayRecords = fullHistoryRecords.filter((record: any) => {
      const recordTime = new Date(record.timestamp);
      return recordTime >= dayBeforeYesterdayStart && recordTime <= dayBeforeYesterdayEnd;
    });
    
    const todayRecords = fullHistoryRecords.filter((record: any) => {
      const recordTime = new Date(record.timestamp);
      return recordTime >= todayStart && recordTime <= todayEnd;
    });
    
    // Calcular rodadas desde a última sequência
    const calculateRoundsSinceLastSequence = () => {
      const findLastSequence = (type: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high') => {
        // ✅ CORREÇÃO: Ordenar apenas para análise histórica (não afeta dados principais)
        const sortedRecords = [...fullHistoryRecords].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        let currentSequence = 0;
        let sequenceStartPosition = -1;
        
        for (let i = 0; i < sortedRecords.length; i++) {
          const record = sortedRecords[i];
          const number = record.number;
          
          let matches = false;
          if (type === 'red') {
            matches = record.color === 'red' || record.color === 'R';
          } else if (type === 'black') {
            matches = record.color === 'black' || record.color === 'B';
          } else if (type === 'even') {
            matches = number % 2 === 0 && number !== 0;
          } else if (type === 'odd') {
            matches = number % 2 === 1 && number !== 0;
          } else if (type === 'low') {
            matches = number >= 1 && number <= 18;
          } else if (type === 'high') {
            matches = number >= 19 && number <= 36;
          }
          
          if (matches) {
            if (currentSequence === 0) {
              sequenceStartPosition = i;
            }
            currentSequence++;
          } else {
            if (currentSequence >= 4) {
              return sequenceStartPosition;
            }
            currentSequence = 0;
            sequenceStartPosition = -1;
          }
        }
        
        if (currentSequence >= 4 && sequenceStartPosition === 0) {
          return 0;
        }
        
        return sequenceStartPosition >= 0 ? sequenceStartPosition : -1;
      };

      return {
        red: findLastSequence('red') >= 0 ? `${findLastSequence('red')}r` : '--',
        black: findLastSequence('black') >= 0 ? `${findLastSequence('black')}r` : '--',
        even: findLastSequence('even') >= 0 ? `${findLastSequence('even')}r` : '--',
        odd: findLastSequence('odd') >= 0 ? `${findLastSequence('odd')}r` : '--',
        low: findLastSequence('low') >= 0 ? `${findLastSequence('low')}r` : '--',
        high: findLastSequence('high') >= 0 ? `${findLastSequence('high')}r` : '--',
      };
    };

    const roundsSinceLastSequence = calculateRoundsSinceLastSequence();
    
    const hasMinimumData = yesterdayRecords.length > 0 || dayBeforeYesterdayRecords.length > 0 || todayRecords.length > 0;
    
    if (!hasMinimumData) {
      return {
        currentTime: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
        hasData: false,
        redFrequency: 0,
        blackFrequency: 0,
        evenFrequency: 0,
        oddFrequency: 0,
        lowFrequency: 0,
        highFrequency: 0,
        redComparison: 0,
        blackComparison: 0,
        totalRounds: 0,
        redSequenceCount: 0,
        blackSequenceCount: 0,
        evenSequenceCount: 0,
        oddSequenceCount: 0,
        lowSequenceCount: 0,
        highSequenceCount: 0,
        todayFrequency: { red: 0, black: 0, even: 0, odd: 0, low: 0, high: 0 },
        todayRounds: todayRecords.length,
        todaySequences: { red: 0, black: 0, even: 0, odd: 0, low: 0, high: 0 },
        dayBeforeYesterdayFrequency: { red: 0, black: 0, even: 0, odd: 0, low: 0, high: 0 },
        dayBeforeYesterdayRounds: 0,
        dayBeforeYesterdaySequences: { red: 0, black: 0, even: 0, odd: 0, low: 0, high: 0 },
        roundsSinceLastSequence: roundsSinceLastSequence
      };
    }
    
    const yesterdayStats = yesterdayRecords.length > 0 ? calculateSequences(yesterdayRecords) : {
      redSequenceCount: 0, blackSequenceCount: 0, evenSequenceCount: 0, oddSequenceCount: 0, lowSequenceCount: 0, highSequenceCount: 0,
      totalRounds: 0, redFrequency: 0, blackFrequency: 0, evenFrequency: 0, oddFrequency: 0, lowFrequency: 0, highFrequency: 0
    };
    
    const todayStats = todayRecords.length > 0 ? calculateSequences(todayRecords) : {
      redSequenceCount: 0, blackSequenceCount: 0, evenSequenceCount: 0, oddSequenceCount: 0, lowSequenceCount: 0, highSequenceCount: 0,
      totalRounds: 0, redFrequency: 0, blackFrequency: 0, evenFrequency: 0, oddFrequency: 0, lowFrequency: 0, highFrequency: 0
    };
    
    const dayBeforeYesterdayStats = dayBeforeYesterdayRecords.length > 0 ? calculateSequences(dayBeforeYesterdayRecords) : {
      redSequenceCount: 0, blackSequenceCount: 0, evenSequenceCount: 0, oddSequenceCount: 0, lowSequenceCount: 0, highSequenceCount: 0,
      totalRounds: 0, redFrequency: 0, blackFrequency: 0, evenFrequency: 0, oddFrequency: 0, lowFrequency: 0, highFrequency: 0
    };
    
    const idealFrequency = 35;
    const redComparison = yesterdayStats.redFrequency > 0 ? yesterdayStats.redFrequency - idealFrequency : 0;
    const blackComparison = yesterdayStats.blackFrequency > 0 ? yesterdayStats.blackFrequency - idealFrequency : 0;
    
    return {
      currentTime: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
      hasData: true,
      redFrequency: yesterdayStats.redFrequency,
      blackFrequency: yesterdayStats.blackFrequency,
      evenFrequency: yesterdayStats.evenFrequency,
      oddFrequency: yesterdayStats.oddFrequency,
      lowFrequency: yesterdayStats.lowFrequency,
      highFrequency: yesterdayStats.highFrequency,
      redComparison,
      blackComparison,
      totalRounds: yesterdayStats.totalRounds,
      redSequenceCount: yesterdayStats.redSequenceCount,
      blackSequenceCount: yesterdayStats.blackSequenceCount,
      evenSequenceCount: yesterdayStats.evenSequenceCount,
      oddSequenceCount: yesterdayStats.oddSequenceCount,
      lowSequenceCount: yesterdayStats.lowSequenceCount,
      highSequenceCount: yesterdayStats.highSequenceCount,
      todayFrequency: {
        red: todayStats.redFrequency,
        black: todayStats.blackFrequency,
        even: todayStats.evenFrequency,
        odd: todayStats.oddFrequency,
        low: todayStats.lowFrequency,
        high: todayStats.highFrequency
      },
      todayRounds: todayStats.totalRounds,
      todaySequences: {
        red: todayStats.redSequenceCount,
        black: todayStats.blackSequenceCount,
        even: todayStats.evenSequenceCount,
        odd: todayStats.oddSequenceCount,
        low: todayStats.lowSequenceCount,
        high: todayStats.highSequenceCount
      },
      dayBeforeYesterdayFrequency: {
        red: dayBeforeYesterdayStats.redFrequency,
        black: dayBeforeYesterdayStats.blackFrequency,
        even: dayBeforeYesterdayStats.evenFrequency,
        odd: dayBeforeYesterdayStats.oddFrequency,
        low: dayBeforeYesterdayStats.lowFrequency,
        high: dayBeforeYesterdayStats.highFrequency
      },
      dayBeforeYesterdayRounds: dayBeforeYesterdayStats.totalRounds,
      dayBeforeYesterdaySequences: {
        red: dayBeforeYesterdayStats.redSequenceCount,
        black: dayBeforeYesterdayStats.blackSequenceCount,
        even: dayBeforeYesterdayStats.evenSequenceCount,
        odd: dayBeforeYesterdayStats.oddSequenceCount,
        low: dayBeforeYesterdayStats.lowSequenceCount,
        high: dayBeforeYesterdayStats.highSequenceCount
      },
      roundsSinceLastSequence: roundsSinceLastSequence
    };
  };

  // 🔥 NOVA FUNÇÃO: Calcular insights usando os 500 resultados do edge function
  const calculateInsightsComparison = () => {
    if (!insightsData || !insightsData.results || !Array.isArray(insightsData.results) || insightsData.results.length === 0) {
      return {
        currentTime: `${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')}`,
        hasData: false,
        redFrequency: 0,
        blackFrequency: 0,
        evenFrequency: 0,
        oddFrequency: 0,
        lowFrequency: 0,
        highFrequency: 0,
        redComparison: 0,
        blackComparison: 0,
        totalRounds: 0,
        redSequenceCount: 0,
        blackSequenceCount: 0,
        evenSequenceCount: 0,
        oddSequenceCount: 0,
        lowSequenceCount: 0,
        highSequenceCount: 0,
        roundsSinceLastSequence: {
          red: '--',
          black: '--',
          even: '--',
          odd: '--',
          low: '--',
          high: '--'
        }
      };
    }

    // Calcular rodadas desde a última sequência usando os 500 resultados
    const calculateRoundsSinceLastSequenceFromInsights = () => {
      const findLastSequence = (type: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high') => {
        // ✅ CORREÇÃO: Não ordenar - usar ordem original da API Pragmatic
        // A API já entrega ordenada (gameId decrescente = mais recente primeiro)
        const sortedRecords = [...insightsData.results]; // Usar ordem original
        
        let currentSequence = 0;
        let sequenceStartPosition = -1;
        
        for (let i = 0; i < sortedRecords.length; i++) {
          const record = sortedRecords[i];
          const number = record.number;
          
          let matches = false;
          if (type === 'red') {
            matches = record.color === 'red' || record.color === 'R';
          } else if (type === 'black') {
            matches = record.color === 'black' || record.color === 'B';
          } else if (type === 'even') {
            matches = number % 2 === 0 && number !== 0;
          } else if (type === 'odd') {
            matches = number % 2 === 1 && number !== 0;
          } else if (type === 'low') {
            matches = number >= 1 && number <= 18;
          } else if (type === 'high') {
            matches = number >= 19 && number <= 36;
          }
          
          if (matches) {
            if (currentSequence === 0) {
              sequenceStartPosition = i;
            }
            currentSequence++;
          } else {
            if (currentSequence >= 2) {
              return sequenceStartPosition;
            }
            currentSequence = 0;
            sequenceStartPosition = -1;
          }
        }
        
        if (currentSequence >= 2 && sequenceStartPosition === 0) {
          return 0;
        }
        
        return sequenceStartPosition >= 0 ? sequenceStartPosition : -1;
      };

      return {
        red: findLastSequence('red') >= 0 ? `${findLastSequence('red')}r` : '--',
        black: findLastSequence('black') >= 0 ? `${findLastSequence('black')}r` : '--',
        even: findLastSequence('even') >= 0 ? `${findLastSequence('even')}r` : '--',
        odd: findLastSequence('odd') >= 0 ? `${findLastSequence('odd')}r` : '--',
        low: findLastSequence('low') >= 0 ? `${findLastSequence('low')}r` : '--',
        high: findLastSequence('high') >= 0 ? `${findLastSequence('high')}r` : '--',
      };
    };

    // Calcular estatísticas dos 500 resultados
    const stats = calculateSequences(insightsData.results);
    const roundsSinceLastSequence = calculateRoundsSinceLastSequenceFromInsights();

    const now = new Date();
    return {
      currentTime: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
      hasData: true,
      redFrequency: stats.redFrequency,
      blackFrequency: stats.blackFrequency,
      evenFrequency: stats.evenFrequency,
      oddFrequency: stats.oddFrequency,
      lowFrequency: stats.lowFrequency,
      highFrequency: stats.highFrequency,
      redComparison: stats.redFrequency - 35, // Comparação com frequência ideal
      blackComparison: stats.blackFrequency - 35,
      totalRounds: stats.totalRounds,
      redSequenceCount: stats.redSequenceCount,
      blackSequenceCount: stats.blackSequenceCount,
      evenSequenceCount: stats.evenSequenceCount,
      oddSequenceCount: stats.oddSequenceCount,
      lowSequenceCount: stats.lowSequenceCount,
      highSequenceCount: stats.highSequenceCount,
      roundsSinceLastSequence: roundsSinceLastSequence
    };
  };

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setUserEmail(user.email);
      userIdRef.current = user.id;
    }
  };

  // 🚀 ULTRA-OTIMIZADO: Memoização profunda com hash específico para evitar re-cálculos
  const insightsComparison = useMemo(() => {
    if (!insightsData || !insightsData.results || !Array.isArray(insightsData.results) || insightsData.results.length === 0) {
      return {
        hasData: false,
        roundsSinceLastSequence: {
          red: '--',
          black: '--',
          even: '--',
          odd: '--',
          low: '--',
          high: '--'
        }
      };
    }
    
    return calculateInsightsComparison();
  }, [
    // 🔥 DEPENDÊNCIAS ULTRA-ESPECÍFICAS: Só recalcular se essenciais mudaram
    insightsData?.results?.slice(0, 10)?.map(r => `${r.gameId}-${r.number}-${r.color}`).join('|'),
    insightsData?.lastUpdate
  ]);

  // 🔧 CORREÇÃO ANTI-PISCAR: Memorizar tooltips baseado em valores específicos, não na referência do objeto
  const tooltipContents = useMemo(() => {
    // Extrair valores específicos para evitar dependência de referência de objeto
    const redValue = insightsComparison.roundsSinceLastSequence?.red;
    const blackValue = insightsComparison.roundsSinceLastSequence?.black;
    const evenValue = insightsComparison.roundsSinceLastSequence?.even;
    const oddValue = insightsComparison.roundsSinceLastSequence?.odd;
    const lowValue = insightsComparison.roundsSinceLastSequence?.low;
    const highValue = insightsComparison.roundsSinceLastSequence?.high;
    
    return {
      red: `${(redValue || '--').toString().replace('r', '')} rodadas desde a última ocorrência`,
      black: `${(blackValue || '--').toString().replace('r', '')} rodadas desde a última ocorrência`,
      even: `${(evenValue || '--').toString().replace('r', '')} rodadas desde a última ocorrência`,
      odd: `${(oddValue || '--').toString().replace('r', '')} rodadas desde a última ocorrência`,
      low: `${(lowValue || '--').toString().replace('r', '')} rodadas desde a última ocorrência`,
      high: `${(highValue || '--').toString().replace('r', '')} rodadas desde a última ocorrência`
    };
  }, [
    // Dependências específicas por valor, não por referência de objeto
    insightsComparison.roundsSinceLastSequence?.red,
    insightsComparison.roundsSinceLastSequence?.black,
    insightsComparison.roundsSinceLastSequence?.even,
    insightsComparison.roundsSinceLastSequence?.odd,
    insightsComparison.roundsSinceLastSequence?.low,
    insightsComparison.roundsSinceLastSequence?.high
  ]);

  // ✅ CORREÇÃO DEFINITIVA: PRÉ-CALCULAR TOOLTIPS IMUTÁVEIS (ANTI-PISCAR)
  const memoizedInsightsResults = useMemo(() => {
    if (!insightsData || !insightsData.results || !Array.isArray(insightsData.results)) {
      return [];
    }
    
    return insightsData.results.slice(0, visibleResultsCount).map((result: any, index: number) => {
      const isRed = result.color === 'red' || result.color === 'R';
      const isGreen = result.color === 'green' || result.color === 'G' || result.number === 0;
      
      // 🔇 PRÉ-CALCULAR TOOLTIP FIXO: Evita recálculos desnecessários
      const characteristics = (() => {
        const number = result.number;
        const color = isRed ? 'red' : (isGreen ? 'green' : 'black');
        const characteristics = [];
        
        if (isGreen) {
          characteristics.push('verde');
        } else if (isRed) {
          characteristics.push('vermelho');
        } else {
          characteristics.push('preto');
        }
        
        if (number === 0) {
          characteristics.push('zero');
        } else {
          const isEven = number % 2 === 0;
          const isLow = number >= 1 && number <= 18;
          
          if (isEven) {
            characteristics.push('par');
          } else {
            characteristics.push('ímpar');
          }
          
          if (isLow) {
            characteristics.push('baixa (1-18)');
          } else {
            characteristics.push('alta (19-36)');
          }
        }
        
        return characteristics.join(', ');
      })();
      
      const timeFormatted = new Date(result.timestamp).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      return {
        id: `insight-${index}-${result.game_id}`,
        number: result.number,
        color: result.color,
        gameId: result.game_id,
        timestamp: result.timestamp,
        index: index,
        isRed,
        isGreen,
        // 🔇 TOOLTIP FIXO PRÉ-CALCULADO: Nunca mais recalcula!
        tooltipContent: `${timeFormatted} | ${characteristics}`
      };
    });
  }, [
    // 🔇 DEPENDÊNCIAS BALANCEADAS: Detecta novos dados mas evita re-renders desnecessários
    insightsData?.results?.length,
    insightsData?.lastUpdate,
    visibleResultsCount
  ]);

  // ✅ CORREÇÃO DEFINITIVA: PRÉ-CALCULAR TOOLTIPS IMUTÁVEIS PARA SMALL RESULTS
  const memoizedSmallResults = useMemo(() => {
    return lastTenResults.map((result: any, index: number) => {
      const isRed = result.color === 'R';
      const isGreen = result.color === 'green' || result.color === 'G' || result.number === 0;
      
      // 🔇 PRÉ-CALCULAR TOOLTIP FIXO: Evita recálculos desnecessários
      const characteristics = (() => {
        const number = result.number;
    const characteristics = [];
    
    if (isGreen) {
      characteristics.push('verde');
    } else if (isRed) {
      characteristics.push('vermelho');
        } else {
      characteristics.push('preto');
    }
    
    if (number === 0) {
      characteristics.push('zero');
    } else {
          const isEven = number % 2 === 0;
          const isLow = number >= 1 && number <= 18;
          
      if (isEven) {
        characteristics.push('par');
          } else {
        characteristics.push('ímpar');
      }
      
      if (isLow) {
        characteristics.push('baixa (1-18)');
          } else {
        characteristics.push('alta (19-36)');
      }
    }
    
    return characteristics.join(', ');
      })();

      const timeFormatted = new Date(result.timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
      
      return {
        id: `result-${index}-${result.gameId}`,
        number: result.number,
        color: result.color,
        gameId: result.gameId,
        timestamp: result.timestamp,
        index: index,
        isRed,
        isGreen,
        // 🔇 TOOLTIP FIXO PRÉ-CALCULADO: Nunca mais recalcula!
        tooltipContent: `${timeFormatted} | ${characteristics}`
      };
    });
  }, [
    // 🔇 DEPENDÊNCIAS BALANCEADAS: Detecta novos dados mas evita re-renders desnecessários
    lastTenResults.length,
    lastTenResults[0]?.gameId, // Primeiro resultado (mais recente)
    lastTenResults[0]?.timestamp // Timestamp do mais recente
  ]);

  // ✅ CORREÇÃO: Função getTemperatureStatus memorizada
  const getTemperatureStatus = useCallback((rounds: number | string) => {
    if (rounds === '--' || rounds === '') return { text: '', color: 'text-gray-400' };
    
    const numRounds = typeof rounds === 'string' ? parseInt(rounds.replace('r', '')) : rounds;
    
    if (numRounds < 5) {
      return { text: 'muito frio', color: 'text-cyan-400' };
    } else if (numRounds >= 5 && numRounds <= 9) {
      return { text: 'frio', color: 'text-cyan-400' };
    } else if (numRounds >= 10 && numRounds <= 14) {
      return { text: 'morno', color: 'text-yellow-400' };
    } else if (numRounds >= 15 && numRounds <= 24) {
      return { text: 'quente', color: 'text-orange-400' };
    } else {
      return { text: 'muito quente', color: 'text-red-400' };
    }
  }, []);

  // 🔇 FUNÇÕES REMOVIDAS: getNumberCharacteristics e formatTimestamp 
  // não são mais necessárias - tooltips são pré-calculados!

  // ✅ CORREÇÃO: Componente memorizado para cada tipo de aposta
  // Este componente resolve o problema do "piscar" durante o polling:
  // 1. React.memo previne re-renders quando props não mudaram
  // 2. Tooltip integrado evita componentes aninhados desnecessários
  // 3. Usa função getTemperatureStatus memorizada para performance
  const InsightCard = React.memo<{
    title: string;
    color: string;
    bgColor: string;
    borderColor: string;
    hoverColor: string;
    rounds: string | number;
    tooltip: string;
  }>(({ title, color, bgColor, borderColor, hoverColor, rounds, tooltip }) => {
    const [isVisible, setIsVisible] = useState(false);
    const temperatureStatus = getTemperatureStatus(rounds);
    const roundsDisplay = rounds.toString().replace('r', '');

    return (
      <div className="w-full h-full flex flex-col space-y-2">
        <div className={`text-xs font-mono ${color} font-bold text-center`}>{title}</div>
        <div className="relative inline-block">
          <div
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
            className={`w-full h-full px-3 py-4 ${bgColor} border ${borderColor} rounded-lg ${hoverColor} transition-all cursor-help flex flex-col items-center justify-center min-h-[80px]`}
          >
            <div className={`text-2xl font-bold font-mono ${temperatureStatus.color}`}>
              {roundsDisplay}
            </div>
            <div className={`text-xs font-mono uppercase ${temperatureStatus.color} mt-1`}>
              {temperatureStatus.text || 'rodadas'}
            </div>
          </div>
          {isVisible && (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
              <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg border border-gray-600 w-[150px] text-center break-words">
                {tooltip}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  });

  // 🔇 COMPONENTE ANTI-PISCAR DEFINITIVO: Tooltip completamente estático
  const ResultRouletteSlot = React.memo<{
    number: number;
    gameId: string;
    timestamp: number;
    index: number;
    isRed: boolean;
    isGreen: boolean;
    tooltipContent: string;
  }>(({ number, gameId, timestamp, index, isRed, isGreen, tooltipContent }) => {
    const [isVisible, setIsVisible] = useState(false);

    // 🔇 TOOLTIP COMPLETAMENTE ESTÁTICO: Nunca muda após renderização inicial

    return (
      <div className="relative inline-block">
        <div
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
          className={`aspect-square rounded-lg flex items-center justify-center text-sm font-bold transition-all hover:scale-105 cursor-pointer relative ${
            isRed 
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
              : isGreen
                ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
                : 'bg-gray-800 text-white border border-gray-600 shadow-lg shadow-gray-800/20'
          }`}
        >
          {number}
        </div>
        {isVisible && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
            <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg border border-gray-600 w-[160px] text-center break-words">
              {tooltipContent}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
            </div>
          </div>
        )}
      </div>
    );
  }, (prevProps, nextProps) => {
    // 🔇 COMPARAÇÃO ESPECÍFICA: Só re-renderizar se props essenciais mudaram
    return (
      prevProps.number === nextProps.number &&
      prevProps.gameId === nextProps.gameId &&
      prevProps.tooltipContent === nextProps.tooltipContent &&
      prevProps.isRed === nextProps.isRed &&
      prevProps.isGreen === nextProps.isGreen
    );
  });

  // 🔇 COMPONENTE ANTI-PISCAR DEFINITIVO: Tooltip completamente estático
  const SmallResultRouletteSlot = React.memo<{
    number: number;
    gameId: string;
    timestamp: number;
    autoBotEnabled: boolean;
    index: number;
    isRed: boolean;
    isGreen: boolean;
    tooltipContent: string;
  }>(({ number, gameId, timestamp, autoBotEnabled, index, isRed, isGreen, tooltipContent }) => {
    const [isVisible, setIsVisible] = useState(false);

    // 🔇 TOOLTIP COMPLETAMENTE ESTÁTICO: Nunca muda após renderização inicial

    return (
      <div className="relative inline-block">
        <div
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold relative cursor-pointer transition-all hover:scale-105 ${
            isRed 
              ? 'bg-red-500 text-white' 
              : isGreen
                ? 'bg-green-500 text-white'
                : 'bg-gray-800 text-white border border-gray-600'
          } ${isGreen && autoBotEnabled ? 'ring-2 ring-green-400 ring-opacity-30' : ''}`}
        >
          {number}
          {/* 🤖 NOVO: Indicador de zero (não contabilizado) */}
          {isGreen && autoBotEnabled && (
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-green-400 rounded-full opacity-70"></div>
          )}
        </div>
        {isVisible && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
            <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg border border-gray-600 w-[160px] text-center break-words">
              {tooltipContent}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
            </div>
          </div>
        )}
      </div>
    );
  }, (prevProps, nextProps) => {
    // 🔇 COMPARAÇÃO ESPECÍFICA: Só re-renderizar se props essenciais mudaram
    return (
      prevProps.number === nextProps.number &&
      prevProps.gameId === nextProps.gameId &&
      prevProps.tooltipContent === nextProps.tooltipContent &&
      prevProps.isRed === nextProps.isRed &&
      prevProps.isGreen === nextProps.isGreen &&
      prevProps.autoBotEnabled === nextProps.autoBotEnabled
    );
  });

  const checkBlazeConfiguration = async () => {
    try {
      setIsLoadingStatus(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_tokens')
        .select('*')
        .eq('user_id', user.id)
        .eq('casino_code', 'BLAZE');

      if (error) {
        return;
      }

      setUserTokens(data || []);
      setIsConfigured(data && data.length > 0 && data.some(token => 
        token.is_active && token.token && token.token.trim() !== ''
      ));
    } catch (error) {
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleOpenModal = () => {
    const blazeTokenData = userTokens.find(token => token.casino_code === 'BLAZE');
    const currentToken = blazeTokenData?.token || '';
    setBlazeToken(currentToken);
    setAlertMessage(null);
    blazeConfigModal.openModal();
  };

  const handleConfigureBlaze = async () => {
    try {
      setConfigLoading(true);
      const tokenValue = blazeToken.trim();
      
        const { data, error } = await supabase.rpc('configure_casino_token', {
          p_casino_name: 'Blaze',
          p_casino_code: 'BLAZE',
          p_token: tokenValue || '',
          p_is_active: tokenValue ? true : false
        });

      if (error) {
        throw error;
      }

          setAlertMessage({
        type: 'success',
        message: 'Token da Blaze configurado com sucesso!'
          });

      await checkBlazeConfiguration();
      
      setTimeout(() => {
          blazeConfigModal.closeModal();
          setAlertMessage(null);
      }, 2000);

    } catch (error: any) {
      setAlertMessage({
        type: 'error',
        message: `Erro ao configurar token: ${error.message}`
      });
    } finally {
      setConfigLoading(false);
    }
  };

  // 💰 NOVA FUNÇÃO: Atualizar função de início de operação para usar a sequência personalizada
  const startOperation = async (tipValue: number, forcedBetType?: 'await' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'standby') => {
    try {
    setOperationLoading(true);
    setOperationError(null);
      setOperationSuccess(null);
    
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      // 🤖 NOVO: Determinar tipo de aposta (forcedBetType tem prioridade sobre Auto Bot)
      const finalBetType = forcedBetType === 'standby' ? null : (forcedBetType || m4DirectBetType);
      const isStandbyMode = forcedBetType === 'standby';
      
      // 🤖 REMOVIDO: Lógica de monitoramento de oportunidades não é mais necessária - usa foto inicial e tempo real

      // 🔄 Resetar gráficos para nova sessão
      await resetAllGraphs();

      // 🔥 NOVO: Resetar flag de tentativa de ativação do modo real
      setRealModeActivationAttempted(false);

      // ✅ LOG: Confirmar tipo de aposta que será usado
      
      // 🤖 REMOVIDO: Log de oportunidades não é mais necessário - usa contadores em tempo real

      // ✅ ETAPA 1: Buscar token da Blaze
      const tokenResponse = await fetch('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
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
      
      // ✅ ETAPA 2: Gerar tokens via Supabase Edge Function (evita erro 451)
      const realBrowserHeaders = {
        'sec-ch-ua': (navigator as any).userAgentData?.brands?.map((brand: any) => 
          `"${brand.brand}";v="${brand.version}"`).join(', ') || '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': (navigator as any).userAgentData?.mobile ? '?1' : '?0',
        'sec-ch-ua-platform': `"${(navigator as any).userAgentData?.platform || 'Windows'}"`,
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'X-Requested-With': 'XMLHttpRequest'
      };

      const authResponse = await fetch('https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd2Vra3FoY2lwdmdodnF2dnR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDkwNTcsImV4cCI6MjA2Mzk4NTA1N30.s9atBox8lrUba0Cb5qnH_dHTVJQkvwupoS2L6VneXHA'
        },
        body: JSON.stringify({
          action: 'generate-tokens',
          blazeToken: tokenData.token,
          userAgent: navigator.userAgent,
          acceptLanguage: navigator.language,
          selectedCurrencyType: 'BRL',
          realBrowserHeaders: realBrowserHeaders
        })
      });

              if (!authResponse.ok) {
          const errorText = await authResponse.text();
          // 🔧 Simplificar erro de saldo insuficiente
          if (authResponse.status === 422 && errorText.includes('You currently do not have any balance')) {
            throw new Error('saldo insuficiente para ativar o bot');
          }
          throw new Error(`Erro na Edge Function: ${authResponse.status} - ${errorText}`);
        }

      const authResult = await authResponse.json();
      
      if (!authResult.success || !authResult.data) {
        throw new Error(authResult.error || 'Falha na geração de tokens via Edge Function');
      }

      // Preparar dados de autenticação
      const authData = authResult.data;
      setAuthTokens(authData);
      
      // ✅ Debug: Mostrar que os tokens foram atualizados
      
      // ✅ ETAPA 3: Conectar usando tokens gerados via Edge Function
      const connectResponse = await fetchWithCacheBusting('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          action: 'bet-connect',
          tipValue: tipValue,
          // 💰 ENVIAR SEQUÊNCIA PERSONALIZADA
          customMartingaleSequence: martingaleSequence,
          stakeBased: true, // Flag para identificar que é baseado em stake
          // ✅ Usar tokens gerados no client-side
          authTokens: {
            ppToken: authData.ppToken,
            jsessionId: authData.jsessionId,
            pragmaticUserId: authData.pragmaticUserId
          },
          // ✅ Enviar dados do usuário para repasse à Pragmatic
          userFingerprint: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: (navigator as any).userAgentData?.platform || navigator.platform,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screenResolution: `${screen.width}x${screen.height}`,
            colorDepth: screen.colorDepth,
            pixelRatio: window.devicePixelRatio,
            hardwareConcurrency: navigator.hardwareConcurrency,
            connectionType: (navigator as any).connection?.effectiveType
          },
          // Removed: stopGainPercentage
          // 🔥 NOVO: Enviar configuração do modo M4 direto
          m4DirectModeEnabled: m4DirectModeEnabled,
          // 🔥 CORREÇÃO: Não enviar tipo de aposta em modo standby
          m4DirectBetType: isStandbyMode ? null : finalBetType,
          // 🤖 NOVO: Enviar flag de modo standby
          isStandbyMode: isStandbyMode
        }),
      });

      const connectResult = await connectResponse.json();

      if (!connectResult.success) {
        throw new Error(connectResult.error || 'Erro ao conectar');
      }

      // ✅ ETAPA 1.5: Enviar multiplicador após conexão estabelecida
      await updateStakeMultiplier(stakeMultiplier);
      
      // ✅ ETAPA 1.6: Aguardar um pouco para garantir que foi salvo
      await new Promise(resolve => setTimeout(resolve, 100));

      // ✅ ETAPA 2: Iniciar operação (start-operation)
      const operationResponse = await fetchWithCacheBusting('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          action: 'start-operation'
        }),
      });

      const operationResult = await operationResponse.json();

      if (!operationResult.success) {
        throw new Error(operationResult.error || 'Erro ao iniciar operação');
      }
      
      setIsOperating(true);

      // Começar monitoramento
      monitoringRef.current = true;
      setTimeout(() => {
      startMonitoring();
      }, 1000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setOperationError(errorMessage);
    } finally {
      setOperationLoading(false);
    }
  };

  // 💰 FUNÇÃO REMOVIDA: Modal de estratégia não é mais necessário
  // const handleStrategyConfirm = async (tipValue: number) => {
  //   // Função removida pois agora usamos diretamente o card de banca
  // };

  // 💰 NOVA FUNÇÃO: Atualizar função de operar
  const handleOperate = async () => {
    if (isOperating || forceOperatingDisplay) {
      // Parar operação
      try {
        setOperationLoading(true);
        setOperationError(null);
        setOperationSuccess(null);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Usuário não autenticado');
        }
        
        const response = await fetchWithCacheBusting('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.id,
            action: 'stop-operation'
          }),
        });
                
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Erro ao parar operação');
        }

        setOperationSuccess('Operação interrompida com sucesso!');
        setIsOperating(false);
        setForceOperatingDisplay(false); // ✅ NOVO: Liberar exibição forçada
        setOperationActive(false);
        setOperationState(null);
        // Estado de aguardo removido - modo M4 direto
        setRealModeActivationAttempted(false); // 🔥 NOVO: Resetar flag de tentativa de ativação
        // Estados pendentes removidos
        monitoringRef.current = false;
        
        // Removed: Stop gain reset
          
        // ✅ CORREÇÃO: Forçar atualização imediata do estado
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        setOperationError(errorMessage);
        // Em caso de erro, também liberar a exibição forçada
        setForceOperatingDisplay(false);
        // Removed: Stop gain error reset
      } finally {
        setOperationLoading(false);
      }
    } else {
      // Iniciar operação
      if (martingaleSequence.length === 0 || getCurrentStake() < 0.50) {
        setOperationError('Configure sua stake (mínimo R$ 0,50) primeiro');
        return;
      }

      // Removed: Auto Bot logic

      // ✅ CORREÇÃO: Sempre conectar no modo M4 direto
      // Verificações de status removidas - modo M4 direto apenas
        setOperationError(null);
      setOperationSuccess(null);

      // ✅ NOVO: Limpar logs do WebSocket para evitar confusão com dados antigos
      setWebsocketLogs([]);
      setLastTenResults([]);

      // ✅ NOVO: Imediatamente forçar exibição como operando
      setForceOperatingDisplay(true);
      
      // 🔄 NOVO: Atualizar dados históricos antes de iniciar a operação
      try {
        await loadFullHistoryRecords();
      } catch (error) {
        console.error('Erro ao atualizar dados históricos:', error);
      }
      
      // ✅ NOVO: Timeout de 10 segundos antes de permitir sincronização
      setTimeout(() => {
        setForceOperatingDisplay(false);
      }, 10000);

      // Usar o primeiro valor da sequência como tipValue e iniciar direto
      const tipValue = martingaleSequence[0];
      await startOperation(tipValue);
    }
  };

  // Iniciar monitoramento dos logs
  const startMonitoring = async () => {
    // 🛑 CONTADOR REMOVIDO: Polling histórico não é mais necessário
    
    while (monitoringRef.current) {
    try {
      // 🚀 OTIMIZADO: Agora o backend inclui operation report no get-websocket-logs
      const response = await fetchWithCacheBusting('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
            action: 'get-websocket-logs'
        })
      });

      const result = await response.json();

      // ✅ Atualizar todos os dados de uma vez
        if (result.success && result.data) {
          const currentLogsCount = result.data.logs?.length || 0;
          const previousLogsCount = websocketLogs.length;
          
          // 🎯 ATUALIZAÇÃO INTELIGENTE: Só atualizar se realmente houver mudanças
          if (currentLogsCount !== previousLogsCount) {
            setWebsocketLogs(result.data.logs || []);
          }
          
          // 🔇 ATUALIZAÇÃO SILENCIOSA: Só atualizar lastTenResults se houver mudanças
          const newLastTenResults = result.data.lastTenResults || [];
          const lastTenResultsHash = newLastTenResults.map((r: any) => r.gameId).join(',');
          const currentLastTenHash = lastTenResults.map((r: any) => r.gameId).join(',');
          
          if (lastTenResultsHash !== currentLastTenHash) {
            setLastTenResults(newLastTenResults);
          }
          
          // 🎯 ATUALIZAÇÃO CONDICIONAL: Só atualizar se realmente mudou
          const newConnectionStatus = result.data.connectionStatus || { connected: false, lastUpdate: Date.now() };
          const newOperationActive = result.data.operationActive || false;
          const newOperationState = result.data.operationState || null;
          
          if (newConnectionStatus.connected !== connectionStatus.connected) {
            setConnectionStatus(newConnectionStatus);
          }
          
          if (newOperationActive !== operationActive) {
            setOperationActive(newOperationActive);
          }
          
          if (JSON.stringify(newOperationState) !== JSON.stringify(operationState)) {
            setOperationState(newOperationState);
          }
          
          // ✅ CORREÇÃO: Sincronizar isOperating com operationActive da API
          const apiOperationActive = result.data.operationActive || false;
          const apiConnected = result.data.connectionStatus?.connected || false;
          
          // 🔄 Sincronizar estado da operação - APENAS SE NÃO ESTIVER FORÇANDO EXIBIÇÃO
          if (!forceOperatingDisplay && isOperating !== apiOperationActive) {
            setIsOperating(apiOperationActive);
            
            // Removed: Auto Bot counter reset
          }
          
          // 🔄 Se desconectado, garantir que isOperating seja false - APENAS SE NÃO ESTIVER FORÇANDO EXIBIÇÃO
          if (!forceOperatingDisplay && !apiConnected && isOperating) {
            setIsOperating(false);
          }
          
          // Verificações de stake pendente removidas - agora é aplicado diretamente
          // NOVO: Capturar estado da janela de apostas
          setBettingWindow(result.data.bettingWindow || { isOpen: false });
          // 📊 NOVO: Atualizar estatísticas de martingale da API
          if (result.data.martingaleUsage) {
            setMartingaleUsage(result.data.martingaleUsage);
          }
          // 📊 NOVO: Atualizar estatísticas de rodadas analisadas da API
          if (result.data.analysisRounds) {
            setAnalysisRounds(result.data.analysisRounds);
          }
          // 📈 NOVO: Processar resultados das apostas para o gráfico - função removida
          // processBetResults removida com progressão automática
          

          
          // 🛑 NOVO: Capturar controle do botão "parar" baseado no modo
          if (result.data.operationState?.stopButtonControl) {
            setStopButtonControl(result.data.operationState.stopButtonControl);
          }
          
          // 🚀 NOVO: Atualizar operation report em tempo real (incluído na resposta)
          if (result.data.operationReport) {
            setOperationReport(result.data.operationReport);
          }
          
                  // Verificações de stake pendente removidas - agora aplicado diretamente
        }

    } catch (error) {
      }

      // 🛑 POLLING HISTÓRICO REMOVIDO: Dados vêm apenas do insights

      // 🎯 POLLING INTELIGENTE: Mais rápido quando operando, mais lento quando inativo
      const pollingInterval = isOperating ? 2000 : 5000; // 2s quando operando, 5s quando inativo
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
    
  };

  // Buscar relatório
  const fetchOperationReport = async () => {
    try {
      const response = await fetch('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'get-operation-report'
        })
      });

      const result = await response.json();

      if (result.success && result.data) {
        setOperationReport(result.data);
      }

    } catch (error) {
    }
  };

  // Reset relatório
  const resetOperationReport = async () => {
    try {
      const response = await fetch('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'reset-operation-report'
        })
      });

      const result = await response.json();

      if (result.success) {
        await fetchOperationReport();
      }

    } catch (error) {
    }
  };

  // 2. Função para atualizar o backend sempre que o switch mudar
  useEffect(() => {
    if (!userIdRef.current) return;
          fetch('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userIdRef.current,
        action: 'update-strategy',
                    // Removed: stopGainPercentage
        selectedStake: getCurrentStake() // <-- Enviar o stake selecionado
      })
    });
        }, []);

  // 🔥 NOVO: Atualizar tipo de aposta dinamicamente durante operação
  const previousBetTypeRef = useRef<string | null>(null);
  
  useEffect(() => {
    // 🔧 CORREÇÃO: Verificar se está realmente operando e conectado
    if (!userIdRef.current || !isOperating || !connectionStatus.connected) return;
    
    // Evitar chamadas desnecessárias - só executar se o tipo de aposta realmente mudou
    if (previousBetTypeRef.current === m4DirectBetType) return;
    
    previousBetTypeRef.current = m4DirectBetType;

    const updateBetType = async () => {
      try {
        const response = await fetch('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userIdRef.current,
            action: 'update-bet-type',
            m4DirectBetType: m4DirectBetType === 'await' ? 'await' : m4DirectBetType
          })
        });

        const result = await response.json();
        if (result.success) {
          console.log('Tipo de aposta atualizado:', result.message);
        }
      } catch (error) {
        console.error('Erro ao atualizar tipo de aposta:', error);
      }
    };

    updateBetType();
  }, [m4DirectBetType, isOperating, connectionStatus.connected]);


  useEffect(() => {
    if (userIdRef.current && isOperating) {
      // 🚀 REMOVIDO: fetchOperationReport individual - agora é feito no startMonitoring a cada 2s
      // fetchOperationReport();
      // const interval = setInterval(fetchOperationReport, 10000); // A cada 10 segundos
      // return () => clearInterval(interval);
    }
  }, [isOperating]);



  useEffect(() => {
    return () => {
        monitoringRef.current = false;
      operationRef.current = false;
    };
  }, []);

  // 🛡️ NOVO: Monitoramento automático para ativar modo real quando condições melhorarem
  useEffect(() => {
    // Só executar se bot estiver operando e em modo análise
    if (!isOperating || !operationState || operationState.mode !== 'analysis') {
      // Resetar flag quando sair do modo análise
      if (realModeActivationAttempted) {
        setRealModeActivationAttempted(false);
      }
      return;
    }

    // Throttling: só verificar a cada 5 segundos para evitar execuções excessivas
    const now = Date.now();
    if (now - lastActivationCheckRef.current < 5000) {
      return;
    }
    lastActivationCheckRef.current = now;

    // Se já tentou ativar modo real nesta sessão, não tentar novamente
    if (realModeActivationAttempted) {
      return;
    }

    // 🔥 NOVO: Se modo M4 direto está ativado, ignora todas as verificações
    if (m4DirectModeEnabled && !realModeActivationAttempted) {
      // Marcar que tentou ativar para evitar tentativas repetidas
      setRealModeActivationAttempted(true);
      
      // Estado de aguardo removido - modo M4 direto
      
      // Enviar comando para API ativar modo real imediatamente
      const activateRealMode = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          
          const response = await fetch('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              action: 'activate-real-mode',
              m4DirectMode: true,
              m4DirectBetType: m4DirectBetType // 🔥 NOVO: Enviar tipo de aposta
            })
          });
          
          const result = await response.json();
          
          if (!result.success) {
            console.error('Erro ao ativar modo real:', result.error);
            setOperationError('Erro ao ativar modo real automaticamente. Tente novamente.');
          }
        } catch (error) {
          console.error('Erro ao ativar modo real:', error);
          setOperationError('Erro ao ativar modo real automaticamente. Tente novamente.');
        }
      };
      
      activateRealMode();
      return; // Sair do useEffect após ativar modo M4 direto
    }

    // Verificações de status e frequência removidas - modo M4 direto apenas
  }, [isOperating, operationState, realModeActivationAttempted, m4DirectModeEnabled]);

  // Removed: Auto Bot effects

  // 🔧 NOVO: Efeito para detectar mudanças no estado de "aguardando resultado"
  useEffect(() => {
    const currentWaitingState = operationState?.waitingForResult || false;
    
    // Se estava aguardando resultado e agora não está mais
    if (previousWaitingState && !currentWaitingState && lastDebugAction) {
      setOperationSuccess('✅ Problema resolvido! O sistema saiu do estado "aguardando resultado" e continuou funcionando normalmente');
      setLastDebugAction(null);
      setTimeout(() => {
        setOperationSuccess(null);
      }, 8000);
    }
    
    // Se o estado continuar aguardando por mais de 1 minuto, mostrar debug novamente
    if (currentWaitingState && debugHidden) {
      setTimeout(() => {
        if (operationState?.waitingForResult) {
          setDebugHidden(false); // Mostrar debug novamente após 1 minuto
        }
      }, 60000);
    }
    
    setPreviousWaitingState(currentWaitingState);
  }, [operationState?.waitingForResult, previousWaitingState, lastDebugAction, debugHidden]);

  // 🔧 NOVO: Limpar estado de debug quando operação termina
  useEffect(() => {
    if (!isOperating && !forceOperatingDisplay) {
      setLastDebugAction(null);
      setDebugRunning(false);
      setSyncRunning(false);
      setPreviousWaitingState(false);
      setDebugHidden(false); // Resetar também o estado de oculto
      setLastProcessedInsightGameId(null); // Limpar histórico de processamento
      previousBetTypeRef.current = null; // Resetar referência do tipo de aposta
    }
  }, [isOperating, forceOperatingDisplay]);

  // NOVO: Controle inteligente do botão baseado no padrão E janela de apostas
      const hasCompletePattern = lastTenResults.length >= 10;
  const canStartOperation = hasCompletePattern && bettingWindow.isOpen && !operationActive;
  
  // IMPORTANTE: Verificar se é padrão de repetição válido
  const isValidRepetitionPattern = lastTenResults.length >= 10 &&
    lastTenResults[5]?.color === lastTenResults[0]?.color &&
    lastTenResults[6]?.color === lastTenResults[1]?.color;
  
  // Função para inverter cores (adaptada ao formato R/B do backend)
  const invertColor = (color: string): string => {
    if (color === 'R' || color === 'red') return 'B';
    if (color === 'B' || color === 'black') return 'R';
    return color; // green/G permanece inalterado
  };

  // 🤖 REMOVIDO: Função monitorOpportunities não é mais necessária - usando contadores em tempo real

  // Removed: Auto Bot snapshot function

  // Removed: Auto Bot counter update function



  // 🚀 REMOVIDO: Função startAutoBotOperations não é mais necessária - usamos handleOperate() diretamente




         
         // 🤖 REMOVIDO: Auto Bot não procura oportunidades automaticamente
  // As oportunidades são detectadas em tempo real quando contadores são atualizados

  // ... existing code ...

  // 🎯 SISTEMA AUTOMÁTICO: Processamento baseado em gameId
  // A lógica de validação vitória/derrota é automática no backend
  // Quando gameId da API de insights corresponde à aposta, o resultado é processado automaticamente

  // 🎯 SISTEMA SIMPLIFICADO: Processamento automático no backend
  // Não há mais necessidade de funções de debug manuais
  // O sistema automaticamente compara gameId e processa resultados

  // Padrão base para apostas (primeiros 5 resultados - CORES HISTÓRICAS)
  const basePattern = lastTenResults.slice(0, 5).map((r: any) => r.color);
  
  // ✅ NOVO: Padrão invertido que será apostado (CONTRA o histórico)
  const bettingPattern = basePattern.map(invertColor);
  
  // Padrão atual para exibição - MOSTRA AS CORES QUE SERÃO APOSTADAS
  const currentPattern = bettingPattern.join('');

  // ✅ Debug removido para evitar re-renders infinitos

  // Pattern para exibição no ESTADO_OPERAÇÃO - vem da API quando operação está ativa
  const displayPattern = operationState?.pattern || currentPattern;

  // Definir flags de modo
  const isRealOperation = isOperating && operationState?.mode === 'real';
  const isAnalysisMode = connectionStatus.connected && operationState?.mode === 'analysis';

  // 1. Função para definir stake pendente (aguarda derrota)
  const updateStakeDirectly = async (newStakeValue: number) => {
    try {
      // ✅ Atualização do frontend já foi feita nos botões
      // Esta função agora apenas comunica com o backend
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ Usuário não autenticado');
        return;
      }

      // Se há operação ativa OU aguardando resultado, aguarda derrota para aplicar
      if (isOperating || operationState?.waitingForResult) {
        const response = await fetch('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            action: 'set-pending-stake',
            newStake: newStakeValue
          })
        });

        if (!response.ok) {
          throw new Error(`Erro HTTP: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          console.log(`✅ Stake pendente definida: R$ ${newStakeValue.toFixed(2)}`);
        } else {
          console.error('❌ Erro na resposta do backend:', result.error);
        }
      } else {
        // Se não há operação, aplica imediatamente no backend também
        const response = await fetch('/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            action: 'update-stake',
            newStake: newStakeValue
          })
        });

        if (!response.ok) {
          throw new Error(`Erro HTTP: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          console.log(`✅ Stake atualizada: R$ ${newStakeValue.toFixed(2)}`);
        } else {
          console.error('❌ Erro na resposta do backend:', result.error);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar stake:', error);
    }
  };

  // 🔧 NOVA: Função para limpar manualmente stake pendente (em caso de travamento)
            // Função clearPendingStake removida - não mais necessária

  // 2. Adicionar o select de stake abaixo do switch Break-Even Estratégico
  return (
    <div className="min-h-screen bg-black text-green-400 relative overflow-hidden">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10 p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          


          {/* Erro Global */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 font-mono">
              {error}
            </div>
          )}
          
          {/* Blaze Token Card */}
          <button
            onClick={handleOpenModal}
            className={`
              w-full p-4 rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:scale-[1.02]
              ${isConfigured 
                ? 'bg-green-500/5 border-green-500/30 shadow-lg shadow-green-500/20' 
                : 'bg-red-500/5 border-red-500/30 shadow-lg shadow-red-500/20'
              }
            `}
            style={{ backgroundColor: isConfigured ? '#131619' : '#1a1416' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`
                  p-2 rounded-lg
                  ${isConfigured 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-red-500/20 text-red-400'
                  }
                `}>
                  <Key className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <h3 className={`text-sm font-semibold font-mono ${
                    isConfigured ? 'text-green-400' : 'text-red-400'
                  }`}>
                    🔑 ACESSO_BLAZE
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">
                    {`// Credenciais de autenticação para sistema Blaze`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold ${
                  isConfigured 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {isConfigured ? 'CONFIGURADO' : 'NÃO_CONFIGURADO'}
                </span>
                <Settings className={`h-4 w-4 ${
                  isConfigured ? 'text-green-400' : 'text-red-400'
                }`} />
              </div>
            </div>
          </button>

          {/* 💰 NOVO: Card de Créditos Disponíveis */}
          <CreditDisplay />



          {/* 🛑 GameStatisticsCard DESATIVADO - polling desnecessário, dados vêm do insights */}
          {/* <GameStatisticsCard refreshInterval={30000} autoRefresh={true} /> */}

          {/* 🔥 NOVO: Card de Insights de Dados - Todos os Tipos de Aposta */}
                      {insightsData && insightsData.results && Array.isArray(insightsData.results) && insightsData.results.length > 0 && (() => {
              // ✅ CORREÇÃO: Usar dados já memorizados em vez de recalcular

              // ✅ CORREÇÃO: Usar função getTemperatureStatus memorizada (definida no nível superior)
            
            return (
              <Card className="border-purple-500/30 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
                    <Target className="h-5 w-5" />
                    INSIGHTS DE DADOS
                  </CardTitle>
                  <CardDescription className="text-gray-400 font-mono text-xs">
                    // Analise a frequencia dos tipos de aposta e histórico atual (sequências 2+)
                  </CardDescription>
                  
                  {/* Referências */}
                  <div className="px-4 pb-2 text-xs font-mono text-gray-500 space-y-1">
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4 px-4">
                  {!insightsComparison.hasData ? (
                    <div className="text-center py-8">
                      <div className="text-gray-400 mb-2 font-mono">AGUARDANDO_DADOS</div>
                      <div className="text-xs text-gray-500 font-mono">
                        // Coletando dados em tempo real
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-4 w-full">
                      {/* ✅ CORREÇÃO: Usar componentes memorizados para evitar re-renders */}
                      <InsightCard
                        title="VERMELHO"
                        color="text-red-400"
                        bgColor="bg-red-500/5"
                        borderColor="border-red-500/20"
                        hoverColor="hover:bg-red-500/10"
                        rounds={insightsComparison.roundsSinceLastSequence?.red || '--'}
                        tooltip={tooltipContents.red}
                      />
                      
                      <InsightCard
                        title="PRETO"
                        color="text-gray-300"
                        bgColor="bg-gray-500/5"
                        borderColor="border-gray-500/20"
                        hoverColor="hover:bg-gray-500/10"
                        rounds={insightsComparison.roundsSinceLastSequence?.black || '--'}
                        tooltip={tooltipContents.black}
                      />
                      
                      <InsightCard
                        title="PAR"
                        color="text-blue-400"
                        bgColor="bg-blue-500/5"
                        borderColor="border-blue-500/20"
                        hoverColor="hover:bg-blue-500/10"
                        rounds={insightsComparison.roundsSinceLastSequence?.even || '--'}
                        tooltip={tooltipContents.even}
                      />
                      
                      <InsightCard
                        title="ÍMPAR"
                        color="text-green-400"
                        bgColor="bg-green-500/5"
                        borderColor="border-green-500/20"
                        hoverColor="hover:bg-green-500/10"
                        rounds={insightsComparison.roundsSinceLastSequence?.odd || '--'}
                        tooltip={tooltipContents.odd}
                      />
                      
                      <InsightCard
                        title="BAIXAS (1-18)"
                        color="text-yellow-400"
                        bgColor="bg-yellow-500/5"
                        borderColor="border-yellow-500/20"
                        hoverColor="hover:bg-yellow-500/10"
                        rounds={insightsComparison.roundsSinceLastSequence?.low || '--'}
                        tooltip={tooltipContents.low}
                      />
                      
                      <InsightCard
                        title="ALTAS (19-36)"
                        color="text-indigo-400"
                        bgColor="bg-indigo-500/5"
                        borderColor="border-indigo-500/20"
                        hoverColor="hover:bg-indigo-500/10"
                        rounds={insightsComparison.roundsSinceLastSequence?.high || '--'}
                        tooltip={tooltipContents.high}
                      />
                          </div>
                                    )}
                  
                  {/* Últimos resultados em tempo real - Grid 10x2 */}
                  {insightsData && insightsData.results && Array.isArray(insightsData.results) && insightsData.results.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-mono text-gray-400">
                          Últimos resultados:
                        </div>
                      </div>
                      <div className="w-full max-w-4xl mx-auto p-4 bg-gray-900/30 border border-gray-700/30 rounded-lg">
                        <div className="grid grid-cols-10 gap-3 auto-rows-fr">
                          {/* ✅ CORREÇÃO: Usar dados memorizados com tooltips pré-calculados */}
                          {memoizedInsightsResults.map((result) => (
                            <ResultRouletteSlot
                              key={result.id}
                              number={result.number}
                              gameId={result.gameId}
                              timestamp={result.timestamp}
                              index={result.index}
                              isRed={result.isRed}
                              isGreen={result.isGreen}
                              tooltipContent={result.tooltipContent}
                            />
                          ))}
                          
                          {/* Preencher slots vazios para completar o grid 10x2 (agora sem botão '+') */}
                          {(() => {
                            const actualResults = memoizedInsightsResults.length;
                            const totalSlots = 20; // Grid fixo 10x2
                            const emptySlots = Math.max(0, totalSlots - actualResults);
                            
                            return Array.from({ length: emptySlots }).map((_, index) => (
                              <div
                                key={`empty-${index}`}
                                className="aspect-square rounded-lg border-2 border-dashed border-gray-600/50 flex items-center justify-center"
                              >
                                <div className="w-2 h-2 bg-gray-600/30 rounded-full"></div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Informações da última atualização */}
                  <div className="p-3 bg-gray-800/30 border border-gray-600/30 rounded-lg mt-4">
                    <div className="text-xs font-mono text-gray-400">
                      {insightsData && insightsData.lastUpdate && (
                        <p>Última atualização: {new Date(insightsData.lastUpdate).toLocaleTimeString()}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}



          {/* Card OPERAÇÕES */}
          <OperationsCard operationReport={operationReport} />

          {/* Card Operação */}
          <Card className="border-blue-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-400 font-mono">
                <Power className="h-5 w-5" />
                CONTROLE_OPERAÇÃO
              </CardTitle>
              <CardDescription className="text-gray-400 font-mono text-xs">
                // Inicie ou pare as operações do bot
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                
                {/* Status */}
                <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full shadow-lg ${
                    isRealOperation
                      ? 'bg-blue-400 animate-pulse shadow-blue-400/50'
                      : isAnalysisMode
                        ? 'bg-yellow-400 shadow-yellow-400/50'
                        : operationStatus === 'ERRO'
                          ? 'bg-red-400 shadow-red-400/50'
                          : 'bg-gray-400 shadow-gray-400/50'
                  }`}></div>
                  <span className={`font-medium font-mono ${
                    isRealOperation
                      ? 'text-blue-400'
                      : isAnalysisMode
                        ? 'text-yellow-400'
                        : operationStatus === 'ERRO'
                          ? 'text-red-400'
                          : 'text-gray-400'
                  }`}>
                    {isRealOperation
                      ? 'EM OPERAÇÃO'
                      : isAnalysisMode
                        ? 'EM ANÁLISE'
                        : 'INATIVO'}
                  </span>
                </div>


                </div>





                {/* ✅ SISTEMA AUTOMÁTICO: Debug manual removido - processamento automático via gameId */}

                {/* Logs do WebSocket */}
                {websocketLogs.length > 0 && (
                  <div className="space-y-2">

                    <div className="max-h-64 overflow-y-auto p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-1">
                      {websocketLogs.filter(log => 
                        !log.message.includes('🎰 Janela de apostas') && 
                        !log.message.includes('Apostas abertas') && 
                        !log.message.includes('Apostas fechadas')
                      ).slice(0, 20).map((log, index) => (
                        <div key={`log-${index}-${log.timestamp}`} className="text-xs font-mono flex items-start gap-2">
                          <span className="text-gray-500 text-xs">
                            {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                          </span>
                          <span className={`flex-1 ${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-green-400' :
                            log.type === 'game' ? 'text-yellow-400' :
                            log.type === 'bets-open' ? 'text-green-400 font-bold' :
                            log.type === 'bets-closed' ? 'text-red-400 font-bold' :
                            'text-gray-300'
                          }`}>
                            {log.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}



                {/* Erro */}
                {operationError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <span className="text-xs font-mono text-red-400">{operationError}</span>
                  </div>
                )}

                {/* Sucesso */}
                {operationSuccess && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <span className="text-xs font-mono text-green-400">{operationSuccess}</span>
                  </div>
                )}

                {/* Botões de Controle */}
                <div className="space-y-2">
                  {/* Botão Principal - Começar/Parar Apostas */}
                  <Button 
                    onClick={handleOperate}
                    disabled={
                      operationLoading || 
                      !isConfigured || 
                      ((isOperating || forceOperatingDisplay) && isRealOperation && !canSafelyStop) || // ✅ NOVO: Desabilita quando operando em modo REAL e não é seguro parar
                      (!(isOperating || forceOperatingDisplay) && martingaleSequence.length === 0) // ✅ NOVO: Desabilita se não há sequência válida
                    }
                    className={`w-full font-mono ${
                      (isOperating || forceOperatingDisplay)
                        ? (isAnalysisMode || canSafelyStop) // ✅ NOVO: No modo análise sempre pode parar, no modo real depende do canSafelyStop
                          ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30' // Pode parar
                          : 'bg-gray-500/20 border border-gray-500/50 text-gray-400 cursor-not-allowed' // Não pode parar
                        : martingaleSequence.length === 0
                          ? 'bg-gray-500/20 border border-gray-500/50 text-gray-400 cursor-not-allowed' // Sem sequência válida
                        : 'bg-blue-500/20 border border-blue-500/50 text-blue-400 hover:bg-blue-500/30'
                    } transition-all duration-300`}
                    variant="outline"
                  >
                    {operationLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (isOperating || forceOperatingDisplay) ? (
                      <Square className="h-4 w-4 mr-2" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    {operationLoading 
                      ? 'CONECTANDO...' 
                      : ((isOperating || forceOperatingDisplay) && (connectionStatus.connected || forceOperatingDisplay)) 
                        ? 'PARAR'
                        : martingaleSequence.length === 0
                          ? 'CONFIGURE SUA BANCA'
                          : 'COMEÇAR'
                    }
                  </Button>

                  {/* ✅ NOVO: Mostrar informações da estratégia quando não operando */}

                </div>

                {/* 💰 NOVO: Lógica de Stakes com Multiplicador */}
                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-3">
                  <label className="text-sm font-semibold text-blue-400 font-mono">
                    Lógica de Stakes
                  </label>
                  <div className="text-xs text-gray-400 font-mono">
                    Sistema de 29 níveis fixos com multiplicador personalizado
                  </div>
                  
                  {/* Multiplicador */}
                  <div className="space-y-2">
                    <div className="text-xs text-gray-400 font-mono">Multiplicador</div>
                    <div className="flex items-center gap-2">
                      {/* Botão Menos */}
                      <button
                        onClick={() => {
                              const newMultiplier = Math.max(1, stakeMultiplier - 1);
    setStakeMultiplier(newMultiplier);
    updateStakeMultiplier(newMultiplier);
                        }}
                        disabled={stakeMultiplier <= 1}
                        className="w-10 h-10 bg-gray-700/50 border border-gray-600/50 rounded-lg text-gray-300 font-bold text-sm hover:bg-gray-600/50 hover:border-gray-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        -
                      </button>
                      
                      {/* Input de Valor */}
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={`${stakeMultiplier}x`}
                          readOnly
                          className="w-full h-10 bg-gray-800/50 border border-gray-600/50 rounded-lg text-center text-white font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                          placeholder="1x"
                        />
                      </div>
                      
                      {/* Botão Mais */}
                      <button
                        onClick={() => {
                              const newMultiplier = Math.min(5, stakeMultiplier + 1);
    setStakeMultiplier(newMultiplier);
    updateStakeMultiplier(newMultiplier);
                        }}
                        disabled={stakeMultiplier >= 5}
                        className="w-10 h-10 bg-gray-700/50 border border-gray-600/50 rounded-lg text-gray-300 font-bold text-sm hover:bg-gray-600/50 hover:border-gray-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  

                  
                  {/* Informações da Lógica */}
                  <div className="mt-3 pt-3 border-t border-blue-500/10">
                    <div className="text-xs text-gray-400 font-mono">
                      <div className="mb-1">
                        <span className="text-blue-400">Multiplicador:</span> {stakeMultiplier}x aplicado aos valores base
                      </div>
                      <div className="mb-1">
                        <span className="text-green-400">Lucro fixo:</span> +{formatCurrency(stakeMultiplier * 1.00)} (quando acerta)
                      </div>
                      <div className="text-xs text-gray-500">
                        Lucro é igual para todos os níveis • Multiplicador × R$ 1,00
                      </div>
                    </div>
                  </div>
                  
                  {/* Tabela de Todos os Níveis */}
                  <div className="mt-4 pt-4 border-t border-blue-500/10">
                    <div className="text-xs text-blue-400 font-mono font-semibold mb-3">
                      TABELA COMPLETA - 29 NÍVEIS (Multiplicador: {stakeMultiplier}x)
                    </div>
                    
                    <div className="max-h-48 overflow-y-auto border border-gray-600/30 rounded-lg bg-gray-900/30">
                      <table className="w-full text-xs font-mono">
                        <thead className="sticky top-0 bg-gray-800/80 border-b border-gray-600/30">
                          <tr>
                            <th className="px-2 py-1 text-left text-gray-400">Nível</th>
                            <th className="px-2 py-1 text-right text-gray-400">M1</th>
                            <th className="px-2 py-1 text-right text-gray-400">M2</th>
                            <th className="px-2 py-1 text-right text-gray-400">Custo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {STAKE_LEVELS.map((level, index) => (
                            <tr key={level.level} className={`border-b border-gray-700/20 hover:bg-gray-800/20 ${index % 2 === 0 ? 'bg-gray-800/10' : ''}`}>
                              <td className="px-2 py-1 text-white font-semibold">{level.level}</td>
                              <td className="px-2 py-1 text-right text-green-400">
                                {formatCurrency(level.m1 * stakeMultiplier)}
                              </td>
                              <td className="px-2 py-1 text-right text-yellow-400">
                                {formatCurrency(level.m2 * stakeMultiplier)}
                              </td>
                              <td className="px-2 py-1 text-right text-red-400">
                                {formatCurrency(level.cost * stakeMultiplier)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="mt-2 text-xs text-gray-500 font-mono">
                      <span className="text-green-400">M1:</span> Primeira aposta | 
                      <span className="text-yellow-400"> M2:</span> Segunda aposta | 
                      <span className="text-red-400"> Custo:</span> Banca necessária
                    </div>
                  </div>
                </div>

                {/* 🔥 SEÇÃO: Tipo de Aposta */}
                <div className="mt-4 space-y-3 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                  <label className="text-sm font-semibold font-mono text-purple-400">
                    Tipo de Aposta
                  </label>
                  <div className="text-xs text-gray-400 font-mono">
                    Selecione um tipo de aposta
                  </div>
                  
                  {/* 🔥 SELEÇÃO: Tipo de aposta */}
                  <div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'await', label: 'AGUARDAR', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
                        { value: 'red', label: 'VERMELHO', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
                        { value: 'black', label: 'PRETO', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
                        { value: 'even', label: 'PAR', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
                        { value: 'odd', label: 'ÍMPAR', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
                        { value: 'low', label: 'BAIXAS (1-18)', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
                        { value: 'high', label: 'ALTAS (19-36)', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setM4DirectBetType(option.value as typeof m4DirectBetType)}
                          disabled={false} // Sempre habilitado para permitir troca durante operação
                          className={`p-2 rounded text-xs font-mono border transition-all ${
                            m4DirectBetType === option.value
                              ? option.color
                              : 'bg-gray-800/50 text-gray-400 border-gray-600/30 hover:bg-gray-700/50'
                          } cursor-pointer`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-gray-500 font-mono">
                        <span>Aposta selecionada: <span className="text-purple-400">{
                        m4DirectBetType === 'await' ? 'AGUARDAR' :
                          m4DirectBetType === 'red' ? 'VERMELHO' :
                          m4DirectBetType === 'black' ? 'PRETO' :
                          m4DirectBetType === 'even' ? 'PAR' :
                          m4DirectBetType === 'odd' ? 'ÍMPAR' :
                          m4DirectBetType === 'low' ? 'BAIXAS (1-18)' :
                          'ALTAS (19-36)'
                        }</span></span>
                    </div>
                  </div>
                </div>


              </div>
            </CardContent>
          </Card>







          

        </div>
      </div>

      {/* Modal de Configuração do Token Blaze */}
      <Modal
        isOpen={blazeConfigModal.isOpen}
        onClose={() => {
          setBlazeToken('');
          setAlertMessage(null);
          blazeConfigModal.closeModal();
        }}
        title={isConfigured ? 'EDITAR_TOKEN_BLAZE' : 'CONFIG_BLAZE'}
        description={isConfigured ? 'Atualize seu token de autenticação Blaze' : 'Configure seu token de autenticação Blaze'}
        type="info"
        actions={{
          primary: {
            label: isConfigured ? 'ATUALIZAR_TOKEN' : 'SALVAR_TOKEN',
            onClick: handleConfigureBlaze,
            loading: configLoading,
            disabled: false
          },
          secondary: {
            label: 'CANCELAR',
            onClick: () => {
              setBlazeToken('');
              setAlertMessage(null);
              blazeConfigModal.closeModal();
            }
          }
        }}
      >
        <div className="space-y-4">
          {alertMessage && (
            <InlineAlert
              type={alertMessage.type}
              message={alertMessage.message}
            />
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-300 font-mono">
              TOKEN_ACESSO
            </label>
            <input
              type="text"
              value={blazeToken}
              onChange={(e) => setBlazeToken(e.target.value)}
              placeholder="Cole seu token Blaze aqui..."
              className="w-full p-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
            <p className="text-xs text-gray-400 font-mono">
              {`// Token será criptografado e armazenado com segurança`}
            </p>
          </div>

          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400 font-mono">COMO_OBTER_TOKEN</span>
            </div>
            <div className="text-xs text-gray-300 font-mono space-y-1">
              <p>1. Faça login na sua conta Blaze</p>
              <p>2. Abra as Ferramentas do Desenvolvedor (F12)</p>
              <p>3. Vá para Application → Local Storage</p>
              <p>4. Selecione &quot;https://blaze.bet.br&quot;</p>
              <p>5. Encontre &quot;ACCESS_TOKEN&quot; e copie o valor</p>
              <p>6. Cole no campo acima</p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal de Estratégia Removido - Agora usamos diretamente o card CONFIGURAR_BANCA */}
    </div>
  );
} 

