/**
 * 🧪 BOTS2 - ROUTE - VERSÃO DE TESTES
 * 
 * Esta é uma cópia do endpoint principal original para testes
 * de novas funcionalidades sem interferir no sistema em produção.
 * 
 * API: /api/bots2/blaze/pragmatic/blaze-megarouletebr
 */
import { NextRequest, NextResponse } from 'next/server';
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';
import { 
  AuthResult,
  getUserBlazeToken,
  validateClientTokens,
  debugAuth
} from '../auth';
import { getBaseUrl } from '@/lib/utils';

// Interface consolidada para configuração
interface MegaRouletteConfig {
  userId: string;
  action?: 'bet-connect' | 'start-operation' | 'stop-operation' | 'get-websocket-logs' | 'get-operation-report' | 'reset-operation-report' | 'get-connection-status' | 'server-diagnostic' | 'get-sessions-history' | 'blaze-proxy' | 'pragmatic-proxy' | 'debug-auth' | 'get-blaze-token' | 'frontend-auth' | 'generate-client-tokens';
  forceClientSideAuth?: boolean;
  // Dados para proxies
  blazeToken?: string;
  selectedCurrencyType?: string;
  userAgent?: string;
  acceptLanguage?: string;
  realBrowserHeaders?: any;
  params?: string;
  userFingerprint?: any;
  // Dados para debug
  testType?: string;
}



// Interface simplificada
interface SimpleConfig {
  userId: string;
  action: string;
}

// Armazenamento dos logs do WebSocket
const websocketLogs: { [userId: string]: Array<{ timestamp: number; message: string; type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' }> } = {};
const connectionStatus: { [userId: string]: { connected: boolean; error?: string; lastUpdate: number } } = {};

// NOVO: Sistema dos últimos 7 resultados para padrão de repetição
const lastSevenResults: { [userId: string]: Array<{ number: number; color: string; gameId: string; timestamp: number }> } = {};

// NOVO: Estados para controle de padrões com 3 ciclos
const operationState: { [userId: string]: {
  active: boolean; 
  basePattern: string[];           // ['R', 'B', 'R', 'B', 'R'] - padrão base detectado (posições 1-5)
  currentCycle: number;            // 1, 2 ou 3 (qual ciclo está executando)
  currentLevel: number;            // 1-5 (qual posição do padrão no ciclo atual)
  martingaleLevel: number;         // 0-9 (nível do martingale M1-M10)
  waitingForResult: boolean;
  lastGameId?: string;
  strategy: {
    sequences: number[];           // [20.00, 20.00, 21.00, 4.00, 2.50, 2.50, 2.00, 1.50, 1.00, 0.50] - Nova estrutura personalizada
    maxMartingale: number;        // 10

    cycleDistribution: {          // Distribuição dos M1-M10 pelos 3 ciclos
      cycle1: { levels: [3, 4, 5], martingales: [0, 1, 2] };        // M1, M2, M3
      cycle2: { levels: [1, 2, 3, 4, 5], martingales: [3, 4, 5, 6, 7] }; // M4, M5, M6, M7, M8
      cycle3: { levels: [1, 2], martingales: [8, 9] };              // M9, M10
    };
  };
  stats: {
    totalBets: number;
    wins: number;
    losses: number;
    profit: number;
    startedAt: number;
  };
  // ✅ NOVO: Controle de novo padrão
  needsNewPattern: boolean;        // Se precisa aguardar novo padrão válido
} } = {};

// Controle de conexões WebSocket
const activeWebSockets: { [userId: string]: {
  ws: any;
  sessionId: string;
  createdAt: number;
  lastActivity: number;
} } = {};

// NOVO: Controle de sessões para renovação automática
const sessionControl: { [userId: string]: {
  jsessionId: string;
  ppToken: string;
  pragmaticUserId: string;
  createdAt: number;
  lastRenewal: number;
  renewalAttempts: number;
  maxRenewalAttempts: number;
} } = {};

// NOVO: Timers para renovação automática
const renewalTimers: { [userId: string]: NodeJS.Timeout } = {};

// Controle de reconexões WebSocket
const reconnectionControl: { [userId: string]: {
  attempts: number;
  lastAttempt: number;
  maxAttempts: number;
  backoffDelay: number;
} } = {};

// NOVO: Controle para começar a coletar resultados apenas após primeiro "apostas fechadas"
const resultCollectionEnabled: { [userId: string]: boolean } = {};

// NOVO: Controle do estado das apostas (abertas/fechadas) para timing do botão
const bettingWindowState: { [userId: string]: {
  isOpen: boolean;           // Se a janela de apostas está aberta
  currentGameId?: string;    // ID do jogo atual
  lastUpdate: number;        // Timestamp da última atualização
} } = {};

// 📊 NOVO: Rastreamento de uso de martingale por usuário
const martingaleUsageStats: { [userId: string]: number[] } = {};

// 📊 FUNÇÃO: Registrar uso de martingale
function recordMartingaleUsage(userId: string, martingaleLevel: number) {
  // Inicializar array se não existir
  if (!martingaleUsageStats[userId]) {
    martingaleUsageStats[userId] = new Array(10).fill(0);
  }
  
  // Registrar uso (martingaleLevel já está 0-indexed)
  if (martingaleLevel >= 0 && martingaleLevel < 10) {
    martingaleUsageStats[userId][martingaleLevel]++;
    addWebSocketLog(userId, `📊 Registrado uso M${martingaleLevel + 1} - Total: ${martingaleUsageStats[userId][martingaleLevel]}`, 'info');
  }
}

// 📊 FUNÇÃO: Resetar estatísticas de martingale
function resetMartingaleUsage(userId: string) {
  martingaleUsageStats[userId] = new Array(10).fill(0);
  addWebSocketLog(userId, `📊 Estatísticas de martingale resetadas`, 'info');
}

// Sistema de humanização removido

// Estratégia Martingale personalizada - Nova estrutura
const MARTINGALE_SEQUENCES = [20.00, 20.00, 21.00, 4.00, 2.50, 2.50, 2.00, 1.50, 1.00, 0.50];

// Funções de sessão simplificadas (removidas - não essenciais)

// Função principal POST
export async function POST(request: NextRequest) {
  try {
    // ✅ MELHORADO: Capturar dados completos do cliente
    const clientIP = 
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-client-ip') ||
      'unknown';

    // ✅ NOVO: Capturar headers reais do navegador
    const clientUserAgent = request.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const clientLanguage = request.headers.get('accept-language') || 'pt-BR,pt;q=0.9,en;q=0.8';
    const clientAccept = request.headers.get('accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    const clientAcceptEncoding = request.headers.get('accept-encoding') || 'gzip, deflate, br';
    const clientReferer = request.headers.get('referer') || 'https://blaze.bet.br/';

    let requestBody;
    try {
      requestBody = await request.json();
    } catch (jsonError) {
      return NextResponse.json({
        success: false,
        error: 'Dados da requisição inválidos - JSON malformado'
      }, { status: 400 });
    }

    const { 
      userId, 
      action = 'bet-connect', 
      tipValue, 
      userFingerprint, 
      clientHeaders, 
      clientMetadata, 
      authTokens, 
      forceClientSideAuth,
      // Novos campos para funcionalidades consolidadas
      blazeToken,
      selectedCurrencyType,
      userAgent,
      acceptLanguage,
      realBrowserHeaders,
      params,
      testType
    } = requestBody;

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'userId é obrigatório'
      }, { status: 400 });
    }

    // ✅ Log apenas uma vez os dados capturados (só na primeira conexão)
    if (action === 'bet-connect') {
      addWebSocketLog(userId, `🔍 Dados reais capturados (primeira conexão):`, 'info');
      addWebSocketLog(userId, `📱 User-Agent: ${userFingerprint?.userAgent || clientUserAgent}`, 'info');
      addWebSocketLog(userId, `🌍 IP: ${clientIP}`, 'info');
      addWebSocketLog(userId, `🗣️ Idioma: ${userFingerprint?.language || clientLanguage}`, 'info');
      if (userFingerprint?.platform) addWebSocketLog(userId, `🖥️ Plataforma: ${userFingerprint.platform}`, 'info');
      if (userFingerprint?.screenResolution) addWebSocketLog(userId, `📺 Resolução: ${userFingerprint.screenResolution}`, 'info');
      if (userFingerprint?.timezone) addWebSocketLog(userId, `🕐 Timezone: ${userFingerprint.timezone}`, 'info');
    }

    // Ações disponíveis
    switch (action) {
      case 'bet-connect':
        return await connectToBettingGame(userId, tipValue, clientIP, userFingerprint, {
          userAgent: userFingerprint?.userAgent || clientUserAgent,
          language: clientLanguage,
          accept: clientAccept,
          acceptEncoding: clientAcceptEncoding,
          referer: clientReferer,
          // Dados adicionais do navegador
          platform: userFingerprint?.platform,
          timezone: userFingerprint?.timezone,
          screenResolution: userFingerprint?.screenResolution,
          colorDepth: userFingerprint?.colorDepth,
          pixelRatio: userFingerprint?.pixelRatio,
          hardwareConcurrency: userFingerprint?.hardwareConcurrency,
          connectionType: userFingerprint?.connectionType
        }, authTokens, forceClientSideAuth);
      
      case 'start-operation':
        return await startSimpleOperation(userId);
      
      case 'stop-operation':
        return await stopSimpleOperation(userId);
      
      case 'get-websocket-logs':
      return await getWebSocketLogs(userId);
      
      case 'get-operation-report':
      return await getOperationReport(userId);

      case 'reset-operation-report':
      return await resetOperationReport(userId);
      
      case 'get-connection-status':
      return await getConnectionStatus(userId);
      
      case 'server-diagnostic':
        return await getServerDiagnostic();
      
      case 'get-sessions-history':
        return await getSessionsHistory(userId);
      
      // 🔥 NOVO: Funcionalidades consolidadas
      case 'debug-auth':
        if (!testType) {
          return NextResponse.json({
            success: false,
            error: 'testType é obrigatório para debug-auth'
          }, { status: 400 });
        }
        const debugResult = await debugAuth(testType, userId);
        return NextResponse.json(debugResult);
      
      case 'get-blaze-token':
        const tokenResult = await getUserBlazeToken(userId);
        return NextResponse.json(tokenResult);

      case 'generate-client-tokens':
        if (!blazeToken) {
          return NextResponse.json({
            success: false,
            error: 'blazeToken é obrigatório para generate-client-tokens'
          }, { status: 400 });
        }

        try {
          console.log('🔄 [PROXY] Gerando tokens via proxy server-side com headers do browser...');
          
          // ✅ ETAPA 1: Gerar ppToken via proxy
          console.log('🎯 [PROXY] Chamando Blaze para ppToken...');
          
          const blazeHeaders = {
            'Authorization': `Bearer ${blazeToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': acceptLanguage || 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Origin': 'https://blaze.bet.br',
            'Referer': 'https://blaze.bet.br/pt/games/mega-roulette---brazilian',
            'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'DNT': '1',
            'X-Requested-With': 'XMLHttpRequest',
            // Adicionar headers reais do browser
            ...realBrowserHeaders
          };

          const blazeResponse = await fetch('https://blaze.bet.br/api/games/mega-roulette---brazilian/play', {
            method: 'POST',
            headers: blazeHeaders,
            body: JSON.stringify({
              selected_currency_type: selectedCurrencyType || 'BRL'
            })
          });

          if (!blazeResponse.ok) {
            const errorText = await blazeResponse.text();
            console.error('❌ [PROXY] Erro na Blaze:', blazeResponse.status, errorText);
            return NextResponse.json({
              success: false,
              error: `Erro da Blaze: ${blazeResponse.status} - ${errorText}`
            }, { status: blazeResponse.status });
          }

          const blazeData = await blazeResponse.json();
          console.log('✅ [PROXY] Resposta da Blaze recebida');
          
          // Extrair ppToken
          if (!blazeData.url || !blazeData.url.includes('playGame.do')) {
            console.error('❌ [PROXY] URL de jogo não encontrada');
            return NextResponse.json({
              success: false,
              error: 'URL de jogo não encontrada na resposta da Blaze'
            }, { status: 400 });
          }

          const ppTokenMatch = blazeData.url.match(/token%3D([^%]+)/);
          if (!ppTokenMatch) {
            console.error('❌ [PROXY] ppToken não encontrado');
            return NextResponse.json({
              success: false,
              error: 'ppToken não encontrado na resposta da Blaze'
            }, { status: 400 });
          }

          const ppToken = ppTokenMatch[1];
          console.log('✅ [PROXY] ppToken extraído com sucesso');

          // ✅ ETAPA 2: Gerar jsessionId via proxy
          console.log('🎮 [PROXY] Chamando Pragmatic para jsessionId...');
          
          // Aguardar 2 segundos conforme recomendação
          await new Promise(resolve => setTimeout(resolve, 2000));

          const extraData = {
            lobbyUrl: 'https://blaze.bet.br',
            requestCountryCode: 'BR',
            cashierUrl: 'https://blaze.bet.br/?modal=cashier&type=deposit',
            language: 'pt-BR',
            currency: 'BRL',
            technology: 'H5',
            platform: 'WEB',
            timezone: 'America/Sao_Paulo',
            region: 'BR',
            locale: 'pt-BR'
          };

          const pragmaticParams = new URLSearchParams({
            environmentID: '247',
            gameid: '287',
            secureLogin: 'sfws_blazecombrsw',
            requestCountryCode: 'BR',
            userEnvId: '247',
            ppCasinoId: '6376',
            ppGame: '287',
            ppToken: ppToken,
            ppExtraData: btoa(JSON.stringify(extraData)),
            isGameUrlApiCalled: 'true',
            stylename: 'sfws_blazecombrsw'
          });

          const pragmaticUrl = `https://games.pragmaticplaylive.net/api/secure/GameLaunch?${pragmaticParams}`;
          
          const pragmaticHeaders = {
            'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': acceptLanguage || 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'DNT': '1',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            'Connection': 'keep-alive',
            'Priority': 'u=0, i',
            // Adicionar headers reais do browser
            ...realBrowserHeaders
          };

          const pragmaticResponse = await fetch(pragmaticUrl, {
            method: 'GET',
            headers: pragmaticHeaders,
            redirect: 'manual'
          });

          console.log('📊 [PROXY] Status da resposta Pragmatic:', pragmaticResponse.status);

          let jsessionId = null;

          // Verificar redirect (302)
          if (pragmaticResponse.status === 302) {
            const location = pragmaticResponse.headers.get('location');
            console.log('🔄 [PROXY] Redirect detectado');
            if (location && location.includes('JSESSIONID=')) {
              const jsessionMatch = location.match(/JSESSIONID=([^&]+)/);
              if (jsessionMatch) {
                jsessionId = jsessionMatch[1];
                console.log('✅ [PROXY] jsessionId extraído do redirect');
              }
            }
          }

          // Verificar set-cookie header como fallback
          if (!jsessionId) {
            const setCookieHeader = pragmaticResponse.headers.get('set-cookie');
            if (setCookieHeader && setCookieHeader.includes('JSESSIONID=')) {
              const jsessionMatch = setCookieHeader.match(/JSESSIONID=([^;]+)/);
              if (jsessionMatch) {
                jsessionId = jsessionMatch[1];
                console.log('✅ [PROXY] jsessionId extraído do cookie');
              }
            }
          }

          if (!jsessionId) {
            console.error('❌ [PROXY] jsessionId não encontrado');
            return NextResponse.json({
              success: false,
              error: 'jsessionId não encontrado na resposta do Pragmatic'
            }, { status: 400 });
          }

          // ✅ Retornar tokens gerados
          const authData = {
            userId: userId,
            originalUserId: userId,
            ppToken: ppToken,
            jsessionId: jsessionId,
            pragmaticUserId: `user_${Date.now()}`,
            timestamp: new Date().toISOString()
          };

          console.log('✅ [PROXY] Tokens gerados com sucesso via proxy');
          return NextResponse.json({
            success: true,
            data: authData,
            message: 'Tokens gerados com sucesso via proxy server-side'
          });

        } catch (error) {
          console.error('❌ [PROXY] Erro no proxy de tokens:', error);
          return NextResponse.json({
            success: false,
            error: `Erro no proxy: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
          }, { status: 500 });
        }
      
      // ❌ REMOVIDO: blaze-proxy, pragmatic-proxy, frontend-auth agora são client-side apenas
      case 'blaze-proxy':
      case 'pragmatic-proxy':
      case 'frontend-auth':
        return NextResponse.json({
          success: false,
          error: 'Esta função foi movida para client-side. Use o browser para gerar tokens.'
        }, { status: 400 });
      
      default:
      return NextResponse.json({
        success: false,
          error: `Ação "${action}" não implementada`
    }, { status: 400 });
    }

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor'
    }, { status: 500 });
  }
}

// Funções de token removidas (usamos Edge Function)



// Função para adicionar log
function addWebSocketLog(userId: string, message: string, type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' = 'info') {
  if (!websocketLogs[userId]) {
    websocketLogs[userId] = [];
  }
  
  websocketLogs[userId].unshift({
    timestamp: Date.now(),
    message,
    type
  });
  
  // Manter apenas os últimos 50 logs
  if (websocketLogs[userId].length > 50) {
    websocketLogs[userId] = websocketLogs[userId].slice(0, 50);
  }
  
}

// NOVO: Função para processar resultado do jogo
function processGameResult(userId: string, gameId: string, number: number, color: string) {
  // Verifica se a coleta de resultados está habilitada (só após primeiro "apostas fechadas")
  if (!resultCollectionEnabled[userId]) {
    addWebSocketLog(userId, `⏳ Resultado ignorado (aguardando primeiro "apostas fechadas"): ${number} ${color}`, 'info');
    return;
  }

  const colorCode = number === 0 ? 'green' : (color === 'red' ? 'R' : 'B');
  
  // Se for zero e há operação ativa, processa como derrota
  if (number === 0 && operationState[userId]?.active) {
    addWebSocketLog(userId, `🟢 Zero detectado: ${number} - processando como derrota`, 'game');
    processOperationResult(userId, 'green');
    return;
  }
  
  // Ignora zeros apenas para coleta de padrões (não para operação ativa)
  if (number === 0) {
    addWebSocketLog(userId, `🟢 Zero ignorado para padrão (${number})`, 'game');
    return;
  }
  
  // Adiciona aos últimos 7 resultados
  if (!lastSevenResults[userId]) {
    lastSevenResults[userId] = [];
  }
  
  lastSevenResults[userId].push({
    number,
    color: colorCode,
    gameId,
    timestamp: Date.now()
  });
  
  // Mantém apenas os últimos 7
  if (lastSevenResults[userId].length > 7) {
    lastSevenResults[userId].shift();
  }
  
  addWebSocketLog(userId, `🎲 Resultado: ${number} ${color} | Últimos 7: ${lastSevenResults[userId].map((r: any) => r.color).join('')}`, 'game');
  
  // Se operação ativa, processa aposta PRIMEIRO
  if (operationState[userId]?.active) {
    processOperationResult(userId, colorCode);
  }
  
  // ✅ NOVO: Verificar se está aguardando novo padrão (após processar resultado)
  if (operationState[userId]?.needsNewPattern) {
    // 🚀 IMEDIATO: Pega os últimos 7 do histórico para detectar padrão de repetição
    if (lastSevenResults[userId].length >= 7) {
      const results = lastSevenResults[userId];
      if (isValidPattern(results)) {
        addWebSocketLog(userId, `🎯 PADRÃO DE REPETIÇÃO VÁLIDO detectado usando últimos 7`, 'success');
        createNewPattern(userId);
      } else {
        const historicPattern = results.map((r: any) => r.color).join('');
        addWebSocketLog(userId, `⏳ Padrão ${historicPattern} não é de repetição - Aguardando próximo resultado...`, 'info');
      }
    } else {
      addWebSocketLog(userId, `⏳ Aguardando mais resultados para formar padrão (${lastSevenResults[userId].length}/7)`, 'info');
    }
    return; // Não processa mais nada enquanto aguarda padrão
  }
  
  // ✅ REATIVAÇÃO: apenas se não está aguardando novo padrão E padrão é válido
  if (operationState[userId] && !operationState[userId].active && !operationState[userId].needsNewPattern && lastSevenResults[userId].length >= 7) {
    const results = lastSevenResults[userId];
    if (isValidPattern(results)) {
      addWebSocketLog(userId, `🔄 REATIVAÇÃO: Padrão de repetição válido detectado`, 'success');
      createNewPattern(userId);
    } else {
      const historicPattern = results.map((r: any) => r.color).join('');
      addWebSocketLog(userId, `⏳ REATIVAÇÃO: Padrão ${historicPattern} não é de repetição - Aguardando...`, 'info');
    }
  }
}

// ✅ NOVA FUNÇÃO: Validar padrão de repetição (7 resultados)
function isValidPattern(results: any[]): boolean {
  if (results.length !== 7) return false;
  
  // ✅ NOVA VALIDAÇÃO: Rejeitar se todas as cores forem iguais
  const allColors = results.map((r: any) => r.color);
  const firstColor = allColors[0];
  const allSameColor = allColors.every((color: string) => color === firstColor);
  
  if (allSameColor) {
    return false; // ❌ Tudo da mesma cor não é um padrão válido
  }
  
  // Verificar se posição 6 = posição 1 E posição 7 = posição 2
  const pos1 = results[0].color; // Posição 1
  const pos2 = results[1].color; // Posição 2
  const pos6 = results[5].color; // Posição 6
  const pos7 = results[6].color; // Posição 7
  
  // Padrão de repetição: [1,2,3,4,5,1,2] - os últimos 2 devem repetir os 2 primeiros
  return pos6 === pos1 && pos7 === pos2;
}

// ✅ NOVA FUNÇÃO: Criar padrão de repetição com 3 ciclos
// NOVA FUNÇÃO: Inverte as cores do padrão (apostar CONTRA o histórico)
function invertColor(color: string): string {
  if (color === 'R') return 'B';      // Vermelho → Preto
  if (color === 'B') return 'R';      // Preto → Vermelho
  return color; // green permanece green (não inverte)
}

function createNewPattern(userId: string) {
  const operation = operationState[userId];
  if (!operation) return;
  
  const results = lastSevenResults[userId] || [];
  
  if (results.length >= 7) {
    // ✅ VALIDAR PADRÃO DE REPETIÇÃO ANTES DE USAR
    if (!isValidPattern(results)) {
      const historicPattern = results.map((r: any) => r.color).join('');
      addWebSocketLog(userId, `❌ Padrão rejeitado: ${historicPattern} - Não é padrão de repetição`, 'info');
      
      // Não ativa operação, apenas aguarda próximo resultado
      operation.active = false;
      operation.needsNewPattern = false;
      return;
    }
    
    // ✅ NOVO: APOSTAR CONTRA O PADRÃO (INVERSÃO DE CORES)
    const historicColors = results.slice(0, 5).map((r: any) => r.color); // Cores históricas
    operation.basePattern = historicColors.map(invertColor); // ✅ INVERTE as cores para apostar CONTRA
    operation.currentCycle = 1;      // Iniciar no Ciclo 1
    operation.currentLevel = 2;      // Iniciar no nível 3 (índice 2 = posição 3 do padrão)
    operation.martingaleLevel = 0;   // Iniciar no M1
    operation.waitingForResult = false;
    operation.active = true;
    operation.needsNewPattern = false;
    
    const historicPattern = historicColors.join('');
    const basePatternStr = operation.basePattern.join('');
    
    addWebSocketLog(userId, `✅ Padrão de repetição detectado: ${results.map((r: any) => r.color).join('')}`, 'success');
    addWebSocketLog(userId, `📊 Histórico: ${historicPattern} → Apostas: ${basePatternStr} (CONTRA o padrão)`, 'success');
    addWebSocketLog(userId, `📋 Confirmação: ${results[5].color}=${results[0].color} e ${results[6].color}=${results[1].color}`, 'success');
    addWebSocketLog(userId, `🚀 Iniciando Ciclo 1, Nível 3 (M1) - Apostará em: ${operation.basePattern[2]} (contra ${historicColors[2]})`, 'success');
  } else {
    addWebSocketLog(userId, `⏳ Aguardando mais resultados para formar padrão (${results.length}/7)`, 'info');
    operation.active = false;
    operation.needsNewPattern = false;
  }
}

// NOVO: Função para processar resultado da operação
function processOperationResult(userId: string, resultColor: string) {
  const operation = operationState[userId];
  if (!operation || !operation.active || !operation.strategy?.sequences) {
    addWebSocketLog(userId, '❌ Estado da operação inválido para processar resultado', 'error');
    return;
  }

  // ✅ NOVA LÓGICA: Usa módulo para repetir padrão nos níveis 6-10
  const patternIndex = operation.currentLevel % 5; // 0-4, depois repete
  const expectedColor = operation.basePattern[patternIndex];
  // ✅ ZERO SEMPRE CONTA COMO DERROTA - só ganha se for exatamente a cor apostada
  const isWin = (resultColor === expectedColor && resultColor !== 'green');
  
  operation.stats.totalBets++;
  operation.waitingForResult = false; // ✅ SEMPRE libera para próxima aposta
  
  // ✅ Determinar qual ciclo do padrão está executando
  const cycle = Math.floor(operation.currentLevel / 5) + 1; // 1º ciclo (1-5) ou 2º ciclo (6-10)
  const positionInCycle = (operation.currentLevel % 5) + 1; // Posição 1-5 dentro do ciclo
  
  if (isWin) {
    // ✅ GANHOU - SEMPRE busca novo padrão
    operation.stats.wins++;
    
    const betAmount = operation.strategy?.sequences?.[operation.martingaleLevel];
    operation.stats.profit += betAmount;
    
    const expectedColorName = COLOR_NAMES[expectedColor] || expectedColor;
    const resultColorName = COLOR_NAMES[resultColor] || resultColor;
    
    addWebSocketLog(userId, `✅ VITÓRIA M${operation.martingaleLevel + 1}! Apostou ${expectedColorName} R$ ${betAmount.toFixed(2)} → Veio ${resultColorName}`, 'success');
    addWebSocketLog(userId, `🎉 VITÓRIA no ${cycle}º ciclo (posição ${positionInCycle}) - Aguardando novo padrão...`, 'success');
    
    // ✅ QUALQUER VITÓRIA = NOVO PADRÃO
    operation.needsNewPattern = true;
    operation.active = false;
    
  } else {
    // ❌ PERDEU - Lógica especial para VERDE vs COR ERRADA
    operation.stats.losses++;
    
    const betAmount = operation.strategy?.sequences?.[operation.martingaleLevel];
    operation.stats.profit -= betAmount;
    
    const expectedColorName = COLOR_NAMES[expectedColor] || expectedColor;
    const resultColorName = COLOR_NAMES[resultColor] || resultColor;
    
    // ✅ NOVA REGRA: Comportamento diferente para VERDE vs COR ERRADA
    const isGreenDefeat = resultColor === 'green';
    const defeatReason = isGreenDefeat ? '(ZERO)' : `(${resultColorName})`;
    
    addWebSocketLog(userId, `❌ DERROTA M${operation.martingaleLevel + 1}! Apostou ${expectedColorName} R$ ${betAmount.toFixed(2)} → Veio ${resultColorName} ${defeatReason}`, 'error');
    
    if (isGreenDefeat) {
      // 🟢 VERDE: Avança APENAS Martingale, MANTÉM mesmo nível
      addWebSocketLog(userId, `🟢 VERDE ESPECIAL: Mantendo mesmo nível, avançando apenas Martingale`, 'info');
      operation.martingaleLevel++; // Só avança martingale
      // operation.currentLevel NÃO MUDA!
    } else {
      // 🔴/⚫ COR ERRADA: Avança nível E martingale (lógica original)
      addWebSocketLog(userId, `🎯 COR ERRADA: Avançando nível e Martingale`, 'info');
      operation.currentLevel++;    // Avança nível do padrão
      operation.martingaleLevel++; // Avança martingale
    }
    
    // ✅ Verificar se atingiu M10 (máximo da sequência)
    if (operation.martingaleLevel >= 10) {
      addWebSocketLog(userId, `🛑 MARTINGALE M10 PERDIDO - Aguardando novo padrão`, 'error');
      addWebSocketLog(userId, `💰 Sequência M1-M10 completada - Buscando novo padrão`, 'error');
      
      operation.needsNewPattern = true;
      operation.active = false;
    } else {
      // ✅ Continua operação - mostrar próxima aposta
      const nextPatternIndex = operation.currentLevel % 5;
      const nextColor = operation.basePattern[nextPatternIndex];
      const nextColorName = COLOR_NAMES[nextColor] || nextColor;
      const nextCycle = Math.floor(operation.currentLevel / 5) + 1;
      const nextPositionInCycle = (operation.currentLevel % 5) + 1;
      
      // ✅ Log especial quando muda de ciclo (do nível 5 para 1 do 2º ciclo)
      if (operation.currentLevel === 5) {
        addWebSocketLog(userId, `🔄 INICIANDO 2º CICLO - Repetindo mesmo padrão nos níveis M4-M8`, 'info');
      }
      
      if (isGreenDefeat) {
        addWebSocketLog(userId, `🔄 Próxima aposta: M${operation.martingaleLevel + 1} no ${nextCycle}º ciclo posição ${nextPositionInCycle} (${nextColorName}) - REPETINDO posição por causa do verde`, 'info');
      } else {
        addWebSocketLog(userId, `🔄 Próxima aposta: M${operation.martingaleLevel + 1} no ${nextCycle}º ciclo posição ${nextPositionInCycle} (${nextColorName})`, 'info');
      }
    }
  }
}

// NOVO: Função para renovar sessão automaticamente
async function renewSession(userId: string): Promise<boolean> {
  try {
    const session = sessionControl[userId];
    if (!session) {
      addWebSocketLog(userId, '❌ Sessão não encontrada para renovação', 'error');
      return false;
    }

    if (session.renewalAttempts >= session.maxRenewalAttempts) {
      addWebSocketLog(userId, '❌ Máximo de tentativas de renovação atingido', 'error');
      return false;
    }

    addWebSocketLog(userId, '🔄 Renovando sessão automaticamente...', 'info');
    session.renewalAttempts++;

    // ✅ USAR EDGE FUNCTION: Renovar sessão usando Supabase Edge Function
    try {
      const tokenResult = await getUserBlazeToken(userId);
      
      if (!tokenResult.success || !tokenResult.token) {
        addWebSocketLog(userId, `❌ Token da Blaze não encontrado: ${tokenResult.error}`, 'error');
        return false;
      }

      addWebSocketLog(userId, `🚀 Renovando via Supabase Edge Function...`, 'info');

      const realBrowserHeaders = {
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'X-Requested-With': 'XMLHttpRequest'
      };

      const authResponse = await fetch('https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd2Vra3FoY2lwdmdodnF2dnR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDkwNTcsImV4cCI6MjA2Mzk4NTA1N30.s9atBox8lrUba0Cb5qnH_dHTVJQkvwupoS2L6VneXHA'
        },
        body: JSON.stringify({
          action: 'generate-tokens',
          blazeToken: tokenResult.token,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          acceptLanguage: 'pt-BR,pt;q=0.9,en;q=0.8',
          selectedCurrencyType: 'BRL',
          realBrowserHeaders: realBrowserHeaders
        })
      });

      if (!authResponse.ok) {
        addWebSocketLog(userId, `❌ Erro na Edge Function: ${authResponse.status}`, 'error');
        return false;
      }

      const authResult = await authResponse.json();
      
      if (!authResult.success || !authResult.data) {
        addWebSocketLog(userId, `❌ Falha na Edge Function: ${authResult.error}`, 'error');
        return false;
      }

      // Atualizar dados da sessão
      session.jsessionId = authResult.data.jsessionId;
      session.ppToken = authResult.data.ppToken;
      session.pragmaticUserId = authResult.data.pragmaticUserId;
      session.lastRenewal = Date.now();
      session.renewalAttempts = 0; // Reset counter em caso de sucesso

      addWebSocketLog(userId, '✅ Sessão renovada com sucesso via Edge Function', 'success');
      return true;

    } catch (edgeFunctionError) {
      addWebSocketLog(userId, `❌ Erro na renovação via Edge Function: ${edgeFunctionError}`, 'error');
      return false;
    }

  } catch (error) {
    addWebSocketLog(userId, `❌ Erro na renovação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, 'error');
    return false;
  }
}

// NOVO: Configurar timer de renovação automática
function setupAutoRenewal(userId: string) {
  // Limpar timer anterior se existir
  if (renewalTimers[userId]) {
    clearTimeout(renewalTimers[userId]);
  }

  // Renovar a cada 18 minutos (antes dos 20 minutos de expiração)
  const renewalInterval = 18 * 60 * 1000; // 18 minutos em ms
  
  renewalTimers[userId] = setTimeout(async () => {
    if (operationState[userId]?.active) {
      addWebSocketLog(userId, '⏰ Timer de renovação ativado (18 min)', 'info');
      const renewed = await renewSession(userId);
      
      if (renewed) {
        // Configurar próxima renovação
        setupAutoRenewal(userId);
    } else {
        addWebSocketLog(userId, '🛑 Falha na renovação - operação será pausada', 'error');
        // Parar operação se renovação falhar
        if (operationState[userId]) {
          operationState[userId].active = false;
    }
      }
    }
  }, renewalInterval);
    
  addWebSocketLog(userId, `⏰ Renovação automática configurada (a cada 18 min)`, 'info');
}
    
// NOVO: Conectar ao WebSocket
async function connectToBettingGame(userId: string, tipValue?: number, clientIP?: string, userFingerprint?: any, clientHeaders?: any, authTokens?: { ppToken: string; jsessionId: string; pragmaticUserId: string }, forceClientSideAuth?: boolean) {
  try {
    addWebSocketLog(userId, '🔗 Iniciando conexão...', 'info');
    
    // Limpar status anterior e parar conexões existentes
    stopAllConnections(userId, false);
    resetReconnectionControl(userId);
    
    // 🔐 Etapa 1: APENAS autenticação client-side (IP real do usuário)
    
    if (!authTokens || !authTokens.ppToken || !authTokens.jsessionId) {
      addWebSocketLog(userId, '❌ Tokens client-side obrigatórios não fornecidos', 'error');
      addWebSocketLog(userId, '💡 Certifique-se de que a autenticação client-side foi executada no browser', 'info');
      return NextResponse.json({
        success: false,
        error: 'Tokens de autenticação client-side são obrigatórios. Execute a autenticação no browser primeiro.',
        needsClientAuth: true
      });
    }

    addWebSocketLog(userId, '🔐 Usando APENAS tokens do client-side (IP real do usuário)...', 'info');
    const authResult = await validateClientTokens(userId, authTokens);
    if (!authResult.success) {
      let errorMsg = `Falha na autenticação: ${authResult.error}`;
      let needsTokenUpdate = false;
      
      // Melhorar mensagem para token expirado
      if (authResult.error?.includes('ppToken') || authResult.error?.includes('token da Blaze')) {
        errorMsg = 'Token da Blaze expirado. Acesse /config para atualizar seu token.';
        needsTokenUpdate = true;
      }
      
      addWebSocketLog(userId, errorMsg, 'error');
      updateConnectionStatus(userId, false, errorMsg);
      return NextResponse.json({
        success: false,
        error: errorMsg,
        needsTokenUpdate,
        redirectTo: needsTokenUpdate ? '/config' : undefined
      });
    }

    addWebSocketLog(userId, 'Autenticação realizada com sucesso', 'success');

    // ✅ NOVO: Inicializar controle de sessão para renovação automática
    sessionControl[userId] = {
      jsessionId: authResult.data!.jsessionId,
      ppToken: authResult.data!.ppToken,
      pragmaticUserId: authResult.data!.userId,
      createdAt: Date.now(),
      lastRenewal: Date.now(),
      renewalAttempts: 0,
      maxRenewalAttempts: 3
    };

    // ✅ NOVO: Calcular sequência baseada no tipValue recebido
    const calculateSequence = (baseTip: number) => {
      const baseSequence = [20.00, 20.00, 21.00, 4.00, 2.50, 2.50, 2.00, 1.50, 1.00, 0.50];
      const multiplier = baseTip / 20.00; // Detectar multiplicador (1x, 3x, 6x, 10x) - nova base R$ 20,00
      return baseSequence.map(value => value * multiplier);
    };

    const strategy = {
      sequences: calculateSequence(tipValue || 20.00),
      maxMartingale: 10
    };
    const calculatedSequence = strategy.sequences;
    
    const multiplier = (tipValue || 20.00) / 20.00;
    const multiplierLabel = multiplier === 1 ? '1x' : multiplier === 3 ? '3x' : multiplier === 6 ? '6x' : multiplier === 10 ? '10x' : `${multiplier}x`;
    addWebSocketLog(userId, `🎯 Estratégia ${multiplierLabel} (R$ ${(tipValue || 20.00).toFixed(2)}) - Sequência: [${calculatedSequence.slice(0, 3).map((v: number) => v.toFixed(2)).join(', ')}...]`, 'info');

    // Sistema simplificado
    
    // Inicializar estados
    lastSevenResults[userId] = [];
    resultCollectionEnabled[userId] = false; // Só habilita após primeiro "apostas fechadas"
    operationState[userId] = {
      active: false,
      basePattern: [],
      currentCycle: 1,
      currentLevel: 0,
      martingaleLevel: 0,
      waitingForResult: false,
      strategy: {
        sequences: calculatedSequence,
        maxMartingale: 10,

        cycleDistribution: {
          cycle1: { levels: [3, 4, 5], martingales: [0, 1, 2] },
          cycle2: { levels: [1, 2, 3, 4, 5], martingales: [3, 4, 5, 6, 7] },
          cycle3: { levels: [1, 2], martingales: [8, 9] }
        }
      },
      stats: {
        totalBets: 0,
        wins: 0,
        losses: 0,
        profit: 0,
        startedAt: Date.now()
      },
      // ✅ NOVO: Controle de novo padrão
      needsNewPattern: false
    };
    
    // Iniciar conexão WebSocket
    const config = {
      jsessionId: authResult.data!.jsessionId,
      pragmaticUserId: authResult.data!.userId,
      tableId: 'mrbras531mrbr532'
    };

    startWebSocketConnection(userId, config, undefined, clientIP, userFingerprint);

    addWebSocketLog(userId, 'WebSocket iniciado para coleta de dados', 'success');
      
      return NextResponse.json({
        success: true,
        data: {
        connected: true,
        message: 'Conectado ao WebSocket da Pragmatic Play',
        config,
        readyForBetting: true
      }
    });

  } catch (error) {
    const errorMsg = `Erro na conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
    addWebSocketLog(userId, errorMsg, 'error');
    updateConnectionStatus(userId, false, errorMsg);
    return NextResponse.json({
      success: false,
      error: errorMsg
    });
  }
}

// NOVO: Iniciar operação simplificada
async function startSimpleOperation(userId: string) {
  try {
    // Verificar se tem 7 resultados
    const results = lastSevenResults[userId] || [];
    
    if (results.length < 7) {
      return NextResponse.json({
        success: false,
        error: `Aguarde 5 resultados para iniciar (atual: ${results.length}/5)`
      });
    }
    
    // ✅ NOVA ESTRATÉGIA: Verificar se é padrão de repetição válido
    if (!isValidPattern(results)) {
      return NextResponse.json({
        success: false,
        error: 'Padrão de repetição inválido. Aguarde um padrão [1,2,3,4,5,1,2] válido.'
      });
    }
    
    // 📊 NOVO: Resetar estatísticas de martingale para nova operação
    resetMartingaleUsage(userId);
    
    // Inicializar operação com nova estratégia de 3 ciclos
    operationState[userId] = {
      ...operationState[userId],
      active: true,
      basePattern: results.slice(0, 5).map((r: any) => r.color), // Primeiros 5 resultados
      currentCycle: 1,      // Iniciar no Ciclo 1
      currentLevel: 3,      // Iniciar no nível 3 (M1)
      martingaleLevel: 0,   // M1
      waitingForResult: false
    };
    
    const pattern = operationState[userId].basePattern.join('');
    addWebSocketLog(userId, `🚀 Operação iniciada! Padrão base: ${pattern}`, 'success');
    addWebSocketLog(userId, `📋 Iniciando Ciclo 1, Nível 3 (M1) - Apostará em: ${operationState[userId].basePattern[2]}`, 'info');
    
    // ✅ NOVO: Ativar renovação automática de sessão
    setupAutoRenewal(userId);
    
    // ✅ NOVO: Tentar apostar imediatamente se as apostas estão abertas
    const bettingWindow = bettingWindowState[userId];
    if (bettingWindow?.isOpen && bettingWindow.currentGameId) {
      addWebSocketLog(userId, `🎯 Apostas abertas detectadas - tentando apostar imediatamente`, 'success');
      
      // Buscar WebSocket ativo para executar aposta
      const activeWS = activeWebSockets[userId];
      if (activeWS?.ws && activeWS.ws.readyState === 1) { // 1 = OPEN
        executeSimpleBet(userId, bettingWindow.currentGameId, activeWS.ws);
      } else {
        addWebSocketLog(userId, `⚠️ WebSocket não disponível para aposta imediata`, 'error');
      }
    } else {
      addWebSocketLog(userId, `⏳ Aguardando próxima rodada para apostar`, 'info');
    }
    
    return NextResponse.json({
      success: true,
      data: {
        operationActive: true,
        pattern: pattern,
        message: 'Operação iniciada com sucesso'
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro ao iniciar operação'
    });
  }
}

// NOVO: Parar operação
async function stopSimpleOperation(userId: string) {
  try {
    // Finalizar operação
    
    // Parar operação de apostas
    if (operationState[userId]) {
      operationState[userId].active = false;
      operationState[userId].waitingForResult = false;
    }
    
    // Parar todas as conexões
    stopAllConnections(userId, true);
    
    addWebSocketLog(userId, '🛑 Operação e conexões paradas pelo usuário', 'info');
    
    return NextResponse.json({
      success: true,
      data: {
        operationActive: false,
        connected: false,
        message: 'Operação parada com sucesso'
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro ao parar operação'
    });
  }
}

// ✅ NOVA FUNÇÃO: Reconectar com novos tokens (resolve expiração)
async function reconnectWithNewTokens(userId: string, userIP?: string, userFingerprint?: any) {
  try {
    addWebSocketLog(userId, `🔑 Gerando novos tokens para reconexão...`, 'info');
    
    // ✅ USAR FUNÇÃO EXISTENTE: getUserBlazeToken do auth.ts
    const tokenResult = await getUserBlazeToken(userId);
    
    if (!tokenResult.success || !tokenResult.token) {
      addWebSocketLog(userId, `❌ Token da Blaze não encontrado: ${tokenResult.error}`, 'error');
      addWebSocketLog(userId, `💡 Configure seu token da Blaze na página de configurações`, 'info');
      updateConnectionStatus(userId, false, 'Token da Blaze não encontrado');
      return;
    }

    addWebSocketLog(userId, `🚀 Gerando novos tokens via Supabase Edge Function...`, 'info');
    addWebSocketLog(userId, `🌍 Edge Function resolve bloqueio geográfico`, 'info');

    const realBrowserHeaders = {
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'DNT': '1',
      'Upgrade-Insecure-Requests': '1',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'X-Requested-With': 'XMLHttpRequest'
    };

    // ✅ USAR EDGE FUNCTION: Chamar diretamente a Supabase Edge Function
    const authResponse = await fetch('https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd2Vra3FoY2lwdmdodnF2dnR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDkwNTcsImV4cCI6MjA2Mzk4NTA1N30.s9atBox8lrUba0Cb5qnH_dHTVJQkvwupoS2L6VneXHA'
      },
      body: JSON.stringify({
        action: 'generate-tokens',
        blazeToken: tokenResult.token,
        userAgent: userFingerprint?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        acceptLanguage: userFingerprint?.language || 'pt-BR,pt;q=0.9,en;q=0.8',
        selectedCurrencyType: 'BRL',
        realBrowserHeaders: realBrowserHeaders
      })
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      addWebSocketLog(userId, `❌ Erro na Edge Function: ${authResponse.status} - ${errorText}`, 'error');
      updateConnectionStatus(userId, false, 'Erro na Edge Function');
      return;
    }

    const authResult = await authResponse.json();
    
    if (!authResult.success || !authResult.data) {
      addWebSocketLog(userId, `❌ Falha na Edge Function: ${authResult.error}`, 'error');
      updateConnectionStatus(userId, false, 'Falha na geração de novos tokens');
      return;
    }

    addWebSocketLog(userId, `✅ Novos tokens gerados via Edge Function para reconexão`, 'success');
    
    // ✅ RECONECTAR: Usar novos tokens
    const newConfig = {
      jsessionId: authResult.data.jsessionId,
      pragmaticUserId: authResult.data.pragmaticUserId,
      tableId: 'mrbras531mrbr532'
    };

    // Fechar conexão atual se existir
    if (activeWebSockets[userId]) {
      activeWebSockets[userId].ws.close();
      delete activeWebSockets[userId];
    }

    addWebSocketLog(userId, `🔄 Reconectando com novos tokens...`, 'info');
    
    // Conectar novamente
    startWebSocketConnection(userId, newConfig, undefined, userIP, userFingerprint);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    addWebSocketLog(userId, `❌ Erro ao gerar novos tokens: ${errorMessage}`, 'error');
    addWebSocketLog(userId, `💡 Para reconectar, configure novamente na página de configurações`, 'info');
    updateConnectionStatus(userId, false, 'Erro na reconexão');
  }
}

// NOVO: Iniciar conexão WebSocket simplificada
function startWebSocketConnection(userId: string, config: { jsessionId: string; pragmaticUserId: string; tableId: string }, customServerUrl?: string, userIP?: string, userFingerprint?: any) {
  try {
    // Inicializar controle de reconexão se não existir
    if (!reconnectionControl[userId]) {
      reconnectionControl[userId] = {
        attempts: 0,
        lastAttempt: 0,
        maxAttempts: 5,
        backoffDelay: 5000
      };
    }

    const control = reconnectionControl[userId];
    const now = Date.now();

    // Verificar se excedeu tentativas máximas
    if (control.attempts >= control.maxAttempts) {
      addWebSocketLog(userId, `❌ Máximo de tentativas de reconexão atingido (${control.maxAttempts})`, 'error');
      updateConnectionStatus(userId, false, 'Máximo de tentativas de reconexão atingido');
      return;
    }

    // Incrementar tentativas apenas se for uma reconexão (não primeira conexão)
    if (control.attempts > 0 || control.lastAttempt > 0) {
      control.attempts++;
    }
    control.lastAttempt = now;

    // Usar a mesma URL e configuração que funciona na API de referência (ou servidor customizado para switch)
    const baseUrl = customServerUrl || 'wss://gs9.pragmaticplaylive.net/game';
    const wsUrl = `${baseUrl}?JSESSIONID=${config.jsessionId}&tableId=${config.tableId}`;
    
    addWebSocketLog(userId, `🔗 Conectando ao WebSocket (tentativa ${control.attempts}/${control.maxAttempts}): ${wsUrl}`, 'info');
    if (userIP) {
      addWebSocketLog(userId, `🌐 IP do usuário detectado: ${userIP}`, 'info');
    }
    
    // ✅ MELHORADO: Headers completamente realistas usando dados do usuário
    const realHeaders = {
      // Headers básicos da Pragmatic
      'Origin': 'https://client.pragmaticplaylive.net',
      'User-Agent': userFingerprint?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': userFingerprint?.language || 'pt-BR,pt;q=0.9,en;q=0.8',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Protocol': 'chat',
      
      // Headers realistas do navegador
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Mode': 'websocket',
      'Sec-Fetch-Site': 'cross-site',
      
      // Headers de IP (múltiplos para garantir que chegue)
      ...(userIP && userIP !== 'unknown' && {
        'X-Forwarded-For': userIP,
        'X-Real-IP': userIP,
        'X-Client-IP': userIP,
        'CF-Connecting-IP': userIP,
        'True-Client-IP': userIP,
        'X-Original-IP': userIP
      }),
      
      // Headers personalizados com dados reais do navegador
      ...(userFingerprint?.timezone && { 'X-User-Timezone': userFingerprint.timezone }),
      ...(userFingerprint?.platform && { 'X-User-Platform': userFingerprint.platform }),
      ...(userFingerprint?.screenResolution && { 'X-User-Screen': userFingerprint.screenResolution }),
      ...(userFingerprint?.colorDepth && { 'X-User-ColorDepth': userFingerprint.colorDepth.toString() }),
      ...(userFingerprint?.hardwareConcurrency && { 'X-User-Cores': userFingerprint.hardwareConcurrency.toString() }),
      ...(userFingerprint?.connectionType && { 'X-User-Connection': userFingerprint.connectionType })
    };
    
    // ✅ Log headers apenas na primeira conexão (não em reconexões)
    if (!activeWebSockets[userId]) {
      addWebSocketLog(userId, `🌐 Headers enviados para Pragmatic (primeira conexão):`, 'info');
      addWebSocketLog(userId, `📱 User-Agent: ${realHeaders['User-Agent']}`, 'info');
      addWebSocketLog(userId, `🌍 IP Headers: ${userIP ? 'Enviado' : 'Indisponível'}`, 'info');
      addWebSocketLog(userId, `🗣️ Idioma: ${realHeaders['Accept-Language']}`, 'info');
      if (userFingerprint?.timezone) addWebSocketLog(userId, `🕐 Timezone: ${userFingerprint.timezone}`, 'info');
      if (userFingerprint?.platform) addWebSocketLog(userId, `🖥️ Plataforma: ${userFingerprint.platform}`, 'info');
    }

    const ws = new WebSocket(wsUrl, {
      headers: realHeaders
    });

    let connectionHealthy = true;
    let lastPong = Date.now();
    let pingInterval: NodeJS.Timeout | null = null;
    
    ws.on('open', () => {
      addWebSocketLog(userId, '🔗 WebSocket conectado com sucesso', 'success');
      updateConnectionStatus(userId, true);
      
      // Resetar contador de tentativas após conexão bem-sucedida
      if (reconnectionControl[userId]) {
        reconnectionControl[userId].attempts = 0;
      }
      
      // Não é necessário enviar login neste servidor
      addWebSocketLog(userId, 'Conexão estabelecida - aguardando mensagens...', 'info');
      
      // Enviar primeiro ping imediatamente após conexão
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const timestamp = Date.now();
          const pingMessage = `<ping time='${timestamp}'></ping>`;
          ws.send(pingMessage);
          addWebSocketLog(userId, `🏓 Ping inicial enviado: ${timestamp}`, 'info');
        }
      }, 1000); // Aguardar 1 segundo após conexão
      
      // Iniciar sistema de ping/pong
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const timestamp = Date.now();
          const pingMessage = `<ping time='${timestamp}'></ping>`;
          ws.send(pingMessage);
          addWebSocketLog(userId, `🏓 Ping enviado: ${timestamp}`, 'info');
          
          // Verificar saúde da conexão
          const timeSincePong = Date.now() - lastPong;
          if (timeSincePong > 60000) { // 1 minuto sem pong
            addWebSocketLog(userId, `⚠️ Conexão pode estar inativa (${Math.round(timeSincePong/1000)}s sem pong)`, 'error');
            connectionHealthy = false;
            
            if (timeSincePong > 120000) { // 2 minutos sem pong
              addWebSocketLog(userId, '💀 Conexão morta detectada - fechando WebSocket', 'error');
              ws.close();
            }
          }
        } else {
          addWebSocketLog(userId, '⚠️ WebSocket não está aberto para ping', 'error');
        }
      }, 30000); // Ping a cada 30 segundos
    });

    ws.on('message', (data: any) => {
      try {
        const message = data.toString().trim();
        
        // Log de todas as mensagens recebidas (para debug)
        if (message.length < 200) {
          addWebSocketLog(userId, `📨 Mensagem recebida: ${message}`, 'info');
        } else {
          addWebSocketLog(userId, `📨 Mensagem recebida: ${message.substring(0, 100)}...`, 'info');
        }

        // ✅ NOVA DETECÇÃO: Sessão offline = tokens expirados
        if (message.includes('<session>offline</session>')) {
          addWebSocketLog(userId, `🔑 Sessão offline detectada - tokens expiraram`, 'error');
          addWebSocketLog(userId, `🔄 Gerando novos tokens automaticamente...`, 'info');
          
          // Limpar ping interval
          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }
          
          // Fechar conexão atual
          ws.close();
          
          // Gerar novos tokens e reconectar
          setTimeout(async () => {
            await reconnectWithNewTokens(userId, userIP, userFingerprint);
          }, 2000); // Aguardar 2 segundos antes de reconectar
          
          return; // Sair da função
        }

        // Processar pong
      if (message.includes('<pong')) {
          lastPong = Date.now();
        connectionHealthy = true;
          const timeMatch = message.match(/time="([^"]*)"/);
        const seqMatch = message.match(/seq="([^"]*)"/);
          addWebSocketLog(userId, `💓 Pong recebido (time: ${timeMatch?.[1]}, seq: ${seqMatch?.[1]})`, 'success');
          return;
      }

        // Detectar switch de servidor - CRÍTICO para manter conexão
        if (message.includes('<switch') && message.includes('gameServer=')) {
          const gameServerMatch = message.match(/gameServer="([^"]*)"/);
          const wsAddressMatch = message.match(/wsAddress="([^"]*)"/);
          
          if (gameServerMatch && wsAddressMatch) {
            const newServer = gameServerMatch[1];
            const newWsAddress = wsAddressMatch[1];
            
            addWebSocketLog(userId, `🔄 Switch de servidor detectado: ${newServer} (${newWsAddress})`, 'info');
            
            // Limpar ping interval
            if (pingInterval) {
              clearInterval(pingInterval);
              pingInterval = null;
            }
            
            // Fechar conexão atual
            ws.close();
            
            // ✅ CORREÇÃO: Switch de servidor usando nova arquitetura de proxy
            setTimeout(async () => {
              addWebSocketLog(userId, `🔑 Gerando novos tokens para switch de servidor...`, 'info');
              
              try {
                // ✅ USAR EDGE FUNCTION: Gerar novos tokens via Supabase Edge Function
                const tokenResult = await getUserBlazeToken(userId);
                
                if (!tokenResult.success || !tokenResult.token) {
                  addWebSocketLog(userId, `❌ Token da Blaze não encontrado: ${tokenResult.error}`, 'error');
                  updateConnectionStatus(userId, false, 'Token da Blaze não encontrado');
                  return;
                }

                addWebSocketLog(userId, `🚀 Gerando novos tokens via Supabase Edge Function...`, 'info');
                addWebSocketLog(userId, `🌍 Edge Function resolve bloqueio geográfico`, 'info');

                const realBrowserHeaders = {
                  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                  'sec-ch-ua-mobile': '?0',
                  'sec-ch-ua-platform': '"macOS"',
                  'DNT': '1',
                  'Upgrade-Insecure-Requests': '1',
                  'Pragma': 'no-cache',
                  'Cache-Control': 'no-cache',
                  'X-Requested-With': 'XMLHttpRequest'
                };

                // ✅ Chamar diretamente a Supabase Edge Function
                const authResponse = await fetch('https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth', {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd2Vra3FoY2lwdmdodnF2dnR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDkwNTcsImV4cCI6MjA2Mzk4NTA1N30.s9atBox8lrUba0Cb5qnH_dHTVJQkvwupoS2L6VneXHA'
                  },
                  body: JSON.stringify({
                    action: 'generate-tokens',
                    blazeToken: tokenResult.token,
                    userAgent: userFingerprint?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    acceptLanguage: userFingerprint?.language || 'pt-BR,pt;q=0.9,en;q=0.8',
                    selectedCurrencyType: 'BRL',
                    realBrowserHeaders: realBrowserHeaders
                  })
                });

                if (!authResponse.ok) {
                  const errorText = await authResponse.text();
                  addWebSocketLog(userId, `❌ Erro na Edge Function: ${authResponse.status} - ${errorText}`, 'error');
                  updateConnectionStatus(userId, false, 'Erro na Edge Function');
                  return;
                }

                const authResult = await authResponse.json();
                
                if (!authResult.success || !authResult.data) {
                  addWebSocketLog(userId, `❌ Falha na Edge Function: ${authResult.error}`, 'error');
                  updateConnectionStatus(userId, false, 'Falha na geração de novos tokens');
                  return;
                }

                addWebSocketLog(userId, `✅ Novos tokens gerados via Edge Function com sucesso`, 'success');
                
                // ✅ RECONECTAR: Usar novos tokens para switch de servidor
                const newConfig = {
                  jsessionId: authResult.data.jsessionId,
                  pragmaticUserId: authResult.data.pragmaticUserId,
                  tableId: 'mrbras531mrbr532'
                };

                // Fechar conexão atual
                if (activeWebSockets[userId]) {
                  activeWebSockets[userId].ws.close();
                  delete activeWebSockets[userId];
                }

                addWebSocketLog(userId, `🔄 Reconectando ao novo servidor: ${newWsAddress}`, 'info');
                
                // Conectar ao novo servidor
                startWebSocketConnection(userId, newConfig, newWsAddress, userIP, userFingerprint);

              } catch (error) {
                addWebSocketLog(userId, `❌ Erro no switch de servidor: ${error}`, 'error');
                updateConnectionStatus(userId, false, 'Erro no switch de servidor');
              }
            }, 1000);
            
            return; // Sair da função para evitar processar outras mensagens
          }
        }

        // Apostas abertas
        if (message.includes('<betsopen')) {
          const gameMatch = message.match(/game="([^"]*)"/);
          const tableMatch = message.match(/table="([^"]*)"/);
          const seqMatch = message.match(/seq="([^"]*)"/);
          
          if (gameMatch) {
            const gameId = gameMatch[1];
            const table = tableMatch?.[1] || '';
            const seq = seqMatch?.[1] || '';
            
            // NOVO: Atualizar estado da janela de apostas
            bettingWindowState[userId] = {
              isOpen: true,
              currentGameId: gameId,
              lastUpdate: Date.now()
            };
            
            addWebSocketLog(userId, `🎰 Apostas abertas - Jogo: ${gameId} (mesa: ${table}, seq: ${seq})`, 'bets-open');
            
            // Se operação ativa e pronto para apostar
            if (operationState[userId]?.active && !operationState[userId]?.waitingForResult) {
              addWebSocketLog(userId, `🎯 Operação ativa detectada - executando aposta automaticamente`, 'success');
              executeSimpleBet(userId, gameId, ws);
            }
          }
        }
        
        // Apostas fechadas
        if (message.includes('<betsclosed') || message.includes('<betsclose')) {
          // NOVO: Atualizar estado da janela de apostas
          if (bettingWindowState[userId]) {
            bettingWindowState[userId].isOpen = false;
            bettingWindowState[userId].lastUpdate = Date.now();
          }
          
          addWebSocketLog(userId, `🚫 Apostas fechadas`, 'bets-closed');
          
          // NOVO: Habilitar coleta de resultados após primeiro "apostas fechadas"
          if (!resultCollectionEnabled[userId]) {
            resultCollectionEnabled[userId] = true;
            addWebSocketLog(userId, `✅ Coleta de resultados habilitada (primeiro "apostas fechadas" detectado)`, 'success');
          }
        }
        
        // ✅ NOVO: Detectar resposta de comando (aposta aceita/rejeitada)
        if (message.includes('<command') && message.includes('status=')) {
          const statusMatch = message.match(/status="([^"]*)"/);
          const channelMatch = message.match(/channel="([^"]*)"/);
          
          if (statusMatch) {
            const status = statusMatch[1];
            const channel = channelMatch?.[1] || '';
            
            if (status === 'success') {
              addWebSocketLog(userId, `✅ Aposta aceita pelo servidor`, 'success');
            } else if (status === 'error' || status === 'fail' || status === 'denied') {
              addWebSocketLog(userId, `❌ Aposta REJEITADA pelo servidor (${status})`, 'error');
              addWebSocketLog(userId, `🔄 Sessão pode ter expirado - tentando renovar...`, 'info');
              
              // ✅ TRIGGER: Renovação imediata quando aposta é rejeitada
              setTimeout(async () => {
                const renewed = await renewSession(userId);
                if (!renewed) {
                  addWebSocketLog(userId, `🛑 Falha na renovação após rejeição - pausando operação`, 'error');
                  if (operationState[userId]) {
                    operationState[userId].active = false;
                  }
                }
              }, 1000); // Aguardar 1 segundo antes de renovar
            }
          }
        }

        // Resultado do jogo - múltiplos formatos possíveis
        if (message.includes('<result') || message.includes('<gameresult')) {
          const scoreMatch = message.match(/score="([^"]*)"/);
          const gameMatch = message.match(/game="([^"]*)"/);
          
          if (scoreMatch) {
            const number = parseInt(scoreMatch[1]);
            const color = getColorFromNumber(number);
            const gameId = gameMatch?.[1] || '';
            
            addWebSocketLog(userId, `🎲 Resultado: ${number} ${color}`, 'game');
            processGameResult(userId, gameId, number, color);
          }
        }
        
      } catch (parseError) {
        addWebSocketLog(userId, `❌ Erro ao processar mensagem: ${parseError}`, 'error');
      }
    });
    
    ws.on('error', (error) => {
      addWebSocketLog(userId, `❌ Erro na conexão: ${error.message}`, 'error');
      updateConnectionStatus(userId, false, error.message);
      
      // Limpar ping interval em caso de erro
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    });
    
    ws.on('close', (code, reason) => {
      addWebSocketLog(userId, `🔌 WebSocket desconectado (código: ${code}, razão: ${reason})`, 'error');
      updateConnectionStatus(userId, false);
      
      // Limpar ping interval
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      
      // Tentar reconectar automaticamente se não foi fechamento intencional
      if (code !== 1000 && code !== 1001) { // Não reconectar se foi fechamento normal/intencional
      const control = reconnectionControl[userId];
        if (control && control.attempts < control.maxAttempts) {
          addWebSocketLog(userId, `🔄 Tentando reconectar em ${control.backoffDelay}ms...`, 'info');
              setTimeout(async () => {
            // ✅ CORREÇÃO: Gerar novos tokens a cada reconexão pois eles expiram
            await reconnectWithNewTokens(userId, userIP, userFingerprint);
          }, control.backoffDelay);
          
          // Aumentar delay para próxima tentativa
          control.backoffDelay = Math.min(control.backoffDelay * 2, 30000); // Max 30 segundos
        }
      }
    });

    // Armazenar conexão
    activeWebSockets[userId] = {
      ws,
      sessionId: config.jsessionId,
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    addWebSocketLog(userId, `❌ Erro ao conectar: ${errorMessage}`, 'error');
    updateConnectionStatus(userId, false, errorMessage);
  }
}

// Mapeamento de cores para códigos de aposta (conforme API de referência)
const COLOR_TO_BET_CODE: { [key: string]: string } = {
  'R': '48', // Vermelho (Red)
  'B': '49', // Preto (Black)
};

// Mapeamento de cores para nomes em português
const COLOR_NAMES: { [key: string]: string } = {
  'R': 'VERMELHO',
  'B': 'PRETO',
};

// Função robusta para enviar mensagens via WebSocket
async function sendWebSocketMessage(ws: any, message: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Verificar se WebSocket está conectado
    if (!ws || ws.readyState !== 1) {
      return {
        success: false,
        error: 'WebSocket não está conectado'
      };
    }

    // Método 1: Tentar envio direto (funciona em desenvolvimento)
    try {
      ws.send(message);
      return { success: true };
    } catch (directError: any) {
      
      // Fallbacks simplificados
      return { success: false, error: 'Erro no WebSocket' };
    }
  } catch (error: any) {
    return {
      success: false,
      error: `Erro geral no WebSocket: ${error.message || 'Erro desconhecido'}`
    };
  }
}

// Função para criar frame WebSocket manualmente (último recurso)
function createWebSocketFrame(message: string): Buffer {
  const payload = Buffer.from(message, 'utf8');
  const payloadLength = payload.length;
  
  let frame: Buffer;
  
  if (payloadLength < 126) {
    frame = Buffer.allocUnsafe(2 + payloadLength);
    frame[0] = 0x81; // FIN=1, opcode=1 (text)
    frame[1] = payloadLength;
    payload.copy(frame, 2);
  } else if (payloadLength < 65536) {
    frame = Buffer.allocUnsafe(4 + payloadLength);
    frame[0] = 0x81; // FIN=1, opcode=1 (text)
    frame[1] = 126;
    frame.writeUInt16BE(payloadLength, 2);
    payload.copy(frame, 4);
  } else {
    frame = Buffer.allocUnsafe(10 + payloadLength);
    frame[0] = 0x81; // FIN=1, opcode=1 (text)
    frame[1] = 127;
    frame.writeUInt32BE(0, 2);
    frame.writeUInt32BE(payloadLength, 6);
    payload.copy(frame, 10);
  }
  
  return frame;
}

// NOVO: Executar aposta simples com humanização
async function executeSimpleBet(userId: string, gameId: string, ws: any) {
  const operation = operationState[userId];
  if (!operation || !operation.active || !operation.strategy?.sequences) {
    addWebSocketLog(userId, '❌ Estado da operação inválido ou incompleto', 'error');
    return;
  }
  
  // ✅ NOVA LÓGICA: Usa módulo para repetir padrão nos níveis 6-10
  const patternIndex = operation.currentLevel % 5; // 0-4, depois repete
  const expectedColor = operation.basePattern[patternIndex];
  // ✅ USAR VALOR DO MARTINGALE ATUAL (M1, M2, M3...)
  const betAmount = operation.strategy?.sequences?.[operation.martingaleLevel]; // Valor do martingale atual
  const betCode = COLOR_TO_BET_CODE[expectedColor];
  const colorName = COLOR_NAMES[expectedColor];
  
  if (!betCode || !colorName) {
    addWebSocketLog(userId, `❌ Cor inválida para aposta: ${expectedColor}`, 'error');
    return;
  }

  try {
    // Gerar timestamp e mensagem de aposta
    const timestamp = Date.now().toString();
    const pragmaticUserId = `ppc${timestamp}`;
    
    const betXml = `<command channel="table-mrbras531mrbr532">
  <lpbet gm="roulette_desktop" gId="${gameId}" uId="${pragmaticUserId}" ck="${timestamp}">
    <bet amt="${betAmount}" bc="${betCode}" ck="${timestamp}" />
  </lpbet>
</command>`;
          
    // Enviar aposta via WebSocket com tratamento robusto
    const sendResult = await sendWebSocketMessage(ws, betXml, userId);
    if (!sendResult.success) {
      addWebSocketLog(userId, `❌ Falha ao enviar aposta: ${sendResult.error}`, 'error');
      return;
    }
    operation.waitingForResult = true;
    operation.lastGameId = gameId;
    
    // ✅ Log da aposta com informações dos ciclos
    const cycle = Math.floor(operation.currentLevel / 5) + 1;
    const positionInCycle = (operation.currentLevel % 5) + 1;
    
    // 📊 NOVO: Registrar uso do martingale
    recordMartingaleUsage(userId, operation.martingaleLevel);
    
    addWebSocketLog(userId, `🎯 APOSTA ${cycle}º CICLO POSIÇÃO ${positionInCycle} M${operation.martingaleLevel + 1}: ${colorName} (${expectedColor}) R$ ${betAmount.toFixed(2)} → Game ${gameId}`, 'success');
    addWebSocketLog(userId, `🔧 Nível: ${operation.currentLevel + 1}/10 | Martingale: M${operation.martingaleLevel + 1}/10 | Apostando CONTRA: ${operation.basePattern.join('')}`, 'info');
    
    // TODO: Debitar créditos quando necessário
    // await debitUserCredits(userId, finalBetAmount);

  } catch (error) {
    addWebSocketLog(userId, `❌ Erro ao enviar aposta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, 'error');
  }
}

// Funções auxiliares
function updateConnectionStatus(userId: string, connected: boolean, error?: string) {
  connectionStatus[userId] = {
    connected,
    error,
    lastUpdate: Date.now()
  };
}

function getColorFromNumber(number: number): string {
  if (number === 0) return 'green';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(number) ? 'red' : 'black';
}

async function debitUserCredits(userId: string, amount: number) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase.rpc('debit_user_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_description: `Aposta MegaRoulette - R$ ${amount}`
    });

    if (error) {
    }
  } catch (error) {
  }
}

// Funções auxiliares para controle de conexão
function resetReconnectionControl(userId: string) {
  if (reconnectionControl[userId]) {
    reconnectionControl[userId] = {
      attempts: 0,
      lastAttempt: 0,
      maxAttempts: 5,
      backoffDelay: 5000
    };
  }
}

function stopAllConnections(userId: string, setErrorStatus: boolean = true) {
  
  // Fechar WebSocket se existir
  if (activeWebSockets[userId]?.ws) {
    try {
      const ws = activeWebSockets[userId].ws;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Operação parada pelo usuário');
      }
  } catch (error) {
    }
      delete activeWebSockets[userId];
    } else {
  }
    
  // Limpar controle de reconexão
  if (reconnectionControl[userId]) {
    delete reconnectionControl[userId];
  }
  
  // ✅ NOVO: Limpar timer de renovação automática
  if (renewalTimers[userId]) {
    clearTimeout(renewalTimers[userId]);
    delete renewalTimers[userId];
    addWebSocketLog(userId, '⏰ Timer de renovação automática cancelado', 'info');
  }
  
  // ✅ NOVO: Limpar controle de sessão
  if (sessionControl[userId]) {
    delete sessionControl[userId];
  }
  
  // NOVO: Resetar flag de coleta de resultados
  resultCollectionEnabled[userId] = false;
  
  // NOVO: Resetar estado da janela de apostas
  if (bettingWindowState[userId]) {
    delete bettingWindowState[userId];
  }
  
  // Sistema de disfarce removido - controle manual pelo usuário
  
  // Atualizar status de conexão
  if (setErrorStatus) {
    updateConnectionStatus(userId, false, 'Operação parada pelo usuário');
  }
  
}

// Obter logs do WebSocket
async function getWebSocketLogs(userId: string) {
  try {
    const logs = websocketLogs[userId] || [];
    const results = lastSevenResults[userId] || [];
    const status = connectionStatus[userId] || { connected: false, lastUpdate: Date.now() };
    const operation = operationState[userId];

    // NOVO: Verificar se pode iniciar operação (padrão de repetição + janela de apostas aberta)
    const bettingWindow = bettingWindowState[userId];
    const hasCompletePattern = results.length >= 7;
    const isValidRepetition = results.length >= 7 && 
      results[5]?.color === results[0]?.color && 
      results[6]?.color === results[1]?.color;
    const bettingWindowOpen = bettingWindow?.isOpen || false;
    const canStartOperation = hasCompletePattern && isValidRepetition && bettingWindowOpen && !operation?.active;

    return NextResponse.json({
      success: true,
      data: {
        logs,
        connectionStatus: status,
        lastSevenResults: results,
        operationActive: operation?.active || false,
        operationState: operation ? {
          pattern: operation.basePattern.join(''),
          currentCycle: operation.currentCycle,
          level: operation.currentLevel,
          martingaleLevel: operation.martingaleLevel,
          waitingForResult: operation.waitingForResult,
          stats: operation.stats,
          // 💰 NOVO: Status de lucro em tempo real
          profitStatus: {
            current: operation.stats.profit,
            isProfit: operation.stats.profit > 0,
            canPause: operation.stats.profit > 0, // Só pode pausar se tiver lucro
            formatted: `R$ ${operation.stats.profit.toFixed(2)}`,
            status: operation.stats.profit > 0 ? 'LUCRO' : operation.stats.profit < 0 ? 'PREJUÍZO' : 'NEUTRO'
          }
        } : null,
        canStartOperation,
        bettingWindow: {
          isOpen: bettingWindowOpen,
          currentGameId: bettingWindow?.currentGameId,
          lastUpdate: bettingWindow?.lastUpdate
        },
        // 📊 NOVO: Estatísticas de uso de martingale
        martingaleUsage: martingaleUsageStats[userId] || new Array(10).fill(0),
        // ✅ NOVO: Status da sessão para monitoramento
        sessionStatus: sessionControl[userId] ? {
          createdAt: sessionControl[userId].createdAt,
          lastRenewal: sessionControl[userId].lastRenewal,
          renewalAttempts: sessionControl[userId].renewalAttempts,
          timeSinceLastRenewal: Date.now() - sessionControl[userId].lastRenewal,
          nextRenewalIn: renewalTimers[userId] ? 'Ativo' : 'Inativo'
        } : null,
        // Estatísticas de humanização removidas
        humanizationStats: null,
        // Sistema de disfarce removido - dados simplificados
        disguiseStats: null
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro ao buscar logs'
    });
  }
}

// Obter relatório da operação
async function getOperationReport(userId: string) {
  try {
    const operation = operationState[userId];
    
    if (!operation) {
      return NextResponse.json({
        success: true,
        data: {
          summary: {
            totalBets: 0,
        wins: 0,
        losses: 0,
            profit: 0,
            winRate: 0,
            startedAt: 0
        }
      }
    });
    }
    
    const winRate = operation.stats.totalBets > 0 ? (operation.stats.wins / operation.stats.totalBets) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalBets: operation.stats.totalBets,
          wins: operation.stats.wins,
          losses: operation.stats.losses,
          profit: operation.stats.profit,
          winRate: parseFloat(winRate.toFixed(2)),
          startedAt: operation.stats.startedAt
        }
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro ao buscar relatório'
    });
  }
}

// Reset do relatório
async function resetOperationReport(userId: string) {
  try {
    if (operationState[userId]) {
      operationState[userId].stats = {
      totalBets: 0,
        wins: 0,
        losses: 0,
        profit: 0,
        startedAt: Date.now()
      };
    }

    // 📊 IMPORTANTE: Resetar também as estatísticas de martingale
    resetMartingaleUsage(userId);

    return NextResponse.json({
      success: true,
      data: { message: 'Relatório resetado com sucesso' }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro ao resetar relatório'
    });
  }
}

// Status da conexão
async function getConnectionStatus(userId: string) {
  try {
    const status = connectionStatus[userId] || { connected: false, lastUpdate: Date.now() };
    const results = lastSevenResults[userId] || [];
    const operation = operationState[userId];

    return NextResponse.json({
      success: true,
      data: {
        connected: status.connected,
        lastUpdate: status.lastUpdate,
        error: status.error,
        lastFiveCount: results.length,
        operationActive: operation?.active || false
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro ao verificar status da conexão'
    });
  }
}

// Função para diagnóstico do servidor - mostra todos os usuários ativos
// Histórico simplificado
async function getSessionsHistory(userId: string) {
  return NextResponse.json({
    success: true,
    data: { sessions: [], totals: {}, currentSession: null }
  });
}

async function getServerDiagnostic() {
  return NextResponse.json({
    success: true,
    data: { timestamp: new Date().toISOString(), users: {} }
  });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'MegaRoulette BR Bot API',
    version: '2.1.0'
  });
} 
