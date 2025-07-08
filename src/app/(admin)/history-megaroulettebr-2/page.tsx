'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Activity,
  Database,
  RefreshCw,
  Play,
  Square,
  Settings,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Target
} from 'lucide-react'
import AdminHeader from '@/components/AdminHeader'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'


interface HistoryRecord {
  id: number
  game_id: string
  number: number
  color: string
  game_result: string
  timestamp: string
  created_at: string
}

// 🎯 Interfaces para o simulador
interface SimulationConfig {
  m1Required: number
  m2Required: number
  m3Required: number
  m4Required: number
  baseValue: number
  sequence: number[]
}

interface SimulationState {
  isRunning: boolean
  currentRecord: number
  martingaleLevel: number
  waitingForResult: boolean
  
  // Contadores de análise
  m1Wins: number
  m2Wins: number
  m3Wins: number
  m4Losses: number
  
  // Estatísticas
  totalSimulations: number
  thresholdsReached: number
  currentStreak: number
  longestStreak: number
  
  // Histórico
  history: Array<{
    id: number
    level: number
    betColor: string
    resultColor: string
    resultNumber: number
    isWin: boolean
    timestamp: string
  }>
}

interface ThresholdReached {
  type: 'M1' | 'M2' | 'M3' | 'M4'
  count: number
  timestamp: string
}

// Componente de Tooltip reutilizável com tom grafite
const Tooltip = ({ 
  children, 
  content, 
  compact = false 
}: { 
  children: React.ReactNode; 
  content: React.ReactNode; 
  compact?: boolean;
}) => {
  return (
    <div className="relative group">
      {children}
      <div className={`
        absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2
        bg-gray-700 text-white text-xs rounded-lg px-3 py-2 
        opacity-0 group-hover:opacity-100 transition-opacity duration-200
        pointer-events-none z-10 shadow-lg border border-gray-600
        ${compact ? 'whitespace-nowrap' : 'w-64 max-w-xs'}
      `}>
        {content}
        {/* Seta do tooltip */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-700"></div>
      </div>
    </div>
  );
};



const NumberSquare = ({ 
  record, 
  isHighlighted = false
}: { 
  record: HistoryRecord;
  isHighlighted?: boolean;
}) => {
  const getSquareColors = (color: string) => {
    switch (color) {
      case 'red':
        return 'bg-red-600 text-white border-gray-900 hover:bg-red-500'
      case 'black':
        return 'bg-gray-800 text-white border-gray-900 hover:bg-gray-700'
      case 'green':
        return 'bg-green-600 text-white border-gray-900 hover:bg-green-500'
      default:
        return 'bg-gray-600 text-white border-gray-900 hover:bg-gray-500'
    }
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatTimeAgo = (dateString: string) => {
    const now = new Date()
    const date = new Date(dateString)
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))

    if (diffMinutes < 1) return 'Agora mesmo'
    if (diffMinutes < 60) return `${diffMinutes}m atrás`
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h atrás`
    return `${Math.floor(diffMinutes / 1440)}d atrás`
  }



  return (
    <Tooltip
      content={
        <div className="text-center">
          <div className="font-semibold text-white">
            {record.number} {record.color.charAt(0).toUpperCase() + record.color.slice(1)}
          </div>
          <div className="text-gray-200">{formatDateTime(record.timestamp)}</div>
          <div className="text-gray-300 text-xs">{formatTimeAgo(record.timestamp)}</div>
        </div>
      }
    >
      <div 
        data-record-id={record.id}
        className={`
          relative aspect-square flex items-center justify-center 
          border cursor-pointer transition-all duration-200
          ${getSquareColors(record.color)}
          ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-900 shadow-lg scale-105' : ''}
          opacity-100
        `}
      >
          <span className="text-xs sm:text-sm md:text-base font-bold">{record.number}</span>
      </div>
    </Tooltip>
  )
}

export default function HistoryMegaRouletteBRPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [recentRecords, setRecentRecords] = useState<HistoryRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [timeFilter, setTimeFilter] = useState('6h')
  const [totalRecordsAvailable, setTotalRecordsAvailable] = useState(0)

  // 🎯 Estados do simulador
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({
    m1Required: 8,
    m2Required: 4,
    m3Required: 2,
    m4Required: 1,
    baseValue: 20,
    sequence: [20, 20, 21, 4] // M1, M2, M3, M4
  })

  const [simulationState, setSimulationState] = useState<SimulationState>({
    isRunning: false,
    currentRecord: 0,
    martingaleLevel: 0,
    waitingForResult: false,
    m1Wins: 0,
    m2Wins: 0,
    m3Wins: 0,
    m4Losses: 0,
    totalSimulations: 0,
    thresholdsReached: 0,
    currentStreak: 0,
    longestStreak: 0,
    history: []
  })

  const [isSimulating, setIsSimulating] = useState(false)

  const [thresholdHistory, setThresholdHistory] = useState<ThresholdReached[]>([])
  const [highlightedRecords, setHighlightedRecords] = useState<number[]>([])
  const [showingThresholdDetail, setShowingThresholdDetail] = useState(false)



  // 🎯 Carregamento inicial
  useEffect(() => {
    checkCurrentUser()
    loadData()
  }, [])

  // 🔄 Auto-refresh a cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentUser) {
        loadRecentRecords()
        loadTotalRecordsCount()
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [currentUser, timeFilter])

  // 📊 Recarregar apenas histórico visual quando timeFilter mudar
  useEffect(() => {
    if (currentUser) {
      loadRecentRecords()
    }
  }, [timeFilter, currentUser])



  const checkCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)
  }

  const loadData = async () => {
    if (!loading) setRefreshing(true)
    try {
      await Promise.all([
        loadRecentRecords(),
        loadTotalRecordsCount()
      ])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const loadTotalRecordsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('history-megaroulettebr')
        .select('*', { count: 'exact', head: true })

      if (error) throw error
      setTotalRecordsAvailable(count || 0)
    } catch (error) {
      console.error('Erro ao carregar contagem total:', error)
    }
  }

  // 🔄 Carregar registros visuais com paginação automática
  const loadRecentRecords = async () => {
    try {
      console.log(`🚀 Carregando histórico visual para filtro: ${timeFilter}`)
      
      let allRecords: HistoryRecord[] = []
      let offset = 0
      const limit = 1000
      let hasMore = true
      
      while (hasMore) {
        let query = supabase
          .from('history-megaroulettebr')
          .select('*')
          .order('timestamp', { ascending: false })
          .range(offset, offset + limit - 1)

        // Aplicar filtros de tempo se necessário
        if (timeFilter !== 'total' && timeFilter !== '1s') {
          const now = new Date()
          let timeAgo: Date | null = null

          switch (timeFilter) {
            case '30m':
              timeAgo = new Date(now.getTime() - 30 * 60 * 1000)
              break
            case '1h':
              timeAgo = new Date(now.getTime() - 60 * 60 * 1000)
              break
            case '2h':
              timeAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
              break
            case '6h':
              timeAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
              break
            case '12h':
              timeAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000)
              break
            case '1d':
              timeAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
              break
            case '1m':
              timeAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
              break
            default:
              console.log(`⚠️ Filtro desconhecido: ${timeFilter}`)
              break
          }

          if (timeAgo) {
            console.log(`🔍 Aplicando filtro ${timeFilter}: desde ${timeAgo.toISOString()}`)
            query = query.gte('timestamp', timeAgo.toISOString())
          }
        } else {
          console.log(`🔍 Filtro ${timeFilter}: buscando TODOS os registros`)
        }

        // Aplicar limite alto para contornar limitação do Supabase
        if (timeFilter === 'total' || timeFilter === '1m' || timeFilter === '1s') {
          query = query.limit(100000)
        }

        const { data, error } = await query

        if (error) {
          console.error(`❌ Erro na página ${Math.floor(offset/limit) + 1}:`, error)
          throw error
        }

        const recordsReceived = data?.length || 0
        console.log(`📄 Página ${Math.floor(offset/limit) + 1}: ${recordsReceived} registros`)
        
        if (recordsReceived > 0) {
          allRecords = [...allRecords, ...data]
          offset += limit
          
          // Se recebeu menos que o limite, chegou ao fim
          hasMore = recordsReceived === limit
        } else {
          hasMore = false
        }
      }
      
      console.log(`✅ Histórico visual finalizado: ${allRecords.length} registros para filtro ${timeFilter}`)
      
      // 🔧 Filtrar duplicatas baseadas no ID único
      const uniqueRecords = allRecords.filter((record, index, arr) => 
        arr.findIndex(r => r.id === record.id) === index
      )
      
      if (uniqueRecords.length !== allRecords.length) {
        console.log(`⚠️ Removidas ${allRecords.length - uniqueRecords.length} duplicatas`)
        
        // Debug: identificar IDs duplicados
        const seenIds = new Set()
        const duplicatedIds = new Set()
        allRecords.forEach(record => {
          if (seenIds.has(record.id)) {
            duplicatedIds.add(record.id)
          }
          seenIds.add(record.id)
        })
        console.log(`🔍 IDs duplicados encontrados:`, Array.from(duplicatedIds))
      }
      
      // Debug extra: mostrar período dos registros
      if (uniqueRecords.length > 0) {
        const primeiro = uniqueRecords[0]
        const ultimo = uniqueRecords[uniqueRecords.length - 1]
        console.log(`   📅 Período: ${ultimo.timestamp} até ${primeiro.timestamp}`)
      }
      
      setRecentRecords(uniqueRecords)
      
    } catch (error) {
      console.error('Erro ao carregar registros:', error)
      toast.error('Erro ao carregar registros recentes')
    }
  }



  const forceRefresh = async () => {
    setLoading(true)
    try {
      // Forçar execução da função de monitoramento
      const { error } = await supabase.rpc('auto_monitor_history')

        if (error) throw error

      toast.success('Atualização manual executada com sucesso')
      // Recarregar tanto dados visuais quanto dados completos para análise
      await loadData()
    } catch (error) {
      console.error('Erro na atualização manual:', error)
      toast.error('Erro na atualização manual')
    } finally {
      setLoading(false)
    }
  }

  // 🎯 Funções do simulador

  const resetSimulation = () => {
    setSimulationState({
      isRunning: false,
      currentRecord: 0,
      martingaleLevel: 0,
      waitingForResult: false,
      m1Wins: 0,
      m2Wins: 0,
      m3Wins: 0,
      m4Losses: 0,
      totalSimulations: 0,
      thresholdsReached: 0,
      currentStreak: 0,
      longestStreak: 0,
      history: []
    })
    setThresholdHistory([])
    toast.success('Simulação resetada')
  }

  const runFullSimulation = async () => {
    setIsSimulating(true)
    
    try {
      // Usar registros do histórico visual
      const records = recentRecords

      if (records.length === 0) {
        toast.error('Nenhum registro encontrado no histórico visual para simulação')
        return
      }

      // Processar todos os registros de uma vez
      let martingaleLevel = 0
      let m1Wins = 0, m2Wins = 0, m3Wins = 0, m4Losses = 0
      let thresholdsReached = 0
      let currentStreak = 0, longestStreak = 0
      const history: any[] = []
      const thresholds: ThresholdReached[] = []

      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        const resultColor = getColorFromNumber(record.number)
        const betColor = 'red' // Sempre aposta no vermelho
        const isWin = resultColor === betColor
        
        // Criar entrada no histórico
        const historyEntry = {
          id: record.id,
          level: martingaleLevel + 1,
          betColor,
          resultColor,
          resultNumber: record.number,
          isWin,
          timestamp: record.timestamp
        }

        // Adicionar aos últimos 50
        history.unshift(historyEntry)
        if (history.length > 50) history.pop()
        
        // Processar resultado
        if (isWin) {
          // Vitória - registrar no nível atual e avançar
          switch (martingaleLevel) {
            case 0: // M1
              m1Wins++
              martingaleLevel = 1 // Avança para M2
              break
            case 1: // M2
              m2Wins++
              martingaleLevel = 2 // Avança para M3
              break
            case 2: // M3
              m3Wins++
              martingaleLevel = 3 // Avança para M4
              break
            case 3: // M4
              // M4 ganho - reseta tudo
              martingaleLevel = 0 // Volta para M1
              break
          }
          
        } else {
          // Derrota - registrar se for M4 e resetar
          if (martingaleLevel === 3) { // Perdeu no M4
            m4Losses++
          }
          
          martingaleLevel = 0 // Sempre volta para M1 após derrota
        }
        
        // Verificar se atingiu limiares
        const thresholdReached = (
          m1Wins >= simulationConfig.m1Required ||
          m2Wins >= simulationConfig.m2Required ||
          m3Wins >= simulationConfig.m3Required ||
          m4Losses >= simulationConfig.m4Required
        )
        
        if (thresholdReached && thresholds.length === thresholdsReached) {
          thresholdsReached++
          
          // Determinar qual limiar foi atingido
          let thresholdType: 'M1' | 'M2' | 'M3' | 'M4' = 'M1'
          if (m1Wins >= simulationConfig.m1Required) thresholdType = 'M1'
          else if (m2Wins >= simulationConfig.m2Required) thresholdType = 'M2'
          else if (m3Wins >= simulationConfig.m3Required) thresholdType = 'M3'
          else if (m4Losses >= simulationConfig.m4Required) thresholdType = 'M4'
          
          // Adicionar ao histórico de limiares
          thresholds.unshift({
            type: thresholdType,
            count: thresholdsReached,
            timestamp: record.timestamp
          })
          if (thresholds.length > 20) thresholds.pop()
          
          // Reset contadores para próxima análise
          m1Wins = 0
          m2Wins = 0
          m3Wins = 0
          m4Losses = 0
          martingaleLevel = 0
          
          // Atualizar streak
          currentStreak++
          if (currentStreak > longestStreak) {
            longestStreak = currentStreak
          }
        } else if (!thresholdReached && currentStreak > 0) {
          currentStreak = 0
        }
      }

      // Atualizar estados
      setSimulationState({
        isRunning: false,
        currentRecord: records.length,
        martingaleLevel,
        waitingForResult: false,
        m1Wins,
        m2Wins,
        m3Wins,
        m4Losses,
        totalSimulations: records.length,
        thresholdsReached,
        currentStreak,
        longestStreak,
        history
      })

      setThresholdHistory(thresholds)
      
      toast.success(`Simulação completa! ${records.length.toLocaleString()} registros processados. ${thresholdsReached} limiares atingidos.`)
      
    } catch (error) {
      console.error('Erro na simulação:', error)
      toast.error('Erro ao executar simulação')
    } finally {
      setIsSimulating(false)
    }
  }

  const getColorFromNumber = (number: number): string => {
    if (number === 0) return 'green'
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
    return redNumbers.includes(number) ? 'red' : 'black'
  }

  const handleThresholdClick = (threshold: ThresholdReached) => {
    // Simular análise completa novamente para identificar registros específicos do limiar
    const records = recentRecords
    let martingaleLevel = 0
    let m1Wins = 0, m2Wins = 0, m3Wins = 0, m4Losses = 0
    let thresholdsReached = 0
    const highlightedIds: number[] = []

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const resultColor = getColorFromNumber(record.number)
      const betColor = 'red'
      const isWin = resultColor === betColor

      if (isWin) {
        switch (martingaleLevel) {
          case 0: // M1
            m1Wins++
            martingaleLevel = 1 // Avança para M2
            break
          case 1: // M2
            m2Wins++
            martingaleLevel = 2 // Avança para M3
            break
          case 2: // M3
            m3Wins++
            martingaleLevel = 3 // Avança para M4
            break
          case 3: // M4
            // M4 ganho - reseta tudo
            martingaleLevel = 0 // Volta para M1
            break
        }
      } else {
        if (martingaleLevel === 3) { // Perdeu no M4
          m4Losses++
        }
        martingaleLevel = 0 // Sempre volta para M1 após derrota
      }

      const thresholdReached = (
        m1Wins >= simulationConfig.m1Required ||
        m2Wins >= simulationConfig.m2Required ||
        m3Wins >= simulationConfig.m3Required ||
        m4Losses >= simulationConfig.m4Required
      )

      if (thresholdReached) {
        thresholdsReached++
        
        // Se é o limiar clicado, destacar os registros
        if (thresholdsReached === threshold.count) {
          // Encontrar o início da análise atual
          let analysisStart = i
          for (let j = i - 1; j >= 0; j--) {
            const prevRecord = records[j]
            const prevResultColor = getColorFromNumber(prevRecord.number)
            const prevIsWin = prevResultColor === betColor
            
            if (j === 0 || (prevIsWin && martingaleLevel === 0)) {
              analysisStart = j
              break
            }
          }
          
          // Destacar registros do início da análise até o limiar
          for (let k = analysisStart; k <= i; k++) {
            highlightedIds.push(records[k].id)
          }
          
          setHighlightedRecords(highlightedIds)
          setShowingThresholdDetail(true)
          
          // Scroll para a primeira ocorrência destacada
          setTimeout(() => {
            const firstElement = document.querySelector(`[data-record-id="${records[analysisStart].id}"]`)
            if (firstElement) {
              firstElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }, 100)
          
          toast.success(`Destacando análise do limiar ${threshold.type} #${threshold.count}`)
          return
        }
        
        // Reset contadores para próxima análise
        m1Wins = 0
        m2Wins = 0
        m3Wins = 0
        m4Losses = 0
        martingaleLevel = 0
      }
    }
  }



  const canExitAnalysis = () => {
    return (
      simulationState.m1Wins >= simulationConfig.m1Required ||
      simulationState.m2Wins >= simulationConfig.m2Required ||
      simulationState.m3Wins >= simulationConfig.m3Required ||
      simulationState.m4Losses >= simulationConfig.m4Required
    )
  }





  const additionalActions = (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={forceRefresh}
        disabled={loading}
        className="text-blue-400 hover:bg-blue-400/10"
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
        Atualizar
      </Button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader currentUser={currentUser} additionalActions={additionalActions} />

      <main className="max-w-7xl mx-auto p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Activity className="h-7 w-7 text-purple-400" />
                  History Mega Roulette BR
                </h1>
                {refreshing && (
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    Atualizando
                  </Badge>
                )}
              </div>
              <p className="text-gray-400">Monitoramento em tempo real do histórico da Mega Roulette</p>
            </div>
            

          </div>

          {/* 🎯 Simulador de Análise */}
          <div className="space-y-4">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Target className="h-5 w-5 text-green-400" />
                    Simulador de Análise - Estratégia Martingale
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Configure quantas vitórias cada nível precisa para atingir o limiar. A cada vitória avança de nível (M1→M2→M3→M4), a cada derrota volta para M1.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  
                  {/* Configurações */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Configurações
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-gray-300">M1 Limiar</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={simulationConfig.m1Required}
                            onChange={(e) => setSimulationConfig(prev => ({
                              ...prev,
                              m1Required: parseInt(e.target.value) || 1
                            }))}
                            className="bg-gray-800 border-gray-600 text-white"
                            disabled={simulationState.isRunning}
                            placeholder="Quantas vitórias no M1"
                          />
                        </div>
                        
                        <div>
                          <Label className="text-gray-300">M2 Limiar</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={simulationConfig.m2Required}
                            onChange={(e) => setSimulationConfig(prev => ({
                              ...prev,
                              m2Required: parseInt(e.target.value) || 1
                            }))}
                            className="bg-gray-800 border-gray-600 text-white"
                            disabled={simulationState.isRunning}
                            placeholder="Quantas vitórias no M2"
                          />
                        </div>
                        
                        <div>
                          <Label className="text-gray-300">M3 Limiar</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={simulationConfig.m3Required}
                            onChange={(e) => setSimulationConfig(prev => ({
                              ...prev,
                              m3Required: parseInt(e.target.value) || 1
                            }))}
                            className="bg-gray-800 border-gray-600 text-white"
                            disabled={simulationState.isRunning}
                            placeholder="Quantas vitórias no M3"
                          />
                        </div>
                        
                        <div>
                          <Label className="text-gray-300">M4 Limiar</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={simulationConfig.m4Required}
                            onChange={(e) => setSimulationConfig(prev => ({
                              ...prev,
                              m4Required: parseInt(e.target.value) || 1
                            }))}
                            className="bg-gray-800 border-gray-600 text-white"
                            disabled={simulationState.isRunning}
                            placeholder="Quantas derrotas no M4"
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={runFullSimulation}
                          disabled={isSimulating}
                          className="flex-1"
                        >
                          {isSimulating ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Simulando...
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Simular
                            </>
                          )}
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={resetSimulation}
                          disabled={isSimulating}
                          className="text-orange-400 hover:bg-orange-400/10"
                        >
                          <Square className="h-4 w-4 mr-2" />
                          Reset
                        </Button>
                      </div>
                    </div>

          {/* Estatísticas */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Estatísticas
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-800 rounded-lg p-3">
                          <div className="text-xs text-gray-400">Simulações</div>
                          <div className="text-lg font-bold text-white">{simulationState.totalSimulations.toLocaleString()}</div>
                  </div>
                        
                        <div className="bg-gray-800 rounded-lg p-3">
                          <div className="text-xs text-gray-400">Limiares Atingidos</div>
                          <div className="text-lg font-bold text-green-400">{simulationState.thresholdsReached.toLocaleString()}</div>
                  </div>
                        
                        <div className="bg-gray-800 rounded-lg p-3">
                          <div className="text-xs text-gray-400">Taxa de Sucesso</div>
                          <div className="text-lg font-bold text-blue-400">
                            {simulationState.totalSimulations > 0 ? 
                              ((simulationState.thresholdsReached / simulationState.totalSimulations) * 100).toFixed(1) + '%' : 
                              '0%'
                            }
                  </div>
                        </div>
                        
                        <div className="bg-gray-800 rounded-lg p-3">
                          <div className="text-xs text-gray-400">Streak Atual</div>
                          <div className="text-lg font-bold text-purple-400">{simulationState.currentStreak}</div>
                        </div>
                      </div>
                      
                      {/* Contadores de vitórias por nível */}
                      <div className="bg-gray-800 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-2">Vitórias por Nível</div>
                        <div className="grid grid-cols-4 gap-2">
                          <div className="text-center">
                            <div className="text-xs text-gray-400">M1</div>
                            <div className={`text-sm font-bold ${simulationState.m1Wins >= simulationConfig.m1Required ? 'text-green-400' : 'text-white'}`}>
                              {simulationState.m1Wins}/{simulationConfig.m1Required}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400">M2</div>
                            <div className={`text-sm font-bold ${simulationState.m2Wins >= simulationConfig.m2Required ? 'text-green-400' : 'text-white'}`}>
                              {simulationState.m2Wins}/{simulationConfig.m2Required}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400">M3</div>
                            <div className={`text-sm font-bold ${simulationState.m3Wins >= simulationConfig.m3Required ? 'text-green-400' : 'text-white'}`}>
                              {simulationState.m3Wins}/{simulationConfig.m3Required}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400">M4</div>
                            <div className={`text-sm font-bold ${simulationState.m4Losses >= simulationConfig.m4Required ? 'text-green-400' : 'text-white'}`}>
                              {simulationState.m4Losses}/{simulationConfig.m4Required}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Status atual */}
                      <div className="bg-gray-800 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-2">Status Atual</div>
                        <div className="flex items-center gap-2">
                          <Badge variant={canExitAnalysis() ? "default" : "secondary"} className={canExitAnalysis() ? "bg-green-600" : ""}>
                            {canExitAnalysis() ? "Limiar Atingido!" : `Aguardando M${simulationState.martingaleLevel + 1}`}
                          </Badge>
                          <div className="text-sm text-gray-300">
                            {simulationState.totalSimulations > 0 ? `${simulationState.totalSimulations} simulações` : 'Pronto para simular'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Histórico de Limiares */}
                  {thresholdHistory.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Histórico de Limiares Atingidos
                      </h3>
                      <div className="bg-gray-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                        {thresholdHistory.map((threshold, index) => (
                          <div 
                            key={index} 
                            className="flex items-center justify-between py-1 border-b border-gray-700 last:border-b-0 cursor-pointer hover:bg-gray-700 rounded px-2 transition-colors"
                            onClick={() => handleThresholdClick(threshold)}
                            title="Clique para destacar no histórico visual"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {threshold.type}
                              </Badge>
                              <span className="text-sm text-gray-300">
                                Limiar #{threshold.count}
                              </span>
                            </div>
                    <div className="text-xs text-gray-400">
                              {new Date(threshold.timestamp).toLocaleString('pt-BR')}
                    </div>
                  </div>
                        ))}
                </div>
                    </div>
                  )}
                  

                  
              </CardContent>
            </Card>
            </div>

          {/* Filtro de Quantidade */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-white">Histórico Visual</h2>
              

              {recentRecords.length > 0 && (
                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                  {recentRecords.length} de {totalRecordsAvailable} registros
                </Badge>
              )}

              {showingThresholdDetail && (
                <div className="flex items-center gap-2">
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                    {highlightedRecords.length} registros destacados
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setHighlightedRecords([])
                      setShowingThresholdDetail(false)
                      toast.success('Destaque removido')
                    }}
                    className="text-yellow-400 hover:bg-yellow-400/10"
                  >
                    Limpar Destaque
                  </Button>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-400">
                Período: 
                {totalRecordsAvailable > 0 && (
                  <span className="text-xs text-gray-500 ml-1">
                    (de {totalRecordsAvailable} total)
                  </span>
                )}
              </label>
              <select
                value={timeFilter}
                onChange={(e) => {
                  setTimeFilter(e.target.value)
                  setRefreshing(true)
                }}
                disabled={loading}
                className="bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="30m">Últimos 30 minutos</option>
                <option value="1h">Última 1 hora</option>
                <option value="2h">Últimas 2 horas</option>
                <option value="6h">Últimas 6 horas</option>
                <option value="12h">Últimas 12 horas</option>
                <option value="1d">Último 1 dia</option>
                <option value="1m">Último 1 mês</option>
                <option value="total">Todos os registros</option>
              </select>
              
              {timeFilter !== '6h' && (
                <button
                  onClick={() => {
                    setTimeFilter('6h')
                    setRefreshing(true)
                  }}
                  className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800"
                  title="Resetar para 6h"
                >
                  ↺
                </button>
              )}


            </div>
          </div>

          {/* Grid de Números */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardDescription className="text-gray-400">
                Exibindo {recentRecords.length} resultados para período &quot;{timeFilter}&quot; em ordem cronológica (mais recente primeiro)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentRecords.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Nenhum registro encontrado</p>
                  </div>
                ) : (
                  <div className="grid gap-0" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(50px, 1fr))'}}>
                    {recentRecords.map((record) => (
                      <NumberSquare 
                        key={`${record.id}-${record.timestamp}`} 
                        record={record} 
                        isHighlighted={highlightedRecords.includes(record.id)}
                      />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
} 