'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign, Bot, Settings, Key, RefreshCw, Play, Square, Trash2 } from 'lucide-react'
import MatrixRain from '@/components/MatrixRain'
import Modal, { useModal } from '@/components/ui/modal'
import InlineAlert from '@/components/ui/inline-alert'
import CreditPlans from '@/components/CreditPlans'
import { useState, useEffect, memo, useCallback, useMemo } from 'react'
import { useCredits } from '@/hooks/useCredits'
import { useNetwork } from '@/hooks/useNetwork'

import { useAudioAlerts } from '@/hooks/useAudioAlerts'
import AudioControls from '@/components/AudioControls'
import StrategyModal from '@/components/StrategyModal'
// Interface para padrões detectados
interface DetectedPattern {
  name: string;
  pattern_type: 'color' | 'parity' | 'range';
  pattern_sequence: string;
  martingale_pattern: string;
  pattern_length: number;
  position: number;
  // Campos alternativos para compatibilidade
  sequence?: string;
  martingale?: string;
  found_in?: string;
}

interface RouletteSignals {
  success: boolean;
  patterns_found: number;
  patterns: DetectedPattern[];
  sequences: {
    colors: string;
    parity: string;
    zones: string;
  };
}

// Interface para dados do bot
interface BotData {
  auth: {
    userId: string;
    originalUserId: string;
    ppToken: string;
    jsessionId: string;
    timestamp: string;
  };
  balance: {
    balance: number;
    bonusBalance: number;
    currency: string;
    totalBalance: number;
    source: string;
    userInfo: {
      pragmaticUserId: string | null;
      screenName: string | null;
    };
  };
  history: {
    errorCode: string;
    history: Array<{
  gameId: string;
  gameResult: string;
  timestamp?: number;
  number?: number;
  color?: string;
    }>;
    totalGames: number;
    lastUpdate: number;
    currentUrl?: string;
    urlRotationCount?: number;
    urlIndex?: number;
    totalUrls?: number;
    consecutiveFailures?: number;
  };
  gameConfig: {
    gameSymbol: string;
    blazeUrl: string;
    tableId: string;
    environmentID: string;
    ppCasinoId: string;
  };
  message: string;
  // Adicionar sinais de roleta
  rouletteSignals?: RouletteSignals;
}

// Componente removido - foi substituído por funcionalidade mais simples

export default function Dashboard() {
  const blazeConfigModal = useModal()
  const strategyModal = useModal()
  const [blazeToken, setBlazeToken] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [userTokens, setUserTokens] = useState<Array<{
    casino_name: string;
    casino_code: string;
    token: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>>([]);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error' | 'warning' | 'info', message: string } | null>(null)
  
  // Usar hook de créditos para dados reais de saldo
  const { credits, loading: creditsLoading } = useCredits()
  
  // Usar hook de rede para dados de comissão
  const { commissionBalance, networkStats, referralInfo, loading: networkLoading } = useNetwork()
  
  // Hook de alertas sonoros
  const audioAlerts = useAudioAlerts({
    enabled: true,
    volume: 0.7
  })
  
  // Estado do bot MegaRoulette simplificado
  const [botData, setBotData] = useState<BotData | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [botLoading, setBotLoading] = useState(false)
  const [botError, setBotError] = useState<string | null>(null)
  const [liveHistory, setLiveHistory] = useState<Array<{
    gameId: string;
    gameResult: string;
    timestamp?: number;
    number?: number;
    color?: string;
  }>>([]);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  
  // Estado para padrões detectados
  const [detectedPatterns, setDetectedPatterns] = useState<DetectedPattern[]>([])
  const [lastPatternCheck, setLastPatternCheck] = useState<number>(0)
  
  // Estado para apostas automáticas
  const [autoBettingStatus, setAutoBettingStatus] = useState<{
    isActive: boolean;
    strategy: string | null;
    currentAttempt: number;
    maxAttempts: number;
    totalInvested: number;
    nextBetAmount: number;
    lastBetResult: 'win' | 'loss' | null;
    lastBetAmount: number;
    sessionId: number | null;
    wins: number;
    losses: number;
    lastUpdate: number;
    currentPattern: string | null;
    patternType: string | null;
    currentBetType: string | null;
    waitingForResult: boolean;
    waitingForBetsOpen: boolean;
    message: string | null;
  }>({
    isActive: false,
    strategy: null,
    currentAttempt: 0,
    maxAttempts: 8,
    totalInvested: 0,
    nextBetAmount: 0,
    lastBetResult: null,
    lastBetAmount: 0,
    sessionId: null,
    wins: 0,
    losses: 0,
    lastUpdate: 0,
    currentPattern: null,
    patternType: null,
    currentBetType: null,
    waitingForResult: false,
    waitingForBetsOpen: false,
    message: null
  })

  // Estado para configuração de apostas automáticas
  const [autoBettingConfig, setAutoBettingConfig] = useState<{
    hasConfig: boolean;
    systemStatus: 'disabled' | 'monitoring' | 'operating';
    configEnabled: boolean;
    martingaleName: string | null;
  }>({
    hasConfig: false,
    systemStatus: 'disabled',
    configEnabled: false,
    martingaleName: null
  })
  
  // Estado do WebSocket
  const [websocketStatus, setWebsocketStatus] = useState<{
    connected: boolean;
    gamePhase: 'betting' | 'spinning' | 'result' | 'waiting' | null;
    lastPing: number;
    connectionTime: number | null;
    dealerName: string | null;
    currentGameId: string | null;
    bettingOpen: boolean;
  }>({
    connected: false,
    gamePhase: null,
    lastPing: 0,
    connectionTime: null,
    dealerName: null,
    currentGameId: null,
    bettingOpen: false
  });
  
  // Estado de carregamento combinado para evitar flash
  const isDataLoading = creditsLoading || networkLoading

  // Callbacks otimizados para evitar re-renders
  const handleNewResult = useCallback((result: any) => {
    // Não mostrar alertas de resultado no modal de token
    // O foco do modal deve ser apenas na configuração do token
    console.log(`🎯 Novo resultado detectado: ${result.number} ${result.color.toUpperCase()}`);
  }, []);

  const handleUrlRotation = useCallback((newTableId: string) => {
    setAlertMessage({ 
      type: 'warning', 
      message: `URL rotacionada` 
    });
  }, []);

  const handleHistoryUpdate = useCallback((results: any[]) => {
    const now = Date.now();
    
    // Converter formato da API de monitoramento para o formato do botData
    const formattedResults = results.map(result => ({
      gameId: result.gameId,
      gameResult: result.gameResult,
      timestamp: result.timestamp || now,
      number: result.number,
      color: result.color
    }));
    
    // Atualizar histórico em tempo real
    setLiveHistory(formattedResults);
    setLastUpdateTime(now);
  }, []);

  const handlePatternsUpdate = useCallback((patterns: any[]) => {
    console.log('🎯 [DASHBOARD] Recebendo padrões:', {
      length: patterns.length,
      patterns: patterns.map(p => ({ 
        name: p.name, 
        type: p.pattern_type,
        sequence: p.pattern_sequence || p.sequence,
        martingale: p.martingale_pattern || p.martingale,
        position: p.position
      }))
    });
    console.log('🎯 [DASHBOARD] Estrutura completa dos padrões:', patterns);
    
    // Tocar som quando padrões são detectados
    if (patterns.length > 0) {
      audioAlerts.playPatternDetected(patterns.length);
    }
    
    setDetectedPatterns(patterns);
    setLastPatternCheck(Date.now());
    console.log('🎯 [DASHBOARD] Estado atualizado com', patterns.length, 'padrões');
  }, [audioAlerts]);

  // Sistema de monitoramento de logs de áudio
  useEffect(() => {
    if (!audioAlerts.isEnabled) return;

    // Interceptar console.log para detectar triggers de áudio
    const originalConsoleLog = console.log;
    
    console.log = (...args: any[]) => {
      // Chamar o console.log original primeiro
      originalConsoleLog.apply(console, args);
      
      // Verificar se é um trigger de áudio
      const message = args.join(' ');
      
      if (message.includes('🔊 [AUDIO-TRIGGER]')) {
        if (message.includes('BET_PLACED:')) {
          // Extrair valor e tipo da aposta
          const amountMatch = message.match(/R\$ ([\d,\.]+)/);
          const typeMatch = message.match(/em (\w+)/);
          
          if (amountMatch && typeMatch) {
            const amount = parseFloat(amountMatch[1].replace(',', '.'));
            const betType = typeMatch[1];
            audioAlerts.playBetPlaced(amount, betType);
          }
        } else if (message.includes('WIN:')) {
          // Extrair valor do lucro
          const profitMatch = message.match(/R\$ ([\d,\.]+)/);
          if (profitMatch) {
            const profit = parseFloat(profitMatch[1].replace(',', '.'));
            audioAlerts.playWin(profit);
          }
        } else if (message.includes('LOSS:')) {
          // Extrair valor da perda
          const lossMatch = message.match(/R\$ ([\d,\.]+)/);
          if (lossMatch) {
            const loss = parseFloat(lossMatch[1].replace(',', '.'));
            audioAlerts.playLoss(loss);
          }
        }
      }
    };

    // Cleanup: restaurar console.log original
    return () => {
      console.log = originalConsoleLog;
    };
  }, [audioAlerts]);

  // Estado de monitoramento simplificado
  const [monitoring, setMonitoring] = useState({
    status: {
      isActive: false,
      currentTableId: null as string | null,
      newResultsCount: 0
    }
  })

  // Atualizar status de monitoramento quando bot ativa/desativa
  useEffect(() => {
    setMonitoring(prev => ({
      ...prev,
      status: {
        ...prev.status,
        isActive: isActive,
        currentTableId: botData?.history?.currentUrl || null
      }
    }))
  }, [isActive, botData?.history?.currentUrl])

  // Função para buscar histórico em tempo real
  const fetchLiveHistory = useCallback(async () => {
    if (!isActive || !botData?.auth?.jsessionId || !botData?.auth?.originalUserId) return

    try {
      const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'monitor',
          userId: botData.auth.originalUserId,
          jsessionId: botData.auth.jsessionId
        })
      })

      const data = await response.json()

      if (data.success && data.data?.results) {
        const formattedResults = data.data.results.map((result: any) => ({
          gameId: result.gameId,
          gameResult: result.gameResult,
          timestamp: result.timestamp || Date.now(),
          number: result.number,
          color: result.color
        }))

        // Verificar se há novos resultados
        const latestGameId = formattedResults[0]?.gameId
        const hasNewResult = latestGameId && latestGameId !== liveHistory[0]?.gameId

        if (hasNewResult || liveHistory.length === 0) {
          setLiveHistory(formattedResults)
          setLastUpdateTime(Date.now())
          
          // Processar padrões se há novos resultados
          if (data.data.rouletteSignals?.patterns) {
            setDetectedPatterns(data.data.rouletteSignals.patterns)
            setLastPatternCheck(Date.now())
            
            // Tocar som se padrões detectados
            if (data.data.rouletteSignals.patterns.length > 0) {
              audioAlerts.playPatternDetected(data.data.rouletteSignals.patterns.length)
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao buscar histórico:', error)
    }
  }, [isActive, botData?.auth?.jsessionId, botData?.auth?.originalUserId, liveHistory, audioAlerts])

  // Polling para histórico em tempo real
  useEffect(() => {
    if (!isActive) return

    // Buscar imediatamente
    fetchLiveHistory()

    // POLLING OTIMIZADO - Reduzido para 5 segundos para ser mais leve
    const interval = setInterval(fetchLiveHistory, 5000)

    return () => clearInterval(interval)
  }, [isActive, fetchLiveHistory])

  // Polling para atualizar status WebSocket em tempo real
  useEffect(() => {
    if (!isActive || !botData?.auth?.originalUserId) return

    const updateWebSocketStatus = async () => {
      try {
                 const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ 
             action: 'websocket-state',
             userId: botData.auth.originalUserId
           })
         })

        const data = await response.json()

                         if (data.success && data.data.gameState) {
          const gameState = data.data.gameState
          // LOGS REDUZIDOS - Remover log de polling a cada 3 segundos
          // console.log('🔌 WebSocket Status Update:', {
          //   gamePhase: gameState.gamePhase,
          //   bettingOpen: gameState.bettingOpen,
          //   dealerName: gameState.dealerName,
          //   connected: gameState.connectionHealth.connected
          // })
          
          setWebsocketStatus(prev => ({
            ...prev,
            connected: gameState.connectionHealth.connected,
            gamePhase: gameState.gamePhase,
            lastPing: gameState.connectionHealth.lastPong,
            dealerName: gameState.dealerName,
            currentGameId: gameState.currentGameId,
            bettingOpen: gameState.bettingOpen
          }))
        }
      } catch (error) {
        console.error('Erro ao atualizar status WebSocket:', error)
        setWebsocketStatus(prev => ({ ...prev, connected: false }))
      }
    }

    // Atualizar imediatamente
    updateWebSocketStatus()

    // POLLING OTIMIZADO - Reduzido para 5 segundos para ser mais leve
    const interval = setInterval(updateWebSocketStatus, 5000)

    return () => clearInterval(interval)
  }, [isActive, botData?.auth?.originalUserId])

  // Função para testar conexão WebSocket
  const testWebSocketConnection = async (userId: string) => {
    try {
      const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'websocket-state',
          userId: userId
        })
      })

      const data = await response.json()

      if (data.success && data.data.gameState) {
        const gameState = data.data.gameState
        setWebsocketStatus({
          connected: gameState.connectionHealth.connected,
          gamePhase: gameState.gamePhase,
          lastPing: gameState.connectionHealth.lastPong,
          connectionTime: Date.now(),
          dealerName: gameState.dealerName,
          currentGameId: gameState.currentGameId,
          bettingOpen: gameState.bettingOpen
        })
        
        setAlertMessage({ 
          type: 'success', 
          message: 'WebSocket conectado com sucesso!' 
        })
      } else {
        setWebsocketStatus(prev => ({ ...prev, connected: false }))
      }
    } catch (error) {
      console.error('Erro ao testar WebSocket:', error)
      setWebsocketStatus(prev => ({ ...prev, connected: false }))
    }
  }

  // Função para ativar/parar o bot
  const handleBotToggle = async () => {
    if (isActive) {
      // Parar bot e limpar sessões automaticamente
      console.log('🛑 Parando bot e limpando sessões...')
      
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user?.email) {
          // Limpar sessões via API
          const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'cleanup-sessions',
              userId: user.email
            })
          })

          const data = await response.json()
          
          if (data.success) {
            console.log('✅ Sessões limpas:', data.data)
            setAlertMessage({ 
              type: 'success', 
              message: 'Bot parado e sessões limpas com sucesso' 
            })
          } else {
            console.error('❌ Erro ao limpar sessões:', data.error)
            setAlertMessage({ 
              type: 'warning', 
              message: 'Bot parado, mas houve erro ao limpar sessões' 
            })
          }
        }
      } catch (error) {
        console.error('❌ Erro ao limpar sessões:', error)
        setAlertMessage({ 
          type: 'warning', 
          message: 'Bot parado, mas houve erro ao limpar sessões' 
        })
      }

      // Limpar estados locais
      setIsActive(false)
      setBotData(null)
      setBotError(null)
      setLiveHistory([]) // Limpar histórico em tempo real
      setDetectedPatterns([]) // Limpar padrões detectados
      setLastPatternCheck(0)
      // Limpar status das apostas automáticas
      setAutoBettingStatus({
        isActive: false,
        strategy: null,
        currentAttempt: 0,
        maxAttempts: 8,
        totalInvested: 0,
        nextBetAmount: 0,
        lastBetResult: null,
        lastBetAmount: 0,
        sessionId: null,
        wins: 0,
        losses: 0,
        lastUpdate: 0,
        currentPattern: null,
        patternType: null,
        currentBetType: null,
        waitingForResult: false,
        waitingForBetsOpen: false,
        message: null
      })
      setWebsocketStatus({
        connected: false,
        gamePhase: null,
        lastPing: 0,
        connectionTime: null,
        dealerName: null,
        currentGameId: null,
        bettingOpen: false
      })
      return
    }

    // Verificar se está configurado antes de abrir modal
    if (!isConfigured) {
      setAlertMessage({ 
        type: 'warning', 
        message: 'Configure seu token Blaze primeiro' 
      });
      blazeConfigModal.openModal();
      return;
    }

    // Abrir modal de seleção de estratégia
    strategyModal.openModal();
  }

  // Função para confirmar estratégia e iniciar bot
  const handleStrategyConfirm = async (strategyId: string) => {
    setBotLoading(true)
    setBotError(null)

    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user?.email) {
        throw new Error('Usuário não autenticado')
      }

      // Primeiro ativar o bot
      const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user.email,
          numberOfGames: 50 
        })
      })

      const data = await response.json()

      if (data.success) {
        // Depois ativar apostas automáticas com a estratégia selecionada
        const autoBetResponse = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'auto-bet-start',
            userId: user.email,
            autoBetConfig: {
              martingaleName: strategyId,
              enabled: true
            }
          })
        });

        const autoBetResult = await autoBetResponse.json();
        
        if (autoBetResult.success) {
          setBotData(data.data)
          setIsActive(true)
          
          // Processar padrões detectados se disponíveis
          if (data.data.rouletteSignals && data.data.rouletteSignals.success) {
            setDetectedPatterns(data.data.rouletteSignals.patterns || [])
            setLastPatternCheck(Date.now())
            
            // Mostrar alerta se padrões foram encontrados
            if (data.data.rouletteSignals.patterns_found > 0) {
              setAlertMessage({ 
                type: 'success', 
                message: `Bot ativado com estratégia ${strategyId}! ${data.data.rouletteSignals.patterns_found} padrão(ões) detectado(s)` 
              })
            } else {
              setAlertMessage({ 
                type: 'success', 
                message: `Bot ativado com estratégia ${strategyId}!` 
              })
            }
          } else {
            setAlertMessage({ 
              type: 'success', 
              message: `Bot ativado com estratégia ${strategyId}!` 
            })
          }
          
          // Carregar histórico inicial se disponível
          if (data.data.history?.history && data.data.history.history.length > 0) {
            const formattedHistory = data.data.history.history.map((item: any) => ({
              gameId: item.gameId,
              gameResult: item.gameResult,
              timestamp: item.timestamp || Date.now(),
              number: item.number,
              color: item.color
            }))
            setLiveHistory(formattedHistory)
            setLastUpdateTime(Date.now())
          }
          
          strategyModal.closeModal();
          
          // Buscar status das apostas automáticas após ativar
          setTimeout(() => {
            fetchAutoBettingStatus();
          }, 2000);
        } else {
          throw new Error(autoBetResult.error || 'Erro ao ativar apostas automáticas')
        }
      } else {
        throw new Error(data.error || 'Erro ao ativar bot')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      setBotError(errorMessage)
      setAlertMessage({ 
        type: 'error', 
        message: `Erro ao ativar bot: ${errorMessage}` 
      })
    } finally {
      setBotLoading(false)
    }
  }

  // Helper para formatar moeda
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  // Verificar se Blaze está configurado
  useEffect(() => {
    checkBlazeConfiguration()
    // Buscar status das apostas automáticas quando carregar
    if (isActive) {
      fetchAutoBettingStatus()
    }
  }, [isActive])

  // Atualizar status das apostas automáticas periodicamente quando ativo
  useEffect(() => {
    if (isActive) {
      // Buscar status imediatamente quando bot ativa
      fetchAutoBettingStatus()
      
      // Polling contínuo a cada 5 segundos quando bot está ativo
      const interval = setInterval(() => {
        fetchAutoBettingStatus()
      }, 5000) // Reduzido para 5 segundos para melhor responsividade

      return () => clearInterval(interval)
    }
  }, [isActive])

  // 🛡️ SISTEMA DE LIMPEZA AUTOMÁTICA DE SESSÕES
  useEffect(() => {
    const cleanupSessions = async () => {
      if (isActive) {
        try {
          const { supabase } = await import('@/lib/supabase')
          const { data: { user } } = await supabase.auth.getUser()
          
          if (user?.email) {
            // Parar bot e limpar sessões
            await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'auto-bet-stop',
                userId: user.email
              })
            })
            console.log('🛡️ Sessões limpas automaticamente')
          }
        } catch (error) {
          console.error('Erro ao limpar sessões:', error)
        }
      }
    }

    // Limpar quando sair da página (beforeunload)
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isActive) {
        cleanupSessions()
        // Mostrar aviso se há sessão ativa
        event.preventDefault()
        event.returnValue = 'Você tem uma sessão de apostas ativa. Tem certeza que deseja sair?'
        return event.returnValue
      }
    }

    // Limpar quando a página perde foco (visibilitychange)
    const handleVisibilityChange = () => {
      if (document.hidden && isActive) {
        // Página foi minimizada/trocada - aguardar um pouco antes de limpar
        setTimeout(() => {
          if (document.hidden && isActive) {
            cleanupSessions()
          }
        }, 30000) // 30 segundos de tolerância
      }
    }

    // Limpar quando a página é fechada (pagehide)
    const handlePageHide = () => {
      if (isActive) {
        cleanupSessions()
      }
    }

    // Adicionar event listeners
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    // Cleanup ao desmontar
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      
      // Limpar sessões ao desmontar o componente
      if (isActive) {
        cleanupSessions()
      }
    }
  }, [isActive])

  const checkBlazeConfiguration = async () => {
    try {
      setIsLoadingStatus(true)
      const { supabase } = await import('@/lib/supabase')
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('user_tokens')
        .select('*')
        .eq('user_id', user.id)
        .eq('casino_code', 'BLAZE')

      if (error) {
        console.error('Error checking Blaze configuration:', error)
        return
      }

      setUserTokens(data || [])
      setIsConfigured(data && data.length > 0 && data.some(token => token.is_active))
    } catch (error) {
      console.error('Error checking Blaze configuration:', error)
    } finally {
      setIsLoadingStatus(false)
    }
  }

  const handleOpenModal = () => {
    // Carregar token atual (mesmo se vazio) para edição
    const blazeTokenData = userTokens.find(token => token.casino_code === 'BLAZE')
    const currentToken = blazeTokenData?.token || ''
    setBlazeToken(currentToken)
    setAlertMessage(null) // Limpar mensagens de erro
    blazeConfigModal.openModal()
  }

  const handleConfigureBlaze = async () => {
    try {
      setConfigLoading(true)
      const tokenValue = blazeToken.trim()
      
      const { supabase } = await import('@/lib/supabase')
      
      const { data, error } = await supabase.rpc('configure_casino_token', {
        p_casino_name: 'Blaze',
        p_casino_code: 'BLAZE',
        p_token: tokenValue || '',
        p_is_active: tokenValue ? true : false
      })

      if (error) {
        console.error('Error configuring token:', error)
        return
      }

      if (data?.success) {
        setBlazeToken('')
        blazeConfigModal.closeModal()
        // Atualizar tokens locais
        await checkBlazeConfiguration()
        
        // Token salvo com sucesso - feedback visual através do status do card
      } else {
        // Tratar erro de token duplicado
        if (data?.error_type === 'duplicate_token') {
          setAlertMessage({
            type: 'error',
            message: 'Este token já está sendo usado por outro usuário. Verifique se você está usando o token correto da sua conta.'
          })
        } else {
          setAlertMessage({
            type: 'error',
            message: data?.error || 'Erro ao configurar token'
          })
        }
      }
    } catch (error) {
      console.error('Error configuring token:', error)
              setAlertMessage({
          type: 'error',
          message: 'Erro interno. Tente novamente.'
        })
    } finally {
      setConfigLoading(false)
    }
  }

  // Função para buscar status das apostas automáticas
  const fetchAutoBettingStatus = async () => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user?.email) return

      console.log('🔍 [FRONTEND] Buscando status das apostas automáticas...')

      const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto-bet-status',
          userId: user.email
        })
      })

      const data = await response.json()
      console.log('📊 [FRONTEND] Resposta da API:', data)

      if (data.success && data.data) {
        // CORREÇÃO: A API auto-bet-status retorna dados diretamente em data.data
        const apiData = data.data;
        
        console.log('🔍 [FRONTEND] Estrutura real dos dados:', apiData)

        setAutoBettingStatus({
          isActive: apiData.isActive || false,
          strategy: apiData.strategy || null,
          currentAttempt: apiData.currentAttempt || 0,
          maxAttempts: apiData.maxAttempts || 8,
          totalInvested: apiData.totalInvested || 0,
          nextBetAmount: apiData.nextBetAmount || 0,
          lastBetResult: apiData.lastBetResult || null,
          lastBetAmount: apiData.lastBetAmount || 0,
          sessionId: apiData.sessionId || null,
          wins: apiData.wins || 0,
          losses: apiData.losses || 0,
          lastUpdate: Date.now(),
          currentPattern: apiData.currentPattern || null,
          patternType: apiData.patternType || null,
          currentBetType: apiData.currentBetType || null,
          waitingForResult: apiData.waitingForResult || false,
          waitingForBetsOpen: apiData.waitingForBetsOpen || false,
          message: apiData.message || null
        })

        setAutoBettingConfig({
          hasConfig: apiData.hasConfig || false,
          systemStatus: apiData.systemStatus === 'active' ? 'operating' : 
                       apiData.systemStatus === 'stopped' ? 'disabled' : 'monitoring',
          configEnabled: apiData.hasConfig || false,
          martingaleName: apiData.martingaleName || null
        })

        // Log do status atualizado
        console.log('✅ [FRONTEND] Status das apostas atualizado:', {
          isActive: apiData.isActive,
          hasConfig: apiData.hasConfig,
          systemStatus: apiData.systemStatus,
          strategy: apiData.strategy || 'Nenhuma',
          currentAttempt: apiData.currentAttempt || 0,
          currentPattern: apiData.currentPattern || 'Nenhum'
        })
      } else {
        console.error('❌ [FRONTEND] Erro na resposta da API:', data.error)
      }
    } catch (error) {
      console.error('❌ [FRONTEND] Erro ao buscar status das apostas automáticas:', error)
    }
  }

  return (
    <div className="px-4 relative">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10">
        <div className="flex flex-col gap-6">
          {/* Blaze Token Button */}
          <div>
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
                      BLAZE_TOKEN
                    </h3>
                    <p className="text-xs text-gray-400 font-mono">
                      {`// Credenciais de autenticação para sistema Blaze`}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`text-xs font-mono font-semibold ${
                      isLoadingStatus 
                        ? 'text-gray-400' 
                        : isConfigured 
                          ? 'text-green-400' 
                          : 'text-red-400'
                    }`}>
                      {isLoadingStatus ? 'VERIFICANDO...' : isConfigured ? 'ONLINE' : 'OFFLINE'}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      {isConfigured ? 'Pronto para operação' : 'Requer configuração'}
                    </div>
                  </div>
                  
                  <div className={`
                    w-3 h-3 rounded-full animate-pulse shadow-lg
                    ${isConfigured 
                      ? 'bg-green-400 shadow-green-400/50' 
                      : 'bg-red-400 shadow-red-400/50'
                    }
                  `}></div>
                </div>
              </div>
              
              {isConfigured && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 font-mono">Última atualização:</span>
                    <span className="text-green-400 font-mono">Conectado</span>
                  </div>
                </div>
              )}
            </button>
          </div>

          {/* Bot Control Card - Simplificado */}
          {!isDataLoading && isConfigured && (
            <Card className="border-blue-500/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-400 font-mono">
                  <Bot className="h-5 w-5" />
                  CONTROLE_BOT
                </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
                  {`// Sistema MegaRoulette automatizado`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Status do Bot */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full shadow-lg ${
                          isActive 
                            ? 'bg-green-400 animate-pulse shadow-green-400/50' 
                            : 'bg-gray-400 shadow-gray-400/50'
                        }`}></div>
                        <span className={`font-medium font-mono ${
                          isActive ? 'text-green-400' : 'text-gray-400'
                        }`}>
                          {isActive ? 'ATIVO' : 'INATIVO'}
                        </span>
                      </div>
                      
                    {botData && (
                        <span className="text-sm text-gray-500 font-mono">
                        {new Date(botData.auth.timestamp).toLocaleTimeString('pt-BR')}
                        </span>
                      )}
                    </div>

                  {/* Dados de Autenticação */}
                  {botData && (
                    <div className="space-y-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono text-green-400 font-semibold">🔐 DADOS_AUTENTICAÇÃO</span>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs font-mono text-gray-400">CASSINO:</span>
                          <span className="text-xs font-mono text-green-400 font-semibold">BLAZE</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs font-mono text-gray-400">JOGO:</span>
                          <span className="text-xs font-mono text-green-400 font-semibold">MEGA_ROULETTE</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs font-mono text-gray-400">PP_TOKEN:</span>
                          <span className="text-xs font-mono text-green-400">
                            {botData.auth.ppToken.substring(0, 16)}...
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs font-mono text-gray-400">JSESSION_ID:</span>
                          <span className="text-xs font-mono text-green-400">
                            {botData.auth.jsessionId.substring(0, 16)}...
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Saldo da Blaze */}
                  {botData && (
                    <div className="space-y-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono text-yellow-400 font-semibold">💰 SALDO_BLAZE</span>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs font-mono text-gray-400">MOEDA:</span>
                          <span className="text-xs font-mono text-yellow-400 font-semibold">
                            {botData.balance.currency}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs font-mono text-gray-400">PRINCIPAL:</span>
                          <span className="text-xs font-mono text-yellow-400 font-semibold">
                            {formatCurrency(botData.balance.balance)}
                          </span>
                        </div>
                        {botData.balance.bonusBalance > 0 && (
                          <div className="flex justify-between">
                            <span className="text-xs font-mono text-gray-400">BÔNUS:</span>
                            <span className="text-xs font-mono text-orange-400">
                              {formatCurrency(botData.balance.bonusBalance)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-yellow-500/20 pt-1">
                          <span className="text-xs font-mono text-gray-400 font-semibold">TOTAL:</span>
                          <span className="text-xs font-mono text-yellow-400 font-bold">
                            {formatCurrency(botData.balance.totalBalance)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Histórico da Pragmatic - Atualizado em Tempo Real */}
                  {(botData || liveHistory.length > 0) && (
                    <div className="space-y-2 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono text-purple-400 font-semibold">📊 HISTÓRICO_PRAGMATIC</span>
                          <div className="flex items-center gap-2">
                          {monitoring.status.isActive && (
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          )}
                          <span className="text-xs font-mono text-gray-500">
                            URL: {monitoring.status.currentTableId || 'N/A'} ({monitoring.status.newResultsCount}/10)
                            </span>
                          {botData?.history && (
                            <span className="text-xs font-mono text-purple-400">
                              ({(botData.history.urlIndex || 0) + 1}/{botData.history.totalUrls || 5})
                            </span>
                          )}
                          </div>
                      </div>
                      
                      <div className="grid grid-cols-10 gap-1 max-h-32 overflow-y-auto">
                        {liveHistory.length > 0 ? (
                          liveHistory.slice(0, 20).map((result, index) => {
                            const baseClasses = "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono shadow-sm transition-all duration-200";
                            const colorClasses = result.color === 'red' 
                              ? 'bg-red-500 text-white' 
                              : result.color === 'black' 
                                ? 'bg-gray-800 text-white border border-gray-600' 
                                : 'bg-green-500 text-white';
                            const highlightClass = index === 0 ? 'ring-2 ring-yellow-400 scale-110 animate-pulse' : '';
                            const newResultClass = monitoring.status.isActive && index === 0 ? 'ring-2 ring-green-400' : '';
                            
                            return (
                              <div
                                key={result.gameId}
                                className={`${baseClasses} ${colorClasses} ${highlightClass} ${newResultClass}`}
                                title={`${result.gameResult} - ${new Date(result.timestamp || 0).toLocaleTimeString('pt-BR')}`}
                              >
                                {result.number}
                        </div>
                            );
                          })
                        ) : (
                          <div className="col-span-10 text-center py-4">
                            <span className="text-xs font-mono text-gray-500">
                              {monitoring.status.isActive ? 'AGUARDANDO_DADOS...' : 'SEM_HISTÓRICO_DISPONÍVEL'}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-2 pt-2 border-t border-purple-500/20">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-gray-400">ÚLTIMO:</span>
                          <span className={`font-semibold ${
                            liveHistory[0]?.color === 'red' ? 'text-red-400' : 
                            liveHistory[0]?.color === 'black' ? 'text-gray-400' : 
                            liveHistory[0]?.color === 'green' ? 'text-green-400' : 'text-gray-500'
                          }`}>
                            {liveHistory[0]?.gameResult || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-gray-400">TOTAL:</span>
                          <span className="text-purple-400">
                            {liveHistory.length} resultados
                          </span>
                        </div>
                        {monitoring.status.isActive && (
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-gray-400">TEMPO_REAL:</span>
                            <span className="text-green-400 animate-pulse">
                              ATIVO
                            </span>
                          </div>
                        )}
                        {lastUpdateTime > 0 && (
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-gray-400">ÚLTIMA_ATUALIZAÇÃO:</span>
                            <span className="text-cyan-400">
                              {new Date(lastUpdateTime).toLocaleTimeString('pt-BR')}
                            </span>
                          </div>
                        )}
                        {botData?.history?.consecutiveFailures && botData.history.consecutiveFailures > 0 && (
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-gray-400">FALHAS_CONSECUTIVAS:</span>
                            <span className={`font-semibold ${
                              botData.history.consecutiveFailures >= 3 ? 'text-red-400 animate-pulse' : 'text-yellow-400'
                            }`}>
                              {botData.history.consecutiveFailures}/3
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Padrões Detectados */}
                  {isActive && (
                    <div className="space-y-2 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono text-orange-400 font-semibold">🎯 SINAIS_DETECTADOS</span>
                        <div className="flex items-center gap-2">
                          {detectedPatterns.length > 0 && (
                            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                          )}
                          <span className="text-xs font-mono text-gray-500">
                            {detectedPatterns.length} padrões
                          </span>
                        </div>
                      </div>
                      
                      {detectedPatterns.length > 0 ? (
                        <div className="space-y-2">
                          {detectedPatterns.slice(0, 5).map((pattern, index) => (
                            <div key={`${pattern.name}-${index}`} className="p-2 bg-orange-500/5 border border-orange-500/20 rounded">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-mono text-orange-400 font-semibold">
                                  {pattern.name}
                                </span>
                                <span className={`text-xs font-mono px-1 rounded ${
                                  pattern.pattern_type === 'color' ? 'bg-red-500/20 text-red-400' :
                                  pattern.pattern_type === 'parity' ? 'bg-blue-500/20 text-blue-400' :
                                  'bg-green-500/20 text-green-400'
                                }`}>
                                  {pattern.pattern_type === 'color' ? 'CORES' :
                                   pattern.pattern_type === 'parity' ? 'PARES' : 'ZONAS'}
                                </span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-xs font-mono text-gray-400">SEQUÊNCIA:</span>
                                  <span className="text-xs font-mono text-orange-400 font-semibold">
                                    {pattern.pattern_sequence || pattern.sequence}
                                  </span>
                                </div>
                                {(pattern.martingale_pattern || pattern.martingale) && (
                                  <div className="flex justify-between">
                                    <span className="text-xs font-mono text-gray-400">MARTINGALE:</span>
                                    <span className="text-xs font-mono text-yellow-400">
                                      {pattern.martingale_pattern || pattern.martingale}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-xs font-mono text-gray-400">POSIÇÃO:</span>
                                  <span className="text-xs font-mono text-cyan-400">
                                    {pattern.position}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-center py-2">
                            <span className="text-xs font-mono text-yellow-400">
                              SISTEMA_HABILITADO
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="text-xs font-mono text-gray-500">
                              AGUARDANDO_PADRÕES...
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="text-xs font-mono text-blue-400">
                              🔍 MONITORANDO_RESULTADOS
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {lastPatternCheck > 0 && (
                        <div className="mt-2 pt-2 border-t border-orange-500/20">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-gray-400">ÚLTIMA_VERIFICAÇÃO:</span>
                            <span className="text-orange-400">
                              {new Date(lastPatternCheck).toLocaleTimeString('pt-BR')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Apostas Automáticas */}
                  {isActive && (
                    <div className="space-y-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono text-blue-400 font-semibold">🎰 APOSTAS_AUTOMÁTICAS</span>
                        <div className="flex items-center gap-2">
                          {autoBettingStatus.isActive && (
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                          )}
                          <span className={`text-xs font-mono ${
                            autoBettingConfig.systemStatus === 'operating' ? 'text-green-400' :
                            autoBettingConfig.systemStatus === 'monitoring' ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>
                            {autoBettingConfig.systemStatus === 'operating' ? 'OPERANDO' :
                             autoBettingConfig.systemStatus === 'monitoring' ? 'MONITORANDO' :
                             'INATIVO'}
                          </span>
                        </div>
                      </div>
                      
                      {autoBettingStatus.isActive ? (
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-xs font-mono text-gray-400">ESTRATÉGIA:</span>
                            <span className="text-xs font-mono text-blue-400 font-semibold">
                              {autoBettingStatus.strategy}
                            </span>
                          </div>
                          {autoBettingStatus.currentPattern && (
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <span className="text-xs font-mono text-gray-400">PADRÃO_ATIVO:</span>
                                <span className="text-xs font-mono text-purple-400 font-semibold">
                                  {autoBettingStatus.currentPattern}
                                </span>
                              </div>
                              {autoBettingStatus.patternType && (
                                <div className="flex justify-between">
                                  <span className="text-xs font-mono text-gray-400">TIPO:</span>
                                  <span className="text-xs font-mono text-cyan-400 font-semibold">
                                    {autoBettingStatus.patternType.toUpperCase()}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          {autoBettingStatus.currentBetType && (
                            <div className="flex justify-between">
                              <span className="text-xs font-mono text-gray-400">APOSTANDO_EM:</span>
                              <span className="text-xs font-mono text-orange-400 font-semibold">
                                {autoBettingStatus.currentBetType}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-xs font-mono text-gray-400">TENTATIVA:</span>
                            <span className="text-xs font-mono text-yellow-400 font-semibold">
                              {autoBettingStatus.currentAttempt}/{autoBettingStatus.maxAttempts}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs font-mono text-gray-400">INVESTIDO:</span>
                            <span className="text-xs font-mono text-red-400 font-semibold">
                              {formatCurrency(autoBettingStatus.totalInvested)}
                            </span>
                          </div>
                          {autoBettingStatus.nextBetAmount > 0 && (
                            <div className="flex justify-between">
                              <span className="text-xs font-mono text-gray-400">PRÓXIMA_APOSTA:</span>
                              <span className="text-xs font-mono text-orange-400 font-semibold">
                                {formatCurrency(autoBettingStatus.nextBetAmount)}
                              </span>
                            </div>
                          )}
                          {autoBettingStatus.lastBetResult && (
                            <div className="flex justify-between">
                              <span className="text-xs font-mono text-gray-400">ÚLTIMO_RESULTADO:</span>
                              <span className={`text-xs font-mono font-semibold ${
                                autoBettingStatus.lastBetResult === 'win' ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {autoBettingStatus.lastBetResult === 'win' ? 'VITÓRIA' : 'DERROTA'} 
                                ({formatCurrency(autoBettingStatus.lastBetAmount)})
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-blue-500/20 pt-1">
                            <span className="text-xs font-mono text-gray-400">HISTÓRICO:</span>
                            <span className="text-xs font-mono text-blue-400">
                              {autoBettingStatus.wins}V / {autoBettingStatus.losses}D
                            </span>
                          </div>
                          {autoBettingStatus.sessionId && (
                            <div className="flex justify-between">
                              <span className="text-xs font-mono text-gray-400">SESSÃO_ID:</span>
                              <span className="text-xs font-mono text-cyan-400">
                                #{autoBettingStatus.sessionId}
                              </span>
                            </div>
                          )}
                          {autoBettingStatus.message && (
                            <div className="mt-2 pt-2 border-t border-blue-500/20">
                              <div className="text-center">
                                <span className="text-xs font-mono text-cyan-400">
                                  {autoBettingStatus.message}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : autoBettingConfig.hasConfig ? (
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-xs font-mono text-gray-400">ESTRATÉGIA:</span>
                            <span className="text-xs font-mono text-yellow-400 font-semibold">
                              {autoBettingConfig.martingaleName}
                            </span>
                          </div>
                          <div className="text-center py-2">
                            <span className="text-xs font-mono text-yellow-400">
                              SISTEMA_HABILITADO
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="text-xs font-mono text-gray-500">
                              AGUARDANDO_PADRÕES...
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="text-xs font-mono text-blue-400">
                              🔍 MONITORANDO_RESULTADOS
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-center py-2">
                            <span className="text-xs font-mono text-red-400">
                              SISTEMA_DESABILITADO
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="text-xs font-mono text-gray-500">
                              CONFIGURE_UMA_ESTRATÉGIA
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {autoBettingStatus.lastUpdate > 0 && (
                        <div className="mt-2 pt-2 border-t border-blue-500/20">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-gray-400">ÚLTIMA_ATUALIZAÇÃO:</span>
                            <span className="text-blue-400">
                              {new Date(autoBettingStatus.lastUpdate).toLocaleTimeString('pt-BR')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status WebSocket */}
                  {botData && (
                    <div className="space-y-2 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono text-cyan-400 font-semibold">🔌 STATUS_WEBSOCKET</span>
                      <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            websocketStatus.connected 
                              ? 'bg-green-400 animate-pulse' 
                              : 'bg-red-400'
                          }`}></div>
                          <span className={`text-xs font-mono ${
                            websocketStatus.connected ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {websocketStatus.connected ? 'CONECTADO' : 'DESCONECTADO'}
                        </span>
                      </div>
                    </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs font-mono text-gray-400">PROTOCOLO:</span>
                          <span className="text-xs font-mono text-cyan-400 font-semibold">
                            WSS://PRAGMATIC_PLAY
                        </span>
                      </div>
                        
                        {websocketStatus.connected && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-xs font-mono text-gray-400">FASE_JOGO:</span>
                              <span className={`text-xs font-mono font-semibold ${
                                websocketStatus.gamePhase === 'betting' ? 'text-green-400' :
                                websocketStatus.gamePhase === 'spinning' ? 'text-yellow-400' :
                                websocketStatus.gamePhase === 'result' ? 'text-blue-400' :
                                'text-gray-400'
                              }`}>
                                {websocketStatus.gamePhase?.toUpperCase() || 'AGUARDANDO'}
                              </span>
                    </div>
                            
                            <div className="flex justify-between">
                              <span className="text-xs font-mono text-gray-400">APOSTAS:</span>
                              <span className={`text-xs font-mono font-semibold ${
                                websocketStatus.bettingOpen ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {websocketStatus.bettingOpen ? 'ABERTAS' : 'FECHADAS'}
                              </span>
                            </div>
                            
                            {websocketStatus.dealerName && (
                              <div className="flex justify-between">
                                <span className="text-xs font-mono text-gray-400">DEALER:</span>
                                <span className="text-xs font-mono text-cyan-400 font-semibold">
                                  {websocketStatus.dealerName}
                                </span>
                              </div>
                            )}

                            {websocketStatus.currentGameId && (
                              <div className="flex justify-between">
                                <span className="text-xs font-mono text-gray-400">GAME_ID:</span>
                                <span className="text-xs font-mono text-cyan-400">
                                  {websocketStatus.currentGameId.substring(0, 12)}...
                          </span>
                              </div>
                            )}
                            
                            {websocketStatus.connectionTime && (
                              <div className="flex justify-between">
                                <span className="text-xs font-mono text-gray-400">CONECTADO_EM:</span>
                                <span className="text-xs font-mono text-cyan-400">
                                  {new Date(websocketStatus.connectionTime).toLocaleTimeString('pt-BR')}
                                </span>
                      </div>
                            )}
                          </>
                        )}
                        
                        {!websocketStatus.connected && (
                          <div className="text-center py-2">
                            <span className="text-xs font-mono text-red-400">
                              CONEXÃO_WEBSOCKET_INDISPONÍVEL
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Erro do Bot */}
                  {botError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <span className="text-xs font-mono text-red-400">{botError}</span>
                    </div>
                  )}

                  {/* Controle principal */}
                    <Button 
                    onClick={handleBotToggle}
                      disabled={botLoading}
                    className={`w-full font-mono ${
                        isActive 
                        ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30' 
                        : 'bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30'
                    }`}
                      variant="outline"
                    >
                      {botLoading ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : isActive ? (
                        <Square className="h-4 w-4 mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {botLoading 
                        ? 'PROCESSANDO...' 
                        : isActive 
                          ? 'PARAR_BOT' 
                          : 'ATIVAR_BOT'
                      }
                                          </Button>


                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading indicator minimalista */}
          {isDataLoading && (
            <div className="text-center py-8">
              <div className="inline-flex items-center gap-3 text-green-400 font-mono text-sm">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>CARREGANDO_DASHBOARD...</span>
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
              </div>
            </div>
          )}

          {/* Cards só aparecem quando dados estão carregados - sem flash visual */}

          {/* Credit Plans - Only show if data loaded and available credits < 10 */}
          {!isDataLoading && credits && credits.available_credits < 10 && (
            <CreditPlans 
              showTitle={true} 
              compact={true} 
            />
          )}

          {/* Card 1 - Credits - Only show if data loaded and available credits > 10 */}
          {!isDataLoading && credits && credits.available_credits > 10 && (
            <Card className="border-green-500/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
                  <DollarSign className="h-5 w-5" />
                  CRÉDITOS_DISPONÍVEIS
                </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
                  {`// Alocação de capital para operações`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-mono text-gray-400">DISPONÍVEL:</span>
                      <span className="text-sm font-medium font-mono text-green-400">R$ {credits.available_credits.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-mono text-gray-400">EM_USO:</span>
                      <span className="text-sm font-medium font-mono text-yellow-400">R$ {credits.in_use_credits.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <Button 
                      className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono" 
                      size="sm"
                      variant="outline"
                    >
                      GERENCIAR_CRÉDITOS
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card de Controles de Áudio */}
          {!isDataLoading && (
            <AudioControls className="border-purple-500/30 backdrop-blur-sm" />
          )}

        </div>

        {/* Blaze Configuration Modal */}
        <Modal
          isOpen={blazeConfigModal.isOpen}
          onClose={() => {
            setBlazeToken('')
            setAlertMessage(null)
            blazeConfigModal.closeModal()
          }}
          title={isConfigured ? "EDITAR_TOKEN_BLAZE" : "CONFIG_BLAZE"}
          description={isConfigured ? "Atualize seu token de autenticação Blaze" : "Configure seu token de autenticação Blaze"}
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
                setBlazeToken('')
                setAlertMessage(null)
                blazeConfigModal.closeModal()
              }
            }
          }}
        >
          <div className="space-y-4">
            {alertMessage && (
              <InlineAlert
                type={alertMessage.type}
                message={alertMessage.message}
                onClose={() => setAlertMessage(null)}
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
                placeholder="Cole seu token Blaze aqui (deixe vazio para ficar offline)..."
                className="w-full p-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 font-mono">
                {`// Token será criptografado e armazenado com segurança. Deixe vazio para desconectar.`}
              </p>
            </div>

            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-semibold text-blue-400 font-mono">COMO_OBTER_TOKEN</span>
              </div>
              <div className="text-xs text-gray-300 font-mono space-y-1">
                <p>1. Faça login na sua conta Blaze</p>
                <p>2. Abra as Ferramentas do Desenvolvedor:</p>
                <p className="pl-4">• Windows: Pressione F12 ou Ctrl+Shift+I</p>
                <p className="pl-4">• Mac: Pressione Cmd+Option+I ou F12</p>
                <p className="pl-4">• Ou clique com botão direito → &quot;Inspecionar Elemento&quot;</p>
                <p>3. Vá para Application → Local Storage</p>
                <p>4. Selecione &quot;https://blaze.bet.br&quot;</p>
                <p>5. Encontre &quot;ACCESS_TOKEN&quot; e copie o valor</p>
                <p>6. Cole no campo acima</p>
              </div>
            </div>
          </div>
        </Modal>

        {/* Strategy Selection Modal */}
        <StrategyModal
          isOpen={strategyModal.isOpen}
          onClose={() => {
            strategyModal.closeModal()
          }}
          onConfirm={handleStrategyConfirm}
          loading={botLoading}
        />
      </div>
    </div>
  )
}
