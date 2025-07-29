import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Cache dinâmico inteligente para dados
interface CachedInsightsData {
  success: boolean;
  data?: any;
  error?: string;
}

// 🔥 NOVO: Interface para cache global no Supabase
interface GlobalCacheData {
  id: string;
  cache_type: 'bmgbr3_tokens' | 'bmgbr3_results';
  data: any;
  created_at: string;
  expires_at: string;
  is_locked: boolean;
}

// 🎯 NOVO: Cache local em memória (backup)
let localCache: { [key: string]: { data: any; expiresAt: number } } = {};

// 🎯 DURAÇÃO OTIMIZADA: Cache global compartilhado
const GLOBAL_TOKEN_DURATION = 8 * 60 * 1000; // 8 minutos para tokens
const GLOBAL_DATA_DURATION = 15 * 1000; // 15 segundos para dados históricos
const LOCK_TIMEOUT = 30 * 1000; // 30 segundos máximo para lock

// Cache de números vermelhos
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

// 🔥 EDGE FUNCTION URL: Centralizando configuração
const BLAZE_AUTH_EDGE_FUNCTION_URL = 'https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth';

// 🎯 FUNÇÃO: Obter dados do cache global (Supabase)
async function getGlobalCache(cacheType: 'bmgbr3_tokens' | 'bmgbr3_results'): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('system_cache')
      .select('*')
      .eq('cache_type', cacheType)
      .single();

    if (error || !data) {
      console.log(`📦 [GLOBAL-CACHE] Cache ${cacheType} não encontrado`);
      return null;
    }

    // Verificar se expirou
    const now = new Date();
    const expiresAt = new Date(data.expires_at);
    
    if (now > expiresAt) {
      console.log(`⏰ [GLOBAL-CACHE] Cache ${cacheType} expirado`);
      // Limpar cache expirado
      await supabase
        .from('system_cache')
        .delete()
        .eq('cache_type', cacheType);
      return null;
    }

    console.log(`✅ [GLOBAL-CACHE] Cache ${cacheType} válido encontrado`);
    return data.data;

  } catch (error) {
    console.error(`❌ [GLOBAL-CACHE] Erro ao buscar cache ${cacheType}:`, error);
    return null;
  }
}

// 🎯 FUNÇÃO: Salvar dados no cache global com lock
async function setGlobalCache(cacheType: 'bmgbr3_tokens' | 'bmgbr3_results', data: any, durationMs: number): Promise<boolean> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs);

    const { error } = await supabase
      .from('system_cache')
      .upsert({
        cache_type: cacheType,
        data: data,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        is_locked: false
      });

    if (error) {
      console.error(`❌ [GLOBAL-CACHE] Erro ao salvar cache ${cacheType}:`, error);
      return false;
    }

    console.log(`✅ [GLOBAL-CACHE] Cache ${cacheType} salvo até ${expiresAt.toLocaleTimeString()}`);
    return true;

  } catch (error) {
    console.error(`❌ [GLOBAL-CACHE] Erro ao salvar cache ${cacheType}:`, error);
    return false;
  }
}

// 🔒 FUNÇÃO: Adquirir lock para geração de cache
async function acquireLock(cacheType: 'bmgbr3_tokens' | 'bmgbr3_results'): Promise<boolean> {
  try {
    // Tentar adquirir lock
    const { data, error } = await supabase
      .from('system_cache')
      .upsert({
        cache_type: `${cacheType}_lock`,
        data: { locked: true, locked_at: new Date().toISOString() },
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + LOCK_TIMEOUT).toISOString(),
        is_locked: true
      })
      .select();

    if (error) {
      console.log(`🔒 [LOCK] Não foi possível adquirir lock para ${cacheType}`);
      return false;
    }

    console.log(`🔒 [LOCK] Lock adquirido para ${cacheType}`);
    return true;

  } catch (error) {
    console.error(`❌ [LOCK] Erro ao adquirir lock:`, error);
    return false;
  }
}

// 🔓 FUNÇÃO: Liberar lock
async function releaseLock(cacheType: 'bmgbr3_tokens' | 'bmgbr3_results'): Promise<void> {
  try {
    await supabase
      .from('system_cache')
      .delete()
      .eq('cache_type', `${cacheType}_lock`);

    console.log(`🔓 [LOCK] Lock liberado para ${cacheType}`);
  } catch (error) {
    console.error(`❌ [LOCK] Erro ao liberar lock:`, error);
  }
}

// 🎯 FUNÇÃO: Obter tokens válidos (global shared)
async function getValidTokens(): Promise<any> {
  // 1. Tentar cache global primeiro
  let cachedTokens = await getGlobalCache('bmgbr3_tokens');
  
  if (cachedTokens) {
    console.log(`✅ [SHARED-TOKENS] Usando tokens globais compartilhados`);
    return cachedTokens;
  }

  // 2. Tentar adquirir lock para gerar novos tokens
  const lockAcquired = await acquireLock('bmgbr3_tokens');
  
  if (!lockAcquired) {
    // Se não conseguiu lock, aguardar um pouco e tentar cache novamente
    console.log(`⏳ [SHARED-TOKENS] Aguardando outros tokens serem gerados...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    cachedTokens = await getGlobalCache('bmgbr3_tokens');
    if (cachedTokens) {
      return cachedTokens;
    }
    
    throw new Error('Não foi possível obter tokens - múltiplas tentativas simultâneas');
  }

  try {
    // 3. Gerar novos tokens (apenas UMA instância por vez)
    console.log('🔐 [SHARED-TOKENS] Gerando novos tokens ÚNICOS para todos os usuários...');
    
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

    const tokensData = {
      ppToken: authData.data.ppToken,
      jsessionId: authData.data.jsessionId,
      pragmaticUserId: authData.data.pragmaticUserId,
      generatedAt: Date.now()
    };

    // 4. Salvar no cache global
    await setGlobalCache('bmgbr3_tokens', tokensData, GLOBAL_TOKEN_DURATION);

    console.log('✅ [SHARED-TOKENS] Tokens únicos gerados e compartilhados globalmente por 8 minutos');
    return tokensData;

  } finally {
    // 5. Sempre liberar o lock
    await releaseLock('bmgbr3_tokens');
  }
}

// 🎯 FUNÇÃO: Coletar dados históricos (global shared)
async function collectFreshInsights(): Promise<CachedInsightsData> {
  console.log('🔄 [SHARED-INSIGHTS] Buscando dados compartilhados...');
  
  try {
    // 1. Verificar cache global de dados primeiro
    let cachedData = await getGlobalCache('bmgbr3_results');
    
    if (cachedData) {
      console.log('📦 [SHARED-INSIGHTS] Usando dados globais compartilhados');
      return {
        success: true,
        data: cachedData
      };
    }

    // 2. Tentar adquirir lock para buscar novos dados
    const lockAcquired = await acquireLock('bmgbr3_results');
    
    if (!lockAcquired) {
      // Aguardar e tentar cache novamente
      console.log('⏳ [SHARED-INSIGHTS] Aguardando dados serem coletados...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      cachedData = await getGlobalCache('bmgbr3_results');
      if (cachedData) {
        return {
          success: true,
          data: cachedData
        };
      }
      
      throw new Error('Não foi possível obter dados - múltiplas coletas simultâneas');
    }

    try {
      // 3. Buscar dados (apenas UMA instância por vez)
      console.log('🌐 [SHARED-INSIGHTS] Fazendo requisição ÚNICA à Pragmatic para todos os usuários...');
      
      // Obter tokens compartilhados
      const tokens = await getValidTokens();

      // Buscar dados históricos da Pragmatic
      const url = `https://games.pragmaticplaylive.net/api/ui/statisticHistory?tableId=mrbras531mrbr532&numberOfGames=500&JSESSIONID=${tokens.jsessionId}&ck=${Date.now()}&game_mode=roulette_desktop`;
      
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
        console.error('❌ [SHARED-INSIGHTS] Erro ao parsear JSON:', parseError);
        throw new Error('Erro ao processar resposta da API');
      }

      if (data.errorCode !== "0") {
        console.error('❌ [SHARED-INSIGHTS] Erro na API Pragmatic:', data.errorCode);
        throw new Error(`API Pragmatic retornou erro: ${data.errorCode}`);
      }

      if (!Array.isArray(data.history)) {
        console.error('❌ [SHARED-INSIGHTS] Histórico não é um array:', typeof data.history);
        throw new Error('Dados de histórico inválidos');
      }

      // Processar resultados
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
          timestamp: Date.now() - (index * 60000),
          gameResult: gameResult
        };
      });

      const resultsData = {
        results: results,
        timestamp: Date.now(),
        userId: 'shared-insights-bmgbr3',
        resultsCount: results.length,
        currentGameId: results[0]?.gameId,
        tokensFromCache: true
      };

      // 4. Salvar no cache global
      await setGlobalCache('bmgbr3_results', resultsData, GLOBAL_DATA_DURATION);

      console.log(`✅ [SHARED-INSIGHTS] Dados únicos coletados e compartilhados: ${results.length} resultados`);

      return {
        success: true,
        data: resultsData
      };

    } finally {
      // 5. Sempre liberar o lock
      await releaseLock('bmgbr3_results');
    }

  } catch (error) {
    console.error('❌ [SHARED-INSIGHTS] Erro ao coletar dados:', error);
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
        console.log(`🚀 [SHARED-INSIGHTS] Iniciando coleta compartilhada para usuário: ${user_id}`);
        return NextResponse.json({ success: true, message: 'Coleta compartilhada iniciada' });

      case 'stop':
        console.log(`🛑 [SHARED-INSIGHTS] Parando coleta para usuário: ${user_id}`);
        return NextResponse.json({ success: true, message: 'Coleta parada' });

      case 'get':
        console.log(`📦 [SHARED-INSIGHTS] Usuário ${user_id} solicitando dados compartilhados`);
        
        // Usar sistema de cache global compartilhado
        const sharedData = await collectFreshInsights();
        
        return NextResponse.json(sharedData);

      default:
        return NextResponse.json({
          success: false,
          error: `Ação "${action}" não suportada`
        }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ [SHARED-INSIGHTS] Erro na requisição:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor'
    }, { status: 500 });
  }
} 