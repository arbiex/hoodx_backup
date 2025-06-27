'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface BettingData {
  totalBets: number;
  netProfit: number;
}

interface LogResponse {
  success: boolean;
  logId?: string;
  error?: string;
}

export const useBettingLogs = () => {
  const [isLogging, setIsLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLogTime, setLastLogTime] = useState<Date | null>(null);

  // 🎯 NOVO: Gerencia uma operação única (cria/atualiza)
  const logCurrentData = async (data: BettingData): Promise<LogResponse> => {
    try {
      setIsLogging(true);
      setError(null);

      console.log('📝 Hook: Gerenciando operação única...', data);

      const { data: result, error: rpcError } = await supabase.rpc('manage_betting_operation', {
        p_total_bets: data.totalBets,
        p_net_profit: data.netProfit
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      setLastLogTime(new Date());
      console.log(`✅ Operação ${result.action}:`, result);

      return {
        success: true,
        logId: result.operation_id
      };

    } catch (err: any) {
      const errorMsg = err.message || 'Erro ao gerenciar operação';
      console.error('❌ Erro:', errorMsg);
      setError(errorMsg);
      
      return {
        success: false,
        error: errorMsg
      };
    } finally {
      setIsLogging(false);
    }
  };

  // 🏁 NOVO: Finalizar operação ativa
  const finishOperation = async () => {
    try {
      const { data: result, error: rpcError } = await supabase.rpc('finish_betting_operation');
      
      if (rpcError) {
        throw new Error(rpcError.message);
      }
      
      console.log('🏁 Operação finalizada:', result);
      return result;
    } catch (err: any) {
      console.error('❌ Erro ao finalizar:', err.message);
      return { success: false, error: err.message };
    }
  };

  // Buscar logs recentes (opcional)
  const getRecentLogs = async (limit: number = 10) => {
    try {
      // Buscar usuário atual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('betting_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return {
        success: true,
        logs: data || []
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message
      };
    }
  };

  // Limpar erro
  const clearError = () => setError(null);

  return {
    // Estado
    isLogging,
    error,
    lastLogTime,

    // Ações
    logCurrentData,
    finishOperation,
    getRecentLogs,
    clearError,

    // Status
    hasRecentLog: lastLogTime !== null
  };
}; 