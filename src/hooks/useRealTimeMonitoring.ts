import { useState, useEffect, useCallback, useRef } from 'react';

interface GameResult {
  gameId: string;
  gameResult: string;
  number: number;
  color: 'red' | 'black' | 'green';
  timestamp: number;
}

interface MonitoringData {
  results: GameResult[];
  tableId: string;
  timestamp: string;
  total: number;
  rouletteSignals?: {
    success: boolean;
    patterns_found: number;
    patterns: Array<{
      name: string;
      pattern_type: string;
      pattern_sequence: string;
      martingale_pattern: string;
      pattern_length: number;
      position: number;
    }>;
    sequences: {
      colors: string;
      parity: string;
      zones: string;
    };
  };
}

interface UseRealTimeMonitoringProps {
  jsessionId?: string;
  enabled?: boolean;
  interval?: number; // em milissegundos
  onNewResult?: (result: GameResult) => void;
  onUrlRotation?: (newTableId: string) => void;
  onHistoryUpdate?: (results: GameResult[]) => void;
  onPatternsUpdate?: (patterns: any[]) => void;
}

export function useRealTimeMonitoring({
  jsessionId,
  enabled = false,
  interval = 2000, // 2 segundos para melhor performance
  onNewResult,
  onUrlRotation,
  onHistoryUpdate,
  onPatternsUpdate
}: UseRealTimeMonitoringProps) {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [newResultsCount, setNewResultsCount] = useState(0);
  const [forceRotation, setForceRotation] = useState(false);
  const [currentTableId, setCurrentTableId] = useState('');
  const [detectedPatterns, setDetectedPatterns] = useState<any[]>([]);
  const [lastPatternCheck, setLastPatternCheck] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(0);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastGameIdRef = useRef<string>('');
  const currentTableIdRef = useRef<string>('');
  const lastDataHashRef = useRef<string>('');

  // Refs para callbacks para evitar dependências que causam re-renders
  const onNewResultRef = useRef(onNewResult);
  const onUrlRotationRef = useRef(onUrlRotation);
  const onHistoryUpdateRef = useRef(onHistoryUpdate);
  const onPatternsUpdateRef = useRef(onPatternsUpdate);
  const jsessionIdRef = useRef(jsessionId);
  const intervalValueRef = useRef(interval);

  // Atualizar refs quando valores mudarem
  useEffect(() => {
    onNewResultRef.current = onNewResult;
    onUrlRotationRef.current = onUrlRotation;
    onHistoryUpdateRef.current = onHistoryUpdate;
    onPatternsUpdateRef.current = onPatternsUpdate;
    jsessionIdRef.current = jsessionId;
    intervalValueRef.current = interval;
  }, [onNewResult, onUrlRotation, onHistoryUpdate, onPatternsUpdate, jsessionId, interval]);

  // Função para gerar hash simples dos dados
  const generateDataHash = (results: GameResult[]) => {
    if (!results || results.length === 0) return 'empty';
    return results.map(r => r.gameId).join(',');
  };

  // Função para buscar últimos resultados
  const fetchLatestResults = useCallback(async () => {
    const currentJsessionId = jsessionIdRef.current;
    if (!currentJsessionId) return;

    try {
      // Só mostrar loading na primeira requisição
      if (!lastDataHashRef.current) {
        setIsLoading(true);
      }
      setError(null);

      const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'monitor',
          jsessionId: currentJsessionId
        })
      });

      const result = await response.json();

      if (result.success && result.data) {
        const newData = result.data as MonitoringData;
        
        // Verificar se há novos resultados
        const latestGameId = newData.results?.[0]?.gameId;
        if (latestGameId && latestGameId !== lastGameIdRef.current) {
          // LOGS REDUZIDOS - Apenas para debug crítico
          // console.log(`🎯 [HOOK] NOVO resultado detectado: ${latestGameId} (anterior: ${lastGameIdRef.current})`);
          
          lastGameIdRef.current = latestGameId;
          setNewResultsCount(prev => {
            const newCount = prev + 1;
            // LOGS REDUZIDOS - Apenas para debug crítico
            // console.log(`📊 [HOOK] Contador atualizado: ${prev} → ${newCount}/5`);
            
            if (newCount >= 5) {
              // LOGS REDUZIDOS - Apenas para debug crítico
              // console.log('🔄 [HOOK] Rotação automática - 5 novos resultados atingidos');
              setForceRotation(true);
              setTimeout(() => {
                // LOGS REDUZIDOS - Apenas para debug crítico
                // console.log('🔄 [HOOK] Contador resetado após rotação');
                setNewResultsCount(0);
                setForceRotation(false);
              }, 1000);
              return 0;
            }
            return newCount;
          });
        }

        // Verificar mudança de URL/tableId
        if (newData.tableId && newData.tableId !== currentTableIdRef.current) {
          // LOGS REDUZIDOS - Apenas mudanças importantes
          // console.log(`🔄 [HOOK] Mudança de URL detectada: ${currentTableIdRef.current} → ${newData.tableId}`);
          currentTableIdRef.current = newData.tableId;
          setCurrentTableId(newData.tableId);
        }

        // Atualizar dados
        setData(newData);
        setLastUpdate(Date.now());

        // Processar sinais de roleta se disponíveis
        if (newData.rouletteSignals) {
          // LOGS REDUZIDOS - Apenas para debug crítico
          // console.log('🎲 [PADRÕES] Convertendo histórico para detecção de padrões...');
          
          const sequences = convertHistoryToSequences(newData.results || []);
          // LOGS REDUZIDOS - Apenas para debug crítico
          // console.log('📊 [PADRÕES] Sequências geradas:', sequences);
          
          // Detectar padrões usando RPC
          try {
            const { supabase } = await import('@/lib/supabase');
            const { data: patternsData, error: patternsError } = await supabase.rpc('detect_roulette_patterns_ultra_fast', {
              p_colors: sequences.colors,
              p_parity: sequences.parity,
              p_zones: sequences.zones
            });

            // LOGS REDUZIDOS - Apenas quando há padrões ou erro
            // console.log('🎯 [HOOK] Sinais recebidos:', {
            //   success: !patternsError,
            //   patterns: patternsData?.patterns?.length || 0,
            //   error: patternsError?.message
            // });

            if (!patternsError && patternsData?.patterns) {
              const patterns = patternsData.patterns;
              // LOGS REDUZIDOS - Apenas quando há padrões detectados
              if (patterns.length > 0) {
                console.log('🎯 [HOOK] Padrões detectados:', patterns.length);
              }
              setDetectedPatterns(patterns);
              setLastPatternCheck(Date.now());
            }
          } catch (error) {
            console.error('❌ [HOOK] Erro ao detectar padrões:', error);
          }
        }
      } else {
        setError(result.error || 'Erro ao buscar resultados');
        setData(null);
        if (onHistoryUpdateRef.current) {
          onHistoryUpdateRef.current([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      console.error('❌ Erro no monitoramento:', err);
      setData(null);
      if (onHistoryUpdateRef.current) {
        onHistoryUpdateRef.current([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []); // Sem dependências para evitar re-criação

  // Iniciar monitoramento
  const startMonitoring = useCallback(() => {
    const currentJsessionId = jsessionIdRef.current;
    if (!currentJsessionId || isActive) return;

    setIsActive(true);
    setNewResultsCount(0);
    
    // Primeira busca imediata
    fetchLatestResults();
    
    // Configurar polling
    intervalRef.current = setInterval(fetchLatestResults, intervalValueRef.current);
  }, [isActive, fetchLatestResults]);

  // Parar monitoramento
  const stopMonitoring = useCallback(() => {
    setIsActive(false);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Buscar uma vez (manual)
  const fetchOnce = useCallback(() => {
    fetchLatestResults();
  }, [fetchLatestResults]);

  // Efeito para controlar o monitoramento baseado no enabled
  useEffect(() => {
    if (enabled && jsessionId) {
      startMonitoring();
    } else {
      stopMonitoring();
    }

    // Cleanup ao desmontar
    return () => {
      stopMonitoring();
    };
  }, [enabled, jsessionId]); // Apenas enabled e jsessionId como dependências

  // Cleanup ao desmontar o componente
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Função para converter histórico em sequências (cores, parity, zones)
  const convertHistoryToSequences = useCallback((history: GameResult[]) => {
    if (!history || history.length === 0) {
      return {
        colors: '',
        parity: '',
        zones: '',
        totalResults: 0,
        validResults: 0
      };
    }

    // Filtrar zeros (número 0 = green)
    const validResults = history.filter(result => result.number !== 0);
    
    let colors = '';
    let parity = '';
    let zones = '';

    validResults.forEach(result => {
      const number = result.number;
      
      // Cores: R = Red, B = Black (zeros são ignorados)
      if (result.color === 'red') {
        colors += 'R';
      } else if (result.color === 'black') {
        colors += 'B';
      }
      
      // Paridade: E = Even (par), O = Odd (ímpar)
      if (number % 2 === 0) {
        parity += 'E';
      } else {
        parity += 'O';
      }
      
      // Zonas: L = Low (1-18), H = High (19-36)
      if (number >= 1 && number <= 18) {
        zones += 'L';
      } else if (number >= 19 && number <= 36) {
        zones += 'H';
      }
    });

    // 🎯 OTIMIZAÇÃO: Enviar apenas os primeiros 12 caracteres (mais recentes)
    const maxLength = 12;
    colors = colors.length > maxLength ? colors.slice(0, maxLength) : colors;
    parity = parity.length > maxLength ? parity.slice(0, maxLength) : parity;
    zones = zones.length > maxLength ? zones.slice(0, maxLength) : zones;

    return {
      colors,
      parity,
      zones,
      totalResults: history.length,
      validResults: validResults.length
    };
  }, []);

  // Função para detectar padrões usando o Supabase RPC
  const detectPatternsFromHistory = useCallback(async (
    sequences: { colors: string; parity: string; zones: string; validResults: number },
    onPatternsUpdate?: (patterns: any[]) => void
  ) => {
    // Só analisar se temos pelo menos 5 resultados válidos
    if (sequences.validResults < 5) {
      console.log('🎲 [PADRÕES] Histórico insuficiente para análise:', sequences.validResults, 'resultados válidos');
      return;
    }

    try {
      console.log('🔍 [PADRÕES] Chamando RPC com sequências convertidas:', {
        colors: sequences.colors,
        parity: sequences.parity,
        zones: sequences.zones,
        validResults: sequences.validResults
      });

      const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'detect-patterns',
          sequences: {
            colors: sequences.colors,
            parity: sequences.parity,
            zones: sequences.zones
          }
        })
      });

      const result = await response.json();
      
      if (result.success && result.data?.rouletteSignals) {
        const patterns = result.data.rouletteSignals.patterns || [];
        console.log('🎯 [PADRÕES] Padrões detectados:', patterns.length);
        
        if (onPatternsUpdate) {
          onPatternsUpdate(patterns);
        }
      } else {
        console.log('⚠️ [PADRÕES] Nenhum padrão detectado');
        if (onPatternsUpdate) {
          onPatternsUpdate([]);
        }
      }
    } catch (error) {
      console.error('❌ [PADRÕES] Erro na detecção:', error);
      if (onPatternsUpdate) {
        onPatternsUpdate([]);
      }
    }
  }, []);

  // Status do monitoramento
  const status = {
    isActive,
    isLoading,
    hasError: !!error,
    newResultsCount,
    currentTableId: currentTableIdRef.current,
    lastGameId: lastGameIdRef.current,
    nextRotationIn: 5 - newResultsCount, // Rotação a cada 5 resultados
    rotationThreshold: 5,
    preventiveRotationAt: 3, // Rotação preventiva a cada 3 tentativas sem novos resultados
    emergencyRotationAt: 5 // Rotação de emergência se não há resultados por 5 tentativas
  };

  return {
    data,
    error,
    status,
    actions: {
      start: startMonitoring,
      stop: stopMonitoring,
      fetchOnce
    }
  };
} 