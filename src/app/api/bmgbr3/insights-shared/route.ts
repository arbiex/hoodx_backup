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

// 🏆 LEADER ELECTION: Configuração
const LEADER_TIMEOUT = 30000; // 30 segundos para leader expirar
const INSTANCE_ID = process.env.FLY_MACHINE_ID || `instance-${Date.now()}`; // ID único da instância
let isLeader = false;
let lastLeaderHeartbeat = 0;

// Cache de números vermelhos
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

// 🔥 EDGE FUNCTION URL: Centralizando configuração
const BLAZE_AUTH_EDGE_FUNCTION_URL = 'https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth';

// 🏆 LEADER ELECTION: Funções de coordenação
async function tryBecomeLeader(): Promise<boolean> {
  try {
    const now = Date.now();
    
    // Verificar se já existe um leader ativo
    const { data: currentLeader, error } = await supabase
      .from('system_leader')
      .select('*')
      .eq('service', 'insights-collector')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('❌ [LEADER-ELECTION] Erro ao verificar leader atual:', error);
      return false;
    }

    // Se não há leader ou leader expirou
    if (!currentLeader || (now - new Date(currentLeader.last_heartbeat).getTime()) > LEADER_TIMEOUT) {
      // Tentar se tornar leader
      const { error: upsertError } = await supabase
        .from('system_leader')
        .upsert({
          service: 'insights-collector',
          instance_id: INSTANCE_ID,
          last_heartbeat: new Date().toISOString()
        }, {
          onConflict: 'service'
        });

      if (upsertError) {
        console.error('❌ [LEADER-ELECTION] Erro ao se tornar leader:', upsertError);
        return false;
      }

      console.log(`🏆 [LEADER-ELECTION] Instância ${INSTANCE_ID} se tornou LEADER`);
      isLeader = true;
      lastLeaderHeartbeat = now;
      return true;
    }

    // Verificar se esta instância é o leader atual
    if (currentLeader.instance_id === INSTANCE_ID) {
      isLeader = true;
      lastLeaderHeartbeat = now;
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ [LEADER-ELECTION] Erro na eleição de leader:', error);
    return false;
  }
}

async function updateLeaderHeartbeat(): Promise<void> {
  if (!isLeader) return;

  try {
    const { error } = await supabase
      .from('system_leader')
      .update({
        last_heartbeat: new Date().toISOString()
      })
      .eq('service', 'insights-collector')
      .eq('instance_id', INSTANCE_ID);

    if (error) {
      console.error('❌ [LEADER-ELECTION] Erro ao atualizar heartbeat:', error);
      isLeader = false; // Perdeu liderança
    } else {
      lastLeaderHeartbeat = Date.now();
    }
  } catch (error) {
    console.error('❌ [LEADER-ELECTION] Erro no heartbeat:', error);
    isLeader = false;
  }
}

async function getLeaderData(): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // Buscar qual instância é a leader
    const { data: leader, error } = await supabase
      .from('system_leader')
      .select('*')
      .eq('service', 'insights-collector')
      .single();

    if (error || !leader) {
      return {
        success: false,
        error: 'Nenhuma instância leader encontrada'
      };
    }

    // Se esta instância é a leader, retornar dados locais
    if (leader.instance_id === INSTANCE_ID) {
      return cachedInsights || { success: false, error: 'Cache local vazio' };
    }

    // Buscar dados da instância leader via HTTP interno
    const leaderUrl = `https://${leader.instance_id}.internal:3000/api/bmgbr3/insights-shared`;
    
    const response = await fetch(leaderUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-follower-request': 'true' // Identificar como request de follower
      },
      body: JSON.stringify({ follower: true })
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Erro ao buscar dados da leader: ${response.status}`
      };
    }

    const leaderData = await response.json();
    return leaderData;

  } catch (error: any) {
    return {
      success: false,
      error: `Erro ao consumir dados da leader: ${error.message}`
    };
  }
}

// 🔐 GERAÇÃO DE TOKENS COM CONTA COBAIA
async function generateCobraTokens(blazeToken: string, isBackup = false): Promise<{
  success: boolean;
  tokens?: { ppToken: string; jsessionId: string; pragmaticUserId: string };
  error?: string;
}> {
  const tokenType = isBackup ? 'BACKUP' : 'PRINCIPAL';
  console.log(`🔐 [INSIGHTS-SHARED] Gerando tokens com conta ${tokenType}...`);
  
  try {
    const edgeResponse = await fetch(BLAZE_AUTH_EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
      },
      body: JSON.stringify({
        action: 'generate-tokens',
        blazeToken: blazeToken,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        acceptLanguage: 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        selectedCurrencyType: 'BRL',
        realBrowserHeaders: {
          'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'DNT': '1',
          'Upgrade-Insecure-Requests': '1',
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      })
    });

    if (!edgeResponse.ok) {
      const errorText = await edgeResponse.text();
      console.error(`❌ [INSIGHTS-SHARED] Erro na Edge Function (${tokenType}):`, edgeResponse.status, errorText);
      return {
        success: false,
        error: `Erro na Edge Function (${tokenType}): ${edgeResponse.status} - ${errorText}`
      };
    }

    const edgeResult = await edgeResponse.json();
    
    if (!edgeResult.success || !edgeResult.data) {
      console.error(`❌ [INSIGHTS-SHARED] Falha na Edge Function (${tokenType}):`, edgeResult.error);
      return {
        success: false,
        error: edgeResult.error || `Erro na geração de tokens via Edge Function (${tokenType})`
      };
    }

    const tokens = {
      ppToken: edgeResult.data.ppToken,
      jsessionId: edgeResult.data.jsessionId,
      pragmaticUserId: edgeResult.data.pragmaticUserId || ''
    };

    console.log(`✅ [INSIGHTS-SHARED] Tokens gerados com sucesso (${tokenType})`);
    return {
      success: true,
      tokens
    };
  } catch (error) {
    console.error(`❌ [INSIGHTS-SHARED] Erro na geração de tokens (${tokenType}):`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
}

// 🔄 BUSCAR DADOS DA PRAGMATIC COM CONTA COBAIA
async function fetchFreshInsights(): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  console.log('🔄 [INSIGHTS-SHARED] Buscando dados frescos da Pragmatic...');
  
  // Verificar tokens necessários
  const primaryToken = process.env.NEXT_BLAZE_ACCESS_TOKEN;
  const backupToken = process.env.NEXT_BACKUP_BLAZE_ACCESS_TOKEN;
  
  if (!primaryToken) {
    console.error('❌ [INSIGHTS-SHARED] NEXT_BLAZE_ACCESS_TOKEN não configurado');
    return {
      success: false,
      error: 'Token principal não configurado'
    };
  }

  // Tentar com token principal
  let tokensResult = await generateCobraTokens(primaryToken, false);
  
  // Se falhar, tentar com backup
  if (!tokensResult.success && backupToken) {
    console.log('🔄 [INSIGHTS-SHARED] Token principal falhou, tentando backup...');
    tokensResult = await generateCobraTokens(backupToken, true);
  }
  
  if (!tokensResult.success) {
    return {
      success: false,
      error: tokensResult.error || 'Falha na geração de tokens'
    };
  }

  const { jsessionId } = tokensResult.tokens!;

  try {
    // Buscar dados da API Pragmatic
    const url = `https://games.pragmaticplaylive.net/api/ui/statisticHistory?tableId=mrbras531mrbr532&numberOfGames=500&JSESSIONID=${jsessionId}&ck=${Date.now()}&game_mode=roulette_desktop`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://games.pragmaticplaylive.net/',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      console.error('❌ [INSIGHTS-SHARED] Erro HTTP:', response.status, response.statusText);
      return {
        success: false,
        error: `Erro HTTP ${response.status}: ${response.statusText}`
      };
    }

    const responseText = await response.text();
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ [INSIGHTS-SHARED] Erro ao parsear JSON:', parseError);
      return {
        success: false,
        error: 'Erro ao processar resposta da API'
      };
    }

    if (data.errorCode !== "0") {
      console.error('❌ [INSIGHTS-SHARED] Erro na API Pragmatic:', data.errorCode);
      return {
        success: false,
        error: `API Pragmatic retornou erro: ${data.errorCode}`
      };
    }

    if (!Array.isArray(data.history)) {
      console.error('❌ [INSIGHTS-SHARED] Histórico não é um array:', typeof data.history);
      return {
        success: false,
        error: 'Dados de histórico inválidos'
      };
    }

    // Processar dados
    const processedResults = data.history.map((item: any, index: number) => {
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

    console.log(`✅ [INSIGHTS-SHARED] Dados frescos coletados: ${processedResults.length} resultados`);

    return {
      success: true,
      data: {
        results: processedResults,
        timestamp: Date.now(),
        userId: 'shared-cobra-account',
        resultsCount: processedResults.length
      }
    };
  } catch (error) {
    console.error('❌ [INSIGHTS-SHARED] Erro na coleta:', error);
    return {
      success: false,
      error: `Erro na coleta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

// 🚀 ENDPOINT PRINCIPAL COM CACHE COMPARTILHADO SIMPLES
export async function POST(request: NextRequest) {
  try {
    const now = Date.now();
    
    // 🏆 TENTAR SE TORNAR LEADER
    const becameLeader = await tryBecomeLeader();
    
    if (isLeader) {
      // 👑 ESTA INSTÂNCIA É LEADER → Coletar dados da Pragmatic quando necessário
      
      // Atualizar heartbeat
      await updateLeaderHeartbeat();
      
      // 🔍 VERIFICAÇÃO: Cache está fresco? (< 1 segundo)
      if (now - lastFetch < FRESH_DURATION && cachedInsights) {
        console.log('⚡ [LEADER] Retornando cache fresco');
        return NextResponse.json(cachedInsights);
      }
      
      // 🔄 Cache velho → buscar dados novos da Pragmatic
      console.log('🔄 [LEADER] Cache expirado, coletando dados da Pragmatic...');
      const freshData = await fetchFreshInsights();
      
      if (!freshData.success) {
        // Retornar cache antigo se disponível, ou erro
        if (cachedInsights) {
          console.log('⚠️ [LEADER] Erro ao coletar, retornando cache antigo');
          return NextResponse.json(cachedInsights);
        }
        
        return NextResponse.json({
          success: false,
          error: freshData.error
        }, { status: 500 });
      }
      
      // 💾 Atualizar cache com dados frescos
      cachedInsights = freshData;
      lastFetch = now;
      
      console.log('✅ [LEADER] Cache atualizado com dados frescos da Pragmatic');
      return NextResponse.json(freshData);
      
    } else {
      // 👥 ESTA INSTÂNCIA É FOLLOWER → Servir cache local (pode estar desatualizado)
      console.log('🔄 [FOLLOWER] Servindo dados do cache local');
      
      if (cachedInsights) {
        const cacheAge = now - lastFetch;
        console.log(`⚡ [FOLLOWER] Cache local com ${Math.round(cacheAge/1000)}s de idade`);
        return NextResponse.json(cachedInsights);
      }
      
      // 🚨 FALLBACK: Se follower não tem cache, tentar assumir liderança emergencial
      console.log('🚨 [FOLLOWER] Sem cache local, tentando liderança emergencial...');
      const emergencyLeader = await tryBecomeLeader();
      
      if (emergencyLeader && isLeader) {
        console.log('🏆 [FOLLOWER→LEADER] Assumiu liderança emergencial');
        const freshData = await fetchFreshInsights();
        if (freshData.success) {
          cachedInsights = freshData;
          lastFetch = now;
          await updateLeaderHeartbeat();
          return NextResponse.json(freshData);
        }
      }
      
      return NextResponse.json({
        success: false,
        error: 'Nenhum dado disponível no cache local'
      }, { status: 503 });
    }
    
  } catch (error) {
    console.error('❌ [INSIGHTS-SHARED] Erro no processamento:', error);
    
    // Retornar cache antigo se disponível
    if (cachedInsights) {
      console.log('⚠️ [INSIGHTS-SHARED] Erro crítico, retornando cache antigo');
      return NextResponse.json(cachedInsights);
    }
    
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}

// 📊 ENDPOINT GET PARA STATUS + LEADER ELECTION
export async function GET() {
  try {
    const now = Date.now();
    const cacheAge = cachedInsights ? now - lastFetch : null;
    const isFresh = cacheAge !== null && cacheAge < FRESH_DURATION;
    
    // Buscar informações do leader atual
    let leaderInfo = null;
    try {
      const { data: leader } = await supabase
        .from('system_leader')
        .select('*')
        .eq('service', 'insights-collector')
        .single();
      
      if (leader) {
        const leaderAge = now - new Date(leader.last_heartbeat).getTime();
        leaderInfo = {
          instance_id: leader.instance_id,
          last_heartbeat: leader.last_heartbeat,
          age_ms: leaderAge,
          is_expired: leaderAge > LEADER_TIMEOUT,
          is_current_instance: leader.instance_id === INSTANCE_ID
        };
      }
    } catch (error) {
      // Ignorar erro se tabela não existir ainda
    }
    
    return NextResponse.json({
      success: true,
      data: {
        hasCachedData: !!cachedInsights,
        cacheAge: cacheAge,
        isFresh: isFresh,
        nextRefreshIn: isFresh && cacheAge !== null ? FRESH_DURATION - cacheAge : 0,
        timestamp: now,
        freshDuration: FRESH_DURATION,
        tokens: {
          hasPrimary: !!process.env.NEXT_BLAZE_ACCESS_TOKEN,
          hasBackup: !!process.env.NEXT_BACKUP_BLAZE_ACCESS_TOKEN
        },
        leaderElection: {
          instance_id: INSTANCE_ID,
          is_leader: isLeader,
          leader_info: leaderInfo,
          leader_timeout: LEADER_TIMEOUT
        }
      }
    });
  } catch (error) {
    console.error('❌ [INSIGHTS-SHARED] Erro no GET:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor'
    }, { status: 500 });
  }
} 