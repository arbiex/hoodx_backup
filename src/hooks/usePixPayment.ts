'use client'

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface PixPaymentData {
  transactionId: string
  externalId: string
  amount: number
  pixQrCode?: string
  pixCopyPaste?: string
  expiresAt?: string
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED'
}

interface PixPaymentError {
  message: string
  code?: string
}

// Configurações da EzzeBank
const EZZEBANK_CONFIG = {
  baseUrl: process.env.NODE_ENV === 'production' 
    ? 'https://api.ezzebank.com' 
    : 'https://api-staging.ezzebank.com'
}

export function usePixPayment() {
  const [loading, setLoading] = useState(false)
  const [paymentData, setPaymentData] = useState<PixPaymentData | null>(null)
  const [error, setError] = useState<PixPaymentError | null>(null)

  // Função para criar cobrança PIX
  const createPixPayment = useCallback(async (amount: number, description: string = 'Compra de créditos HoodX') => {
    setLoading(true)
    setError(null)
    
    try {
      // Primeiro, criar a transação no banco via RPC
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('create_pix_payment', {
          p_amount: amount,
          p_description: description
        })

      if (rpcError) {
        throw new Error(rpcError.message)
      }

      const { transaction_id, external_id } = rpcResult

      // Agora, criar a cobrança na EzzeBank via API route
      const response = await fetch('/api/payments/pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          description,
          externalId: external_id
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao criar cobrança PIX')
      }

      const { data: ezzeBankData } = await response.json()

      // Atualizar transação no banco com dados da EzzeBank
      const { error: updateError } = await supabase
        .from('pix_transactions')
        .update({
          raw_data: ezzeBankData,
          updated_at: new Date().toISOString()
        })
        .eq('transaction_id', transaction_id)

      if (updateError) {
        console.error('Erro ao atualizar transação:', updateError)
      }

      const pixData: PixPaymentData = {
        transactionId: transaction_id,
        externalId: external_id,
        amount,
        pixQrCode: ezzeBankData.pixQrCode,
        pixCopyPaste: ezzeBankData.pixCopyPaste,
        expiresAt: ezzeBankData.expiresAt,
        status: 'PENDING'
      }

      setPaymentData(pixData)
      toast.success('Cobrança PIX criada com sucesso!')
      
      return pixData

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      setError({ message: errorMessage })
      toast.error(`Erro ao criar PIX: ${errorMessage}`)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  // Função para verificar status do pagamento
  const checkPaymentStatus = useCallback(async (transactionId: string) => {
    try {
      // Verificar no banco via RPC
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('get_pix_payment_status', {
          p_transaction_id: transactionId
        })

      if (rpcError) {
        throw new Error(rpcError.message)
      }

      const updatedData: PixPaymentData = {
        transactionId: rpcResult.transaction_id,
        externalId: rpcResult.external_id,
        amount: rpcResult.amount,
        status: rpcResult.status,
        pixQrCode: paymentData?.pixQrCode,
        pixCopyPaste: paymentData?.pixCopyPaste,
        expiresAt: paymentData?.expiresAt
      }

      setPaymentData(updatedData)
      
      if (rpcResult.status === 'CONFIRMED') {
        toast.success('Pagamento confirmado! Créditos adicionados à sua conta.')
      }

      return updatedData

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao verificar status'
      setError({ message: errorMessage })
      toast.error(`Erro ao verificar status: ${errorMessage}`)
      throw error
    }
  }, [paymentData])

  // Função para copiar PIX para área de transferência
  const copyPixToClipboard = useCallback(async (pixCode: string) => {
    try {
      await navigator.clipboard.writeText(pixCode)
      toast.success('Código PIX copiado para área de transferência!')
    } catch (error) {
      toast.error('Erro ao copiar código PIX')
    }
  }, [])

  // Função para resetar estado
  const resetPayment = useCallback(() => {
    setPaymentData(null)
    setError(null)
    setLoading(false)
  }, [])

  return {
    loading,
    paymentData,
    error,
    createPixPayment,
    checkPaymentStatus,
    copyPixToClipboard,
    resetPayment
  }
} 