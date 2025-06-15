'use client'

import { useState, useEffect } from 'react'

export interface UserCredits {
  user_id: string
  available_credits: number
  in_use_credits: number
  total_credits: number
  total_spent: number
  total_earned: number
  last_transaction_at: string | null
}

export interface CreditPackage {
  id: string
  name: string
  description: string
  base_value: number
  price_brl: number
  is_popular: boolean
  icon_name: string
  color_theme: string
  sort_order: number
}

export interface CreditTransaction {
  id: string
  transaction_type: 'purchase' | 'debit' | 'bonus' | 'refund'
  amount: number
  balance_before: number
  balance_after: number
  payment_method: string | null
  status: 'pending' | 'completed' | 'failed' | 'cancelled'
  description: string | null
  package_name: string | null
  created_at: string
}

export interface OperationRecord {
  id: string
  operation_type: 'manual_bet' | 'auto_bet' | 'signal_execution' | 'pattern_bet'
  game_name: string
  game_symbol: string | null
  amount: number
  color_bet: 'red' | 'black' | 'green' | null
  result: 'win' | 'loss' | 'pending' | 'cancelled' | null
  profit_loss: number
  win_amount: number
  multiplier: number
  roi_percentage: number
  description: string | null
  execution_mode: 'manual' | 'automatic' | 'semi_automatic'
  session_id: string | null
  signal_id: string | null
  created_at: string
}

export interface OperationStats {
  total_operations: number
  total_invested: number
  total_winnings: number
  net_profit: number
  win_count: number
  loss_count: number
  pending_count: number
  win_rate: number
  avg_roi: number
  best_win: number
  last_operation_at: string | null
}

export function useCredits() {
  const [credits, setCredits] = useState<UserCredits | null>(null)
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [operations, setOperations] = useState<OperationRecord[]>([])
  const [operationStats, setOperationStats] = useState<OperationStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load user credits
  const loadCredits = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { supabase } = await import('@/lib/supabase')
      
      // Check if user is authenticated first
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (!user || userError) {
        console.log('User not authenticated, skipping credits load')
        setCredits(null)
        setLoading(false)
        return
      }
      
      const { data, error } = await supabase.rpc('get_user_balance')
      
      if (error) {
        console.error('Error loading credits:', error)
        if (error.message?.includes('not authenticated')) {
          setError('Please log in to view your credits')
        } else {
          setError('Failed to load credits')
        }
        return
      }

      if (data && data.length > 0) {
        const creditData = data[0]
        setCredits({
          user_id: creditData.user_id,
          available_credits: creditData.available_balance,
          in_use_credits: creditData.in_use_balance,
          total_credits: creditData.total_balance,
          total_spent: creditData.total_spent,
          total_earned: creditData.total_earned,
          last_transaction_at: creditData.last_transaction_at
        })
      } else {
        // If no data returned, the RPC function should have created the record
        setCredits({
          user_id: user.id,
          available_credits: 0,
          in_use_credits: 0,
          total_credits: 0,
          total_spent: 0,
          total_earned: 0,
          last_transaction_at: null
        })
      }
    } catch (err) {
      console.error('Error loading credits:', err)
      setError('Failed to load credits')
    } finally {
      setLoading(false)
    }
  }

  // Load available packages
  const loadPackages = async () => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase.rpc('get_available_packages')
      
      if (error) {
        console.error('Error loading packages:', error)
        return
      }

      setPackages(data || [])
    } catch (err) {
      console.error('Error loading packages:', err)
    }
  }

  // Load transaction history
  const loadTransactions = async (limit = 20, offset = 0) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      // Check if user is authenticated first
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setTransactions([])
        return
      }
      
      const { data, error } = await supabase.rpc('get_user_credit_history', {
        p_limit: limit,
        p_offset: offset
      })
      
      if (error) {
        console.error('Error loading transactions:', error)
        return
      }

      setTransactions(data || [])
    } catch (err) {
      console.error('Error loading transactions:', err)
    }
  }

  // Load operations history - DESABILITADO (tabelas removidas)
  const loadOperations = async (limit = 20, offset = 0) => {
    try {
      // Tabelas operations_history, betting_sessions e betting_history foram removidas
      // Sistema agora usa controle em memória
      console.log('ℹ️ [CREDITS] loadOperations desabilitado - usando sistema simplificado')
      setOperations([])
      return
      
      /* CÓDIGO ORIGINAL COMENTADO
      const { supabase } = await import('@/lib/supabase')
      // Check if user is authenticated first
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setOperations([])
        return
      }
      
      const { data, error } = await supabase.rpc('get_operations_history', {
        p_limit: limit,
        p_offset: offset
      })
      
      if (error) {
        console.error('Error loading operations:', error)
        return
      }

      setOperations(data || [])
      */
    } catch (err) {
      console.log('ℹ️ [CREDITS] loadOperations desabilitado:', err)
      setOperations([])
    }
  }

  // Load operation statistics - DESABILITADO (tabelas removidas)
  const loadOperationStats = async () => {
    try {
      // Tabelas operations_history, betting_sessions e betting_history foram removidas
      // Sistema agora usa controle em memória
      console.log('ℹ️ [CREDITS] loadOperationStats desabilitado - usando sistema simplificado')
      setOperationStats(null)
      return
      
      /* CÓDIGO ORIGINAL COMENTADO
      const { supabase } = await import('@/lib/supabase')
      // Check if user is authenticated first
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setOperationStats(null)
        return
      }
      
      const { data, error } = await supabase.rpc('get_user_operation_stats')
      
      if (error) {
        console.error('Error loading operation stats:', error)
        return
      }

      setOperationStats(data)
      */
    } catch (err) {
      console.log('ℹ️ [CREDITS] loadOperationStats desabilitado:', err)
      setOperationStats(null)
    }
  }

  // Purchase credits via PIX
  const purchaseCredits = async (
    packageId: string,
    pixKey: string = ''
  ) => {
    try {
      setLoading(true)
      setError(null)

      const paymentReference = `PIX_${pixKey || 'GENERATED'}_${Date.now()}`
      
      // Use the new function with commission processing
      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase.rpc('purchase_credits_with_commission', {
        p_user_id: (await supabase.auth.getUser()).data.user?.id,
        p_package_id: packageId,
        p_payment_method: 'pix',
        p_payment_reference: paymentReference
      })

      if (error) {
        console.error('Error purchasing credits:', error)
        setError('Failed to purchase credits')
        return { success: false, error: error.message }
      }

      if (data?.success) {
        // Reload credits after successful purchase
        await loadCredits()
        await loadTransactions()
        
        // Dispatch commission update event for network hook
        window.dispatchEvent(new CustomEvent('commission-updated'))
        
        return { success: true, data }
      } else {
        setError(data?.message || 'Purchase failed')
        return { success: false, error: data?.message }
      }
    } catch (err) {
      console.error('Error purchasing credits:', err)
      setError('Failed to purchase credits')
      return { success: false, error: 'Internal error' }
    } finally {
      setLoading(false)
    }
  }

  // Debit credits
  const debitCredits = async (
    amount: number,
    description: string = 'Credit debit',
    sessionId?: string,
    metadata: any = {}
  ) => {
    try {
      setLoading(true)
      setError(null)

      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase.rpc('debit_credits', {
        p_amount: amount,
        p_description: description,
        p_session_id: sessionId,
        p_metadata: metadata
      })

      if (error) {
        console.error('Error debiting credits:', error)
        setError('Failed to debit credits')
        return { success: false, error: error.message }
      }

      if (data?.success) {
        // Reload credits after successful debit
        await loadCredits()
        return { success: true, data }
      } else {
        setError(data?.error || 'Debit failed')
        return { success: false, error: data?.error }
      }
    } catch (err) {
      console.error('Error debiting credits:', err)
      setError('Failed to debit credits')
      return { success: false, error: 'Internal error' }
    } finally {
      setLoading(false)
    }
  }

  // Save operation
  const saveOperation = async (operation: {
    operation_type: string
    game_name: string
    game_symbol: string
    amount: number
    color_bet?: string
    description?: string
    metadata?: any
    execution_mode?: string
    session_id?: string
    signal_id?: string
  }) => {
    try {
      setLoading(true)
      setError(null)

      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase.rpc('save_operation', {
        p_operation_type: operation.operation_type,
        p_game_name: operation.game_name,
        p_game_symbol: operation.game_symbol,
        p_amount: operation.amount,
        p_color_bet: operation.color_bet,
        p_description: operation.description,
        p_metadata: operation.metadata || {},
        p_execution_mode: operation.execution_mode || 'manual',
        p_session_id: operation.session_id,
        p_signal_id: operation.signal_id
      })

      if (error) {
        console.error('Error saving operation:', error)
        setError('Failed to save operation')
        return { success: false, error: error.message }
      }

      if (data?.success) {
        // Reload data after successful operation
        await loadCredits()
        // await loadOperations() // DESABILITADO - tabelas removidas
        // await loadOperationStats() // DESABILITADO - tabelas removidas
        return { success: true, data }
      } else {
        setError(data?.error || 'Operation failed')
        return { success: false, error: data?.error }
      }
    } catch (err) {
      console.error('Error saving operation:', err)
      setError('Failed to save operation')
      return { success: false, error: 'Internal error' }
    } finally {
      setLoading(false)
    }
  }

  // Update operation result
  const updateOperationResult = async (
    operationId: string,
    result: 'win' | 'loss' | 'cancelled',
    winAmount: number = 0,
    multiplier: number = 1
  ) => {
    try {
      setLoading(true)
      setError(null)

      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase.rpc('update_operation_result', {
        p_operation_id: operationId,
        p_result: result,
        p_win_amount: winAmount,
        p_multiplier: multiplier
      })

      if (error) {
        console.error('Error updating operation:', error)
        setError('Failed to update operation')
        return { success: false, error: error.message }
      }

      if (data?.success) {
        // Reload data after successful update
        await loadCredits()
        // await loadOperations() // DESABILITADO - tabelas removidas
        // await loadOperationStats() // DESABILITADO - tabelas removidas
        return { success: true, data }
      } else {
        setError(data?.error || 'Update failed')
        return { success: false, error: data?.error }
      }
    } catch (err) {
      console.error('Error updating operation:', err)
      setError('Failed to update operation')
      return { success: false, error: 'Internal error' }
    } finally {
      setLoading(false)
    }
  }

  // Validate sufficient credits
  const validateCredits = async (requiredAmount: number) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase.rpc('validate_sufficient_balance', {
        p_required_amount: requiredAmount
      })

      if (error) {
        console.error('Error validating credits:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (err) {
      console.error('Error validating credits:', err)
      return { success: false, error: 'Internal error' }
    }
  }

  // Initialize data on mount
  useEffect(() => {
    loadCredits()
    loadPackages()
    loadTransactions()
    // loadOperations() // DESABILITADO - tabelas removidas
    // loadOperationStats() // DESABILITADO - tabelas removidas

    // Listen for credit updates from other components
    const handleCreditsUpdate = () => {
      loadCredits()
      loadTransactions()
      // loadOperationStats() // DESABILITADO - tabelas removidas
    }

    window.addEventListener('credits-updated', handleCreditsUpdate)

    return () => {
      window.removeEventListener('credits-updated', handleCreditsUpdate)
    }
  }, [])

  return {
    // State
    credits,
    packages,
    transactions,
    operations,
    operationStats,
    loading,
    error,

    // Actions
    loadCredits,
    loadPackages,
    loadTransactions,
    loadOperations,
    loadOperationStats,
    purchaseCredits,
    debitCredits,
    saveOperation,
    updateOperationResult,
    validateCredits,

    // Helpers
    refresh: () => {
      loadCredits()
      loadTransactions()
      // loadOperations() // DESABILITADO - tabelas removidas
      // loadOperationStats() // DESABILITADO - tabelas removidas
    }
  }
} 