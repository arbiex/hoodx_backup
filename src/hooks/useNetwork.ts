'use client'

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getPublicUrl } from '@/lib/utils';

export function useNetwork() {
  const [agentData, setAgentData] = useState<{
    agent_code: string;
    sponsor_code: string;
    total_invited: number;
    total_earnings: number;
    commission_rate: number;
  } | null>(null);
  const [networkData, setNetworkData] = useState<Array<{
    id: string;
    invited_user_email: string;
    invited_at: string;
    commission_earned: number;
    is_active: boolean;
    total_spent: number;
    last_active: string;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Função para buscar dados do agente
  const fetchAgentData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('agent_code, sponsor_code, total_invited, total_earnings, commission_rate')
        .eq('user_id', user.id)
        .single();

      if (agentError) throw agentError;

      setAgentData(agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Função para buscar dados da rede
  const fetchNetworkData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: network, error: networkError } = await supabase
        .from('invitations')
        .select(`
          id,
          invited_user_email,
          invited_at,
          commission_earned,
          is_active,
          total_spent,
          last_active
        `)
        .eq('inviter_user_id', user.id)
        .order('invited_at', { ascending: false });

      if (networkError) throw networkError;

      setNetworkData(network || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Função para gerar link de indicação
  const generateReferralLink = () => {
    if (!agentData) return '';
    
    const referralUrl = `${getPublicUrl()}/invite?ref=${agentData.agent_code}`;
    return referralUrl;
  };

  // Função para copiar link de indicação
  const copyReferralLink = async () => {
    const link = generateReferralLink();
    if (link) {
      try {
        await navigator.clipboard.writeText(link);
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  };

  // Carregar dados iniciais
  useEffect(() => {
    fetchAgentData();
    fetchNetworkData();
  }, []);

  return {
    agentData,
    networkData,
    loading,
    error,
    fetchAgentData,
    fetchNetworkData,
    generateReferralLink,
    copyReferralLink,
  };
} 