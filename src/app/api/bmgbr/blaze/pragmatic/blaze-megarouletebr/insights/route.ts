import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserBlazeToken } from '../../auth';

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
  timestamp: number;
}

// 🔥 NOVO: Armazenamento simples de jsessionId por usuário
const userTokens = new Map<string, TokenStorage>();

// Cache de números vermelhos
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

// 🔥 FUNÇÃO DE RENOVAÇÃO COMPLETA DE TOKENS
// Gera toda a cadeia: blazeToken → ppToken → jsessionId → nova URL Pragmatic
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

    // Usar a implementação funcional do route.ts
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/bmgbr/blaze/pragmatic/blaze-megarouletebr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: userId,
        action: 'generate-client-tokens',
        blazeToken: tokenResult.token,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        acceptLanguage: 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        selectedCurrencyType: 'BRL'
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ [INSIGHTS-AUTH] Erro na API route.ts:', response.status, errorData);
      return {
        success: false,
        error: `Erro na autenticação: ${response.status}`
      };
    }

    const result = await response.json();
    
    if (!result.success) {
      console.error('❌ [INSIGHTS-AUTH] Falha na autenticação:', result.error);
      return {
        success: false,
        error: result.error || 'Erro na autenticação'
      };
    }

    const tokens = {
      blazeToken: tokenResult.token!,
      ppToken: result.data.ppToken,
      jsessionId: result.data.jsessionId,
      pragmaticUserId: result.data.pragmaticUserId
    };

    // Salvar jsessionId para uso futuro
    userTokens.set(userId, {
      userId,
      jsessionId: tokens.jsessionId,
      timestamp: Date.now()
    });

    console.log('✅ [INSIGHTS-AUTH] Renovação completa de tokens concluída - blazeToken → ppToken → jsessionId → URL válida');
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

// 🔥 NOVO: Função para buscar dados diretamente da API Pragmatic
async function fetchGameData(userId: string, forceAuth = false) {
  try {
    let tokenData = userTokens.get(userId);
    
    // Se não tem token ou forçar autenticação, autenticar
    if (!tokenData || forceAuth) {
      const authResult = await authenticateUser(userId);
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error
        };
      }
      tokenData = userTokens.get(userId);
    }

    if (!tokenData) {
      return {
        success: false,
        error: 'Erro ao obter token de sessão'
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

    console.log(`✅ [INSIGHTS-DATA] Coletados ${processedResults.length} resultados`);

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
    const body = await request.json();
    const { user_id, action } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'User ID é obrigatório' },
        { status: 400 }
      );
    }

    console.log(`🚀 [INSIGHTS-API] Processando ação: ${action} para usuário: ${user_id}`);

    // Processar diferentes ações
    switch (action) {
      case 'start':
        return NextResponse.json({
          success: true,
          message: 'Coleta de insights iniciada com sucesso'
        });

      case 'stop':
        // Limpar token do usuário
        userTokens.delete(user_id);
        return NextResponse.json({
          success: true,
          message: 'Coleta de insights parada com sucesso'
        });

      case 'get':
      case 'get-full':
        const result = await fetchGameData(user_id);
        return NextResponse.json(result);

      default:
        return NextResponse.json(
          { error: 'Ação não reconhecida' },
          { status: 400 }
        );
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
    const tokenStatus = Array.from(userTokens.entries()).map(([userId, token]) => ({
      userId,
      tokenAge: Date.now() - token.timestamp,
      hasToken: !!token.jsessionId
    }));

    return NextResponse.json({
      success: true,
      data: {
        tokenStatus,
        totalActiveUsers: userTokens.size,
        timestamp: Date.now()
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