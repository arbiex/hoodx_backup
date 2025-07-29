import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Cache dinâmico inteligente
interface CachedInsightsData {
  success: boolean;
  data?: any;
  error?: string;
}

let cachedInsights: CachedInsightsData | null = null;
let lastFetch = 0;
const FRESH_DURATION = 1000; // 1 segundo = dados fresquíssimos

// ❌ LEADER ELECTION REMOVIDO: Com apenas 1 máquina, sempre será líder
// Sistema simplificado para instância única

// Cache de números vermelhos
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

// 🔥 EDGE FUNCTION URL: Centralizando configuração
const BLAZE_AUTH_EDGE_FUNCTION_URL = 'https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth';

// 🎯 SIMPLIFICADO: Função para coletar dados (sempre executa em instância única)
async function collectFreshInsights() {
  console.log('🔄 [INSIGHTS-SHARED] Buscando dados frescos da Pragmatic...');
  
  try {
    // Gerar tokens usando conta principal
    console.log('🔐 [INSIGHTS-SHARED] Gerando tokens com conta PRINCIPAL...');
    
    const authResponse = await fetch(BLAZE_AUTH_EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        action: 'generate-tokens',
        blazeToken: process.env.NEXT_BLAZE_ACCESS_TOKEN,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        acceptLanguage: 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        selectedCurrencyType: 'BRL'
      })
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      throw new Error(`Erro na Edge Function: ${authResponse.status} - ${errorText}`);
    }

    const authData = await authResponse.json();
    
    if (!authData.success || !authData.data) {
      throw new Error(`Falha na geração de tokens: ${authData.error || 'Tokens não recebidos'}`);
    }

    console.log('✅ [INSIGHTS-SHARED] Tokens gerados com sucesso (PRINCIPAL)');

    // Buscar histórico da Pragmatic (usando a mesma URL dos outros sistemas)
    const url = `https://games.pragmaticplaylive.net/api/ui/statisticHistory?tableId=mrbras531mrbr532&numberOfGames=500&JSESSIONID=${authData.data.jsessionId}&ck=${Date.now()}&game_mode=roulette_desktop`;
    
    const historyResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://games.pragmaticplaylive.net/',
        'Cache-Control': 'no-cache'
      }
    });

    if (!historyResponse.ok) {
      throw new Error(`Erro na API Pragmatic: ${historyResponse.status}`);
    }

    const responseText = await historyResponse.text();
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ [INSIGHTS-SHARED] Erro ao parsear JSON:', parseError);
      throw new Error('Erro ao processar resposta da API');
    }

    if (data.errorCode !== "0") {
      console.error('❌ [INSIGHTS-SHARED] Erro na API Pragmatic:', data.errorCode);
      throw new Error(`API Pragmatic retornou erro: ${data.errorCode}`);
    }

    if (!Array.isArray(data.history)) {
      console.error('❌ [INSIGHTS-SHARED] Histórico não é um array:', typeof data.history);
      throw new Error('Dados de histórico inválidos');
    }

    // Processar resultados (mesmo formato dos outros sistemas)
    const results = data.history.map((item: any, index: number) => {
      const gameResult = item.gameResult || '';
      const parts = gameResult.split(' ');
      const number = parseInt(parts[0]) || 0;

      // Determinar cor usando Set pré-calculado
      let color = 'green';
      if (number !== 0) {
        color = RED_NUMBERS.has(number) ? 'red' : 'black';
      }

      return {
        id: item.gameId || `${item.gameId}-${Date.now()}`,
        gameId: item.gameId,
        number: number,
        color: color,
        timestamp: Date.now() - (index * 60000), // Espaçamento de 1 minuto entre resultados
        gameResult: gameResult
      };
    });

    console.log(`✅ [INSIGHTS-SHARED] Dados frescos coletados: ${results.length} resultados`);

    return {
      success: true,
      data: {
        results: results,
        timestamp: Date.now(),
        userId: 'shared-insights-bmgbr3',
        resultsCount: results.length
      }
    };

  } catch (error) {
    console.error('❌ [INSIGHTS-SHARED] Erro ao coletar dados:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
}

// Função principal da API
export async function POST(request: NextRequest) {
  try {
    const { user_id, action } = await request.json();

    if (!user_id) {
      return NextResponse.json({
        success: false,
        error: 'user_id é obrigatório'
      }, { status: 400 });
    }

    // Processar ações
    switch (action) {
      case 'start':
        console.log(`🚀 [INSIGHTS-SHARED] Iniciando coleta para usuário: ${user_id}`);
        return NextResponse.json({ success: true, message: 'Coleta iniciada' });

      case 'stop':
        console.log(`🛑 [INSIGHTS-SHARED] Parando coleta para usuário: ${user_id}`);
        return NextResponse.json({ success: true, message: 'Coleta parada' });

      case 'get':
        // Verificar se cache está fresh
        const now = Date.now();
        const isCacheFresh = cachedInsights && (now - lastFetch) < FRESH_DURATION;

        if (isCacheFresh) {
          // Retornar dados do cache
          return NextResponse.json(cachedInsights);
        }

        // Cache expirado - coletar dados frescos
        console.log('🔄 [INSIGHTS-SHARED] Cache expirado, coletando dados frescos...');
        
        const freshData = await collectFreshInsights();
        
        // Atualizar cache
        cachedInsights = freshData;
        lastFetch = now;
        
        console.log('✅ [INSIGHTS-SHARED] Cache atualizado com dados frescos');
        
        return NextResponse.json(freshData);

      default:
        return NextResponse.json({
          success: false,
          error: `Ação "${action}" não suportada`
        }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ [INSIGHTS-SHARED] Erro na requisição:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor'
    }, { status: 500 });
  }
} 