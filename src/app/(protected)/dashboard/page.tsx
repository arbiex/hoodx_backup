'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bot, RefreshCw, Play, Square, Trash2, Settings } from 'lucide-react'
import MatrixRain from '@/components/MatrixRain'
import Modal, { useModal } from '@/components/ui/modal'
import InlineAlert from '@/components/ui/inline-alert'
import CreditPlans from '@/components/CreditPlans'
import CreditDisplay from '@/components/CreditDisplay'
import { useState, useEffect, memo, useCallback, useMemo } from 'react'
import { useCredits } from '@/hooks/useCredits'
import { useNetwork } from '@/hooks/useNetwork'
import { useRouter } from 'next/navigation'

// Sistema de áudio removido - funcionalidade não utilizada
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
  // blazeConfigModal removido - funcionalidade movida para página específica
  const strategyModal = useModal()
  // blazeToken removido - funcionalidade movida para página específica
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
  const { agentData, networkData, generateReferralLink, loading: networkLoading } = useNetwork()
  const router = useRouter()
  
  // Hook de alertas sonoros removido - funcionalidade não utilizada
  
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
    // Som de padrões removido - funcionalidade não utilizada
    
    setDetectedPatterns(patterns);
    setLastPatternCheck(Date.now());
  }, []);

  // Sistema de monitoramento de logs de áudio removido - funcionalidade não utilizada

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
            }
          }
        }
      }
    } catch (error) {
    }
  }, [isActive, botData?.auth?.jsessionId, botData?.auth?.originalUserId, liveHistory])

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
      setWebsocketStatus(prev => ({ ...prev, connected: false }))
    }
  }

  // Função para ativar/parar o bot
  const handleNavigateToBot = () => {
    router.push('/bmgbr2')
  }

  const handleBotToggle = async () => {
    if (isActive) {
      // Parar bot e limpar sessões automaticamente
      
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
            setAlertMessage({ 
              type: 'success', 
              message: 'Bot parado e sessões limpas com sucesso' 
            })
          } else {
            setAlertMessage({ 
              type: 'warning', 
              message: 'Bot parado, mas houve erro ao limpar sessões' 
            })
          }
        }
      } catch (error) {
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
        message: 'Configure seu token Blaze na página específica primeiro' 
      });
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
          }
        } catch (error) {
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
        return
      }

      setUserTokens(data || [])
      setIsConfigured(data && data.length > 0 && data.some(token => token.is_active))
    } catch (error) {
    } finally {
      setIsLoadingStatus(false)
    }
  }

  // Funções handleOpenModal e handleConfigureBlaze removidas - funcionalidade movida para página específica

  // Função para buscar status das apostas automáticas
  const fetchAutoBettingStatus = async () => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user?.email) return


      const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto-bet-status',
          userId: user.email
        })
      })

      const data = await response.json()

      if (data.success && data.data) {
        // CORREÇÃO: A API auto-bet-status retorna dados diretamente em data.data
        const apiData = data.data;
        

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

        // Log do status atualizado removido
      } else {
      }
    } catch (error) {
    }
  }

  return (
    <div className="px-4 relative">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10">
        <div className="flex flex-col gap-6">
          {/* Card BLAZE_TOKEN removido - funcionalidade disponível na página específica */}

          {/* Bot Control Card - Estilo similar ao ACESSO_BLAZE */}
          {!isDataLoading && (
            <button
              onClick={handleNavigateToBot}
              className={`
                w-full p-4 rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:scale-[1.02]
                bg-blue-500/5 border-blue-500/30 shadow-lg shadow-blue-500/20
              `}
              style={{ backgroundColor: '#131619' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold font-mono text-blue-400">
                      🤖 BOT_BLAZE
                    </h3>
                    <p className="text-xs text-gray-400 font-mono">
                      {`// Começar a apostar`}
                    </p>
                  </div>
                </div>
                      <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    ACESSAR
                        </span>
                  <Settings className="h-4 w-4 text-blue-400" />
                      </div>
                    </div>
            </button>
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

          {/* Card 1 - Credits - Always show when data is loaded */}
          {!isDataLoading && credits && (
            <CreditDisplay />
          )}

          {/* Credit Plans */}
          {!isDataLoading && credits && (
            <CreditPlans 
              showTitle={true} 
              compact={true} 
            />
          )}

          {/* Card de Controles de Áudio removido - funcionalidade não utilizada */}

        </div>

        {/* Modal BLAZE_TOKEN removido - funcionalidade disponível na página específica */}

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
