import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Tipos
interface FxaTransaction {
  id: string
  user_id: string
  transaction_type: 'credit' | 'debit'
  amount: number
  balance_before: number
  balance_after: number
  description?: string
  payment_reference?: string
  payment_method?: string
  status?: 'pending' | 'completed' | 'failed' | 'cancelled'
  metadata?: any
  created_at: string
  updated_at: string
}

interface FxaBalance {
  user_id: string
  current_balance: number
  total_transactions: number
  last_transaction_at?: string
  first_transaction_at?: string
}

export function useFxaTokens(userId?: string) {
  const [balance, setBalance] = useState<number>(0)
  const [transactions, setTransactions] = useState<FxaTransaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Buscar saldo atual do usuário
  const fetchBalance = useCallback(async (targetUserId?: string) => {
    if (!targetUserId && !userId) return

    const userIdToUse = targetUserId || userId
    try {
      setIsLoading(true)
      setError(null)

      // Buscar da view user_fxa_balances
      const { data, error } = await supabase
        .from('user_fxa_balances')
        .select('current_balance')
        .eq('user_id', userIdToUse)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error
      }

      const currentBalance = data?.current_balance || 0
      setBalance(Number(currentBalance))
      
      return Number(currentBalance)

    } catch (err) {
      console.error('❌ Erro ao buscar saldo FXA:', err)
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return 0
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  // Buscar histórico de transações
  const fetchTransactions = useCallback(async (limit: number = 50, targetUserId?: string) => {
    if (!targetUserId && !userId) return []

    const userIdToUse = targetUserId || userId
    try {
      setIsLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('fxa_token_transactions')
        .select('*')
        .eq('user_id', userIdToUse)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw error
      }

      const formattedTransactions: FxaTransaction[] = data.map(tx => ({
        id: tx.id,
        user_id: tx.user_id,
        transaction_type: tx.transaction_type,
        amount: Number(tx.amount),
        balance_before: Number(tx.balance_before),
        balance_after: Number(tx.balance_after),
        description: tx.description,
        payment_reference: tx.payment_reference,
        metadata: tx.metadata,
        created_at: tx.created_at,
        updated_at: tx.updated_at
      }))

      setTransactions(formattedTransactions)
      return formattedTransactions

    } catch (err) {
      console.error('❌ Erro ao buscar transações FXA:', err)
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      return []
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  // Buscar dados completos (saldo + transações)
  const fetchAll = useCallback(async (targetUserId?: string) => {
    const userIdToUse = targetUserId || userId
    if (!userIdToUse) return

    try {
      setIsLoading(true)
      const [currentBalance, recentTransactions] = await Promise.all([
        fetchBalance(userIdToUse),
        fetchTransactions(50, userIdToUse)
      ])

      return {
        balance: currentBalance,
        transactions: recentTransactions
      }
    } finally {
      setIsLoading(false)
    }
  }, [userId, fetchBalance, fetchTransactions])

  // Recarregar dados
  const refresh = useCallback(async () => {
    if (userId) {
      await fetchAll(userId)
    }
  }, [userId, fetchAll])

  // Adicionar tokens via função do Supabase
  const addTokens = useCallback(async (
    amount: number,
    description?: string,
    paymentReference?: string,
    metadata?: any
  ) => {
    if (!userId) {
      throw new Error('User ID is required')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Chamar função do Supabase para adicionar tokens
      const { data, error } = await supabase.rpc('add_fxa_tokens', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description,
        p_payment_reference: paymentReference,
        p_metadata: metadata || {}
      })

      if (error) {
        throw error
      }

      // Atualizar dados locais
      await refresh()

      return data // ID da transação criada

    } catch (err) {
      console.error('❌ Erro ao adicionar tokens FXA:', err)
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [userId, refresh])

  // Carregar dados iniciais quando o hook é montado
  useEffect(() => {
    if (userId) {
      fetchAll(userId)
    }
  }, [userId, fetchAll])

  return {
    // Estado
    balance,
    transactions,
    isLoading,
    error,

    // Funções
    fetchBalance,
    fetchTransactions,
    fetchAll,
    refresh,
    addTokens
  }
} 