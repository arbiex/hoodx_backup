/**
 * 🎯 BLAZE MEGA ROULETTE BR - VERSÃO PRINCIPAL
 * 
 * Esta é uma cópia da página BMG para operações na Blaze Mega Roulette BR.
 * 
 * API: /api/bmgbr/blaze/pragmatic/blaze-megarouletebr
 * Página: /blaze-megaroulettebr
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, RefreshCw, Zap, Key, Settings, BarChart3 } from 'lucide-react';
import MatrixRain from '@/components/MatrixRain';
import Modal, { useModal } from '@/components/ui/modal';
import InlineAlert from '@/components/ui/inline-alert';
import CreditDisplay from '@/components/CreditDisplay';

import OperationsCard from '@/components/OperationsCard';
import GameStatisticsCard from '@/components/GameStatisticsCard';





export default function BlazeMegaRouletteBR() {
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

  // 💰 NOVO: Estados para sistema de banca e sugestão de stake
  const [userBanca, setUserBanca] = useState<number>(150); // Banca inicial do usuário
  const [userBancaFormatted, setUserBancaFormatted] = useState<string>('150,00'); // Valor formatado para o input
  const [suggestedStake, setSuggestedStake] = useState<number>(0.50); // Stake sugerido baseado na banca
  const [selectedStake, setSelectedStake] = useState<number>(0.50);
  const [martingaleSequence, setMartingaleSequence] = useState<number[]>([]);
  const [totalMartingaleAmount, setTotalMartingaleAmount] = useState<number>(0);
  
  // Valores de stake: R$ 0,50 até R$ 200,00 (múltiplos de 0.50)

  // Estados para WebSocket logs
  const [websocketLogs, setWebsocketLogs] = useState<Array<{ 
    timestamp: number; 
    message: string; 
    type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' 
  }>>([]);

  // Estados para últimos 7 resultados (nova estratégia)
  const [lastSevenResults, setLastSevenResults] = useState<Array<{ 
    number: number; 
      color: string;
    gameId: string; 
    timestamp: number 
  }>>([]);

  // 📊 NOVO: Estado para rastreamento de uso do martingale (agora M1-M4)
  const [martingaleUsage, setMartingaleUsage] = useState<number[]>(new Array(4).fill(0));
  
  // 📊 NOVO: Estado para rastreamento de rodadas analisadas por nível
  const [analysisRounds, setAnalysisRounds] = useState<number[]>(new Array(4).fill(0));

  // 📈 NOVO: Estado para rastreamento do histórico de apostas
  const [betHistory, setBetHistory] = useState<Array<{ 
    type: 'win' | 'loss'; 
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

  // 📋 NOVO: Estado para histórico detalhado de análises e apostas reais
  const [detailedHistory, setDetailedHistory] = useState<Array<{
    id: string;
    timestamp: number;
    mode: 'analysis' | 'real';
    martingaleLevel: number;
    betColor: 'R' | 'B';
    resultColor: string;
    resultNumber: number;
    gameId: string;
    isWin: boolean;
    betAmount: number;
    profit: number;
    sequencePosition: string;
  }>>([]);

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

  // 🎯 NOVO: Estado para controlar Stop Gain (null = desabilitado)
  const [stopGainPercentage, setStopGainPercentage] = useState<number | null>(null);

  // 🎯 NOVO: Flag para identificar parada automática por stop gain
  const [isStopGainTriggered, setIsStopGainTriggered] = useState(false);

  // 🛡️ NOVO: Sistema de controle de segurança por status
  const [allowedStatuses, setAllowedStatuses] = useState<string[]>([]);
  const [waitingForSafeStatus, setWaitingForSafeStatus] = useState(false);
  const [currentGameStatus, setCurrentGameStatus] = useState<string>('Aguardando');

  // 💰 NOVA FUNÇÃO: Calcular sequência de martingale baseada no stake
  const calculateMartingaleSequence = (stake: number): number[] => {
    if (stake <= 0) return [];
    
    const sequence: number[] = [];
    
    // M1 = 1 stake
    const m1 = stake;
    sequence.push(m1);
    
    // M2 = Dobra o valor do M1 + 2 stakes
    const m2 = (m1 * 2) + (stake * 2);
    sequence.push(m2);
    
    // M3 = Dobra o valor M2 + 2 stakes
    const m3 = (m2 * 2) + (stake * 2);
    sequence.push(m3);
    
    // M4 = Dobra o valor do M3 + 2 stakes
    const m4 = (m3 * 2) + (stake * 2);
    sequence.push(m4);
    
    return sequence;
  };

  // 💰 NOVA FUNÇÃO: Calcular valor total acumulado
  const calculateTotalAmount = (sequence: number[]): number => {
    return sequence.reduce((total, value) => total + value, 0);
  };

  // 💰 EFEITO: Recalcular sequência quando stake muda
  useEffect(() => {
    const newSequence = calculateMartingaleSequence(selectedStake);
    setMartingaleSequence(newSequence);
    setTotalMartingaleAmount(calculateTotalAmount(newSequence));
  }, [selectedStake]);

  // 💰 EFEITO: Recalcular melhor stake quando banca muda
  useEffect(() => {
    const newSuggestedStake = calculateBestStake(userBanca);
    setSuggestedStake(newSuggestedStake);
    setSelectedStake(newSuggestedStake); // Aplicar automaticamente a sugestão
  }, [userBanca]);

  // 💰 EFEITO: Inicializar sequência na primeira renderização
  useEffect(() => {
    if (martingaleSequence.length === 0) {
      const initialSequence = calculateMartingaleSequence(selectedStake);
      setMartingaleSequence(initialSequence);
      setTotalMartingaleAmount(calculateTotalAmount(initialSequence));
    }
  }, []);

  // 🎯 EFEITO: Monitorar Stop Gain e parar automaticamente
  useEffect(() => {
    if (stopGainPercentage !== null && (isOperating || forceOperatingDisplay) && operationReport) {
      const targetProfit = calculateStopGainTarget(userBanca, stopGainPercentage);
      const currentProfit = operationReport.summary.profit;
      
      if (currentProfit >= targetProfit) {
        // Definir flag antes de parar
        setIsStopGainTriggered(true);
        
        // Parar automaticamente (não resetar stop gain quando parar por meta)
        if (isOperating || forceOperatingDisplay) {
          handleOperate();
          
          // Mostrar mensagem de sucesso específica para stop gain
          setTimeout(() => {
            setOperationSuccess(`🎯 Stop Gain atingido! Meta: ${formatCurrency(targetProfit)}, Lucro: ${formatCurrency(currentProfit)}`);
            setIsStopGainTriggered(false); // Resetar flag após mostrar mensagem
          }, 1000);
        }
      }
    }
  }, [stopGainPercentage, isOperating, forceOperatingDisplay, operationReport?.summary.profit, userBanca]);

  // 🛡️ NOVO: Monitoramento automático para ativar modo real quando status melhorar
  useEffect(() => {
    // Só executar se estiver aguardando status seguro e regra estiver ativa
    if (!waitingForSafeStatus || !currentGameStatus || !isOperating || allowedStatuses.length === 0) return;

    // Verificar se o status atual agora é permitido
    if (allowedStatuses.includes(currentGameStatus)) {
      console.log(`🛡️ Status melhorou para "${currentGameStatus}" - Ativando modo real automaticamente`);
      
      // Resetar estado de aguardo
      setWaitingForSafeStatus(false);
      
      // Notificar usuário
      setOperationSuccess(`✅ Status seguro detectado: ${currentGameStatus}! Bot ativou automaticamente o modo real.`);
      
      // Enviar comando para API ativar modo real
      const activateRealMode = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          
          const response = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              action: 'activate-real-mode',
              allowedStatuses: allowedStatuses.length > 0 ? allowedStatuses : null
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
    }
  }, [waitingForSafeStatus, currentGameStatus, allowedStatuses, isOperating]);

  // 🛡️ NOVO: Função para enviar configuração de status seguro para API
  const updateSafetyConfig = async (config: { allowedStatuses: string[]; waitingForSafeStatus: boolean; currentGameStatus: string }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const response = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          action: 'update-strategy',
          safetyConfig: config
        }),
      });

      if (!response.ok) {
        console.error('Erro ao atualizar configuração de segurança');
      }
    } catch (error) {
      console.error('Erro ao atualizar configuração de segurança:', error);
    }
  };

  // 🛡️ NOVO: Effect para enviar configuração quando mudar
  useEffect(() => {
    if (allowedStatuses.length > 0 || waitingForSafeStatus || currentGameStatus !== 'Aguardando') {
      updateSafetyConfig({
        allowedStatuses,
        waitingForSafeStatus,
        currentGameStatus
      });
    }
  }, [allowedStatuses, waitingForSafeStatus, currentGameStatus]);

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

  // 💰 NOVA FUNÇÃO: Calcular banca ideal arredondando para cima no próximo múltiplo de 50
  const calculateBancaIdeal = (totalAmount: number): number => {
    const baseValue = totalAmount * 6; // x6 conforme configurado
    return Math.ceil(baseValue / 50) * 50; // Arredonda para cima no próximo múltiplo de 50
  };

  // 💰 NOVA FUNÇÃO: Calcular melhor stake baseado na banca do usuário
  const calculateBestStake = (banca: number): number => {
    // Banca deve ser pelo menos 6x o valor total do martingale
    // Vamos encontrar o maior stake possível onde (total * 6) <= banca
    
    // Começar com um stake inicial e testar
    let bestStake = 0.50;
    
    // Testar stakes de 0.50 até 200.00
    for (let stake = 0.50; stake <= 200.00; stake += 0.50) {
      const sequence = calculateMartingaleSequence(stake);
      const totalAmount = calculateTotalAmount(sequence);
      const requiredBanca = totalAmount * 6;
      
      if (requiredBanca <= banca) {
        bestStake = stake;
      } else {
        break; // Parar quando ultrapassar a banca
      }
    }
    
    return bestStake;
  };

  // 💰 NOVA FUNÇÃO: Calcular aproveitamento da banca (%)
  const calculateBancaUtilization = (banca: number, stake: number): number => {
    const sequence = calculateMartingaleSequence(stake);
    const totalAmount = calculateTotalAmount(sequence);
    const requiredBanca = totalAmount * 6;
    
    return (requiredBanca / banca) * 100;
  };

  // 🎯 NOVA FUNÇÃO: Calcular valor alvo do Stop Gain
  const calculateStopGainTarget = (banca: number, percentage: number): number => {
    return (banca * percentage) / 100;
  };

  // 📊 FUNÇÃO SIMPLIFICADA: Agora os dados vêm diretamente da API
  const processMartingaleLogs = (logs: any[]) => {
    // Função mantida para compatibilidade, mas os dados principais vêm da API
    // Pode ser usada para processamento adicional se necessário
  };

  // 🔄 NOVA FUNÇÃO: Resetar estatísticas de martingale quando operação iniciar
  const resetMartingaleStats = () => {
    setMartingaleUsage(new Array(4).fill(0)); // Agora M1-M4
    setAnalysisRounds(new Array(4).fill(0)); // Resetar rodadas analisadas
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
    setLastSevenResults([]);
  };

  // 📈 NOVA FUNÇÃO: Processar logs para identificar vitórias e derrotas
  const processBetResults = (logs: any[]) => {
    // Procurar por logs específicos de vitória e derrota do backend
    const resultLogs = logs.filter(log => 
      log.message.includes('✅ VITÓRIA M') || 
      log.message.includes('❌ DERROTA M')
    );

    resultLogs.forEach(log => {
      const isWin = log.message.includes('✅ VITÓRIA M');
      const isLoss = log.message.includes('❌ DERROTA M');

      if (isWin || isLoss) {
        // Extrair informações específicas das mensagens do backend
        // Exemplo: "✅ VITÓRIA M3! Apostou Vermelho R$ 21.00 → Veio Vermelho"
        // Exemplo: "❌ DERROTA M2! Apostou Preto R$ 20.00 → Veio Vermelho"
        
        const gameIdMatch = log.message.match(/Game[:\s]+(\d+)/i);
        const martingaleLevelMatch = log.message.match(/M(\d+)!/);
        const valueMatch = log.message.match(/R\$\s*([\d,]+\.?\d*)/);
        
        // Criar identificador único baseado no timestamp e nível de martingale
        const uniqueId = `${log.timestamp || Date.now()}-${martingaleLevelMatch?.[1] || 'unknown'}`;

        const newBet = {
          type: isWin ? 'win' as const : 'loss' as const,
          timestamp: log.timestamp || Date.now(),
          value: valueMatch ? parseFloat(valueMatch[1].replace(',', '')) : 0,
          gameId: gameIdMatch ? gameIdMatch[1] : uniqueId,
          martingaleLevel: martingaleLevelMatch ? parseInt(martingaleLevelMatch[1]) : undefined
        };

        // Verificar se já existe este resultado no histórico (evitar duplicatas)
        setBetHistory(prev => {
          const exists = prev.some(bet => 
            Math.abs(bet.timestamp - newBet.timestamp) < 1000 && // Mesmo segundo
            bet.martingaleLevel === newBet.martingaleLevel && // Mesmo nível
            bet.type === newBet.type // Mesmo resultado
          );
          
          if (!exists) {
            return [...prev, newBet];
          }
          return prev;
        });
      }
    });
  };

  // 🎯 FUNÇÃO INTELIGENTE: Determina quando é seguro parar a operação
  const checkCanSafelyStop = () => {
    if (!isOperating || !operationActive) {
      setCanSafelyStop(true);
      return;
    }

    // ✅ NOVO: No modo análise, sempre pode parar
    if (operationState?.mode === 'analysis') {
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
  }, []);

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

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setUserEmail(user.email);
      userIdRef.current = user.id;
    }
  };

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
  const startOperation = async (tipValue: number) => {
    try {
    setOperationLoading(true);
    setOperationError(null);
      setOperationSuccess(null);
    
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      // 🔄 Resetar gráficos para nova sessão
      await resetAllGraphs();

      // ✅ ETAPA 1: Buscar token da Blaze
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
        throw new Error(`Erro na Edge Function: ${authResponse.status} - ${errorText}`);
      }

      const authResult = await authResponse.json();
      
      if (!authResult.success || !authResult.data) {
        throw new Error(authResult.error || 'Falha na geração de tokens via Edge Function');
      }

      // Preparar dados de autenticação
      const authData = authResult.data;
      setAuthTokens(authData);
      
      // ✅ ETAPA 3: Conectar usando tokens gerados via Edge Function
      const connectResponse = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
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
          stopGainPercentage: stopGainPercentage // <-- Enviar o estado do Stop Gain
        }),
      });

      const connectResult = await connectResponse.json();

      if (!connectResult.success) {
        throw new Error(connectResult.error || 'Erro ao conectar');
      }

      // ✅ ETAPA 2: Iniciar operação (start-operation)
      const operationResponse = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
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
        
        const response = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
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
        monitoringRef.current = false;
        
        // 🎯 NOVO: Resetar stop gain apenas se não foi parada automática
        if (!isStopGainTriggered) {
          setStopGainPercentage(null);
        }
          
        // ✅ CORREÇÃO: Forçar atualização imediata do estado
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        setOperationError(errorMessage);
        // Em caso de erro, também liberar a exibição forçada
        setForceOperatingDisplay(false);
        // 🎯 NOVO: Resetar stop gain em caso de erro
        if (!isStopGainTriggered) {
          setStopGainPercentage(null);
        }
        setIsStopGainTriggered(false); // Sempre resetar o flag em caso de erro
      } finally {
        setOperationLoading(false);
      }
    } else {
      // Iniciar operação
      if (martingaleSequence.length === 0 || userBanca < 150) {
        setOperationError('Configure sua banca (mínimo R$ 150,00) primeiro para calcular o stake ideal');
        return;
      }

      // 🛡️ NOVO: Verificar se o status atual é seguro (apenas para modo real)
      if (allowedStatuses.length > 0 && !allowedStatuses.includes(currentGameStatus)) {
        setWaitingForSafeStatus(true);
        setOperationError(null);
        setOperationSuccess(`⏳ Bot ligado em modo análise. Aguardando status seguro para modo real. Atual: ${currentGameStatus}. Permitidos: ${allowedStatuses.join(', ')}`);
        
        // Atualizar configuração na API
        await updateSafetyConfig({
          allowedStatuses,
          waitingForSafeStatus: true,
          currentGameStatus
        });
      } else {
        // Status seguro - pode operar normalmente
        setWaitingForSafeStatus(false);
      }

      // ✅ NOVO: Imediatamente forçar exibição como operando
      setForceOperatingDisplay(true);
      setOperationError(null);
      setOperationSuccess(null);
      setWaitingForSafeStatus(false);
      
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
          const currentLogsCount = result.data.logs?.length || 0;
          const previousLogsCount = websocketLogs.length;
          
          setWebsocketLogs(result.data.logs || []);
          setLastSevenResults(result.data.lastSevenResults || []);
          setConnectionStatus(result.data.connectionStatus || { connected: false, lastUpdate: Date.now() });
          setOperationActive(result.data.operationActive || false);
          setOperationState(result.data.operationState || null);
          
          // ✅ CORREÇÃO: Sincronizar isOperating com operationActive da API
          const apiOperationActive = result.data.operationActive || false;
          const apiConnected = result.data.connectionStatus?.connected || false;
          
          // 🔄 Sincronizar estado da operação - APENAS SE NÃO ESTIVER FORÇANDO EXIBIÇÃO
          if (!forceOperatingDisplay && isOperating !== apiOperationActive) {
            setIsOperating(apiOperationActive);
          }
          
          // 🔄 Se desconectado, garantir que isOperating seja false - APENAS SE NÃO ESTIVER FORÇANDO EXIBIÇÃO
          if (!forceOperatingDisplay && !apiConnected && isOperating) {
            setIsOperating(false);
          }
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
          // 📈 NOVO: Processar resultados das apostas para o gráfico
          if (result.data.logs) {
            processBetResults(result.data.logs);
          }
          
          // 🛑 NOVO: Capturar controle do botão "parar" baseado no modo
          if (result.data.operationState?.stopButtonControl) {
            setStopButtonControl(result.data.operationState.stopButtonControl);
          }
          
          // 📋 NOVO: Capturar histórico detalhado
          if (result.data.detailedHistory) {
            setDetailedHistory(result.data.detailedHistory);
          }
        }

    } catch (error) {
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos
    }
    
  };

  // Buscar relatório
  const fetchOperationReport = async () => {
    try {
      const response = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
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
      const response = await fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
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
          fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userIdRef.current,
        action: 'update-strategy',
        stopGainPercentage: stopGainPercentage // <-- Enviar o estado do Stop Gain
      })
    });
  }, [stopGainPercentage]);


  useEffect(() => {
    if (userIdRef.current && isOperating) {
      fetchOperationReport();
      const interval = setInterval(fetchOperationReport, 10000); // A cada 10 segundos
      return () => clearInterval(interval);
    }
  }, [isOperating]);



  useEffect(() => {
    return () => {
        monitoringRef.current = false;
      operationRef.current = false;
    };
  }, []);

  // NOVO: Controle inteligente do botão baseado no padrão E janela de apostas
  const hasCompletePattern = lastSevenResults.length >= 7;
  const canStartOperation = hasCompletePattern && bettingWindow.isOpen && !operationActive;
  
  // IMPORTANTE: Verificar se é padrão de repetição válido
  const isValidRepetitionPattern = lastSevenResults.length >= 7 && 
    lastSevenResults[5]?.color === lastSevenResults[0]?.color && 
    lastSevenResults[6]?.color === lastSevenResults[1]?.color;
  
  // Função para inverter cores (adaptada ao formato R/B do backend)
  const invertColor = (color: string): string => {
    if (color === 'R' || color === 'red') return 'B';
    if (color === 'B' || color === 'black') return 'R';
    return color; // green/G permanece inalterado
  };

  // Padrão base para apostas (primeiros 5 resultados - CORES HISTÓRICAS)
  const basePattern = lastSevenResults.slice(0, 5).map((r: any) => r.color);
  
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

  // 1. Função para atualizar stake no backend (mantida para compatibilidade)
  const updateStake = (newStake: number) => {
    setSelectedStake(newStake);
    // Atualizar sequência local
    const seq = calculateMartingaleSequence(newStake);
    setMartingaleSequence(seq);
    setTotalMartingaleAmount(calculateTotalAmount(seq));
    // Enviar para backend
    if (userIdRef.current) {
      fetch('/api/bmgbr/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'update-stake',
          stake: newStake,
          banca: userBanca
        })
      });
    }
  };

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

          {/* Card Créditos Disponíveis */}
          <CreditDisplay />

          {/* 💰 NOVO: Card de Configuração de Banca */}
          <Card className="border-yellow-500/30 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <Zap className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <CardTitle className="text-lg font-mono text-yellow-400">
                    💰 CONFIGURAÇÕES
                  </CardTitle>
                  <CardDescription className="text-xs font-mono text-gray-400">
                    // Configure o setup ideal antes de iniciar seu bot
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2 pb-4 px-4">
              {/* Input de Banca */}
              <div>
                <label className="text-sm font-semibold text-gray-300 font-mono mb-4 block">
                  Selecione o valor da sua banca atual
                </label>
                <div className="flex items-center gap-2 mb-3">
                  {/* Botão Menos */}
                  <button
                    onClick={() => {
                      const newBanca = Math.max(150, userBanca - 50);
                      setUserBanca(newBanca);
                      setUserBancaFormatted(applyBrazilianMask((newBanca * 100).toString()));
                    }}
                    disabled={userBanca <= 150 || isOperating || forceOperatingDisplay}
                    className="w-14 h-14 bg-gray-700/50 border border-gray-600/50 rounded-lg text-gray-300 font-bold text-lg hover:bg-gray-600/50 hover:border-gray-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    -
                  </button>
                  
                  {/* Input de Valor */}
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={userBancaFormatted}
                      onChange={(e) => {
                        if (isOperating || forceOperatingDisplay) return; // Bloquear alteração quando operando
                        const rawValue = e.target.value;
                        const maskedValue = applyBrazilianMask(rawValue);
                        const numericValue = parseBrazilianNumber(maskedValue);
                        
                        // Aplicar limite máximo
                        if (numericValue <= 50000) {
                          setUserBancaFormatted(maskedValue);
                          setUserBanca(numericValue);
                        }
                      }}
                      onBlur={() => {
                        if (isOperating || forceOperatingDisplay) return; // Bloquear alteração quando operando
                        // Garantir valor mínimo
                        if (userBanca < 150) {
                          setUserBanca(150);
                          setUserBancaFormatted('150,00');
                        }
                      }}
                      disabled={isOperating || forceOperatingDisplay}
                      placeholder="0,00"
                      className={`w-full h-14 p-3 bg-gray-800/50 border border-gray-600/50 rounded-lg font-mono text-lg font-bold text-center text-green-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 hover:bg-gray-700/50 hover:border-gray-500/50 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] ${
                        isOperating || forceOperatingDisplay ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    />
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-mono text-sm pointer-events-none">
                      R$
                    </div>
                  </div>
                  
                  {/* Botão Mais */}
                  <button
                    onClick={() => {
                      const newBanca = Math.min(50000, userBanca + 50);
                      setUserBanca(newBanca);
                      setUserBancaFormatted(applyBrazilianMask((newBanca * 100).toString()));
                    }}
                    disabled={userBanca >= 50000 || isOperating || forceOperatingDisplay}
                    className="w-14 h-14 bg-gray-700/50 border border-gray-600/50 rounded-lg text-gray-300 font-bold text-lg hover:bg-gray-600/50 hover:border-gray-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    +
                  </button>
                </div>
                <div className="text-xs text-gray-400 font-mono text-left">
                  Min: R$ 150,00 • Max: R$ 50.000,00
                </div>
                
                {/* 🎯 NOVA SEÇÃO: Stop Gain */}
                <div className="mt-6 space-y-3">
                  <label className="text-sm font-semibold text-gray-300 font-mono">
                    Stop Gain (Opcional)
                  </label>
                  <div className="text-xs text-gray-400 font-mono mb-3">
                    {stopGainPercentage 
                      ? `Meta: ${formatCurrency(calculateStopGainTarget(userBanca, stopGainPercentage))} (${stopGainPercentage}% da banca)`
                      : 'Nenhuma meta definida - Bot continuará até parada manual'
                    }
                  </div>
                  
                  <div className="grid grid-cols-5 gap-2">
                    {[10, 25, 50, 75, 100].map((percentage) => (
                      <button
                        key={percentage}
                        onClick={() => {
                          if (stopGainPercentage === percentage) {
                            setStopGainPercentage(null); // Desselecionar se já estiver selecionado
                          } else {
                            setStopGainPercentage(percentage);
                          }
                        }}
                        disabled={isOperating || forceOperatingDisplay}
                        className={`h-10 px-2 rounded-lg font-mono text-xs font-bold transition-all duration-200 ${
                          stopGainPercentage === percentage
                            ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                            : 'bg-gray-700/50 border border-gray-600/50 text-gray-300 hover:bg-gray-600/50 hover:border-gray-500/50'
                        } ${
                          isOperating || forceOperatingDisplay ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {percentage}%
                      </button>
                    ))}
                  </div>
                  
                  {stopGainPercentage && (
                    <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        <span className="text-xs font-mono text-green-400">STOP GAIN ATIVO</span>
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        Bot irá parar automaticamente ao atingir {formatCurrency(calculateStopGainTarget(userBanca, stopGainPercentage))} de lucro
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 🛡️ NOVO: Seção de Status Seguro */}
                <div className="mt-6 space-y-3">
                  <label className="text-sm font-semibold text-gray-300 font-mono">
                    Status Seguro (Opcional)
                  </label>
                  <div className="text-xs text-gray-400 font-mono mb-3">
                    {allowedStatuses.length > 0 
                      ? `Permitidos: ${allowedStatuses.join(', ')} • Atual: ${currentGameStatus}`
                      : 'Desabilitado - Bot pode operar em qualquer status'
                    }
                  </div>
                  
                  <div className="grid grid-cols-5 gap-2">
                    {['Excelente', 'Bom', 'Regular', 'Ruim', 'Crítico'].map((status) => (
                      <button
                        key={status}
                        onClick={() => {
                          const statusHierarchy = ['Excelente', 'Bom', 'Regular', 'Ruim', 'Crítico'];
                          
                          if (allowedStatuses.includes(status)) {
                            // Remover o status selecionado e todos os "piores" (à direita)
                            setAllowedStatuses(prev => prev.filter(s => 
                              statusHierarchy.indexOf(s) < statusHierarchy.indexOf(status)
                            ));
                          } else {
                            // Adicionar o status selecionado e todos os "melhores" (à esquerda)
                            const statusesToAdd = statusHierarchy.slice(0, statusHierarchy.indexOf(status) + 1);
                            setAllowedStatuses(prev => {
                              const newStatuses = [...prev];
                              statusesToAdd.forEach(statusToAdd => {
                                if (!newStatuses.includes(statusToAdd)) {
                                  newStatuses.push(statusToAdd);
                                }
                              });
                              return newStatuses;
                            });
                          }
                        }}
                        disabled={isOperating || forceOperatingDisplay}
                        className={`h-10 px-2 rounded-lg font-mono text-xs font-bold transition-all duration-200 ${
                          allowedStatuses.includes(status)
                            ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                            : 'bg-gray-700/50 border border-gray-600/50 text-gray-300 hover:bg-gray-600/50 hover:border-gray-500/50'
                        } ${
                          isOperating || forceOperatingDisplay ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {status === 'Excelente' ? 'EXC' : 
                         status === 'Bom' ? 'BOM' : 
                         status === 'Regular' ? 'REG' : 
                         status === 'Ruim' ? 'RUI' : 'CRÍ'}
                      </button>
                    ))}
                  </div>
                  
                  {waitingForSafeStatus && (
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                        <span className="text-xs font-mono text-yellow-400">AGUARDANDO STATUS SEGURO</span>
                      </div>
                      <div className="text-xs text-gray-400 font-mono">
                        Bot aguarda um dos status permitidos para ativar automaticamente
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Mostrar informações quando operando */}
                {(isOperating || forceOperatingDisplay) && (
                  <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                      <span className="text-xs font-mono text-yellow-400">CONFIGURAÇÕES BLOQUEADAS</span>
                    </div>
                    <div className="text-xs text-gray-400 font-mono space-y-1">
                      <div>Para alterar as configurações, pare o bot primeiro</div>
                      {stopGainPercentage && (
                        <div className="text-green-400">
                          🎯 Stop Gain: {formatCurrency(calculateStopGainTarget(userBanca, stopGainPercentage))} ({stopGainPercentage}%)
                        </div>
                      )}
                      {allowedStatuses.length > 0 && (
                        <div className="text-blue-400">
                          🛡️ Status Seguro: {allowedStatuses.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card Operação */}
          <Card className="border-blue-500/30 backdrop-blur-sm">

            <CardContent>
              <div className="space-y-4">
                
                {/* Status */}
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

                {/* Últimos 7 Resultados */}
                {lastSevenResults.length > 0 && (
                  <div className="space-y-2">

                    <div className="flex gap-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg flex-wrap">
                      {lastSevenResults.slice().reverse().map((result: any, index: number) => {
                        // Calcular posição cronológica: index 0 = posição 7 (mais recente), index 6 = posição 1 (mais antigo)
                        const cronologicalPosition = lastSevenResults.length - index;
                        const baseClasses = "w-12 h-12 rounded-full flex flex-col items-center justify-center text-xs font-bold font-mono shadow-lg transition-all duration-300 hover:scale-110";
                        const colorClasses = result.color === 'R' 
                          ? 'bg-red-500 text-white shadow-red-500/50' 
                          : 'bg-gray-800 text-white border border-gray-600 shadow-gray-800/50';
                        
                        return (
                          <div
                            key={`result-${index}-${result.gameId}`}
                            className={`${baseClasses} ${colorClasses}`}
                            title={`Posição ${cronologicalPosition} | Número: ${result.number} | Game: ${result.gameId}`}
                          >
                            <div className="text-[8px] leading-none">{cronologicalPosition}</div>
                            <div className="text-xs leading-none">{result.color}</div>
                          </div>
                        );
                      })}
                      {lastSevenResults.length < 7 && (
                        Array.from({ length: 7 - lastSevenResults.length }).map((_, index) => {
                          const cronologicalPosition = 7 - lastSevenResults.length - index;
                          return (
                            <div
                              key={`empty-${index}`}
                              className="w-12 h-12 rounded-full border-2 border-dashed border-gray-600 flex flex-col items-center justify-center text-xs text-gray-500"
                            >
                              <div className="text-[8px] leading-none">{cronologicalPosition}</div>
                              <div className="text-xs leading-none">?</div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {isValidRepetitionPattern && (
                      <div className="text-xs font-mono text-green-300 bg-green-500/10 p-2 rounded border border-green-500/20">
                        ✅ Padrão de repetição válido: Posições 1,2 repetiram em 6,7!
                  </div>
                )}


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
                      ((isOperating || forceOperatingDisplay) && !canSafelyStop) || // ✅ NOVO: Desabilita quando operando e não é seguro parar
                      (!(isOperating || forceOperatingDisplay) && martingaleSequence.length === 0) // ✅ NOVO: Desabilita se não há sequência válida
                    }
                    className={`w-full font-mono ${
                      (isOperating || forceOperatingDisplay)
                        ? canSafelyStop
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



              </div>
            </CardContent>
          </Card>







          {/* Novos Cards dos Componentes */}
          <OperationsCard operationReport={operationReport} />
          
          {/* 📊 NOVO: Card de Estatísticas dos Jogos */}
          <GameStatisticsCard onStatusChange={setCurrentGameStatus} />

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