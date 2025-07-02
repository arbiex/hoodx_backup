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

      // Verificar se o usuário é um agente ativo
      const { data: agentData, error: agentError } = await supabase
        .from('agents')
        .select('agent_code, commission_rate, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (agentError && agentError.code !== 'PGRST116') {
        console.error('Error checking agent status:', agentError)
        setError('Erro ao verificar status de agente')
        return
      }

      if (!agentData) {
        setError('Usuário não é um agente ativo')
        return
      }

      // Buscar dados da rede do agente usando a nova função
      const { data: networkData, error: networkError } = await supabase.rpc('get_agent_network_stats', {
        p_user_id: user.id
      })
      


      if (networkError) {
        console.error('Error loading network data:', networkError)
        setError(`Failed to load network data: ${networkError.message || JSON.stringify(networkError)}`)
        return
      }

      if (networkData && !networkData.error) {
        try {
          // URL base da aplicação
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hoodx.ai'
          const referralUrl = `${baseUrl}/invite?ref=${agentData.agent_code}`

          const referralData = {
            referral_code: agentData.agent_code,
            referral_url: referralUrl
          }

          const statsData = {
            total_referrals: networkData.total_referrals || 0,
            active_referrals: networkData.total_referrals || 0,
            total_commissions_generated: networkData.total_commissions || 0,
            max_level: 1
          }

          // Buscar lista de indicados do agente
          const { data: referralsData, error: referralsError } = await supabase
            .from('user_referrals')
            .select(`
              user_id,
              created_at,
              auth.users!user_referrals_user_id_fkey(email)
            `)
            .eq('sponsor_id', user.id)

          let nodesData: NetworkNode[] = []
          if (referralsData && !referralsError) {
            nodesData = referralsData.map((ref: any) => ({
              user_id: ref.user_id,
              email: ref.users?.email || 'Email não disponível',
              level: 1,
              status: 'active' as const,
              total_commissions: 0,
              joined_date: ref.created_at,
              referral_code: agentData.agent_code
            }))
          }

          setReferralInfo(referralData)
          setNetworkStats(statsData)
          setNetworkNodes(nodesData)
        } catch (dataError) {
          console.error('Error processing network data:', dataError)
          setError(`Error processing network data: ${dataError}`)
        }
      } else {
        // Se networkData tiver erro ou for null
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hoodx.ai'
        const referralUrl = `${baseUrl}/invite?ref=${agentData.agent_code}`
        
        setReferralInfo({
          referral_code: agentData.agent_code,
          referral_url: referralUrl
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

  // Buscar saldo de comissões (apenas para agentes ativos)
  const loadCommissionBalance = useCallback(async () => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Verificar se é um agente ativo
      const { data: agentData, error: agentError } = await supabase
        .from('agents')
        .select('is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (agentError && agentError.code !== 'PGRST116') {
        console.error('Error checking agent status:', agentError)
        return
      }

      if (!agentData) {
        // Se não é agente ativo, definir saldo zero
        setCommissionBalance({
          commission_balance: 0,
          total_commission_earned: 0,
          total_commission_withdrawn: 0,
          last_withdrawal_at: null
        })
        return
      }

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