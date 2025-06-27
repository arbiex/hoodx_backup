import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface SimpleOperation {
  id: string;
  total_bets: number;
  net_profit: number;
  credits_consumed: number;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'completed' | 'stopped';
  duration_minutes: number;
  credit_transaction_id?: string | null;
}

export function useSimpleOperationsHistory() {
  const [operations, setOperations] = useState<SimpleOperation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null);

  // Buscar histórico de operações
  const fetchOperationsHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase.rpc('get_simple_operations_history', {
        p_limit: 20
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        const operationsData = data.data || [];
        setOperations(operationsData);
        
        // Verificar se há operação ativa
        const activeOp = operationsData.find((op: SimpleOperation) => op.status === 'active');
        setActiveOperationId(activeOp?.id || null);
      } else {
        throw new Error(data?.error || 'Erro ao buscar histórico');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Iniciar nova operação
  const startOperation = useCallback(async (creditsConsumed: number = 0) => {
    try {
      setError(null);

      const { data, error } = await supabase.rpc('start_simple_operation', {
        p_credits_consumed: creditsConsumed
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        setActiveOperationId(data.operation_id);
        await fetchOperationsHistory(); // Atualizar lista
        return { success: true, operationId: data.operation_id };
      } else {
        throw new Error(data?.error || 'Erro ao iniciar operação');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchOperationsHistory]);

  // Finalizar operação
  const endOperation = useCallback(async (status: 'completed' | 'stopped' = 'completed') => {
    try {
      setError(null);

      // Verificar se há operação ativa para finalizar
      if (!activeOperationId) {
        return { success: true, message: 'Nenhuma operação ativa para finalizar' };
      }

      const { data, error } = await supabase.rpc('end_simple_operation', {
        p_status: status
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        setActiveOperationId(null);
        await fetchOperationsHistory(); // Atualizar lista
        return { success: true };
      } else {
        throw new Error(data?.error || 'Erro ao finalizar operação');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchOperationsHistory, activeOperationId]);

  // Atualizar estatísticas da operação ativa
  const updateOperationStats = useCallback(async (totalBets?: number, netProfit?: number, creditsConsumed?: number) => {
    try {
      setError(null);

      const { data, error } = await supabase.rpc('update_simple_operation_stats', {
        p_total_bets: totalBets,
        p_net_profit: netProfit,
        p_credits_consumed: creditsConsumed
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        await fetchOperationsHistory(); // Atualizar lista para refletir mudanças
        return { success: true };
      } else {
        throw new Error(data?.error || 'Erro ao atualizar estatísticas');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [fetchOperationsHistory]);

  // Verificar se há operação ativa
  const hasActiveOperation = useCallback(() => {
    return activeOperationId !== null;
  }, [activeOperationId]);

  // Obter operação ativa
  const getActiveOperation = useCallback(() => {
    return operations.find(op => op.status === 'active') || null;
  }, [operations]);

  return {
    operations,
    isLoading,
    error,
    activeOperationId,
    actions: {
      fetchOperationsHistory,
      startOperation,
      endOperation,
      updateOperationStats,
      hasActiveOperation,
      getActiveOperation
    }
  };
} 