'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { RefreshCw, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface HistoryRecord {
  id: number
  game_id: string
  number: number
  color: string
  game_result: string
  timestamp: string
  created_at: string
}

interface GameStatistics {
  redCount: number
  blackCount: number
  greenCount: number
  total: number
}

interface GameStatisticsCardProps {
  refreshInterval?: number
  autoRefresh?: boolean
  onStatusChange?: (status: string) => void  // 🛡️ NOVO: Callback para notificar mudança de status
}

export default function GameStatisticsCard({ 
  refreshInterval = 30000, 
  autoRefresh = true,
  onStatusChange  // 🛡️ NOVO: Receber callback de mudança de status
}: GameStatisticsCardProps) {
  const [statistics30min, setStatistics30min] = useState<GameStatistics>({
    redCount: 0,
    blackCount: 0,
    greenCount: 0,
    total: 0
  })
  
  const [statistics1hour, setStatistics1hour] = useState<GameStatistics>({
    redCount: 0,
    blackCount: 0,
    greenCount: 0,
    total: 0
  })
  
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  // Função para buscar dados do Supabase
  const loadGameStatistics = useCallback(async () => {
    try {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

      // Debug: Log dos timestamps
      console.log('Consultando dados de:', {
        agora: now.toISOString(),
        '30minAtrás': thirtyMinutesAgo.toISOString()
      })

      // Buscar dados dos últimos 30 minutos (tentativa com timestamp)
      let { data: data30min, error: error30min } = await supabase
        .from('history-megaroulettebr')
        .select('*')
        .gte('timestamp', thirtyMinutesAgo.toISOString())
        .order('timestamp', { ascending: false })

      // Se der erro, tentar com created_at
      if (error30min) {
        console.log('Erro com timestamp, tentando created_at:', error30min)
        const { data: dataCreatedAt, error: errorCreatedAt } = await supabase
          .from('history-megaroulettebr')
          .select('*')
          .gte('created_at', thirtyMinutesAgo.toISOString())
          .order('created_at', { ascending: false })
        
        data30min = dataCreatedAt
        error30min = errorCreatedAt
      }

      if (error30min) {
        console.error('Erro ao carregar dados de 30 minutos:', error30min)
        return
      }

      // Debug: Log dos dados brutos
      console.log('Dados brutos 30min:', {
        total: data30min?.length || 0,
        primeiros5: data30min?.slice(0, 5)
      })

      // Se não há dados nos últimos 30 min, buscar últimos 100 registros para teste
      if (!data30min || data30min.length === 0) {
        console.log('Sem dados recentes, buscando últimos 100 registros...')
        const { data: dataFallback, error: errorFallback } = await supabase
          .from('history-megaroulettebr')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(100)
        
        if (!errorFallback && dataFallback && dataFallback.length > 0) {
          data30min = dataFallback.slice(0, 30) // Usar últimos 30 como se fossem dos últimos 30min
          console.log('Usando dados fallback:', data30min.length, 'registros')
        }
      }

      // Buscar dados da última 1 hora
      const { data: data1hour, error: error1hour } = await supabase
        .from('history-megaroulettebr')
        .select('*')
        .gte('timestamp', oneHourAgo.toISOString())
        .order('timestamp', { ascending: false })

      if (error1hour) {
        console.error('Erro ao carregar dados de 1 hora:', error1hour)
        return
      }

      // Calcular estatísticas para 30 minutos
      const stats30min = calculateStatistics(data30min || [])
      setStatistics30min(stats30min)
      
      // Debug: Log dos dados dos últimos 30 minutos
      console.log('Dados últimos 30min:', {
        total: data30min?.length || 0,
        vermelho: stats30min.redCount,
        porcentagem: stats30min.total > 0 ? ((stats30min.redCount / stats30min.total) * 100).toFixed(1) + '%' : '0%',
        status: getStatusFromRedPercentage(stats30min.redCount, stats30min.total).status
      })

      // Calcular estatísticas para 1 hora
      const stats1hour = calculateStatistics(data1hour || [])
      setStatistics1hour(stats1hour)

      setLastUpdate(new Date())
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Função para calcular estatísticas
  const calculateStatistics = (records: HistoryRecord[]): GameStatistics => {
    const redCount = records.filter(r => r.color === 'red').length
    const blackCount = records.filter(r => r.color === 'black').length
    const greenCount = records.filter(r => r.color === 'green').length
    const total = records.length

    return { redCount, blackCount, greenCount, total }
  }

  // Função para formatar porcentagem
  const formatPercentage = (count: number, total: number): string => {
    if (total === 0) return '0.0%'
    return ((count / total) * 100).toFixed(1) + '%'
  }

  // Função para calcular status baseado na porcentagem do vermelho
  const getStatusFromRedPercentage = (redCount: number, total: number): { 
    status: string, 
    color: string, 
    bgColor: string 
  } => {
    if (total === 0) return { status: 'Sem Dados', color: 'text-gray-400', bgColor: 'bg-gray-500/10' }
    
    const redPercentage = (redCount / total) * 100
    
    if (redPercentage < 35) {
      return { status: 'Excelente', color: 'text-green-400', bgColor: 'bg-green-500/10' }
    } else if (redPercentage >= 35 && redPercentage < 46) {
      return { status: 'Bom', color: 'text-blue-400', bgColor: 'bg-blue-500/10' }
    } else if (redPercentage >= 46 && redPercentage <= 50) {
      return { status: 'Regular', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' }
    } else if (redPercentage > 50 && redPercentage <= 60) {
      return { status: 'Ruim', color: 'text-orange-400', bgColor: 'bg-orange-500/10' }
    } else {
      return { status: 'Crítico', color: 'text-red-400', bgColor: 'bg-red-500/10' }
    }
  }

  // Função para alternar expansão de cards
  const toggleCardExpansion = (cardId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cardId)) {
        newSet.delete(cardId)
      } else {
        newSet.add(cardId)
      }
      return newSet
    })
  }

  // Garantir que apenas o status ativo esteja expandido
  useEffect(() => {
    const activeStatus = getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status
    setExpandedCards(new Set([activeStatus]))
  }, [statistics30min])

  // Carregamento inicial
  useEffect(() => {
    loadGameStatistics()
  }, [loadGameStatistics])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadGameStatistics()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, loadGameStatistics])

  // 🛡️ NOVO: Notificar mudança de status para o componente pai
  useEffect(() => {
    if (onStatusChange) {
      const currentStatus = getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status;
      onStatusChange(currentStatus);
    }
  }, [statistics30min, onStatusChange])

  return (
    <Card className="border-cyan-500/30 backdrop-blur-sm">
      <CardContent className="space-y-4">
        {/* Indicador de carregamento */}
        {loading && (
          <div className="flex items-center justify-end gap-1 text-xs text-gray-400">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Carregando...
          </div>
        )}


        {/* Seção de Status */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
            <span className="text-sm font-mono text-indigo-400">STATUS_ATUAL</span>
          </div>
          
          {/* Card do Status */}
          <div className={`p-3 border rounded-lg text-center ${getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).bgColor} border-gray-600/30`}>
            <div className={`text-lg font-bold font-mono ${getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).color}`}>
              CENÁRIO {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Seção de Recomendações */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span className="text-sm font-mono text-blue-400">RECOMENDAÇÕES</span>
          </div>
          
          <div className="space-y-2">
            {/* Excelente */}
            <div className={`border rounded-lg transition-all duration-200 ${
              getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Excelente' 
                ? 'bg-green-500/20 border-green-500/50 ring-2 ring-green-500/30' 
                : 'bg-gray-800/20 border-gray-600/30'
            }`}>
              <div 
                className="p-3 cursor-pointer flex items-center justify-between"
                onClick={() => {
                  if (getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status !== 'Excelente') {
                    toggleCardExpansion('Excelente')
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono font-bold ${
                    getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Excelente' 
                      ? 'text-green-400' 
                      : 'text-green-300'
                  }`}>
                    EXCELENTE
                  </span>
                  {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Excelente' && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded font-mono">ATIVO</span>
                  )}
                </div>
                {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status !== 'Excelente' && (
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                    expandedCards.has('Excelente') ? 'rotate-180' : ''
                  }`} />
                )}
              </div>
              {(expandedCards.has('Excelente') || getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Excelente') && (
                <div className="px-3 pb-3">
                  <p className="text-xs text-gray-300 leading-relaxed">
                    O momento está ideal! Seu robô tem alta probabilidade de lucro. Considere aumentar a exposição ou manter sua estratégia atual.
                  </p>
                </div>
              )}
            </div>

            {/* Bom */}
            <div className={`border rounded-lg transition-all duration-200 ${
              getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Bom' 
                ? 'bg-blue-500/20 border-blue-500/50 ring-2 ring-blue-500/30' 
                : 'bg-gray-800/20 border-gray-600/30'
            }`}>
              <div 
                className="p-3 cursor-pointer flex items-center justify-between"
                onClick={() => {
                  if (getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status !== 'Bom') {
                    toggleCardExpansion('Bom')
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono font-bold ${
                    getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Bom' 
                      ? 'text-blue-400' 
                      : 'text-blue-300'
                  }`}>
                    BOM
                  </span>
                  {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Bom' && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded font-mono">ATIVO</span>
                  )}
                </div>
                {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status !== 'Bom' && (
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                    expandedCards.has('Bom') ? 'rotate-180' : ''
                  }`} />
                )}
              </div>
              {(expandedCards.has('Bom') || getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Bom') && (
                <div className="px-3 pb-3">
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Boas condições para operar. O robô está em um cenário favorável, embora com um pouco menos de confiança que o status Excelente.
                  </p>
                </div>
              )}
            </div>

            {/* Regular */}
            <div className={`border rounded-lg transition-all duration-200 ${
              getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Regular' 
                ? 'bg-yellow-500/20 border-yellow-500/50 ring-2 ring-yellow-500/30' 
                : 'bg-gray-800/20 border-gray-600/30'
            }`}>
              <div 
                className="p-3 cursor-pointer flex items-center justify-between"
                onClick={() => {
                  if (getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status !== 'Regular') {
                    toggleCardExpansion('Regular')
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono font-bold ${
                    getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Regular' 
                      ? 'text-yellow-400' 
                      : 'text-yellow-300'
                  }`}>
                    REGULAR
                  </span>
                  {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Regular' && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded font-mono">ATIVO</span>
                  )}
                </div>
                {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status !== 'Regular' && (
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                    expandedCards.has('Regular') ? 'rotate-180' : ''
                  }`} />
                )}
              </div>
              {(expandedCards.has('Regular') || getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Regular') && (
                <div className="px-3 pb-3">
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Momento neutro. O desempenho pode variar — siga com cautela ou aguarde sinais mais claros antes de tomar decisões maiores.
                  </p>
                </div>
              )}
            </div>

            {/* Ruim */}
            <div className={`border rounded-lg transition-all duration-200 ${
              getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Ruim' 
                ? 'bg-orange-500/20 border-orange-500/50 ring-2 ring-orange-500/30' 
                : 'bg-gray-800/20 border-gray-600/30'
            }`}>
              <div 
                className="p-3 cursor-pointer flex items-center justify-between"
                onClick={() => {
                  if (getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status !== 'Ruim') {
                    toggleCardExpansion('Ruim')
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono font-bold ${
                    getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Ruim' 
                      ? 'text-orange-400' 
                      : 'text-orange-300'
                  }`}>
                    RUIM
                  </span>
                  {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Ruim' && (
                    <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded font-mono">ATIVO</span>
                  )}
                </div>
                {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status !== 'Ruim' && (
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                    expandedCards.has('Ruim') ? 'rotate-180' : ''
                  }`} />
                )}
              </div>
              {(expandedCards.has('Ruim') || getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Ruim') && (
                <div className="px-3 pb-3">
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Atenção! O cenário atual é desfavorável. Considere reduzir sua exposição ou evitar novas operações por enquanto.
                  </p>
                </div>
              )}
            </div>

            {/* Crítico */}
            <div className={`border rounded-lg transition-all duration-200 ${
              getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Crítico' 
                ? 'bg-red-500/20 border-red-500/50 ring-2 ring-red-500/30' 
                : 'bg-gray-800/20 border-gray-600/30'
            }`}>
              <div 
                className="p-3 cursor-pointer flex items-center justify-between"
                onClick={() => {
                  if (getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status !== 'Crítico') {
                    toggleCardExpansion('Crítico')
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono font-bold ${
                    getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Crítico' 
                      ? 'text-red-400' 
                      : 'text-red-300'
                  }`}>
                    CRÍTICO
                  </span>
                  {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Crítico' && (
                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded font-mono">ATIVO</span>
                  )}
                </div>
                {getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status !== 'Crítico' && (
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                    expandedCards.has('Crítico') ? 'rotate-180' : ''
                  }`} />
                )}
              </div>
              {(expandedCards.has('Crítico') || getStatusFromRedPercentage(statistics30min.redCount, statistics30min.total).status === 'Crítico') && (
                <div className="px-3 pb-3">
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Alto risco de perdas. Recomenda-se pausar o robô ou revisar sua estratégia. Evite operar até as condições melhorarem.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Informações adicionais */}
        <div className="p-3 bg-gray-800/30 border border-gray-600/30 rounded-lg">
          <div className="text-xs font-mono text-gray-400">
            <p>Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 