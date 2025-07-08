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
  action?: 'bet-connect' | 'start-operation' | 'stop-operation' | 'get-websocket-logs' | 'get-operation-report' | 'reset-operation-report' | 'get-connection-status' | 'server-diagnostic' | 'get-sessions-history' | 'blaze-proxy' | 'pragmatic-proxy' | 'debug-auth' | 'get-blaze-token' | 'frontend-auth' | 'generate-client-tokens' | 'update-strategy' | 'update-stake' | 'activate-real-mode';
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

// NOVO: Sistema de aquecimento - armazena resultados reais para análise
const gameResults: { [userId: string]: Array<{ number: number; color: string; gameId: string; timestamp: number }> } = {};

// NOVO: Estados para controle da operação
const operationState: { [userId: string]: {
  active: boolean; 
  martingaleLevel: number;         // 0-3 (nível do martingale M1-M4)
  waitingForResult: boolean;
  lastGameId?: string;
  currentBetColor?: 'R' | 'B';    // ✅ NOVO: Armazena cor da aposta atual
  

  strategy: {
    sequences: number[];           // [stake, stake*4+2, stake*10+2, stake*22+2] - Nova estrutura personalizada M1-M4
    maxMartingale: number;        // 4
  };
  // 🔍 CONTADORES DE ANÁLISE (aquecimento)
  analysisCounters: {
    m1Wins: number;              // Vitórias no M1 (limiar: 8)
    m2Wins: number;              // Vitórias no M2 (limiar: 4)
    m3Wins: number;              // Vitórias no M3 (limiar: 2)
    m4Losses: number;            // 🔄 MUDANÇA: Derrotas no M4 (limiar: 1)
  };
  // 📊 LIMIARES PARA SAIR DA ANÁLISE
  thresholds: {
    m1Required: number;          // 8 vitórias no M1
    m2Required: number;          // 4 vitórias no M2
    m3Required: number;          // 2 vitórias no M3
    m4Required: number;          // 🔄 MUDANÇA: 1 derrota no M4
  };
  stats: {
    totalBets: number;
    wins: number;
    losses: number;
    profit: number;
    startedAt: number;
  };
  // 🛡️ NOVO: Configurações de segurança
  safetyConfig?: {
    allowedStatuses?: string[];  // Status permitidos para operação ['Excelente', 'Bom', etc]
  };
  // 🎯 NOVO: Controle de ativação inteligente
  smartActivation?: {
    readyToActivate?: boolean;      // Limiar atingido, aguardando momento ideal
    waitingForSequenceEnd?: boolean; // Aguardando fim da sequência atual
  };
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
const autoRenewalIntervals: { [userId: string]: NodeJS.Timeout } = {};

// Controle de reconexões WebSocket
const reconnectionControl: { [userId: string]: {
  attempts: number;
  lastAttempt: number;
  maxAttempts: number;
  backoffDelay: number;
} } = {};

// NOVO: Controle para começar a coletar resultados apenas após primeiro "apostas fechadas"
// Removido: resultCollectionEnabled - não precisa mais aguardar primeiro "apostas fechadas"

// NOVO: Controle para distinguir primeira conexão de reconexões
const isFirstConnection: { [userId: string]: boolean } = {};

// NOVO: Controle do estado das apostas (abertas/fechadas) para timing do botão
const bettingWindowState: { [userId: string]: {
  isOpen: boolean;           // Se a janela de apostas está aberta
  currentGameId?: string;    // ID do jogo atual
  lastUpdate: number;        // Timestamp da última atualização
} } = {};

// 📊 NOVO: Rastreamento de vitórias de martingale por usuário (para gráfico)
const martingaleUsageStats: { [userId: string]: number[] } = {};

// 📊 NOVO: Rastreamento de rodadas analisadas por nível (para mostrar total de tentativas)
const analysisRoundsStats: { [userId: string]: number[] } = {};

// 🔄 NOVO: Contador específico para derrotas no M4 (lógica invertida)
const m4LossesCounter: { [userId: string]: number } = {};

// 📋 NOVO: Histórico detalhado de análises e apostas reais
const detailedHistory: { [userId: string]: Array<{
  id: string;
  timestamp: number;
  mode: 'analysis' | 'real';
  martingaleLevel: number;
  betColor: 'R' | 'B';
  resultColor: string;
  resultNumber: number;
  gameId: string;
  isWin: boolean;
  betAmount: number;
  profit: number;
  sequencePosition: string; // "M1", "M2", "M3", "M4"
}> } = {};

// 🔄 NOVO: Timer para reconexão automática a cada 10 minutos
const reconnectionTimers: { [userId: string]: NodeJS.Timeout } = {};





// 📊 FUNÇÃO: Registrar vitórias de martingale (alimenta o gráfico)
// ✅ IMPORTANTE: Só chama quando:
// - Ganha em M1, M2, M3 (imediatamente após vitória)
// - M4 tem lógica INVERTIDA: só conta derrotas, não vitórias
// - Vitórias M4 são ignoradas (volta para M1)
function recordMartingaleUsage(userId: string, martingaleLevel: number) {
  // Inicializar array se não existir
  if (!martingaleUsageStats[userId]) {
    martingaleUsageStats[userId] = new Array(4).fill(0);
  }
  
  // Registrar vitória (martingaleLevel já está 0-indexed)
  if (martingaleLevel >= 0 && martingaleLevel < 4) {
    const oldValue = martingaleUsageStats[userId][martingaleLevel];
    martingaleUsageStats[userId][martingaleLevel]++;
    addWebSocketLog(userId, `📊 Vitória M${martingaleLevel + 1} registrada - Total: ${martingaleUsageStats[userId][martingaleLevel]}`, 'success');
  }
}

// 📊 FUNÇÃO: Resetar estatísticas de vitórias de martingale
function resetMartingaleUsage(userId: string) {
  martingaleUsageStats[userId] = new Array(4).fill(0);
  addWebSocketLog(userId, `📊 Estatísticas de vitórias de martingale resetadas`, 'info');
}

// 📊 FUNÇÃO: Registrar rodada analisada por nível
function recordAnalysisRound(userId: string, martingaleLevel: number) {
  // Inicializar array se não existir
  if (!analysisRoundsStats[userId]) {
    analysisRoundsStats[userId] = new Array(4).fill(0);
  }
  
  // Registrar rodada analisada (martingaleLevel já está 0-indexed)
  if (martingaleLevel >= 0 && martingaleLevel < 4) {
    analysisRoundsStats[userId][martingaleLevel]++;
  }
}

// 📊 FUNÇÃO: Resetar estatísticas de rodadas analisadas
function resetAnalysisRounds(userId: string) {
  analysisRoundsStats[userId] = new Array(4).fill(0);
  addWebSocketLog(userId, `📊 Estatísticas de rodadas analisadas resetadas`, 'info');
}

// 🔄 FUNÇÃO: Registrar derrota no M4 (lógica invertida)
function recordM4Loss(userId: string) {
  addWebSocketLog(userId, `🔍 DEBUG: recordM4Loss chamado`, 'info');
  
  if (!m4LossesCounter[userId]) {
    m4LossesCounter[userId] = 0;
  }
  
  const oldValue = m4LossesCounter[userId];
  m4LossesCounter[userId]++;
  addWebSocketLog(userId, `📊 Registrada derrota M4 - Total: ${oldValue} → ${m4LossesCounter[userId]}`, 'info');
}

// 🔄 FUNÇÃO: Resetar contador de derrotas M4
function resetM4Losses(userId: string) {
  m4LossesCounter[userId] = 0;
  addWebSocketLog(userId, `📊 Contador de derrotas M4 resetado`, 'info');
}



// 📋 FUNÇÃO: Adicionar entrada ao histórico detalhado
function addDetailedHistoryEntry(userId: string, entry: {
  mode: 'analysis' | 'real';
  martingaleLevel: number;
  betColor: 'R' | 'B';
  resultColor: string;
  resultNumber: number;
  gameId: string;
  isWin: boolean;
  betAmount: number;
}) {
  if (!detailedHistory[userId]) {
    detailedHistory[userId] = [];
  }
  
  // 🔧 CORREÇÃO: Calcular profit corretamente
  // Vitória: ganha o valor apostado (2x o valor apostado - valor apostado = valor apostado de lucro)
  // Derrota: perde o valor apostado
  const profit = entry.isWin ? entry.betAmount : -entry.betAmount;
  const sequencePosition = `M${entry.martingaleLevel + 1}`;
  
  const historyEntry = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    mode: entry.mode,
    martingaleLevel: entry.martingaleLevel,
    betColor: entry.betColor,
    resultColor: entry.resultColor,
    resultNumber: entry.resultNumber,
    gameId: entry.gameId,
    isWin: entry.isWin,
    betAmount: entry.betAmount,
    profit: profit,
    sequencePosition: sequencePosition
  };
  
  detailedHistory[userId].push(historyEntry);
  
  // Limitar histórico a 1000 entradas para evitar uso excessivo de memória
  if (detailedHistory[userId].length > 1000) {
    detailedHistory[userId] = detailedHistory[userId].slice(-1000);
  }
  
  addWebSocketLog(userId, `📋 Entrada adicionada ao histórico: ${sequencePosition} ${entry.mode} ${entry.isWin ? 'WIN' : 'LOSS'}`, 'info');
}

// 📋 FUNÇÃO: Resetar histórico detalhado
function resetDetailedHistory(userId: string) {
  detailedHistory[userId] = [];
  addWebSocketLog(userId, `📋 Histórico detalhado resetado`, 'info');
}

// 📋 FUNÇÃO: Obter histórico detalhado
function getDetailedHistory(userId: string) {
  return detailedHistory[userId] || [];
}

// 📋 FUNÇÃO: Atualizar número do resultado na última entrada do histórico
function updateLastHistoryEntryNumber(userId: string, resultNumber: number, gameId: string) {
  if (!detailedHistory[userId] || detailedHistory[userId].length === 0) {
    return;
  }
  
  // Encontrar a última entrada que corresponde ao gameId
  const lastEntryIndex = detailedHistory[userId].findLastIndex(entry => entry.gameId === gameId);
  
  if (lastEntryIndex !== -1) {
    detailedHistory[userId][lastEntryIndex].resultNumber = resultNumber;
  }
}

// Sistema de humanização removido

// Estratégia Martingale personalizada - Nova estrutura
const MARTINGALE_SEQUENCES = [20.00, 20.00, 21.00, 4.00, 2.50, 2.50, 2.00, 1.50, 1.00, 0.50];

// Funções de sessão simplificadas (removidas - não essenciais)

// Função principal POST
export async function POST(request: NextRequest) {
  try {
    // 💾 LIMPEZA: Limpar backups expirados periodicamente
    // Removido: limpeza simplificada

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
      testType,
      // 💰 NOVO: Campos para sequência personalizada
      customMartingaleSequence,
      stakeBased,
      // Novos campos para estratégia 'Break-Even Estratégico'
      breakEvenStrategy
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
        }, authTokens, forceClientSideAuth, customMartingaleSequence, stakeBased);
      
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
      
      case 'update-strategy':
        // 🛡️ NOVO: Suporte para configurações de segurança
        const { stopGainPercentage, allowedStatuses } = requestBody;
        
        if (userId && operationState[userId]) {
          // Atualizar configurações existentes
          if (stopGainPercentage !== undefined) {
            // Salvar stop gain (já existe no código)
            addWebSocketLog(userId, `🎯 Stop gain ${stopGainPercentage ? `ativado: ${stopGainPercentage}%` : 'desativado'}`, 'success');
          }
          
          // 🛡️ NOVO: Salvar configurações de status permitidos
          if (allowedStatuses && Array.isArray(allowedStatuses)) {
            if (!operationState[userId].safetyConfig) {
              operationState[userId].safetyConfig = {};
            }
            operationState[userId].safetyConfig.allowedStatuses = allowedStatuses;
            addWebSocketLog(userId, `🛡️ Status permitidos atualizados: ${allowedStatuses.join(', ')}`, 'success');
          }
        }
        
        return NextResponse.json({ success: true });
      
      case 'update-stake':
        const { newStake } = requestBody;
        if (userId && newStake && operationState[userId]) {
          // Atualizar sequência de martingale com novo stake
          const calculateSequence = (baseTip: number) => {
            const baseSequence = [20.00, 20.00, 21.00, 4.00, 2.50, 2.50, 2.00, 1.50, 1.00, 0.50];
            const multiplier = baseTip / 20.00;
            return baseSequence.map(value => value * multiplier);
          };
          
          const newSequence = calculateSequence(newStake);
          operationState[userId].strategy.sequences = newSequence;
          
          addWebSocketLog(userId, `💰 Stake atualizado para R$ ${newStake.toFixed(2)} - Nova sequência: [${newSequence.slice(0, 4).map(v => v.toFixed(2)).join(', ')}]`, 'success');
        }
        return NextResponse.json({ success: true });
      
      case 'activate-real-mode':
        // 🛡️ NOVO: Ativar modo real automaticamente quando status melhorar
        if (userId && operationState[userId]?.active) {
          addWebSocketLog(userId, `🛡️ Comando recebido: ativar modo real automaticamente`, 'success');
          
          // Forçar saída do modo análise e ativar modo real
          const operation = operationState[userId];
          operation.martingaleLevel = 0; // Reset para M1 no modo real
          
          addWebSocketLog(userId, `🚀 MODO REAL ATIVADO! Status seguro detectado → Iniciando apostas reais no M1`, 'success');
        }
        return NextResponse.json({ success: true });
      
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

// 🔍 FUNÇÃO: Processar resultado do jogo com dupla validação
async function processGameResult(userId: string, gameId: string, number: number, color: string) {
  // 🔍 DUPLA VALIDAÇÃO: Verificar e corrigir inconsistências
  const validation = validateAndCorrectColor(number, color);
  
  // 📋 LOG: Sempre mostrar resultado da validação
  addWebSocketLog(userId, validation.logMessage, validation.hasConflict ? 'error' : 'success');
  
  // 🔧 USAR SEMPRE A COR CORRIGIDA
  const correctedColor = validation.correctedColor;
  const colorCode = number === 0 ? 'green' : (correctedColor === 'red' ? 'R' : 'B');
  
  // 💾 RECOVERY: Verificar se este resultado resolve uma aposta pendente
  const operation = operationState[userId];
  if (operation?.waitingForResult && operation.lastGameId === gameId) {
    addWebSocketLog(userId, `🔄 RECOVERY: Resultado encontrado para aposta pendente (Game: ${gameId})`, 'success');
    addWebSocketLog(userId, `🎯 Aposta: ${operation.currentBetColor === 'R' ? 'VERMELHO' : 'PRETO'} | Resultado: ${correctedColor.toUpperCase()}`, 'info');
    
    // 📋 VERIFICAR: Se há entrada pendente ou enviada no histórico para atualizar
    if (detailedHistory[userId]) {
      const pendingEntry = detailedHistory[userId].findLast(entry => 
        entry.gameId === gameId && (entry.resultColor === 'pending' || entry.resultColor === 'sent')
      );
      
      if (pendingEntry) {
        const betColor = operation.currentBetColor;
        const isWin = (colorCode === betColor);
        
        // Removido: update pending bet simplificado
        
        addWebSocketLog(userId, `📋 Entrada pendente/enviada atualizada no histórico`, 'success');
      }
    }
  }
  
  // Se for zero e há operação ativa, processa como derrota
  if (number === 0 && operationState[userId]?.active) {
    addWebSocketLog(userId, `🟢 Zero detectado: ${number} - processando como derrota`, 'game');
    await processOperationResult(userId, 'green');
    return;
  }
  
  // Adiciona aos resultados do jogo (sempre armazena, incluindo zeros)
  if (!gameResults[userId]) {
    gameResults[userId] = [];
  }
  
  gameResults[userId].push({
    number,
    color: colorCode,
    gameId,
    timestamp: Date.now()
  });
  
  // Mantém apenas os últimos 50 resultados
  if (gameResults[userId].length > 50) {
    gameResults[userId].shift();
  }
  
  // 🔍 LOG: Mostrar resultado final (corrigido se necessário)
  const statusIcon = validation.hasConflict ? '🔧' : '🎲';
  addWebSocketLog(userId, `${statusIcon} Resultado final: ${number} ${correctedColor} | Total: ${gameResults[userId].length}`, 'game');
  
  // 📋 NOVO: Atualizar número do resultado no histórico detalhado
  updateLastHistoryEntryNumber(userId, number, gameId);
  
  // Se operação ativa, processa aposta
  if (operationState[userId]?.active) {
    await processOperationResult(userId, colorCode);
  }
  }
  
// 🎲 FUNÇÃO: Sempre apostar no vermelho (sem randomização)
function generateRedBet(): 'R' {
  return 'R'; // Sempre vermelho
}
  
// 🔍 NOVA FUNÇÃO: Verificar se pode sair do modo análise
function canExitAnalysisMode(userId: string): boolean {
  const operation = operationState[userId];
  if (!operation) return false;
  
  const thresholds = operation.thresholds;
  
  // ✅ CORREÇÃO: Usar martingaleUsageStats como fonte única da verdade
  const martingaleStats = martingaleUsageStats[userId] || new Array(4).fill(0);
  
  // 🔄 MUDANÇA: Para M4, verificar derrotas ao invés de vitórias
  const m4Losses = m4LossesCounter[userId] || 0;
  
  const m1Check = martingaleStats[0] >= thresholds.m1Required;
  const m2Check = martingaleStats[1] >= thresholds.m2Required;
  const m3Check = martingaleStats[2] >= thresholds.m3Required;
  const m4Check = m4Losses >= thresholds.m4Required;
  
  // 🎯 NOVA LÓGICA: Qualquer nível que atingir o mínimo já ativa o modo real
  return m1Check || m2Check || m3Check || m4Check;
}

// 🎯 NOVA FUNÇÃO: Ativar modo real imediatamente quando limiar for atingido
async function checkReadyForRealMode(userId: string): Promise<void> {
  const operation = operationState[userId];
  
  if (!operation) {
    return;
  }
  
  if (canExitAnalysisMode(userId)) {
    return;
  }
  
  const canExit = canExitAnalysisMode(userId);
  
  if (canExit) {
    // 🎯 NOVO: Inicializar controle de ativação inteligente se não existir
    if (!operation.smartActivation) {
      operation.smartActivation = {
        readyToActivate: false,
        waitingForSequenceEnd: false
      };
    }
    
    // 🎯 NOVO: Se já está pronto para ativar, não processar novamente
    if (operation.smartActivation.readyToActivate) {
      return;
    }
    
    const stats = martingaleUsageStats[userId];
    const thresholds = operation.thresholds;
    const m4Losses = m4LossesCounter[userId] || 0;
    
    // 🎯 IDENTIFICAR QUAL NÍVEL ATINGIU O MÍNIMO
    const reachedLevels = [];
    if (stats[0] >= thresholds.m1Required) reachedLevels.push(`M1=${stats[0]}/${thresholds.m1Required} vitórias`);
    if (stats[1] >= thresholds.m2Required) reachedLevels.push(`M2=${stats[1]}/${thresholds.m2Required} vitórias`);
    if (stats[2] >= thresholds.m3Required) reachedLevels.push(`M3=${stats[2]}/${thresholds.m3Required} vitórias`);
    if (m4Losses >= thresholds.m4Required) reachedLevels.push(`M4=${m4Losses}/${thresholds.m4Required} derrotas`);
    
    // 🎯 NOVO: Marcar como pronto para ativar, mas NÃO ativar ainda
    operation.smartActivation.readyToActivate = true;
    operation.smartActivation.waitingForSequenceEnd = operation.martingaleLevel > 0;
    
    addWebSocketLog(userId, `🎯 LIMIAR ATINGIDO! ${reachedLevels.join(', ')} - Aguardando fim da sequência para ativar modo real`, 'success');
    addWebSocketLog(userId, `📊 Todos os contadores: M1=${stats[0]}/${thresholds.m1Required}, M2=${stats[1]}/${thresholds.m2Required}, M3=${stats[2]}/${thresholds.m3Required}, M4=${m4Losses}/${thresholds.m4Required} derrotas`, 'info');
    
    // 🎯 NOVO: Se já está no M1, ativar imediatamente
    if (operation.martingaleLevel === 0) {
      activateRealModeNow(userId);
    } else {
      // 🎯 NOVO: Aguardar fim da sequência
      addWebSocketLog(userId, `⏳ Aguardando fim da sequência atual (M${operation.martingaleLevel + 1}) para ativar modo real no próximo M1`, 'info');
      operation.smartActivation.waitingForSequenceEnd = true;
    }
  }
}

// 🎯 NOVA FUNÇÃO: Ativar modo real imediatamente
function activateRealModeNow(userId: string): void {
  const operation = operationState[userId];
  
  if (!operation || !operation.smartActivation) {
    return;
  }
  
  // ✅ Resetar para M1 quando modo real é ativado
  operation.martingaleLevel = 0; // Reset para M1 no modo real
  
  // 🎯 NOVO: Marcar como ativado
  operation.smartActivation.readyToActivate = false;
  operation.smartActivation.waitingForSequenceEnd = false;
  
  addWebSocketLog(userId, `🚀 MODO REAL ATIVADO! Limiar atingido → Iniciando apostas reais no M1`, 'success');
}

// 🔄 NOVA FUNÇÃO: Reset contadores de análise
function resetAnalysisCounters(userId: string): void {
  const operation = operationState[userId];
  if (operation) {
    operation.analysisCounters = {
      m1Wins: 0,
      m2Wins: 0,
      m3Wins: 0,
      m4Losses: 0
    };
    // ✅ CORREÇÃO: Limpar cor da aposta armazenada
    operation.currentBetColor = undefined;
    addWebSocketLog(userId, `🔄 Contadores de análise resetados`, 'info');
  }
  
  // 🔄 TAMBÉM resetar o contador específico de derrotas M4
  resetM4Losses(userId);
}

// NOVO: Função para processar resultado da operação (Nova Lógica de Aquecimento)
async function processOperationResult(userId: string, resultColor: string) {
  const operation = operationState[userId];
  if (!operation || !operation.active || !operation.strategy?.sequences) {
    addWebSocketLog(userId, '❌ Estado da operação inválido para processar resultado', 'error');
    return;
  }

  // 🎲 CORREÇÃO: Usar cor da aposta armazenada (sempre vermelho)
  const betColor = operation.currentBetColor;
  
  if (!betColor) {
    return;
  }
  
  // ✅ ZERO SEMPRE CONTA COMO DERROTA - só ganha se for exatamente a cor apostada
  const isWin = (resultColor === betColor);
  
  // ✅ CORREÇÃO: Determinar modo baseado nos contadores, não na propriedade mode
  const isRealMode = canExitAnalysisMode(userId);
  
  // ✅ CORREÇÃO: Só conta estatísticas no modo REAL, não na análise (simulação)
  if (isRealMode) {
    operation.stats.totalBets++;
  }
  operation.waitingForResult = false; // ✅ SEMPRE libera para próxima aposta
  
  const betAmount = operation.strategy?.sequences?.[operation.martingaleLevel];
  const betColorName = COLOR_NAMES[betColor] || betColor;
  const resultColorName = COLOR_NAMES[resultColor] || resultColor;
  
  // 📋 CORREÇÃO: Registrar no histórico detalhado baseado nos contadores
  addDetailedHistoryEntry(userId, {
    mode: isRealMode ? 'real' : 'analysis',
    martingaleLevel: operation.martingaleLevel,
    betColor: betColor,
    resultColor: resultColor,
    resultNumber: 0, // Número será definido quando disponível
    gameId: operation.lastGameId || 'unknown',
    isWin: isWin,
    betAmount: betAmount
  });
  
  // ✅ CORREÇÃO: Limpar cor da aposta após processamento
  operation.currentBetColor = undefined;
  
  if (isWin) {
    // ✅ GANHOU - NOVA LÓGICA: Avança para próximo nível
    // 💰 Só conta estatísticas no modo REAL
    if (isRealMode) {
      operation.stats.wins++;
      operation.stats.profit += betAmount;
    }
    
    const modeLabel = isRealMode ? '💰 REAL' : '🔍 ANÁLISE';
    addWebSocketLog(userId, `✅ ${modeLabel} - VITÓRIA M${operation.martingaleLevel + 1}! Apostou ${betColorName} R$ ${betAmount.toFixed(2)} → Veio ${resultColorName}`, 'success');
    
    // 🔍 MODO ANÁLISE: NÃO marca vitórias aqui - só marca quando perde
    
    // 🎯 NOVA LÓGICA: Registra vitória IMEDIATAMENTE quando ganha (modo análise)
    const originalRealMode = isRealMode;
    if (!originalRealMode) {
      // Registra vitória do nível atual ANTES de avançar
      recordMartingaleUsage(userId, operation.martingaleLevel);
      addWebSocketLog(userId, `✅ 🔍 ANÁLISE - Vitória M${operation.martingaleLevel + 1} registrada!`, 'success');
      
      // 🎯 NOVA VERIFICAÇÃO: Após registrar vitória, verificar se limiares foram atingidos
      await checkReadyForRealMode(userId);
      
      // 🔍 CORREÇÃO: Se o modo mudou para real, NÃO incrementar martingaleLevel (já foi resetado para M1)
      const newRealMode = canExitAnalysisMode(userId);
      if (newRealMode !== originalRealMode) {
        addWebSocketLog(userId, `🔍 MODO REAL ATIVADO - Mantendo M1 (não incrementando)`, 'info');
        return; // Sair sem incrementar
      }
    }
    
    // ✅ LÓGICA MARTINGALE NORMAL: Vitória avança nível (apenas se ainda estiver no mesmo modo)
    operation.martingaleLevel++; // Avança martingale
    
    // ✅ Verificar se atingiu M4 (máximo da sequência)
    if (operation.martingaleLevel >= 4) {
      // 🔄 CORREÇÃO: Usar contadores para determinar comportamento
      const currentRealMode = canExitAnalysisMode(userId);
      
      if (!currentRealMode) {
        // 🔄 ANÁLISE: M4 atingido = ganhou no M4 → RESETAR ANÁLISE COMPLETA
        addWebSocketLog(userId, `✅ 🔍 ANÁLISE - M4 GANHO! Resetando análise completa`, 'success');
        addWebSocketLog(userId, `🎯 LÓGICA: M4 já saiu, chances menores de sair outro → Recomeçando análise`, 'info');
        
        // 🔄 RESET COMPLETO: Limpar todos os contadores de análise
        resetAnalysisCounters(userId);
        resetMartingaleUsage(userId);
        resetAnalysisRounds(userId);
        resetM4Losses(userId);
        
        // Reset para início da sequência (volta para M1)
        operation.martingaleLevel = 0;
        operation.waitingForResult = false;
        operation.currentBetColor = undefined;
        
        // 🎯 NOVO: Verificar se está pronto para ativar modo real após reset para M1
        if (operation.smartActivation?.readyToActivate && operation.smartActivation?.waitingForSequenceEnd) {
          addWebSocketLog(userId, `🎯 Sequência finalizada! Ativando modo real no próximo M1`, 'success');
          activateRealModeNow(userId);
        }
        
        addWebSocketLog(userId, `🔄 Análise resetada - Recomeçando do M1 com contadores zerados`, 'info');
        
        return; // Não continua o fluxo normal
      } else {
        // Estratégia break-even removida
        
        // 💰 REAL: M4 atingido = sucesso → Volta para análise  
        addWebSocketLog(userId, `🛑 REAL - M4 GANHO! Operação concluída com SUCESSO!`, 'success');
        addWebSocketLog(userId, `💰 Sequência M1-M4 completada - Resetando dados (preservando autenticação)`, 'success');
        
        // 🔧 NOTA: No modo REAL não precisamos registrar vitórias para limiares (só conta lucro)
        
        // 🔧 CORREÇÃO: Usar reset seguro que preserva autenticação
        resetOperationSafely(userId, 'REAL - M4 concluído com sucesso', true); // true = resetar coleta de resultados
        
        // ✅ NOVO: Iniciar nova análise automaticamente após M4 ganho
        addWebSocketLog(userId, `🔄 Iniciando nova análise automaticamente...`, 'info');
        setTimeout(() => {
          startSimpleOperation(userId);
        }, 1000); // Aguarda 1 segundo para processar o reset
      }
    } else {
      // ✅ Continua operação - mostrar próxima aposta
      const currentRealMode = canExitAnalysisMode(userId);
      const modeLabel = currentRealMode ? '💰 REAL' : '🔍 ANÁLISE';
      addWebSocketLog(userId, `🔄 ${modeLabel} - Próxima aposta: M${operation.martingaleLevel + 1}`, 'info');
      
      // ✅ Se ainda estiver no modo análise, continuar normalmente
      if (!currentRealMode) {
        addWebSocketLog(userId, `🔄 ${modeLabel} - Continuando análise no M${operation.martingaleLevel + 1}`, 'info');
      }
    }
    
  } else {
    // ❌ PERDEU - NOVA LÓGICA: Volta para M1
    // 💰 Só conta estatísticas no modo REAL
    if (isRealMode) {
      operation.stats.losses++;
      operation.stats.profit -= betAmount;
    }
    
    const isGreenDefeat = resultColor === 'green';
    const defeatReason = isGreenDefeat ? '(ZERO)' : `(${resultColorName})`;
    
    const modeLabel = isRealMode ? '💰 REAL' : '🔍 ANÁLISE';
    addWebSocketLog(userId, `❌ ${modeLabel} - DERROTA M${operation.martingaleLevel + 1}! Apostou ${betColorName} R$ ${betAmount.toFixed(2)} → Veio ${resultColorName} ${defeatReason}`, 'error');
    
    // 🔄 DERROTA NO MODO ANÁLISE: Verificar se foi derrota no M4
    if (!isRealMode) {
      // 🔄 NOVA LÓGICA: Se perdeu no M4, registrar derrota M4
      if (operation.martingaleLevel === 3) { // M4 é índice 3
        recordM4Loss(userId);
        addWebSocketLog(userId, `💥 Derrota M4 registrada - Total: ${m4LossesCounter[userId] || 0}`, 'error');
        
        // Verificar se atingiu o limiar de derrotas M4
        await checkReadyForRealMode(userId);
      }
    }
      
    // ✅ NOVA LÓGICA: Qualquer derrota volta para M1
    addWebSocketLog(userId, `🔄 DERROTA: Voltando para M1`, 'info');
    
    // Reset para início da sequência
    operation.martingaleLevel = 0;
    
    // 🎯 NOVO: Verificar se está pronto para ativar modo real após reset para M1
    if (operation.smartActivation?.readyToActivate && operation.smartActivation?.waitingForSequenceEnd) {
      addWebSocketLog(userId, `🎯 Sequência finalizada! Ativando modo real no próximo M1`, 'success');
      activateRealModeNow(userId);
    }
    
    // 💰 REAL: Derrota → CONTINUA no modo real (não volta para análise)
    if (isRealMode) {
      addWebSocketLog(userId, `🔄 REAL - Derrota → Continuando no modo real (objetivo: M4)`, 'info');
      // NÃO muda para análise - continua no modo real até conseguir M4
    }
    
    // Após processar derrota, verificar validade do token e renovar se necessário
    const session = sessionControl[userId];
    if (session) {
      const now = Date.now();
      // Considera expiração se faltam menos de 3 minutos para expirar (20min padrão)
      const expiresIn = 20 * 60 * 1000;
      const renewThreshold = 3 * 60 * 1000;
      if (!session.lastRenewal || (now - session.lastRenewal) > (expiresIn - renewThreshold)) {
        addWebSocketLog(userId, '⏳ Token próximo de expirar ou expirado, renovando...', 'info');
        await renewSession(userId);
      } else {
        addWebSocketLog(userId, '🔒 Token ainda válido, não precisa renovar.', 'info');
      }
    }
  }
}

// 💾 FUNÇÃO: Renovar sessão automaticamente COM BACKUP DE ESTADO
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

    // 💾 CRIAR BACKUP antes de renovar (se operação ativa)
    if (operationState[userId]?.active) {
      // Removido: backup simplificado
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
      addWebSocketLog(userId, `🔑 Novos tokens ativos - jsessionId: ${authResult.data.jsessionId.substring(0, 8)}...`, 'info');
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

// NOVO: Configurar timer de renovação automática (PADRÃO @/BOTS QUE FUNCIONA)
function setupAutoRenewal(userId: string) {
  // Limpar timer anterior se existir
  if (renewalTimers[userId]) {
    clearTimeout(renewalTimers[userId]);
  }

  // Renovar a cada 15 minutos (antes dos 20 minutos de expiração)
  const renewalInterval = 15 * 60 * 1000; // 15 minutos em ms
  
  renewalTimers[userId] = setTimeout(async () => {
    if (operationState[userId]?.active) {
      addWebSocketLog(userId, '⏰ Timer de renovação ativado (15 min)', 'info');
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
    
  addWebSocketLog(userId, `⏰ Renovação automática configurada (a cada 15 min)`, 'info');
}
    
// NOVO: Conectar ao WebSocket
async function connectToBettingGame(userId: string, tipValue?: number, clientIP?: string, userFingerprint?: any, clientHeaders?: any, authTokens?: { ppToken: string; jsessionId: string; pragmaticUserId: string }, forceClientSideAuth?: boolean, customMartingaleSequence?: number[], stakeBased?: boolean) {
  try {
    addWebSocketLog(userId, '🔗 Iniciando conexão...', 'info');
    
    // Limpar status anterior e parar conexões existentes (preservando sessão se existir)
    const hasExistingSession = sessionControl[userId] != null;
    stopAllConnections(userId, false, hasExistingSession);
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

    // ✅ NOVA LÓGICA: Usar sequência personalizada se fornecida, senão calcular baseada no tipValue
    let calculatedSequence: number[];
    let strategyLabel: string;
    
    if (customMartingaleSequence && stakeBased) {
      // 💰 Usar sequência personalizada baseada em stake
      calculatedSequence = customMartingaleSequence;
      const stake = customMartingaleSequence[0];
      strategyLabel = `Stake R$ ${stake.toFixed(2)}`;
      addWebSocketLog(userId, `💰 Sequência Personalizada (Stake R$ ${stake.toFixed(2)}) - M1-M4: [${calculatedSequence.map((v: number) => v.toFixed(2)).join(', ')}]`, 'info');
    } else {
      // ✅ Calcular sequência baseada no tipValue (modo tradicional)
    const calculateSequence = (baseTip: number) => {
      const baseSequence = [20.00, 20.00, 21.00, 4.00, 2.50, 2.50, 2.00, 1.50, 1.00, 0.50];
      const multiplier = baseTip / 20.00; // Detectar multiplicador (1x, 3x, 6x, 10x) - nova base R$ 20,00
      return baseSequence.map(value => value * multiplier);
    };

      calculatedSequence = calculateSequence(tipValue || 20.00);
    const multiplier = (tipValue || 20.00) / 20.00;
    const multiplierLabel = multiplier === 1 ? '1x' : multiplier === 3 ? '3x' : multiplier === 6 ? '6x' : multiplier === 10 ? '10x' : `${multiplier}x`;
      strategyLabel = `${multiplierLabel} (R$ ${(tipValue || 20.00).toFixed(2)})`;
      addWebSocketLog(userId, `🎯 Estratégia ${strategyLabel} - Sequência: [${calculatedSequence.slice(0, 3).map((v: number) => v.toFixed(2)).join(', ')}...]`, 'info');
    }

    const strategy = {
      sequences: calculatedSequence,
      maxMartingale: 4
    };

    // Sistema simplificado
    
    // Inicializar estados (Nova Lógica de Aquecimento)
    gameResults[userId] = [];
    isFirstConnection[userId] = true; // Marcar como primeira conexão
    operationState[userId] = {
      active: false,
      martingaleLevel: 0,
      waitingForResult: false,
      currentBetColor: undefined, // ✅ CORREÇÃO: Inicializar cor da aposta
      
      strategy: {
        sequences: calculatedSequence,
        maxMartingale: 4
      },
      // 🔍 CONTADORES DE ANÁLISE (aquecimento)
      analysisCounters: {
        m1Wins: 0,
        m2Wins: 0,
        m3Wins: 0,
        m4Losses: 0
      },
      // 📊 LIMIARES FIXOS - NOVA REGRA SIMPLIFICADA
      thresholds: {
        m1Required: 8,
        m2Required: 4,
        m3Required: 2,
        m4Required: 1
      },
      stats: {
        totalBets: 0,
        wins: 0,
        losses: 0,
        profit: 0,
        startedAt: Date.now()
      }
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

// NOVO: Iniciar operação simplificada (Nova Lógica de Aquecimento)
async function startSimpleOperation(userId: string) {
  try {
    // Verificar se operação já existe
    if (!operationState[userId]) {
      return NextResponse.json({
        success: false,
        error: 'Estado da operação não encontrado. Conecte primeiro.'
      });
    }
    
    // 🔧 CORREÇÃO: Usar reset seguro que preserva autenticação
    const isFirstConn = isFirstConnection[userId] || false;
    resetOperationSafely(userId, 'Nova operação iniciada', isFirstConn);
    
    // Marcar que não é mais primeira conexão
    isFirstConnection[userId] = false;
    
    // ✅ Inicializar operação
    
    operationState[userId] = {
      ...operationState[userId],
      active: true,
      martingaleLevel: 0, // Inicia no M1
      waitingForResult: false,
      currentBetColor: undefined, // ✅ CORREÇÃO: Limpar cor da aposta
      
    };
    
    addWebSocketLog(userId, `🔍 ANÁLISE - Operação iniciada em modo aquecimento!`, 'success');
    addWebSocketLog(userId, `🎯 NOVA REGRA: Qualquer nível que atingir o mínimo ativa o modo real IMEDIATAMENTE!`, 'info');
    addWebSocketLog(userId, `📊 Limiares: M1≥8 vitórias, M2≥4 vitórias, M3≥2 vitórias, M4≥1 DERROTA`, 'info');
    addWebSocketLog(userId, `🔴 Apostará sempre no VERMELHO (estratégia fixa)`, 'info');
    
    // ✅ Ativar renovação automática de sessão
    setupAutoRenewal(userId);
    
    // ✅ Tentar apostar imediatamente se as apostas estão abertas
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
        message: 'Operação iniciada - apostas reais baseadas em contadores'
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
      operationState[userId].currentBetColor = undefined; // ✅ CORREÇÃO: Limpar cor da aposta
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

// 💾 FUNÇÃO: Reconectar com novos tokens COM BACKUP DE ESTADO
async function reconnectWithNewTokens(userId: string, userIP?: string, userFingerprint?: any) {
  try {
    // 💾 CRIAR BACKUP antes de reconectar (se operação ativa)
    if (operationState[userId]?.active) {
      // Removido: backup simplificado
    }

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

    // Fechar conexão atual se existir (preservando sessão)
    if (activeWebSockets[userId]) {
      activeWebSockets[userId].ws.close();
      delete activeWebSockets[userId];
    }

    addWebSocketLog(userId, `🔄 Reconectando com novos tokens...`, 'info');
    
    // Conectar novamente
    startWebSocketConnection(userId, newConfig, undefined, userIP, userFingerprint);
    
    // 🔧 CORREÇÃO: Marcar que não é mais primeira conexão
    isFirstConnection[userId] = false;
    
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
      
      // Removido: restore simplificado
      
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

    ws.on('message', async (data: any) => {
      try {
        const message = data.toString().trim();
        
        // Log de todas as mensagens recebidas (para debug)
        if (message.length < 200) {
          addWebSocketLog(userId, `📨 Mensagem recebida: ${message}`, 'info');
        } else {
          addWebSocketLog(userId, `📨 Mensagem recebida: ${message.substring(0, 100)}...`, 'info');
        }

        // 💾 DETECÇÃO: Sessão offline = tokens expirados COM BACKUP
        if (message.includes('<session>offline</session>')) {
          addWebSocketLog(userId, `🔑 Sessão offline detectada - tokens expiraram`, 'error');
          
          // Removido: backup simplificado
          
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
            
            // Removido: sistema de pending bets simplificado
            
            // Se operação ativa e pronto para apostar (normal flow)
            if (operationState[userId]?.active && !operationState[userId]?.waitingForResult) {
              const isRealMode = canExitAnalysisMode(userId);
              const currentMode = isRealMode ? 'real' : 'analysis';
              addWebSocketLog(userId, `🎯 Operação ativa detectada - executando aposta automaticamente (modo: ${currentMode})`, 'success');
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
        }
        
        // ✅ CORREÇÃO: Detectar resposta de comando (aposta aceita/rejeitada) - igual ao @/bots
        if (message.includes('<command') && message.includes('status=')) {
          const statusMatch = message.match(/status="([^"]*)"/);
          const channelMatch = message.match(/channel="([^"]*)"/);
          
          if (statusMatch) {
            const status = statusMatch[1];
            const channel = channelMatch?.[1] || '';
            
            if (status === 'success') {
              addWebSocketLog(userId, `✅ Aposta aceita pelo servidor`, 'success');
            } else if (status === 'error' || status === 'fail' || status === 'denied' || status === 'refused' || status === 'rejected') {
              addWebSocketLog(userId, `❌ Aposta REJEITADA pelo servidor (${status})`, 'error');
              // ✅ SIMPLIFICADO: Sem renovação automática - deixar timer de 18min cuidar disso
            }
          }
        }

        // 💾 CORREÇÃO: Detectar betValidationError com códigos de sessão/autenticação COM BACKUP
        if (message.includes('<betValidationError')) {
          // Códigos relacionados a sessão/autenticação que exigem renovação
          const sessionErrorCodes = ['1039', '1040', '1001', '1002', '1003'];
          const hasSessionError = sessionErrorCodes.some(code => message.includes(`code="${code}"`));
          
          if (hasSessionError) {
            const codeMatch = message.match(/code="([^"]*)"/);
            const errorCode = codeMatch?.[1] || 'unknown';
            
            addWebSocketLog(userId, `🚨 ERRO DE SESSÃO detectado (code ${errorCode}) - Renovando IMEDIATAMENTE!`, 'error');
            addWebSocketLog(userId, `📋 Erro completo: ${message}`, 'error');
            
            // 💾 CRIAR BACKUP antes de renovar
            // Removido: backup simplificado
            
            // Renovar sessão imediatamente
            setTimeout(async () => {
              const renewed = await renewSession(userId);
              if (renewed) {
                addWebSocketLog(userId, `✅ Sessão renovada após erro ${errorCode} - operação continua`, 'success');
                
                // 🔧 CORREÇÃO CRÍTICA: Reconectar WebSocket com novos tokens
                addWebSocketLog(userId, `🔄 Reconectando WebSocket com tokens renovados...`, 'info');
                
                const session = sessionControl[userId];
                if (session) {
                  // Fechar conexão atual
                  if (activeWebSockets[userId]) {
                    activeWebSockets[userId].ws.close();
                    delete activeWebSockets[userId];
                  }
                  
                  // Conectar com novos tokens
                  const newConfig = {
                    jsessionId: session.jsessionId,
                    pragmaticUserId: session.pragmaticUserId,
                    tableId: 'mrbras531mrbr532'
                  };
                  
                  startWebSocketConnection(userId, newConfig);
                }
                
                // Reconfigurar timer
                setupAutoRenewal(userId);
              } else {
                addWebSocketLog(userId, `❌ Falha na renovação - operação pausada`, 'error');
                if (operationState[userId]) {
                  operationState[userId].active = false;
                }
              }
            }, 1000);
            return; // Não processar mais esta mensagem
          } else {
            // Outros erros de validação de aposta (não relacionados à sessão)
            const codeMatch = message.match(/code="([^"]*)"/);
            const errorCode = codeMatch?.[1] || 'unknown';
            addWebSocketLog(userId, `⚠️ Erro de validação de aposta (code ${errorCode}): ${message}`, 'error');
          }
        }
        
        // 💾 Detectar outros erros de sessão COM BACKUP
        if (message.includes('invalid session') || message.includes('session expired') || 
            message.includes('session timeout') || message.includes('unauthorized access') ||
            message.includes('authentication failed') || message.includes('token expired')) {
          addWebSocketLog(userId, `🔑 Erro de sessão detectado: ${message.substring(0, 100)}...`, 'error');
          
          // 💾 CRIAR BACKUP antes de renovar
          if (operationState[userId]?.active) {
            // Removido: backup simplificado
          }
          
          // Renovar sessão automaticamente
          setTimeout(async () => {
            const renewed = await renewSession(userId);
            if (renewed) {
              addWebSocketLog(userId, `✅ Sessão renovada automaticamente`, 'success');
              setupAutoRenewal(userId);
            } else {
              addWebSocketLog(userId, `❌ Falha na renovação automática`, 'error');
              if (operationState[userId]) {
                operationState[userId].active = false;
              }
            }
          }, 1000);
          return;
        }

        // 🔍 RESULTADO DO JOGO: Múltiplos formatos com validação detalhada
        if (message.includes('<result') || message.includes('<gameresult')) {
          const scoreMatch = message.match(/score="([^"]*)"/);
          const gameMatch = message.match(/game="([^"]*)"/);
          
          if (scoreMatch) {
            const number = parseInt(scoreMatch[1]);
            const gameId = gameMatch?.[1] || '';
            
            // 🔍 LOG: Mostrar mensagem original do WebSocket (primeiros 150 chars)
            addWebSocketLog(userId, `📨 WebSocket raw: ${message.substring(0, 150)}...`, 'info');
            
            // 🔍 VERIFICAR: Se WebSocket enviou cor explícita (alguns servers fazem isso)
            const explicitColorMatch = message.match(/color="([^"]*)"/);
            const webSocketColor = explicitColorMatch?.[1];
            
            // Calcular cor esperada baseada no número
            const expectedColor = getColorFromNumber(number);
            
            // 🔍 LOG: Comparar cores se WebSocket enviou explicitamente
            if (webSocketColor) {
              addWebSocketLog(userId, `🔍 WebSocket cor: ${webSocketColor} | Calculada: ${expectedColor}`, 'info');
              
              // Se há conflito, alertar imediatamente
              if (webSocketColor.toLowerCase() !== expectedColor.toLowerCase()) {
                addWebSocketLog(userId, `⚠️ CONFLITO DETECTADO: WebSocket=${webSocketColor}, Esperado=${expectedColor}`, 'error');
              }
            }
            
            // 🔧 PROCESSAR: Usar sempre cor calculada matematicamente
            addWebSocketLog(userId, `🎯 Processando: ${number} → ${expectedColor}`, 'game');
            await processGameResult(userId, gameId, number, expectedColor);
          } else {
            // 🚨 ERRO: Não conseguiu extrair número
            addWebSocketLog(userId, `❌ Erro: Não conseguiu extrair número da mensagem`, 'error');
            addWebSocketLog(userId, `📨 Mensagem: ${message}`, 'error');
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

// 📤 FUNÇÃO: Executar aposta COM SISTEMA DE PENDING BETS
async function executeSimpleBet(userId: string, gameId: string, ws: any) {
  const operation = operationState[userId];
  if (!operation || !operation.active || !operation.strategy?.sequences) {
    addWebSocketLog(userId, '❌ Estado da operação inválido ou incompleto', 'error');
    return;
  }
  
  // 🎲 CORREÇÃO: Sempre aposta no vermelho (igual ao @/bots)
  const redBet = generateRedBet();
  
  // ✅ CORREÇÃO: Armazenar cor da aposta atual no estado da operação
  operation.currentBetColor = redBet;
  
  // ✅ Usar valor do martingale atual (M1, M2, M3, M4)
  const betAmount = operation.strategy?.sequences?.[operation.martingaleLevel];
  const betCode = COLOR_TO_BET_CODE[redBet];
  const colorName = COLOR_NAMES[redBet];
  
  if (!betCode || !colorName) {
    addWebSocketLog(userId, `❌ Cor inválida para aposta: ${redBet}`, 'error');
    return;
  }

  try {
    // 📊 Registrar rodada analisada no nível atual
    recordAnalysisRound(userId, operation.martingaleLevel);
    
    // ✅ CORREÇÃO: Verificar se deve apostar de verdade baseado nos contadores
    const martingaleStats = martingaleUsageStats[userId] || new Array(4).fill(0);
    const m4Losses = m4LossesCounter[userId] || 0;
    const isRealMode = canExitAnalysisMode(userId);
    const modeLabel = isRealMode ? '💰 REAL' : '🔍 ANÁLISE';
    
    if (!isRealMode) {
      // 🔍 ANÁLISE: Só simula, NÃO envia aposta real
      operation.waitingForResult = true;
      operation.lastGameId = gameId;
      
      addWebSocketLog(userId, `🔍 ${modeLabel} M${operation.martingaleLevel + 1}: ${colorName} SIMULADO → Game ${gameId}`, 'success');
      
      return; // NÃO envia aposta real no modo análise
    }
    
    // 💰 REAL: Envia aposta verdadeira (limiares atingidos)
    const timestamp = Date.now().toString();
    
    // ✅ CORREÇÃO: Usar pragmaticUserId da sessão renovada, não gerar novo
    const session = sessionControl[userId];
    const pragmaticUserId = session?.pragmaticUserId || `ppc${timestamp}`;
    
    if (session?.pragmaticUserId) {
      addWebSocketLog(userId, `🔑 Usando tokens da sessão renovada (${session.pragmaticUserId.substring(0, 8)}...)`, 'info');
    } else {
      addWebSocketLog(userId, `⚠️ Gerando novo pragmaticUserId (sessão não encontrada)`, 'error');
    }
    
    const betXml = `<command channel="table-mrbras531mrbr532">
  <lpbet gm="roulette_desktop" gId="${gameId}" uId="${pragmaticUserId}" ck="${timestamp}">
    <bet amt="${betAmount}" bc="${betCode}" ck="${timestamp}" />
  </lpbet>
</command>`;
          
    // 📤 NOVO: Enviar aposta com sistema de pending bets
    const sendResult = await sendWebSocketMessage(ws, betXml, userId);
    if (!sendResult.success) {
      addWebSocketLog(userId, `❌ Falha ao enviar aposta: ${sendResult.error}`, 'error');
      return;
    }
    
    // ✅ SUCESSO: Aposta enviada com sucesso
    operation.waitingForResult = true;
    operation.lastGameId = gameId;
    
    addWebSocketLog(userId, `🎯 ${modeLabel} M${operation.martingaleLevel + 1}: ${colorName} R$ ${betAmount.toFixed(2)} → Game ${gameId}`, 'success');
    
    // TODO: Debitar créditos quando necessário
    // await debitUserCredits(userId, betAmount);

  } catch (error) {
    addWebSocketLog(userId, `❌ Erro ao enviar aposta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, 'error');
    
    // 📤 CRIAR APOSTA PENDENTE mesmo em caso de erro de rede
    const isRealMode = canExitAnalysisMode(userId);
    if (isRealMode) {
      // Removido: createPendingBet call
    }
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

// 🔍 FUNÇÃO: Dupla validação de cores na roleta (sem tabela)
function validateAndCorrectColor(number: number, receivedColor: string): {
  correctedColor: string;
  hasConflict: boolean;
  logMessage: string;
} {
  // Mapeamento correto dos números vermelhos na roleta europeia
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  
  let expectedColor: string;
  if (number === 0) {
    expectedColor = 'green';
  } else {
    expectedColor = redNumbers.includes(number) ? 'red' : 'black';
  }
  
  // Normalizar cores para comparação
  const normalizedReceived = receivedColor.toLowerCase();
  const normalizedExpected = expectedColor.toLowerCase();
  
  // Verificar se há conflito
  const hasConflict = normalizedReceived !== normalizedExpected;
  
  let logMessage: string;
  if (hasConflict) {
    logMessage = `🔧 CORREÇÃO: ${number} - WebSocket disse ${receivedColor}, corrigido para ${expectedColor}`;
  } else {
    logMessage = `✅ VALIDADO: ${number} = ${expectedColor}`;
  }
  
  return {
    correctedColor: expectedColor,
    hasConflict,
    logMessage
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

// 🔧 CORREÇÃO: Função para reset seguro que preserva autenticação
function resetOperationSafely(userId: string, reason: string = 'Reset automático', isFirstConnectionReset: boolean = false) {
  // Parar apenas a operação, sem afetar a autenticação
  if (operationState[userId]) {
    operationState[userId].active = false;
    operationState[userId].waitingForResult = false;
    operationState[userId].currentBetColor = undefined;
    operationState[userId].martingaleLevel = 0;
  }

  // Resetar dados de análise
  resetAnalysisCounters(userId);
  resetMartingaleUsage(userId);
  resetAnalysisRounds(userId);
  resetM4Losses(userId);
  // ✅ CORREÇÃO: NÃO resetar histórico detalhado aqui - só limpa quando página recarrega
  // resetDetailedHistory(userId);

  // 🔧 CORREÇÃO: Coleta de resultados sempre ativa (não precisa aguardar primeiro "apostas fechadas")
  addWebSocketLog(userId, `🔄 ${reason} - Coleta de resultados sempre ativa`, 'info');

  // Resetar estado da janela de apostas
  if (bettingWindowState[userId]) {
    delete bettingWindowState[userId];
  }

  addWebSocketLog(userId, `🔄 ${reason} - Dados resetados, autenticação e histórico preservados`, 'info');
}

function stopAllConnections(userId: string, setErrorStatus: boolean = true, preserveSession: boolean = false) {
  addWebSocketLog(userId, `🛑 Parando todas as conexões para usuário ${userId}`, 'info');
  
  // Parar timer de reconexão automática
  stopAutoReconnectionTimer(userId);
  
  // Parar operação
  if (operationState[userId]) {
    operationState[userId].active = false;
    operationState[userId].waitingForResult = false;
    operationState[userId].currentBetColor = undefined;
  }
  
  // Fechar WebSocket
  if (activeWebSockets[userId]) {
    try {
      activeWebSockets[userId].ws.close();
      addWebSocketLog(userId, `🔌 WebSocket fechado`, 'info');
    } catch (error) {
      addWebSocketLog(userId, `⚠️ Erro ao fechar WebSocket: ${error}`, 'error');
    }
    delete activeWebSockets[userId];
  }
  
  // Limpar timers de renovação
  if (renewalTimers[userId]) {
    clearTimeout(renewalTimers[userId]);
    delete renewalTimers[userId];
  }
  
  if (autoRenewalIntervals[userId]) {
    clearInterval(autoRenewalIntervals[userId]);
    delete autoRenewalIntervals[userId];
  }
  
  // Resetar controle de reconexão
  resetReconnectionControl(userId);
  
  // Não preservar sessão se não especificado
  if (!preserveSession) {
    delete sessionControl[userId];
  }
  
  // Limpar controle de primeira conexão quando parar tudo
  if (isFirstConnection[userId]) {
    delete isFirstConnection[userId];
  }
  
  // Atualizar status
  if (setErrorStatus) {
    updateConnectionStatus(userId, false, 'Conexão encerrada');
  }
  
  addWebSocketLog(userId, `✅ Todas as conexões foram encerradas`, 'info');
}

// Obter logs do WebSocket
async function getWebSocketLogs(userId: string) {
  try {
    const logs = websocketLogs[userId] || [];
    const results = gameResults[userId] || [];
    const status = connectionStatus[userId] || { connected: false, lastUpdate: Date.now() };
    const operation = operationState[userId];

    // NOVO: Verificar se pode iniciar operação (sem verificações complexas)
    const bettingWindow = bettingWindowState[userId];
    const bettingWindowOpen = bettingWindow?.isOpen || false;
    const canStartOperation = bettingWindowOpen && !operation?.active;

    return NextResponse.json({
      success: true,
      data: {
        logs,
        connectionStatus: status,
        gameResults: results,
        operationActive: operation?.active || false,
        operationState: operation ? {
          mode: canExitAnalysisMode(userId) ? 'real' : 'analysis',
          martingaleLevel: operation.martingaleLevel,
          waitingForResult: operation.waitingForResult,
          stats: operation.stats,
          // 🔍 NOVO: Status de análise
          analysisStatus: !canExitAnalysisMode(userId) ? {
            counters: {
              m1Wins: martingaleUsageStats[userId]?.[0] || 0,
              m2Wins: martingaleUsageStats[userId]?.[1] || 0,
              m3Wins: martingaleUsageStats[userId]?.[2] || 0,
              m4Losses: m4LossesCounter[userId] || 0
            },
            thresholds: operation.thresholds,
            canExitAnalysis: canExitAnalysisMode(userId)
          } : null,
          // 💰 Status de lucro em tempo real
          profitStatus: {
            current: operation.stats.profit,
            isProfit: operation.stats.profit > 0,
            canPause: operation.stats.profit > 0, // Só pode pausar se tiver lucro
            formatted: `R$ ${operation.stats.profit.toFixed(2)}`,
            status: operation.stats.profit > 0 ? 'LUCRO' : operation.stats.profit < 0 ? 'PREJUÍZO' : 'NEUTRO'
          },
          // 🛑 NOVO: Controle do botão "parar de apostar"
          stopButtonControl: {
            canStop: !operation.waitingForResult, // Só pode parar quando não há aposta ativa
            mode: canExitAnalysisMode(userId) ? 'real' : 'analysis',
            isBlocked: operation.waitingForResult, // Bloqueia quando há aposta em andamento
            reason: operation.waitingForResult ? 'Aposta em andamento...' : null
          }
        } : null,
        canStartOperation,
        bettingWindow: {
          isOpen: bettingWindowOpen,
          currentGameId: bettingWindow?.currentGameId,
          lastUpdate: bettingWindow?.lastUpdate
        },
        // 📊 Estatísticas de uso de martingale
        martingaleUsage: martingaleUsageStats[userId] || new Array(4).fill(0),
        // 📊 Estatísticas de rodadas analisadas por nível
        analysisRounds: analysisRoundsStats[userId] || new Array(4).fill(0),
        // 📋 Histórico detalhado de análises e apostas reais
        detailedHistory: getDetailedHistory(userId),
        // ✅ Status da sessão para monitoramento
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

    // 📊 IMPORTANTE: Resetar também as estatísticas de martingale e rodadas analisadas
    resetMartingaleUsage(userId);
    resetAnalysisRounds(userId);

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
    const results = gameResults[userId] || [];
    const operation = operationState[userId];

    return NextResponse.json({
      success: true,
      data: {
        connected: status.connected,
        lastUpdate: status.lastUpdate,
        error: status.error,
        resultsCount: results.length,
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

// 🔄 NOVO: Função para iniciar timer de reconexão automática
function startAutoReconnectionTimer(userId: string) {
  // Limpar timer existente se houver
  if (reconnectionTimers[userId]) {
    clearTimeout(reconnectionTimers[userId]);
  }
  
  // Criar novo timer para reconexão a cada 10 minutos
  reconnectionTimers[userId] = setTimeout(async () => {
    const operation = operationState[userId];
    
    // Verificar se não está aguardando resultado (meio do martingale)
    if (operation && operation.active && operation.waitingForResult) {
      addWebSocketLog(userId, `🔄 Reconexão adiada - aguardando resultado de aposta`, 'info');
      // Reagendar para daqui a 2 minutos
      setTimeout(() => startAutoReconnectionTimer(userId), 2 * 60 * 1000);
      return;
    }
    
    // Reconectar apenas se não estiver no meio de uma aposta
    if (operation && operation.active) {
      addWebSocketLog(userId, `🔄 Reconexão automática iniciada (10 minutos)`, 'info');
      await reconnectWithNewTokens(userId);
      
      // Reagendar próxima reconexão
      startAutoReconnectionTimer(userId);
    }
  }, 10 * 60 * 1000); // 10 minutos
  
  addWebSocketLog(userId, `⏰ Timer de reconexão automática iniciado (10 minutos)`, 'info');
}

// 🔄 NOVO: Função para parar timer de reconexão automática
function stopAutoReconnectionTimer(userId: string) {
  if (reconnectionTimers[userId]) {
    clearTimeout(reconnectionTimers[userId]);
    delete reconnectionTimers[userId];
    addWebSocketLog(userId, `⏰ Timer de reconexão automática parado`, 'info');
  }
}
