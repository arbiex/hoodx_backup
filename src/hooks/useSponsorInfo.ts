'use client'

import { supabase } from '@/lib/supabase';

export function useSponsorInfo() {
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

  return {
    getSponsorInfo
  };
} 