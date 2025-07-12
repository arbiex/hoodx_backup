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
import FrequencyAnalysisCard from '@/components/FrequencyAnalysisCard'

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

// 🆕 Componente de Card de Operação
const OperationCard = ({ 
  operation,
  isSelected,
  onSelect,
  onHover
}: {
  operation: any;
  isSelected: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}) => {
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit', 
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusInfo = () => {
    switch (operation.status) {
      case 'won':
        return { icon: '✅', text: 'Vitória', color: 'text-green-400', borderColor: 'border-green-500/50' };
      case 'lost':
        return { icon: '❌', text: 'Derrota', color: 'text-red-400', borderColor: 'border-red-500/50' };
      default:
        return { icon: '⏳', text: 'Ativa', color: 'text-blue-400', borderColor: 'border-blue-500/50' };
    }
  };

  const status = getStatusInfo();
  const lastBet = operation.bets[operation.bets.length - 1];
  const winLevel = operation.status === 'won' ? lastBet?.martingaleLevel : null;

      return (
      <div 
        className={`
          p-3 rounded-lg border cursor-pointer transition-all duration-200
          ${isSelected 
            ? `bg-purple-500/20 border-purple-400 ${status.borderColor}` 
            : 'bg-gray-800/50 border-gray-700 hover:border-gray-600 hover:bg-gray-800/70'
          }
        `}
        onClick={onSelect}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
      {/* Header da operação */}
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm font-mono text-purple-300">
          Op #{operation.operationId}
        </div>
        <div className="text-xs text-gray-400">
          {formatDateTime(operation.patternRecords[0]?.timestamp)}
        </div>
      </div>

      {/* Padrão */}
      <div className="mb-2">
        <div className="text-xs text-gray-400 mb-1">Padrão Detectado:</div>
        <div className="font-mono text-sm">
          <span className="text-blue-300">{operation.historicPattern.join('')}</span>
          <span className="text-gray-500 mx-2">→</span>
          <span className="text-green-300">{operation.invertedPattern.join('')}</span>
          <span className="text-xs text-gray-400 ml-2">(CONTRA)</span>
        </div>
      </div>

      {/* Status e resultado */}
      <div className="flex justify-between items-center">
        <div className={`text-sm ${status.color}`}>
          {status.icon} {status.text}
          {winLevel && (
            <span className="text-xs text-gray-400 ml-1">no M{winLevel}</span>
          )}
        </div>
        <div className="text-xs text-gray-400">
          {operation.bets.length} apostas
        </div>
      </div>


    </div>
  );
};

// 🆕 Lista de Operações
const OperationsList = ({ 
  operations, 
  selectedOperationId,
  onSelectOperation
}: {
  operations: any[];
  selectedOperationId: number | null;
  onSelectOperation: (id: number | null) => void;
}) => {
  // Ordenar operações: mais recente no topo
  const sortedOperations = [...operations].sort((a, b) => b.operationId - a.operationId);

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {sortedOperations.map((operation) => (
        <OperationCard
          key={`operation-${operation.operationId}-${operation.startIndex}`}
          operation={operation}
          isSelected={selectedOperationId === operation.operationId}
          onSelect={() => {
            if (selectedOperationId === operation.operationId) {
              onSelectOperation(null); // Deselecionar se já selecionada
            } else {
              onSelectOperation(operation.operationId);
            }
          }}
          onHover={() => {}}
        />
      ))}
    </div>
  );
};

const NumberSquare = ({ 
  record, 
  operationInfo, 
  showOnlyOperated,
  allOperations,
  selectedOperationId
}: { 
  record: HistoryRecord;
  operationInfo?: any;
  showOnlyOperated?: boolean;
  allOperations?: any[];
  selectedOperationId?: number | null;
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

  // Aplicar opacidade se modo "apenas operados" estiver ativo e este número não foi operado
  const isOperated = operationInfo !== undefined;
  
  // Cores do border para indicar tipo de operação (removido quando switch ativo)
  const getBorderStyle = () => {
    // Não mostrar bordas especiais no modo normal ou no modo operações
    return '';
  };

  // 🆕 Encontrar todas as operações que este registro participa
  const recordOperations = allOperations?.filter(op => 
    op.patternRecords.some((r: any) => r.id === record.id) ||
    op.bets.some((b: any) => b.recordId === record.id)
  ) || [];

  // Determinar se deve mostrar com opacidade reduzida
  const shouldShowOpacity = showOnlyOperated && !operationInfo;
  
  // 🆕 Determinar se pertence à operação selecionada
  const belongsToSelected = selectedOperationId !== null && 
    recordOperations.some(op => op.operationId === selectedOperationId);
  

  
  // 🆕 Determinar opacidade baseada no estado de seleção
  const getOpacity = () => {
    // Modo normal: sempre opacidade total
    if (!showOnlyOperated) return 'opacity-100';
    
    // Modo operações: se há operação selecionada, mostrar apenas registros com operationInfo
    if (selectedOperationId !== null) {
      return operationInfo ? 'opacity-100' : 'opacity-10';
    }
    
    // Modo operações sem seleção: mostrar tudo com opacidade baixa
    return 'opacity-20';
  };

  return (
    <Tooltip
      content={
        <div className="text-center">
          <div className="font-semibold text-white">
            {showOnlyOperated && selectedOperationId !== null && operationInfo ? (
              <>
                {operationInfo.type === 'pattern' ? `Posição ${operationInfo.patternPosition}/7 do Padrão` : `Aposta M${operationInfo.martingaleLevel}`}
                <div className="text-xs text-gray-300">Resultado: {record.number} {record.color.charAt(0).toUpperCase() + record.color.slice(1)}</div>
              </>
            ) : (
              <>{record.number} {record.color.charAt(0).toUpperCase() + record.color.slice(1)}</>
            )}
          </div>
          <div className="text-gray-200">{formatDateTime(record.timestamp)}</div>
          <div className="text-gray-300 text-xs">{formatTimeAgo(record.timestamp)}</div>
          
          {/* Informações da operação selecionada */}
          {showOnlyOperated && selectedOperationId !== null && operationInfo && (
            <div className="mt-2 pt-2 border-t border-gray-500">
              {operationInfo.type === 'pattern' ? (
                <div>
                  <div className="text-blue-200">🎯 Operação #{operationInfo.operationId}</div>
                  <div className="text-xs text-gray-300">Posição {operationInfo.patternPosition}/7 no padrão</div>
                  <div className="text-xs text-gray-300">Histórico: {operationInfo.originalPattern || 'N/A'}</div>
                  <div className="text-xs text-green-300">Apostas: {operationInfo.basePattern} (CONTRA)</div>
                  {operationInfo.isPatternMatch && (
                    <div className="text-xs text-yellow-300">⭐ Posição chave (1,2,6,7)</div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="text-purple-200">💰 Operação #{operationInfo.operationId}</div>
                  <div className={`${operationInfo.isWin ? 'text-green-200' : 'text-red-200'}`}>
                    {operationInfo.isWin ? '✅ Vitória' : '❌ Derrota'} M{operationInfo.martingaleLevel}
                  </div>
                  <div className="text-xs text-gray-300">
                    Apostou: {operationInfo.expectedColor} | Veio: {operationInfo.actualColor === 'green' ? '🟢 Verde' : operationInfo.actualColor}
                  </div>
                  <div className="text-xs text-gray-300">Posição: {operationInfo.patternPosition}/5 (CONTRA padrão)</div>
                  {operationInfo.isZero && (
                    <div className="text-xs text-yellow-300">🟢 Zero especial (só avança Martingale)</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      }
    >
      <div 
        className={`
          relative aspect-square flex items-center justify-center 
          border cursor-pointer transition-all duration-200
          ${getSquareColors(record.color)}
          ${getBorderStyle()}
          ${getOpacity()}
        `}
        onMouseEnter={() => {
          // Não fazer nada no modo operações, deixar o controle para os cards
        }}
        onMouseLeave={() => {
          // Não fazer nada no modo operações, deixar o controle para os cards  
        }}

      >
        {/* Mostrar número ou informação da estratégia apenas no histórico visual */}
        {showOnlyOperated && selectedOperationId !== null && operationInfo ? (
          <span className={`text-xs sm:text-sm md:text-base font-bold ${
            operationInfo.type === 'pattern' 
              ? operationInfo.isPatternMatch 
                ? 'text-yellow-200' // Posições chave do padrão
                : 'text-blue-200'   // Outras posições do padrão
              : operationInfo.isWin 
                ? 'text-green-200'  // Apostas ganhas
                : 'text-red-200'    // Apostas perdidas
          }`}>
            {operationInfo.type === 'pattern' ? operationInfo.patternPosition : `M${operationInfo.martingaleLevel}`}
          </span>
        ) : (
          <span className="text-xs sm:text-sm md:text-base font-bold">{record.number}</span>
        )}
        
        {/* Indicador de operação no canto superior direito - removido para manter modo normal limpo */}
        {false && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold">
            {operationInfo.type === 'pattern' ? (
              <span className={operationInfo.isPatternMatch ? 'text-yellow-400' : 'text-blue-400'}>
                {operationInfo.patternPosition}
              </span>
            ) : (
              <span className={`text-xs ${operationInfo.isWin ? 'text-green-400' : 'text-red-400'}`}>
                M{operationInfo.martingaleLevel}
              </span>
            )}
          </div>
        )}
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
  const [showOnlyOperatedMode, setShowOnlyOperatedMode] = useState(false)

  const [selectedOperationId, setSelectedOperationId] = useState<number | null>(null)
  const [fullRecords, setFullRecords] = useState<HistoryRecord[]>([]) // Dados completos para análise (independente do filtro visual)

  // 🆕 Simulação completa com TODOS os padrões intercalados (compartilhada)
  const completeSimulation = useMemo(() => {
    if (recentRecords.length < 7) {
      return {
        martingaleLosses: Array(10).fill(0),
        martingaleWins: Array(10).fill(0),
        totalOperations: 0,
        totalResults: recentRecords.length,
        simulationValid: false,
        operatedRecords: [],
        allOperations: []
      };
    }

    // Ordenar registros do mais antigo para o mais novo
    const sortedRecords = [...recentRecords].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const martingaleLosses = Array(10).fill(0); // A1-A10 contadores de derrotas
    const martingaleWins = Array(10).fill(0);   // A1-A10 contadores de vitórias
    const operatedRecords: any[] = []; // Rastrear operações para compatibilidade
    const allOperations: any[] = []; // NOVA: Todas as operações possíveis
    let totalOperations = 0;
    let operationId = 0; // ID único da operação

    // Função para converter número para cor (ignora zeros na formação de padrões)
    const getColor = (record: HistoryRecord): string | null => {
      if (record.number === 0) return null; // Ignora zeros na formação de padrões
      return record.color === 'red' ? 'R' : 'B';
    };

    // Função para converter cor do banco para formato da API
    const getColorFromResult = (record: HistoryRecord): string => {
      if (record.number === 0) return 'green';
      return record.color === 'red' ? 'R' : 'B';
    };

    // Função para inverter cor (apostar CONTRA o padrão) - igual à API real
    const invertColor = (color: string): string => {
      if (color === 'R') return 'B';      // Vermelho → Preto
      if (color === 'B') return 'R';      // Preto → Vermelho  
      return color; // green permanece green (não inverte)
    };

    // Função para validar padrão de repetição
    const isValidPattern = (results: string[]): boolean => {
      if (results.length !== 7) return false;
      
      // Rejeitar se todas as cores forem iguais
      const firstColor = results[0];
      const allSameColor = results.every(color => color === firstColor);
      if (allSameColor) return false;
      
      // Verificar padrão de repetição: pos6=pos1 E pos7=pos2
      return results[5] === results[0] && results[6] === results[1];
    };

    // 🆕 NOVA LÓGICA: Detectar TODOS os padrões possíveis (intercalados)
    // Buscar padrões em CADA posição possível do histórico
    for (let startIndex = 6; startIndex < sortedRecords.length; startIndex++) {
      // Coletar 7 resultados anteriores (ignorando zeros)
      const recentResults: string[] = [];
      const patternRecords: HistoryRecord[] = [];
      
      // Buscar para trás coletando cores válidas
      let searchIndex = startIndex;
      while (searchIndex >= 0 && recentResults.length < 7) {
        const record = sortedRecords[searchIndex];
        if (record) {
          const color = getColor(record);
          if (color) {
            recentResults.unshift(color); // Adicionar no início para manter ordem cronológica
            patternRecords.unshift(record);
          }
        }
        searchIndex--;
      }

      // Se temos 7 resultados, verificar padrão
      if (recentResults.length === 7 && isValidPattern(recentResults)) {
        // ✅ CRIAR PADRÃO BASE INVERTIDO (igual à API real)
        const historicPattern = recentResults.slice(0, 5); // Primeiros 5 do padrão
        const invertedPattern = historicPattern.map(invertColor); // Apostar CONTRA o padrão

        // Criar nova operação
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

        // Registrar os números do padrão
        patternRecords.forEach((record, index) => {
          operatedRecords.push({
            recordId: record.id,
            gameId: record.game_id,
            operationId: currentOperation.operationId,
            type: 'pattern',
            patternPosition: index + 1,
            color: recentResults[index],
            isPatternMatch: index === 0 || index === 1 || index === 5 || index === 6, // Posições chave
            basePattern: invertedPattern.join(''), // ✅ SALVAR PADRÃO INVERTIDO (para apostas)
            originalPattern: historicPattern.join('') // ✅ SALVAR PADRÃO ORIGINAL (para referência)
          });
        });

        // Simular apostas após o padrão
        let currentLevel = 2; // Iniciar no nível 3 (índice 2)
        let martingaleLevel = 0; // Iniciar no M1
        
        // Processar registros após o padrão
        for (let betIndex = startIndex + 1; betIndex < sortedRecords.length; betIndex++) {
          const betRecord = sortedRecords[betIndex];
          if (!betRecord) continue;

          const patternIndex = currentLevel % 5; // Repete padrão base a cada 5 níveis
          const expectedColor = invertedPattern[patternIndex];
          const isZero = betRecord.number === 0;
          const actualColor = getColorFromResult(betRecord);
          const isWin = !isZero && actualColor === expectedColor;

          // Registrar a aposta
          const betInfo = {
            recordId: betRecord.id,
            gameId: betRecord.game_id,
            operationId: currentOperation.operationId,
            martingaleLevel: martingaleLevel + 1, // M1-M10
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
            // ✅ VITÓRIA - contar derrotas nos níveis anteriores e vitória no nível atual
            for (let i = 0; i < martingaleLevel; i++) {
              martingaleLosses[i]++; // +1 derrota em cada nível anterior
            }
            martingaleWins[martingaleLevel]++; // +1 vitória no nível atual
            totalOperations++;
            currentOperation.status = 'won';
            break; // Finalizar esta operação
            
          } else {
            // ❌ PERDEU - Lógica especial para VERDE vs COR ERRADA
            if (isZero) {
              // 🟢 VERDE: Avança APENAS Martingale, MANTÉM mesmo nível
              martingaleLevel++; // Só avança martingale
              // currentLevel NÃO MUDA!
            } else {
              // 🔴/⚫ COR ERRADA: Avança nível E martingale
              currentLevel++;    // Avança nível do padrão
              martingaleLevel++; // Avança martingale
            }
            
            // ✅ Verificar se atingiu M10 (máximo da sequência)
            if (martingaleLevel >= 10) {
              // M10 perdido - contar derrotas em todos os 10 níveis
              for (let i = 0; i < 10; i++) {
                martingaleLosses[i]++;
              }
              totalOperations++;
              currentOperation.status = 'lost';
              break; // Finalizar esta operação
            }
          }
        }

        allOperations.push(currentOperation);
      }
    }

    return {
      martingaleLosses,
      martingaleWins,
      totalOperations,
      totalResults: recentRecords.length,
      simulationValid: true,
      operatedRecords,
      allOperations
    };
  }, [recentRecords]);

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
      
      setFullRecords(uniqueRecords)
      
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
        
        if (record.color === 'red') {
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
            </div>
          </div>

          {/* Distribuição de Números */}
          <FrequencyAnalysisCard 
            autoRefresh={true}
            refreshInterval={30000}
            title="FREQUENCIA_APOSTAS"
            defaultTimeFilter="6h"
          />

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
                    // Verificar sequências vermelhas
                    if (record.color === 'red') {
                      currentRedSequence++;
                      // Resetar sequência preta
                      if (currentBlackSequence >= 4) {
                        blackSequenceCount++;
                      }
                      currentBlackSequence = 0;
                    } else if (record.color === 'black') {
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
              const currentHour = now.getHours();
              
              // Data de hoje na mesma hora
              const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentHour, 0, 0);
              const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentHour, 59, 59);
              
              // Data de ontem na mesma hora
              const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
              const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), currentHour, 0, 0);
              const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), currentHour, 59, 59);
              
              // Buscar registros de ontem na mesma hora (independente do filtro)
              const yesterdayRecords = fullRecords.filter((record: HistoryRecord) => {
                const recordTime = new Date(record.timestamp);
                return recordTime >= yesterdayStart && recordTime <= yesterdayEnd;
              });
              
              // Buscar registros de hoje na mesma hora
              const todayRecords = fullRecords.filter((record: HistoryRecord) => {
                const recordTime = new Date(record.timestamp);
                return recordTime >= todayStart && recordTime <= todayEnd;
              });
              
              if (yesterdayRecords.length === 0) {
                return {
                  currentHour,
                  hasData: false,
                  redFrequency: 0,
                  blackFrequency: 0,
                  redComparison: 0,
                  blackComparison: 0,
                  totalRounds: 0,
                  todayFrequency: { red: 0, black: 0 },
                  todayRounds: todayRecords.length
                };
              }
              
              // Função para calcular sequências em um conjunto de dados
              const calculateSequences = (dataRecords: any[]) => {
                const sortedRecords = dataRecords.sort((a, b) => 
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
                
                let redSequenceCount = 0;
                let blackSequenceCount = 0;
                let currentRedSequence = 0;
                let currentBlackSequence = 0;
                
                sortedRecords.forEach(record => {
                  if (record.color === 'red') {
                    currentRedSequence++;
                    if (currentBlackSequence >= 4) {
                      blackSequenceCount++;
                    }
                    currentBlackSequence = 0;
                  } else if (record.color === 'black') {
                    currentBlackSequence++;
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
                
                // Verificar últimas sequências
                if (currentRedSequence >= 4) {
                  redSequenceCount++;
                }
                if (currentBlackSequence >= 4) {
                  blackSequenceCount++;
                }
                
                return {
                  redSequenceCount,
                  blackSequenceCount,
                  totalRounds: sortedRecords.length,
                  redFrequency: redSequenceCount > 0 ? Math.round(sortedRecords.length / redSequenceCount) : 0,
                  blackFrequency: blackSequenceCount > 0 ? Math.round(sortedRecords.length / blackSequenceCount) : 0
                };
              };
              
              // Calcular para ontem e hoje
              const yesterdayStats = calculateSequences(yesterdayRecords);
              const todayStats = calculateSequences(todayRecords);
              
              // Comparar com média ideal (1:35)
              const idealFrequency = 35;
              const redComparison = yesterdayStats.redFrequency > 0 ? yesterdayStats.redFrequency - idealFrequency : 0;
              const blackComparison = yesterdayStats.blackFrequency > 0 ? yesterdayStats.blackFrequency - idealFrequency : 0;
              
              return {
                currentHour,
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
                }
              };
            };
            
            const comparison = calculateYesterdayComparison();
            
            return (
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-400" />
                    Comparativo: Hora Atual vs Dia Anterior ({String(comparison.currentHour).padStart(2, '0')}h)
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Análise independente comparando a mesma hora de ontem com hoje - útil para detectar tendências horárias (Média ideal: 1:35)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!comparison.hasData ? (
                    <div className="text-center py-8">
                      <div className="text-gray-400 mb-2">Sem dados do dia anterior para esta hora ({String(comparison.currentHour).padStart(2, '0')}h)</div>
                      <div className="text-xs text-gray-500">
                        Esta análise é independente do filtro de tempo e busca dados das últimas 24 horas automaticamente
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Análise Vermelhos */}
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-red-400 font-semibold">🔥 Sequências Vermelhas</span>
                        </div>
                        
                        <div className="space-y-3">
                          {/* Frequência de ontem */}
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400">Freq. Ontem:</span>
                            <span className="font-mono text-white">
                              {comparison.redFrequency > 0 ? `1:${comparison.redFrequency}` : '--'}
                            </span>
                          </div>
                          
                          {/* Frequência de hoje */}
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400">Freq. Hoje:</span>
                            <span className="font-mono text-blue-400">
                              {comparison.todayFrequency.red > 0 ? `1:${comparison.todayFrequency.red}` : '--'}
                            </span>
                          </div>
                          
                          {/* Comparação com ideal */}
                          {comparison.redFrequency > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-400">vs Ideal (1:35):</span>
                              <span className={`font-mono font-bold ${
                                comparison.redComparison > 0 ? 'text-orange-400' : 
                                comparison.redComparison < 0 ? 'text-green-400' : 'text-gray-400'
                              }`}>
                                {comparison.redComparison > 0 ? `+${comparison.redComparison}` : comparison.redComparison}
                              </span>
                            </div>
                          )}
                          
                          {/* Tendência */}
                          {comparison.redFrequency > 0 && (
                            <div className="bg-gray-800/50 rounded p-3">
                              <div className="text-xs font-semibold text-gray-300 mb-1">Tendência Hoje:</div>
                              <div className={`text-sm font-bold ${
                                comparison.redComparison > 0 ? 'text-green-400' : 
                                comparison.redComparison < 0 ? 'text-orange-400' : 'text-gray-400'
                              }`}>
                                {comparison.redComparison > 0 
                                  ? `📈 Maior probabilidade (saíram poucas ontem)`
                                  : comparison.redComparison < 0 
                                  ? `📉 Menor probabilidade (saíram muitas ontem)`
                                  : `➡️ Probabilidade normal`
                                }
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                Ontem: {comparison.redSequenceCount} seq. em {comparison.totalRounds} rodadas
                              </div>
                              {comparison.todayRounds > 0 && comparison.todaySequences?.red !== undefined && (
                                <div className="text-xs text-blue-400 mt-1">
                                  Hoje: {comparison.todaySequences.red} seq. em {comparison.todayRounds} rodadas
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Análise Pretos */}
                      <div className="bg-gray-500/10 border border-gray-500/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-gray-300 font-semibold">⚫ Sequências Pretas</span>
                        </div>
                        
                        <div className="space-y-3">
                          {/* Frequência de ontem */}
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400">Freq. Ontem:</span>
                            <span className="font-mono text-white">
                              {comparison.blackFrequency > 0 ? `1:${comparison.blackFrequency}` : '--'}
                            </span>
                          </div>
                          
                          {/* Frequência de hoje */}
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400">Freq. Hoje:</span>
                            <span className="font-mono text-blue-400">
                              {comparison.todayFrequency.black > 0 ? `1:${comparison.todayFrequency.black}` : '--'}
                            </span>
                          </div>
                          
                          {/* Comparação com ideal */}
                          {comparison.blackFrequency > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-400">vs Ideal (1:35):</span>
                              <span className={`font-mono font-bold ${
                                comparison.blackComparison > 0 ? 'text-orange-400' : 
                                comparison.blackComparison < 0 ? 'text-green-400' : 'text-gray-400'
                              }`}>
                                {comparison.blackComparison > 0 ? `+${comparison.blackComparison}` : comparison.blackComparison}
                              </span>
                            </div>
                          )}
                          
                          {/* Tendência */}
                          {comparison.blackFrequency > 0 && (
                            <div className="bg-gray-800/50 rounded p-3">
                              <div className="text-xs font-semibold text-gray-300 mb-1">Tendência Hoje:</div>
                              <div className={`text-sm font-bold ${
                                comparison.blackComparison > 0 ? 'text-green-400' : 
                                comparison.blackComparison < 0 ? 'text-orange-400' : 'text-gray-400'
                              }`}>
                                {comparison.blackComparison > 0 
                                  ? `📈 Maior probabilidade (saíram poucas ontem)`
                                  : comparison.blackComparison < 0 
                                  ? `📉 Menor probabilidade (saíram muitas ontem)`
                                  : `➡️ Probabilidade normal`
                                }
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                Ontem: {comparison.blackSequenceCount} seq. em {comparison.totalRounds} rodadas
                              </div>
                              {comparison.todayRounds > 0 && comparison.todaySequences?.black !== undefined && (
                                <div className="text-xs text-blue-400 mt-1">
                                  Hoje: {comparison.todaySequences.black} seq. em {comparison.todayRounds} rodadas
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Filtro de Quantidade */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-white">Histórico Visual</h2>
              
              {/* Switch para mostrar apenas operados */}
              <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-2 rounded-lg border border-gray-700/50">
                <span className="text-xs text-gray-400">Apenas operados</span>
                <button
                  onClick={() => setShowOnlyOperatedMode(!showOnlyOperatedMode)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    showOnlyOperatedMode ? 'bg-purple-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      showOnlyOperatedMode ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
                {showOnlyOperatedMode && (
                  <span className="text-xs text-purple-400">🎯 Padrões visíveis</span>
                )}
              </div>
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
              <CardDescription className="text-gray-400 flex items-center justify-between">
                <span>
                  {showOnlyOperatedMode && selectedOperationId === null
                    ? "Clique em uma operação para ver sua visualização no histórico" 
                    : `Exibindo ${recentRecords.length} resultados para período "${timeFilter}" em ordem cronológica (mais recente primeiro)`
                  }
                </span>
                {showOnlyOperatedMode && selectedOperationId !== null && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1">
                      <div className="w-4 h-4 rounded border bg-yellow-200 text-yellow-800 flex items-center justify-center text-xs font-bold">1</div>
                      Padrão chave (1,2,6,7)
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-4 h-4 rounded border bg-blue-200 text-blue-800 flex items-center justify-center text-xs font-bold">3</div>
                      Padrão (3,4,5)
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-4 h-4 rounded border bg-green-200 text-green-800 flex items-center justify-center text-xs font-bold">M</div>
                      Aposta ganha
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-4 h-4 rounded border bg-red-200 text-red-800 flex items-center justify-center text-xs font-bold">M</div>
                      Aposta perdida
                    </span>
                  </div>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentRecords.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Nenhum registro encontrado</p>
                </div>
              ) : showOnlyOperatedMode ? (
                // 🆕 MODO OPERAÇÕES: Mostrar lista de operações ao invés dos números
                completeSimulation.allOperations.length > 0 ? (
                  <div>
                    <div className="mb-4 text-sm text-gray-400">
                      {completeSimulation.allOperations.length} operações detectadas 
                      (ordenadas por cronologia - mais recente no topo)
                    </div>
                    <OperationsList
                      operations={completeSimulation.allOperations}
                      selectedOperationId={selectedOperationId}
                      onSelectOperation={setSelectedOperationId}
                    />
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-400">Nenhuma operação detectada no histórico</div>
                    <div className="text-xs text-gray-500 mt-2">
                      É necessário pelo menos 7 resultados consecutivos para formar um padrão
                    </div>
                  </div>
                )
              ) : (() => {
                // MODO NORMAL: Mostrar grade de números
                const operationsMap = new Map();
                
                // Criar mapa de operações por recordId usando simulação compartilhada
                completeSimulation.operatedRecords.forEach((op: any) => {
                  operationsMap.set(op.recordId, op);
                });
                
                return (
                  <div className="grid gap-0" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(50px, 1fr))'}}>
                    {recentRecords.map((record) => (
                      <NumberSquare 
                        key={`${record.id}-${record.timestamp}`} 
                        record={record} 
                        operationInfo={operationsMap.get(record.id)}
                        showOnlyOperated={false} // Sempre false no modo normal
                        allOperations={completeSimulation.allOperations}

                        selectedOperationId={selectedOperationId}
                      />
                    ))}
                  </div>
                );
              })()}

              {/* 🆕 Histórico visual adicional quando há operação selecionada */}
              {showOnlyOperatedMode && selectedOperationId !== null && (
                <div className="mt-6 pt-6 border-t border-gray-700">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-purple-300 mb-2">
                      📍 Histórico Visual - Operação #{selectedOperationId}
                    </h4>
                    <div className="text-xs text-gray-400 mb-3">
                      Posições do padrão (1,2,3,4,5,6,7) e apostas (M1,M2,M3...) destacadas no histórico
                    </div>
                  </div>
                  
                  {(() => {
                    // Filtrar apenas os registros da operação selecionada
                    const selectedOperationRecords = completeSimulation.operatedRecords.filter(
                      (op: any) => op.operationId === selectedOperationId
                    );
                    

                    
                    // Criar mapa específico para a operação selecionada
                    const selectedOperationMap = new Map();
                    selectedOperationRecords.forEach((op: any) => {
                      selectedOperationMap.set(op.recordId, op);
                    });
                    
                    return (
                      <div className="grid gap-0" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(50px, 1fr))'}}>
                        {recentRecords.map((record) => (
                          <NumberSquare 
                            key={`${record.id}-${record.timestamp}-selected`} 
                            record={record} 
                            operationInfo={selectedOperationMap.get(record.id)}
                            showOnlyOperated={true}
                            allOperations={completeSimulation.allOperations}
                            selectedOperationId={selectedOperationId}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
} 