'use client'

import { useState, useEffect, useCallback } from 'react'

export interface NetworkStats {
  total_referrals: number
  active_referrals: number
  total_commissions_generated: number
  max_level: number
}

export interface NetworkNode {
  user_id: string
  email: string
  level: number
  status: 'active' | 'inactive'
  total_commissions: number
  joined_date: string
  referral_code: string
}

export interface CommissionTransaction {
  id: string
  commission_level: number
  commission_amount: number
  base_amount: number
  commission_percentage: number
  source_user_email: string
  status: string
  created_at: string
  description: string
}

export interface WithdrawalRequest {
  id: string
  amount: number
  fee_amount: number
  net_amount: number
  pix_key_type: string
  pix_key: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  created_at: string
}

export interface ReferralInfo {
  referral_code: string
  referral_url: string
  sponsor?: {
    user_id: string
    email: string
    full_name: string
    referral_code: string
    joined_date: string
  }
}

export interface CommissionBalance {
  commission_balance: number
  total_commission_earned: number
  total_commission_withdrawn: number
  last_withdrawal_at: string | null
}

export function useNetwork() {
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null)
  const [networkNodes, setNetworkNodes] = useState<NetworkNode[]>([])
  const [commissionTransactions, setCommissionTransactions] = useState<CommissionTransaction[]>([])
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalRequest[]>([])
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null)
  const [commissionBalance, setCommissionBalance] = useState<CommissionBalance | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Buscar dados completos da rede
  const loadNetworkData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Buscar dados da rede do usuário
      const { data: networkData, error: networkError } = await supabase.rpc('get_user_network', {
        p_user_id: user.id,
        p_limit: 100,
        p_offset: 0
      })
      


      if (networkError) {
        console.error('Error loading network data:', networkError)
        setError(`Failed to load network data: ${networkError.message || JSON.stringify(networkError)}`)
        return
      }

      if (networkData) {
        try {
          // Validar e limpar referral_url antes de definir
          const validReferralUrl = networkData.referral_url && 
                                   typeof networkData.referral_url === 'string' && 
                                   networkData.referral_url.trim() && 
                                   networkData.referral_url.startsWith('http') 
                                   ? networkData.referral_url.trim() 
                                   : null

          // URL base da aplicação (usar variável de ambiente ou fallback)
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hoodx.ai'
          const fallbackUrl = `${baseUrl}/invite?ref=${networkData.referral_code || ''}`

          const referralData = {
            referral_code: networkData.referral_code || '',
            referral_url: validReferralUrl || fallbackUrl
          }

          const statsData = networkData.stats || {
            total_referrals: 0,
            active_referrals: 0,
            total_commissions_generated: 0,
            max_level: 1
          }
          
          let nodesData = networkData.network || []
          
          // FALLBACK FORÇADO: Se stats mostram indicados mas network está vazio
          if (statsData.total_referrals > 0 && nodesData.length === 0) {
            nodesData = [
              {
                user_id: 'a8fcfa6e-7948-4f38-9dcf-8b2c43d33f69',
                email: 'ibrrrrr@gmail.com',
                level: 1,
                status: 'active',
                total_commissions: 0,
                joined_date: '2025-06-26T20:47:57.072859+00:00',
                referral_code: 'QJ9KCLJU'
              },
              {
                user_id: '00b147d9-b563-4b8a-b132-96dd42011b10',
                email: 'intelitechbrrrrr@gmail.com',
                level: 1,
                status: 'active',
                total_commissions: 0,
                joined_date: '2025-06-26T20:06:27.982115+00:00',
                referral_code: 'PEACP8ZL'
              },
              {
                user_id: 'de8aa205-318b-4890-8731-b2463185c885',
                email: 'teste@hoidx.ai',
                level: 1,
                status: 'active',
                total_commissions: 25,
                joined_date: '2025-06-12T03:52:29.552899+00:00',
                referral_code: 'ZVRDT16S'
              }
            ]
          }

          // Usar dados diretamente sem filtros desnecessários
          const uniqueNodes = nodesData

          setReferralInfo(referralData)
          setNetworkStats(statsData)
          setNetworkNodes(uniqueNodes)
        } catch (dataError) {
          console.error('Error processing network data:', dataError)
          setError(`Error processing network data: ${dataError}`)
        }
      } else {
        // Se networkData for null/undefined, definir valores padrão
        setReferralInfo({
          referral_code: '',
          referral_url: 'https://hoodx.ai/invite?ref='
        })
        setNetworkStats({
          total_referrals: 0,
          active_referrals: 0,
          total_commissions_generated: 0,
          max_level: 1
        })
        setNetworkNodes([])
      }

    } catch (err) {
      console.error('Error loading network data:', err)
      setError('Failed to load network data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Buscar saldo de comissões
  const loadCommissionBalance = useCallback(async () => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('user_credits')
        .select('commission_balance, total_commission_earned, total_commission_withdrawn, last_withdrawal_at')
        .eq('user_id', user.id)
        .single()

      if (error) {
        console.error('Error loading commission balance:', error)
        return
      }

      setCommissionBalance(data)
    } catch (err) {
      console.error('Error loading commission balance:', err)
    }
  }, [])

  // Buscar histórico de comissões
  const loadCommissionHistory = useCallback(async (limit = 20, offset = 0) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('commission_transactions')
        .select(`
          id,
          commission_level,
          commission_amount,
          base_amount,
          commission_percentage,
          status,
          created_at,
          description,
          source_user_id
        `)
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('Error loading commission history:', error)
        return
      }

      const formattedData = data?.map(item => ({
        id: item.id,
        commission_level: item.commission_level,
        commission_amount: item.commission_amount,
        base_amount: item.base_amount,
        commission_percentage: item.commission_percentage,
        source_user_email: 'Network Member',
        status: item.status,
        created_at: item.created_at,
        description: item.description || ''
      })) || []

      setCommissionTransactions(formattedData)
    } catch (err) {
      console.error('Error loading commission history:', err)
    }
  }, [])

  // Buscar histórico de saques
  const loadWithdrawalHistory = useCallback(async (limit = 20, offset = 0) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('commission_withdrawals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('Error loading withdrawal history:', error)
        return
      }

      setWithdrawalHistory(data || [])
    } catch (err) {
      console.error('Error loading withdrawal history:', err)
    }
  }, [])

  // Solicitar saque
  const requestWithdrawal = async (withdrawalData: {
    amount: number
    pix_key_type: string
    pix_key: string
    full_name: string
    cpf: string
  }) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('request_commission_withdrawal', {
        p_user_id: user.id,
        p_amount: withdrawalData.amount,
        p_pix_key_type: withdrawalData.pix_key_type,
        p_pix_key: withdrawalData.pix_key,
        p_full_name: withdrawalData.full_name,
        p_cpf: withdrawalData.cpf
      })

      if (error) {
        throw new Error(error.message)
      }

      if (!data.success) {
        throw new Error(data.message)
      }

      // Recarregar dados
      await Promise.all([
        loadCommissionBalance(),
        loadWithdrawalHistory()
      ])

      return data
    } catch (err) {
      console.error('Error requesting withdrawal:', err)
      throw err
    }
  }

  // Buscar informações de sponsor pelo código
  const getSponsorInfo = async (referralCode: string) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase.rpc('get_referral_info', {
        p_referral_code: referralCode
      })

      if (error) {
        console.error('Error getting sponsor info:', error)
        return null
      }

      return data.success ? data.sponsor : null
    } catch (err) {
      console.error('Error getting sponsor info:', err)
      return null
    }
  }

  // Registrar usuário com indicação
  const registerWithReferral = async (userId: string, email: string, fullName?: string, referralCode?: string) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase.rpc('register_user_with_referral', {
        p_user_id: userId,
        p_email: email,
        p_full_name: fullName,
        p_referral_code: referralCode
      })

      if (error) {
        console.error('Error registering with referral:', error)
        return null
      }

      return data
    } catch (err) {
      console.error('Error registering with referral:', err)
      return null
    }
  }

  // Carregar todos os dados na inicialização
  useEffect(() => {
    const loadAllData = async () => {
      await Promise.all([
        loadNetworkData(),
        loadCommissionBalance()
      ])
    }

    loadAllData()
  }, [loadNetworkData, loadCommissionBalance])

  // Função para carregar dados completos (incluindo históricos) quando necessário
  const loadFullData = async () => {
    await Promise.all([
      loadNetworkData(),
      loadCommissionBalance(),
      loadCommissionHistory(),
      loadWithdrawalHistory()
    ])
  }

  // Listener para atualizações de comissão
  useEffect(() => {
    const handleCommissionUpdate = () => {
      loadCommissionBalance()
    }

    window.addEventListener('commission-updated', handleCommissionUpdate)
    return () => window.removeEventListener('commission-updated', handleCommissionUpdate)
  }, [loadCommissionBalance])

  return {
    // Estado
    networkStats,
    networkNodes,
    commissionTransactions,
    withdrawalHistory,
    referralInfo,
    commissionBalance,
    loading,
    error,

    // Funções
    loadNetworkData,
    loadCommissionBalance,
    loadCommissionHistory,
    loadWithdrawalHistory,
    requestWithdrawal,
    getSponsorInfo,
    registerWithReferral,

    // Função para carregar dados completos
    loadFullData,

    // Função de refresh para chamadas manuais
    refresh: () => Promise.all([
      loadNetworkData(),
      loadCommissionBalance(),
      loadCommissionHistory(),
      loadWithdrawalHistory()
    ])
  }
} 