import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface WithdrawalFee {
  grossAmount: number
  feeAmount: number
  netAmount: number
  feePercentage: number
}

interface WithdrawalHistory {
  id: string
  amount: number
  fee_amount: number
  net_amount: number
  withdrawal_type: string
  crypto_type?: string
  wallet_address?: string
  pix_key_type?: string
  pix_key?: string
  full_name?: string
  cpf?: string
  status: string
  created_at: string
  processed_at?: string
  rejection_reason?: string
  admin_notes?: string
}

export const useWithdrawal = () => {
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [processingWithdrawal, setProcessingWithdrawal] = useState(false)

  // Calcular taxa de saque
  const calculateWithdrawalFee = async (amount: number): Promise<WithdrawalFee | null> => {
    try {
      const { data, error } = await supabase.rpc('calculate_withdrawal_fee', {
        gross_amount: amount
      })

      if (error) {
        console.error('Erro ao calcular taxa:', error)
        return null
      }

      return {
        grossAmount: parseFloat(data[0].gross_amount_out),
        feeAmount: parseFloat(data[0].fee_amount),
        netAmount: parseFloat(data[0].net_amount),
        feePercentage: parseFloat(data[0].fee_percentage)
      }
    } catch (error) {
      console.error('Erro ao calcular taxa:', error)
      return null
    }
  }

  // Solicitar saque PIX
  const requestPixWithdrawal = async (
    amount: number,
    pixKeyType: string,
    pixKey: string,
    fullName: string,
    cpf: string
  ) => {
    setProcessingWithdrawal(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        toast.error('Usuário não autenticado')
        return false
      }

      const { data, error } = await supabase.rpc('request_pix_withdrawal', {
        p_user_id: user.id,
        p_amount: amount,
        p_pix_key_type: pixKeyType,
        p_pix_key: pixKey,
        p_full_name: fullName,
        p_cpf: cpf
      })

      if (error) {
        console.error('Erro ao solicitar saque PIX:', error)
        toast.error(`Erro ao solicitar saque: ${error.message || 'Erro desconhecido'}`)
        return false
      }

      if (data?.success) {
        toast.success(data.message || 'Saque PIX solicitado com sucesso')
        await loadWithdrawalHistory()
        return true
      } else {
        toast.error(data?.error || 'Erro ao solicitar saque')
        return false
      }
    } catch (error) {
      console.error('Erro inesperado ao solicitar saque:', error)
      toast.error(`Erro inesperado: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
      return false
    } finally {
      setProcessingWithdrawal(false)
    }
  }

  // Solicitar saque cripto
  const requestCryptoWithdrawal = async (
    amount: number,
    cryptoType: string,
    walletAddress: string
  ) => {
    setProcessingWithdrawal(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        toast.error('Usuário não autenticado')
        return false
      }

      const { data, error } = await supabase.rpc('request_crypto_withdrawal', {
        p_user_id: user.id,
        p_amount: amount,
        p_crypto_type: cryptoType,
        p_wallet_address: walletAddress
      })

      if (error) {
        console.error('Erro ao solicitar saque cripto:', error)
        toast.error(`Erro ao solicitar saque: ${error.message || 'Erro desconhecido'}`)
        return false
      }

      if (data?.success) {
        toast.success(data.message || 'Saque cripto solicitado com sucesso')
        await loadWithdrawalHistory()
        return true
      } else {
        toast.error(data?.error || 'Erro ao solicitar saque')
        return false
      }
    } catch (error) {
      console.error('Erro inesperado ao solicitar saque cripto:', error)
      toast.error(`Erro inesperado: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
      return false
    } finally {
      setProcessingWithdrawal(false)
    }
  }

  // Carregar histórico de saques
  const loadWithdrawalHistory = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return
      }

      const { data, error } = await supabase.rpc('get_user_withdrawal_history', {
        p_user_id: user.id
      })

      if (error) {
        console.error('Erro ao carregar histórico:', error)
        return
      }

      setWithdrawalHistory(data || [])
    } catch (error) {
      console.error('Erro ao carregar histórico:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWithdrawalHistory()
  }, [])

  return {
    withdrawalHistory,
    loading,
    processingWithdrawal,
    calculateWithdrawalFee,
    requestPixWithdrawal,
    requestCryptoWithdrawal,
    loadWithdrawalHistory
  }
} 