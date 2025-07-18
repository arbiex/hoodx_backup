import { useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { toast } from 'sonner'

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Tipos
interface XGatePaymentData {
  transactionId: string
  externalId: string
  amount: number
  pixQrCode?: string
  pixCopyPaste?: string
  expiresAt?: string
  status: string
  provider: string
}

interface PaymentTransaction {
  id: string
  transaction_id: string
  amount: number
  status: string
  created_at: string
  expires_at?: string
  xgate_response?: any
}

export function useXGatePayment() {
  const [isLoading, setIsLoading] = useState(false)
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([])
  const [currentTransaction, setCurrentTransaction] = useState<XGatePaymentData | null>(null)

  // Criar novo depósito PIX
  const createPixDeposit = useCallback(async (
    amount: number,
    userId: string,
    description?: string
  ): Promise<XGatePaymentData | null> => {
    try {
      setIsLoading(true)
      
      console.log('💳 Criando depósito PIX via XGATE:', { amount, userId, description })
      
      const response = await fetch('/api/payments/pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount,
          userId,
          description
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao criar depósito PIX')
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Falha ao criar depósito')
      }

      const paymentData: XGatePaymentData = {
        transactionId: data.transactionId,
        externalId: data.externalId,
        amount: data.amount,
        pixQrCode: data.pixQrCode,
        pixCopyPaste: data.pixCopyPaste,
        expiresAt: data.expiresAt,
        status: data.status,
        provider: data.provider
      }

      setCurrentTransaction(paymentData)
      
      // Salvar na lista de transações
      const newTransaction: PaymentTransaction = {
        id: data.transactionId,
        transaction_id: data.transactionId,
        amount: data.amount,
        status: data.status,
        created_at: new Date().toISOString(),
        expires_at: data.expiresAt,
        xgate_response: data
      }
      
      setTransactions(prev => [newTransaction, ...prev])
      
      toast.success('Depósito PIX criado com sucesso!')
      
      return paymentData

    } catch (error) {
      console.error('❌ Erro ao criar depósito PIX:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(`Erro ao criar depósito: ${errorMessage}`)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Verificar status de pagamento
  const checkPaymentStatus = useCallback(async (transactionId: string) => {
    try {
      console.log('🔍 Verificando status do pagamento:', transactionId)
      
      const response = await fetch(`/api/payments/pix?transactionId=${transactionId}`)
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao verificar status')
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Falha ao verificar status')
      }

      // Atualizar transação atual se for a mesma
      if (currentTransaction?.transactionId === transactionId) {
        setCurrentTransaction(prev => prev ? {
          ...prev,
          status: data.status
        } : null)
      }

      // Atualizar lista de transações
      setTransactions(prev => prev.map(tx => 
        tx.transaction_id === transactionId 
          ? { ...tx, status: data.status }
          : tx
      ))

      return {
        status: data.status,
        amount: data.amount,
        confirmedAt: data.confirmedAt,
        expiresAt: data.expiresAt
      }

    } catch (error) {
      console.error('❌ Erro ao verificar status:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(`Erro ao verificar status: ${errorMessage}`)
      return null
    }
  }, [currentTransaction])

  // Buscar transações do usuário
  const fetchUserTransactions = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('pix_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        throw error
      }

      const formattedTransactions: PaymentTransaction[] = data.map(tx => ({
        id: tx.id,
        transaction_id: tx.transaction_id,
        amount: tx.amount,
        status: tx.status,
        created_at: tx.created_at,
        expires_at: tx.expires_at,
        xgate_response: tx.xgate_response
      }))

      setTransactions(formattedTransactions)
      
      return formattedTransactions

    } catch (error) {
      console.error('❌ Erro ao buscar transações:', error)
      toast.error('Erro ao carregar transações')
      return []
    }
  }, [])

  // Monitorar status de pagamento (polling)
  const monitorPaymentStatus = useCallback(async (
    transactionId: string,
    intervalMs: number = 5000,
    maxAttempts: number = 60
  ) => {
    let attempts = 0
    
    const checkStatus = async (): Promise<boolean> => {
      attempts++
      
      if (attempts > maxAttempts) {
        console.log('⏰ Tempo limite para monitoramento atingido')
        return false
      }

      const status = await checkPaymentStatus(transactionId)
      
      if (!status) {
        return false
      }

      // Se foi completado ou falhou, parar o monitoramento
      if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'EXPIRED') {
        console.log('✅ Status final alcançado:', status.status)
        return true
      }

      // Continuar monitorando
      setTimeout(() => checkStatus(), intervalMs)
      return false
    }

    return checkStatus()
  }, [checkPaymentStatus])

  // Limpar transação atual
  const clearCurrentTransaction = useCallback(() => {
    setCurrentTransaction(null)
  }, [])

  return {
    // Estado
    isLoading,
    transactions,
    currentTransaction,
    
    // Funções
    createPixDeposit,
    checkPaymentStatus,
    fetchUserTransactions,
    monitorPaymentStatus,
    clearCurrentTransaction
  }
} 