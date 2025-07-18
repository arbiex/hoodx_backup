import { useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { toast } from 'sonner'

// Cache local para transações que já foram finalizadas (evita verificações desnecessárias)
const processedTransactionsCache = new Set<string>()

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
      // ✅ VERIFICAÇÃO CACHE LOCAL - Se já foi processada, não verificar novamente
      if (processedTransactionsCache.has(transactionId)) {
        console.log('🚫 Transação já finalizada no cache local, pulando verificação:', transactionId)
        return {
          status: 'completed',
          transactionId,
          message: 'Transação já processada (cache local)',
          amount: 0,
          confirmedAt: null,
          expiresAt: null,
          shouldStopChecking: true
        }
      }

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

      console.log('📊 Status recebido:', data.status)

      // ✅ Se deve parar verificações OU status é completed, adicionar ao cache
      if (data.shouldStopChecking || data.status === 'completed' || data.status === 'COMPLETED') {
        console.log('🔒 Adicionando transação ao cache de finalizadas:', transactionId)
        processedTransactionsCache.add(transactionId)
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
        transaction: data.transaction,
        tokensAdded: data.tokensAdded,
        message: data.message,
        amount: data.transaction?.amount || 0,
        confirmedAt: data.transaction?.updated_at,
        expiresAt: data.expiresAt,
        shouldStopChecking: data.shouldStopChecking || false // 🛑 Campo para parar verificações
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
    intervalMs: number = 1000,  // Mudando para 1 segundo
    maxAttempts: number = 300   // 5 minutos = 300 tentativas
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
        console.log('❌ Falha ao verificar status, tentando novamente...')
        setTimeout(() => checkStatus(), intervalMs)
        return false
      }

      console.log(`🔄 Tentativa ${attempts}: Status = ${status.status}`)

      // Se foi completado, processar sucesso
      if (status.status === 'completed' || status.status === 'COMPLETED') {
        console.log('✅ Pagamento confirmado! Parando monitoramento.')
        return true
      }

      // Se falhou ou expirou, parar o monitoramento
      if (status.status === 'failed' || status.status === 'FAILED' || 
          status.status === 'expired' || status.status === 'EXPIRED' ||
          status.status === 'cancelled' || status.status === 'CANCELLED') {
        console.log('❌ Status final negativo alcançado:', status.status)
        return false
      }

      // Status ainda pendente, continuar monitorando
      setTimeout(() => checkStatus(), intervalMs)
      return false
    }

    return checkStatus()
  }, [checkPaymentStatus])

  // Limpar transação atual
  const clearCurrentTransaction = useCallback(() => {
    setCurrentTransaction(null)
  }, [])

  // Limpar cache de transação específica (para casos especiais)
  const clearTransactionCache = useCallback((transactionId: string) => {
    console.log('🗑️ Removendo transação do cache:', transactionId)
    processedTransactionsCache.delete(transactionId)
  }, [])

  // Verificar se transação está no cache
  const isTransactionCached = useCallback((transactionId: string) => {
    return processedTransactionsCache.has(transactionId)
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
    clearCurrentTransaction,
    clearTransactionCache,
    isTransactionCached
  }
} 