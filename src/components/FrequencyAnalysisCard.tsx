import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { supabase } from '@/lib/supabase'

/**
 * FrequencyAnalysisCard - Componente reutilizável para análise de frequência de apostas
 * 
 * Este componente simula a estratégia de padrão de repetição do Mega Roulette,
 * mostrando a distribuição de vitórias/derrotas por nível de martingale (A1-A10).
 * Inclui tabela de informações detalhadas na parte superior e gráfico visual de barras.
 * 
 * NOVO: Suporte a auto-refresh automático dos dados do Supabase
 * 
 * @example
 * ```tsx
 * import FrequencyAnalysisCard from '@/components/FrequencyAnalysisCard'
 * 
 * // Uso básico (dados via prop - modo atual)
 * <FrequencyAnalysisCard records={historyRecords} />
 * 
 * // Com auto-refresh automático (busca dados do Supabase)
 * <FrequencyAnalysisCard 
 *   autoRefresh={true}
 *   refreshInterval={30000}
 *   title="ANÁLISE_TEMPO_REAL"
 * />
 * 
 * // Híbrido: dados iniciais + auto-refresh
 * <FrequencyAnalysisCard 
 *   records={historyRecords}
 *   autoRefresh={true}
 *   refreshInterval={30000}
 *   showLegend={false}
 * />
 * ```
 * 
 * @param records - Array de registros do histórico do jogo (opcional se autoRefresh=true)
 * @param title - Título do card (padrão: "FREQUENCIA_APOSTAS")
 * @param className - Classes CSS adicionais
 * @param defaultTimeFilter - Filtro de tempo inicial (padrão: '6h')
 * @param autoRefresh - Se deve buscar dados automaticamente do Supabase (padrão: false)
 * @param refreshInterval - Intervalo de atualização em ms (padrão: 30000 = 30s)
 * @param recordLimit - Limite de registros a buscar (padrão: 5000)
 * @param showLegend - Se deve exibir a legenda explicativa (padrão: true)
 */

interface HistoryRecord {
  id: number
  game_id: string
  number: number
  color: string
  game_result: string
  timestamp: string
  created_at: string
}

interface FrequencyAnalysisCardProps {
  records?: HistoryRecord[]
  title?: string
  className?: string
  defaultTimeFilter?: string
  autoRefresh?: boolean
  refreshInterval?: number
  recordLimit?: number
  showLegend?: boolean
}

export const FrequencyAnalysisCard: React.FC<FrequencyAnalysisCardProps> = ({ 
  records: propRecords,
  title = "FREQUENCIA_APOSTAS",
  className = "",
  defaultTimeFilter = '6h',
  autoRefresh = false,
  refreshInterval = 30000, // 30 segundos por padrão
  recordLimit = 1000000, // ✅ Limite alto para garantir análise completa
  showLegend = true
}) => {
  const [timeFilter, setTimeFilter] = useState(defaultTimeFilter)
  
  // Estados para auto-refresh
  const [internalRecords, setInternalRecords] = useState<HistoryRecord[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  // Determinar quais dados usar: props ou internos
  const records = propRecords || internalRecords
  
  // ✅ Log limpo - só quando há problema
  useEffect(() => {
    if (records.length === 1000 && timeFilter === 'total') {
      console.log(`🚨 PROBLEMA: Esperado 2527+, recebido apenas 1000 registros`)
    }
  }, [records, timeFilter])

  // 🔄 Função para buscar TODOS os registros usando paginação
  const fetchAllRecords = useCallback(async (timeFilter: string): Promise<HistoryRecord[]> => {
    console.log(`🚀 Iniciando busca completa para filtro: ${timeFilter}`)
    
    let allRecords: HistoryRecord[] = []
    let offset = 0
    const limit = 1000
    let hasMore = true
    
    try {
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
      
      console.log(`✅ Busca completa finalizada: ${allRecords.length} registros para filtro ${timeFilter}`)
      
      // 🔧 Filtrar duplicatas baseadas no ID único
      const uniqueRecords = allRecords.filter((record, index, arr) => 
        arr.findIndex(r => r.id === record.id) === index
      )
      
      if (uniqueRecords.length !== allRecords.length) {
        console.log(`⚠️ FrequencyAnalysis: Removidas ${allRecords.length - uniqueRecords.length} duplicatas`)
      }
      
      // 🔍 Debug extra: mostrar primeiro e último registro filtrado
      if (uniqueRecords.length > 0) {
        const primeiro = uniqueRecords[0]
        const ultimo = uniqueRecords[uniqueRecords.length - 1]
        console.log(`   📅 Período: ${ultimo.timestamp} até ${primeiro.timestamp}`)
      }
      
      return uniqueRecords
      
    } catch (error) {
      console.error('❌ Erro na busca paginada:', error)
      throw error
    }
  }, [])

  // 📊 Função de busca principal (substituindo a anterior)
  const fetchRecords = useCallback(async () => {
    if (!autoRefresh) return

    setIsRefreshing(true)
    setRefreshError(null)

    try {
      const allRecords = await fetchAllRecords(timeFilter)
      setInternalRecords(allRecords)
      setLastUpdate(new Date())
      console.log(`🎯 Total obtido: ${allRecords.length} registros`)
      
    } catch (error) {
      console.error('❌ Erro ao buscar registros:', error)
      setRefreshError('Erro ao carregar dados')
    } finally {
      setIsRefreshing(false)
    }
  }, [timeFilter, autoRefresh, fetchAllRecords])

  // ✅ useEffect unificado para evitar execuções duplicadas
  useEffect(() => {
    if (!autoRefresh) return

    // Executar imediatamente na primeira vez ou quando filtro mudar
    const timeoutId = setTimeout(() => fetchRecords(), 100)
    
    // Configurar auto-refresh periódico
    let intervalId: NodeJS.Timeout | null = null
    if (refreshInterval > 0) {
      intervalId = setInterval(() => fetchRecords(), refreshInterval)
    }

    // Cleanup para evitar vazamentos de memória
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [autoRefresh, timeFilter, refreshInterval, fetchRecords])

  // Função para refresh manual
  const handleManualRefresh = () => {
    if (autoRefresh) {
      fetchRecords()
    }
  }

  // Os registros já vêm filtrados da query Supabase, então não precisamos filtrar novamente
  const getFilteredRecords = useMemo(() => {
    return records;
  }, [records]);

  // Simulação completa
  const localSimulation = useMemo(() => {
    const filteredRecords = getFilteredRecords;
    
    if (filteredRecords.length < 7) {
      return {
        martingaleLosses: Array(10).fill(0),
        martingaleWins: Array(10).fill(0),
        totalOperations: 0,
        totalResults: filteredRecords.length,
        simulationValid: false,
        operatedRecords: [],
        allOperations: []
      };
    }

    const sortedRecords = [...filteredRecords].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const martingaleLosses = Array(10).fill(0);
    const martingaleWins = Array(10).fill(0);
    const operatedRecords: any[] = [];
    const allOperations: any[] = [];
    let totalOperations = 0;
    let operationId = 0;

    const getColor = (record: HistoryRecord): string | null => {
      if (record.number === 0) return null;
      return record.color === 'red' ? 'R' : 'B';
    };

    const getColorFromResult = (record: HistoryRecord): string => {
      if (record.number === 0) return 'green';
      return record.color === 'red' ? 'R' : 'B';
    };

    const invertColor = (color: string): string => {
      if (color === 'R') return 'B';
      if (color === 'B') return 'R';
      return color;
    };

    const isValidPattern = (results: string[]): boolean => {
      if (results.length !== 7) return false;
      const firstColor = results[0];
      const allSameColor = results.every(color => color === firstColor);
      if (allSameColor) return false;
      return results[5] === results[0] && results[6] === results[1];
    };

    for (let startIndex = 6; startIndex < sortedRecords.length; startIndex++) {
      const recentResults: string[] = [];
      const patternRecords: HistoryRecord[] = [];
      
      let searchIndex = startIndex;
      while (searchIndex >= 0 && recentResults.length < 7) {
        const record = sortedRecords[searchIndex];
        if (record) {
          const color = getColor(record);
          if (color) {
            recentResults.unshift(color);
            patternRecords.unshift(record);
          }
        }
        searchIndex--;
      }

      if (recentResults.length === 7 && isValidPattern(recentResults)) {
        const historicPattern = recentResults.slice(0, 5);
        const invertedPattern = historicPattern.map(invertColor);

        const currentOperation = {
          operationId: operationId++,
          startIndex,
          pattern: recentResults,
          historicPattern,
          invertedPattern,
          patternRecords: [...patternRecords],
          bets: [] as any[],
          status: 'active' as 'active' | 'won' | 'lost'
        };

        patternRecords.forEach((record, index) => {
          operatedRecords.push({
            recordId: record.id,
            gameId: record.game_id,
            operationId: currentOperation.operationId,
            type: 'pattern',
            patternPosition: index + 1,
            color: recentResults[index],
            isPatternMatch: index === 0 || index === 1 || index === 5 || index === 6,
            basePattern: invertedPattern.join(''),
            originalPattern: historicPattern.join('')
          });
        });

        let currentLevel = 2;
        let martingaleLevel = 0;
        
        for (let betIndex = startIndex + 1; betIndex < sortedRecords.length; betIndex++) {
          const betRecord = sortedRecords[betIndex];
          if (!betRecord) continue;

          const patternIndex = currentLevel % 5;
          const expectedColor = invertedPattern[patternIndex];
          const isZero = betRecord.number === 0;
          const actualColor = getColorFromResult(betRecord);
          const isWin = !isZero && actualColor === expectedColor;

          const betInfo = {
            recordId: betRecord.id,
            gameId: betRecord.game_id,
            operationId: currentOperation.operationId,
            martingaleLevel: martingaleLevel + 1,
            expectedColor,
            actualColor,
            isWin,
            isZero,
            patternPosition: (currentLevel % 5) + 1,
            basePattern: invertedPattern.join(''),
            type: 'bet'
          };

          operatedRecords.push(betInfo);
          currentOperation.bets.push(betInfo);

          if (isWin) {
            for (let i = 0; i < martingaleLevel; i++) {
              martingaleLosses[i]++;
            }
            martingaleWins[martingaleLevel]++;
            totalOperations++;
            currentOperation.status = 'won';
            break;
          } else {
            if (isZero) {
              martingaleLevel++;
            } else {
              currentLevel++;
              martingaleLevel++;
            }
            
            if (martingaleLevel >= 10) {
              for (let i = 0; i < 10; i++) {
                martingaleLosses[i]++;
              }
              totalOperations++;
              currentOperation.status = 'lost';
              break;
            }
          }
        }

        allOperations.push(currentOperation);
      }
    }

    const result = {
      martingaleLosses,
      martingaleWins,
      totalOperations,
      totalResults: filteredRecords.length,
      simulationValid: true,
      operatedRecords,
      allOperations
    };

    // 🐛 Debug: Log resultado final da simulação
    // 📊 Log da simulação para debug de filtros
    console.log(`📊 Simulação ${timeFilter}: ${totalOperations} operações de ${filteredRecords.length} registros`)

    return result;
  }, [getFilteredRecords]);

  // Matriz de valores para cálculo de probabilidade
  const probabilityMatrix = [
    0,    // A1 = fora (não usado)
    16,   // A2 = 16
    32,   // A3 = 32
    64,   // A4 = 64
    128,  // A5 = 128
    256,  // A6 = 256
    512,  // A7 = 512
    1024, // A8 = 1024
    2048, // A9 = 2048
    4096  // A10 = 4096
  ];

  // Calcular probabilidades para cada nível baseado no total de operações
  const calculateProbability = (totalOperations: number, levelIndex: number): number => {
    if (levelIndex === 0) return 0; // A1 = fora
    const matrixValue = probabilityMatrix[levelIndex];
    if (matrixValue === 0 || totalOperations === 0) return 0;
    
    // Probabilidade de uma operação chegar até esse nível
    const probability = (totalOperations / matrixValue);
    return probability; // Pode ser maior que 100% se houver muitas operações
  };

  // Calcular quantas operações atrás foi a última aposta em cada nível
  const calculateLastBetOperationsAgo = useMemo(() => {
    const lastBetOperationsAgo = Array(10).fill(-1); // -1 = nunca houve aposta neste nível
    
    // Iterar pelas operações de trás para frente (mais recente para mais antiga)
    for (let opIndex = localSimulation.allOperations.length - 1; opIndex >= 0; opIndex--) {
      const operation = localSimulation.allOperations[opIndex];
      
      // Verificar todas as apostas desta operação
      for (const bet of operation.bets) {
        const levelIndex = bet.martingaleLevel - 1; // Converter para índice 0-based
        
        // Se ainda não encontramos a última aposta para este nível
        if (levelIndex >= 0 && levelIndex < 10 && lastBetOperationsAgo[levelIndex] === -1) {
          // Calcular quantas operações atrás foi
          const operationsAgo = localSimulation.allOperations.length - 1 - opIndex;
          lastBetOperationsAgo[levelIndex] = operationsAgo;
        }
      }
    }
    
    return lastBetOperationsAgo;
  }, [localSimulation.allOperations]);



  // Encontrar o maior valor individual entre vitórias e derrotas para normalização
  const maxValue = Math.max(
    ...localSimulation.martingaleLosses, // Maior valor de derrotas
    ...(localSimulation.martingaleWins || []), // Maior valor de vitórias
    1 // Valor mínimo para evitar divisão por zero
  );

  // ✅ Proporção otimizada: 100% proporcional com mínimo de 2px para visibilidade

  if (!localSimulation.simulationValid) {
    return (
      <Card className={`border-purple-500/30 backdrop-blur-sm ${className}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
              <BarChart3 className="h-5 w-5" />
              {title}
              {autoRefresh && (
                <div className="flex items-center gap-1 ml-2">
                  {isRefreshing && (
                    <RefreshCw className="h-3 w-3 text-blue-400 animate-spin" />
                  )}
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Auto-refresh ativo" />
                </div>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {autoRefresh && (
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="p-1.5 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/50 rounded text-purple-400 hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Atualizar manualmente"
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              )}
              <select 
                value={timeFilter} 
                onChange={(e) => setTimeFilter(e.target.value)}
                className="bg-gray-800/50 border border-gray-600/50 text-purple-400 text-xs font-mono rounded px-3 py-1.5 min-w-0 focus:outline-none focus:border-purple-500/50"
              >
                <option value="30m">30m</option>
                <option value="1h">1h</option>
                <option value="2h">2h</option>
                <option value="6h">6h</option>
                <option value="12h">12h</option>
                <option value="1d">1d</option>
                <option value="1s">1s</option>
                <option value="1m">1m</option>
                <option value="total">Total</option>
              </select>
            </div>
          </div>
          <CardDescription className="text-gray-400 font-mono text-xs flex items-center justify-between">
            <span>{`// ${getFilteredRecords.length} rodadas analisadas`}</span>
            {autoRefresh && lastUpdate && (
              <span className="text-gray-400 text-xs">
                Última atualização: {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-36 sm:h-40 md:h-44 flex items-center justify-center border border-gray-700/50 rounded-lg">
            <div className="text-center">
              <span className="text-xs font-mono text-gray-500 block mb-2">
                Mínimo 7 registros necessários para simulação
              </span>
              {autoRefresh && isRefreshing && (
                <span className="text-xs font-mono text-blue-400">
                  🔄 Buscando mais dados...
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-purple-500/30 backdrop-blur-sm ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
            <BarChart3 className="h-5 w-5" />
            {title}
            {autoRefresh && (
              <div className="flex items-center gap-1 ml-2">
                {isRefreshing && (
                  <RefreshCw className="h-3 w-3 text-blue-400 animate-spin" />
                )}
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Auto-refresh ativo" />
              </div>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {autoRefresh && (
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="p-1.5 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/50 rounded text-purple-400 hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Atualizar manualmente"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <select 
              value={timeFilter} 
              onChange={(e) => setTimeFilter(e.target.value)}
              className="bg-gray-800/50 border border-gray-600/50 text-purple-400 text-xs font-mono rounded px-3 py-1.5 min-w-0 focus:outline-none focus:border-purple-500/50"
            >
              <option value="30m">30m</option>
              <option value="1h">1h</option>
              <option value="2h">2h</option>
              <option value="6h">6h</option>
              <option value="12h">12h</option>
              <option value="1d">1d</option>
              <option value="1s">1s</option>
              <option value="1m">1m</option>
              <option value="total">Total</option>
            </select>
          </div>
        </div>
        <CardDescription className="text-gray-400 font-mono text-xs flex items-center justify-between">
          <span>{`// ${getFilteredRecords.length} rodadas analisadas`}</span>
          {autoRefresh && lastUpdate && (
            <span className="text-gray-400 text-xs">
              Última atualização: {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Gráfico de barras */}
        <div 
          className="overflow-x-auto lg:overflow-x-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          <div className="flex items-end justify-between gap-1 h-48 sm:h-52 md:h-56 lg:h-60 xl:h-64 min-w-[600px] lg:min-w-0">
            {localSimulation.martingaleLosses.map((losses: number, index: number) => {
              const wins = localSimulation.martingaleWins ? localSimulation.martingaleWins[index] : 0;
              const martingaleLevel = index + 1;
              
              // Calcular informações para este nível
              const lastBetOperationsAgo = calculateLastBetOperationsAgo[index];
              let expectedOperations = 0;
              

              
              if (index > 0 && lastBetOperationsAgo !== -1) {
                const matrixValue = probabilityMatrix[index];
                expectedOperations = lastBetOperationsAgo / matrixValue;
              } else if (index > 0) {
                // Se nunca houve aposta neste nível, usar uma lógica mais dinâmica
                const matrixValue = probabilityMatrix[index];
                const wins = localSimulation.martingaleWins ? localSimulation.martingaleWins[index] : 0;
                const losses = localSimulation.martingaleLosses[index];
                
                if (wins + losses > 0) {
                  // Se há histórico de vitórias/derrotas, usar proporção baseada na efetividade
                  const successRate = wins / (wins + losses);
                  expectedOperations = (1 - successRate) * (localSimulation.totalOperations / matrixValue);
                } else {
                  // Se não há histórico, usar cálculo padrão
                  expectedOperations = calculateProbability(localSimulation.totalOperations, index);
                }
              }
              
              // Inverter a lógica: valores baixos = porcentagem alta, valores altos = porcentagem baixa
              const rawPercentage = expectedOperations * 100;
              const percentage = Math.max(0, Math.min(100, 100 - rawPercentage));
              

              let percentageColor = 'text-gray-300';
              
              if (index > 0) {
                if (percentage >= 0 && percentage <= 25) {
                  percentageColor = 'text-red-400';       // Baixo = vermelho (menos provável)
                } else if (percentage >= 26 && percentage <= 50) {
                  percentageColor = 'text-orange-400';    // Médio-baixo = laranja
                } else if (percentage >= 51 && percentage <= 75) {
                  percentageColor = 'text-yellow-400';    // Médio-alto = amarelo
                } else if (percentage >= 76 && percentage <= 100) {
                  percentageColor = 'text-emerald-400';   // Alto = verde (mais provável)
                }
              }
              
              let lastBetDisplay = '';
              let lastBetColor = 'text-gray-500';
              
              if (lastBetOperationsAgo === -1 && (wins + losses) === 0) {
                lastBetDisplay = '-';
              } else if (lastBetOperationsAgo === -1) {
                lastBetDisplay = '-';
              } else if (lastBetOperationsAgo === 0) {
                lastBetDisplay = 'Agora';
                lastBetColor = 'text-yellow-300';
              } else {
                lastBetDisplay = `${lastBetOperationsAgo}`;
                lastBetColor = 'text-yellow-300';
              }
              
                                              return (
                  <div key={index} className="flex flex-col items-center gap-0.5 flex-1 min-w-[55px] lg:min-w-[50px]">
                    <div className="w-full relative">
                      <div className="w-full bg-gray-800/50 rounded-lg h-36 sm:h-40 md:h-44 lg:h-48 xl:h-52 relative overflow-hidden border border-gray-700/30 flex flex-col">
                        {/* Header com informações */}
                        <div className="p-2 flex-shrink-0 text-center mb-2">
                        <div className="text-xs font-mono text-white mb-1">
                          <span className="text-emerald-400">{wins}</span>/<span className="text-red-400">{losses}</span>
                        </div>
                        <div className={`text-xs font-mono ${percentageColor} mb-1`}>
                          {index > 0 ? `${percentage.toFixed(2)}%` : '-'}
                        </div>
                        <div className={`text-xs font-mono ${lastBetColor} mb-1`}>
                          {lastBetDisplay}
                        </div>

                      </div>
                      
                                              {/* Área do gráfico de barras */}
                        <div className="flex-1 flex items-end justify-center gap-1 p-1">
                        {(wins > 0 || losses > 0) ? (
                          <>
                            {/* Barra de vitórias (esquerda) */}
                            <div 
                              className="flex-1 bg-emerald-500/90 transition-all duration-300 hover:bg-emerald-400/95 rounded-sm"
                              style={{ 
                                height: wins > 0 
                                  ? `max(${(wins / maxValue) * 100}%, 2px)` 
                                  : '0px'
                              }}
                              title={`Vitórias A${martingaleLevel}: ${wins}`}
                            />
                            
                            {/* Barra de derrotas (direita) */}
                            <div 
                              className="flex-1 bg-red-500/90 transition-all duration-300 hover:bg-red-400/95 rounded-sm"
                              style={{ 
                                height: losses > 0 
                                  ? `max(${(losses / maxValue) * 100}%, 2px)` 
                                  : '0px'
                              }}
                              title={`Derrotas A${martingaleLevel}: ${losses}`}
                            />
                          </>
                        ) : (
                          /* Área vazia para níveis sem apostas */
                          <div className="flex-1"></div>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-2 text-center">
                      <span className="text-xs font-mono text-gray-400 font-semibold">A{martingaleLevel}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-gray-700/50">
          <div className="flex flex-wrap justify-between gap-2 text-xs font-mono">
            <span className="text-gray-400">
              Operações: <span className="text-purple-400">{localSimulation.totalOperations}</span>
            </span>
            <span className="text-gray-400">
              Vitórias: <span className="text-emerald-400">
                {localSimulation.martingaleWins ? localSimulation.martingaleWins.reduce((a: number, b: number) => a + b, 0) : 0}
              </span>
            </span>
            <span className="text-gray-400">
              Derrotas: <span className="text-red-400">
                {localSimulation.martingaleLosses.reduce((a: number, b: number) => a + b, 0)}
              </span>
            </span>
          </div>

          {/* ✨ NOVO: Legenda explicativa */}
          {showLegend && (
            <div className="mt-3 pt-3 border-t border-gray-700/30">
              <div className="text-xs font-mono text-gray-400 mb-2">
                <span className="text-cyan-300">Legenda:</span>
              </div>
              <div className="grid grid-cols-1 gap-1 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">Verde</span>/<span className="text-red-400">Vermelho</span>
                  <span className="text-gray-400">= Vitórias/Derrotas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-400">Porcentagem</span>
                  <span className="text-gray-400">= Probabilidade atual (0-100%, alto = confiança)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-300">Número</span>
                  <span className="text-gray-400">= Operações desde última aposta</span>
                </div>

              </div>
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
};

export default FrequencyAnalysisCard; 