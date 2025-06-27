'use client';

import { useState, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface OperationData {
  totalBets: number;
  netProfit: number;
  creditsConsumed: number;
}

interface ActiveOperation {
  id: string;
  total_bets: number;
  net_profit: number;
  credits_consumed: number;
  started_at: string;
  status: string;
  duration_seconds: number;
}

export const useSimpleOperationsManager = () => {
  const [activeOperation, setActiveOperation] = useState<ActiveOperation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Ref para controlar se há uma operação ativa
  const operationActiveRef = useRef(false);

  // Função para iniciar uma nova operação
  const startOperation = useCallback(async (initialData?: Partial<OperationData>) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('manage_simple_operation', {
        p_action: 'start',
        p_total_bets: initialData?.totalBets || 0,
        p_net_profit: initialData?.netProfit || 0,
        p_credits_consumed: initialData?.creditsConsumed || 0
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      if (!data.success) {
        throw new Error(data.error);
      }

      operationActiveRef.current = true;
      
      // Buscar a operação criada
      await getActiveOperation();

      return {
        success: true,
        operationId: data.operation_id,
        message: data.message
      };

    } catch (err: any) {
      const errorMsg = err.message || 'Erro ao iniciar operação';
      setError(errorMsg);
      return {
        success: false,
        error: errorMsg
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Função para atualizar operação ativa
  const updateOperation = useCallback(async (data: Partial<OperationData>) => {
    try {
      setError(null);

      console.log('💾 Hook: Atualizando operação com dados:', data);
      console.log('💾 Hook: Operação ativa atual:', activeOperation);

      const { data: result, error: rpcError } = await supabase.rpc('manage_simple_operation', {
        p_action: 'update',
        p_total_bets: data.totalBets,
        p_net_profit: data.netProfit,
        p_credits_consumed: data.creditsConsumed
      });

      if (rpcError) {
        console.error('❌ Hook: Erro RPC:', rpcError);
        throw new Error(rpcError.message);
      }

      if (!result.success) {
        console.error('❌ Hook: Falha na atualização:', result.error);
        throw new Error(result.error);
      }

      console.log('✅ Hook: Operação atualizada com sucesso:', result);

      // Atualizar estado local se temos operação ativa
      if (activeOperation) {
        const updatedOperation = {
          ...activeOperation,
          total_bets: data.totalBets ?? activeOperation.total_bets,
          net_profit: data.netProfit ?? activeOperation.net_profit,
          credits_consumed: data.creditsConsumed ?? activeOperation.credits_consumed
        };
        
        console.log('🔄 Hook: Atualizando estado local:', updatedOperation);
        setActiveOperation(updatedOperation);
      }

      return {
        success: true,
        message: result.message
      };

    } catch (err: any) {
      const errorMsg = err.message || 'Erro ao atualizar operação';
      console.error('❌ Hook: Erro geral:', errorMsg);
      setError(errorMsg);
      return {
        success: false,
        error: errorMsg
      };
    }
  }, [activeOperation]);

  // Função para finalizar operação ativa
  const endOperation = useCallback(async (finalData?: Partial<OperationData>) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('manage_simple_operation', {
        p_action: 'end',
        p_total_bets: finalData?.totalBets,
        p_net_profit: finalData?.netProfit,
        p_credits_consumed: finalData?.creditsConsumed
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      if (!data.success) {
        throw new Error(data.error);
      }

      operationActiveRef.current = false;
      setActiveOperation(null);

      return {
        success: true,
        operationId: data.operation_id,
        durationSeconds: data.duration_seconds,
        message: data.message
      };

    } catch (err: any) {
      const errorMsg = err.message || 'Erro ao finalizar operação';
      setError(errorMsg);
      return {
        success: false,
        error: errorMsg
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Função para buscar operação ativa
  const getActiveOperation = useCallback(async () => {
    try {
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('manage_simple_operation', {
        p_action: 'get_active'
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      if (data.success && data.operation) {
        setActiveOperation(data.operation);
        operationActiveRef.current = true;
        return {
          success: true,
          operation: data.operation
        };
      } else {
        setActiveOperation(null);
        operationActiveRef.current = false;
        return {
          success: false,
          error: data.error || 'Nenhuma operação ativa'
        };
      }

    } catch (err: any) {
      const errorMsg = err.message || 'Erro ao buscar operação ativa';
      setError(errorMsg);
      setActiveOperation(null);
      operationActiveRef.current = false;
      return {
        success: false,
        error: errorMsg
      };
    }
  }, []);

  // Função helper para verificar se há operação ativa
  const hasActiveOperation = useCallback(() => {
    return operationActiveRef.current && activeOperation !== null;
  }, [activeOperation]);

  // Função para limpar erro
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Estado
    activeOperation,
    isLoading,
    error,
    hasActiveOperation,

    // Ações
    startOperation,
    updateOperation,
    endOperation,
    getActiveOperation,
    clearError,

    // Dados computados
    isActive: operationActiveRef.current,
    operationDuration: activeOperation?.duration_seconds || 0,
    operationStartTime: activeOperation?.started_at || null
  };
}; 