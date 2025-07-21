import { useRef, useCallback, useEffect } from 'react';

/**
 * 🕐 Hook Gerenciador de Timers - Previne Memory Leaks
 * 
 * Centraliza todo o gerenciamento de timers (setTimeout, setInterval)
 * garantindo limpeza automática e prevenindo vazamentos de memória.
 * 
 * ✅ Funcionalidades:
 * - Gerenciamento centralizado de timers
 * - Limpeza automática no unmount
 * - IDs únicos para identificação
 * - Debugging opcional
 * - Type safety completo
 */

// Tipos para diferentes tipos de timer
type TimerType = 'timeout' | 'interval';

interface TimerInfo {
  id: NodeJS.Timeout | number; // Compatível com browser e Node.js
  type: TimerType;
  callback: () => void;
  delay: number;
  createdAt: number;
  description?: string; // Para debugging
}

interface UseTimerManagerOptions {
  debug?: boolean; // Habilita logs de debugging
  maxTimers?: number; // Limite máximo de timers (proteção)
}

export const useTimerManager = (options: UseTimerManagerOptions = {}) => {
  const { debug = false, maxTimers = 50 } = options;
  
  // Mapa para armazenar todos os timers ativos
  const timersRef = useRef<Map<string, TimerInfo>>(new Map());
  const mountedRef = useRef(true);
  
  // 🧹 Função para limpar um timer específico
  const clearTimer = useCallback((timerKey: string): boolean => {
    const timer = timersRef.current.get(timerKey);
    if (!timer) {
      if (debug) console.log(`🕐 [TIMER] Timer '${timerKey}' não encontrado para limpeza`);
      return false;
    }
    
    // Limpar o timer baseado no tipo
    if (timer.type === 'timeout') {
      clearTimeout(timer.id);
    } else if (timer.type === 'interval') {
      clearInterval(timer.id);
    }
    
    // Remover do mapa
    timersRef.current.delete(timerKey);
    
    if (debug) {
      console.log(`🕐 [TIMER] Timer '${timerKey}' limpo (${timer.type})`);
    }
    
    return true;
  }, [debug]);
  
  // 🔄 Função para criar setTimeout
  const setTimeout = useCallback((
    callback: () => void, 
    delay: number, 
    timerKey: string,
    description?: string
  ): string => {
    // Verificar se ainda está montado
    if (!mountedRef.current) {
      if (debug) console.warn(`🕐 [TIMER] Tentativa de criar timer '${timerKey}' após unmount`);
      return timerKey;
    }
    
    // Verificar limite de timers
    if (timersRef.current.size >= maxTimers) {
      console.error(`🕐 [TIMER] Limite de timers atingido (${maxTimers}). Timer '${timerKey}' não criado.`);
      return timerKey;
    }
    
    // Limpar timer existente se houver
    if (timersRef.current.has(timerKey)) {
      clearTimer(timerKey);
    }
    
    // Wrapper para callback que limpa automaticamente
    const wrappedCallback = () => {
      try {
        callback();
      } catch (error) {
        console.error(`🕐 [TIMER] Erro no callback do timer '${timerKey}':`, error);
      } finally {
        // Auto-cleanup após execução do timeout
        timersRef.current.delete(timerKey);
        if (debug) console.log(`🕐 [TIMER] Timer '${timerKey}' auto-limpo após execução`);
      }
    };
    
    // Criar o timer
    const timerId = window.setTimeout(wrappedCallback, delay);
    
    // Armazenar informações do timer
    const timerInfo: TimerInfo = {
      id: timerId,
      type: 'timeout',
      callback,
      delay,
      createdAt: Date.now(),
      description
    };
    
    timersRef.current.set(timerKey, timerInfo);
    
    if (debug) {
      console.log(`🕐 [TIMER] Timeout '${timerKey}' criado: ${delay}ms`, description ? `(${description})` : '');
    }
    
    return timerKey;
  }, [debug, maxTimers, clearTimer]);
  
  // 🔁 Função para criar setInterval
  const setInterval = useCallback((
    callback: () => void, 
    delay: number, 
    timerKey: string,
    description?: string
  ): string => {
    // Verificar se ainda está montado
    if (!mountedRef.current) {
      if (debug) console.warn(`🕐 [TIMER] Tentativa de criar timer '${timerKey}' após unmount`);
      return timerKey;
    }
    
    // Verificar limite de timers
    if (timersRef.current.size >= maxTimers) {
      console.error(`🕐 [TIMER] Limite de timers atingido (${maxTimers}). Timer '${timerKey}' não criado.`);
      return timerKey;
    }
    
    // Limpar timer existente se houver
    if (timersRef.current.has(timerKey)) {
      clearTimer(timerKey);
    }
    
    // Wrapper para callback com proteção
    const wrappedCallback = () => {
      // Verificar se ainda está montado antes de executar
      if (!mountedRef.current) {
        clearTimer(timerKey);
        return;
      }
      
      try {
        callback();
      } catch (error) {
        console.error(`🕐 [TIMER] Erro no callback do timer '${timerKey}':`, error);
      }
    };
    
    // Criar o timer
    const timerId = window.setInterval(wrappedCallback, delay);
    
    // Armazenar informações do timer
    const timerInfo: TimerInfo = {
      id: timerId,
      type: 'interval',
      callback,
      delay,
      createdAt: Date.now(),
      description
    };
    
    timersRef.current.set(timerKey, timerInfo);
    
    if (debug) {
      console.log(`🕐 [TIMER] Interval '${timerKey}' criado: ${delay}ms`, description ? `(${description})` : '');
    }
    
    return timerKey;
  }, [debug, maxTimers, clearTimer]);
  
  // 🧹 Função para limpar todos os timers
  const clearAllTimers = useCallback((): number => {
    const timerCount = timersRef.current.size;
    
    for (const [timerKey] of timersRef.current) {
      clearTimer(timerKey);
    }
    
    if (debug && timerCount > 0) {
      console.log(`🕐 [TIMER] Todos os ${timerCount} timers foram limpos`);
    }
    
    return timerCount;
  }, [clearTimer, debug]);
  
  // 📊 Função para obter status dos timers (debugging)
  const getTimerStatus = useCallback(() => {
    const timers: Array<{ key: string; info: Omit<TimerInfo, 'id' | 'callback'> }> = [];
    
    for (const [key, info] of timersRef.current) {
      timers.push({
        key,
        info: {
          type: info.type,
          delay: info.delay,
          createdAt: info.createdAt,
          description: info.description
        }
      });
    }
    
    return {
      count: timersRef.current.size,
      maxTimers,
      timers: timers.sort((a, b) => b.info.createdAt - a.info.createdAt) // Mais recentes primeiro
    };
  }, [maxTimers]);
  
  // 🔍 Função para verificar se um timer existe
  const hasTimer = useCallback((timerKey: string): boolean => {
    return timersRef.current.has(timerKey);
  }, []);
  
  // 🕐 Auto-cleanup no unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      const clearedCount = clearAllTimers();
      
      if (debug && clearedCount > 0) {
        console.log(`🕐 [TIMER] Cleanup no unmount: ${clearedCount} timers limpos`);
      }
    };
  }, [clearAllTimers, debug]);
  
  // 🚨 Aviso se muitos timers estão ativos (possível memory leak)
  useEffect(() => {
    const warningThreshold = Math.floor(maxTimers * 0.8); // 80% do limite
    
    const checkTimerCount = () => {
      const count = timersRef.current.size;
      if (count >= warningThreshold) {
        console.warn(`🕐 [TIMER] AVISO: ${count}/${maxTimers} timers ativos. Possível memory leak!`);
        if (debug) {
          console.table(getTimerStatus().timers);
        }
      }
    };
    
    // Verificar a cada 30 segundos
    const monitorInterval = window.setInterval(checkTimerCount, 30000);
    
    return () => clearInterval(monitorInterval);
  }, [maxTimers, debug, getTimerStatus]);
  
  return {
    // Funções principais
    setTimeout,
    setInterval,
    clearTimer,
    clearAllTimers,
    
    // Utilitários
    hasTimer,
    getTimerStatus,
    
    // Status
    get activeCount() {
      return timersRef.current.size;
    },
    get maxTimers() {
      return maxTimers;
    }
  };
};

export default useTimerManager; 