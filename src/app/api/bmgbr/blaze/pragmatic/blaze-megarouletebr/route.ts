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

interface MegaRouletteConfig {
  userId: string;
  action?: 'bet-connect' | 'start-operation' | 'stop-operation' | 'get-websocket-logs' | 'get-operation-report' | 'reset-operation-report' | 'get-connection-status' | 'server-diagnostic' | 'get-sessions-history' | 'blaze-proxy' | 'pragmatic-proxy' | 'debug-auth' | 'get-blaze-token' | 'frontend-auth' | 'generate-client-tokens' | 'update-strategy' | 'update-stake' | 'update-bet-type' | 'set-standby-mode' | 'force-check-api-results';
  forceClientSideAuth?: boolean;
  blazeToken?: string;
  selectedCurrencyType?: string;
  userAgent?: string;
  acceptLanguage?: string;
  realBrowserHeaders?: any;
  params?: string;
  userFingerprint?: any;
  testType?: string;
  // M4 Direto parâmetros
  m4DirectBetType?: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';
  // 🤖 NOVO: Campo para modo standby
  isStandbyMode?: boolean;
}

interface SimpleConfig {
  userId: string;
  action: string;
}

const websocketLogs: { [userId: string]: Array<{ timestamp: number; message: string; type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' }> } = {};
const connectionStatus: { [userId: string]: { connected: boolean; error?: string; lastUpdate: number } } = {};

const gameResults: { [userId: string]: Array<{ number: number; color: string; gameId: string; timestamp: number }> } = {};

// 🔥 SIMPLIFICADO: Estado da operação focado apenas no M4 Direto
const operationState: { [userId: string]: {
  active: boolean; 
  martingaleLevel: number;
  waitingForResult: boolean;
  lastGameId?: string;
  currentBetColor?: 'R' | 'B' | 'E' | 'O' | 'L' | 'H';
  
  strategy: {
    sequences: number[];
    maxMartingale: number;
  };
  stats: {
    totalBets: number;
    wins: number;
    losses: number;
    profit: number;
    startedAt: number;
  };
  // Tipo de aposta para modo M4 direto
  m4DirectBetType?: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';
  // 🎯 NOVO: Campos para Meta de Lucro
  stopGainPercentage: null;
  userBanca: null;
  // 🎯 NOVO: Campo para stake pendente
  pendingStake?: number | null;
  // 🤖 NOVO: Modo standby - conectado mas aguardando limiar
  isStandbyMode?: boolean;
  // 🔄 NOVO: Controle de polling da URL/API
  lastProcessedGameId?: string;
  apiPollingInterval?: NodeJS.Timeout;
  // 🎯 NOVO: Controle de missão cumprida
  missionCompleted?: boolean;
} } = {};

const activeWebSockets: { [userId: string]: {
  ws: any;
  sessionId: string;
  createdAt: number;
  lastActivity: number;
} } = {};

const sessionControl: { [userId: string]: {
  jsessionId: string;
  ppToken: string;
  pragmaticUserId: string;
  createdAt: number;
  lastRenewal: number;
  renewalAttempts: number;
  maxRenewalAttempts: number;
} } = {};

const autoRenewalIntervals: { [userId: string]: NodeJS.Timeout } = {};

const reconnectionControl: { [userId: string]: {
  attempts: number;
  lastAttempt: number;
  maxAttempts: number;
  backoffDelay: number;
} } = {};

const isFirstConnection: { [userId: string]: boolean } = {};

const bettingWindowState: { [userId: string]: {
  isOpen: boolean;
  currentGameId?: string;
  lastUpdate: number;
} } = {};

// ✅ NOVO: Tracking da primeira aposta realizada após conexão
const firstBetTimestamp: { [userId: string]: number | null } = {};

// 🔥 SIMPLIFICADO: Histórico detalhado apenas para modo real
const detailedHistory: { [userId: string]: Array<{
  id: string;
  timestamp: number;
  martingaleLevel: number;
  betColor: 'R' | 'B' | 'E' | 'O' | 'L' | 'H';
  resultColor: string;
  resultNumber: number;
  gameId: string;
  isWin: boolean;
  betAmount: number;
  profit: number;
  sequencePosition: string;
}> } = {};

const reconnectionTimers: { [userId: string]: NodeJS.Timeout } = {};

function addDetailedHistoryEntry(userId: string, entry: {
  martingaleLevel: number;
  betColor: 'R' | 'B' | 'E' | 'O' | 'L' | 'H';
  resultColor: string;
  resultNumber: number;
  gameId: string;
  isWin: boolean;
  betAmount: number;
}) {
  if (!detailedHistory[userId]) {
    detailedHistory[userId] = [];
  }
  
  const profit = entry.isWin ? entry.betAmount : -entry.betAmount;
  const sequencePosition = `M${entry.martingaleLevel + 1}`;
  
  const historyEntry = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
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
  
  if (detailedHistory[userId].length > 1000) {
    detailedHistory[userId] = detailedHistory[userId].slice(-1000);
  }
  
  // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `📋 Entrada adicionada ao histórico: ${sequencePosition} ${entry.isWin ? 'WIN' : 'LOSS'}`, 'info');
}

function resetDetailedHistory(userId: string) {
  detailedHistory[userId] = [];
  // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `📋 Histórico detalhado resetado`, 'info');
}

function getDetailedHistory(userId: string) {
  return detailedHistory[userId] || [];
}

function updateLastHistoryEntryNumber(userId: string, resultNumber: number, gameId: string) {
  if (!detailedHistory[userId] || detailedHistory[userId].length === 0) {
    return;
  }
  
  const lastEntry = detailedHistory[userId][detailedHistory[userId].length - 1];
  
  if (lastEntry.gameId === gameId && (lastEntry.resultColor === 'pending' || lastEntry.resultColor === 'sent')) {
    lastEntry.resultNumber = resultNumber;
    lastEntry.gameId = gameId;
    
    // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `📋 Número do resultado atualizado no histórico: ${resultNumber}`, 'info');
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
      breakEvenStrategy,
      // 🔥 NOVO: Campo para M4 Direto
      m4DirectBetType,
      // 🤖 NOVO: Campo para modo standby
      isStandbyMode
    } = requestBody;

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'userId é obrigatório'
      }, { status: 400 });
    }

    // Logs removidos: informações técnicas desnecessárias para o usuário
    // if (action === 'bet-connect') {
    //   addWebSocketLog(userId, `🔍 Dados reais capturados (primeira conexão):`, 'info');
    //   addWebSocketLog(userId, `📱 User-Agent: ${userFingerprint?.userAgent || clientUserAgent}`, 'info');
    //   addWebSocketLog(userId, `🌍 IP: ${clientIP}`, 'info');
    //   addWebSocketLog(userId, `🗣️ Idioma: ${userFingerprint?.language || clientLanguage}`, 'info');
    //   if (userFingerprint?.platform) addWebSocketLog(userId, `🖥️ Plataforma: ${userFingerprint.platform}`, 'info');
    //   if (userFingerprint?.screenResolution) addWebSocketLog(userId, `📺 Resolução: ${userFingerprint.screenResolution}`, 'info');
    //   if (userFingerprint?.timezone) addWebSocketLog(userId, `🕐 Timezone: ${userFingerprint.timezone}`, 'info');
    // }

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
        }, authTokens, forceClientSideAuth, customMartingaleSequence, stakeBased, m4DirectBetType, isStandbyMode);
      
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

          // 🔄 USAR SISTEMA DE RETRY para chamada da Blaze
          const blazeResponse = await retryBlazeRequest(async () => {
            return await fetch('https://blaze.bet.br/api/games/mega-roulette---brazilian/play', {
              method: 'POST',
              headers: blazeHeaders,
              body: JSON.stringify({
                selected_currency_type: selectedCurrencyType || 'BRL'
              })
            });
          }, 'ppToken');

          if (!blazeResponse.ok) {
            const errorText = await blazeResponse.text();
            console.error('❌ [PROXY] Erro na Blaze após tentativas:', blazeResponse.status, errorText);
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
        const { stopGainPercentage, allowedStatuses, userBanca } = requestBody;
        
        if (userId && operationState[userId]) {
          // Atualizar configurações existentes
          if (stopGainPercentage !== undefined) {
            // 🎯 NOVO: Armazenar meta de lucro no operationState
            // Se stopGainPercentage é null, manter o valor anterior se existir
            if (stopGainPercentage === null && operationState[userId].stopGainPercentage) {
              // Mantém o valor anterior se estava ativada
              addWebSocketLog(userId, `🎯 Meta de lucro mantida: ${operationState[userId].stopGainPercentage}%`, 'success');
            } else {
              operationState[userId].stopGainPercentage = stopGainPercentage;
              addWebSocketLog(userId, `🎯 Meta de lucro ${stopGainPercentage ? `ativada: ${stopGainPercentage}%` : 'desativada'}`, 'success');
            }
          }
          
                      // 🎯 NOVO: Armazenar banca do usuário para cálculo da Meta de Lucro
          if (userBanca !== undefined) {
            operationState[userId].userBanca = userBanca;
            addWebSocketLog(userId, `💰 Banca definida: R$ ${userBanca.toFixed(2)}`, 'success');
          }
          
          // 🛡️ NOVO: Salvar configurações de status permitidos
          if (allowedStatuses && Array.isArray(allowedStatuses)) {
            // Removido: safetyConfig não existe mais
            // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, `🛡️ Status permitidos ignorados (sistema simplificado)`, 'info');
          }
        }
        
        return NextResponse.json({ success: true });
      
      case 'set-pending-stake':
        const { newStake: pendingStake } = requestBody;
        
        if (userId && pendingStake && operationState[userId]) {
          // Definir stake pendente
          operationState[userId].pendingStake = pendingStake;
          
          addWebSocketLog(userId, `⏳ Stake pendente: R$ ${pendingStake.toFixed(2)} - Será aplicada após próxima derrota`, 'info');
        }
        return NextResponse.json({ success: true });
      
      case 'update-stake':
        const { newStake } = requestBody;
        
        if (userId && newStake && operationState[userId]) {
          // Atualizar stake na operação
          operationState[userId].strategy.sequences = requestBody.customMartingaleSequence || [newStake, newStake * 4, newStake * 10, newStake * 22];
          
          addWebSocketLog(userId, `💰 Stake atualizada: R$ ${newStake.toFixed(2)}`, 'success');
        }
        return NextResponse.json({ success: true });
      
      case 'activate-real-mode':
        // 🛡️ NOVO: Ativar modo real automaticamente quando status melhorar
        if (userId && operationState[userId]?.active) {
          addWebSocketLog(userId, `🛡️ Comando recebido: ativar modo real automaticamente`, 'success');
          
          // 🔥 NOVO: Verificar se é modo M4 direto
          if (requestBody.m4DirectBetType) {
            addWebSocketLog(userId, `🔥 MODO M4 DIRETO ATIVADO! Ignorando todos os limiares`, 'success');
            
            // Forçar saída do modo análise e ativar modo real imediatamente
            const operation = operationState[userId];
            operation.martingaleLevel = 0; // Reset para M1 no modo real
            
            // Marcar como modo M4 direto para parar quando acertar M4
            operation.m4DirectBetType = requestBody.m4DirectBetType || 'red'; // 🔥 NOVO: Armazenar tipo de aposta
            
            const betTypeLabel = 
              operation.m4DirectBetType === 'red' ? 'VERMELHO' :
              operation.m4DirectBetType === 'black' ? 'PRETO' :
              operation.m4DirectBetType === 'even' ? 'PAR' :
              operation.m4DirectBetType === 'odd' ? 'ÍMPAR' :
              operation.m4DirectBetType === 'low' ? 'BAIXAS (1-18)' :
              'ALTAS (19-36)';
            
            addWebSocketLog(userId, `🚀 MODO M4 DIRETO ATIVADO! Apostando em ${betTypeLabel} direto no M1 → Objetivo: acertar M4`, 'success');
          } else {
            // Lógica normal para status seguro
            const operation = operationState[userId];
            operation.martingaleLevel = 0; // Reset para M1 no modo real
            
            addWebSocketLog(userId, `🚀 MODO REAL ATIVADO! Status seguro detectado → Iniciando apostas reais no M1`, 'success');
          }
        }
        return NextResponse.json({ success: true });
      
      case 'update-bet-type':
        // 🤖 NOVO: Endpoint para atualizar tipo de aposta dinamicamente durante operação
        if (userId && operationState[userId]) {
          const newBetType = requestBody.m4DirectBetType;
          
          if (!newBetType) {
            return NextResponse.json({
              success: false,
              error: 'Tipo de aposta (m4DirectBetType) é obrigatório'
            }, { status: 400 });
          }
          
          const validBetTypes = ['red', 'black', 'even', 'odd', 'low', 'high'];
          if (!validBetTypes.includes(newBetType)) {
            return NextResponse.json({
              success: false,
              error: 'Tipo de aposta inválido'
            }, { status: 400 });
          }
          
          // Atualizar tipo de aposta no estado da operação
          operationState[userId].m4DirectBetType = newBetType;
          
          const betTypeNames = {
            'red': 'VERMELHO',
            'black': 'PRETO',
            'even': 'PAR',
            'odd': 'ÍMPAR',
            'low': 'BAIXAS (1-18)',
            'high': 'ALTAS (19-36)'
          };
          
          const typeName = betTypeNames[newBetType as keyof typeof betTypeNames];
          addWebSocketLog(userId, `🤖 Auto Bot: Tipo de aposta atualizado para ${typeName}`, 'success');
          
          return NextResponse.json({
            success: true,
            message: `Tipo de aposta atualizado para ${typeName}`,
            newBetType: newBetType
          });
        }
        
        return NextResponse.json({
          success: false,
          error: 'Operação não encontrada'
        }, { status: 404 });
      
      case 'set-standby-mode':
        // 🤖 NOVO: Ativar/desativar modo standby
        if (userId && operationState[userId]) {
          const standbyMode = requestBody.isStandbyMode;
          
          if (typeof standbyMode !== 'boolean') {
            return NextResponse.json({
              success: false,
              error: 'isStandbyMode deve ser um valor booleano'
            }, { status: 400 });
          }
          
          operationState[userId].isStandbyMode = standbyMode;
          
          const statusMessage = standbyMode ? 
            '🤖 Modo standby ativado - conectado mas aguardando limiar' : 
            '🎯 Modo standby desativado - operação normal';
          
          addWebSocketLog(userId, statusMessage, 'success');
          
          return NextResponse.json({
            success: true,
            message: statusMessage,
            isStandbyMode: standbyMode
          });
        }
        
        return NextResponse.json({
          success: false,
          error: 'Operação não encontrada'
        }, { status: 404 });
      
      // 🎯 SISTEMA AUTOMÁTICO: Debug manual removido - processamento automático via gameId
      
      // 🎯 SISTEMA AUTOMÁTICO: Debug manual removido - processamento automático via gameId
      
      case 'force-check-api-results':
        // 🔄 NOVO: Ação para forçar WebSocket verificar API de resultados
        try {
          const operation = operationState[userId];
          if (!operation) {
            return NextResponse.json({
              success: false,
              error: 'Operação não encontrada'
            });
          }
          
          const { gameId, expectedResult } = requestBody;
          
          addWebSocketLog(userId, `🔄 Debug: Forçando verificação da API de resultados para GameId: ${gameId}`, 'info');
          
          if (expectedResult) {
            addWebSocketLog(userId, `🎯 Resultado esperado: ${expectedResult.number} (${expectedResult.color})`, 'info');
          }
          
          // Forçar verificação da API
          await checkForNewResults(userId);
          
          // Aguardar um pouco para o processamento
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Verificar se resultado específico foi processado
          if (gameId && operation.lastProcessedGameId === gameId) {
            addWebSocketLog(userId, `✅ Resultado ${gameId} foi processado com sucesso pelo WebSocket`, 'success');
            
            return NextResponse.json({
              success: true,
              data: {
                message: 'Resultado processado com sucesso pelo WebSocket',
                gameId,
                processedGameId: operation.lastProcessedGameId,
                operationState: {
                  waitingForResult: operation.waitingForResult,
                  lastGameId: operation.lastGameId,
                  currentBetColor: operation.currentBetColor
                }
              }
            });
          } else {
            addWebSocketLog(userId, `⚠️ Resultado ${gameId} ainda não foi processado pelo WebSocket`, 'info');
            addWebSocketLog(userId, `🔍 Último processado: ${operation.lastProcessedGameId || 'nenhum'}`, 'info');
            
            return NextResponse.json({
              success: true,
              data: {
                message: 'Verificação executada - resultado ainda não processado pelo WebSocket',
                gameId,
                processedGameId: operation.lastProcessedGameId,
                operationState: {
                  waitingForResult: operation.waitingForResult,
                  lastGameId: operation.lastGameId,
                  currentBetColor: operation.currentBetColor
                }
              }
            });
          }
          
        } catch (error) {
          return NextResponse.json({
            success: false,
            error: 'Erro ao forçar verificação da API'
          });
        }
      
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



// 🎯 NOVO: Função para calcular target da Meta de Lucro
function calculateStopGainTarget(userBanca: number, percentage: number): number {
  return (userBanca * percentage) / 100;
}

// 🎯 NOVO: Função para verificar Meta de Lucro atingida
function checkStopGainReached(userId: string): boolean {
  const operation = operationState[userId];
  if (!operation || !operation.stopGainPercentage || !operation.userBanca) {
    return false;
  }
  
  const targetProfit = calculateStopGainTarget(operation.userBanca, operation.stopGainPercentage);
  const currentProfit = operation.stats.profit;
  
  return currentProfit >= targetProfit;
}

// Função para adicionar log
// 🔄 SISTEMA DE RETRY INTELIGENTE para erros 500 da Blaze
async function retryBlazeRequest(
  requestFunction: () => Promise<Response>, 
  operationType: string,
  maxRetries: number = 3,
  baseDelayMs: number = 2000
): Promise<Response> {
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [RETRY-${operationType.toUpperCase()}] Tentativa ${attempt}/${maxRetries}`);
      
      const response = await requestFunction();
      
      // Se resposta OK, retornar imediatamente
      if (response.ok) {
        if (attempt > 1) {
          console.log(`✅ [RETRY-${operationType.toUpperCase()}] Sucesso na tentativa ${attempt}!`);
        }
        return response;
      }
      
      // Se erro 500 (Internal Server Error) da Blaze, tentar novamente
      if (response.status === 500 && attempt < maxRetries) {
        const errorText = await response.text();
        
        // Verificar se é o erro específico código 1010
        const isCode1010 = errorText.includes('"code":1010') || errorText.includes('Code: 1010');
        
        if (isCode1010) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1); // Backoff exponencial
          console.log(`⚠️ [RETRY-${operationType.toUpperCase()}] Erro 500 (Code: 1010) da Blaze - tentando novamente em ${delayMs}ms...`);
          console.log(`🔍 [RETRY-${operationType.toUpperCase()}] Erro detectado: Internal server error temporário`);
          
          // Aguardar antes da próxima tentativa
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }
      
      // Se chegou aqui, erro não é 500 ou não é recuperável
      console.log(`❌ [RETRY-${operationType.toUpperCase()}] Erro ${response.status} não é recuperável`);
      return response;
      
    } catch (error) {
      console.log(`❌ [RETRY-${operationType.toUpperCase()}] Erro de rede na tentativa ${attempt}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      
      // Se não é a última tentativa, aguardar antes de tentar novamente
      if (attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`🔄 [RETRY-${operationType.toUpperCase()}] Tentando novamente em ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      // Se é a última tentativa, re-lançar o erro
      throw error;
    }
  }
  
  // Este ponto nunca deveria ser alcançado, mas por segurança:
  throw new Error(`Máximo de tentativas (${maxRetries}) esgotado para ${operationType}`);
}

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





// 🔄 FUNÇÃO: Polling da URL/API para detectar novos resultados
async function startApiPolling(userId: string): Promise<void> {
  const operation = operationState[userId];
  if (!operation) return;
  
  // Limpar polling anterior se existir
  if (operation.apiPollingInterval) {
    clearInterval(operation.apiPollingInterval);
  }
  
  // 🔇 LOG SILENCIOSO: Não logar o início do polling - apenas quando há apostas
  // addWebSocketLog(userId, `🔄 Iniciando polling da URL/API para detectar resultados`, 'info');
  
  // Polling a cada 2 segundos
  operation.apiPollingInterval = setInterval(async () => {
    try {
      await checkForNewResults(userId);
    } catch (error) {
      console.warn(`Erro no polling da URL/API para usuário ${userId}:`, error);
    }
  }, 2000);
}

// 🔍 FUNÇÃO: Verificar se há novos resultados na URL/API
async function checkForNewResults(userId: string): Promise<void> {
  const operation = operationState[userId];
  if (!operation) {
    return;
  }
  
  // 🎯 NOVA LÓGICA: Usar função centralizada para determinar se deve fazer polling
  if (!shouldPollForResults(userId)) {
    // 🔇 SILENCIOSO: Não fazer polling se não há necessidade
    return;
  }
  
  // 📊 LOG: Mostrar status da verificação apenas quando há apostas
  const hasActiveBets = operation.waitingForResult && !!operation.lastGameId;
  if (hasActiveBets) {
    addWebSocketLog(userId, `🔍 Verificando API - Aguardando resultado da aposta (Game: ${operation.lastGameId})`, 'info');
  }
  
  try {
    // 🎯 CONSULTAR: insights API local
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/bmgbr/blaze/pragmatic/blaze-megarouletebr/insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: `polling_${userId}`,
        action: 'get',
        limit: 3 // Buscar apenas os últimos 3 resultados
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      
      if (result.success && result.data && result.data.results && result.data.results.length > 0) {
        const latestResult = result.data.results[0]; // Resultado mais recente
        
        // 🔍 VERIFICAR: Se é um novo resultado que não foi processado
        if (latestResult.gameId !== operation.lastProcessedGameId) {
          // 🔍 LOG: Debug do estado atual da operação
          addWebSocketLog(userId, `🔍 Novo resultado detectado: ${latestResult.gameId} | Aguardando: ${operation.waitingForResult ? operation.lastGameId : 'Nenhum'}`, 'info');
          
          // 🎯 VERIFICAR: Se estamos aguardando resultado de uma aposta ESPECÍFICA
          if (operation.waitingForResult && operation.lastGameId) {
            // ✅ CORREÇÃO: Verificar se o resultado é para a aposta que está aguardando
            if (latestResult.gameId === operation.lastGameId) {
              addWebSocketLog(userId, `🎯 Resultado da aposta encontrado: Game ${latestResult.gameId}, Número ${latestResult.number}`, 'success');
              
              // Processar resultado da aposta específica
              const correctedColor = getColorFromNumber(latestResult.number);
              const colorCode = latestResult.number === 0 ? 'green' : (correctedColor === 'red' ? 'R' : 'B');
              
              await processGameResult(userId, latestResult.gameId, latestResult.number, correctedColor);
              
              addWebSocketLog(userId, `✅ Resultado processado - sistema deve continuar funcionando`, 'success');
            } else {
              // 🔍 DEBUG: Resultado não é para a aposta atual
              addWebSocketLog(userId, `🔍 Resultado não é da aposta atual: API=${latestResult.gameId}, Aguardando=${operation.lastGameId}`, 'info');
            }
                      } else if (operation.isStandbyMode === true) {
              // 🔍 Processar resultado apenas se modo standby ativo (para auto-bot)
              addWebSocketLog(userId, `🔄 Novo resultado detectado via URL/API: Game ${latestResult.gameId}, Número ${latestResult.number}`, 'info');
              
              // Processar resultado
              const correctedColor = getColorFromNumber(latestResult.number);
              const colorCode = latestResult.number === 0 ? 'green' : (correctedColor === 'red' ? 'R' : 'B');
              
              await processGameResult(userId, latestResult.gameId, latestResult.number, correctedColor);
            }
          
          // Atualizar último resultado processado
          operation.lastProcessedGameId = latestResult.gameId;
          
          // 🎯 NOVO: Atualizar histórico apenas quando há apostas pendentes ou modo standby
          const hasActiveBets = operation.waitingForResult && !!operation.lastGameId;
          const isStandbyMode = operation.isStandbyMode === true;
          
          if (hasActiveBets || isStandbyMode) {
            // Atualizar histórico de resultados para o frontend
            if (!gameResults[userId]) {
              gameResults[userId] = [];
            }
            
            gameResults[userId].unshift({
              number: latestResult.number,
              color: latestResult.number === 0 ? 'green' : (getColorFromNumber(latestResult.number) === 'red' ? 'R' : 'B'),
              gameId: latestResult.gameId,
              timestamp: new Date(latestResult.timestamp || latestResult.created_at).getTime()
            });
            
            // Manter apenas os últimos 50 resultados
            if (gameResults[userId].length > 50) {
              gameResults[userId] = gameResults[userId].slice(0, 50);
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Erro ao verificar novos resultados para usuário ${userId}:`, error);
  }
}

// 🔄 FUNÇÃO: Parar polling da URL/API
async function stopApiPolling(userId: string): Promise<void> {
  const operation = operationState[userId];
  if (!operation || !operation.apiPollingInterval) {
    return;
  }
  
  clearInterval(operation.apiPollingInterval);
  operation.apiPollingInterval = undefined;
  
  // 🔇 LOG SILENCIOSO: Não logar quando para o polling
  // addWebSocketLog(userId, `🔄 Polling da URL/API parado`, 'info');
}

// 🎯 FUNÇÃO: Determinar se deve fazer polling baseado no estado da operação
function shouldPollForResults(userId: string): boolean {
  const operation = operationState[userId];
  if (!operation) return false;
  
  // Condições ESPECÍFICAS para fazer polling:
  // 1. Há apostas pendentes aguardando resultado
  // 2. Modo standby ativo (para monitorar oportunidades do auto-bot)
  
  const hasActiveBets = operation.waitingForResult && !!operation.lastGameId;
  const isStandbyMode = operation.isStandbyMode === true;
  
  // 🎯 NOVO: Só fazer polling quando há apostas pendentes OU modo standby
  // Não fazer polling apenas por estar "operando" sem apostas
  return hasActiveBets || isStandbyMode;
}

// 🔍 FUNÇÃO: Processar resultado do jogo com dupla validação
async function processGameResult(userId: string, gameId: string, number: number, color: string) {
  // 🔍 DUPLA VALIDAÇÃO: Verificar e corrigir inconsistências
  const validation = validateAndCorrectColor(number, color);
  
  // 📋 LOG: Mostrar resultado da validação apenas se houver mensagem
  if (validation.logMessage) {
    addWebSocketLog(userId, validation.logMessage, validation.hasConflict ? 'error' : 'success');
  }
  
  // 🔧 USAR SEMPRE A COR CORRIGIDA
  const correctedColor = validation.correctedColor;
  const colorCode = number === 0 ? 'green' : (correctedColor === 'red' ? 'R' : 'B');
  
  // 🚫 REMOVIDO: Validação dupla via WebSocket
  // Agora os resultados são processados APENAS via URL/API polling
  
  // 💾 RECOVERY: Verificar se este resultado resolve uma aposta pendente
  const operation = operationState[userId];
  if (operation?.waitingForResult && operation.lastGameId === gameId) {
    addWebSocketLog(userId, `🔄 RECOVERY: Resultado encontrado para aposta pendente (Game: ${gameId})`, 'success');
    
    // 🎯 NOVO: Log detalhado da aposta vs resultado
    const betColorName = operation.currentBetColor === 'R' ? 'VERMELHO' : 
                         operation.currentBetColor === 'B' ? 'PRETO' : 
                         operation.currentBetColor === 'E' ? 'PAR' : 
                         operation.currentBetColor === 'O' ? 'ÍMPAR' : 
                         operation.currentBetColor === 'L' ? 'BAIXAS (1-18)' : 
                         operation.currentBetColor === 'H' ? 'ALTAS (19-36)' : 'DESCONHECIDO';
    
    addWebSocketLog(userId, `🎯 Aposta: ${betColorName} | Resultado: ${correctedColor.toUpperCase()} (${number})`, 'info');
    
    // 📋 VERIFICAR: Se há entrada pendente ou enviada no histórico para atualizar
    if (detailedHistory[userId]) {
      const pendingEntry = detailedHistory[userId].slice().reverse().find(entry => 
        entry.gameId === gameId && (entry.resultColor === 'pending' || entry.resultColor === 'sent')
      );
      
      if (pendingEntry) {
        const betColor = operation.currentBetColor;
        const isWin = (colorCode === betColor);
        
        // Removido: update pending bet simplificado
        
        addWebSocketLog(userId, `📋 Entrada pendente/enviada atualizada no histórico`, 'success');
      }
    }
    
    // 🔄 PROSSEGUIR: Processar o resultado da aposta
    addWebSocketLog(userId, `🔄 Processando resultado da aposta...`, 'info');
  } else {
    // 🔍 LOG: Informar que não há aposta aguardando para este resultado
    if (operation?.waitingForResult) {
      addWebSocketLog(userId, `🔍 Resultado não resolve aposta pendente (Game atual: ${gameId}, Aguardando: ${operation.lastGameId})`, 'info');
    } else {
      addWebSocketLog(userId, `🔍 Resultado processado para histórico (sem aposta pendente)`, 'info');
    }
  }
  
  // 📋 NOVO: Atualizar número do resultado no histórico detalhado
  updateLastHistoryEntryNumber(userId, number, gameId);
  
  // ✅ SEMPRE armazenar resultado ANTES de qualquer processamento (incluindo zeros)
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
  
  // Se for zero e há operação ativa, processa como derrota
  if (number === 0 && operationState[userId]?.active) {
    addWebSocketLog(userId, `🟢 Zero detectado: ${number} - processando como derrota`, 'game');
    await processOperationResult(userId, 'green', number);
    return;
  }
  
  // Se operação ativa, processa aposta
  if (operationState[userId]?.active) {
    await processOperationResult(userId, colorCode, number);
  }
}

// 🔍 FUNÇÃO: Verificar se aposta ganhou baseada no tipo de aposta
function checkBetWin(betColor: 'R' | 'B' | 'E' | 'O' | 'L' | 'H', resultColor: string, resultNumber: number): boolean {
  // Zero sempre perde (exceto se apostou diretamente no zero)
  if (resultNumber === 0) {
    return false;
  }
  
  switch (betColor) {
    case 'R': // Vermelho
      return resultColor === 'R';
    case 'B': // Preto
      return resultColor === 'B';
    case 'E': // Par
      return resultNumber % 2 === 0;
    case 'O': // Ímpar
      return resultNumber % 2 === 1;
    case 'L': // Baixas (1-18)
      return resultNumber >= 1 && resultNumber <= 18;
    case 'H': // Altas (19-36)
      return resultNumber >= 19 && resultNumber <= 36;
    default:
      return false;
  }
}

// NOVO: Função para processar resultado da operação (Nova Lógica de Aquecimento)
async function processOperationResult(userId: string, resultColor: string, resultNumber: number = 0) {
  const operation = operationState[userId];
  if (!operation || !operation.active || !operation.strategy?.sequences) {
    addWebSocketLog(userId, '❌ Estado da operação inválido para processar resultado', 'error');
    return;
  }

  // 🎲 CORREÇÃO: Usar cor da aposta armazenada
  const betColor = operation.currentBetColor;
  
  if (!betColor) {
    addWebSocketLog(userId, '❌ Cor da aposta não encontrada - não é possível processar resultado', 'error');
    return;
  }
  
  // 🔍 LOG: Informar que o resultado está sendo processado
  addWebSocketLog(userId, `🔍 Processando resultado: ${resultColor} (${resultNumber}) vs Aposta: ${betColor}`, 'info');
  
  // ✅ NOVA LÓGICA: Verificar vitória baseada no tipo de aposta
  const isWin = checkBetWin(betColor, resultColor, resultNumber);
  
  // ✅ CORREÇÃO: Determinar modo baseado nos contadores, não na propriedade mode
  const isRealMode = canExitAnalysisMode(userId);
  
  // ✅ CORREÇÃO: Só conta estatísticas no modo REAL, não na análise (simulação)
  if (isRealMode) {
    operation.stats.totalBets++;
  }
  
  // ✅ CRÍTICO: Liberar estado "aguardando resultado" IMEDIATAMENTE
  const wasWaitingForResult = operation.waitingForResult;
  operation.waitingForResult = false;
  
  // 🔄 NOVO: Parar polling quando resultado é processado (se não estiver em modo standby)
  if (wasWaitingForResult && operation.isStandbyMode !== true) {
    await stopApiPolling(userId);
  }
  
  // 🔍 LOG: Confirmar que o estado foi liberado
  if (wasWaitingForResult) {
    addWebSocketLog(userId, `✅ Estado "aguardando resultado" liberado para próxima aposta`, 'success');
  }
  
  const betAmount = operation.strategy?.sequences?.[operation.martingaleLevel];
  const betColorName = COLOR_NAMES[betColor] || betColor;
  const resultColorName = COLOR_NAMES[resultColor] || resultColor;
  
  // 🎯 NOVO: Log detalhado para apostas par/ímpar
  let betDescription = betColorName;
  if (betColor === 'E' || betColor === 'O') {
    betDescription += ` (${resultNumber})`;
  }
  
  // 📋 CORREÇÃO: Registrar no histórico detalhado baseado nos contadores
  addDetailedHistoryEntry(userId, {
    martingaleLevel: operation.martingaleLevel,
    betColor: betColor,
    resultColor: resultColor,
    resultNumber: resultNumber,
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
      
              // 🎯 NOVO: Verificar Meta de Lucro IMEDIATAMENTE após vitória
      if (checkStopGainReached(userId)) {
        const targetProfit = calculateStopGainTarget(operation.userBanca!, operation.stopGainPercentage!);
        const currentProfit = operation.stats.profit;
        
                  addWebSocketLog(userId, `🎯 META DE LUCRO ATINGIDA! Meta: R$ ${targetProfit.toFixed(2)}, Lucro: R$ ${currentProfit.toFixed(2)}`, 'success');
        addWebSocketLog(userId, `✅ Parando operação IMEDIATAMENTE após vitória!`, 'success');
        
        // Parar operação completamente
                  resetOperationSafely(userId, 'Meta de Lucro atingida', true);
        
        return; // Parar operação imediatamente
      }
    }
    
    const modeLabel = isRealMode ? '💰 REAL' : '🔍 ANÁLISE';
    // Lucro individual da aposta (sempre o valor da aposta)
    addWebSocketLog(userId, `✅ Vitória! Lucro de R$ ${betAmount.toFixed(2)}`, 'success');
    
    // 🔍 MODO ANÁLISE: NÃO marca vitórias aqui - só marca quando perde
    
    // 🎯 NOVA LÓGICA: Registra vitória IMEDIATAMENTE quando ganha (modo análise)
    const originalRealMode = isRealMode;
    if (!originalRealMode) {
      // Registra vitória do nível atual ANTES de avançar
      // Registrar vitória no martingale (simplificado)
      addWebSocketLog(userId, `📊 Vitória M${operation.martingaleLevel + 1} registrada`, 'success');
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
      // 🔥 NOVO: Verificar se está em modo M4 direto
      if (operation.m4DirectBetType) {
        // addWebSocketLog(userId, `🔥 MODO M4 DIRETO - OBJETIVO CONCLUÍDO! Acertou M4!`, 'success');
        addWebSocketLog(userId, `🎯 MISSÃO CUMPRIDA! Parando operação automaticamente.`, 'success');
        
        // 🎯 NOVO: Marcar missão como cumprida para impedir apostas futuras
        operation.missionCompleted = true;
        addWebSocketLog(userId, `🛡️ Proteção ativada: Sistema não apostará mais até reset manual`, 'info');
        
        // Parar operação completamente
        resetOperationSafely(userId, 'MODO M4 DIRETO - Objetivo concluído', true);
        
        // Mostrar mensagem de sucesso específica do modo M4 direto
        // addWebSocketLog(userId, `✅ 🔥 MODO M4 DIRETO CONCLUÍDO COM SUCESSO! 🔥`, 'success');
        
        return; // Parar operação
      }
      
      // 🔄 CORREÇÃO: Usar contadores para determinar comportamento
      const currentRealMode = canExitAnalysisMode(userId);
      
      if (!currentRealMode) {
        // 🔄 ANÁLISE: M4 atingido = ganhou no M4 → RESETAR ANÁLISE COMPLETA
        addWebSocketLog(userId, `✅ 🔍 ANÁLISE - M4 GANHO! Resetando análise completa`, 'success');
        addWebSocketLog(userId, `🎯 LÓGICA: M4 já saiu, chances menores de sair outro → Recomeçando análise`, 'info');
        
        // 🔄 RESET COMPLETO: Limpar todos os contadores
        resetAnalysisCounters(userId);
        // Removido: funções que não existem mais
        
        // Reset para início da sequência (volta para M1)
        operation.martingaleLevel = 0;
        operation.waitingForResult = false;
        operation.currentBetColor = undefined;
        
        // 🎯 NOVO: Verificar se está pronto para ativar modo real após reset para M1
        // Removido: smartActivation não existe mais
        
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
      // addWebSocketLog(userId, `🔄 ${modeLabel} - Próxima aposta: M${operation.martingaleLevel + 1}`, 'info');
      
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
    const defeatReason = isGreenDefeat ? '(ZERO)' : `(${resultNumber})`;
    
    const modeLabel = isRealMode ? '💰 REAL' : '🔍 ANÁLISE';
    const resultCharacteristics = getNumberCharacteristics(resultNumber);
    addWebSocketLog(userId, `❌ Derrota! Prejuízo de -R$ ${betAmount.toFixed(2)}`, 'error');
    addWebSocketLog(userId, `🎲 Resultado: ${resultCharacteristics}`, 'info');
    
    // 🔄 DERROTA NO MODO ANÁLISE: Verificar se foi derrota no M4
    if (!isRealMode) {
      // 🔄 NOVA LÓGICA: Se perdeu no M4, registrar derrota M4
      if (operation.martingaleLevel === 3) { // M4 é índice 3
        // Removido: recordM4Loss não existe mais
        addWebSocketLog(userId, `💥 Derrota M4 registrada`, 'error');
        
        // Verificar se atingiu o limiar de derrotas M4
        // Removido: checkReadyForRealMode não existe mais
      }
    }
      
    // ✅ NOVA LÓGICA: Qualquer derrota volta para M1
    // addWebSocketLog(userId, `🔄 DERROTA: Voltando para M1`, 'info');
    
    // Reset para início da sequência
    operation.martingaleLevel = 0;
    
    // 🎯 NOVO: Aplicar stake pendente após derrota
    if (operation.pendingStake && operation.pendingStake > 0) {
      const calculateSequence = (stake: number) => {
        return [
          stake * 1,   // M1 = 1x stake
          stake * 4,   // M2 = 4x stake
          stake * 10,  // M3 = 10x stake
          stake * 22   // M4 = 22x stake
        ];
      };
      
      const newSequence = calculateSequence(operation.pendingStake);
      operation.strategy.sequences = newSequence;
      
      addWebSocketLog(userId, `💰 Stake pendente aplicada após derrota: R$ ${operation.pendingStake.toFixed(2)}`, 'success');
      addWebSocketLog(userId, `📊 Nova sequência: [${newSequence.slice(0, 4).map(v => v.toFixed(2)).join(', ')}]`, 'info');
      
      // Limpar stake pendente
      operation.pendingStake = null;
    }
    
    // 🎯 NOVO: Verificar se está pronto para ativar modo real após reset para M1
    // Removido: smartActivation não existe mais
    
    // 💰 REAL: Derrota → CONTINUA no modo real (não volta para análise)
    if (isRealMode) {
      // addWebSocketLog(userId, `🔄 REAL - Derrota → Continuando no modo real (objetivo: M4)`, 'info');
      // NÃO muda para análise - continua no modo real até conseguir M4
    }
    
    // ⏰ Verificar renovação automática após derrota
    if (shouldRenewAutomatically(userId)) {
      addWebSocketLog(userId, '⏰ Iniciando renovação automática...', 'info');
      setTimeout(async () => {
        const renewed = await renewSession(userId);
        if (renewed) {
          addWebSocketLog(userId, '✅ Renovação automática concluída com sucesso', 'success');
        } else {
          addWebSocketLog(userId, '❌ Falha na renovação automática', 'error');
        }
      }, 1000);
    }
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
  
  // 🔥 NOVO: Sistema simplificado - sempre em modo real
  return true;
}

// 🎯 NOVA FUNÇÃO: Ativar modo real imediatamente quando limiar for atingido
async function checkReadyForRealMode(userId: string): Promise<void> {
  const operation = operationState[userId];
  
  if (!operation) {
    return;
  }
  
  // Sistema simplificado - sempre em modo real
  return;
}

// 🎯 NOVA FUNÇÃO: Ativar modo real imediatamente
function activateRealModeNow(userId: string): void {
  const operation = operationState[userId];
  
  if (!operation) {
    return;
  }
  
  addWebSocketLog(userId, `🚀 MODO REAL ATIVADO! Sistema simplificado sempre em modo real`, 'success');
  
  // Sistema simplificado - sempre em modo real
  // Removido: smartActivation não existe mais
  
  // 🎯 NOVO: Resetar para M1 quando ativado
  operation.martingaleLevel = 0;
  addWebSocketLog(userId, `🔄 Resetando para M1 no modo real`, 'info');
}

// 🔄 NOVA FUNÇÃO: Reset contadores de análise
function resetAnalysisCounters(userId: string): void {
  // Sistema simplificado - função vazia
  // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `🔄 Contadores resetados (sistema simplificado)`, 'info');
}

// 💾 FUNÇÃO: Renovar sessão automaticamente COM BACKUP DE ESTADO E CONTROLE DE RATE LIMITING
async function renewSession(userId: string): Promise<boolean> {
  try {
    const session = sessionControl[userId];
    if (!session) {
      addWebSocketLog(userId, '❌ Sessão não encontrada para renovação', 'error');
      return false;
    }

    if (session.renewalAttempts >= session.maxRenewalAttempts) {
      addWebSocketLog(userId, '❌ Máximo de tentativas de renovação atingido', 'error');
      // 🔧 NOVO: Forçar desconexão total quando atingir limite
      addWebSocketLog(userId, '🔄 Forçando desconexão total - requer reinício manual', 'error');
      stopAllConnections(userId, true, false);
      return false;
    }

    // 🔧 REMOVIDO: Verificação de rate limiting - agora usa sistema programado
    // if (!canAttemptRenewal(userId)) {
    //   addWebSocketLog(userId, '🚫 Renovação bloqueada pelo sistema de rate limiting', 'error');
    //   return false;
    // }

    // 💾 CRIAR BACKUP antes de renovar (se operação ativa)
    if (operationState[userId]?.active) {
      // Removido: backup simplificado
    }

    // 🔧 MODIFICADO: Log para sistema programado
    addWebSocketLog(userId, `🔄 Renovando sessão programada (tentativa ${session.renewalAttempts + 1}/${session.maxRenewalAttempts})`, 'info');
    addWebSocketLog(userId, `⏰ Última renovação: ${new Date(session.lastRenewal).toLocaleTimeString()}`, 'info');
    
    session.renewalAttempts++;

    // ✅ USAR EDGE FUNCTION: Renovar sessão usando Supabase Edge Function
    try {
      const tokenResult = await getUserBlazeToken(userId);
      
      if (!tokenResult.success || !tokenResult.token) {
        addWebSocketLog(userId, `❌ Token da Blaze não encontrado: ${tokenResult.error}`, 'error');
        return false;
      }

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

      addWebSocketLog(userId, '🚀 Chamando Edge Function para renovação programada...', 'info');
      
      // 🔄 USAR SISTEMA DE RETRY para Edge Function
      const authResponse = await retryBlazeRequest(async () => {
        return await fetch('https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth', {
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
      }, 'edge-function-renewal');

      // 🔧 NOVO: Log detalhado da resposta da Edge Function
      addWebSocketLog(userId, `📡 Edge Function respondeu com status: ${authResponse.status}`, 'info');

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        addWebSocketLog(userId, `❌ Edge Function falhou: ${authResponse.status} - ${errorText}`, 'error');
        
        // 🔧 NOVO: Verificar se é erro de bloqueio geográfico ou rate limit
        if (authResponse.status === 451) {
          addWebSocketLog(userId, '🌍 Erro 451: Bloqueio geográfico detectado', 'error');
        } else if (authResponse.status === 429) {
          addWebSocketLog(userId, '⏰ Erro 429: Rate limit - aguardando próxima janela de renovação', 'error');
        }
        
        return false;
      }

      const authResult = await authResponse.json();
      
      // 🔧 NOVO: Log detalhado da resposta
      addWebSocketLog(userId, `📋 Edge Function retornou: ${authResult.success ? 'SUCCESS' : 'FAILED'}`, 'info');
      
      if (!authResult.success || !authResult.data) {
        addWebSocketLog(userId, `❌ Edge Function falhou: ${authResult.error || 'Resposta inválida'}`, 'error');
        return false;
      }

      // 🔧 NOVO: Validar se os tokens são válidos
      if (!authResult.data.jsessionId || !authResult.data.ppToken) {
        addWebSocketLog(userId, '❌ Tokens inválidos recebidos da Edge Function', 'error');
        return false;
      }

      // Atualizar dados da sessão silenciosamente
      session.jsessionId = authResult.data.jsessionId;
      session.ppToken = authResult.data.ppToken;
      session.pragmaticUserId = authResult.data.pragmaticUserId;
      session.lastRenewal = Date.now();
      session.renewalAttempts = 0;
      
      addWebSocketLog(userId, '✅ Sessão renovada com sucesso - reconectando WebSocket', 'success');
      addWebSocketLog(userId, `🔗 jsessionId: ${authResult.data.jsessionId.substring(0, 10)}...`, 'info');
      
      // 🔄 CRÍTICO: Reconectar WebSocket com novo jsessionId
      if (activeWebSockets[userId]) {
        addWebSocketLog(userId, '🔄 Reconectando WebSocket com novo jsessionId...', 'info');
        
        // Fechar conexão atual
        const currentWs = activeWebSockets[userId];
        currentWs.ws.close();
        delete activeWebSockets[userId];
        
        // Conectar com novo jsessionId (preservando todos os dados)
        const newConfig = {
          jsessionId: authResult.data.jsessionId,
          pragmaticUserId: authResult.data.pragmaticUserId,
          tableId: 'mrbras531mrbr532'
        };
        
        // Pequeno delay para garantir fechamento limpo
        setTimeout(() => {
          startWebSocketConnection(userId, newConfig);
          addWebSocketLog(userId, '✅ WebSocket reconectado com sucesso', 'success');
        }, 1000);
      }
      
      // ⏰ Mostrar próximo horário de renovação automática
      const renewal = autoRenewal[userId];
      if (renewal) {
        const nextRenewal = new Date(renewal.nextRenewalTime).toLocaleTimeString();
        addWebSocketLog(userId, `⏰ Próxima renovação automática: ${nextRenewal}`, 'info');
      }
      
      return true;

    } catch (edgeFunctionError) {
      const errorMessage = edgeFunctionError instanceof Error ? edgeFunctionError.message : 'Erro desconhecido';
      addWebSocketLog(userId, `❌ Erro na Edge Function: ${errorMessage}`, 'error');
      return false;
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    addWebSocketLog(userId, `❌ Erro geral na renovação: ${errorMessage}`, 'error');
    return false;
  }
}

// 🆕 FUNÇÃO REMOVIDA: verifyTokenAfterDefeat - substituída por sistema automático
// A renovação agora é feita automaticamente a cada 10 minutos
// async function verifyTokenAfterDefeat(userId: string): Promise<boolean> {
//   return true; // Não verifica mais - usa sistema automático
// }

// NOVO: Conectar ao WebSocket
async function connectToBettingGame(userId: string, tipValue?: number, clientIP?: string, userFingerprint?: any, clientHeaders?: any, authTokens?: { ppToken: string; jsessionId: string; pragmaticUserId: string }, forceClientSideAuth?: boolean, customMartingaleSequence?: number[], stakeBased?: boolean, m4DirectBetType?: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high', isStandbyMode?: boolean) {
  try {
    // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, '🔗 Iniciando conexão...', 'info');
    
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

    // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, '🔐 Usando APENAS tokens do client-side (IP real do usuário)...', 'info');
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

    // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, 'Autenticação realizada com sucesso', 'success');

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

    // ⏰ Inicializar sistema de renovação automática
    initializeAutoRenewal(userId);

    // ✅ NOVA LÓGICA: Usar sequência personalizada se fornecida, senão calcular baseada no tipValue
    let calculatedSequence: number[];
    let strategyLabel: string;
    
    if (customMartingaleSequence && stakeBased) {
      // 💰 Usar sequência personalizada baseada em stake
      calculatedSequence = customMartingaleSequence;
      const stake = customMartingaleSequence[0];
      strategyLabel = `Stake R$ ${stake.toFixed(2)}`;
      // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, `💰 Sequência Personalizada (Stake R$ ${stake.toFixed(2)}) - M1-M4: [${calculatedSequence.map((v: number) => v.toFixed(2)).join(', ')}]`, 'info');
    } else {
      // ✅ Calcular sequência baseada no tipValue (modo tradicional)
    const calculateSequence = (stake: number) => {
      return [
        stake * 1,   // M1 = 1x stake
        stake * 4,   // M2 = 4x stake
        stake * 10,  // M3 = 10x stake
        stake * 22   // M4 = 22x stake
      ];
    };

      calculatedSequence = calculateSequence(tipValue || 0.50);
      const stake = tipValue || 0.50;
      strategyLabel = `Stake R$ ${stake.toFixed(2)}`;
      // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, `🎯 Estratégia ${strategyLabel} - Sequência: [${calculatedSequence.slice(0, 3).map((v: number) => v.toFixed(2)).join(', ')}...]`, 'info');
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
      // 🔍 SISTEMA SIMPLIFICADO: Removido analysisCounters
      stats: {
        totalBets: 0,
        wins: 0,
        losses: 0,
        profit: 0,
        startedAt: Date.now()
      },
      // 🎯 NOVO: Campos para Meta de Lucro
      stopGainPercentage: null,
      userBanca: null,
      // 🔥 NOVO: Campo para M4 Direto
      m4DirectBetType: m4DirectBetType || undefined,
      // 🤖 NOVO: Campo para modo standby
      isStandbyMode: isStandbyMode || false
    };
    
    // Iniciar conexão WebSocket
    const config = {
      jsessionId: authResult.data!.jsessionId,
      pragmaticUserId: authResult.data!.userId,
      tableId: 'mrbras531mrbr532'
    };

    startWebSocketConnection(userId, config, undefined, clientIP, userFingerprint);

    // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, 'WebSocket iniciado para coleta de dados', 'success');
      
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
    
    // ✅ NOVO: Limpar logs antigos para evitar confusão
    websocketLogs[userId] = [];
    
    // 🚀 PRIMEIRO LOG: Iniciando operações
    addWebSocketLog(userId, '🚀 Iniciando operações...', 'success');
    
    // 🎯 NOVO: Informar sobre proteção contra missão cumprida
    addWebSocketLog(userId, '🛡️ Proteção ativa: Sistema para automaticamente após missão cumprida', 'info');
    
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
      missionCompleted: false, // 🎯 NOVO: Resetar flag de missão cumprida
      
    };
    
    // 🔄 INICIAR: Polling da URL/API apenas se modo standby ativo
    if (operationState[userId]?.isStandbyMode === true) {
      await startApiPolling(userId);
      addWebSocketLog(userId, `🔄 Iniciando polling da URL/API para detectar resultados (modo standby)`, 'info');
    }
    // 📊 NOVO: Polling será iniciado automaticamente quando houver apostas pendentes
    
    // Logs de modo análise removidos - sistema simplificado
    // addWebSocketLog(userId, `🔍 ANÁLISE - Operação iniciada em modo aquecimento!`, 'success');
    // addWebSocketLog(userId, `🎯 NOVA REGRA: Qualquer nível que atingir o mínimo ativa o modo real IMEDIATAMENTE!`, 'info');
    // addWebSocketLog(userId, `📊 Limiares: M1≥8 vitórias, M2≥4 vitórias, M3≥2 vitórias, M4≥1 DERROTA`, 'info');
    
    // Mostrar tipo de aposta selecionado ao invés de fixo
    const betTypeNames = {
      'red': 'VERMELHO',
      'black': 'PRETO', 
      'even': 'PAR',
      'odd': 'ÍMPAR',
      'low': 'BAIXAS (1-18)',
      'high': 'ALTAS (19-36)'
    };
    const selectedBetType = operationState[userId]?.m4DirectBetType || 'red';
    // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, `🎯 Tipo de aposta selecionado: ${betTypeNames[selectedBetType as keyof typeof betTypeNames]}`, 'info');
    
    // ✅ Tentar apostar imediatamente se as apostas estão abertas
    const bettingWindow = bettingWindowState[userId];
    if (bettingWindow?.isOpen && bettingWindow.currentGameId) {
      // 🎯 VERIFICAÇÃO: Não apostar se missão já foi cumprida
      if (operationState[userId]?.missionCompleted) {
        addWebSocketLog(userId, `🛡️ Missão cumprida - não executando apostas automáticas`, 'info');
        return NextResponse.json({
          success: true,
          data: {
            operationActive: false,
            missionCompleted: true,
            message: 'Missão cumprida - sistema protegido'
          }
        });
      }
      
      addWebSocketLog(userId, `🎯 Apostas abertas detectadas - tentando apostar imediatamente`, 'success');
      
      // Buscar WebSocket ativo para executar aposta
      const activeWS = activeWebSockets[userId];
      if (activeWS?.ws && activeWS.ws.readyState === 1) { // 1 = OPEN
        executeSimpleBet(userId, bettingWindow.currentGameId, activeWS.ws);
      } else {
        addWebSocketLog(userId, `⚠️ WebSocket não disponível para aposta imediata`, 'error');
      }
    } else {
      // Log removido: muito verboso, usuário já sabe que está aguardando
      // addWebSocketLog(userId, `⏳ Aguardando próxima rodada para apostar`, 'info');
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
      // 🎯 NOVO: Resetar flag de missão cumprida quando usuário para manualmente
      operationState[userId].missionCompleted = false;
    }
    
    // 🔄 PARAR: Polling da URL/API
    stopApiPolling(userId);
    
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

    // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, `🔑 Gerando novos tokens para reconexão...`, 'info');
    
    // ✅ USAR FUNÇÃO EXISTENTE: getUserBlazeToken do auth.ts
    const tokenResult = await getUserBlazeToken(userId);
    
    if (!tokenResult.success || !tokenResult.token) {
      addWebSocketLog(userId, `❌ Token da Blaze não encontrado: ${tokenResult.error}`, 'error');
      addWebSocketLog(userId, `💡 Configure seu token da Blaze na página de configurações`, 'info');
      updateConnectionStatus(userId, false, 'Token da Blaze não encontrado');
      return;
    }

    // Logs removidos: informações técnicas desnecessárias
    // addWebSocketLog(userId, `🚀 Gerando novos tokens via Supabase Edge Function...`, 'info');
    // addWebSocketLog(userId, `🌍 Edge Function resolve bloqueio geográfico`, 'info');

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

    // ✅ USAR EDGE FUNCTION COM RETRY: Chamar diretamente a Supabase Edge Function
    const authResponse = await retryBlazeRequest(async () => {
      return await fetch('https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth', {
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
    }, 'edge-function-reconnect');

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
    
    // Logs removidos: informações técnicas desnecessárias
    // addWebSocketLog(userId, `🔗 Conectando ao WebSocket (tentativa ${control.attempts}/${control.maxAttempts}): ${wsUrl}`, 'info');
    // if (userIP) {
    //   addWebSocketLog(userId, `🌐 IP do usuário detectado: ${userIP}`, 'info');
    // }
    
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
    
    // Logs removidos: informações técnicas desnecessárias sobre headers
    // if (!activeWebSockets[userId]) {
    //   addWebSocketLog(userId, `🌐 Headers enviados para Pragmatic (primeira conexão):`, 'info');
    //   addWebSocketLog(userId, `📱 User-Agent: ${realHeaders['User-Agent']}`, 'info');
    //   addWebSocketLog(userId, `🌍 IP Headers: ${userIP ? 'Enviado' : 'Indisponível'}`, 'info');
    //   addWebSocketLog(userId, `🗣️ Idioma: ${realHeaders['Accept-Language']}`, 'info');
    //   if (userFingerprint?.timezone) addWebSocketLog(userId, `🕐 Timezone: ${userFingerprint.timezone}`, 'info');
    //   if (userFingerprint?.platform) addWebSocketLog(userId, `🖥️ Plataforma: ${userFingerprint.platform}`, 'info');
    // }

    const ws = new WebSocket(wsUrl, {
      headers: realHeaders
    });

    let connectionHealthy = true;
    let lastPong = Date.now();
    let pingInterval: NodeJS.Timeout | null = null;
    
    ws.on('open', () => {
      // Log removido: informação técnica desnecessária
      // addWebSocketLog(userId, '🔗 WebSocket conectado com sucesso', 'success');
      updateConnectionStatus(userId, true);
      
      // Removido: restore simplificado
      
      // Resetar contador de tentativas após conexão bem-sucedida
      if (reconnectionControl[userId]) {
        reconnectionControl[userId].attempts = 0;
      }
      
      // Não é necessário enviar login neste servidor
      // Log removido: informação técnica desnecessária
      // addWebSocketLog(userId, 'Conexão estabelecida - aguardando mensagens...', 'info');
      
      // Enviar primeiro ping imediatamente após conexão
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const timestamp = Date.now();
          const pingMessage = `<ping time='${timestamp}'></ping>`;
          ws.send(pingMessage);
          
          // Log removido: informação técnica desnecessária
          // addWebSocketLog(userId, `🏓 Ping inicial enviado: ${timestamp}`, 'info');
        }
      }, 1000); // Aguardar 1 segundo após conexão
      
      // Iniciar sistema de ping/pong
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const timestamp = Date.now();
          const pingMessage = `<ping time='${timestamp}'></ping>`;
          ws.send(pingMessage);
          
          // Log removido: informação técnica desnecessária
          // addWebSocketLog(userId, `🏓 Ping enviado: ${timestamp}`, 'info');
          
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
          // Log removido: informação técnica desnecessária
        }
      }, 30000); // Ping a cada 30 segundos
    });

    ws.on('message', async (data: any) => {
      try {
        const message = data.toString().trim();
        
        // Logs removidos: mensagens técnicas desnecessárias
        // if (message.length < 200) {
        //   addWebSocketLog(userId, `📨 Mensagem recebida: ${message}`, 'info');
        // } else {
        //   addWebSocketLog(userId, `📨 Mensagem recebida: ${message.substring(0, 100)}...`, 'info');
        // }

        // 💾 DETECÇÃO: Sessão offline = tokens expirados COM BACKUP
        if (message.includes('<session>offline</session>')) {
          addWebSocketLog(userId, `🔑 Sessão offline detectada - tokens expiraram`, 'error');
          
          // Removido: backup simplificado
          
          // Log removido: informação técnica desnecessária
          // addWebSocketLog(userId, `🔄 Gerando novos tokens automaticamente...`, 'info');
          
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
          // Log removido: informação técnica desnecessária
          // addWebSocketLog(userId, `💓 Pong recebido (time: ${timeMatch?.[1]}, seq: ${seqMatch?.[1]})`, 'success');
          return;
      }

        // Detectar switch de servidor - CRÍTICO para manter conexão
        if (message.includes('<switch') && message.includes('gameServer=')) {
          const gameServerMatch = message.match(/gameServer="([^"]*)"/);
          const wsAddressMatch = message.match(/wsAddress="([^"]*)"/);
          
          if (gameServerMatch && wsAddressMatch) {
            const newServer = gameServerMatch[1];
            const newWsAddress = wsAddressMatch[1];
            
            // Log removido: informação técnica desnecessária
          // addWebSocketLog(userId, `🔄 Switch de servidor detectado: ${newServer} (${newWsAddress})`, 'info');
            
            // Limpar ping interval
            if (pingInterval) {
              clearInterval(pingInterval);
              pingInterval = null;
            }
            
            // Fechar conexão atual
            ws.close();
            
            // ✅ CORREÇÃO: Switch de servidor usando nova arquitetura de proxy
            setTimeout(async () => {
              // Log removido: informação técnica desnecessária
          // addWebSocketLog(userId, `🔑 Gerando novos tokens para switch de servidor...`, 'info');
              
              try {
                // ✅ USAR EDGE FUNCTION: Gerar novos tokens via Supabase Edge Function
                const tokenResult = await getUserBlazeToken(userId);
                
                if (!tokenResult.success || !tokenResult.token) {
                  addWebSocketLog(userId, `❌ Token da Blaze não encontrado: ${tokenResult.error}`, 'error');
                  updateConnectionStatus(userId, false, 'Token da Blaze não encontrado');
                  return;
                }

                // Logs removidos: informações técnicas desnecessárias
                // addWebSocketLog(userId, `🚀 Gerando novos tokens via Supabase Edge Function...`, 'info');
                // addWebSocketLog(userId, `🌍 Edge Function resolve bloqueio geográfico`, 'info');

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

                // ✅ Chamar diretamente a Supabase Edge Function COM RETRY
                const authResponse = await retryBlazeRequest(async () => {
                  return await fetch('https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth', {
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
                }, 'edge-function-switch-server');

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

                // Log removido: informação técnica desnecessária
                // addWebSocketLog(userId, `✅ Novos tokens gerados via Edge Function com sucesso`, 'success');
                
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

                // Log removido: informação técnica desnecessária
                // addWebSocketLog(userId, `🔄 Reconectando ao novo servidor: ${newWsAddress}`, 'info');
                
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
              // 🎯 VERIFICAÇÃO: Não apostar se missão foi cumprida
              if (operationState[userId]?.missionCompleted) {
                addWebSocketLog(userId, `🛡️ Missão cumprida - não executando apostas automáticas via WebSocket`, 'info');
                return; // Não apostar se missão cumprida
              }
              
              // 🤖 NOVO: Verificar se está em modo standby antes de apostar
              if (operationState[userId]?.isStandbyMode) {
                addWebSocketLog(userId, `🤖 Modo standby ativo - aguardando limiar ser atingido`, 'info');
                return; // Não apostar ainda
              }
              
              const isRealMode = canExitAnalysisMode(userId);
              const currentMode = isRealMode ? 'real' : 'analysis';
              // Log removido: informação técnica desnecessária
      // addWebSocketLog(userId, `🎯 Operação ativa detectada - executando aposta automaticamente (modo: ${currentMode})`, 'success');
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
              addWebSocketLog(userId, `📨 Aposta aceita pelo servidor`, 'info');
              addWebSocketLog(userId, `⏳ Aguardando resultado...`, 'info');
            } else if (status === 'error' || status === 'fail' || status === 'denied' || status === 'refused' || status === 'rejected') {
              addWebSocketLog(userId, `❌ Aposta REJEITADA pelo servidor (${status})`, 'error');
              // ✅ SIMPLIFICADO: Sem renovação automática - deixar timer de 18min cuidar disso
            }
          }
        }

        // 💾 CORREÇÃO: Detectar betValidationError com códigos de sessão/autenticação - SISTEMA PROGRAMADO
        if (message.includes('<betValidationError')) {
          // Códigos relacionados a sessão/autenticação que exigem renovação
          const sessionErrorCodes = ['1039', '1040', '1001', '1002', '1003'];
          const hasSessionError = sessionErrorCodes.some(code => message.includes(`code="${code}"`));
          
          if (hasSessionError) {
            const codeMatch = message.match(/code="([^"]*)"/);
            const errorCode = codeMatch?.[1] || 'unknown';
            
            addWebSocketLog(userId, `🔑 Erro de sessão detectado (code ${errorCode}) - usando sistema automático`, 'error');
            addWebSocketLog(userId, `📋 Renovação automática a cada 10 minutos`, 'info');
            
            // Pausar operação e aguardar renovação automática
            if (operationState[userId]) {
              operationState[userId].active = false;
              operationState[userId].waitingForResult = false;
              addWebSocketLog(userId, `⏸️ Operação pausada devido a erro de sessão - aguardando renovação automática`, 'info');
            }
            
            return; // Não processar mais esta mensagem
          } else {
            // Outros erros de validação de aposta (não relacionados à sessão)
            const codeMatch = message.match(/code="([^"]*)"/);
            const errorCode = codeMatch?.[1] || 'unknown';
            addWebSocketLog(userId, `⚠️ Erro de validação de aposta (code ${errorCode}): ${message}`, 'error');
          }
        }
        
        // 💾 Detectar outros erros de sessão - SISTEMA PROGRAMADO
        if (message.includes('invalid session') || message.includes('session expired') || 
            message.includes('session timeout') || message.includes('unauthorized access') ||
            message.includes('authentication failed') || message.includes('token expired')) {
          addWebSocketLog(userId, `🔑 Erro de sessão detectado - usando sistema automático`, 'error');
          addWebSocketLog(userId, `📋 Renovação automática a cada 10 minutos`, 'info');
          
          // Pausar operação e aguardar renovação automática
          if (operationState[userId]) {
            operationState[userId].active = false;
            operationState[userId].waitingForResult = false;
            addWebSocketLog(userId, `⏸️ Operação pausada devido a erro de sessão - aguardando renovação automática`, 'info');
          }
          
          return;
        }

        // ⏰ Verificação de renovação automática a cada mensagem
        if (shouldRenewAutomatically(userId)) {
          addWebSocketLog(userId, '⏰ Iniciando renovação automática...', 'info');
          setTimeout(async () => {
            const renewed = await renewSession(userId);
            if (renewed) {
              addWebSocketLog(userId, '✅ Renovação automática concluída com sucesso', 'success');
              // Reativar operação se estava pausada
              if (operationState[userId] && !operationState[userId].active) {
                operationState[userId].active = true;
                addWebSocketLog(userId, '▶️ Operação reativada após renovação automática', 'success');
              }
            } else {
              addWebSocketLog(userId, '❌ Falha na renovação automática', 'error');
            }
          }, 1000);
        }

        // 🚫 REMOVIDO: Processamento de resultados via WebSocket
        // WebSocket agora é EXCLUSIVO para apostas (apostas abertas/fechadas)
        // Resultados são processados via URL/API polling
        
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
      // Log removido: informação técnica desnecessária
      // addWebSocketLog(userId, `🔌 WebSocket desconectado (código: ${code}, razão: ${reason})`, 'error');
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

// 🔥 NOVO: Mapeamento completo de tipos de aposta para códigos (CORRIGIDO)
const BET_TYPE_TO_CODE: { [key: string]: string } = {
  'red': '48',    // vermelho
  'black': '49',  // preto
  'odd': '50',    // ímpar
  'even': '47',   // par
  'low': '46',    // baixas
  'high': '51',   // altas
};

// 🔥 NOVO: Mapeamento de tipos de aposta para nomes em português
const BET_TYPE_NAMES: { [key: string]: string } = {
  'red': 'VERMELHO',
  'black': 'PRETO',
  'even': 'PAR',
  'odd': 'ÍMPAR',
  'low': 'BAIXAS (1-18)',
  'high': 'ALTAS (19-36)',
};

// 🔥 NOVO: Mapeamento de tipos de aposta para códigos de cores (para retrocompatibilidade)
const BET_TYPE_TO_COLOR: { [key: string]: string } = {
  'red': 'R',
  'black': 'B',
  'even': 'E',
  'odd': 'O',
  'low': 'L',
  'high': 'H',
};

// Mapeamento de cores para códigos de aposta (conforme API de referência) - CORRIGIDO
const COLOR_TO_BET_CODE: { [key: string]: string } = {
  'R': '48', // Vermelho (Red)
  'B': '49', // Preto (Black)
  'E': '47', // Par (Even)
  'O': '50', // Ímpar (Odd)
  'L': '46', // Baixas (Low)
  'H': '51', // Altas (High)
};

// Mapeamento de cores para nomes em português - EXPANDIDO
const COLOR_NAMES: { [key: string]: string } = {
  'R': 'VERMELHO',
  'B': 'PRETO',
  'E': 'PAR',
  'O': 'ÍMPAR',
  'L': 'BAIXAS (1-18)',
  'H': 'ALTAS (19-36)',
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
      
      // Método 2: Tentar com Buffer (para compatibilidade com diferentes implementações)
      try {
        const buffer = Buffer.from(message, 'utf8');
        ws.send(buffer);
        return { success: true };
      } catch (bufferError: any) {
        
        // Método 3: Tentar forçar como string
        try {
          const stringMessage = String(message);
          ws.send(stringMessage, { binary: false });
          return { success: true };
        } catch (stringError: any) {
          
          // Método 4: Tentar usando _socket diretamente (último recurso)
          try {
            if (ws._socket && ws._socket.write) {
              const frame = createWebSocketFrame(message);
              ws._socket.write(frame);
              return { success: true };
            } else {
              throw new Error('_socket.write não disponível');
            }
          } catch (socketError: any) {
            addWebSocketLog(userId, `❌ Erro crítico no WebSocket: ${socketError.message}`, 'error');
            
            return {
              success: false,
              error: `Erro ao enviar mensagem WebSocket: ${socketError.message}`
            };
          }
        }
      }
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
  
  // 🎯 VERIFICAÇÃO CRÍTICA: Não apostar se missão foi cumprida
  if (operation.missionCompleted) {
    addWebSocketLog(userId, '🛡️ Missão já cumprida - sistema protegido contra apostas automáticas', 'info');
    addWebSocketLog(userId, '💡 Use "Parar Operação" e "Iniciar Operação" para resetar se necessário', 'info');
    return;
  }
  
  // 🤖 VERIFICAÇÃO CRÍTICA: Não apostar em modo standby
  if (operation.isStandbyMode) {
    addWebSocketLog(userId, '🤖 Modo standby ativo - não apostando', 'info');
    return;
  }
  
  // 🎲 CORREÇÃO: Sempre aposta no vermelho (igual ao @/bots)
  const redBet = generateRedBet();
  
  // 🎲 NOVO: Usar função atualizada que suporta modo M4 direto
  const betColor = generateBet(userId);
  
  // 🔥 NOVO: Log para debug do modo M4 direto
  if (operation.m4DirectBetType) {
    // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `🔥 MODO M4 DIRETO ATIVO - Apostando em ${COLOR_NAMES[betColor]}`, 'info');
  }
  
  // ✅ CORREÇÃO: Armazenar cor da aposta atual no estado da operação
  operation.currentBetColor = betColor;
  
  // ✅ Usar valor do martingale atual (M1, M2, M3, M4)
  const betAmount = operation.strategy?.sequences?.[operation.martingaleLevel];
  const betCode = COLOR_TO_BET_CODE[betColor];
  const colorName = COLOR_NAMES[betColor];
  
  if (!betCode || !colorName) {
    addWebSocketLog(userId, `❌ Cor inválida para aposta: ${betColor}`, 'error');
    return;
  }

  try {
    // 📊 Registrar rodada analisada no nível atual
    // Removido: recordAnalysisRound não existe mais no sistema simplificado
    
    // 🎯 NOVO: Manter dados de análise para interface
    const analysisData = {
      // Removido: martingaleUsageStats não existe mais
      m1: 0,
      m2: 0,
      m3: 0,
      m4: 0,
      // Removido: m4LossesCounter não existe mais
      m4Losses: 0,
      // Removido: thresholds não existe mais
      m1Required: 8,
      m2Required: 4,
      m3Required: 2,
      m4Required: 1,
      // Removido: smartActivation não existe mais
      smartActivation: {
        enabled: false,
        readyToActivate: false,
        waitingForSequenceEnd: false
      }
    };
    
    // 💰 REAL: Envia aposta verdadeira (limiares atingidos)
    const timestamp = Date.now().toString();
    
    // ✅ CORREÇÃO: Usar pragmaticUserId da sessão renovada, não gerar novo
    const session = sessionControl[userId];
    const pragmaticUserId = session?.pragmaticUserId || `ppc${timestamp}`;
    
    if (session?.pragmaticUserId) {
      // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `🔑 Usando tokens da sessão renovada (${session.pragmaticUserId.substring(0, 8)}...)`, 'info');
    } else {
      addWebSocketLog(userId, `⚠️ Gerando novo pragmaticUserId (sessão não encontrada)`, 'error');
    }
    
    // 🔍 NOVA VERIFICAÇÃO: Estado detalhado do WebSocket
    const wsState = ws.readyState;
    const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `🔌 WebSocket State: ${wsState} (${stateNames[wsState] || 'UNKNOWN'})`, 'info');
    
    // 🚨 VERIFICAÇÃO CRÍTICA: WebSocket deve estar OPEN para enviar apostas
    if (wsState !== 1) { // 1 = OPEN
      addWebSocketLog(userId, `❌ WebSocket não está OPEN! Estado: ${stateNames[wsState] || 'UNKNOWN'}`, 'error');
      return;
    }
    
    const betXml = `<command channel="table-mrbras531mrbr532">
  <lpbet gm="roulette_desktop" gId="${gameId}" uId="${pragmaticUserId}" ck="${timestamp}">
    <bet amt="${betAmount}" bc="${betCode}" ck="${timestamp}" />
  </lpbet>
</command>`;

    // Log da mensagem XML que será enviada
    // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `📤 Enviando XML: ${betXml.replace(/\n/g, ' ').replace(/\s+/g, ' ')}`, 'info');
          
    // 📤 Enviar aposta com sistema de fallback robusto
    const sendResult = await sendWebSocketMessage(ws, betXml, userId);
    if (!sendResult.success) {
      addWebSocketLog(userId, `❌ Falha ao enviar aposta: ${sendResult.error}`, 'error');
      return;
    }
    
    // ✅ SUCESSO: Aposta enviada com sucesso
    operation.waitingForResult = true;
    operation.lastGameId = gameId;
    
    // 🔄 NOVO: Iniciar polling quando aposta é feita
    await startApiPolling(userId);
    
    // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, `✅ Aposta enviada com sucesso via WebSocket!`, 'success');
    const modeLabel = '💰 REAL';
    addWebSocketLog(userId, `🎯 Aposta realizada: R$ ${betAmount.toFixed(2)} no ${colorName}`, 'game');
    
    // ✅ NOVO: Marcar timestamp da primeira aposta após conexão
    if (!firstBetTimestamp[userId]) {
      firstBetTimestamp[userId] = Date.now();
    }
    
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
    // Log removido: informação técnica desnecessária
    logMessage = ''; // String vazia para evitar erro de compilação
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

function getNumberCharacteristics(number: number): string {
  if (number === 0) return '0 Verde';
  
  const color = getColorFromNumber(number) === 'red' ? 'Vermelho' : 'Preto';
  const parity = number % 2 === 0 ? 'Par' : 'Ímpar';
  const range = number <= 18 ? 'Baixo (1-18)' : 'Alto (19-36)';
  
  return `${number} ${color}, ${parity}, ${range}`;
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
  // 🔄 PARAR: Polling da URL/API
  stopApiPolling(userId);
  
  // Parar apenas a operação, sem afetar a autenticação
  if (operationState[userId]) {
    operationState[userId].active = false;
    operationState[userId].waitingForResult = false;
    operationState[userId].currentBetColor = undefined;
    operationState[userId].martingaleLevel = 0;
    // 🔧 NOVO: Limpar stake pendente quando operação reseta
    operationState[userId].pendingStake = null;
    // 🎯 NOVO: Manter flag de missão cumprida (não resetar automaticamente)
    // O usuário precisa iniciar nova operação para resetar
  }

  // Resetar dados de análise
  resetAnalysisCounters(userId);
  // Removido: funções de análise que não existem mais no sistema simplificado
  // ✅ CORREÇÃO: NÃO resetar histórico detalhado aqui - só limpa quando página recarrega
  // resetDetailedHistory(userId);

  // 🔧 CORREÇÃO: Coleta de resultados sempre ativa (não precisa aguardar primeiro "apostas fechadas")
  // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `🔄 ${reason} - Coleta de resultados sempre ativa`, 'info');

  // Resetar estado da janela de apostas
  if (bettingWindowState[userId]) {
    delete bettingWindowState[userId];
  }

  // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `🔄 ${reason} - Dados resetados, autenticação e histórico preservados`, 'info');
}

function stopAllConnections(userId: string, setErrorStatus: boolean = true, preserveSession: boolean = false) {
  // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `🛑 Parando todas as conexões para usuário ${userId}`, 'info');
  
  // 🔄 PARAR: Polling da URL/API
  stopApiPolling(userId);
  
  // 🔄 REMOVIDO: Timer automático - agora usa sistema programado
  // stopAutoReconnectionTimer(userId);
  
  // Parar operação
  if (operationState[userId]) {
    operationState[userId].active = false;
    operationState[userId].waitingForResult = false;
    operationState[userId].currentBetColor = undefined;
    // 🔧 NOVO: Limpar stake pendente quando operação para
    operationState[userId].pendingStake = null;
  }
  
  // Fechar WebSocket
  if (activeWebSockets[userId]) {
    try {
      activeWebSockets[userId].ws.close();
      // Log removido: informação técnica desnecessária
      // addWebSocketLog(userId, `🔌 WebSocket fechado`, 'info');
    } catch (error) {
      addWebSocketLog(userId, `⚠️ Erro ao fechar WebSocket: ${error}`, 'error');
    }
    delete activeWebSockets[userId];
  }
  
  // Limpar timers de renovação
  if (autoRenewalIntervals[userId]) {
    clearInterval(autoRenewalIntervals[userId]);
    delete autoRenewalIntervals[userId];
  }
  
  // Resetar controle de reconexão
  resetReconnectionControl(userId);
  
  // 🔧 NOVO: Limpar controle de renovação quando parar conexões
  if (renewalControl[userId]) {
    addWebSocketLog(userId, '🔧 Limpando controle de renovação', 'info');
    delete renewalControl[userId];
  }
  
  // ⏰ Limpar sistema de renovação automática
  clearAutoRenewal(userId);
  
  // Não preservar sessão se não especificado
  if (!preserveSession) {
    delete sessionControl[userId];
  }
  
  // Limpar controle de primeira conexão quando parar tudo
  if (isFirstConnection[userId]) {
    delete isFirstConnection[userId];
  }
  
  // ✅ NOVO: Limpar timestamp da primeira aposta
  if (firstBetTimestamp[userId]) {
    delete firstBetTimestamp[userId];
  }
  
  // Atualizar status
  if (setErrorStatus) {
    updateConnectionStatus(userId, false, 'Conexão encerrada');
  }
  
  // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `✅ Todas as conexões foram encerradas`, 'info');
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

    // 🚀 NOVO: Incluir dados do operation report diretamente
    const operationReport = operation ? {
      summary: {
        totalBets: operation.stats.totalBets,
        wins: operation.stats.wins,
        losses: operation.stats.losses,
        profit: operation.stats.profit,
        winRate: operation.stats.totalBets > 0 ? parseFloat(((operation.stats.wins / operation.stats.totalBets) * 100).toFixed(2)) : 0,
        startedAt: operation.stats.startedAt
      }
    } : null;

    return NextResponse.json({
      success: true,
      data: {
        logs,
        connectionStatus: status,
        gameResults: results,
        lastTenResults: (() => {
          // 🤖 CORREÇÃO: Sempre mostrar resultados quando conectado (independente se apostou ou não)
          if (results.length === 0) {
            return []; // Não há resultados para mostrar
          }
          
          // 🚀 NOVO: Mostrar últimos 10 resultados, mais recente primeiro
          return results.slice(-10).reverse().map((result: any) => ({
            number: result.number,
            color: result.color,
            gameId: result.gameId,
            timestamp: result.timestamp
          }));
        })(),
        operationActive: operation?.active || false,
        operationState: operation ? {
          mode: canExitAnalysisMode(userId) ? 'real' : 'analysis',
          martingaleLevel: operation.martingaleLevel,
          waitingForResult: operation.waitingForResult,
          stats: operation.stats,
          // 🤖 NOVO: Informações do modo standby
          isStandbyMode: operation.isStandbyMode || false,
          m4DirectBetType: operation.m4DirectBetType || 'red',
          // 🔍 NOVO: Status de análise (sistema simplificado)
          analysisStatus: null,
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
        // 📊 Estatísticas de uso de martingale (sistema simplificado)
        martingaleUsage: [0, 0, 0, 0],
        // 📊 Estatísticas de rodadas analisadas por nível (sistema simplificado)
        analysisRounds: [0, 0, 0, 0],
        // 📋 Histórico detalhado de análises e apostas reais
        detailedHistory: getDetailedHistory(userId),
        // 🚀 NOVO: Operation report incluído para otimizar requisições
        operationReport: operationReport,
        // 🔧 NOVO: Informação sobre stake pendente
        pendingStakeInfo: operation?.pendingStake ? {
          hasPendingStake: true,
          pendingStake: operation.pendingStake
        } : {
          hasPendingStake: false,
          pendingStake: null
        },
        // Debugging info - removido
        debugInfo: null,
        sessionInfo: sessionControl[userId] ? {
          hasSession: true,
          pragmaticUserId: sessionControl[userId].pragmaticUserId?.substring(0, 8) + '...',
          timeSinceLastRenewal: Date.now() - sessionControl[userId].lastRenewal,
          nextRenewalIn: 'Inativo'
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

    // 📊 IMPORTANTE: Resetar também as estatísticas (sistema simplificado)
    resetAnalysisCounters(userId);

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
        operationActive: operation?.active || false,
        missionCompleted: operation?.missionCompleted || false
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

// 🔄 REMOVIDO: Timer automático de reconexão - agora usa sistema programado baseado em derrota
// function startAutoReconnectionTimer(userId: string) {
//   // Sistema de renovação programada substituiu esta função
// }

// 🔄 NOVO: Função para parar timer de reconexão automática
function stopAutoReconnectionTimer(userId: string) {
  if (reconnectionTimers[userId]) {
    clearTimeout(reconnectionTimers[userId]);
    delete reconnectionTimers[userId];
    addWebSocketLog(userId, `⏰ Timer de reconexão automática parado`, 'info');
  }
}

// 🎲 FUNÇÃO: Gerar aposta baseada no modo M4 direto ou padrão (vermelho)
function generateBet(userId: string): 'R' | 'B' | 'E' | 'O' | 'L' | 'H' {
  const operation = operationState[userId];
  if (!operation) return 'R';
  
  // 🔥 NOVO: Sistema simplificado - sempre apostar no tipo configurado
  const betType = operation.m4DirectBetType || 'red';
  
  switch (betType) {
    case 'red': return 'R';
    case 'black': return 'B';
    case 'even': return 'E';
    case 'odd': return 'O';
    case 'low': return 'L';
    case 'high': return 'H';
    default: return 'R';
  }
}

// 🔧 NOVO: Sistema de controle de renovação para evitar rate limiting
interface RenewalControlState {
  lastRenewalAttempt: number;
  renewalCooldown: number; // Tempo em ms para aguardar entre renovações
  consecutiveFailures: number;
  blocked: boolean;
  blockedUntil: number;
}

// Mapa para controlar renovações por usuário
const renewalControl: { [userId: string]: RenewalControlState } = {};

// Função para verificar se pode tentar renovar
function canAttemptRenewal(userId: string): boolean {
  const control = renewalControl[userId];
  if (!control) {
    // Primeira tentativa - permitir
    renewalControl[userId] = {
      lastRenewalAttempt: 0,
      renewalCooldown: 30000, // 30 segundos inicial
      consecutiveFailures: 0,
      blocked: false,
      blockedUntil: 0
    };
    return true;
  }

  const now = Date.now();
  
  // Verificar se está bloqueado temporariamente
  if (control.blocked && now < control.blockedUntil) {
    const remainingTime = Math.ceil((control.blockedUntil - now) / 1000);
    addWebSocketLog(userId, `⏰ Renovação bloqueada temporariamente por ${remainingTime}s (rate limit)`, 'error');
    return false;
  }
  
  // Desbloquear se passou o tempo
  if (control.blocked && now >= control.blockedUntil) {
    control.blocked = false;
    control.renewalCooldown = 30000; // Reset cooldown
    addWebSocketLog(userId, '🔓 Bloqueio temporário removido - renovação permitida', 'info');
  }

  // Verificar cooldown
  const timeSinceLastAttempt = now - control.lastRenewalAttempt;
  if (timeSinceLastAttempt < control.renewalCooldown) {
    const remainingTime = Math.ceil((control.renewalCooldown - timeSinceLastAttempt) / 1000);
    addWebSocketLog(userId, `⏰ Aguardando cooldown: ${remainingTime}s até próxima tentativa`, 'error');
    return false;
  }

  return true;
}

// Função para registrar resultado da renovação
function recordRenewalResult(userId: string, success: boolean) {
  const control = renewalControl[userId];
  if (!control) return;

  const now = Date.now();
  control.lastRenewalAttempt = now;

  if (success) {
    // Sucesso - resetar contadores
    control.consecutiveFailures = 0;
    control.renewalCooldown = 30000; // Reset para 30s
    control.blocked = false;
    addWebSocketLog(userId, '✅ Renovação bem-sucedida - cooldown resetado', 'success');
  } else {
    // Falha - aumentar cooldown e contador
    control.consecutiveFailures++;
    
    if (control.consecutiveFailures >= 3) {
      // Bloquear temporariamente após 3 falhas consecutivas
      control.blocked = true;
      control.blockedUntil = now + (5 * 60 * 1000); // Bloquear por 5 minutos
      addWebSocketLog(userId, '🚫 Muitas falhas consecutivas - bloqueando renovações por 5 minutos', 'error');
    } else {
      // Aumentar cooldown progressivamente
      control.renewalCooldown = Math.min(control.renewalCooldown * 2, 300000); // Max 5 minutos
      addWebSocketLog(userId, `⏰ Falha na renovação - cooldown aumentado para ${control.renewalCooldown / 1000}s`, 'error');
    }
  }
}

// ⏰ Sistema de renovação automática simples - a cada 10 minutos
interface SimpleRenewalState {
  nextRenewalTime: number;
  lastRenewalTime: number;
}

// Mapa para controlar renovações automáticas por usuário
const autoRenewal: { [userId: string]: SimpleRenewalState } = {};

// ⏰ Função para inicializar renovação automática
function initializeAutoRenewal(userId: string) {
  const now = Date.now();
  autoRenewal[userId] = {
    nextRenewalTime: now + (10 * 60 * 1000), // 10 minutos
    lastRenewalTime: now
  };
  addWebSocketLog(userId, '⏰ Renovação automática iniciada - próxima em 10 minutos', 'info');
}

// ⏰ Função para verificar se deve renovar automaticamente
function shouldRenewAutomatically(userId: string): boolean {
  const renewal = autoRenewal[userId];
  if (!renewal) {
    initializeAutoRenewal(userId);
    return false;
  }

  const now = Date.now();
  
  if (now >= renewal.nextRenewalTime) {
    // Renovar e agendar próxima
    renewal.lastRenewalTime = now;
    renewal.nextRenewalTime = now + (10 * 60 * 1000); // Próxima em 10 minutos
    
    addWebSocketLog(userId, '⏰ Renovação automática ativada (10 minutos)', 'info');
    return true;
  }
  
  return false;
}

// ⏰ Função para limpar renovação automática
function clearAutoRenewal(userId: string) {
  if (autoRenewal[userId]) {
    delete autoRenewal[userId];
    addWebSocketLog(userId, '⏰ Renovação automática limpa', 'info');
  }
}



