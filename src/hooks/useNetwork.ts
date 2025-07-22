'use client'

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getPublicUrl } from '@/lib/utils';

export interface NetworkNode {
  user_id: string;
  email: string;
  joined_date: string;
  status: 'active' | 'inactive';
  total_commissions: number;
  level: number;
}

export interface NetworkStats {
  total_referrals: number;
  active_referrals: number;
  total_commissions_earned: number;
}

export interface CommissionBalance {
  commission_balance: number;
  total_commission_earned: number;
  total_commission_withdrawn: number;
}

export interface ReferralInfo {
  referral_code: string;
  referral_url: string;
}

export function useNetwork() {
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [networkNodes, setNetworkNodes] = useState<NetworkNode[]>([]);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [commissionBalance, setCommissionBalance] = useState<CommissionBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Função para buscar informações do patrocinador (se existe)
  const getSponsorInfo = async (referralCode: string) => {
    try {
      // Usar função RPC que busca sponsor de forma segura
      const { data, error } = await supabase.rpc('get_sponsor_info', {
        p_referral_code: referralCode
      });

      if (error || !data) return null;

      return {
        referral_code: data.referral_code,
        email: data.email || 'Email não disponível',
        joined_date: new Date(data.joined_date).toLocaleDateString('pt-BR')
      };
    } catch (err) {
      console.error('Erro ao buscar sponsor:', err);
      return null;
    }
  };

  // Função para buscar estatísticas da rede
  const fetchNetworkStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Buscar total de indicações diretas
      const { data: referrals, error: referralsError } = await supabase
        .from('user_referrals')
        .select('user_id, status')
        .eq('sponsor_id', user.id);

      if (referralsError) throw referralsError;

      // Buscar total de comissões ganhas
      const { data: commissions, error: commissionsError } = await supabase
        .from('commission_transactions')
        .select('commission_amount')
        .eq('recipient_user_id', user.id)
        .eq('status', 'completed');

      const totalReferrals = referrals?.length || 0;
      const activeReferrals = referrals?.filter(r => r.status === 'active').length || 0;
      const totalCommissionsEarned = commissions?.reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;

      setNetworkStats({
        total_referrals: totalReferrals,
        active_referrals: activeReferrals,
        total_commissions_earned: totalCommissionsEarned
      });
    } catch (err) {
      console.error('Erro ao buscar estatísticas:', err);
      setNetworkStats({
        total_referrals: 0,
        active_referrals: 0,
        total_commissions_earned: 0
      });
    }
  };

  // Função para buscar nós da rede (indicados diretos)
  const fetchNetworkNodes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Usar função RPC que busca indicados diretos com emails de forma segura
      const { data, error } = await supabase.rpc('get_user_referrals_with_emails', {
        p_user_id: user.id
      });

      if (error) throw error;

      // A função RPC já retorna todos os dados necessários
      const nodes: NetworkNode[] = data || [];

      setNetworkNodes(nodes);
    } catch (err) {
      console.error('Erro ao buscar rede:', err);
      setNetworkNodes([]);
    }
  };

  // Função para buscar informações de indicação (código e URL)
  const fetchReferralInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Buscar código de indicação na tabela user_credits
      const { data: userCredit, error } = await supabase
        .from('user_credits')
        .select('referral_code')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      let referralCode = userCredit?.referral_code;

      // Se não tem código, tentar gerar um
      if (!referralCode) {
        const { data: newCode, error: generateError } = await supabase.rpc('ensure_referral_codes');
        if (!generateError) {
          // Tentar buscar novamente
          const { data: updatedCredit } = await supabase
            .from('user_credits')
            .select('referral_code')
            .eq('user_id', user.id)
            .single();
          
          referralCode = updatedCredit?.referral_code;
        }
      }

      if (referralCode) {
        const baseUrl = getPublicUrl();
        
        setReferralInfo({
          referral_code: referralCode,
          referral_url: `${baseUrl}/invite?ref=${referralCode}`
        });
      } else {
        setReferralInfo({
          referral_code: 'Loading...',
          referral_url: 'Loading...'
        });
      }
    } catch (err) {
      console.error('Erro ao buscar info de indicação:', err);
      setReferralInfo({
        referral_code: 'Error',
        referral_url: 'Error'
      });
    }
  };

  // Função para buscar saldo de comissões
  const fetchCommissionBalance = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('user_credits')
        .select('commission_balance, total_commission_earned, total_commission_withdrawn')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      setCommissionBalance({
        commission_balance: data?.commission_balance || 0,
        total_commission_earned: data?.total_commission_earned || 0,
        total_commission_withdrawn: data?.total_commission_withdrawn || 0
      });
    } catch (err) {
      console.error('Erro ao buscar saldo de comissões:', err);
      setCommissionBalance({
        commission_balance: 0,
        total_commission_earned: 0,
        total_commission_withdrawn: 0
      });
    }
  };

  // Função para recarregar todos os dados
  const refreshData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchNetworkStats(),
        fetchNetworkNodes(),
        fetchReferralInfo(),
        fetchCommissionBalance()
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  // Função para copiar link de indicação
  const copyReferralLink = async () => {
    if (!referralInfo?.referral_url || referralInfo.referral_url === 'Loading...') {
      return false;
    }

    try {
      await navigator.clipboard.writeText(referralInfo.referral_url);
      return true;
    } catch (err) {
      return false;
    }
  };

  // Carregar dados iniciais
  useEffect(() => {
    refreshData();
  }, []);

  return {
    networkStats,
    networkNodes,
    referralInfo,
    commissionBalance,
    getSponsorInfo,
    loading,
    error,
    refreshData,
    copyReferralLink,
  };
} 