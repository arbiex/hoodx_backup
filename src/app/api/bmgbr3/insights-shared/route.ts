import { NextRequest, NextResponse } from 'next/server';

// Cache dinâmico inteligente
interface CachedInsightsData {
  success: boolean;
  data?: any;
  error?: string;
}

let cachedInsights: CachedInsightsData | null = null;
let lastFetch = 0;
const FRESH_DURATION = 1000; // 1 segundo = dados fresquíssimos

// Cache de números vermelhos
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

// 🔥 EDGE FUNCTION URL: Centralizando configuração
const BLAZE_AUTH_EDGE_FUNCTION_URL = 'https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth';

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

// 🚀 ENDPOINT PRINCIPAL
export async function POST(request: NextRequest) {
  try {
    const now = Date.now();
    
    // 🔍 VERIFICAÇÃO: Cache está fresco? (< 1 segundo)
    if (now - lastFetch < FRESH_DURATION && cachedInsights) {
      console.log('⚡ [INSIGHTS-SHARED] Retornando cache fresco');
      return NextResponse.json(cachedInsights);
    }
    
    // 🔄 Cache velho → buscar dados novos
    console.log('🔄 [INSIGHTS-SHARED] Cache expirado, buscando dados frescos...');
    const freshData = await fetchFreshInsights();
    
    if (!freshData.success) {
      // Retornar cache antigo se disponível, ou erro
      if (cachedInsights) {
        console.log('⚠️ [INSIGHTS-SHARED] Erro ao buscar dados frescos, retornando cache antigo');
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
    
    console.log('✅ [INSIGHTS-SHARED] Cache atualizado com dados frescos');
    return NextResponse.json(freshData);
    
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

// 📊 ENDPOINT GET PARA STATUS
export async function GET() {
  try {
    const now = Date.now();
    const cacheAge = cachedInsights ? now - lastFetch : null;
    const isFresh = cacheAge !== null && cacheAge < FRESH_DURATION;
    
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