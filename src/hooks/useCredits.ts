'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Tipos
interface CreditTransaction {
  id: string
  user_id: string
  transaction_type: 'credit' | 'debit'
  amount: number
  amount_brl?: number
  description?: string
  payment_reference?: string
  payment_method?: string
  status?: 'pending' | 'completed' | 'failed' | 'cancelled'
  metadata?: any
  created_at: string
  updated_at: string
}

interface CreditBalance {
  user_id: string
  current_balance: number
  total_transactions: number
  last_transaction_at?: string
  first_transaction_at?: string
}

export function useCredits(userId?: string) {
  const [balance, setBalance] = useState<number>(0)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Buscar saldo atual do usuário
  const fetchBalance = useCallback(async (targetUserId?: string) => {
    if (!targetUserId && !userId) return

    const userIdToUse = targetUserId || userId
    try {
      setIsLoading(true)
      setError(null)

      // Buscar da view user_credit_balances
      const { data, error } = await supabase
        .from('user_credit_balances')
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
      console.error('❌ Erro ao buscar saldo de créditos:', err)
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
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userIdToUse)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw error
      }

      const formattedTransactions: CreditTransaction[] = data.map(tx => ({
        id: tx.id,
        user_id: tx.user_id,
        transaction_type: tx.transaction_type,
        amount: Number(tx.amount),
        amount_brl: tx.amount_brl ? Number(tx.amount_brl) : undefined,
        description: tx.description,
        payment_reference: tx.payment_reference,
        payment_method: tx.payment_method,
        status: tx.status,
        metadata: tx.metadata,
        created_at: tx.created_at,
        updated_at: tx.updated_at
      }))

      setTransactions(formattedTransactions)
      return formattedTransactions

    } catch (err) {
      console.error('❌ Erro ao buscar transações de créditos:', err)
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

  // Adicionar créditos via função do Supabase
  const addCredits = useCallback(async (
    amount: number,
    description?: string,
    paymentReference?: string,
    amountBrl?: number,
    metadata?: any
  ) => {
    if (!userId) {
      throw new Error('User ID is required')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Chamar função do Supabase para adicionar créditos
      const { data, error } = await supabase.rpc('add_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description,
        p_payment_reference: paymentReference,
        p_amount_brl: amountBrl,
        p_metadata: metadata || {}
      })

      if (error) {
        throw error
      }

      // Atualizar dados locais
      await refresh()

      return data // ID da transação criada

    } catch (err) {
      console.error('❌ Erro ao adicionar créditos:', err)
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [userId, refresh])

  // Debitar créditos via função do Supabase
  const debitCredits = useCallback(async (
    amount: number,
    description?: string,
    metadata?: any
  ) => {
    if (!userId) {
      throw new Error('User ID is required')
    }

    try {
      setIsLoading(true)
      setError(null)

      // Chamar função do Supabase para debitar créditos
      const { data, error } = await supabase.rpc('debit_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_description: description,
        p_metadata: metadata || {}
      })

      if (error) {
        throw error
      }

      // Atualizar dados locais
      await refresh()

      return data // ID da transação criada

    } catch (err) {
      console.error('❌ Erro ao debitar créditos:', err)
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
    addCredits,
    debitCredits
  }
} 