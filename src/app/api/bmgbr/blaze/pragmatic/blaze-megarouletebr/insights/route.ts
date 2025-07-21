import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserBlazeToken } from '../../auth';
import { SimpleSessionAffinity } from '@/lib/simple-session-affinity';

// Interfaces TypeScript
interface AuthResult {
  success: boolean;
  error?: string;
  tokens?: {
    blazeToken: string;
    ppToken: string;
    jsessionId: string;
    pragmaticUserId: string;
  };
}

interface TokenStorage {
  userId: string;
  jsessionId: string;
  ppToken: string;
  pragmaticUserId: string;
  timestamp: number;
  expiresAt: number;  // TTL: 30 minutos
}

// 🔥 CACHE INTELIGENTE: Armazenamento com TTL para evitar geração constante
const userTokens = new Map<string, TokenStorage>();
const TOKEN_TTL = 30 * 60 * 1000; // 30 minutos em milissegundos

// Cache de números vermelhos
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

// ✅ EDGE FUNCTION URL: Centralizando configuração
const BLAZE_AUTH_EDGE_FUNCTION_URL = 'https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth';

// 🔥 FUNÇÃO DE RENOVAÇÃO COMPLETA DE TOKENS
// Gera toda a cadeia: blazeToken → ppToken → jsessionId → nova URL Pragmatic
// 
// ✅ VANTAGENS DA EDGE FUNCTION:
// - Execução mais rápida (edge computing)
// - Menor latência (servidores globais)
// - Isolamento de responsabilidades
// - Escalabilidade automática
// - Não sobrecarrega a API principal
async function authenticateUser(userId: string): Promise<AuthResult> {
  console.log('🔐 [INSIGHTS-AUTH] Iniciando renovação completa de tokens para usuário:', userId);
  
  try {
    // Buscar token do usuário usando a função existente
    const tokenResult = await getUserBlazeToken(userId);
    if (!tokenResult.success) {
      return {
        success: false,
        error: `Token da Blaze não encontrado. Configure na página de configurações.`
      };
    }

    // ✅ USAR EDGE FUNCTION DIRETAMENTE: Mais eficiente e consistente
    console.log('🚀 [INSIGHTS-AUTH] Usando Edge Function blaze-auth diretamente...');
    
    const edgeResponse = await fetch(BLAZE_AUTH_EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
      },
      body: JSON.stringify({
        action: 'generate-tokens',
        blazeToken: tokenResult.token,
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
      console.error('❌ [INSIGHTS-AUTH] Erro na Edge Function:', edgeResponse.status, errorText);
      return {
        success: false,
        error: `Erro na Edge Function: ${edgeResponse.status} - ${errorText}`
      };
    }

    const edgeResult = await edgeResponse.json();
    
    if (!edgeResult.success || !edgeResult.data) {
      console.error('❌ [INSIGHTS-AUTH] Falha na Edge Function:', edgeResult.error);
      return {
        success: false,
        error: edgeResult.error || 'Erro na geração de tokens via Edge Function'
      };
    }

    // ✅ TOKENS GERADOS VIA EDGE FUNCTION
    const tokens = {
      blazeToken: tokenResult.token!,
      ppToken: edgeResult.data.ppToken,
      jsessionId: edgeResult.data.jsessionId,
      pragmaticUserId: edgeResult.data.pragmaticUserId || ''
    };

    // Salvar tokens completos para uso futuro com TTL
    userTokens.set(userId, {
      userId,
      jsessionId: tokens.jsessionId,
      ppToken: tokens.ppToken,
      pragmaticUserId: tokens.pragmaticUserId,
      timestamp: Date.now(),
      expiresAt: Date.now() + TOKEN_TTL
    });

    console.log('✅ [INSIGHTS-AUTH] Renovação completa via Edge Function concluída - blazeToken → ppToken → jsessionId → URL válida');
    return {
      success: true,
      tokens
    };
  } catch (error) {
    console.error('❌ [INSIGHTS-AUTH] Erro na autenticação:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
}

// 🎯 SISTEMA AUTOMÁTICO SIMPLIFICADO:
// 1. Na hora da aposta, o gameId é capturado e armazenado em operation.lastGameId
// 2. Esta API busca continuamente os resultados da Pragmatic Play
// 3. O backend automaticamente compara gameId da API com gameId da aposta
// 4. Se coincidirem, o resultado é processado automaticamente (vitória/derrota)
// 5. Não há necessidade de intervenção manual - tudo automático via gameId

// 🔥 CACHE INTELIGENTE: Verificar se tokens ainda são válidos antes de gerar novos
function isTokenValid(tokenData: TokenStorage | undefined): boolean {
  if (!tokenData) return false;
  if (Date.now() > tokenData.expiresAt) {
    console.log(`⏰ [INSIGHTS-CACHE] Token expirado para usuário: ${tokenData.userId}`);
    return false;
  }
  return true;
}

// 🧹 LIMPEZA AUTOMÁTICA: Remover tokens expirados
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [userId, tokenData] of userTokens.entries()) {
    if (now > tokenData.expiresAt) {
      userTokens.delete(userId);
      console.log(`🗑️ [INSIGHTS-CACHE] Token expirado removido para usuário: ${userId}`);
    }
  }
}

// 🔥 OTIMIZADO: Função para buscar dados REUTILIZANDO tokens existentes
async function fetchGameData(userId: string, forceAuth = false) {
  try {
    // 🧹 LIMPEZA AUTOMÁTICA: Remover tokens expirados antes de iniciar
    cleanupExpiredTokens();
    
    let tokenData = userTokens.get(userId);
    
    // 🎯 VERIFICAÇÃO INTELIGENTE: Só gerar tokens se necessário
    if (!isTokenValid(tokenData) || forceAuth) {
      console.log(`🔄 [INSIGHTS-CACHE] Gerando novos tokens para usuário: ${userId} (força: ${forceAuth})`);
      const authResult = await authenticateUser(userId);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error
        };
      }
      tokenData = userTokens.get(userId);
    } else {
      // Log removido: verbose demais no terminal
    }

    if (!tokenData) {
      return {
        success: false,
        error: 'Erro ao obter token de sessão após autenticação'
      };
    }

    // Buscar dados da API Pragmatic
    const url = `https://games.pragmaticplaylive.net/api/ui/statisticHistory?tableId=mrbras531mrbr532&numberOfGames=500&JSESSIONID=${tokenData.jsessionId}&ck=${Date.now()}&game_mode=roulette_desktop`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://games.pragmaticplaylive.net/',
        'Cache-Control': 'no-cache'
      }
    });

    // 🔥 DETECÇÃO DE 401 UNAUTHORIZED: Renovar tokens automaticamente
    if (response.status === 401) {
      console.warn('⚠️ [INSIGHTS-DATA] Erro 401 Unauthorized - renovando tokens completos...');
      
      // Remover token inválido
      userTokens.delete(userId);
      
      // Tentar novamente com autenticação forçada (só uma vez para evitar loop)
      if (!forceAuth) {
        return await fetchGameData(userId, true);
      } else {
        return {
          success: false,
          error: 'Erro de autenticação persistente após renovação de tokens',
          needsAuth: true
        };
      }
    }

    if (!response.ok) {
      console.error('❌ [INSIGHTS-DATA] Erro HTTP:', response.status, response.statusText);
      return {
        success: false,
        error: `Erro HTTP ${response.status}: ${response.statusText}`,
        needsAuth: true
      };
    }

    const responseText = await response.text();
    
    // 🔥 DETECÇÃO DE OFFLINE: Renovar tokens automaticamente
    if (responseText.toLowerCase().includes('offline')) {
      console.warn('⚠️ [INSIGHTS-DATA] Detectado offline - renovando tokens...');
      
      // Remover token inválido
      userTokens.delete(userId);
      
      // Tentar novamente com autenticação forçada (só uma vez para evitar loop)
      if (!forceAuth) {
        return await fetchGameData(userId, true);
      } else {
        return {
          success: false,
          error: 'Erro offline persistente após renovação de tokens',
          needsAuth: true
        };
      }
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ [INSIGHTS-DATA] Erro ao parsear JSON:', parseError);
      console.error('📄 [INSIGHTS-DATA] Resposta recebida:', responseText.substring(0, 200));
      
      // 🔥 DETECÇÃO DE ERRO DE AUTH VIA JSON: Pode ser página de erro de login
      if (responseText.toLowerCase().includes('login') || 
          responseText.toLowerCase().includes('authentication') ||
          responseText.toLowerCase().includes('unauthorized') ||
          responseText.toLowerCase().includes('session')) {
        console.warn('⚠️ [INSIGHTS-DATA] Página de erro de autenticação detectada - renovando tokens...');
        
        // Remover token inválido
        userTokens.delete(userId);
        
        // Tentar novamente com autenticação forçada (só uma vez para evitar loop)
        if (!forceAuth) {
          return await fetchGameData(userId, true);
        } else {
          return {
            success: false,
            error: 'Erro de autenticação persistente (página de login recebida)',
            needsAuth: true
          };
        }
      }
      
      return {
        success: false,
        error: 'Erro ao processar resposta da API',
        needsAuth: true
      };
    }

    if (data.errorCode !== "0") {
      console.error('❌ [INSIGHTS-DATA] Erro na API Pragmatic:', data.errorCode);
      
      // 🔥 DETECÇÃO DE ERROS DE AUTENTICAÇÃO: Renovar tokens automaticamente
      const authErrorCodes = ["10", "11", "12", "13", "401", "403"]; // Códigos que indicam problemas de auth
      if (authErrorCodes.includes(data.errorCode)) {
        console.warn('⚠️ [INSIGHTS-DATA] Erro de autenticação detectado - renovando tokens...');
        
        // Remover token inválido
        userTokens.delete(userId);
        
        // Tentar novamente com autenticação forçada (só uma vez para evitar loop)
        if (!forceAuth) {
          return await fetchGameData(userId, true);
        } else {
          return {
            success: false,
            error: `Erro de autenticação persistente: ${data.errorCode}`,
            needsAuth: true
          };
        }
      }
      
      return {
        success: false,
        error: `API Pragmatic retornou erro: ${data.errorCode}`,
        needsAuth: true
      };
    }

    if (!Array.isArray(data.history)) {
      console.error('❌ [INSIGHTS-DATA] Histórico não é um array:', typeof data.history);
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

    // Log removido: verbose demais no terminal

    return {
      success: true,
      data: {
        results: processedResults,
        timestamp: Date.now(),
        userId: userId,
        resultsCount: processedResults.length
      }
    };
  } catch (error) {
    console.error('❌ [INSIGHTS-DATA] Erro na coleta:', error);
    return {
      success: false,
      error: `Erro na coleta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

// Handler para requisições POST
export async function POST(request: NextRequest) {
  try {
    // 🔗 AFINIDADE DE SESSÃO: Verificar se deve processar nesta instância
    // 🆔 BYPASS: Permitir chamadas internas sem afinidade
    const isInternalCall = request.headers.get('x-internal-call') === 'true';
    
    if (!isInternalCall && !SimpleSessionAffinity.shouldServeUser(request)) {
      const cookies = request.headers.get('cookie') || '';
      const sessionInstanceId = cookies.match(/fly-instance-id=([^;]+)/)?.[1];
      
      if (sessionInstanceId) {
        console.log(`🔄 [SESSION-AFFINITY-BMGBR1-INSIGHTS] Redirecionando para instância: ${sessionInstanceId}`);
        return new Response(
          JSON.stringify({ message: 'Redirecionando para instância correta' }),
          { 
            status: 409,
            headers: { 
              'Content-Type': 'application/json',
              'fly-replay': `instance=${sessionInstanceId}`
            }
          }
        );
      }
    }

    const body = await request.json();
    const { user_id, action } = body;

    if (!user_id) {
      return createBMGBR1InsightsSessionResponse(NextResponse.json(
        { error: 'User ID é obrigatório' },
        { status: 400 }
      ));
    }

    // Log removido: verbose demais no terminal

    // Processar diferentes ações
    switch (action) {
      case 'start':
        return createBMGBR1InsightsSessionResponse(NextResponse.json({
          success: true,
          message: 'Coleta de insights iniciada com sucesso'
        }));

      case 'stop':
        // Limpar token do usuário
        userTokens.delete(user_id);
        console.log(`🗑️ [INSIGHTS-CACHE] Cache limpo para usuário: ${user_id}`);
        return createBMGBR1InsightsSessionResponse(NextResponse.json({
          success: true,
          message: 'Coleta de insights parada e cache limpo com sucesso'
        }));

      case 'get':
      case 'get-full':
        const result = await fetchGameData(user_id);
        return createBMGBR1InsightsSessionResponse(NextResponse.json(result));

      default:
        return createBMGBR1InsightsSessionResponse(NextResponse.json(
          { error: 'Ação não reconhecida' },
          { status: 400 }
        ));
    }
  } catch (error) {
    console.error('❌ [INSIGHTS-API] Erro no processamento:', error);
    return NextResponse.json(
      { 
        error: 'Erro interno do servidor',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
}

// Handler para requisições GET
export async function GET() {
  try {
    // 🧹 LIMPEZA AUTOMÁTICA antes de retornar status
    cleanupExpiredTokens();
    
    const now = Date.now();
    const tokenStatus = Array.from(userTokens.entries()).map(([userId, token]) => ({
      userId,
      tokenAge: now - token.timestamp,
      timeToExpire: token.expiresAt - now,
      isValid: isTokenValid(token),
      hasToken: !!token.jsessionId
    }));

    return NextResponse.json({
      success: true,
      data: {
        tokenStatus,
        totalActiveUsers: userTokens.size,
        validTokens: tokenStatus.filter(t => t.isValid).length,
        expiredTokens: tokenStatus.filter(t => !t.isValid).length,
        timestamp: now,
        cacheStats: {
          totalCacheSize: userTokens.size,
          tokenTTL: TOKEN_TTL,
          cacheHitsPossible: tokenStatus.filter(t => t.isValid).length
        }
      }
    });
  } catch (error) {
    console.error('❌ [INSIGHTS-API] Erro no GET:', error);
    return NextResponse.json(
      { 
        error: 'Erro interno do servidor',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
}

// 🔗 HELPER: Wrapper para adicionar cookie de afinidade de sessão no insights BMGBR1
function createBMGBR1InsightsSessionResponse(response: NextResponse): NextResponse {
  const instanceId = SimpleSessionAffinity.getCurrentInstanceId();
  
  // Adicionar cookie de afinidade de sessão
  response.headers.set('Set-Cookie', 
    `fly-instance-id=${instanceId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`
  );
  
  return response;
}