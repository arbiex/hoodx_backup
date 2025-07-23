import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * 🔄 Hook Customizado para API BMGBR3
 * 
 * Centraliza todas as chamadas de API, eliminando duplicação de código
 * e fornecendo tratamento de erro consistente.
 * 
 * ✅ Benefícios:
 * - Elimina 20+ chamadas fetch duplicadas
 * - Tratamento de erro centralizado
 * - Type safety com TypeScript
 * - Reutilização consistente
 */

// Tipos TypeScript para as respostas da API
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  // Propriedades opcionais específicas da API BMGBR3
  resetToM1?: boolean;
  logs?: any[];
  operationActive?: boolean;
  connectionStatus?: any;
  [key: string]: any; // Para propriedades adicionais específicas
}

interface MainApiData {
  userId: string;
  action: string;
  [key: string]: any; // Para parâmetros adicionais específicos da ação
}

interface InsightsApiData {
  user_id: string;
  action: 'start' | 'stop' | 'get';
}

// Endpoints da API
const API_ENDPOINTS = {
  MAIN: '/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr',
  INSIGHTS: '/api/bmgbr3/insights-shared' // 🔄 NOVO: Endpoint compartilhado
} as const;

export const useBmgbr3Api = () => {
  // 🔄 Função base para chamadas HTTP
  const makeApiCall = useCallback(async <T = any>(
    endpoint: string,
    data: any,
    options?: {
      timeout?: number;
      retries?: number;
    }
  ): Promise<ApiResponse<T>> => {
    const { timeout = 30000, retries = 0 } = options || {};
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Controller para timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Erro desconhecido');
        
        // Se não é o último retry, aguardar antes de tentar novamente
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    
    // Se chegou aqui, todas as tentativas falharam
    return {
      success: false,
      error: lastError?.message || 'Erro na requisição'
    };
  }, []);
  
  // 🔄 Função para obter userId automaticamente
  const getUserId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  }, []);
  
  // 🎯 API Principal - Todas as ações da API principal
  const mainApi = useCallback(async <T = any>(
    action: string,
    additionalData: Record<string, any> = {},
    options?: { timeout?: number; retries?: number }
  ): Promise<ApiResponse<T>> => {
    const userId = await getUserId();
    if (!userId) {
      return {
        success: false,
        error: 'Usuário não autenticado'
      };
    }
    
    const data: MainApiData = {
      userId,
      action,
      ...additionalData
    };
    
    return makeApiCall<T>(API_ENDPOINTS.MAIN, data, options);
  }, [makeApiCall, getUserId]);
  
  // 🔥 API Insights - Todas as ações da API de insights
  const insightsApi = useCallback(async <T = any>(
    action: 'start' | 'stop' | 'get',
    options?: { 
      timeout?: number; 
      retries?: number;
      usePollingPrefix?: boolean; // Para usar polling_ no user_id
    }
  ): Promise<ApiResponse<T>> => {
    const userId = await getUserId();
    if (!userId) {
      return {
        success: false,
        error: 'Usuário não autenticado'
      };
    }
    
    const { usePollingPrefix = false, ...fetchOptions } = options || {};
    const user_id = usePollingPrefix ? `polling_${userId}` : userId;
    
    const data: InsightsApiData = {
      user_id,
      action
    };
    
    return makeApiCall<T>(API_ENDPOINTS.INSIGHTS, data, fetchOptions);
  }, [makeApiCall, getUserId]);
  
  // 🚀 Métodos específicos para ações comuns (mais conveniente)
  const operations = {
    // 🔧 Operações principais
    updateStakeMultiplier: (multiplier: number) => 
      mainApi('update-strategy', { stakeMultiplier: multiplier }),
    
    connect: (data: any) => 
      mainApi('connect', data),
    
    startOperation: () => 
      mainApi('start-operation'),
    
    stopOperation: () => 
      mainApi('stop-operation'),
    
    getWebSocketLogs: () => 
      mainApi('get-websocket-logs'),
    
    getOperationReport: () => 
      mainApi('get-operation-report'),
    
    resetOperationReport: () => 
      mainApi('reset-operation-report'),
    
    getConnectionStatus: () => 
      mainApi('get-connection-status'),
    
    updateBetType: (betType: string) => 
      mainApi('update-bet-type', { m4DirectBetType: betType }),
    
    activateRealMode: (data: any) => 
      mainApi('activate-real-mode', data),
    
    // 🔥 Insights operations
    startInsights: () => 
      insightsApi('start', { usePollingPrefix: true }),
    
    stopInsights: () => 
      insightsApi('stop', { usePollingPrefix: true }),
    
    getInsights: () => 
      insightsApi('get', { usePollingPrefix: true, timeout: 5000 }),
    
    // 🧹 Memory management operations
    getMemoryStats: () => 
      mainApi('get-memory-stats'),
    
    cleanupMemory: (type: 'normal' | 'emergency' | 'inactive-users' | 'user-specific' = 'normal', options?: { hoursThreshold?: number, fullCleanup?: boolean }) =>
      mainApi('cleanup-memory', { type, ...options }),
    
    // 📊 Utilitários para monitoramento de memória
    async getMemoryReport() {
      const result = await mainApi('get-memory-stats');
      if (result.success && result.data) {
        const stats = result.data;
        return {
          summary: `${stats.totalUsers} usuários ativos, ${stats.totalArrayItems} items em arrays, Score: ${stats.memoryScore}/100`,
          isCritical: stats.memoryScore >= 80,
          isWarning: stats.memoryScore >= 60,
          details: stats,
          recommendations: stats.memoryScore >= 80 
            ? ['Executar limpeza de emergência', 'Verificar usuários inativos', 'Reduzir limites de arrays']
            : stats.memoryScore >= 60 
            ? ['Considerar limpeza preventiva', 'Monitorar crescimento de arrays']
            : ['Sistema saudável', 'Continuar monitoramento normal']
        };
      }
      return null;
    }
  };
  
  return {
    // Métodos base
    mainApi,
    insightsApi,
    
    // Métodos específicos (mais convenientes)
    ...operations,
    
    // Utilitários
    getUserId
  };
};

export default useBmgbr3Api; 