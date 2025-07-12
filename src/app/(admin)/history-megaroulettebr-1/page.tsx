'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Activity,
  Database,
  RefreshCw,
  Download,
  BarChart3,
  Target
} from 'lucide-react'
import AdminHeader from '@/components/AdminHeader'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

// 🎯 Matriz de referência da roleta - Define propriedades de cada número
const ROULETTE_NUMBERS = {
  0: { color: 'green', parity: null, height: null },
  1: { color: 'red', parity: 'odd', height: 'low' },
  2: { color: 'black', parity: 'even', height: 'low' },
  3: { color: 'red', parity: 'odd', height: 'low' },
  4: { color: 'black', parity: 'even', height: 'low' },
  5: { color: 'red', parity: 'odd', height: 'low' },
  6: { color: 'black', parity: 'even', height: 'low' },
  7: { color: 'red', parity: 'odd', height: 'low' },
  8: { color: 'black', parity: 'even', height: 'low' },
  9: { color: 'red', parity: 'odd', height: 'low' },
  10: { color: 'black', parity: 'even', height: 'low' },
  11: { color: 'black', parity: 'odd', height: 'low' },
  12: { color: 'red', parity: 'even', height: 'low' },
  13: { color: 'black', parity: 'odd', height: 'low' },
  14: { color: 'red', parity: 'even', height: 'low' },
  15: { color: 'black', parity: 'odd', height: 'low' },
  16: { color: 'red', parity: 'even', height: 'low' },
  17: { color: 'black', parity: 'odd', height: 'low' },
  18: { color: 'red', parity: 'even', height: 'low' },
  19: { color: 'red', parity: 'odd', height: 'high' },
  20: { color: 'black', parity: 'even', height: 'high' },
  21: { color: 'red', parity: 'odd', height: 'high' },
  22: { color: 'black', parity: 'even', height: 'high' },
  23: { color: 'red', parity: 'odd', height: 'high' },
  24: { color: 'black', parity: 'even', height: 'high' },
  25: { color: 'red', parity: 'odd', height: 'high' },
  26: { color: 'black', parity: 'even', height: 'high' },
  27: { color: 'red', parity: 'odd', height: 'high' },
  28: { color: 'black', parity: 'even', height: 'high' },
  29: { color: 'black', parity: 'odd', height: 'high' },
  30: { color: 'red', parity: 'even', height: 'high' },
  31: { color: 'black', parity: 'odd', height: 'high' },
  32: { color: 'red', parity: 'even', height: 'high' },
  33: { color: 'black', parity: 'odd', height: 'high' },
  34: { color: 'red', parity: 'even', height: 'high' },
  35: { color: 'black', parity: 'odd', height: 'high' },
  36: { color: 'red', parity: 'even', height: 'high' }
} as const

// 🎯 Função auxiliar para obter propriedades de um número
const getNumberProperties = (number: number) => {
  return ROULETTE_NUMBERS[number as keyof typeof ROULETTE_NUMBERS] || { color: 'green', parity: null, height: null }
}

interface HistoryRecord {
  id: number
  game_id: string
  number: number
  color: string
  game_result: string
  timestamp: string
  created_at: string
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
  isNewest = false
}: { 
  record: HistoryRecord;
  isNewest?: boolean;
}) => {
  const getSquareColors = (color: string) => {
    switch (color) {
      case 'red':
        return 'bg-red-600 text-white border-gray-900 hover:bg-red-500 shadow-lg'
      case 'black':
        return 'bg-gray-800 text-white border-gray-900 hover:bg-gray-700 shadow-lg'
      case 'green':
        return 'bg-green-600 text-white border-gray-900 hover:bg-green-500 shadow-lg'
      default:
        return 'bg-gray-600 text-white border-gray-900 hover:bg-gray-500 shadow-lg'
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

  const getBorderStyle = () => {
    if (isNewest) {
      return 'border-2 border-blue-400 ring-2 ring-blue-400/50'
    }
    return 'border border-gray-600'
  }

  return (
    <Tooltip
      content={
        <div className="text-center">
          <div className="font-semibold text-white">
            Número {record.number} • {record.color.charAt(0).toUpperCase() + record.color.slice(1)}
          </div>
          <div className="text-gray-200">{formatDateTime(record.timestamp)}</div>
          <div className="text-gray-300 text-xs">{formatTimeAgo(record.timestamp)}</div>
          <div className="text-gray-400 text-xs mt-1">
            ID: {record.game_id} • Posição: {record.id}
          </div>
          {isNewest && (
            <div className="text-blue-400 text-xs font-semibold mt-1">
              (MAIS RECENTE)
            </div>
          )}
        </div>
      }
    >
      <div 
        className={`
          relative aspect-square flex items-center justify-center 
          cursor-pointer transition-all duration-200 hover:scale-105
          ${getSquareColors(record.color)}
          ${getBorderStyle()}
        `}
      >
        <span className="text-xs sm:text-sm md:text-base font-bold">{record.number}</span>
      </div>
    </Tooltip>
  )
}

// 🎯 Componente de Simulação da Estratégia de Padrão de Repetição


export default function HistoryMegaRouletteBRPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [recentRecords, setRecentRecords] = useState<HistoryRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [timeFilter, setTimeFilter] = useState('6h')
  const [totalRecordsAvailable, setTotalRecordsAvailable] = useState(0)
  const [fullRecords, setFullRecords] = useState<HistoryRecord[]>([]) // Dados completos para análise (independente do filtro visual)



  // 🎯 Carregamento inicial
  useEffect(() => {
    checkCurrentUser()
    loadData()
  }, [])

  // 🔄 Auto-refresh a cada 30 segundos (histórico visual + dados completos + contagem)
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentUser) {
        loadRecentRecords() // 🆕 Histórico Visual
        loadFullRecords() // Dados para análise
        loadTotalRecordsCount() // Contagem total
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

  // 🔢 Carregar dados completos quando usuário for detectado
  useEffect(() => {
    if (currentUser) {
      loadFullRecords()
    }
  }, [currentUser])

  const checkCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)
  }

  const loadData = async () => {
    if (!loading) setRefreshing(true)
    try {
      await Promise.all([
        loadRecentRecords(),
        loadTotalRecordsCount(),
        loadFullRecords() // 🆕 Carregar dados completos para análise
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
      
      // 🔧 Garantir ordenação correta por timestamp (mais recente primeiro)
      const sortedRecords = [...uniqueRecords].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      
      // Debug extra: mostrar período dos registros
      if (sortedRecords.length > 0) {
        const primeiro = sortedRecords[0]
        const ultimo = sortedRecords[sortedRecords.length - 1]
        console.log(`   📅 Período: ${ultimo.timestamp} até ${primeiro.timestamp}`)
        console.log(`   🔄 Ordem verificada: ${primeiro.timestamp} (mais recente) → ${ultimo.timestamp} (mais antigo)`)
      }
      
      setRecentRecords(sortedRecords)
      
    } catch (error) {
      console.error('Erro ao carregar registros:', error)
      toast.error('Erro ao carregar registros recentes')
    }
  }

  // 🆕 Carregar dados completos para análise usando paginação automática
  const loadFullRecords = async () => {
    try {
      console.log(`🚀 Carregando dados completos para análise`)
      
      let allRecords: HistoryRecord[] = []
      let offset = 0
      const limit = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('history-megaroulettebr')
          .select('*')
          .order('timestamp', { ascending: false })
          .range(offset, offset + limit - 1)

        if (error) throw error

        const recordsReceived = data?.length || 0
        console.log(`📄 Análise página ${Math.floor(offset/limit) + 1}: ${recordsReceived} registros`)
        
        if (recordsReceived > 0) {
          allRecords = [...allRecords, ...data]
          offset += limit
          hasMore = recordsReceived === limit
        } else {
          hasMore = false
        }
      }
      
      console.log(`✅ Dados completos carregados: ${allRecords.length} registros`)
      
      // 🔧 Filtrar duplicatas baseadas no ID único
      const uniqueRecords = allRecords.filter((record, index, arr) => 
        arr.findIndex(r => r.id === record.id) === index
      )
      
      if (uniqueRecords.length !== allRecords.length) {
        console.log(`⚠️ Análise: Removidas ${allRecords.length - uniqueRecords.length} duplicatas`)
      }
      
      // 🔧 Garantir ordenação correta por timestamp (mais recente primeiro)
      const sortedRecords = [...uniqueRecords].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      
      console.log(`   🔄 Dados completos ordenados: ${sortedRecords.length} registros`)
      
      setFullRecords(sortedRecords)
      
    } catch (error) {
      console.error('Erro ao carregar registros completos:', error)
      toast.error('Erro ao carregar dados para análise')
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

  // Estatísticas dos números
  const getStatistics = () => {
    const redCount = recentRecords.filter(r => r.color === 'red').length
    const blackCount = recentRecords.filter(r => r.color === 'black').length
    const greenCount = recentRecords.filter(r => r.color === 'green').length
    const total = recentRecords.length

    // 🆕 Calcular frequência média de sequências de 4+ vermelhos
    const calculateRedSequenceFrequency = () => {
      if (recentRecords.length < 4) return null;

      // Ordenar por timestamp (mais antigo primeiro) para análise cronológica
      const sortedRecords = [...recentRecords].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      let sequenceCount = 0;
      let currentSequenceLength = 0;

              // Detectar sequências de 4+ vermelhos consecutivos
        for (let i = 0; i < sortedRecords.length; i++) {
          const record = sortedRecords[i];
          const props = getNumberProperties(record.number);
          
          if (props.color === 'red') {
            currentSequenceLength++;
          } else {
            // Sequência quebrada
            if (currentSequenceLength >= 4) {
              sequenceCount++;
            }
            currentSequenceLength = 0;
          }
        }

      // Verificar se a última sequência também tem 4+ vermelhos
      if (currentSequenceLength >= 4) {
        sequenceCount++;
      }

      // Calcular frequência: quantas rodadas em média para cada sequência
      const averageFrequency = sequenceCount > 0 
        ? Math.round(sortedRecords.length / sequenceCount) 
        : null;

      return {
        averageFrequency, // Rodadas por sequência (ex: 100 = 1 sequência a cada 100 rodadas)
        sequenceCount,
        totalRounds: sortedRecords.length
      };
    };

    const redSequenceStats = calculateRedSequenceFrequency();

    return { 
      redCount, 
      blackCount, 
      greenCount, 
      total,
      redSequenceStats
    }
  }

  const stats = getStatistics()

  const downloadJSON = () => {
    const exportData = {
      metadata: {
        total_records: recentRecords.length,
        total_available: totalRecordsAvailable,
        time_filter: timeFilter,
        export_date: new Date().toISOString(),
        statistics: {
          red_count: stats.redCount,
          black_count: stats.blackCount,
          green_count: stats.greenCount,
          red_percentage: ((stats.redCount / stats.total) * 100).toFixed(1),
          black_percentage: ((stats.blackCount / stats.total) * 100).toFixed(1),
          green_percentage: ((stats.greenCount / stats.total) * 100).toFixed(1),
          red_sequence_analysis: {
            average_frequency: stats.redSequenceStats?.averageFrequency,
            sequence_count: stats.redSequenceStats?.sequenceCount,
            total_rounds: stats.redSequenceStats?.totalRounds
          }
        }
      },
      records: recentRecords.map(record => ({
        id: record.id,
        game_id: record.game_id,
        number: record.number,
        color: record.color,
        game_result: record.game_result,
        timestamp: record.timestamp,
        created_at: record.created_at
      }))
    }

    const dataStr = JSON.stringify(exportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `mega-roulette-history-${recentRecords.length}-records-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(`${recentRecords.length} registros exportados com sucesso!`)
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
              {/* 🔍 DEBUG: URL REAL DO HISTÓRICO DA PRAGMATIC */}
              <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs font-mono text-yellow-400">
                <div className="font-semibold mb-2">📊 URL REAL DO HISTÓRICO DA PRAGMATIC (após obter JSESSIONID):</div>
                
                <div className="space-y-2">
                  <div>
                    <span className="text-yellow-300">🎯 Pragmatic History (REAL):</span>
                    <div className="break-all text-gray-300 ml-2 p-2 bg-gray-800/50 rounded border border-gray-600/30">
                      <span className="text-red-400">❌ JSESSIONID não disponível nesta página - acesse /bmgbr para obter tokens</span>
                    </div>
                    <div className="text-gray-400 ml-2 text-xs mt-2">
                      ↳ Esta URL só funciona depois que obtemos o JSESSIONID da Pragmatic<br/>
                      ↳ Retorna 500 resultados em JSON com gameId, gameResult, megaSlots, etc.<br/>
                      ↳ Os dados desta URL populam a tabela Supabase &apos;history-megaroulettebr&apos;<br/>
                      ↳ Exemplo de resposta: {`{"gameResult":"27 Red","gameId":"9014406214",...}`}<br/>
                      ↳ <span className="text-red-400">❌ Para ver URL real, inicie operação em /bmgbr primeiro</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Estatísticas */}
          {recentRecords.length > 0 && (
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Estatísticas dos {stats.total} Jogos Mostrados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  <div className="text-center p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <div className="text-2xl font-bold text-red-400">{stats.redCount}</div>
                    <div className="text-sm text-red-300">Vermelhos</div>
                    <div className="text-xs text-gray-400">{((stats.redCount / stats.total) * 100).toFixed(1)}%</div>
                  </div>
                  <div className="text-center p-4 bg-gray-500/10 border border-gray-500/30 rounded-lg">
                    <div className="text-2xl font-bold text-gray-300">{stats.blackCount}</div>
                    <div className="text-sm text-gray-200">Pretos</div>
                    <div className="text-xs text-gray-400">{((stats.blackCount / stats.total) * 100).toFixed(1)}%</div>
                  </div>
                  <div className="text-center p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="text-2xl font-bold text-green-400">{stats.greenCount}</div>
                    <div className="text-sm text-green-300">Verdes</div>
                    <div className="text-xs text-gray-400">{stats.total > 0 ? ((stats.greenCount / stats.total) * 100).toFixed(1) : 0}%</div>
                  </div>
                  {/* 🆕 Nova estatística: Média de distância entre sequências de 4+ vermelhos */}
                  <Tooltip 
                    content={
                      <div className="space-y-2">
                        <div className="font-semibold">Frequência de Sequências 4+R</div>
                        <div>Calcula a frequência média de sequências de 4 ou mais vermelhos consecutivos.</div>
                        {stats.redSequenceStats?.sequenceCount && stats.redSequenceStats.sequenceCount > 0 && (
                          <div className="text-xs">
                            <div>Sequências encontradas: {stats.redSequenceStats.sequenceCount}</div>
                            <div>Total de rodadas: {stats.redSequenceStats.totalRounds}</div>
                            {stats.redSequenceStats.averageFrequency && (
                              <div>Frequência: 1 sequência a cada {stats.redSequenceStats.averageFrequency} rodadas</div>
                            )}
                          </div>
                        )}
                        <div className="text-xs text-gray-300">
                          {stats.redSequenceStats?.sequenceCount === 0 && "Nenhuma sequência de 4+ vermelhos encontrada"}
                        </div>
                      </div>
                    }
                  >
                    <div className="text-center p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg cursor-help">
                      <div className="flex items-center justify-center mb-2">
                        <Target className="h-5 w-5 text-orange-400" />
                      </div>
                      <div className="text-2xl font-bold text-orange-400">
                        {stats.redSequenceStats?.averageFrequency ? `1:${stats.redSequenceStats.averageFrequency}` : '--'}
                      </div>
                      <div className="text-sm text-orange-300">Freq. Média</div>
                      <div className="text-xs text-gray-400">
                        {stats.redSequenceStats?.sequenceCount 
                          ? `${stats.redSequenceStats.sequenceCount} seq. em ${stats.redSequenceStats.totalRounds} rodadas`
                          : 'Sem sequências 4+R'
                        }
                      </div>
                    </div>
                  </Tooltip>
                  <div className="text-center p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <div className="text-2xl font-bold text-blue-400">{stats.total}</div>
                    <div className="text-sm text-blue-300">Total</div>
                    <div className="text-xs text-gray-400">
                      {recentRecords.length > 0 ? `Desde ${new Date(recentRecords[recentRecords.length - 1]?.timestamp).toLocaleDateString('pt-BR')}` : 'N/A'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 🆕 Tabela de Sequências por Hora */}
          {recentRecords.length > 0 && (() => {
            // Calcular média de sequências por hora do dia (00h-23h) para vermelhos e pretos
            const calculateSequencesByHour = () => {
              // Agrupar registros por hora do dia (ignorando data específica)
              const hourlyGroups: { [hour: number]: HistoryRecord[] } = {};
              
              // Inicializar todas as 24 horas
              for (let h = 0; h < 24; h++) {
                hourlyGroups[h] = [];
              }
              
              // Agrupar registros por hora do dia
              recentRecords.forEach(record => {
                const recordTime = new Date(record.timestamp);
                const hourOfDay = recordTime.getHours();
                hourlyGroups[hourOfDay].push(record);
              });
              
              // Calcular média de sequências para cada hora do dia
              const hourlySequences: { 
                hour: string; 
                redSequences: number; 
                blackSequences: number; 
                total: number; 
              }[] = [];
              
              for (let h = 0; h < 24; h++) {
                const recordsInHour = hourlyGroups[h];
                
                if (recordsInHour.length === 0) {
                  hourlySequences.push({
                    hour: `${String(h).padStart(2, '0')}:00`,
                    redSequences: 0,
                    blackSequences: 0,
                    total: 0
                  });
                  continue;
                }
                
                // Agrupar por dia específico para calcular média
                const dayGroups: { [day: string]: HistoryRecord[] } = {};
                
                recordsInHour.forEach(record => {
                  const recordTime = new Date(record.timestamp);
                  const dayKey = `${recordTime.getFullYear()}-${String(recordTime.getMonth() + 1).padStart(2, '0')}-${String(recordTime.getDate()).padStart(2, '0')}`;
                  
                  if (!dayGroups[dayKey]) {
                    dayGroups[dayKey] = [];
                  }
                  dayGroups[dayKey].push(record);
                });
                
                // Calcular sequências para cada dia nesta hora
                let totalRedSequences = 0;
                let totalBlackSequences = 0;
                let totalRounds = 0;
                const daysCount = Object.keys(dayGroups).length;
                
                Object.keys(dayGroups).forEach(dayKey => {
                  const dayRecords = dayGroups[dayKey].sort((a, b) => 
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                  );
                  
                  // Contar sequências de 4+ vermelhos neste dia/hora
                  let redSequenceCount = 0;
                  let currentRedSequence = 0;
                  
                  // Contar sequências de 4+ pretos neste dia/hora
                  let blackSequenceCount = 0;
                  let currentBlackSequence = 0;
                  
                  dayRecords.forEach(record => {
                    const props = getNumberProperties(record.number);
                    
                    if (props.color === 'red') {
                      currentRedSequence++;
                      // Resetar sequência preta
                      if (currentBlackSequence >= 4) {
                        blackSequenceCount++;
                      }
                      currentBlackSequence = 0;
                    } else if (props.color === 'black') {
                      currentBlackSequence++;
                      // Resetar sequência vermelha
                      if (currentRedSequence >= 4) {
                        redSequenceCount++;
                      }
                      currentRedSequence = 0;
                    } else {
                      // Verde reseta ambas
                      if (currentRedSequence >= 4) {
                        redSequenceCount++;
                      }
                      if (currentBlackSequence >= 4) {
                        blackSequenceCount++;
                      }
                      currentRedSequence = 0;
                      currentBlackSequence = 0;
                    }
                  });
                  
                  // Verificar se as últimas sequências também são 4+
                  if (currentRedSequence >= 4) {
                    redSequenceCount++;
                  }
                  if (currentBlackSequence >= 4) {
                    blackSequenceCount++;
                  }
                  
                  totalRedSequences += redSequenceCount;
                  totalBlackSequences += blackSequenceCount;
                  totalRounds += dayRecords.length;
                });
                
                // Calcular médias
                const averageRedSequences = daysCount > 0 ? Math.round((totalRedSequences / daysCount) * 100) / 100 : 0;
                const averageBlackSequences = daysCount > 0 ? Math.round((totalBlackSequences / daysCount) * 100) / 100 : 0;
                
                hourlySequences.push({
                  hour: `${String(h).padStart(2, '0')}:00`,
                  redSequences: averageRedSequences,
                  blackSequences: averageBlackSequences,
                  total: Math.round((totalRounds / daysCount) * 100) / 100
                });
              }
              
              return hourlySequences;
            };
            
            const hourlyData = calculateSequencesByHour();
            const totalRedSequences = hourlyData.reduce((sum, hour) => sum + hour.redSequences, 0);
            const totalBlackSequences = hourlyData.reduce((sum, hour) => sum + hour.blackSequences, 0);
            
            return (
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-purple-400" />
                    Análise de Sequências 4+R e 4+P por Hora ({timeFilter === 'total' ? 'Todos os Registros' : timeFilter === '30m' ? 'Últimos 30min' : timeFilter === '1h' ? 'Última 1h' : timeFilter === '2h' ? 'Últimas 2h' : timeFilter === '6h' ? 'Últimas 6h' : timeFilter === '12h' ? 'Últimas 12h' : timeFilter === '1d' ? 'Último 1d' : 'Último 1m'})
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Média de sequências de 4+ vermelhos e 4+ pretos para cada hora do dia (00h-23h) baseada {timeFilter === 'total' ? 'em todos os registros' : timeFilter === '30m' ? 'nos últimos 30min' : timeFilter === '1h' ? 'na última 1h' : timeFilter === '2h' ? 'nas últimas 2h' : timeFilter === '6h' ? 'nas últimas 6h' : timeFilter === '12h' ? 'nas últimas 12h' : timeFilter === '1d' ? 'no último 1d' : 'no último 1m'}
                  </CardDescription>
                </CardHeader>
                                 <CardContent>
                   <div className="overflow-x-auto">
                     <div className="max-h-96 overflow-y-auto">
                       <table className="w-full text-sm">
                         <thead className="sticky top-0 bg-gray-900 z-10">
                           <tr className="border-b border-gray-700">
                             <th className="text-left py-2 px-3 text-gray-300">Hora</th>
                             <th className="text-center py-2 px-3 text-gray-300">Média Seq. 4+R</th>
                             <th className="text-center py-2 px-3 text-gray-300">Freq. R</th>
                             <th className="text-center py-2 px-3 text-gray-300">Média Seq. 4+P</th>
                             <th className="text-center py-2 px-3 text-gray-300">Freq. P</th>
                           </tr>
                         </thead>
                                             <tbody className="divide-y divide-gray-700">
                         {hourlyData.map((hourData, index) => {
                           const isHighActivity = hourData.redSequences >= 1 || hourData.blackSequences >= 1;
                           const hasData = hourData.total > 0;
                           
                           return (
                             <tr 
                               key={index} 
                               className={`hover:bg-gray-800/50 transition-colors ${
                                 isHighActivity ? 'bg-orange-500/5' : ''
                               } ${!hasData ? 'opacity-50' : ''}`}
                             >
                               <td className="py-2 px-3 text-gray-200 font-mono text-xs">
                                 <div className="flex items-center gap-2">
                                   {hourData.hour}
                                   {!hasData && (
                                     <span className="text-xs bg-gray-500/20 text-gray-400 px-1 py-0.5 rounded">
                                       Sem dados
                                     </span>
                                   )}
                                 </div>
                               </td>
                               {/* Sequências Vermelhas */}
                               <td className="py-2 px-3 text-center">
                                 {hourData.redSequences > 0 ? (
                                   <div className="flex items-center justify-center gap-1">
                                     <span className={`font-bold ${
                                       hourData.redSequences >= 2 ? 'text-red-400' : 
                                       hourData.redSequences >= 1 ? 'text-orange-400' : 
                                       'text-yellow-400'
                                     }`}>
                                       {hourData.redSequences}
                                     </span>
                                     {hourData.redSequences >= 1 && (
                                       <span className="text-xs">🔥</span>
                                     )}
                                   </div>
                                 ) : (
                                   <span className="text-gray-500">0</span>
                                 )}
                               </td>
                               {/* Frequência Vermelhas */}
                               <td className="py-2 px-3 text-center text-gray-400">
                                 {hourData.redSequences > 0 && hourData.total > 0 ? (
                                   <span className="text-green-400 font-mono">
                                     1:{Math.round(hourData.total / hourData.redSequences)}
                                   </span>
                                 ) : (
                                   <span className="text-gray-500">--</span>
                                 )}
                               </td>
                               {/* Sequências Pretas */}
                               <td className="py-2 px-3 text-center">
                                 {hourData.blackSequences > 0 ? (
                                   <div className="flex items-center justify-center gap-1">
                                     <span className={`font-bold ${
                                       hourData.blackSequences >= 2 ? 'text-gray-300' : 
                                       hourData.blackSequences >= 1 ? 'text-gray-400' : 
                                       'text-gray-500'
                                     }`}>
                                       {hourData.blackSequences}
                                     </span>
                                     {hourData.blackSequences >= 1 && (
                                       <span className="text-xs">⚫</span>
                                     )}
                                   </div>
                                 ) : (
                                   <span className="text-gray-500">0</span>
                                 )}
                               </td>
                               {/* Frequência Pretas */}
                               <td className="py-2 px-3 text-center text-gray-400">
                                 {hourData.blackSequences > 0 && hourData.total > 0 ? (
                                   <span className="text-blue-400 font-mono">
                                     1:{Math.round(hourData.total / hourData.blackSequences)}
                                   </span>
                                 ) : (
                                   <span className="text-gray-500">--</span>
                                 )}
                               </td>
                             </tr>
                           );
                         })}
                                                </tbody>
                       </table>
                     </div>
                     
                     {/* Footer com estatísticas resumidas */}
                     <div className="mt-4 pt-4 border-t border-gray-700">
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-xs">
                         <div>
                           <div className="text-gray-400">Horas com Seq. R</div>
                           <div className="text-white font-bold">
                             {hourlyData.filter(h => h.redSequences > 0).length}/24
                           </div>
                         </div>
                         <div>
                           <div className="text-gray-400">Horas com Seq. P</div>
                           <div className="text-white font-bold">
                             {hourlyData.filter(h => h.blackSequences > 0).length}/24
                           </div>
                         </div>
                         <div>
                           <div className="text-gray-400">Total Seq. R</div>
                           <div className="text-red-400 font-bold">
                             {totalRedSequences.toFixed(1)}
                           </div>
                         </div>
                         <div>
                           <div className="text-gray-400">Total Seq. P</div>
                           <div className="text-gray-300 font-bold">
                             {totalBlackSequences.toFixed(1)}
                           </div>
                         </div>
                       </div>
                     </div>
                   </div>
                 </CardContent>
              </Card>
            );
          })()}

          {/* 🆕 Card de Comparação com Dia Anterior */}
          {(() => {
            // Função para calcular comparativo com dia anterior (independente do filtro)
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
              
              // Buscar registros de ontem na mesma hora (independente do filtro)
              const yesterdayRecords = fullRecords.filter((record: HistoryRecord) => {
                const recordTime = new Date(record.timestamp);
                return recordTime >= yesterdayStart && recordTime <= yesterdayEnd;
              });
              
              // Buscar registros de anteôntem na mesma hora
              const dayBeforeYesterdayRecords = fullRecords.filter((record: HistoryRecord) => {
                const recordTime = new Date(record.timestamp);
                return recordTime >= dayBeforeYesterdayStart && recordTime <= dayBeforeYesterdayEnd;
              });
              
              // Buscar registros de hoje na mesma hora
              const todayRecords = fullRecords.filter((record: HistoryRecord) => {
                const recordTime = new Date(record.timestamp);
                return recordTime >= todayStart && recordTime <= todayEnd;
              });

              // 🆕 Função para calcular rodadas desde a última sequência
              const calculateRoundsSinceLastSequence = () => {
                // Ordenar todos os registros do mais recente para o mais antigo
                const sortedRecords = [...fullRecords].sort((a, b) => 
                  new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );

                const findLastSequence = (sequenceType: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high') => {
                  // Procurar por sequências terminadas
                  let currentSequence = 0;
                  let sequenceStartPosition = -1;
                  

                  
                  for (let i = 0; i < sortedRecords.length; i++) {
                    const record = sortedRecords[i];
                    const number = record.number;
                    let matches = false;
                    
                    const props = getNumberProperties(number);
                    
                    switch (sequenceType) {
                      case 'red':
                        matches = props.color === 'red';
                        break;
                      case 'black':
                        matches = props.color === 'black';
                        break;
                      case 'even':
                        matches = props.parity === 'even';
                        break;
                      case 'odd':
                        matches = props.parity === 'odd';
                        break;
                      case 'low':
                        matches = props.height === 'low';
                        break;
                      case 'high':
                        matches = props.height === 'high';
                        break;
                    }
                    

                    
                    if (matches) {
                      if (currentSequence === 0) {
                        sequenceStartPosition = i; // Início da sequência na busca reversa
                      }
                      currentSequence++;
                    } else {
                                              if (currentSequence >= 4) {
                          // Encontrou uma sequência completa
                          // O final REAL da sequência é onde ela começou na busca reversa (sequenceStartPosition)
                          return sequenceStartPosition; // Retorna a posição do fim real da sequência
                        }
                      currentSequence = 0;
                      sequenceStartPosition = -1;
                    }
                  }
                  
                  // Verificar se há sequência em andamento no início (mais recente)
                  if (currentSequence >= 4 && sequenceStartPosition === 0) {
                    // A sequência está em andamento, não há rodadas desde o fim
                    return 0;
                  }
                  
                  // Se encontrou uma sequência, retornar quantas rodadas desde o fim
                  return sequenceStartPosition >= 0 ? sequenceStartPosition : -1;
                };

                return {
                  red: findLastSequence('red') >= 0 ? `${findLastSequence('red')}r` : '--',
                  black: findLastSequence('black') >= 0 ? `${findLastSequence('black')}r` : '--',
                  even: findLastSequence('even') >= 0 ? `${findLastSequence('even')}r` : '--',
                  odd: findLastSequence('odd') >= 0 ? `${findLastSequence('odd')}r` : '--',
                  low: findLastSequence('low') >= 0 ? `${findLastSequence('low')}r` : '--',
                  high: findLastSequence('high') >= 0 ? `${findLastSequence('high')}r` : '--'
                };
              };

              const roundsSinceLastSequence = calculateRoundsSinceLastSequence();
              
              if (yesterdayRecords.length === 0) {
                return {
                  currentTime: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
                  hasData: false,
                  redFrequency: 0,
                  blackFrequency: 0,
                  redComparison: 0,
                  blackComparison: 0,
                  totalRounds: 0,
                  todayFrequency: { red: 0, black: 0 },
                  todayRounds: todayRecords.length,
                  dayBeforeYesterdayFrequency: { red: 0, black: 0 },
                                dayBeforeYesterdayRounds: 0,
              dayBeforeYesterdaySequences: { red: 0, black: 0 },
              // Dados de par/ímpar vazios
              evenFrequency: 0,
              oddFrequency: 0,
              evenSequenceCount: 0,
              oddSequenceCount: 0,
              todayParImparFrequency: { even: 0, odd: 0 },
              todayParImparSequences: { even: 0, odd: 0 },
              dayBeforeYesterdayParImparFrequency: { even: 0, odd: 0 },
              dayBeforeYesterdayParImparSequences: { even: 0, odd: 0 },
              // Dados de baixo/alto vazios
              lowFrequency: 0,
              highFrequency: 0,
              lowSequenceCount: 0,
              highSequenceCount: 0,
              todayBaixoAltoFrequency: { low: 0, high: 0 },
              todayBaixoAltoSequences: { low: 0, high: 0 },
              dayBeforeYesterdayBaixoAltoFrequency: { low: 0, high: 0 },
              dayBeforeYesterdayBaixoAltoSequences: { low: 0, high: 0 }
            };
              }
              
              // Função para calcular sequências de cores em um conjunto de dados
              const calculateSequences = (dataRecords: any[]) => {
                const sortedRecords = dataRecords.sort((a, b) => 
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
                
                let redSequenceCount = 0;
                let blackSequenceCount = 0;
                let currentRedSequence = 0;
                let currentBlackSequence = 0;
                let redSequenceStart = -1;
                let blackSequenceStart = -1;
                
                // Arrays para armazenar detalhes das sequências
                const redSequences: { start: number, end: number, startNumber: number, endNumber: number, length: number }[] = [];
                const blackSequences: { start: number, end: number, startNumber: number, endNumber: number, length: number }[] = [];
                
                sortedRecords.forEach((record, index) => {
                  const props = getNumberProperties(record.number);
                  
                  if (props.color === 'red') {
                    if (currentRedSequence === 0) {
                      redSequenceStart = index;
                    }
                    currentRedSequence++;
                    
                    // Finalizar sequência preta se necessário
                    if (currentBlackSequence >= 4) {
                      blackSequenceCount++;
                      blackSequences.push({
                        start: blackSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[blackSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentBlackSequence
                      });
                    }
                    currentBlackSequence = 0;
                    blackSequenceStart = -1;
                  } else if (props.color === 'black') {
                    if (currentBlackSequence === 0) {
                      blackSequenceStart = index;
                    }
                    currentBlackSequence++;
                    
                    // Finalizar sequência vermelha se necessário
                    if (currentRedSequence >= 4) {
                      redSequenceCount++;
                      redSequences.push({
                        start: redSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[redSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentRedSequence
                      });
                    }
                    currentRedSequence = 0;
                    redSequenceStart = -1;
                  } else {
                    // Verde reseta ambas
                    if (currentRedSequence >= 4) {
                      redSequenceCount++;
                      redSequences.push({
                        start: redSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[redSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentRedSequence
                      });
                    }
                    if (currentBlackSequence >= 4) {
                      blackSequenceCount++;
                      blackSequences.push({
                        start: blackSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[blackSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentBlackSequence
                      });
                    }
                    currentRedSequence = 0;
                    currentBlackSequence = 0;
                    redSequenceStart = -1;
                    blackSequenceStart = -1;
                  }
                });
                
                // Verificar últimas sequências
                if (currentRedSequence >= 4) {
                  redSequenceCount++;
                  redSequences.push({
                    start: redSequenceStart,
                    end: sortedRecords.length - 1,
                    startNumber: sortedRecords[redSequenceStart].number,
                    endNumber: sortedRecords[sortedRecords.length - 1].number,
                    length: currentRedSequence
                  });
                }
                if (currentBlackSequence >= 4) {
                  blackSequenceCount++;
                  blackSequences.push({
                    start: blackSequenceStart,
                    end: sortedRecords.length - 1,
                    startNumber: sortedRecords[blackSequenceStart].number,
                    endNumber: sortedRecords[sortedRecords.length - 1].number,
                    length: currentBlackSequence
                  });
                }
                
                return {
                  redSequenceCount,
                  blackSequenceCount,
                  totalRounds: sortedRecords.length,
                  redFrequency: redSequenceCount > 0 ? Math.round(sortedRecords.length / redSequenceCount) : 0,
                  blackFrequency: blackSequenceCount > 0 ? Math.round(sortedRecords.length / blackSequenceCount) : 0,
                  redSequences,  // 🆕 Array com detalhes das sequências vermelhas
                  blackSequences // 🆕 Array com detalhes das sequências pretas
                };
              };
              
              // Função para calcular sequências de números pares e ímpares
              const calculateSequencesParImpar = (dataRecords: any[]) => {
                const sortedRecords = dataRecords.sort((a, b) => 
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
                
                let evenSequenceCount = 0;
                let oddSequenceCount = 0;
                let currentEvenSequence = 0;
                let currentOddSequence = 0;
                let evenSequenceStart = -1;
                let oddSequenceStart = -1;
                
                // Arrays para armazenar detalhes das sequências
                const evenSequences: { start: number, end: number, startNumber: number, endNumber: number, length: number }[] = [];
                const oddSequences: { start: number, end: number, startNumber: number, endNumber: number, length: number }[] = [];
                
                sortedRecords.forEach((record, index) => {
                  const props = getNumberProperties(record.number);
                  
                  if (props.parity === 'even') {
                    if (currentEvenSequence === 0) {
                      evenSequenceStart = index;
                    }
                    currentEvenSequence++;
                    
                    // Finalizar sequência ímpar se necessário
                    if (currentOddSequence >= 4) {
                      oddSequenceCount++;
                      oddSequences.push({
                        start: oddSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[oddSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentOddSequence
                      });
                    }
                    currentOddSequence = 0;
                    oddSequenceStart = -1;
                  } else if (props.parity === 'odd') {
                    if (currentOddSequence === 0) {
                      oddSequenceStart = index;
                    }
                    currentOddSequence++;
                    
                    // Finalizar sequência par se necessário
                    if (currentEvenSequence >= 4) {
                      evenSequenceCount++;
                      evenSequences.push({
                        start: evenSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[evenSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentEvenSequence
                      });
                    }
                    currentEvenSequence = 0;
                    evenSequenceStart = -1;
                  } else {
                    // Verde/null reseta ambas
                    if (currentEvenSequence >= 4) {
                      evenSequenceCount++;
                      evenSequences.push({
                        start: evenSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[evenSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentEvenSequence
                      });
                    }
                    if (currentOddSequence >= 4) {
                      oddSequenceCount++;
                      oddSequences.push({
                        start: oddSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[oddSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentOddSequence
                      });
                    }
                    currentEvenSequence = 0;
                    currentOddSequence = 0;
                    evenSequenceStart = -1;
                    oddSequenceStart = -1;
                  }
                });
                
                // Verificar últimas sequências
                if (currentEvenSequence >= 4) {
                  evenSequenceCount++;
                  evenSequences.push({
                    start: evenSequenceStart,
                    end: sortedRecords.length - 1,
                    startNumber: sortedRecords[evenSequenceStart].number,
                    endNumber: sortedRecords[sortedRecords.length - 1].number,
                    length: currentEvenSequence
                  });
                }
                if (currentOddSequence >= 4) {
                  oddSequenceCount++;
                  oddSequences.push({
                    start: oddSequenceStart,
                    end: sortedRecords.length - 1,
                    startNumber: sortedRecords[oddSequenceStart].number,
                    endNumber: sortedRecords[sortedRecords.length - 1].number,
                    length: currentOddSequence
                  });
                }
                
                return {
                  evenSequenceCount,
                  oddSequenceCount,
                  totalRounds: sortedRecords.length,
                  evenFrequency: evenSequenceCount > 0 ? Math.round(sortedRecords.length / evenSequenceCount) : 0,
                  oddFrequency: oddSequenceCount > 0 ? Math.round(sortedRecords.length / oddSequenceCount) : 0,
                  evenSequences,  // 🆕 Array com detalhes das sequências pares
                  oddSequences    // 🆕 Array com detalhes das sequências ímpares
                };
              };
              
              // Função para calcular sequências de números baixos (1-18) e altos (19-36)
              const calculateSequencesBaixoAlto = (dataRecords: any[]) => {
                const sortedRecords = dataRecords.sort((a, b) => 
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
                
                let lowSequenceCount = 0;
                let highSequenceCount = 0;
                let currentLowSequence = 0;
                let currentHighSequence = 0;
                let lowSequenceStart = -1;
                let highSequenceStart = -1;
                
                // Arrays para armazenar detalhes das sequências
                const lowSequences: { start: number, end: number, startNumber: number, endNumber: number, length: number }[] = [];
                const highSequences: { start: number, end: number, startNumber: number, endNumber: number, length: number }[] = [];
                
                sortedRecords.forEach((record, index) => {
                  const props = getNumberProperties(record.number);
                  
                  if (props.height === 'low') {
                    if (currentLowSequence === 0) {
                      lowSequenceStart = index;
                    }
                    currentLowSequence++;
                    
                    // Finalizar sequência alta se necessário
                    if (currentHighSequence >= 4) {
                      highSequenceCount++;
                      highSequences.push({
                        start: highSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[highSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentHighSequence
                      });
                    }
                    currentHighSequence = 0;
                    highSequenceStart = -1;
                  } else if (props.height === 'high') {
                    if (currentHighSequence === 0) {
                      highSequenceStart = index;
                    }
                    currentHighSequence++;
                    
                    // Finalizar sequência baixa se necessário
                    if (currentLowSequence >= 4) {
                      lowSequenceCount++;
                      lowSequences.push({
                        start: lowSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[lowSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentLowSequence
                      });
                    }
                    currentLowSequence = 0;
                    lowSequenceStart = -1;
                  } else {
                    // Verde/null reseta ambas
                    if (currentLowSequence >= 4) {
                      lowSequenceCount++;
                      lowSequences.push({
                        start: lowSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[lowSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentLowSequence
                      });
                    }
                    if (currentHighSequence >= 4) {
                      highSequenceCount++;
                      highSequences.push({
                        start: highSequenceStart,
                        end: index - 1,
                        startNumber: sortedRecords[highSequenceStart].number,
                        endNumber: sortedRecords[index - 1].number,
                        length: currentHighSequence
                      });
                    }
                    currentLowSequence = 0;
                    currentHighSequence = 0;
                    lowSequenceStart = -1;
                    highSequenceStart = -1;
                  }
                });
                
                // Verificar últimas sequências
                if (currentLowSequence >= 4) {
                  lowSequenceCount++;
                  lowSequences.push({
                    start: lowSequenceStart,
                    end: sortedRecords.length - 1,
                    startNumber: sortedRecords[lowSequenceStart].number,
                    endNumber: sortedRecords[sortedRecords.length - 1].number,
                    length: currentLowSequence
                  });
                }
                if (currentHighSequence >= 4) {
                  highSequenceCount++;
                  highSequences.push({
                    start: highSequenceStart,
                    end: sortedRecords.length - 1,
                    startNumber: sortedRecords[highSequenceStart].number,
                    endNumber: sortedRecords[sortedRecords.length - 1].number,
                    length: currentHighSequence
                  });
                }
                
                return {
                  lowSequenceCount,
                  highSequenceCount,
                  totalRounds: sortedRecords.length,
                  lowFrequency: lowSequenceCount > 0 ? Math.round(sortedRecords.length / lowSequenceCount) : 0,
                  highFrequency: highSequenceCount > 0 ? Math.round(sortedRecords.length / highSequenceCount) : 0,
                  lowSequences,   // 🆕 Array com detalhes das sequências baixas
                  highSequences   // 🆕 Array com detalhes das sequências altas
                };
              };
              
              // Calcular para ontem, anteôntem e hoje
              const yesterdayStats = calculateSequences(yesterdayRecords);
              const todayStats = calculateSequences(todayRecords);
              const dayBeforeYesterdayStats = calculateSequences(dayBeforeYesterdayRecords);
              

              
              // Calcular sequências par/ímpar para cada período
              const yesterdayParImparStats = calculateSequencesParImpar(yesterdayRecords);
              const todayParImparStats = calculateSequencesParImpar(todayRecords);
              const dayBeforeYesterdayParImparStats = calculateSequencesParImpar(dayBeforeYesterdayRecords);
              

              
              // Calcular sequências baixo/alto para cada período
              const yesterdayBaixoAltoStats = calculateSequencesBaixoAlto(yesterdayRecords);
              const todayBaixoAltoStats = calculateSequencesBaixoAlto(todayRecords);
              const dayBeforeYesterdayBaixoAltoStats = calculateSequencesBaixoAlto(dayBeforeYesterdayRecords);
              

              
              // Comparar com média ideal (1:35)
              const idealFrequency = 35;
              const redComparison = yesterdayStats.redFrequency > 0 ? yesterdayStats.redFrequency - idealFrequency : 0;
              const blackComparison = yesterdayStats.blackFrequency > 0 ? yesterdayStats.blackFrequency - idealFrequency : 0;
              
              return {
                currentTime: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
                hasData: true,
                redFrequency: yesterdayStats.redFrequency,
                blackFrequency: yesterdayStats.blackFrequency,
                redComparison,
                blackComparison,
                totalRounds: yesterdayStats.totalRounds,
                redSequenceCount: yesterdayStats.redSequenceCount,
                blackSequenceCount: yesterdayStats.blackSequenceCount,
                todayFrequency: {
                  red: todayStats.redFrequency,
                  black: todayStats.blackFrequency
                },
                todayRounds: todayStats.totalRounds,
                todaySequences: {
                  red: todayStats.redSequenceCount,
                  black: todayStats.blackSequenceCount
                },
                dayBeforeYesterdayFrequency: {
                  red: dayBeforeYesterdayStats.redFrequency,
                  black: dayBeforeYesterdayStats.blackFrequency
                },
                dayBeforeYesterdayRounds: dayBeforeYesterdayStats.totalRounds,
                dayBeforeYesterdaySequences: {
                  red: dayBeforeYesterdayStats.redSequenceCount,
                  black: dayBeforeYesterdayStats.blackSequenceCount
                },
                // Dados de par/ímpar
                evenFrequency: yesterdayParImparStats.evenFrequency,
                oddFrequency: yesterdayParImparStats.oddFrequency,
                evenSequenceCount: yesterdayParImparStats.evenSequenceCount,
                oddSequenceCount: yesterdayParImparStats.oddSequenceCount,
                todayParImparFrequency: {
                  even: todayParImparStats.evenFrequency,
                  odd: todayParImparStats.oddFrequency
                },
                todayParImparSequences: {
                  even: todayParImparStats.evenSequenceCount,
                  odd: todayParImparStats.oddSequenceCount
                },
                dayBeforeYesterdayParImparFrequency: {
                  even: dayBeforeYesterdayParImparStats.evenFrequency,
                  odd: dayBeforeYesterdayParImparStats.oddFrequency
                },
                dayBeforeYesterdayParImparSequences: {
                  even: dayBeforeYesterdayParImparStats.evenSequenceCount,
                  odd: dayBeforeYesterdayParImparStats.oddSequenceCount
                },
                // Dados de baixo/alto
                lowFrequency: yesterdayBaixoAltoStats.lowFrequency,
                highFrequency: yesterdayBaixoAltoStats.highFrequency,
                lowSequenceCount: yesterdayBaixoAltoStats.lowSequenceCount,
                highSequenceCount: yesterdayBaixoAltoStats.highSequenceCount,
                todayBaixoAltoFrequency: {
                  low: todayBaixoAltoStats.lowFrequency,
                  high: todayBaixoAltoStats.highFrequency
                },
                todayBaixoAltoSequences: {
                  low: todayBaixoAltoStats.lowSequenceCount,
                  high: todayBaixoAltoStats.highSequenceCount
                },
                dayBeforeYesterdayBaixoAltoFrequency: {
                  low: dayBeforeYesterdayBaixoAltoStats.lowFrequency,
                  high: dayBeforeYesterdayBaixoAltoStats.highFrequency
                },
                dayBeforeYesterdayBaixoAltoSequences: {
                  low: dayBeforeYesterdayBaixoAltoStats.lowSequenceCount,
                  high: dayBeforeYesterdayBaixoAltoStats.highSequenceCount
                },
                // 🆕 Rodadas desde a última sequência
                roundsSinceLastSequence: roundsSinceLastSequence
              };
            };
            
            const comparison = calculateYesterdayComparison();
            
            return (
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Target className="h-5 w-5 text-purple-400" />
                    INSIGHTS DE DADOS
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Comparação inteligente dos últimos 4 períodos (48h atrás, 24h atrás, 1h atual, rodadas desde última sequência)
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2 pb-4 px-4">
                  {!comparison.hasData ? (
                    <div className="text-center py-8">
                      <div className="text-gray-400 mb-2 font-mono">AGUARDANDO_DADOS</div>
                      <div className="text-xs text-gray-500 font-mono">
                        // Carregando dados históricos e calculando rodadas desde última sequência
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Frequência Vermelhos */}
                      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-mono text-red-400">FREQUENCIA_VERMELHOS</span>
                        </div>
                        
                        {/* Estatísticas em grid com 4 colunas */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">48H_ATRÁS</div>
                            <div className="text-sm font-bold text-gray-500 font-mono">
                              {comparison.dayBeforeYesterdaySequences.red}seq / {comparison.dayBeforeYesterdayRounds}r
                            </div>
                            <div className="text-xs font-mono text-gray-500 mt-1">
                              {comparison.dayBeforeYesterdayFrequency.red > 0 ? `1:${comparison.dayBeforeYesterdayFrequency.red}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">24H_ATRÁS</div>
                            <div className="text-sm font-bold text-white font-mono">
                              {comparison.redSequenceCount}seq / {comparison.totalRounds}r
                            </div>
                            <div className="text-xs font-mono text-white mt-1">
                              {comparison.redFrequency > 0 ? `1:${comparison.redFrequency}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-red-400 mb-1">1H_ATUAL</div>
                            <div className="text-sm font-bold text-red-400 font-mono">
                              {comparison.todaySequences?.red || 0}seq / {comparison.todayRounds}r
                            </div>
                            <div className="text-xs font-mono text-red-400 mt-1">
                              {comparison.todayFrequency?.red > 0 ? `1:${comparison.todayFrequency.red}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-orange-400 mb-1">RODADAS_SEM_SEQ</div>
                            <div className="text-sm font-bold text-orange-400 font-mono">
                              {comparison.roundsSinceLastSequence?.red || '--'}
                            </div>
                            <div className="text-xs font-mono text-orange-400 mt-1">
                              rodadas
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Frequência Pretos */}
                      <div className="bg-gray-500/5 border border-gray-500/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-mono text-gray-300">FREQUENCIA_PRETOS</span>
                        </div>
                        
                        {/* Estatísticas em grid com 4 colunas */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">48H_ATRÁS</div>
                            <div className="text-sm font-bold text-gray-500 font-mono">
                              {comparison.dayBeforeYesterdaySequences.black}seq / {comparison.dayBeforeYesterdayRounds}r
                            </div>
                            <div className="text-xs font-mono text-gray-500 mt-1">
                              {comparison.dayBeforeYesterdayFrequency.black > 0 ? `1:${comparison.dayBeforeYesterdayFrequency.black}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">24H_ATRÁS</div>
                            <div className="text-sm font-bold text-white font-mono">
                              {comparison.blackSequenceCount}seq / {comparison.totalRounds}r
                            </div>
                            <div className="text-xs font-mono text-white mt-1">
                              {comparison.blackFrequency > 0 ? `1:${comparison.blackFrequency}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-gray-500/10 border border-gray-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">1H_ATUAL</div>
                            <div className="text-sm font-bold text-gray-300 font-mono">
                              {comparison.todaySequences?.black || 0}seq / {comparison.todayRounds}r
                            </div>
                            <div className="text-xs font-mono text-gray-300 mt-1">
                              {comparison.todayFrequency?.black > 0 ? `1:${comparison.todayFrequency.black}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-orange-400 mb-1">RODADAS_SEM_SEQ</div>
                            <div className="text-sm font-bold text-orange-400 font-mono">
                              {comparison.roundsSinceLastSequence?.black || '--'}
                            </div>
                            <div className="text-xs font-mono text-orange-400 mt-1">
                              rodadas
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Frequência Pares */}
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-mono text-blue-400">FREQUENCIA_PARES</span>
                        </div>
                        
                        {/* Estatísticas em grid com 4 colunas */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">48H_ATRÁS</div>
                            <div className="text-sm font-bold text-gray-500 font-mono">
                              {comparison.dayBeforeYesterdayParImparSequences?.even || 0}seq / {comparison.dayBeforeYesterdayRounds}r
                            </div>
                            <div className="text-xs font-mono text-gray-500 mt-1">
                              {comparison.dayBeforeYesterdayParImparFrequency?.even > 0 ? `1:${comparison.dayBeforeYesterdayParImparFrequency.even}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">24H_ATRÁS</div>
                            <div className="text-sm font-bold text-white font-mono">
                              {comparison.evenSequenceCount}seq / {comparison.totalRounds}r
                            </div>
                            <div className="text-xs font-mono text-white mt-1">
                              {comparison.evenFrequency > 0 ? `1:${comparison.evenFrequency}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-blue-400 mb-1">1H_ATUAL</div>
                            <div className="text-sm font-bold text-blue-400 font-mono">
                              {comparison.todayParImparSequences?.even || 0}seq / {comparison.todayRounds}r
                            </div>
                            <div className="text-xs font-mono text-blue-400 mt-1">
                              {comparison.todayParImparFrequency?.even > 0 ? `1:${comparison.todayParImparFrequency.even}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-orange-400 mb-1">RODADAS_SEM_SEQ</div>
                            <div className="text-sm font-bold text-orange-400 font-mono">
                              {comparison.roundsSinceLastSequence?.even || '--'}
                            </div>
                            <div className="text-xs font-mono text-orange-400 mt-1">
                              rodadas
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Frequência Ímpares */}
                      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-mono text-yellow-400">FREQUENCIA_IMPARES</span>
                        </div>
                        
                        {/* Estatísticas em grid com 4 colunas */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">48H_ATRÁS</div>
                            <div className="text-sm font-bold text-gray-500 font-mono">
                              {comparison.dayBeforeYesterdayParImparSequences?.odd || 0}seq / {comparison.dayBeforeYesterdayRounds}r
                            </div>
                            <div className="text-xs font-mono text-gray-500 mt-1">
                              {comparison.dayBeforeYesterdayParImparFrequency?.odd > 0 ? `1:${comparison.dayBeforeYesterdayParImparFrequency.odd}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">24H_ATRÁS</div>
                            <div className="text-sm font-bold text-white font-mono">
                              {comparison.oddSequenceCount}seq / {comparison.totalRounds}r
                            </div>
                            <div className="text-xs font-mono text-white mt-1">
                              {comparison.oddFrequency > 0 ? `1:${comparison.oddFrequency}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-yellow-400 mb-1">1H_ATUAL</div>
                            <div className="text-sm font-bold text-yellow-400 font-mono">
                              {comparison.todayParImparSequences?.odd || 0}seq / {comparison.todayRounds}r
                            </div>
                            <div className="text-xs font-mono text-yellow-400 mt-1">
                              {comparison.todayParImparFrequency?.odd > 0 ? `1:${comparison.todayParImparFrequency.odd}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-orange-400 mb-1">RODADAS_SEM_SEQ</div>
                            <div className="text-sm font-bold text-orange-400 font-mono">
                              {comparison.roundsSinceLastSequence?.odd || '--'}
                            </div>
                            <div className="text-xs font-mono text-orange-400 mt-1">
                              rodadas
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Frequência Baixos (1-18) */}
                      <div className="bg-teal-500/5 border border-teal-500/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-mono text-teal-400">FREQUENCIA_BAIXOS</span>
                        </div>
                        
                        {/* Estatísticas em grid com 4 colunas */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">48H_ATRÁS</div>
                            <div className="text-sm font-bold text-gray-500 font-mono">
                              {comparison.dayBeforeYesterdayBaixoAltoSequences?.low || 0}seq / {comparison.dayBeforeYesterdayRounds}r
                            </div>
                            <div className="text-xs font-mono text-gray-500 mt-1">
                              {comparison.dayBeforeYesterdayBaixoAltoFrequency?.low > 0 ? `1:${comparison.dayBeforeYesterdayBaixoAltoFrequency.low}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">24H_ATRÁS</div>
                            <div className="text-sm font-bold text-white font-mono">
                              {comparison.lowSequenceCount}seq / {comparison.totalRounds}r
                            </div>
                            <div className="text-xs font-mono text-white mt-1">
                              {comparison.lowFrequency > 0 ? `1:${comparison.lowFrequency}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-teal-500/10 border border-teal-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-teal-400 mb-1">1H_ATUAL</div>
                            <div className="text-sm font-bold text-teal-400 font-mono">
                              {comparison.todayBaixoAltoSequences?.low || 0}seq / {comparison.todayRounds}r
                            </div>
                            <div className="text-xs font-mono text-teal-400 mt-1">
                              {comparison.todayBaixoAltoFrequency?.low > 0 ? `1:${comparison.todayBaixoAltoFrequency.low}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-orange-400 mb-1">RODADAS_SEM_SEQ</div>
                            <div className="text-sm font-bold text-orange-400 font-mono">
                              {comparison.roundsSinceLastSequence?.low || '--'}
                            </div>
                            <div className="text-xs font-mono text-orange-400 mt-1">
                              rodadas
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Frequência Altos (19-36) */}
                      <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-mono text-orange-400">FREQUENCIA_ALTOS</span>
                        </div>
                        
                        {/* Estatísticas em grid com 4 colunas */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">48H_ATRÁS</div>
                            <div className="text-sm font-bold text-gray-500 font-mono">
                              {comparison.dayBeforeYesterdayBaixoAltoSequences?.high || 0}seq / {comparison.dayBeforeYesterdayRounds}r
                            </div>
                            <div className="text-xs font-mono text-gray-500 mt-1">
                              {comparison.dayBeforeYesterdayBaixoAltoFrequency?.high > 0 ? `1:${comparison.dayBeforeYesterdayBaixoAltoFrequency.high}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-gray-800/50 rounded p-3 text-center">
                            <div className="text-xs font-mono text-gray-400 mb-1">24H_ATRÁS</div>
                            <div className="text-sm font-bold text-white font-mono">
                              {comparison.highSequenceCount}seq / {comparison.totalRounds}r
                            </div>
                            <div className="text-xs font-mono text-white mt-1">
                              {comparison.highFrequency > 0 ? `1:${comparison.highFrequency}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-orange-400 mb-1">1H_ATUAL</div>
                            <div className="text-sm font-bold text-orange-400 font-mono">
                              {comparison.todayBaixoAltoSequences?.high || 0}seq / {comparison.todayRounds}r
                            </div>
                            <div className="text-xs font-mono text-orange-400 mt-1">
                              {comparison.todayBaixoAltoFrequency?.high > 0 ? `1:${comparison.todayBaixoAltoFrequency.high}` : '--'}
                            </div>
                          </div>
                          
                          <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3 text-center">
                            <div className="text-xs font-mono text-orange-400 mb-1">RODADAS_SEM_SEQ</div>
                            <div className="text-sm font-bold text-orange-400 font-mono">
                              {comparison.roundsSinceLastSequence?.high || '--'}
                            </div>
                            <div className="text-xs font-mono text-orange-400 mt-1">
                              rodadas
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
          
          {/* 🆕 Card de Demonstração - Últimas Sequências Encontradas */}
          <Card className="bg-indigo-900/20 border-indigo-500/30">
            <CardHeader>
              <CardTitle className="text-indigo-400 text-sm">🔍 DEMO: Últimas Sequências Encontradas</CardTitle>
              <CardDescription className="text-gray-400">
                Demonstrando que agora sabemos o início e fim de cada sequência 4+
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Exemplo de Sequências Vermelhas */}
                <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                  <div className="text-xs font-mono text-red-400 mb-2">VERMELHAS (4+ consecutivas)</div>
                  <div className="text-xs font-mono text-red-300 mb-1">
                    Exemplo: 32 → 16 (5 rodadas)
                  </div>
                  <div className="text-xs font-mono text-red-300 mb-1">
                    Exemplo: 7 → 1 (4 rodadas)
                  </div>
                  <div className="text-xs font-mono text-gray-500">
                    * Dados reais no console do navegador
                  </div>
                </div>
                
                {/* Exemplo de Sequências Pretas */}
                <div className="bg-gray-500/10 border border-gray-500/30 rounded p-3">
                  <div className="text-xs font-mono text-gray-400 mb-2">PRETAS (4+ consecutivas)</div>
                  <div className="text-xs font-mono text-gray-300 mb-1">
                    Exemplo: 15 → 33 (6 rodadas)
                  </div>
                  <div className="text-xs font-mono text-gray-300 mb-1">
                    Exemplo: 11 → 26 (4 rodadas)
                  </div>
                  <div className="text-xs font-mono text-gray-500">
                    * Dados reais no console do navegador
                  </div>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-gray-800/50 rounded">
                <div className="text-xs font-mono text-gray-400 mb-1">
                  Agora cada sequência tem:
                </div>
                <div className="text-xs font-mono text-gray-300">
                  • start: posição inicial | end: posição final<br/>
                  • startNumber: número inicial | endNumber: número final<br/>
                  • length: quantidade de rodadas consecutivas
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filtro de Quantidade */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-white">Histórico Visual</h2>
              
              {recentRecords.length > 0 && (
                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                  {recentRecords.length} de {totalRecordsAvailable} registros
                </Badge>
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

              {/* Separador visual */}
              <div className="h-4 w-px bg-gray-600"></div>

              {/* Botão de Download */}
              <Button
                size="sm"
                variant="outline"
                onClick={downloadJSON}
                disabled={loading || recentRecords.length === 0}
                className="text-green-400 hover:bg-green-400/10 border-green-500/30"
                title={`Baixar ${recentRecords.length} registros em JSON`}
              >
                <Download className="h-4 w-4 mr-2" />
                JSON
              </Button>
            </div>
          </div>

          {/* Grid de Números */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardDescription className="text-gray-400">
                Últimos resultados (mais recente → mais antigo) - Exibindo {recentRecords.length} de {totalRecordsAvailable} registros
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentRecords.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Nenhum registro encontrado</p>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  <div className="grid grid-cols-10 gap-3 mb-4">
                    {recentRecords.slice(0, 50).map((record, index) => (
                      <div key={`${record.id}-${record.timestamp}`} className="relative">
                        <NumberSquare record={record} isNewest={index === 0} />
                        {/* Indicador para o resultado mais recente */}
                        {index === 0 && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse ring-2 ring-blue-400/50 flex items-center justify-center">
                            <span className="text-xs text-white font-bold">•</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Mostrar mais resultados se houver */}
                  {recentRecords.length > 50 && (
                    <div className="text-center mt-4 text-gray-400 text-sm">
                      ... e mais {recentRecords.length - 50} resultados
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}