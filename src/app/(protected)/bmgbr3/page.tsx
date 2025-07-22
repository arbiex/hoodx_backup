/**
 * 🧪 BMGBR3 - VERSÃO DE TESTES
 * 
 * Esta é uma cópia da página BMGBR original para testar novas funcionalidades
 * sem interferir no sistema em produção.
 * 
 * API: /api/bmgbr3/blaze/pragmatic/blaze-megarouletebr
 * Página: /bmgbr3
 */
'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Square, RefreshCw, Zap, Key, Settings, Power, Target, Play, Coins } from 'lucide-react';
import MatrixRain from '@/components/MatrixRain';
import Modal, { useModal } from '@/components/ui/modal';
import InlineAlert from '@/components/ui/inline-alert';
import useBmgbr3Api from '@/hooks/useBmgbr3Api';
import { useCredits } from '@/hooks/useCredits';
import { useAuth } from '@/hooks/useAuth';
import CreditPurchaseModal from '@/components/CreditPurchaseModal';
import useTimerManager from '@/hooks/useTimerManager';



/**
 * 🔇 SISTEMA DE POLLING ULTRA-SILENCIOSO - Versão 3.0
 * 
 * 🛑 TODOS OS POLLING REMOVIDOS:
 *    - GameStatisticsCard: 30s ❌ (REMOVIDO)
 *    - Update interval histórico: 30s ❌ (REMOVIDO)
 *    - Hash comparisons & gap recovery ❌ (REMOVIDO)
 *    - FrequencyAnalysisCard auto-refresh ❌ (REMOVIDO)
 *    - Logs e console.warn ❌ (REMOVIDO)
 *    - Modo automático ❌ (REMOVIDO)
 *    - M1 simulado + M2 real ❌ (REMOVIDO)
 *
 * ✅ ÚNICO POLLING ATIVO:
 *    - Insights polling: 1s (Monitoramento URL silencioso)
 *    - Só dispara atualizações quando gameId muda
 *    - Zero logs, zero re-renders desnecessários
 *    - Seleção manual de tipos de aposta
 *
 * 🎯 NOVA ESTRATÉGIA: Repetição Inteligente
 *    - Monitora resultado desejado aparecer
 *    - Aposta para repetir o resultado detectado
 *
 * 🎯 RESULTADO: Sistema ultra-eficiente, polling verdadeiramente silencioso
 */

/**
 * 🔄 NOVO: Interface para estado consolidado de operação
 * Substitui todos os estados conflitantes em um único estado coerente
 */
interface ConsolidatedOperationState {
  status: 'idle' | 'loading' | 'connecting' | 'operating' | 'stopping' | 'mission_progress';
  isActive: boolean;           // Substitui operationActive - se operação está ativa no backend
  canStop: boolean;           // Substitui canSafelyStop - se é seguro parar
  forceDisplay: boolean;      // Substitui forceOperatingDisplay - força exibição
  lastAction?: string;        // Para debug/tracking
  connectedToBackend?: boolean; // Se está conectado ao backend
}

export default function BMGBR3() {
  // 🔄 NOVO: Hook customizado para API
  const api = useBmgbr3Api();

  // 🔄 NOVO: Hooks para autenticação e créditos
  const { user } = useAuth();
  const { balance: creditsBalance, isLoading: creditsLoading } = useCredits(user?.id);

  // 🗑️ REMOVIDO: Sistema de controle de sessão múltipla

  // 🕐 NOVO: Gerenciador de timers centralizado (previne memory leaks)
  const timers = useTimerManager({ 
    debug: false, // Habilitar para debugging
    maxTimers: 20 // Limite seguro para esta página
  });

  // Estados básicos
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Estado para modal de créditos
  const [creditModalOpen, setCreditModalOpen] = useState(false);

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

  // 🔄 NOVO: Estado consolidado de operação (substitui todos os estados conflitantes)
  const [operation, setOperation] = useState<ConsolidatedOperationState>({
    status: 'idle',
    isActive: false,
    canStop: true,
    forceDisplay: false,
    lastAction: undefined,
    connectedToBackend: false
  });

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
    cached?: boolean; // Cache para evitar piscar
  }>({ connected: false, lastUpdate: Date.now(), cached: false });

  // 🔄 NOVO: Estados derivados do estado consolidado para compatibilidade
  const isOperating = operation.status === 'operating' || operation.isActive;
  const operationLoading = operation.status === 'loading' || operation.status === 'connecting';
  const missionInProgress = operation.status === 'mission_progress';
  const canSafelyStop = operation.canStop;
  const forceOperatingDisplay = operation.forceDisplay;

  // 🔧 NOVA FUNÇÃO: Detectar e simplificar erros de saldo insuficiente
  const simplifyEdgeFunctionError = (errorText: string, statusCode?: number): string => {
    try {
      // Tentar parsear como JSON para verificar se é um erro estruturado
      const errorData = JSON.parse(errorText);
      
      // Verificar se é erro de saldo insuficiente
      if ((statusCode === 422 || errorText.includes('422')) && 
          errorData.error && 
          (errorData.error.message?.includes('You currently do not have any balance') ||
           errorData.error.message?.includes('Please deposit funds') ||
           errorData.error.code === 'gameProvider.NoBalance')) {
        return 'saldo insuficiente para ativar o bot';
      }
      
      // Se não é erro de saldo, retornar erro original para outros casos
      return `Erro na Edge Function: ${statusCode || 'unknown'} - ${errorText}`;
      
    } catch (parseError) {
      // Tentar detectar no texto simples se não conseguir parsear JSON
      if ((errorText.includes('You currently do not have any balance') ||
           errorText.includes('Please deposit funds') ||
           errorText.includes('gameProvider.NoBalance')) &&
          (statusCode === 422 || errorText.includes('422'))) {
        return 'saldo insuficiente para ativar o bot';
      }
      
      // Se não conseguir parsear como JSON, retornar erro original
      return `Erro na Edge Function: ${statusCode || 'unknown'} - ${errorText}`;
    }
  };

  // 🔄 FUNÇÕES AUXILIARES: Para atualizar o estado consolidado
  const setIsOperating = (value: boolean) => {
    setOperation(prev => ({
      ...prev,
      status: value ? 'operating' : 'idle',
      isActive: value
    }));
  };

  const setOperationLoading = (value: boolean) => {
    setOperation(prev => ({
      ...prev,
      status: value ? 'loading' : 'idle'
    }));
  };

  const setMissionInProgress = (value: boolean) => {
    setOperation(prev => ({
      ...prev,
      status: value ? 'mission_progress' : 'idle'
    }));
  };

  const setCanSafelyStop = (value: boolean) => {
    setOperation(prev => ({
      ...prev,
      canStop: value
    }));
  };

  const setForceOperatingDisplay = (value: boolean) => {
    setOperation(prev => ({
      ...prev,
      forceDisplay: value
    }));
  };

  // Estados mantidos (não conflitam)
  const [operationStatus, setOperationStatus] = useState<string>('INATIVO');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationSuccess, setOperationSuccess] = useState<string | null>(null);
  // 🚫 NOVO: Controle global para exibir mensagens de status de conexão
  const [allowConnectionStatusMessages, setAllowConnectionStatusMessages] = useState(false);
  
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

  // Estados para modal de estratégia - REMOVIDOS (limpeza concluída)

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
  
  // 🛡️ PROTEÇÃO CONTRA DUPLICAÇÃO: Cache de gameIds já processados
  const [processedGameIds, setProcessedGameIds] = useState<Set<string>>(new Set());
  const [logProcessedGameIds, setLogProcessedGameIds] = useState<Set<string>>(new Set());

  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [isInsightsActive, setIsInsightsActive] = useState(false);
  // 🕐 REMOVIDO: insightsPollingRef - agora gerenciado pelo useTimerManager
  
  // 🎯 NOVO: Sistema de polling inteligente
  const [pollingMode, setPollingMode] = useState<'inactive' | 'waiting' | 'normal'>('inactive');
  
  // 🔧 NOVO: Estado para rastrear erros consecutivos
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  // 📱 RESPONSIVO: Estado para controlar quantos resultados mostrar
  const [visibleResultsCount, setVisibleResultsCount] = useState(10); // 10 desktop, 5 mobile





  // 🛑 NOVO: Estado para controle do botão baseado no modo (análise/real)
  const [stopButtonControl, setStopButtonControl] = useState<{
    canStop: boolean;
    mode: 'analysis' | 'real';
    isBlocked: boolean;
  } | null>(null);

  // Estados para controle de segurança baseado em status foram removidos - apenas M4 Direto

  // Removed: Auto Bot and Stop Gain states
  
  // 🔧 Estados de debug removidos - funcionalidade simplificada
  const [lastProcessedInsightGameId, setLastProcessedInsightGameId] = useState<string | null>(null);
  
  // 📈 Estados para Progressão de Stake removidos - funcionalidade descontinuada

  // 🔥 NOVO: Modo M4 direto sempre habilitado nativamente
  const m4DirectModeEnabled = true;

  // 🔥 NOVO: Estado para tipo de aposta do modo M4 direto
  const [m4DirectBetType, setM4DirectBetType] = useState<'await' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high'>('await');

  // Debug removido - sistema funcionando

  








  // 🔄 NOVO: Estado para controlar última atualização dos dados históricos
  const [lastHistoryUpdate, setLastHistoryUpdate] = useState<Date | null>(null);

  // 🔥 NOVO: Estado para controlar ativação automática do modo real
  const [realModeActivationAttempted, setRealModeActivationAttempted] = useState(false);
  
  // 🔥 NOVO: Timestamp da última verificação de ativação (para throttling)
  const lastActivationCheckRef = useRef<number>(0);

  // Estados removidos - limpeza concluída

  // 💰 NOVA LÓGICA: Array dos níveis de stake para 12 níveis - Repetição Inteligente
  const STAKE_LEVELS = [
    { level: 1, m1: 0, m2: 0.50, cost: 0.50 },
    { level: 2, m1: 0, m2: 1.50, cost: 1.50 },
    { level: 3, m1: 0, m2: 3.50, cost: 3.50 },
    { level: 4, m1: 0, m2: 7.50, cost: 7.50 },
    { level: 5, m1: 0, m2: 15.50, cost: 15.50 },
    { level: 6, m1: 0, m2: 31.50, cost: 31.50 },
    { level: 7, m1: 0, m2: 63.50, cost: 63.50 },
    { level: 8, m1: 0, m2: 127.50, cost: 127.50 },
    { level: 9, m1: 0, m2: 255.50, cost: 255.50 },
    { level: 10, m1: 0, m2: 511.50, cost: 511.50 },
    { level: 11, m1: 0, m2: 1023.50, cost: 1023.50 },
    { level: 12, m1: 0, m2: 2047.50, cost: 2047.50 }
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
    return [stakes.m2]; // Apenas valor real da aposta
  };

  // 💰 NOVA FUNÇÃO: Calcular valor total acumulado
  const calculateTotalAmount = (sequence: number[]): number => {
    return sequence.reduce((total, value) => total + value, 0);
  };

  // 💰 FUNÇÃO HELPER: Obter valor da aposta atual - Nível 1 com multiplicador
  const getCurrentStake = (): number => {
    const stakes = calculateStakesWithMultiplier(1, stakeMultiplier);
    return stakes.m2;
  };

  // 💰 NOVA FUNÇÃO: Calcular lucro real considerando gastos acumulados
  const calculateRealProfit = (currentLevel: number): number => {
    const currentLevelData = STAKE_LEVELS[currentLevel - 1];
    const currentBetValue = currentLevelData.m2 * stakeMultiplier;
    
    // Calcular total gasto até chegar neste nível (soma de todas as apostas anteriores)
    let totalSpent = 0;
    for (let i = 0; i < currentLevel; i++) {
      totalSpent += STAKE_LEVELS[i].m2 * stakeMultiplier;
    }
    
    // Valor recebido quando ganha (2x o valor da aposta atual)
    const amountWon = currentBetValue * 2;
    
    // Lucro real = valor recebido - total gasto
    return amountWon - totalSpent;
  };

  // 🚀 NOVA FUNÇÃO: Atualizar multiplicador de stake (usando hook customizado)
  const updateStakeMultiplier = async (newMultiplier: number) => {
    try {
      const result = await api.updateStakeMultiplier(newMultiplier);
      
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

    // 📱 RESPONSIVO: Detectar mobile e ajustar número de resultados
  useEffect(() => {
    const updateResultsCount = () => {
      const isMobile = window.matchMedia('(max-width: 640px)').matches;
      setVisibleResultsCount(isMobile ? 5 : 10);
    };

    // Definir inicial
    updateResultsCount();

    // Escutar mudanças de tamanho
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    mediaQuery.addEventListener('change', updateResultsCount);

    return () => mediaQuery.removeEventListener('change', updateResultsCount);
  }, []);



  // 🚀 ULTRA-ROBUSTO: Inicializar polling de insights com heartbeat (otimizado para evitar erro 429)
  useEffect(() => {
    console.log('🚀 [CÉREBRO] Inicializando sistema ultra-robusto...');
    setIsInsightsActive(true);
    updatePollingMode('inactive'); // 3 segundos quando inativo para evitar erro 429
    startInsightsPolling();
    
    // 🔍 PAGE VISIBILITY: Detectar quando tela volta de background
    let wasHidden = false;
    let graceEndTime = 0;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        wasHidden = true;
        console.log('📱 [CÉREBRO] Tela desligada - polling continua em background');
      } else {
        if (wasHidden) {
          // Dar 60 segundos de tolerância após voltar da tela desligada
          graceEndTime = Date.now() + 60000;
          console.log('📱 [CÉREBRO] Tela desbloqueada - dando 60s de tolerância ao recovery');
          wasHidden = false;
          
          // Forçar atualização do heartbeat
          (window as any).lastPollingTimestamp = Date.now();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 🛡️ SISTEMA DE RECOVERY INTELIGENTE: Verificar a cada 30s se polling ainda está ativo
    const recoveryInterval = setInterval(() => {
      // Usar heartbeat como indicador de vida do polling
      const timeSinceLastPoll = (window as any).lastPollingTimestamp ? 
        Date.now() - (window as any).lastPollingTimestamp : 999999;
      
      // 🔍 VERIFICAR: Se está dentro do período de tolerância
      const isInGracePeriod = Date.now() < graceEndTime;
      
      if (timeSinceLastPoll > 45000 && !isInGracePeriod) { // Se não pollar por 45s E não está em tolerância
        console.error('🚨 [RECOVERY] Polling morto detectado! Reiniciando...');
        try {
          startInsightsPolling();
          console.log('✅ [RECOVERY] Polling reiniciado automaticamente');
        } catch (error) {
          console.error('❌ [RECOVERY] Falha ao reiniciar:', error);
        }
      } else if (timeSinceLastPoll > 45000 && isInGracePeriod) {
        console.log('📱 [RECOVERY] Polling parece morto mas em período de tolerância pós-desbloqueio');
      }
    }, 30000);
    
    // Cleanup no unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(recoveryInterval);
      stopInsightsPolling();
    };
  }, []);

  // 🔥 REMOVIDO: Funções para carregar mais resultados - agora fixo em 20 resultados
  // const loadMoreResults = () => {
  //   setVisibleResultsCount(prev => prev + 20);
  // };

  // const resetToStart = () => {
  //   setVisibleResultsCount(19);
  // };

  // 🔥 useEffect de visibleResultsCount removido - funcionalidade descontinuada



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
    
    // 🧹 NOVO: Resetar cache de logs processados ao resetar operação
    setLogProcessedGameIds(new Set());
    
    // 🔄 NOVO: Forçar carregamento inicial dos logs após reset
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        console.log('🔄 [RESET] Forçando carregamento inicial dos logs...');
        setTimeout(async () => {
          try {
            const logsResult = await api.getWebSocketLogs();
            if (logsResult.success && logsResult.data?.logs) {
              setWebsocketLogs(logsResult.data.logs);
              console.log('✅ [RESET] Logs carregados com sucesso:', logsResult.data.logs.length);
            }
          } catch (error) {
            console.warn('⚠️ [RESET] Erro ao carregar logs iniciais:', error);
          }
          
          // 🔄 GARANTIR: Reiniciar polling após reset
          console.log('🔄 [RESET] Reiniciando polling de insights...');
          stopInsightsPolling(); // Parar primeiro para evitar duplicações
          setTimeout(() => {
            startInsightsPolling(); // Reiniciar após pequena pausa
            console.log('✅ [RESET] Polling reiniciado com sucesso');
          }, 500);
        }, 1000); // Aguardar 1s para o backend processar o reset
      }
    } catch (error) {
      console.warn('⚠️ [RESET] Erro na verificação de usuário:', error);
    }
    
    // Função removida
  };

  // 🚀 Funções de progressão automática removidas - funcionalidade descontinuada

  // 🚀 useEffects de progressão automática removidos - funcionalidade descontinuada

  // 🚀 Funções de reset da progressão automática removidas - funcionalidade descontinuada

  // 🎯 FUNÇÃO INTELIGENTE: Determina quando é seguro parar a operação
  const checkCanSafelyStop = () => {
    if (!isOperating || !operation.isActive) {
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
        (bettingWindow?.isOpen && operation.isActive)) {
      setCanSafelyStop(false);
      return;
    }

    // ✅ Seguro para parar - momento entre operações
    setCanSafelyStop(true);
  };

  // 🔄 Executar verificação sempre que estados mudarem
  useEffect(() => {
    checkCanSafelyStop();
  }, [isOperating, operation.isActive, operationState, bettingWindow, stopButtonControl]);

  // 🎯 NOVO: Controlar modo de polling baseado no estado da operação
  useEffect(() => {
    // Debug removido - sistema funcionando
    
    if (operationState?.waitingForResult) {
      // Aguardando resultado - polling rápido
      updatePollingMode('waiting');
      
      // Garantir que polling está ativo quando aguardando resultado
      if (!isInsightsActive) {
        startInsightsPolling();
        setIsInsightsActive(true);
      }
    } else if (isOperating && operation.isActive) {
      // Operação ativa mas não aguardando resultado - polling normal
      updatePollingMode('normal');
      
      // Manter polling ativo durante operação
      if (!isInsightsActive) {
        startInsightsPolling();
        setIsInsightsActive(true);
      }
    } else {
      // Operação inativa - manter polling ativo sempre para insights
      updatePollingMode('inactive');
      
      // 🔧 CRÍTICO: SEMPRE manter polling ativo para insights, mesmo após missão cumprida
      if (!isInsightsActive) {
        // Log de debug removido - sistema funcionando
        startInsightsPolling();
        setIsInsightsActive(true);
      }
      }
  }, [operationState?.waitingForResult, isOperating, operation.isActive, isInsightsActive]);

  // 🚫 CACHE: Atualizar status da conexão apenas quando necessário
  const updateConnectionStatusCached = useCallback((connected: boolean, error?: string) => {
    setConnectionStatus(prev => {
      // Só atualiza se o status realmente mudou
      if (prev.connected === connected && prev.error === error) {
        return prev;
      }
      
      return {
        connected,
        error,
        lastUpdate: Date.now(),
        cached: true
      };
    });
  }, []);

  // 🔄 NOVO: Função para resetar configurações de segurança
  const resetSafetySettings = () => {
    // 🔥 MODO M4 DIRETO: sempre habilitado nativamente
    setM4DirectBetType('await'); // Resetar tipo de aposta para aguardar
    setRealModeActivationAttempted(false);
          // 🔄 RESETAR ESTADOS DE OPERAÇÃO
      setIsOperating(false);
      // 🎯 RESETAR CONTROLE DE BOTÕES
      setMissionInProgress(false);
    // Limpar mensagens de erro/sucesso
    setOperationError(null);
    setOperationSuccess(null);
    console.log('🔄 Configurações resetadas - Bot funcionará em modo aguardar');
  };

  // 🔄 NOVO: Resetar configurações de segurança na inicialização
  useEffect(() => {
    resetSafetySettings();
    
    // Inicializar contador de erros consecutivos
    const errorCount = parseInt(localStorage.getItem('bmgbr3_error_count') || '0');
    setConsecutiveErrors(errorCount);
  }, []);

  // 🔧 NOVO: Função para forçar regeneração de tokens
  const forceTokenRegeneration = () => {
    setAuthTokens(null);
    localStorage.removeItem('bmgbr3_error_count');
    setOperationError(null);
    setOperationSuccess('🔧 Tokens limpos com sucesso! Novos tokens serão gerados na próxima operação.');
    console.log('🔧 [RECONEXÃO] Tokens forçadamente regenerados pelo usuário');
    
    if (consecutiveErrors > 0) {
      console.log(`🔧 [RECONEXÃO] Limpeza forçada após ${consecutiveErrors} erros consecutivos`);
    }
    
    setConsecutiveErrors(0);
    
    // Limpar mensagem de sucesso após 5 segundos
    setTimeout(() => {
      setOperationSuccess(null);
    }, 5000);
  };

  // 🚀 NOVA: Verificar reativação da progressão quando limite máximo muda
  useEffect(() => {
    // Função removida - progressão automática removida
  }, []);

  // ✅ NOVO: Verificar estado quando conexão mudar
  useEffect(() => {
    // Se desconectado e ainda operando, forçar parada
    if (!connectionStatus.connected && isOperating) {
      setIsOperating(false);
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

  // 🛑 useEffect de polling desativado - funcionalidade descontinuada

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
    try {
      setInsightsLoading(true);
      setInsightsError(null);

      const result = await api.startInsights();

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
    try {
      setInsightsLoading(true);

      const result = await api.stopInsights();

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
    console.log('🚀 [CÉREBRO] Iniciando polling ULTRA-ROBUSTO...');
    
    // Fazer primeira requisição imediatamente
    pollUnifiedData();

    // 🎯 POLLING UNIFICADO: Uma única fonte para tudo (logs + card)
    const interval = getPollingInterval();
    timers.setInterval(
      pollUnifiedData, 
      interval, 
      'unified-polling',
      'Polling unificado (logs + card)'
    );
    
    // 🛡️ ADICIONAR: Heartbeat de segurança
    startPollingHeartbeat();
  };

  // 🎯 NOVO: Sistema de polling inteligente baseado no estado
  const getPollingInterval = () => {
    const intervals = {
      waiting: 2000,  // 2s - Polling quando aguardando resultado
      normal: 2000,   // 2s - Polling normal durante operação
      inactive: 3000  // 3s - Polling mais lento quando inativo
    };
    
    return intervals[pollingMode] || intervals.inactive;
  };

  const stopInsightsPolling = () => {
    console.log('🛑 [CÉREBRO] Parando polling (só deve acontecer em reset)...');
    // Limpar timer usando o gerenciador centralizado
    timers.clearTimer('unified-polling');
    // Parar heartbeat também
    timers.clearTimer('polling-heartbeat');
  };

  // 🛡️ SISTEMA HEARTBEAT: Monitor que garante que polling nunca morre
  const startPollingHeartbeat = () => {
    console.log('💓 [CÉREBRO] Iniciando heartbeat de monitoramento...');
    
    let lastPollingTime = Date.now();
    let missedBeats = 0;
    
    // Atualizar timestamp a cada polling bem-sucedido
    const updateHeartbeat = () => {
      lastPollingTime = Date.now();
      missedBeats = 0;
    };
    
    // Monitor que verifica se polling está vivo (com detecção de background)
    timers.setInterval(() => {
      const timeSinceLastPoll = Date.now() - lastPollingTime;
      const maxInterval = getPollingInterval() * 3; // 3x o intervalo normal
      
      // 🔍 VERIFICAR: Se página está em background (tolerância)
      const isInBackground = document.hidden;
      
      if (timeSinceLastPoll > maxInterval && !isInBackground) {
        missedBeats++;
        console.warn(`💓 [CÉREBRO] Heartbeat perdido! Tempo: ${timeSinceLastPoll}ms, Missed: ${missedBeats}`);
        
        // Após 3 batidas perdidas, forçar restart (aumentado tolerância)
        if (missedBeats >= 3) {
          console.error('🚨 [CÉREBRO] POLLING MORTO DETECTADO! Forçando restart...');
          try {
            stopInsightsPolling();
            setTimeout(() => {
              startInsightsPolling();
              console.log('✅ [CÉREBRO] Polling ressuscitado pelo heartbeat!');
            }, 1000);
          } catch (error) {
            console.error('❌ [CÉREBRO] Erro ao ressuscitar polling:', error);
          }
          missedBeats = 0;
        }
      } else if (timeSinceLastPoll > maxInterval && isInBackground) {
        // Em background - não contar como miss beat
        console.log(`📱 [CÉREBRO] Heartbeat pausado em background (${timeSinceLastPoll}ms) - normal`);
      } else {
        // Polling está vivo
        if (missedBeats > 0) {
          console.log(`💚 [CÉREBRO] Polling voltou ao normal após ${missedBeats} missed beats`);
          missedBeats = 0;
        }
      }
    }, 10000, 'polling-heartbeat', 'Monitor heartbeat do cérebro');
    
    // Função para ser chamada quando polling funciona
    (window as any).updatePollingHeartbeat = updateHeartbeat;
  };

  // 🎯 NOVO: Atualizar modo de polling e reiniciar com novo intervalo
  const updatePollingMode = (mode: 'inactive' | 'waiting' | 'normal') => {
    if (pollingMode !== mode) {
      setPollingMode(mode);
      
      // Reiniciar polling com novo intervalo
      if (isInsightsActive) {
        startInsightsPolling();
      }
    }
  };

      // 🔄 POLLING UNIFICADO: Uma única fonte para TUDO (logs + card)
  const pollUnifiedData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 🛡️ REMOVIDO: Debounce que podia parar o polling
    // O cérebro NUNCA pode parar - permite sobreposição se necessário
    setInsightsLoading(true);

    // ⚠️ DELAY RANDÔMICO: Evitar burst de requests simultâneos  
    const randomDelay = Math.random() * 300; // 0-300ms delay reduzido
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    try {
      const result = await api.getInsights();

      // 🚀 TRATAMENTO ERRO 429: Rate limiting com RETRY AUTOMÁTICO
      if (result.error && result.error.includes('429')) {
        console.log('⚠️ Rate limit atingido - aguardando e CONTINUANDO automaticamente...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        // 🛡️ NÃO retorna - continua o polling após pausa
        console.log('🔄 Continuando polling após rate limit...');
      }
      
      // 🛡️ ERRORS NÃO PARAM O CÉREBRO: Log mas continua tentando
      if (!result.success && !result.error?.includes('429')) {
        console.warn('⚠️ [CÉREBRO] Erro no polling mas CONTINUANDO:', result.error);
        // NÃO retorna - continua processamento para manter polling vivo
      }

      if (result.success && result.data) {
        // 🎯 DETECÇÃO SIMPLES: Apenas gameId diferente
        const latestGameId = result.data.results[0]?.gameId || '';
                const latestResult = result.data.results[0];
        
        // ✅ COMPARAÇÃO MELHORADA: gameId diferente + não processado ainda
        const hasNewGameId = latestGameId !== lastKnownGameId && 
                           latestGameId !== '' && 
                           !processedGameIds.has(latestGameId);
        
                if (hasNewGameId) {
          // 🛡️ ATUALIZAR IMEDIATAMENTE para evitar reprocessamento
          setLastKnownGameId(latestGameId);
          setProcessedGameIds(prev => new Set(prev).add(latestGameId));
          
          // 🎯 PROCESSAR dados uma única vez
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
          
          // ✅ ATUALIZAR dados do card
          setInsightsData({
            results: sortedData,
            totalResults: result.data.totalResults || sortedData.length,
            lastUpdate: Date.now(),
            isActive: result.data.isActive || true,
            isOnline: result.data.isOnline || true,
            lastGameId: latestGameId
          });
          
          // 🎯 GERAR LOGS unificados (APENAS UMA VEZ por gameId)
          if (latestResult && latestResult.number !== undefined && !logProcessedGameIds.has(latestGameId)) {
            // 🛡️ MARCAR COMO PROCESSADO PARA LOGS IMEDIATAMENTE
            setLogProcessedGameIds(prev => new Set(prev).add(latestGameId));
            
            await generateUnifiedLogs(latestResult, user.id);
            
            // 🔄 ATUALIZAR LOGS NO FRONTEND: Buscar logs atualizados após processamento
            try {
              const logsResult = await api.getWebSocketLogs();
              if (logsResult.success && logsResult.data?.logs) {
                setWebsocketLogs(logsResult.data.logs);
              }
            } catch (error) {
              // Silencioso - logs não críticos para operação
            }
          }
          

          
                    setInsightsError(null);
        }
        // ✅ DADOS IGUAIS: Retorno silencioso absoluto
      }
      
      // 🛡️ HEARTBEAT: Sinalizar que polling está funcionando
      (window as any).lastPollingTimestamp = Date.now();
      if ((window as any).updatePollingHeartbeat) {
        (window as any).updatePollingHeartbeat();
      }
      
      // 🧹 LIMPEZA AUTOMÁTICA: Manter cache de logs processados controlado
      if (logProcessedGameIds.size > 50) {
        const array = Array.from(logProcessedGameIds);
        const toKeep = array.slice(-30); // Manter apenas os últimos 30
        setLogProcessedGameIds(new Set(toKeep));
      }
    } catch (error) {
      // 🚀 TRATAMENTO ULTRA-ROBUSTO: NUNCA mata o cérebro por erro
      console.warn('⚠️ [CÉREBRO] Erro no polling mas MANTENDO VIVO:', error);
      
      // 🛡️ Retry com backoff para rate limiting
      if (error instanceof Error && error.message.includes('429')) {
        console.log('🔄 [CÉREBRO] Rate limit - fazendo backoff mas CONTINUANDO...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // 🔄 CRÍTICO: Sempre libera loading para próximo ciclo
      setTimeout(() => setInsightsLoading(false), 100);
    } finally {
      // 🛡️ SEMPRE limpa loading - cérebro nunca pode travar
      setInsightsLoading(false);
    }
  };

  // 🎯 FUNÇÃO UNIFICADA: Gerar logs do resultado (substituindo WebSocket)
  const generateUnifiedLogs = async (latestResult: any, userId: string) => {
    // 🛡️ VALIDAÇÕES rigorosas para evitar dados corrompidos
    const number = latestResult.number;
    const color = latestResult.color;
    const gameId = latestResult.gameId;
    
    // ✅ VALIDAR número da roleta (0-36)
    if (typeof number !== 'number' || number < 0 || number > 36) {
      console.warn('⚠️ NÚMERO INVÁLIDO detectado:', number, '- Ignorando processamento');
      return;
    }
    
    // ✅ VALIDAR gameId (não deve ser um número de resultado)
    if (!gameId || String(gameId).length < 5) {
      console.warn('⚠️ GAMEID INVÁLIDO detectado:', gameId, '- Ignorando processamento');
      return;
    }
    
    // 🛡️ PROTEÇÃO EXTRA: gameId não deve ser igual ao número (dados corrompidos)
    if (String(gameId) === String(number)) {
      console.warn('⚠️ DADOS CORROMPIDOS detectados: gameId igual ao número:', gameId, '- Ignorando');
      return;
    }
    
    // ✅ VALIDAR cor
    if (!['red', 'black', 'green'].includes(color)) {
      console.warn('⚠️ COR INVÁLIDA detectada:', color, '- Ignorando processamento');
      return;
    }
    
    // 🎯 Gerar características do resultado
    let characteristics = [];
    
    if (number === 0) {
      characteristics.push('Verde');
    } else {
      // Cor
      characteristics.push(color === 'red' ? 'Vermelho' : 'Preto');
      
      // Par/Ímpar
      characteristics.push(number % 2 === 0 ? 'Par' : 'Ímpar');
      
      // Baixo/Alto
      characteristics.push(number <= 18 ? 'Baixo' : 'Alto');
    }
    
    const resultDescription = `${number} - ${characteristics.join(' - ')}`;
    
    // 🔄 CHAMAR API para processar resultado (substituindo processamento WebSocket)
    try {
      await api.mainApi('process-unified-result', {
        gameId: gameId,
        number: number,
        color: color,
        timestamp: Date.now(),
        source: 'unified_polling'
      });
      
      // Log será gerado pelo backend - evitar duplicação
    } catch (error) {
      console.error('❌ Erro ao processar resultado unificado:', error);
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



  // ✅ RESULTADOS SIMPLIFICADOS (SEM TOOLTIPS)
  const memoizedInsightsResults = useMemo(() => {
    if (!insightsData || !insightsData.results || !Array.isArray(insightsData.results)) {
      return [];
    }
    
    return insightsData.results.slice(0, visibleResultsCount).map((result: any, index: number) => {
      const isRed = result.color === 'red' || result.color === 'R';
      const isGreen = result.color === 'green' || result.color === 'G' || result.number === 0;
      
      return {
        id: `insight-${index}-${result.game_id}`,
        number: result.number,
        color: result.color,
        gameId: result.game_id,
        timestamp: result.timestamp,
        index: index,
        isRed,
        isGreen
      };
    });
  }, [
    // 🔇 DEPENDÊNCIAS BALANCEADAS: Detecta novos dados mas evita re-renders desnecessários
    insightsData?.results?.length,
    insightsData?.lastUpdate,
    visibleResultsCount
  ]);

  // ✅ RESULTADOS PEQUENOS SIMPLIFICADOS (SEM TOOLTIPS)
  const memoizedSmallResults = useMemo(() => {
    return lastTenResults.map((result: any, index: number) => {
      const isRed = result.color === 'R';
      const isGreen = result.color === 'green' || result.color === 'G' || result.number === 0;
      
      return {
        id: `result-${index}-${result.gameId}`,
        number: result.number,
        color: result.color,
        gameId: result.gameId,
        timestamp: result.timestamp,
        index: index,
        isRed,
        isGreen
      };
    });
  }, [
    // 🔇 DEPENDÊNCIAS BALANCEADAS: Detecta novos dados mas evita re-renders desnecessários
    lastTenResults.length,
    lastTenResults[0]?.gameId, // Primeiro resultado (mais recente)
    lastTenResults[0]?.timestamp // Timestamp do mais recente
  ]);

  // ✅ CORREÇÃO: Função getColorInfo memorizada (removida lógica de temperatura)
  const getColorInfo = useCallback((title: string) => {
    switch (title) {
      case 'VERMELHO':
        return { text: 'vermelho', color: 'text-white' };
      case 'PRETO':
        return { text: 'preto', color: 'text-white' };
      case 'PAR':
        return { text: 'par', color: 'text-white' };
      case 'ÍMPAR':
        return { text: 'ímpar', color: 'text-white' };
      case 'BAIXAS (1-18)':
        return { text: 'baixas', color: 'text-white' };
      case 'ALTAS (19-36)':
        return { text: 'altas', color: 'text-white' };
      default:
        return { text: 'rodadas', color: 'text-white' };
    }
  }, []);

  // 🔇 FUNÇÕES REMOVIDAS: getNumberCharacteristics e formatTimestamp 
  // não são mais necessárias - tooltips foram removidos!

  // ✅ CORREÇÃO: Componente memorizado para cada tipo de aposta (removida lógica de temperatura)
  // Este componente resolve o problema do "piscar" durante o polling:
  // 1. React.memo previne re-renders quando props não mudaram
  // 2. Usa função getColorInfo memorizada para mostrar informações de cores
  const InsightCard = React.memo<{
    title: string;
    color: string;
    bgColor: string;
    borderColor: string;
    hoverColor: string;
    rounds: string | number;
    selectedBetType: 'await' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';
  }>(({ title, color, bgColor, borderColor, hoverColor, rounds, selectedBetType }) => {
    const colorInfo = getColorInfo(title);
    const roundsDisplay = rounds.toString().replace('r', '');
    const roundsNumber = parseInt(roundsDisplay) || 0;

    // 🎨 Lógica de cores baseada no valor
    const getNumberColor = (value: number) => {
      if (value >= 15) return 'text-green-400'; // Verde para 15+
      if (value >= 10 && value <= 14) return 'text-yellow-400'; // Amarelo para 10-14
      return 'text-white'; // Branco para <10
    };

    // 🎯 Mapear título para tipo de aposta
    const getBetType = (title: string): 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | null => {
      switch (title) {
        case 'VERMELHO': return 'red';
        case 'PRETO': return 'black';
        case 'PAR': return 'even';
        case 'ÍMPAR': return 'odd';
        case 'BAIXAS (1-18)': return 'low';
        case 'ALTAS (19-36)': return 'high';
        default: return null;
      }
    };

    // 🎮 Verificar estados do botão APOSTAR  
    const betType = getBetType(title);
    // 🎯 LÓGICA BASEADA EM APOSTAS REAIS: Habilitado quando apostas estão abertas
    const isButtonEnabled = isOperating && m4DirectBetType === 'await' && bettingWindow.isOpen;
    const shouldShowButton = betType !== null; // Sempre mostrar se é um tipo válido
    
    // 🎨 LÓGICA DE SELEÇÃO VISUAL: Verificar se este card está selecionado
    const isSelected = selectedBetType !== 'await' && betType === selectedBetType;
    const isOtherSelected = selectedBetType !== 'await' && betType !== selectedBetType;
    
    // 🚨 LÓGICA DE HABILITAÇÃO: Só permite clicar quando apostas abertas
    const isCardEnabled = bettingWindow.isOpen && isOperating;
    
    // 🎨 LÓGICA DE OPACIDADE CORRETA: 
    // - Apostas fechadas E não é o selecionado = 50%
    // - Apostas abertas E outros selecionados = 50%
    // - Caso contrário = 100%
    const cardOpacity = (!isCardEnabled && !isSelected) || (isCardEnabled && isOtherSelected) 
      ? 'opacity-50' 
      : 'opacity-100';
      
    // 🖱️ CURSOR CORRETO: Baseado no estado de habilitação
    const cardCursor = isCardEnabled ? 'cursor-pointer' : 'cursor-not-allowed';
    

    


    return (
      <div className="w-full h-full">
        <div className="w-full">
          <div
            onClick={() => {
              // 🚨 CORREÇÃO CRÍTICA: Só permitir clique quando apostas abertas
              if (betType && isCardEnabled) {
                handleAutoStartBet(betType);
              }
            }}
            className={`w-full h-full px-4 py-3 bg-gray-800/20 border border-gray-600/30 rounded-lg transition-all flex items-center justify-between min-h-[60px] ${cardCursor} ${cardOpacity} ${
              isCardEnabled ? 'hover:bg-gray-700/30 hover:border-gray-500/50 hover:scale-[1.02]' : ''
            } ${
              roundsNumber >= 15 ? 'border-green-500/50 bg-green-500/10' : 
              roundsNumber >= 10 ? 'border-yellow-500/50 bg-yellow-500/10' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`text-lg sm:text-xl font-bold font-mono ${getNumberColor(roundsNumber)}`}>
              {roundsDisplay}
            </div>
              <div className={`text-xs font-mono uppercase text-white`}>
              {colorInfo.text}
            </div>
          </div>
            {shouldShowButton && (
              <div className="hidden sm:flex items-center justify-center">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isButtonEnabled && betType) {
                      handleAutoStartBet(betType);
                    }
                  }}
                  disabled={!isButtonEnabled}
                  variant="outline"
                  size="sm"
                  className={`font-mono transition-all duration-300 ${
                    isButtonEnabled 
                      ? 'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30' 
                      : 'bg-gray-600/20 border-gray-600/50 text-gray-400 cursor-not-allowed'
                  }`}
                  title={
                    !isButtonEnabled 
                      ? !isOperating 
                        ? 'Clique em "COMEÇAR" primeiro para ativar seleção de tipos'
                        : m4DirectBetType !== 'await'
                                                      ? 'Operação em andamento - aguarde finalizar para selecionar novo tipo'  
                            : bettingWindow.isOpen 
                              ? 'Apostas abertas - Clique para apostar'
                              : 'Apostas fechadas - Aguarde abertura da próxima rodada'
                      : `Apostar automaticamente em ${title}`
                  }
                >
                  <Play className="h-3 w-3" />
                </Button>
            </div>
          )}
          </div>
        </div>
      </div>
    );
  });

  // 🔇 COMPONENTE DE RESULTADO SIMPLIFICADO: Sem tooltip
  const ResultRouletteSlot = React.memo<{
    number: number;
    gameId: string;
    timestamp: number;
    index: number;
    isRed: boolean;
    isGreen: boolean;
  }>(({ number, gameId, timestamp, index, isRed, isGreen }) => {
    return (
      <div className="relative inline-block">
        <div
          className={`aspect-square rounded-md sm:rounded-lg flex items-center justify-center text-xs sm:text-sm font-bold transition-all hover:scale-105 cursor-pointer relative ${
            isRed 
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
              : isGreen
                ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
                : 'bg-gray-800 text-white border border-gray-600 shadow-lg shadow-gray-800/20'
          }`}
        >
          {number}
        </div>
    </div>
  );
}, (prevProps, nextProps) => {
    // 🔇 COMPARAÇÃO ESPECÍFICA: Só re-renderizar se props essenciais mudaram
    return (
      prevProps.number === nextProps.number &&
      prevProps.gameId === nextProps.gameId &&
      prevProps.isRed === nextProps.isRed &&
      prevProps.isGreen === nextProps.isGreen
    );
  });

  // 🔇 Componente SmallResultRouletteSlot removido - não utilizado

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
  const startOperation = async (tipValue: number, forcedBetType?: 'await' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'standby', showConnectionStatus: boolean = true) => {
    // 🔧 TIMEOUT: Adicionar timeout geral para evitar travamento
    const operationTimeout = setTimeout(() => {
      setOperationError('Timeout na operação - tente novamente');
      setOperationLoading(false);
    }, 30000); // 30 segundos timeout
    
    try {
    setOperationLoading(true);
    setOperationError(null);
      setOperationSuccess(null);
      
      console.log('🚀 [START-OPERATION] Iniciando nova operação...');
    
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      // 🤖 NOVO: Determinar tipo de aposta (forcedBetType tem prioridade sobre Auto Bot)
      const finalBetType = forcedBetType === 'standby' ? null : (forcedBetType || m4DirectBetType);
      const isStandbyMode = forcedBetType === 'standby';
      
      // 🤖 REMOVIDO: Lógica de monitoramento de oportunidades não é mais necessária - usa foto inicial e tempo real

      // 🔄 Resetar gráficos para nova sessão
      console.log('🧹 [START-OPERATION] Resetando todos os gráficos e logs...');
      await resetAllGraphs();
      console.log('✅ [START-OPERATION] Reset completo - logs e polling reiniciados');

      // 🔥 NOVO: Resetar flag de tentativa de ativação do modo real
      setRealModeActivationAttempted(false);

      // ✅ LOG: Confirmar tipo de aposta que será usado
      
      // 🤖 REMOVIDO: Log de oportunidades não é mais necessário - usa contadores em tempo real

      // ✅ ETAPA 1: Buscar token da Blaze
      const tokenResponse = await fetch('/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr', {
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
      
      // 🔧 NOVO: Verificar se já temos tokens válidos antes de gerar novos
      let authData = authTokens;
      
      // Só gerar novos tokens se não temos ou se forçamos regeneração
      const shouldGenerateNewTokens = !authTokens?.ppToken || !authTokens?.jsessionId;
      
      if (shouldGenerateNewTokens) {
        console.log('🔧 [RECONEXÃO] Gerando novos tokens...');
      } else {
        console.log('🔧 [RECONEXÃO] Reutilizando tokens existentes...');
      }
      
      if (shouldGenerateNewTokens) {
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
          // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente
          const simplifiedError = simplifyEdgeFunctionError(errorText, authResponse.status);
          throw new Error(simplifiedError);
        }

        const authResult = await authResponse.json();
        
        if (!authResult.success || !authResult.data) {
          // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente
          const rawError = authResult.error || 'Falha na geração de tokens via Edge Function';
          const simplifiedError = simplifyEdgeFunctionError(rawError);
          throw new Error(simplifiedError);
        }

        // Preparar dados de autenticação
        authData = authResult.data;
        setAuthTokens(authData);
      }
      
      // ✅ Verificar se temos tokens válidos
      if (!authData?.ppToken || !authData?.jsessionId) {
        throw new Error('Falha ao obter tokens de autenticação válidos');
      }
      
      // ✅ ETAPA 3: Conectar usando tokens gerados via Edge Function
      const connectResponse = await fetch('/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          action: 'connect',
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
        // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente  
        const simplifiedConnectLogError = simplifyEdgeFunctionError(connectResult.error || 'Erro na conexão');
        
        // 🔧 NOVO: Não logar erros de saldo insuficiente como erro técnico
        if (simplifiedConnectLogError === 'saldo insuficiente para ativar o bot') {
          console.log('💰 [INFO] Saldo insuficiente na Blaze detectado na conexão');
        } else {
          console.error('🔧 [RECONEXÃO] Erro na resposta de conexão:', simplifiedConnectLogError);
        }
        
        // Se o erro é relacionado a tokens, limpar para forçar regeneração
        if (connectResult.error?.includes('Token') || connectResult.error?.includes('auth')) {
          setAuthTokens(null);
          console.log('🔧 [RECONEXÃO] Tokens limpos devido ao erro de conexão');
        }
        
        // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente
        const rawConnectError = connectResult.error || 'Erro ao conectar';  
        const simplifiedConnectError = simplifyEdgeFunctionError(rawConnectError);
        throw new Error(simplifiedConnectError);
      }

      console.log('🔧 [RECONEXÃO] Conexão estabelecida com sucesso');

      // ✅ ETAPA 1.5: Verificar status da conexão com retry
      let connectionVerified = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (!connectionVerified && retryCount < maxRetries) {
        try {
          // Mostrar feedback visual apenas se permitido globalmente E solicitado
          if (allowConnectionStatusMessages && showConnectionStatus) {
          setOperationError(`Verificando conexão... (${retryCount + 1}/${maxRetries})`);
          }

          
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Aguardar 1s, 2s, 3s
          
          const statusResponse = await fetch('/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              action: 'get-connection-status'
            })
          });

          const statusResult = await statusResponse.json();
          
          if (statusResult.success && statusResult.data?.connected) {
            connectionVerified = true;
            setOperationError(null); // Limpar mensagem de verificação
            console.log('🔧 [RECONEXÃO] Status da conexão verificado');
          } else {
            retryCount++;
            console.log(`🔧 [RECONEXÃO] Tentativa ${retryCount}/${maxRetries} - conexão ainda não estabelecida`);
          }
        } catch (error) {
          retryCount++;
          console.log(`🔧 [RECONEXÃO] Erro na tentativa ${retryCount}/${maxRetries}:`, error);
        }
      }

      if (!connectionVerified) {
        console.log('🔧 [RECONEXÃO] Prosseguindo sem verificação de status - tentaremos conectar mesmo assim');
        setOperationError(null); // Limpar mensagem de verificação
        
        // Fazer uma tentativa simples de ping para verificar se a API está respondendo
        try {
          await api.getWebSocketLogs();
          console.log('🔧 [RECONEXÃO] API respondendo normalmente');
        } catch (pingError) {
          console.warn('🔧 [RECONEXÃO] API pode estar com problemas:', pingError);
        }
      }

      // ✅ ETAPA 1.6: Enviar multiplicador após conexão estabelecida
      await updateStakeMultiplier(stakeMultiplier);
      
      // ✅ ETAPA 1.7: Aguardar um pouco para garantir que foi salvo
      await new Promise(resolve => setTimeout(resolve, 100));

      // ✅ ETAPA 2: Iniciar operação (start-operation) - usando hook
      const operationResult = await api.startOperation();

      if (!operationResult.success) {
                // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente
        const simplifiedOperationError = simplifyEdgeFunctionError(operationResult.error || 'Erro ao iniciar operação');
        
        // 🔧 NOVO: Não logar erros de saldo insuficiente como erro técnico
        if (simplifiedOperationError === 'saldo insuficiente para ativar o bot') {
          console.log('💰 [INFO] Saldo insuficiente na Blaze detectado ao iniciar operação');
        } else {
          console.error('🔧 [RECONEXÃO] Erro ao iniciar operação:', simplifiedOperationError);
        }
        
        // Se o erro é relacionado a conexão, tentar limpar tokens
        if (operationResult.error?.includes('conexão') || operationResult.error?.includes('WebSocket')) {
          setAuthTokens(null);
          console.log('🔧 [RECONEXÃO] Tokens limpos devido ao erro de operação');
        }
        
        // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente
        const rawOperationError = operationResult.error || 'Erro ao iniciar operação';
        const simplifiedOperationThrowError = simplifyEdgeFunctionError(rawOperationError);
        throw new Error(simplifiedOperationThrowError);
      }
      
      setIsOperating(true);

      // Começar monitoramento
      monitoringRef.current = true;
      setTimeout(() => {
      startMonitoring();
      }, 1000);

      console.log('🔧 [RECONEXÃO] Operação iniciada com sucesso');
      
              // Limpar contador de erros após sucesso
        localStorage.removeItem('bmgbr3_error_count');
        setConsecutiveErrors(0);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
                    // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente primeiro
      const simplifiedErrorMessage = simplifyEdgeFunctionError(errorMessage);
      
      // Melhorar mensagem de erro para o usuário
      let userFriendlyMessage = simplifiedErrorMessage;
      if (simplifiedErrorMessage === 'saldo insuficiente para ativar o bot') {
        userFriendlyMessage = 'Saldo insuficiente na Blaze. Deposite fundos para ativar o bot.';
      } else if (errorMessage.includes('Token')) {
        userFriendlyMessage = 'Erro de autenticação. Acesse /config para reconfigurar seu token.';
      } else if (errorMessage.includes('conexão')) {
        userFriendlyMessage = 'Erro de conexão. Tente novamente ou use o botão "Forçar Reconexão".';
      } else if (errorMessage.includes('Timeout')) {
        userFriendlyMessage = 'Operação demorou muito para responder. Tente novamente ou use "Forçar Reconexão".';
      }
      
      setOperationError(userFriendlyMessage);
      
      // 🔧 NOVO: Não logar erros de saldo insuficiente como erro técnico
      if (simplifiedErrorMessage === 'saldo insuficiente para ativar o bot') {
        console.log('💰 [INFO] Saldo insuficiente na Blaze detectado');
      } else {
        console.error('🔧 [RECONEXÃO] Erro na operação:', simplifiedErrorMessage);
      }
      
      // Em caso de erro, limpar tokens para forçar regeneração na próxima tentativa
      // 🔧 NOVO: Não limpar tokens para erro de saldo insuficiente
      if (simplifiedErrorMessage !== 'saldo insuficiente para ativar o bot') {
        if (errorMessage.includes('Token') || errorMessage.includes('auth')) {
          setAuthTokens(null);
          console.log('🔧 [RECONEXÃO] Tokens limpos devido ao erro de autenticação');
        } else if (errorMessage.includes('conexão') || errorMessage.includes('WebSocket')) {
        // Para erros de conexão, só limpar tokens se for persistente
        const errorCount = parseInt(localStorage.getItem('bmgbr3_error_count') || '0');
        const newErrorCount = errorCount + 1;
        
        if (newErrorCount >= 2) {
          setAuthTokens(null);
          console.log('🔧 [RECONEXÃO] Tokens limpos após múltiplas falhas de conexão');
          localStorage.removeItem('bmgbr3_error_count');
          setConsecutiveErrors(0);
        } else {
          localStorage.setItem('bmgbr3_error_count', newErrorCount.toString());
          setConsecutiveErrors(newErrorCount);
          console.log('🔧 [RECONEXÃO] Erro de conexão registrado, tentativas:', newErrorCount);
        }
        }
      }
    } finally {
      // 🔧 TIMEOUT: Limpar timeout
      clearTimeout(operationTimeout);
      setOperationLoading(false);
      // 🚫 RESETAR: Garantir que não permita mais mensagens de status após finalizar
      setAllowConnectionStatusMessages(false);
    }
  };

  // 💰 FUNÇÃO REMOVIDA: Modal de estratégia não é mais necessário
  // const handleStrategyConfirm = async (tipValue: number) => {
  //   // Função removida pois agora usamos diretamente o card de banca
  // };

  // 🎯 FUNÇÃO INTELIGENTE: Aposta imediata ou monitoramento baseado no último resultado
  const handleAutoStartBet = async (betType: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high') => {
    if (martingaleSequence.length === 0 || getCurrentStake() < 0.50) {
      return; // Configuração inválida
    }

    // 🔍 VERIFICAR ÚLTIMO RESULTADO para decidir: aposta imediata ou monitoramento
    const lastResult = insightsData?.results?.[0];
    const shouldBetImmediately = lastResult ? checkIfMatchesLastResult(betType, lastResult) : false;

    try {
      // ✅ 1. Bloquear todos os botões após seleção
      setMissionInProgress(true);
      
      // ✅ 2. Selecionar o tipo de aposta localmente
      setM4DirectBetType(betType);
      
      // ✅ 3. Atualizar tipo no backend
      const result = await api.updateBetType(betType);
      if (result.success) {
        
        const betTypeNames = {
          'red': 'VERMELHO',
          'black': 'PRETO', 
          'even': 'PAR',
          'odd': 'ÍMPAR',
          'low': 'BAIXAS (1-18)',
          'high': 'ALTAS (19-36)'
        };
        
        const typeName = betTypeNames[betType];
        
        if (shouldBetImmediately) {
          // 🚀 APOSTA IMEDIATA: Tipo corresponde ao último resultado
          setOperationSuccess(`⚡ APOSTA IMEDIATA! Último resultado foi ${typeName} - Apostando agora!`);
          
          // 🔥 APOSTAR EM MILISEGUNDOS
          setTimeout(async () => {
            try {
              await executeFastBet(betType);
            } catch (error) {
              console.error('Erro na aposta imediata:', error);
              setOperationError('Erro na aposta imediata');
              setTimeout(() => setOperationError(null), 3000);
            }
          }, 100); // 100ms para garantir que a interface atualize
          
        } else {
          // ⏳ MODO MONITORAMENTO: Aguardar próximo resultado do tipo
          setOperationSuccess(`🔍 MONITORAMENTO ATIVO: Aguardando próximo ${typeName}`);
        }
        
        setTimeout(() => setOperationSuccess(null), 3000);
      } else {
        throw new Error(result.error || 'Erro ao atualizar tipo');
      }
      
    } catch (error) {
      console.error('Erro ao atualizar tipo:', error);
      setOperationError('Erro ao selecionar tipo de aposta');
      setTimeout(() => setOperationError(null), 1500);
      setMissionInProgress(false);
    }
  };

  // 🔍 FUNÇÃO: Verificar se o tipo de aposta corresponde ao último resultado
  const checkIfMatchesLastResult = (betType: string, lastResult: any): boolean => {
    const number = lastResult.number;
    const color = lastResult.color;
    
    // Mapear propriedades do número
    const isRed = color === 'red';
    const isBlack = color === 'black';
    const isEven = number !== 0 && number % 2 === 0;
    const isOdd = number !== 0 && number % 2 === 1;
    const isLow = number >= 1 && number <= 18;
    const isHigh = number >= 19 && number <= 36;
    
    // Verificar correspondência
    switch (betType) {
      case 'red': return isRed;
      case 'black': return isBlack;
      case 'even': return isEven;
      case 'odd': return isOdd;
      case 'low': return isLow;
      case 'high': return isHigh;
      default: return false;
    }
  };

  // 🔥 FUNÇÃO: Executar aposta rápida (milisegundos)
  const executeFastBet = async (betType: string) => {
    try {
      // 🚀 CHAMAR API DE APOSTA DIRETA DO BACKEND
      const result = await api.mainApi('execute-immediate-bet', {
        betType: betType,
        stake: getCurrentStake(),
        urgent: true // Flag para prioridade máxima
      });
      
      if (result.success) {
        setOperationSuccess(`✅ Aposta executada: ${betType.toUpperCase()}`);
        // 🔧 CORREÇÃO: NÃO voltar para await após aposta imediata
        // O usuário deve continuar monitorando o tipo selecionado
        setTimeout(() => {
          setMissionInProgress(false);
          // Manter o tipo selecionado para continuar monitoramento
        }, 2000);
      } else {
        throw new Error(result.error || 'Falha na aposta rápida');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setOperationError(`❌ Erro na aposta rápida: ${errorMessage}`);
      // 🔧 CORREÇÃO: Só voltar para await em caso de erro grave
      // setM4DirectBetType('await'); // Removido - manter tipo selecionado
      setMissionInProgress(false);
    }
  };

  // 💰 NOVA FUNÇÃO: Atualizar função de operar
  const handleOperate = async () => {
    if (isOperating || operation.forceDisplay) {
      // Parar operação
      try {
        setOperationLoading(true);
        setOperationError(null);
        setOperationSuccess(null);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('Usuário não autenticado');
        }
        
        const result = await api.stopOperation();

        if (!result.success) {
          throw new Error(result.error || 'Erro ao parar operação');
        }

        setOperationSuccess('Operação interrompida com sucesso!');
        setIsOperating(false);
        setForceOperatingDisplay(false); // ✅ NOVO: Liberar exibição forçada
        setOperationState(null);
        // 🎯 VOLTAR AO MODO AWAIT: Após parar, sempre volta ao wait mode nativo
        setM4DirectBetType('await');
        // 🧹 NOVO: Resetar cache de logs processados ao parar operação
        setLogProcessedGameIds(new Set());
        // 🚫 RESETAR: Não permitir mais mensagens de status
        setAllowConnectionStatusMessages(false);
        // Estado de aguardo removido - modo M4 direto
        setRealModeActivationAttempted(false); // 🔥 NOVO: Resetar flag de tentativa de ativação
        // Estados pendentes removidos
        monitoringRef.current = false;
        
        // 🔧 NOVO: Preservar tokens para próxima operação
        // NÃO limpar authTokens aqui - eles serão reutilizados
        
        // 🔧 NOVO: Manter polling de insights ativo se houver token
        if (authTokens?.ppToken) {
          updatePollingMode('inactive'); // Modo inativo mas mantém polling
        }
        
        // 🔧 NOVO: Limpar contador de erros após parada bem-sucedida
        localStorage.removeItem('bmgbr3_error_count');
        setConsecutiveErrors(0);
        
        // Removed: Stop gain reset
          
        // ✅ CORREÇÃO: Forçar atualização imediata do estado
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        setOperationError(errorMessage);
        // Em caso de erro, também liberar a exibição forçada
        setForceOperatingDisplay(false);
        // 🚫 RESETAR: Não permitir mais mensagens de status em caso de erro
        setAllowConnectionStatusMessages(false);
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

      // ✅ NOVO: Resetar cache de logs processados ao iniciar nova operação
      setLogProcessedGameIds(new Set());
      setLastTenResults([]);

      // ✅ NOVO: Imediatamente forçar exibição como operando
      setForceOperatingDisplay(true);
      
      // 🔧 NOVO: Reativar polling se não estiver ativo
      if (!isInsightsActive) {
        setIsInsightsActive(true);
        startInsightsPolling();
      }
      
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

      // 🎯 NOVO: Sempre iniciar no modo AWAIT (wait mode nativo)
      setM4DirectBetType('await');
      
      // 🔥 ATIVAR: Permitir mensagens de status apenas quando usuário clica manualmente
      setAllowConnectionStatusMessages(true);

      // Usar o primeiro valor da sequência como tipValue e iniciar direto
      const tipValue = martingaleSequence[0];
      await startOperation(tipValue, 'await'); // Iniciar explicitamente em modo await
    }
  };

  // 🔄 MONITORAMENTO SIMPLIFICADO: Apenas para sincronização de estado (não mais logs)
  const startMonitoring = async () => {
    while (monitoringRef.current) {
    try {
      // 🎯 SINCRONIZAÇÃO DE ESTADO: Usar intervalos menores, apenas para estado crítico
      const result = await api.getWebSocketLogs();

      if (result.success && result.data) {
          // 🆘 VERIFICAÇÃO: Detectar mensagens importantes nos logs
          const logs = result.data.logs || [];
          const hasMissionComplete = logs.some((log: any) => log.message?.includes('MISSÃO CUMPRIDA'));
          const hasBetsClosed = logs.some((log: any) => log.message?.includes('Apostas já fechadas'));
          
          if (hasMissionComplete) {
            // ✅ LIBERAR BOTÕES: Missão cumprida, permitir nova seleção
            setMissionInProgress(false);
            // 🔥 CORREÇÃO: NÃO parar operação após missão cumprida - manter ativa para novos triggers
            // setIsOperating(false); // ❌ REMOVIDO: Isso causava desconexão
            console.log('🔥 [FRONTEND] Mantendo isOperating=true após missão cumprida para continuar monitoramento');
            // 🚨 CRÍTICO: Limpar forceDisplay para permitir sincronização
            setOperation(prev => ({ ...prev, forceDisplay: false }));
            // 🎯 VOLTAR AO MODO AWAIT: Após missão cumprida, sempre volta ao wait mode nativo
            setM4DirectBetType('await');
            // 🔥 CRÍTICO: Garantir que polling continue ativo após missão cumprida
            // FORÇAR reativação do polling independente do estado atual
            setIsInsightsActive(true);
            startInsightsPolling();
            
            // Debug removido - sistema funcionando
          }
          
          if (hasBetsClosed) {
            // 🚫 APOSTAS FECHADAS: Voltar ao modo await
            setMissionInProgress(false);
            // 🎯 VOLTAR AO MODO AWAIT: Apostas fechadas, voltar ao aguardar
            setM4DirectBetType('await');
            // 🔥 CRÍTICO: Garantir que polling continue ativo após apostas fechadas
            setIsInsightsActive(true);
            startInsightsPolling();
            console.log('🚫 [FRONTEND] Apostas fechadas detectadas - voltando ao modo await e mantendo polling ativo');
          }
          
          // 🔇 ATUALIZAÇÃO SILENCIOSA: lastTenResults se necessário
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
          
          if (newOperationActive !== operation.isActive) {
            console.log('🔧 [FRONTEND] Atualizando operation.isActive:', {
              anterior: operation.isActive,
              novo: newOperationActive,
              timestamp: new Date().toLocaleTimeString()
            });
            setOperation(prev => ({ ...prev, isActive: newOperationActive }));
          }
          
          if (JSON.stringify(newOperationState) !== JSON.stringify(operationState)) {
            setOperationState(newOperationState);
            
                      // 🔄 NOVO: Sincronizar tipo de aposta com o backend
          if (newOperationState?.m4DirectBetType && newOperationState.m4DirectBetType !== m4DirectBetType) {
            // Log de debug removido - sistema funcionando
            setM4DirectBetType(newOperationState.m4DirectBetType);
          }
          }
          
          // 🆘 CORREÇÃO: Sincronizar m4DirectBetType mesmo se operationState não mudou completamente  
          if (newOperationState?.m4DirectBetType && newOperationState.m4DirectBetType !== m4DirectBetType) {
            setM4DirectBetType(newOperationState.m4DirectBetType);
          }
          
          // 🚀 CORREÇÃO AGRESSIVA: Sempre sincronizar m4DirectBetType se existir
          if (newOperationState?.m4DirectBetType) {
            const currentBetType = m4DirectBetType;
            const backendBetType = newOperationState.m4DirectBetType;
            if (currentBetType !== backendBetType) {
              console.log('🚀 [FRONTEND] Sincronização agressiva m4DirectBetType:', {
                frontend: currentBetType,
                backend: backendBetType,
                timestamp: new Date().toLocaleTimeString()
              });
              setM4DirectBetType(backendBetType);
            }
          }
          
          // ✅ CORREÇÃO: Sincronizar isOperating com operationActive da API
          const apiOperationActive = result.data.operationActive || false;
          const apiConnected = result.data.connectionStatus?.connected || false;
          
          // 🔄 Sincronizar estado da operação - SEMPRE quando necessário
          if (isOperating !== apiOperationActive) {
            // Log de debug removido - sistema funcionando
            setIsOperating(apiOperationActive);
            
            // Removed: Auto Bot counter reset
          }
          
          // 🔄 Se desconectado, garantir que isOperating seja false
          if (!apiConnected && isOperating) {
            console.log('🔌 [FRONTEND] Conexão perdida - parando operação');
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

        // 🎯 POLLING INTELIGENTE: Reduzido para evitar sobrecarga e erro 429
  const pollingInterval = isOperating ? 5000 : 10000; // 5s quando operando, 10s quando inativo
  await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
    
  };

  // Buscar relatório (usando hook customizado)
  const fetchOperationReport = async () => {
    try {
      const result = await api.getOperationReport();

      if (result.success && result.data) {
        setOperationReport(result.data);
      }

    } catch (error) {
    }
  };

  // Reset relatório (usando hook customizado)
  const resetOperationReport = async () => {
    try {
      const result = await api.resetOperationReport();

      if (result.success) {
        await fetchOperationReport();
      }

    } catch (error) {
    }
  };

  // 2. Função para atualizar o backend sempre que o switch mudar (usando hook)
  useEffect(() => {
    if (!userIdRef.current) return;
    api.mainApi('update-strategy', {
      selectedStake: getCurrentStake() // <-- Enviar o stake selecionado
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
          const result = await api.updateBetType(m4DirectBetType === 'await' ? 'await' : m4DirectBetType);
        if (result.success) {
          console.log('Tipo de aposta atualizado:', result.message);
          
          // 🎯 NOVO: Se houve reset para M1 N1, atualizar visualmente
          if (result.resetToM1) {
            // Forçar atualização do relatório para mostrar reset visual
            setTimeout(() => {
              fetchOperationReport();
            }, 500);
            
            // Mostrar notificação específica de mudança de tipo
            const betTypeNames = {
              'await': 'AGUARDAR',
              'red': 'VERMELHO',
              'black': 'PRETO',
              'even': 'PAR',
              'odd': 'ÍMPAR',
              'low': 'BAIXAS (1-18)',
              'high': 'ALTAS (19-36)'
            };
            
            const typeName = betTypeNames[m4DirectBetType as keyof typeof betTypeNames];
            setOperationSuccess(`🎯 Tipo alterado para ${typeName} - Reiniciado no M1 N1`);
            setTimeout(() => setOperationSuccess(null), 4000);
          } else {
            // Notificação padrão para mudanças sem reset
            setOperationSuccess(`✅ ${result.message}`);
            setTimeout(() => setOperationSuccess(null), 2000);
          }
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

  // 🛡️ NOVO: Ativação automática simplificada do modo real
  useEffect(() => {
    // Só executar se bot estiver operando e modo M4 direto ativado
    if (!isOperating || !operationState || !m4DirectModeEnabled || realModeActivationAttempted) {
      return;
    }

    // Throttling simples: só verificar a cada 5 segundos
    const now = Date.now();
    if (now - lastActivationCheckRef.current < 5000) {
      return;
    }
    lastActivationCheckRef.current = now;

    // Ativar modo real imediatamente no modo M4 direto
    setRealModeActivationAttempted(true);
    
    const activateRealMode = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const response = await fetch('/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            action: 'activate-real-mode',
            m4DirectMode: true,
            m4DirectBetType: m4DirectBetType
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
  }, [isOperating, operationState, m4DirectModeEnabled, realModeActivationAttempted, m4DirectBetType]);

  // Removed: Auto Bot effects

  // 🔧 NOVO: Efeito para detectar mudanças no estado de "aguardando resultado"
  // 🔧 Monitoramento de debug removido - funcionalidade simplificada

  // 🔧 NOVO: Limpar estado de debug quando operação termina
  useEffect(() => {
    if (!isOperating && !operation.forceDisplay) {
      setLastProcessedInsightGameId(null); // Limpar histórico de processamento
      previousBetTypeRef.current = null; // Resetar referência do tipo de aposta
    }
  }, [isOperating, operation.forceDisplay]);



  // NOVO: Controle inteligente do botão baseado no padrão E janela de apostas
      const hasCompletePattern = lastTenResults.length >= 10;
  const canStartOperation = hasCompletePattern && bettingWindow.isOpen && !operation.isActive;
  
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



  




         
         // 🤖 NOVO: Sistema reativado - monitora logs para TRIGGER
    useEffect(() => {
      if (!websocketLogs.length) return;
      
      // Procurar por TRIGGER nos logs recentes
      const recentTriggerLog = websocketLogs
        .slice(-5) // Últimos 5 logs
        .find(log => log.message?.includes('TRIGGER DETECTADO'));
      
      if (recentTriggerLog && m4DirectBetType !== 'await') {
        console.log(`✅ SISTEMA FUNCIONANDO: ${recentTriggerLog.message}`);
      }
      
      // Procurar por aposta executada
      const recentBetLog = websocketLogs
        .slice(-3) // Últimos 3 logs  
        .find(log => log.message?.includes('APOSTA IMEDIATA') || log.message?.includes('⚡'));
        
      if (recentBetLog) {
        console.log(`💰 APOSTA EXECUTADA: ${recentBetLog.message}`);
      }
      
    }, [websocketLogs, m4DirectBetType]);
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
        const response = await fetch('/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr', {
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
        const response = await fetch('/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr', {
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
      
      {/* 🗑️ REMOVIDO: Indicador de sessão inativa */}
      
      <div className="relative z-10 p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-sm sm:max-w-2xl lg:max-w-4xl xl:max-w-6xl mx-auto space-y-4 sm:space-y-6">
          


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
              w-full p-3 sm:p-4 rounded-xl sm:rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:scale-[1.02]
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
          <Card className="border-gray-700/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
                <Coins className="h-5 w-5" />
                CRÉDITOS
              </CardTitle>
              <CardDescription className="text-gray-400 font-mono text-xs">
                {`// Saldo para operações`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Saldo Créditos */}
                <div className="text-center py-4">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <Coins className="h-8 w-8 text-green-400" />
                    <div className="text-3xl font-bold text-green-400 font-mono">
                      {creditsLoading ? '...' : `${creditsBalance?.toFixed(2) || '0.00'}`}
                    </div>
                  </div>
                  <div className="text-sm text-gray-400 font-mono">
                    DISPONÍVEL
                  </div>
                </div>
                
                {/* Botão Comprar Créditos */}
                <Button
                  onClick={() => setCreditModalOpen(true)}
                  className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono text-sm"
                  variant="outline"
                >
                  <Coins className="h-4 w-4 mr-2" />
                  COMPRAR_CRÉDITOS
                </Button>
              </div>
            </CardContent>
          </Card>



          


            


          {/* Card Operação */}
              <Card className="border-gray-700/30 backdrop-blur-sm">
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
                
                {/* Cards de Estatísticas */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
                  {/* Card APOSTAS */}
                  <div className="p-2 sm:p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="text-center">
                      <div className="text-gray-400 text-xs font-mono mb-1">APOSTAS</div>
                      <div className="text-blue-400 text-sm sm:text-lg font-mono font-bold">
                        {operationReport?.summary.totalBets || 0}
                      </div>
                    </div>
                  </div>
                  
                  {/* Card LUCRO */}
                  <div className="p-2 sm:p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="text-center">
                      <div className="text-gray-400 text-xs font-mono mb-1">LUCRO</div>
                      <div className={`text-sm sm:text-lg font-mono font-bold ${
                        (operationReport?.summary.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        R$ {(operationReport?.summary.profit || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Card CONSUMO */}
                  <div className="p-2 sm:p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                    <div className="text-center">
                      <div className="text-gray-400 text-xs font-mono mb-1">CONSUMO</div>
                      <div className="text-orange-400 text-sm sm:text-lg font-mono font-bold">
                        R$ 0,00
                      </div>
                    </div>
                  </div>
                </div>

                
                                {/* 📈 HISTÓRICO: Últimos resultados responsivo (10 desktop / 5 mobile) */}
                {insightsData && insightsData.results && Array.isArray(insightsData.results) && insightsData.results.length > 0 && (
                  <div className="space-y-3">
                    <div className="w-full mx-auto p-2 sm:p-4 bg-gray-800/20 border border-gray-600/30 rounded-lg">
                        <div className={`grid gap-1 sm:gap-2 lg:gap-3 auto-rows-fr ${
                          visibleResultsCount === 5 
                            ? 'grid-cols-5' // Mobile: 5 resultados em 1 linha
                            : 'grid-cols-5 sm:grid-cols-10' // Desktop: 10 resultados em 2 linhas no mobile, 1 linha no desktop
                        }`}>
                        {/* ✅ CORREÇÃO: Usar dados memorizados sem tooltips */}
                        {memoizedInsightsResults.map((result) => (
                          <ResultRouletteSlot
                            key={result.id}
                            number={result.number}
                            gameId={result.gameId}
                            timestamp={result.timestamp}
                            index={result.index}
                            isRed={result.isRed}
                            isGreen={result.isGreen}
                          />
                        ))}
                        

                      </div>
                    </div>
                    
                    {/* 🕐 TIMESTAMP CRÍTICO: Para monitorar se polling está funcionando */}
                    {insightsData && insightsData.lastUpdate && (
                      <div className="text-center mt-2">
                        <p className="text-xs font-mono flex items-center justify-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            Date.now() - insightsData.lastUpdate < 10000 
                              ? 'bg-green-400 animate-pulse' // Verde pulsando se atualizado nos últimos 10s
                              : Date.now() - insightsData.lastUpdate < 30000
                                ? 'bg-yellow-400' // Amarelo se entre 10-30s
                                : 'bg-red-400' // Vermelho se mais de 30s
                          }`}></span>
                                                    <span className="text-gray-500">
                            Última atualização: {new Date(insightsData.lastUpdate).toLocaleTimeString()}
                          </span>
                        </p>
                      </div>
                    )}

                  </div>
                )}
                
                {/* 🔥 SEÇÃO: Insights de Dados - Cards de Seleção */}
                <div className="p-2 sm:p-3 rounded-lg bg-gray-800/20 border border-gray-600/30 space-y-2 sm:space-y-3">
                  
                  {/* 🔥 CARDS DE INSIGHTS - MOVIDOS DO CARD INSIGHTS DE DADOS */}
                  {!insightsComparison.hasData ? (
                    <div className="text-center py-4">
                      <div className="text-gray-400 mb-2 font-mono text-sm">AGUARDANDO_DADOS</div>
                      <div className="text-xs text-gray-500 font-mono">
                        // Coletando dados em tempo real
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2 w-full">
                      {/* ✅ GRID 2x3 COMPACTO: Linha 1 - Vermelho + Preto */}
                      <InsightCard
                        title="VERMELHO"
                        color=""
                        bgColor=""
                        borderColor=""
                        hoverColor=""
                        rounds={insightsComparison.roundsSinceLastSequence?.red || '--'}
                        selectedBetType={m4DirectBetType}
                      />
                      
                      <InsightCard
                        title="PRETO"
                        color=""
                        bgColor=""
                        borderColor=""
                        hoverColor=""
                        rounds={insightsComparison.roundsSinceLastSequence?.black || '--'}
                        selectedBetType={m4DirectBetType}
                      />
                      
                      {/* ✅ GRID 2x3 COMPACTO: Linha 2 - Par + Ímpar */}
                      <InsightCard
                        title="PAR"
                        color=""
                        bgColor=""
                        borderColor=""
                        hoverColor=""
                        rounds={insightsComparison.roundsSinceLastSequence?.even || '--'}
                        selectedBetType={m4DirectBetType}
                      />
                      
                      <InsightCard
                        title="ÍMPAR"
                        color=""
                        bgColor=""
                        borderColor=""
                        hoverColor=""
                        rounds={insightsComparison.roundsSinceLastSequence?.odd || '--'}
                        selectedBetType={m4DirectBetType}
                      />
                      
                      {/* ✅ GRID 2x3 COMPACTO: Linha 3 - Baixas + Altas */}
                      <InsightCard
                        title="BAIXAS (1-18)"
                        color=""
                        bgColor=""
                        borderColor=""
                        hoverColor=""
                        rounds={insightsComparison.roundsSinceLastSequence?.low || '--'}
                        selectedBetType={m4DirectBetType}
                      />
                      
                      <InsightCard
                        title="ALTAS (19-36)"
                        color=""
                        bgColor=""
                        borderColor=""
                        hoverColor=""
                        rounds={insightsComparison.roundsSinceLastSequence?.high || '--'}
                        selectedBetType={m4DirectBetType}
                      />
                          </div>
                                    )}
                  
                  <div className="mt-2 space-y-1 text-xs font-mono text-center">
                    <div className="text-gray-500">
                      <span>Tipo selecionado: <span className="text-purple-400">{
                        m4DirectBetType === 'await' ? 'AGUARDAR' :
                        m4DirectBetType === 'red' ? 'VERMELHO' :
                        m4DirectBetType === 'black' ? 'PRETO' :
                        m4DirectBetType === 'even' ? 'PAR' :
                        m4DirectBetType === 'odd' ? 'ÍMPAR' :
                        m4DirectBetType === 'low' ? 'BAIXAS (1-18)' :
                        'ALTAS (19-36)'
                      }</span></span>
                    </div>
                    
                    {/* ⏰ INDICADOR JANELA ATIVA */}
                                          {isOperating && m4DirectBetType === 'await' && (
                        <div className={`transition-all duration-300 ${
                          bettingWindow.isOpen 
                            ? 'text-green-400' 
                            : 'text-red-400'
                        }`}>
                          {bettingWindow.isOpen ? (
                            <span className="animate-pulse">🟢 Apostas abertas - Botões ativos</span>
                          ) : (
                            <span>🔴 Apostas fechadas - Aguardando abertura...</span>
                          )}
                        </div>
                      )}
                  </div>
                        </div>

                {/* Botões de Controle */}
                <div className="space-y-2">
                  {/* Botão Principal - Começar/Parar Apostas */}
                  <Button 
                    onClick={handleOperate}
                    disabled={
                      operationLoading || 
                      !isConfigured || 
                      ((isOperating || operation.forceDisplay) && isRealOperation && !canSafelyStop) || // ✅ NOVO: Desabilita quando operando em modo REAL e não é seguro parar
                      (!(isOperating || operation.forceDisplay) && martingaleSequence.length === 0) // ✅ NOVO: Desabilita se não há sequência válida
                    }
                    className={`w-full font-mono ${
                      (isOperating || operation.forceDisplay)
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
                    ) : (isOperating || operation.forceDisplay) ? (
                      <Square className="h-4 w-4 mr-2" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    {operationLoading 
                      ? operationError?.includes('Verificando') ? operationError : 'CONECTANDO...'
                      : ((isOperating || operation.forceDisplay) && (connectionStatus.connected || operation.forceDisplay)) 
                        ? 'PARAR'
                        : martingaleSequence.length === 0
                          ? 'CONFIGURE SUA BANCA'
                          : 'COMEÇAR'
                    }
                  </Button>

                  {/* ✅ NOVO: Mostrar informações da estratégia quando não operando */}

                  {/* 🔧 NOVO: Botão para forçar regeneração de tokens */}
                  {!isOperating && !operation.forceDisplay && operationError && !operationLoading && 
                   (operationError.includes('conexão') || operationError.includes('Timeout') || operationError.includes('Token') || operationError.includes('WebSocket')) && (
                    <Button 
                      onClick={forceTokenRegeneration}
                      className={`w-full font-mono transition-all duration-300 ${
                        consecutiveErrors > 1
                          ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 animate-pulse'
                          : 'bg-orange-500/20 border border-orange-500/50 text-orange-400 hover:bg-orange-500/30'
                      }`}
                      variant="outline"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {consecutiveErrors > 1 ? 'RECONEXÃO URGENTE' : 'FORÇAR RECONEXÃO'}
                    </Button>
                  )}

                </div>
                
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


                
                {/* Logs do WebSocket - Sempre que houver logs */}
                {websocketLogs.length > 0 && (
                  <div className="space-y-2">

                    <div className="max-h-64 overflow-y-auto p-3 bg-gray-800/20 border border-gray-600/30 rounded-lg space-y-1">
                      {websocketLogs.filter(log => 
                        !log.message.includes('🎰 Janela de apostas') && 
                        !log.message.includes('Apostas abertas') && 
                        !log.message.includes('Apostas fechadas')
                      ).filter((log, index, array) => {
                        // 🛡️ FILTRO DE DUPLICAÇÃO: Para logs de resultado, manter apenas o primeiro de cada gameId
                        if (log.message.includes('🎯 Resultado:') && log.message.includes('(ID:')) {
                          const gameIdMatch = log.message.match(/\(ID: (\d+)\)/);
                          if (gameIdMatch) {
                            const gameId = gameIdMatch[1];
                            // Verificar se este é o primeiro log com este gameId
                            const firstIndex = array.findIndex(l => 
                              l.message.includes('🎯 Resultado:') && 
                              l.message.includes(`(ID: ${gameId})`)
                            );
                            return index === firstIndex;
                          }
                        }
                        // Para outros tipos de log, manter todos
                        return true;
                      }).slice(0, visibleResultsCount * 2).map((log, index) => (
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

                {/* Informações da Sessão */}
                {operationReport?.summary.startedAt && (
                  <div className="text-sm font-mono p-2 bg-gray-800/20 border border-gray-600/30 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Iniciado:</span>
                      <span className="text-gray-300">
                        {new Date(
                          typeof operationReport.summary.startedAt === 'number' 
                            ? operationReport.summary.startedAt 
                            : operationReport.summary.startedAt
                        ).toLocaleTimeString('pt-BR')}
                      </span>
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


                {/* ✅ Seção de stakes movida para card separado CONTROLE_BANCA */}





                    </div>
            </CardContent>
          </Card>

          {/* 💰 Card Controle de Banca */}
          <Card className="border-gray-700/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-400 font-mono">
                <Settings className="h-5 w-5" />
                CONTROLE_BANCA
              </CardTitle>
              <CardDescription className="text-gray-400 font-mono text-xs">
                // Configure o multiplicador da sua banca
              </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="p-2 sm:p-3 bg-gray-800/20 border border-gray-600/30 rounded-lg space-y-2 sm:space-y-3">
                  <label className="text-sm font-semibold text-blue-400 font-mono">
                  Controle de Banca (Multiplicador)
                  </label>
                <div className="text-xs text-gray-400 font-mono">
                  Ajuste o multiplicador da banca (1x a 5x)
                </div>
                
                {/* Aviso quando bloqueado */}
                {isOperating && (
                  <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                    <div className="text-xs text-orange-400 font-mono flex items-center gap-1">
                      🔒 Multiplicador bloqueado durante operação ativa
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {/* Multiplicador */}
                    <div className="flex items-center gap-2">
                      {/* Botão Menos */}
                      <button
                        onClick={() => {
                              const newMultiplier = Math.max(1, stakeMultiplier - 1);
    setStakeMultiplier(newMultiplier);
    updateStakeMultiplier(newMultiplier);
                        }}
                        disabled={stakeMultiplier <= 1 || isOperating}
                        className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-700/50 border border-gray-600/50 rounded-lg text-gray-300 font-bold text-sm hover:bg-gray-600/50 hover:border-gray-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        -
                      </button>
                      
                    {/* Input do Multiplicador */}
                        <input
                      type="number"
                      min="1"
                      max="5"
                      step="1"
                      value={stakeMultiplier}
                      onChange={(e) => {
                        const value = Math.max(1, Math.min(5, parseInt(e.target.value) || 1));
                        setStakeMultiplier(value);
                        updateStakeMultiplier(value);
                      }}
                      disabled={isOperating}
                      className="w-full h-8 sm:h-10 bg-gray-800/50 border border-gray-600/50 rounded-lg text-center text-white font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="1-5x"
                    />
                      
                      {/* Botão Mais */}
                      <button
                        onClick={() => {
                              const newMultiplier = Math.min(5, stakeMultiplier + 1);
    setStakeMultiplier(newMultiplier);
    updateStakeMultiplier(newMultiplier);
                        }}
                        disabled={stakeMultiplier >= 5 || isOperating}
                        className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-700/50 border border-gray-600/50 rounded-lg text-gray-300 font-bold text-sm hover:bg-gray-600/50 hover:border-gray-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  
                  
                  {/* Tabela de Todos os Níveis */}
                  <div className="mt-4 pt-4 border-t border-gray-600/30">
                    <div className="text-xs text-blue-400 font-mono font-semibold mb-3">
                      TABELA COMPLETA - 12 NÍVEIS (Multiplicador: {stakeMultiplier}x)
                    </div>
                    
                    <div className="max-h-48 overflow-y-auto overflow-x-auto border border-gray-600/30 rounded-lg bg-gray-900/30">
                      <table className="w-full text-xs font-mono min-w-[300px]">
                        <thead className="sticky top-0 bg-gray-800/80 border-b border-gray-600/30">
                          <tr>
                            <th className="px-2 py-1 text-left text-gray-400">Nível</th>
                            <th className="px-2 py-1 text-right text-gray-400">Aposta</th>
                            <th className="px-2 py-1 text-right text-gray-400">Custo</th>
                            <th className="px-2 py-1 text-right text-gray-400">Lucro</th>
                          </tr>
                        </thead>
                        <tbody>
                          {STAKE_LEVELS.map((level, index) => (
                            <tr key={level.level} className={`border-b border-gray-700/20 hover:bg-gray-800/20 ${index % 2 === 0 ? 'bg-gray-800/10' : ''}`}>
                              <td className="px-2 py-1 text-white font-semibold">{level.level}</td>
                              <td className="px-2 py-1 text-right text-yellow-400">
                                {formatCurrency(level.m2 * stakeMultiplier)}
                              </td>
                              <td className="px-2 py-1 text-right text-green-400">
                                {formatCurrency(level.cost * stakeMultiplier)}
                              </td>
                              <td className="px-2 py-1 text-right text-blue-400">
                                {formatCurrency(calculateRealProfit(level.level))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
              className="w-full p-2 sm:p-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
            <p className="text-xs text-gray-400 font-mono">
              {`// Token será criptografado e armazenado com segurança`}
            </p>
          </div>

          <div className="p-3 sm:p-4 bg-gray-800/20 border border-gray-600/30 rounded-lg">
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

      {/* 🗑️ REMOVIDO: Modal de Controle de Sessão */}

      {/* Modal de Compra de Créditos */}
      {user && (
        <CreditPurchaseModal
          isOpen={creditModalOpen}
          onClose={() => setCreditModalOpen(false)}
          onSuccess={(amount: number, transactionId: string) => {
            // Não é necessário fazer nada específico aqui pois o hook useCredits
            // já atualiza automaticamente quando há mudanças
            console.log(`✅ Créditos adicionados: ${amount}`);
          }}
          userId={user.id}
        />
      )}

      {/* Modal de Estratégia Removido - Agora usamos diretamente o card CONFIGURAR_BANCA */}
    </div>
  );
} 

