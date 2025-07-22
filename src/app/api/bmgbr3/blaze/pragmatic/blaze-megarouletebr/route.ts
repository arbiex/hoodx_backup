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
import { SimpleSessionAffinity } from '@/lib/simple-session-affinity';

interface MegaRouletteConfig {
  userId: string;
  action?: 'bet-connect' | 'connect' | 'start-operation' | 'stop-operation' | 'get-websocket-logs' | 'get-operation-report' | 'reset-operation-report' | 'get-connection-status' | 'server-diagnostic' | 'get-sessions-history' | 'blaze-proxy' | 'pragmatic-proxy' | 'debug-auth' | 'get-blaze-token' | 'frontend-auth' | 'generate-client-tokens' | 'generate-tokens' | 'update-strategy' | 'update-stake' | 'update-bet-type' | 'force-check-api-results' | 'set-pending-stake' | 'update-auto-progression' | 'activate-real-mode' | 'get-memory-stats' | 'cleanup-memory' | 'process-unified-result' | 'execute-immediate-bet';
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
  m4DirectBetType?: 'await' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';
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
  currentBetColor?: 'R' | 'B' | 'E' | 'O' | 'L' | 'H' | 'AWAIT';
  lastBetAmount?: number;
  
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
  m4DirectBetType?: 'await' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';
  // 🔄 NOVO: Controle de polling da URL/API
  lastProcessedGameId?: string;
  apiPollingInterval?: NodeJS.Timeout;
  // 🎯 NOVO: Controle de missão cumprida
  missionCompleted?: boolean;
  // 🚀 NOVA LÓGICA: Sistema de níveis fixos
  currentLevel: number; // Nível atual (1-12)
  stakeMultiplier: number; // Multiplicador de stake (1x, 2x, 3x, 4x, 5x)
  // 🎯 NOVA ESTRATÉGIA: Repetição Inteligente
  waitingForTrigger: boolean; // Aguardando o resultado desejado aparecer
  triggerDetected: boolean; // Resultado desejado foi detectado, agora apostar para repetir
  justMadeImmediateBet?: boolean; // Flag para ignorar próximo resultado após aposta imediata
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

// 🛡️ MONITORAMENTO: Contador de erros de rede consecutivos por usuário
const networkErrorCount: { [userId: string]: { count: number; lastReset: number } } = {};

const isFirstConnection: { [userId: string]: boolean } = {};

const bettingWindowState: { [userId: string]: {
  isOpen: boolean;
  currentGameId?: string;
  lastUpdate: number;
} } = {};

// 🎯 NOVO: Armazenar gameId atual das apostas abertas
const currentBettingGameId: { [userId: string]: string } = {};

// 🚀 REMOVIDO: Estado global para progressão automática - funcionalidade removida

// ✅ NOVO: Tracking da primeira aposta realizada após conexão
const firstBetTimestamp: { [userId: string]: number | null } = {};

// 🚀 NOVO: Flag para controlar se deve tentar apostar imediatamente quando conectar
const shouldTryImmediateBet: { [userId: string]: boolean } = {};

// 🔄 NOVO: Controle para evitar logs repetitivos do modo aguardar
const awaitModeLogShown: { [userId: string]: boolean } = {};

// 🔥 SIMPLIFICADO: Histórico detalhado apenas para modo real
const detailedHistory: { [userId: string]: Array<{
  id: string;
  timestamp: number;
  martingaleLevel: number;
  betColor: 'R' | 'B' | 'E' | 'O' | 'L' | 'H' | 'AWAIT';
  resultColor: string;
  resultNumber: number;
  gameId: string;
  isWin: boolean;
  betAmount: number;
  profit: number;
  sequencePosition: string;
}> } = {};

const reconnectionTimers: { [userId: string]: NodeJS.Timeout } = {};

// 🕐 FUNÇÃO DE LIMPEZA: Previne memory leaks de timers globais
function cleanupUserTimers(userId: string): void {
  let clearedCount = 0;
  
  // Limpar timer de auto-renewal
  if (autoRenewalIntervals[userId]) {
    clearInterval(autoRenewalIntervals[userId]);
    delete autoRenewalIntervals[userId];
    clearedCount++;
  }
  
  // Limpar timer de reconexão
  if (reconnectionTimers[userId]) {
    clearTimeout(reconnectionTimers[userId]);
    delete reconnectionTimers[userId];
    clearedCount++;
  }
  
  // Log apenas se houve limpeza (evita spam)
  if (clearedCount > 0) {
    console.log(`🕐 [CLEANUP] ${clearedCount} timers limpos para usuário ${userId.substring(0, 8)}...`);
  }
}

// 🕐 FUNÇÃO GLOBAL: Limpar todos os timers órfãos (manutenção)
function cleanupOrphanedTimers(): number {
  let totalCleared = 0;
  
  // Limpar todos os auto-renewal intervals
  Object.keys(autoRenewalIntervals).forEach(userId => {
    clearInterval(autoRenewalIntervals[userId]);
    delete autoRenewalIntervals[userId];
    totalCleared++;
  });
  
  // Limpar todos os reconnection timers
  Object.keys(reconnectionTimers).forEach(userId => {
    clearTimeout(reconnectionTimers[userId]);
    delete reconnectionTimers[userId];
    totalCleared++;
  });
  
  if (totalCleared > 0) {
    console.log(`🕐 [GLOBAL-CLEANUP] ${totalCleared} timers órfãos limpos`);
  }
  
  return totalCleared;
}

// 🧹 SISTEMA COMPLETO DE LIMPEZA DE MEMORY LEAKS
interface MemoryUsageStats {
  totalUsers: number;
  totalArrayItems: number;
  totalObjectKeys: number;
  largestArrays: { userId: string; type: string; size: number }[];
  memoryScore: number; // 0-100 (100 = crítico)
}

// Limites de segurança para prevenir memory leaks
const MEMORY_LIMITS = {
  MAX_WEBSOCKET_LOGS_PER_USER: 1000,
  MAX_GAME_RESULTS_PER_USER: 500,
  MAX_DETAILED_HISTORY_PER_USER: 1000,
  MAX_USERS_TOTAL: 100, // Limite total de usuários simultâneos
  CLEANUP_THRESHOLD_HOURS: 6, // Limpar dados de usuários inativos há 6h
  CRITICAL_MEMORY_SCORE: 80 // Score acima de 80 = crítico
};

// 🧹 Função para limpar arrays específicos de um usuário
function cleanupUserArrays(userId: string, limits?: Partial<typeof MEMORY_LIMITS>): number {
  const actualLimits = { ...MEMORY_LIMITS, ...limits };
  let itemsRemoved = 0;
  
  // 1. Limpar websocket logs (manter apenas os mais recentes)
  if (websocketLogs[userId]?.length > actualLimits.MAX_WEBSOCKET_LOGS_PER_USER) {
    const excess = websocketLogs[userId].length - actualLimits.MAX_WEBSOCKET_LOGS_PER_USER;
    websocketLogs[userId].splice(0, excess); // Remove do início (mais antigos)
    itemsRemoved += excess;
  }
  
  // 2. Limpar game results (manter apenas os mais recentes)  
  if (gameResults[userId]?.length > actualLimits.MAX_GAME_RESULTS_PER_USER) {
    const excess = gameResults[userId].length - actualLimits.MAX_GAME_RESULTS_PER_USER;
    gameResults[userId].splice(0, excess);
    itemsRemoved += excess;
  }
  
  // 3. Limpar detailed history (manter apenas os mais recentes)
  if (detailedHistory[userId]?.length > actualLimits.MAX_DETAILED_HISTORY_PER_USER) {
    const excess = detailedHistory[userId].length - actualLimits.MAX_DETAILED_HISTORY_PER_USER;
    detailedHistory[userId].splice(0, excess);
    itemsRemoved += excess;
  }
  
  return itemsRemoved;
}

// 🧹 Função para remover completamente dados de usuários inativos
function cleanupInactiveUsers(hoursThreshold: number = MEMORY_LIMITS.CLEANUP_THRESHOLD_HOURS): number {
  const cutoffTime = Date.now() - (hoursThreshold * 60 * 60 * 1000);
  let usersRemoved = 0;
  
  // Identificar usuários inativos baseado em última atividade
  const allUserIds = new Set<string>();
  
  // Coletar todos os userIds das diferentes estruturas
  Object.keys(connectionStatus).forEach(id => allUserIds.add(id));
  Object.keys(operationState).forEach(id => allUserIds.add(id));
  Object.keys(activeWebSockets).forEach(id => allUserIds.add(id));
  Object.keys(sessionControl).forEach(id => allUserIds.add(id));
  
  allUserIds.forEach(userId => {
    // 🛡️ PROTEÇÃO: Não remover usuários que têm conexão ativa ou WebSocket ativo
    const hasActiveConnection = connectionStatus[userId]?.connected || activeWebSockets[userId] != null;
    
    // 🛡️ PROTEÇÃO ADICIONAL: Não remover se há operação recentemente ativa (últimos 60 minutos)
    const recentOperationActivity = operationState[userId]?.stats?.startedAt || 0;
    const sixtyMinutesAgo = Date.now() - (60 * 60 * 1000);
    const hasRecentOperation = recentOperationActivity > sixtyMinutesAgo;
    
    if (hasActiveConnection || hasRecentOperation) {
      // 🔥 Usuário ativo ou com operação recente - NÃO LIMPAR
              // 🛡️ Proteção silenciosa - logs removidos para reduzir verbosidade
      return;
    }
    
    // Verificar se usuário está realmente inativo (apenas se não tem conexão nem operação recente)
    const lastActivity = Math.max(
      connectionStatus[userId]?.lastUpdate || 0,
      activeWebSockets[userId]?.lastActivity || 0,
      sessionControl[userId]?.lastRenewal || 0,
      operationState[userId]?.stats?.startedAt || 0
    );
    
    if (lastActivity > 0 && lastActivity < cutoffTime) {
      // Usuário inativo há mais de X horas, sem conexão e sem operação recente
      // Log de remoção silencioso - verbosidade reduzida
      cleanupAllUserData(userId);
      usersRemoved++;
    }
  });
  
  return usersRemoved;
}

// 🧹 Função para limpar TODOS os dados de um usuário específico
function cleanupAllUserData(userId: string): void {
  // 🛡️ PROTEÇÃO FINAL: Verificar se usuário realmente deve ser limpo
  const hasActiveConnection = connectionStatus[userId]?.connected || activeWebSockets[userId] != null;
  if (hasActiveConnection) {
    console.warn(`🚨 [CLEANUP] TENTATIVA DE LIMPAR USUÁRIO COM CONEXÃO ATIVA BLOQUEADA: ${userId.substring(0, 8)}...`);
    return;
  }
  
  // Log de limpeza silencioso - verbosidade reduzida
  
  // Arrays de dados
  delete websocketLogs[userId];
  delete gameResults[userId];
  delete detailedHistory[userId];
  
  // Estados e controles
  delete connectionStatus[userId];
  delete operationState[userId];
  delete activeWebSockets[userId];
  delete sessionControl[userId];
  delete reconnectionControl[userId];
  delete bettingWindowState[userId];
  
  // Flags e controles simples
  delete isFirstConnection[userId];
  delete firstBetTimestamp[userId];
  delete shouldTryImmediateBet[userId];
  delete awaitModeLogShown[userId];
  delete renewalControl[userId];
  delete autoRenewal[userId];
  delete renewalInProgress[userId];
  
  // Timers (já tratado em cleanupUserTimers)
  cleanupUserTimers(userId);
}

// 📊 Função para calcular estatísticas de uso de memória
function calculateMemoryUsage(): MemoryUsageStats {
  let totalArrayItems = 0;
  let totalObjectKeys = 0;
  const largestArrays: { userId: string; type: string; size: number }[] = [];
  
  // Contar items em arrays
  Object.keys(websocketLogs).forEach(userId => {
    const size = websocketLogs[userId]?.length || 0;
    totalArrayItems += size;
    if (size > 100) largestArrays.push({ userId: userId.substring(0, 8) + '...', type: 'websocketLogs', size });
  });
  
  Object.keys(gameResults).forEach(userId => {
    const size = gameResults[userId]?.length || 0;
    totalArrayItems += size;
    if (size > 100) largestArrays.push({ userId: userId.substring(0, 8) + '...', type: 'gameResults', size });
  });
  
  Object.keys(detailedHistory).forEach(userId => {
    const size = detailedHistory[userId]?.length || 0;
    totalArrayItems += size;
    if (size > 100) largestArrays.push({ userId: userId.substring(0, 8) + '...', type: 'detailedHistory', size });
  });
  
  // Contar chaves de objetos
  totalObjectKeys += Object.keys(connectionStatus).length;
  totalObjectKeys += Object.keys(operationState).length;
  totalObjectKeys += Object.keys(activeWebSockets).length;
  totalObjectKeys += Object.keys(sessionControl).length;
  totalObjectKeys += Object.keys(reconnectionControl).length;
  totalObjectKeys += Object.keys(bettingWindowState).length;
  totalObjectKeys += Object.keys(isFirstConnection).length;
  totalObjectKeys += Object.keys(firstBetTimestamp).length;
  totalObjectKeys += Object.keys(shouldTryImmediateBet).length;
  totalObjectKeys += Object.keys(awaitModeLogShown).length;
  
  // Calcular score de memória (0-100)
  const memoryScore = Math.min(100, Math.floor(
    (totalArrayItems / 10000 * 60) + // Arrays são o maior risco
    (totalObjectKeys / 100 * 40)     // Objetos têm menor impacto
  ));
  
  // Ordenar maiores arrays
  largestArrays.sort((a, b) => b.size - a.size);
  
  return {
    totalUsers: new Set([
      ...Object.keys(connectionStatus),
      ...Object.keys(operationState),
      ...Object.keys(activeWebSockets)
    ]).size,
    totalArrayItems,
    totalObjectKeys,
    largestArrays: largestArrays.slice(0, 10), // Top 10
    memoryScore
  };
}

// 🚨 Função de limpeza de emergência para situações críticas
function emergencyMemoryCleanup(): number {
  console.warn('🚨 [EMERGENCY] Executando limpeza de emergência de memória!');
  
  let totalCleaned = 0;
  
  // 1. Limpar usuários inativos (mais agressivo - 2h ao invés de 6h)
  totalCleaned += cleanupInactiveUsers(2);
  
  // 2. Limpar arrays de todos os usuários ativos (limites mais restritivos)
  Object.keys(websocketLogs).forEach(userId => {
    totalCleaned += cleanupUserArrays(userId, {
      MAX_WEBSOCKET_LOGS_PER_USER: 100, // Reduzir drasticamente
      MAX_GAME_RESULTS_PER_USER: 50,
      MAX_DETAILED_HISTORY_PER_USER: 100
    });
  });
  
  // 3. Limpar todos os timers órfãos
  totalCleaned += cleanupOrphanedTimers();
  
  console.warn(`🚨 [EMERGENCY] Limpeza concluída: ${totalCleaned} items removidos`);
  
  return totalCleaned;
}

function addDetailedHistoryEntry(userId: string, entry: {
  martingaleLevel: number;
  betColor: 'R' | 'B' | 'E' | 'O' | 'L' | 'H' | 'AWAIT';
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
  
  // 🧹 Aplicar limite centralizado automaticamente
  if (detailedHistory[userId].length > MEMORY_LIMITS.MAX_DETAILED_HISTORY_PER_USER) {
    detailedHistory[userId] = detailedHistory[userId].slice(-MEMORY_LIMITS.MAX_DETAILED_HISTORY_PER_USER);
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

// 💰 12 Níveis de Stakes - Estratégia de Repetição Inteligente
const STAKE_LEVELS = [
  { level: 1, m1: 0, m2: 0.50, cost: 0.50 },
  { level: 2, m1: 0, m2: 1.50, cost: 1.50 },
  { level: 3, m1: 0, m2: 3.50, cost: 3.50 },
  { level: 4, m1: 0, m2: 7.50, cost: 7.50 },
  { level: 5, m1: 0, m2: 15.50, cost: 15.50 },
  { level: 6, m1: 0, m2: 31.50, cost: 31.50 },
  { level: 7, m1: 0, m2: 63.50, cost: 63.50 },
  { level: 8, m1: 0, m2: 127.50, cost: 127.50 },
  { level: 9, m1: 0, m2: 255.50, cost: 255.50 },
  { level: 10, m1: 0, m2: 511.50, cost: 511.50 },
  { level: 11, m1: 0, m2: 1023.50, cost: 1023.50 },
  { level: 12, m1: 0, m2: 2047.50, cost: 2047.50 }
];

// Funções de sessão simplificadas (removidas - não essenciais)

// Função principal POST
export async function POST(request: NextRequest) {
  try {
    // 🔗 AFINIDADE DE SESSÃO: Verificar se deve processar nesta instância
    // 🆔 BYPASS: Permitir chamadas internas sem afinidade
    const isInternalCall = request.headers.get('x-internal-call') === 'true';
    
    if (!isInternalCall && !SimpleSessionAffinity.shouldServeUser(request)) {
      const cookies = request.headers.get('cookie') || '';
      const sessionInstanceId = cookies.match(/fly-instance-id=([^;]+)/)?.[1];
      
      if (sessionInstanceId) {
        // 🛡️ PROTEÇÃO: Verificar se há loop de redirecionamentos
        const loopCheck = SimpleSessionAffinity.checkForLoop(request);
        if (loopCheck.hasLoop) {
          console.error(`❌ [SESSION-AFFINITY] LOOP detectado na rota principal! Forçando aceitação.`);
          // Continuar processamento na instância atual
        } else {
          console.log(`🔄 [SESSION-AFFINITY] Redirecionando para instância: ${sessionInstanceId} (tentativa ${loopCheck.redirectCount + 1})`);
          return SimpleSessionAffinity.createReplayResponse(sessionInstanceId, request);
        }
      }
    }

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
      case 'connect':
        return createSessionResponse(await connectToBettingGame(userId, tipValue, clientIP, userFingerprint, {
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
        }, authTokens, forceClientSideAuth, customMartingaleSequence, stakeBased, m4DirectBetType, isStandbyMode));
      
      case 'start-operation':
        return createSessionResponse(await startSimpleOperation(userId));
      
      case 'stop-operation':
        return createSessionResponse(await stopSimpleOperation(userId));
      
      case 'get-websocket-logs':
      return createSessionResponse(await getWebSocketLogs(userId));
      
            case 'get-operation-report':
        return createSessionResponse(await getOperationReport(userId));
      
      case 'reset-operation-report':
        return createSessionResponse(await resetOperationReport(userId));
      
      case 'get-connection-status':
        return createSessionResponse(await getConnectionStatus(userId));
      
      
      
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
      case 'generate-tokens':
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
            
            // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente
            const simplifiedError = simplifyBlazeError(errorText, blazeResponse.status);
            
            return NextResponse.json({
              success: false,
              error: simplifiedError
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
        // 🛡️ Simplificado: Suporte para nível selecionado e multiplicador
        const { selectedLevel, stakeMultiplier } = requestBody;
        
        if (userId && operationState[userId]) {
          // Atualizar nível se fornecido
          if (selectedLevel) {
            const level = STAKE_LEVELS.find(l => l.level === selectedLevel) || STAKE_LEVELS[0];
            operationState[userId].currentLevel = level.level;
            addWebSocketLog(userId, `💰 Nível atualizado: Nível ${level.level} - M1: R$ ${level.m1.toFixed(2)}, M2: R$ ${level.m2.toFixed(2)}`, 'success');
          }
        
          // Atualizar multiplicador se fornecido
          if (stakeMultiplier && stakeMultiplier >= 1 && stakeMultiplier <= 5) {
            operationState[userId].stakeMultiplier = stakeMultiplier;
            addWebSocketLog(userId, `🔢 Multiplicador atualizado: ${stakeMultiplier}x`, 'success');
          } else if (stakeMultiplier) {
            addWebSocketLog(userId, `❌ Multiplicador inválido: ${stakeMultiplier}x (deve ser entre 1x e 5x)`, 'error');
          }
        } else {
          // Criar estado se não existir (para permitir configuração antes de conectar)
          if (userId) {
            operationState[userId] = {
              active: false,
              martingaleLevel: 0,
              waitingForResult: false,
              strategy: {
                sequences: [0.5, 1],
                maxMartingale: 2
              },
              currentLevel: 1,
              stakeMultiplier: stakeMultiplier || 1,
              stats: {
                totalBets: 0,
                wins: 0,
                losses: 0,
                profit: 0,
                startedAt: Date.now()
              },
              m4DirectBetType: 'await',
              waitingForTrigger: false,
              triggerDetected: false
            };
            addWebSocketLog(userId, `🔧 Estado criado - Multiplicador configurado: ${stakeMultiplier || 1}x`, 'success');
          } else {
            addWebSocketLog(userId, `❌ UserId não fornecido para atualizar multiplicador`, 'error');
          }
        }
        
        return NextResponse.json({ success: true });
      
      case 'update-recovery-bonus':
        // Funcionalidade removida na nova lógica de stakes fixas
        return NextResponse.json({ success: true, message: 'Funcionalidade removida - usando stakes fixas' });
      
      case 'update-accumulated-loss':
        // Funcionalidade removida na nova lógica de stakes fixas
        return NextResponse.json({ success: true, message: 'Funcionalidade removida - usando stakes fixas' });
      
      case 'update-progression':
        // 🚀 REMOVIDO: Funcionalidade de progressão automática removida
        return NextResponse.json({ success: true });
      
      case 'reset-progression':
        // 🚀 REMOVIDO: Funcionalidade de progressão automática removida
        return NextResponse.json({ success: true });
      
      case 'activate-real-mode':
        // 🛡️ NOVO: Ativar modo real automaticamente quando status melhorar
        if (userId && operationState[userId]?.active) {
          
          
          // 🔥 NOVO: Verificar se é modo M4 direto
          if (requestBody.m4DirectBetType) {
            // Log de modo M4 removido - informação técnica desnecessária
            
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
            
            // Log de ativação do modo M4 removido - informação técnica desnecessária
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
          const previousBetType = operationState[userId].m4DirectBetType;
          
          if (!newBetType) {
            return NextResponse.json({
              success: false,
              error: 'Tipo de aposta (m4DirectBetType) é obrigatório'
            }, { status: 400 });
          }
          
          const validBetTypes = ['await', 'red', 'black', 'even', 'odd', 'low', 'high'];
          if (!validBetTypes.includes(newBetType)) {
            return NextResponse.json({
              success: false,
              error: 'Tipo de aposta inválido'
            }, { status: 400 });
          }
          
                                                  // 🔥 NOVO: Resetar estado da operação quando trocar tipo de aposta (mas preservar banca)
           const shouldReset = previousBetType !== newBetType && newBetType !== 'await';
           
           if (shouldReset) {
             // 🔧 CORREÇÃO: Salvar multiplicador antes do reset
             const savedMultiplier = operationState[userId].stakeMultiplier || 1;
             
             // Resetar estado da operação
             operationState[userId].martingaleLevel = 0;
             operationState[userId].waitingForResult = false;
             operationState[userId].currentBetColor = undefined;
             operationState[userId].lastBetAmount = undefined;
             
             // 🚀 NOVO: Resetar para nível 1 mas PRESERVAR multiplicador
             operationState[userId].currentLevel = 1;
             operationState[userId].stakeMultiplier = savedMultiplier;
             
             // ⏰ SISTEMA SIMPLIFICADO: Flags de trigger não são mais necessárias
             // Sistema de janela de 10 segundos no frontend substitui trigger detection
             
             // 🎯 NOVO: NÃO resetar estatísticas ao trocar tipo - apenas ao iniciar nova operação
             
             addWebSocketLog(userId, `🔧 Estado resetado - Multiplicador preservado: ${savedMultiplier}x`, 'success');
           }
           
          // Atualizar tipo de aposta no estado da operação
          operationState[userId].m4DirectBetType = newBetType;
          
          // 🎯 GARANTIR: Configurar estado para aguardar trigger
          if (newBetType !== 'await') {
            operationState[userId].waitingForTrigger = true;
            operationState[userId].triggerDetected = false;
          }
          
          // 🎯 NOVO: Se estava com missão cumprida, reativar operação
          if (operationState[userId].missionCompleted) {
            operationState[userId].missionCompleted = false;
            operationState[userId].active = true;

          }
          
          // 🎯 NOVO: Garantir que operação esteja ativa ao trocar tipo
          if (!operationState[userId].active) {
            operationState[userId].active = true;
            addWebSocketLog(userId, `🚀 Ativando operação para novo tipo`, 'info');
          }
          
          // Logs de configuração removidos - sistema estabilizado
          
          // 🔥 ATUALIZAR: Timestamp para manter usuário ativo
          if (operationState[userId].stats) {
            operationState[userId].stats.startedAt = Date.now();
          }
          
          // 🎯 NOVO: Verificar imediatamente se o último resultado já é o trigger desejado
          if (newBetType !== 'await' && gameResults[userId] && gameResults[userId].length > 0) {
            // ⏰ SISTEMA SIMPLIFICADO: Lógica de timing movida para frontend (janela de 10s)
            // Trigger detection complexa removida - frontend controla quando apostar
          }
          
          // 🔄 NOVO: Resetar controle de log do modo aguardar quando tipo muda
          awaitModeLogShown[userId] = false;
          
          const betTypeNames = {
            'await': 'AGUARDAR',
            'red': 'VERMELHO',
            'black': 'PRETO',
            'even': 'PAR',
            'odd': 'ÍMPAR',
            'low': 'BAIXAS (1-18)',
            'high': 'ALTAS (19-36)'
          };
          
          const typeName = betTypeNames[newBetType as keyof typeof betTypeNames];
          
                     if (shouldReset) {
             addWebSocketLog(userId, `🎯 NOVO TIPO: ${typeName} → Iniciando monitoramento`, 'success');
           }
           
           // 🚀 NOVO: Iniciar polling para processar resultados se não for 'await'
           if (newBetType !== 'await') {
             await startApiPolling(userId);
           }
           
           // 🚀 REMOVIDO: Lógica de aposta imediata que causava o bug
           // Agora o sistema só aposta quando realmente detecta o trigger
           // A aposta imediata será feita apenas via frontend com execute-immediate-bet
           
           return NextResponse.json({
             success: true,
             message: `Tipo de aposta atualizado para ${typeName}${shouldReset ? ' (Reiniciado)' : ''}`,
             newBetType: newBetType,
             reset: shouldReset,
             data: {
               m4DirectBetType: newBetType,
               missionCompleted: operationState[userId].missionCompleted,
               operationActive: operationState[userId].active
             }
           });
        }
        
        return NextResponse.json({
          success: false,
          error: 'Operação não encontrada'
        }, { status: 404 });
      
      // Removed: set-standby-mode case
      
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
          
      
          
          if (expectedResult) {
            addWebSocketLog(userId, `🎯 Resultado esperado: ${expectedResult.number} (${expectedResult.color})`, 'info');
          }
          
          // Forçar verificação da API
          await checkForNewResults(userId);
          
          // Aguardar um pouco para o processamento
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Verificar se resultado específico foi processado
          if (gameId && operation.lastProcessedGameId === gameId) {
            addWebSocketLog(userId, `✅ Resultado ${gameId} foi processado com sucesso pelo sistema`, 'success');
            
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
            addWebSocketLog(userId, `⚠️ Resultado ${gameId} ainda não foi processado pelo sistema`, 'info');
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
      
      case 'get-memory-stats':
        // 📊 NOVO: Obter estatísticas de uso de memória
        try {
          const memoryStats = calculateMemoryUsage();
          return NextResponse.json({
            success: true,
            data: memoryStats
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            error: 'Erro ao calcular estatísticas de memória'
          }, { status: 500 });
        }
      
      case 'cleanup-memory':
        // 🧹 NOVO: Forçar limpeza de memória
        try {
          let totalCleaned = 0;
          
          // Determinar tipo de limpeza baseado em parâmetros
          const { type = 'normal', hoursThreshold } = requestBody;
          
          if (type === 'emergency') {
            totalCleaned = emergencyMemoryCleanup();
          } else if (type === 'inactive-users') {
            totalCleaned = cleanupInactiveUsers(hoursThreshold || 6);
          } else if (type === 'user-specific' && userId) {
            totalCleaned = cleanupUserArrays(userId);
            if (requestBody.fullCleanup) {
              cleanupAllUserData(userId);
              totalCleaned += 1; // Contabilizar limpeza completa do usuário
            }
          } else {
            // Limpeza normal: arrays + usuários inativos + timers órfãos
            Object.keys(websocketLogs).forEach(uid => {
              totalCleaned += cleanupUserArrays(uid);
            });
            totalCleaned += cleanupInactiveUsers(6);
            totalCleaned += cleanupOrphanedTimers();
          }
          
          const memoryStats = calculateMemoryUsage();
          
          return NextResponse.json({
            success: true,
            data: {
              itemsCleaned: totalCleaned,
              memoryStats,
              cleanupType: type
            }
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            error: 'Erro ao executar limpeza de memória'
          }, { status: 500 });
        }
      
      case 'execute-immediate-bet':
        // 🔥 NOVA AÇÃO: Executar aposta imediata (milisegundos)
        try {
          const { betType, stake, urgent } = requestBody;
          
          if (!betType || !stake) {
            return NextResponse.json({
              success: false,
              error: 'betType e stake são obrigatórios'
            }, { status: 400 });
          }
          
          // 🚀 Log da aposta imediata
          addWebSocketLog(userId, `⚡ APOSTA IMEDIATA: ${betType.toUpperCase()} - Stake: R$${stake}`, 'info');
          
          // 🎯 Processar aposta com prioridade máxima
          const betResult = await processImmediateBet(userId, betType, stake, urgent);
          
          if (betResult.success) {
            addWebSocketLog(userId, `✅ Aposta imediata executada com sucesso`, 'success');
            return NextResponse.json({
              success: true,
              data: {
                betType,
                stake,
                message: 'Aposta imediata executada com sucesso'
              }
            });
          } else {
            throw new Error(betResult.error || 'Falha na aposta imediata');
          }
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          addWebSocketLog(userId, `❌ Erro na aposta imediata: ${errorMessage}`, 'error');
          return NextResponse.json({
            success: false,
            error: 'Erro na aposta imediata'
          }, { status: 500 });
        }

      case 'process-unified-result':
        // 🔄 NOVO: Processar resultado via polling unificado (substitui WebSocket)
        try {
          const { gameId, number, color, timestamp, source } = requestBody;
          
          // 🛡️ VALIDAÇÕES rigorosas
          if (!gameId || number === undefined) {
            return NextResponse.json({
              success: false,
              error: 'GameId e número são obrigatórios'
            }, { status: 400 });
          }
          
          // ✅ VALIDAR número da roleta (0-36)
          if (typeof number !== 'number' || number < 0 || number > 36) {
            addWebSocketLog(userId, `⚠️ NÚMERO INVÁLIDO: ${String(number)} - Ignorado`, 'error');
            return NextResponse.json({
              success: false,
              error: `Número inválido: ${String(number)}. Deve estar entre 0-36.`
            }, { status: 400 });
          }
          
          // ✅ VALIDAR gameId (formato adequado)
          if (!gameId || String(gameId).length < 5) {
            addWebSocketLog(userId, `⚠️ GAMEID INVÁLIDO: ${String(gameId)} - Ignorado`, 'error');
            return NextResponse.json({
              success: false,
              error: `GameId inválido: ${String(gameId)}`
            }, { status: 400 });
          }
          
          // 🛡️ PROTEÇÃO CONTRA DUPLICAÇÃO: Verificar se gameId já foi processado
          const operation = operationState[userId];
          if (operation?.lastProcessedGameId === gameId) {
            // Log silencioso - não precisa mostrar
            return NextResponse.json({
              success: true,
              data: {
                processed: false,
                gameId,
                number,
                color,
                message: 'GameId já processado anteriormente - ignorado para evitar duplicação'
              }
            });
          }
          
          // 📝 Log do resultado
          const colorName = color === 'red' ? 'Vermelho' : color === 'black' ? 'Preto' : 'Verde';
          let characteristics = [colorName];
          
          if (number !== 0) {
            characteristics.push(number % 2 === 0 ? 'Par' : 'Ímpar');
            characteristics.push(number <= 18 ? 'Baixo' : 'Alto');
          }
          
          const logMessage = `🎯 Resultado: ${String(number)} - ${characteristics.join(' - ')} (ID: ${String(gameId)})`;
          addWebSocketLog(userId, logMessage, 'game');
          
            // ✅ ATUALIZAR lastProcessedGameId ANTES de processar
  if (operation) {
    operation.lastProcessedGameId = gameId;
  }
  
  // ✅ PROCESSAR resultado como fazia no WebSocket
  // Log de endpoint removido - debug concluído
  await processGameResult(userId, String(gameId), number, String(color));
  
  return NextResponse.json({
            success: true,
            data: {
              processed: true,
              gameId,
              number,
              color,
              message: 'Resultado processado com sucesso via polling unificado'
            }
          });
        } catch (error) {
          console.error('❌ Erro ao processar resultado unificado:', error);
          return NextResponse.json({
            success: false,
            error: 'Erro ao processar resultado unificado'
          }, { status: 500 });
        }
      
      default:
      return createSessionResponse(NextResponse.json({
        success: false,
          error: `Ação "${action}" não implementada`
    }, { status: 400 }));
    }

  } catch (error) {
    return createSessionResponse(NextResponse.json({
      success: false,
      error: 'Erro interno do servidor'
    }, { status: 500 }));
  }
}

// 🔗 HELPER: Wrapper para adicionar cookie de afinidade de sessão
function createSessionResponse(response: NextResponse): NextResponse {
  const instanceId = SimpleSessionAffinity.getCurrentInstanceId();
  
  // Adicionar cookie de afinidade de sessão
  response.headers.set('Set-Cookie', 
    `fly-instance-id=${instanceId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`
  );
  
  return response;
}

// Funções de token removidas (usamos Edge Function)



// Removed: Stop gain functions

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
      // Log removido: verbose demais no terminal
      
      const response = await requestFunction();
      
      // Se resposta OK, retornar imediatamente
      if (response.ok) {
        if (attempt > 1) {
          // Log removido: verbose demais no terminal
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
              // Log removido: verbose demais no terminal
      
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

// 🔥 FUNÇÃO: Processar aposta imediata REAL (não simulação)
async function processImmediateBet(userId: string, betType: string, stake: number, urgent: boolean = false) {
  try {
    // Log de processamento
    addWebSocketLog(userId, `🎯 Processando aposta ${betType} com stake R$${stake}${urgent ? ' [URGENTE]' : ''}`, 'info');
    
    // 🚀 EXECUTAR APOSTA REAL: Usar a mesma lógica que executeSimpleBet
    const wsConnection = activeWebSockets[userId];
    const operation = operationState[userId];
    
    if (!wsConnection?.ws || !operation?.active) {
      throw new Error('WebSocket não conectado ou operação inativa');
    }
    
    // 🎯 CONFIGURAR OPERAÇÃO PARA APOSTA IMEDIATA
    // Mapear betType para cor de aposta
    const betTypeToColor: { [key: string]: 'R' | 'B' | 'E' | 'O' | 'L' | 'H' } = {
      'red': 'R',
      'black': 'B', 
      'even': 'E',
      'odd': 'O',
      'low': 'L',
      'high': 'H'
    };
    
    const betColor = betTypeToColor[betType];
    if (!betColor) {
      throw new Error(`Tipo de aposta inválido: ${betType}`);
    }
    
    // 🔥 FORÇAR TRIGGER DETECTADO para aposta imediata
    operation.triggerDetected = true;
    operation.waitingForTrigger = false;
    operation.currentBetColor = betColor;
    
         // 🎯 OBTER GAMEID REAL DO WEBSOCKET (apostas abertas)
     let currentGameId = currentBettingGameId[userId] || bettingWindowState[userId]?.currentGameId || '';
     
     if (!currentGameId) {
       // 🔍 Se não há gameId das apostas abertas, tentar outras fontes
       currentGameId = operation.lastGameId || '';
       
       if (!currentGameId || currentGameId.startsWith('temp_')) {
         // Verificar se WebSocket está conectado
         const wsState = wsConnection.ws.readyState;
         if (wsState !== 1) {
           throw new Error('WebSocket não está conectado para aposta imediata');
         }
         
         // ❌ ÚLTIMO RECURSO: gameId temporário (pode falhar)
         currentGameId = `temp_${Date.now()}`;
         addWebSocketLog(userId, `⚠️ Usando gameId temporário - aposta pode falhar`, 'error');
       } else {
         addWebSocketLog(userId, `🔧 Usando gameId da última operação: ${currentGameId}`, 'info');
       }
     } else {
       addWebSocketLog(userId, `✅ Usando gameId real das apostas abertas: ${currentGameId}`, 'success');
     }
     
     addWebSocketLog(userId, `🎯 GameId para aposta imediata: ${currentGameId}`, 'info');
     
     // ✅ EXECUTAR APOSTA REAL usando executeSimpleBet
     await executeSimpleBet(userId, currentGameId, wsConnection.ws);
     
     // 🚨 CRÍTICO: Marcar que acabou de fazer aposta imediata e definir estado de espera
     // ⚠️ NOTA: Se receber erro 1007 no WebSocket, estes estados serão cancelados
     operation.justMadeImmediateBet = true;
     operation.waitingForResult = true;
     operation.lastGameId = currentGameId;
     
     addWebSocketLog(userId, `🔍 Aposta imediata - aguardando resultado do jogo: ${currentGameId}`, 'info');
    
    return {
      success: true,
      betType,
      stake,
      urgent,
      timestamp: Date.now(),
      realBet: true
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    addWebSocketLog(userId, `❌ Erro na aposta imediata: ${errorMessage}`, 'error');
    return {
      success: false,
      error: errorMessage
    };
  }
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
  
  // 🧹 Aplicar limite centralizado automaticamente
  if (websocketLogs[userId].length > MEMORY_LIMITS.MAX_WEBSOCKET_LOGS_PER_USER) {
    websocketLogs[userId] = websocketLogs[userId].slice(0, MEMORY_LIMITS.MAX_WEBSOCKET_LOGS_PER_USER);
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
  
  // Polling iniciado silenciosamente
  
  // Polling a cada 2 segundos
  operation.apiPollingInterval = setInterval(async () => {
    try {
      await checkForNewResults(userId);
    } catch (error: any) {
      // 🛡️ POLLING RESILIENTE: Tratar erros sem parar o polling
      const isNetworkError = error.code === 'ECONNRESET' || 
                            error.code === 'ECONNREFUSED' || 
                            error.code === 'ETIMEDOUT' ||
                            error.message?.includes('fetch failed') ||
                            error.message?.includes('network');
      
      if (isNetworkError) {
        console.warn(`🔄 [POLLING-INTERVAL] Erro de rede temporário para usuário ${userId}: ${error.message}`);
        // 🎯 Continua polling - erros de rede são temporários
      } else {
        console.warn(`⚠️ [POLLING-INTERVAL] Erro no polling para usuário ${userId}:`, error);
        // 🎯 Continua polling - sistema resiliente
      }
      
      // 🛡️ NUNCA parar o polling por erro - sistema deve ser auto-recuperável
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
  const shouldPoll = shouldPollForResults(userId);
  if (!shouldPoll) {
    // 🔇 SILENCIOSO: Não fazer polling se não há necessidade
    // Polling silencioso quando não necessário
    return;
  }
  
  // Polling funcionando silenciosamente
  
  // 🔍 DEBUG: Log do estado atual (removido para não poluir)
  
  // 📊 LOG: Verificação silenciosa - removido log excessivo
  const hasActiveBets = operation.waitingForResult && !!operation.lastGameId;
  

  
  try {
    // 🛡️ SISTEMA RETRY ULTRA-ROBUSTO: Combater ECONNRESET e erros de rede
    const maxRetries = 3;
    let lastError: any = null;
    let response: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [RETRY ${attempt}/${maxRetries}] Tentando buscar insights para usuário ${userId}`);
        
        // 🎯 SOLUÇÃO: Usar getBaseUrl() para funcionar tanto no localhost quanto em produção
        response = await fetch(`${getBaseUrl()}/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr/insights`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-call': 'true' // 🆔 BYPASS: Identificar como chamada interna
          },
          body: JSON.stringify({
            user_id: `polling_${userId}`,
            action: 'get',
            limit: 3 // Buscar apenas os últimos 3 resultados
          }),
          // 🛡️ TIMEOUTS AGRESSIVOS para evitar hang
          signal: AbortSignal.timeout(15000) // 15 segundos timeout
        });
        
        // ✅ Sucesso - sair do loop
                 console.log(`✅ [RETRY] Sucesso na tentativa ${attempt} para usuário ${userId}`);
         
         // 🎯 SUCESSO: Resetar contador de erros de rede
         if (networkErrorCount[userId]) {
           networkErrorCount[userId] = { count: 0, lastReset: Date.now() };
         }
         
         break;
        
      } catch (error: any) {
        lastError = error;
        
        // 🔍 DIAGNÓSTICO: Tipos específicos de erro
        const isNetworkError = error.code === 'ECONNRESET' || 
                              error.code === 'ECONNREFUSED' || 
                              error.code === 'ETIMEDOUT' ||
                              error.message?.includes('fetch failed') ||
                              error.message?.includes('network');
        
        const isTimeoutError = error.name === 'TimeoutError' || 
                              error.message?.includes('timeout');
        
        console.warn(`⚠️ [RETRY ${attempt}/${maxRetries}] Erro ${isNetworkError ? 'REDE' : isTimeoutError ? 'TIMEOUT' : 'DESCONHECIDO'}: ${error.message}`);
        
        // 🚨 Se não é erro de rede/timeout, não tentar retry
        if (!isNetworkError && !isTimeoutError && attempt === 1) {
          console.error(`❌ [RETRY] Erro não relacionado à rede - não fazendo retry: ${error.message}`);
          throw error;
        }
        
        // 🔄 Se não é a última tentativa, aguardar com exponential backoff
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 1s, 2s, 4s (max 5s)
          console.log(`⏳ [RETRY] Aguardando ${waitTime}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // 🚨 Se chegou aqui sem response, todas as tentativas falharam
    if (!response) {
      throw lastError || new Error('Todas as tentativas de retry falharam');
    }
    

    
    if (response.ok) {
      const result = await response.json();
      

      
      if (result.success && result.data && result.data.results && result.data.results.length > 0) {
        const latestResult = result.data.results[0]; // Resultado mais recente
        

        
        // 🔍 VERIFICAR: Se é um novo resultado que não foi processado
        if (latestResult.gameId !== operation.lastProcessedGameId) {
          // 🎯 VERIFICAR: Se estamos aguardando resultado de uma aposta ESPECÍFICA
          if (operation.waitingForResult && operation.lastGameId) {

            
            // ✅ CORREÇÃO: Verificar se o resultado é para a aposta que está aguardando
            if (latestResult.gameId === operation.lastGameId) {
              // 🎯 Resultado da aposta encontrado
          
              
              // Processar resultado da aposta específica
              const correctedColor = getColorFromNumber(latestResult.number);
              const colorCode = latestResult.number === 0 ? 'green' : (correctedColor === 'red' ? 'R' : 'B');
              
              // 🎯 NOVO: Gerar log completo também no polling automático
              const colorName = correctedColor === 'red' ? 'Vermelho' : correctedColor === 'black' ? 'Preto' : 'Verde';
              let characteristics = [colorName];
              
              if (latestResult.number !== 0) {
                characteristics.push(latestResult.number % 2 === 0 ? 'Par' : 'Ímpar');
                characteristics.push(latestResult.number <= 18 ? 'Baixo' : 'Alto');
              }
              
                          const logMessage = `🎯 Resultado: ${latestResult.number} - ${characteristics.join(' - ')} (ID: ${latestResult.gameId}) [Polling]`;
            addWebSocketLog(userId, logMessage, 'game');
            
            // Log de polling removido - debug concluído
            await processGameResult(userId, latestResult.gameId, latestResult.number, correctedColor);
              
              // ✅ Resultado processado - sistema deve continuar funcionando
              addWebSocketLog(userId, `✅ Resultado processado com sucesso!`, 'success');
            } else {

            }
          } else {
            // 🎯 NOVA LÓGICA: Processar resultado mesmo sem apostas pendentes (para detecção de trigger)
            const correctedColor = getColorFromNumber(latestResult.number);
            const colorCode = latestResult.number === 0 ? 'green' : (correctedColor === 'red' ? 'R' : 'B');
            
            // 🎯 NOVO: Gerar log completo também no polling automático
            const colorName = correctedColor === 'red' ? 'Vermelho' : correctedColor === 'black' ? 'Preto' : 'Verde';
            let characteristics = [colorName];
            
            if (latestResult.number !== 0) {
              characteristics.push(latestResult.number % 2 === 0 ? 'Par' : 'Ímpar');
              characteristics.push(latestResult.number <= 18 ? 'Baixo' : 'Alto');
            }
            
            const logMessage = `🎯 Resultado: ${latestResult.number} - ${characteristics.join(' - ')} (ID: ${latestResult.gameId}) [Polling]`;
            addWebSocketLog(userId, logMessage, 'game');
            
            // Log de polling-B removido - debug concluído
            await processGameResult(userId, latestResult.gameId, latestResult.number, colorCode);
          }
          
          // Atualizar último resultado processado
          operation.lastProcessedGameId = latestResult.gameId;
          
          // 🎯 NOVO: Atualizar histórico apenas quando há apostas pendentes
          const hasActiveBets = operation.waitingForResult && !!operation.lastGameId;
          
          if (hasActiveBets) {
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
      } else {

      }
    } else {

    }
  } catch (error: any) {
    // 🛡️ TRATAMENTO ROBUSTO: Não parar polling por erros de rede
    const isNetworkError = error.code === 'ECONNRESET' || 
                          error.code === 'ECONNREFUSED' || 
                          error.code === 'ETIMEDOUT' ||
                          error.message?.includes('fetch failed') ||
                          error.message?.includes('network') ||
                          error.message?.includes('timeout');
    
    if (isNetworkError) {
      // 🛡️ MONITORAMENTO: Rastrear erros de rede consecutivos
      if (!networkErrorCount[userId]) {
        networkErrorCount[userId] = { count: 0, lastReset: Date.now() };
      }
      
      networkErrorCount[userId].count++;
      
      // 🚨 ALERTA: Se muitos erros consecutivos em pouco tempo
      const timeSinceReset = Date.now() - networkErrorCount[userId].lastReset;
      if (networkErrorCount[userId].count >= 5 && timeSinceReset < 60000) {
        console.error(`🚨 [REDE] ${networkErrorCount[userId].count} erros de rede consecutivos para usuário ${userId} em ${Math.floor(timeSinceReset/1000)}s - possível problema de conectividade`);
        // Reset contador para evitar spam de logs
        networkErrorCount[userId] = { count: 0, lastReset: Date.now() };
      } else {
        console.warn(`🔄 [POLLING] Erro de rede ${networkErrorCount[userId].count} para usuário ${userId} - continuando polling: ${error.message}`);
      }
      // 🛡️ Para erros de rede, apenas log de aviso - polling continua
    } else {
      // 🎯 RESET: Erro não é de rede, resetar contador
      if (networkErrorCount[userId]) {
        networkErrorCount[userId] = { count: 0, lastReset: Date.now() };
      }
      console.warn(`⚠️ [POLLING] Erro ao verificar resultados para usuário ${userId}:`, error);
      // 🚨 Para outros erros, log mais detalhado mas também continua
    }
    
    // 🎯 CRÍTICO: Nunca parar o polling por causa de erros - sistema deve ser resiliente
  }
}

// 🔄 FUNÇÃO: Parar polling da URL/API
async function stopApiPolling(userId: string): Promise<void> {
  const operation = operationState[userId];
  if (!operation || !operation.apiPollingInterval) {
    return;
  }
  
  // Polling parado silenciosamente
  
  clearInterval(operation.apiPollingInterval);
  operation.apiPollingInterval = undefined;
}

// 🎯 FUNÇÃO: Determinar se deve fazer polling baseado no estado da operação
function shouldPollForResults(userId: string): boolean {
  const operation = operationState[userId];
  if (!operation) return false;
  
  // 🔥 PRIORIDADE 1: SEMPRE fazer polling se há aposta pendente (independente de operation.active)
  const hasActiveBets = operation.waitingForResult && !!operation.lastGameId;
  if (hasActiveBets) {
    return true; // ✅ GARANTIR polling para apostas pendentes
  }
  
  // 🔥 PRIORIDADE 2: Fazer polling se está monitorando trigger
  const isMonitoringTrigger = operation.active && operation.waitingForTrigger && !operation.triggerDetected;
  
  // 🔥 PRIORIDADE 3: Fazer polling se operação está ativa (qualquer estado)
  const isOperationActive = operation.active;
  
  // 🎯 NOVA LÓGICA: Polling ativo se há aposta pendente OU monitoramento OU operação ativa
  return hasActiveBets || isMonitoringTrigger || isOperationActive;
}

// 🔍 FUNÇÃO: Processar resultado do jogo com dupla validação
async function processGameResult(userId: string, gameId: string, number: number, color: string) {
  // Debug log removido - função estabilizada
  
  // ✅ PROTEÇÃO: Verificar se gameId já foi processado
  const operation = operationState[userId];
  if (operation?.lastProcessedGameId === gameId) {
    // Log de duplicação removido - proteção funcionando
    
    // 🚨 EXCEÇÃO: Se há aposta pendente para este gameId, processar mesmo assim
    if (operation.waitingForResult && operation.lastGameId === gameId) {
      // Log de debug removido - sistema funcionando
    } else if (operation.waitingForTrigger && !operation.triggerDetected) {
      // 🎯 EXCEÇÃO: Se aguardando trigger, processar para verificar trigger
      // Log de debug removido - sistema funcionando
    } else {
      // Log de ignorar duplicação removido
      return; // Ignorar resultado duplicado
    }
  }
  
        // ✅ ATUALIZAR lastProcessedGameId APENAS após processamento completo
      // Movido para o final da função para evitar ignorar apostas pendentes
      
        // Log de entrada removido - debug concluído
      
      // 🔍 DUPLA VALIDAÇÃO: Verificar e corrigir inconsistências
  const validation = validateAndCorrectColor(number, color);
  
  // 🔄 DESATIVADO: Log via WebSocket antigo - agora usa sistema unificado
  // addWebSocketLog(userId, validation.logMessage, 'info');
  
  // 🔧 USAR SEMPRE A COR CORRIGIDA
  const correctedColor = validation.correctedColor;
  const colorCode = number === 0 ? 'green' : (correctedColor === 'red' ? 'R' : 'B');
  
  // 🚫 REMOVIDO: Validação dupla via WebSocket
  // Agora os resultados são processados APENAS via URL/API polling
  
  // 💾 RECOVERY: Verificar se este resultado resolve uma aposta pendente
  // const operation = operationState[userId]; // Já declarado acima
  if (operation?.waitingForResult && operation.lastGameId === gameId) {
    // 🔄 RECOVERY: Resultado encontrado para aposta pendente (Game: ${gameId}) - Log removido
    
    // 🎯 NOVO: Log detalhado da aposta vs resultado
    const betColorName = operation.currentBetColor === 'R' ? 'VERMELHO' : 
                         operation.currentBetColor === 'B' ? 'PRETO' : 
                         operation.currentBetColor === 'E' ? 'PAR' : 
                         operation.currentBetColor === 'O' ? 'ÍMPAR' : 
                         operation.currentBetColor === 'L' ? 'BAIXAS (1-18)' : 
                         operation.currentBetColor === 'H' ? 'ALTAS (19-36)' : 'DESCONHECIDO';
    
    // 🎯 Aposta: ${betColorName} | Resultado: ${correctedColor.toUpperCase()} (${number}) - Log removido
    
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
    // 🔄 Processando resultado da aposta... - Log removido
  } else {
    // 🔍 LOG: Resultado processado silenciosamente para histórico
    // Removido logs excessivos para reduzir verbosidade
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
  
  // 🧹 Aplicar limite centralizado automaticamente
  if (gameResults[userId].length > MEMORY_LIMITS.MAX_GAME_RESULTS_PER_USER) {
    gameResults[userId] = gameResults[userId].slice(-MEMORY_LIMITS.MAX_GAME_RESULTS_PER_USER);
  }
  
  // Se for zero e há operação ativa, processa como derrota
  if (number === 0 && operationState[userId]?.active) {
    addWebSocketLog(userId, `🟢 Zero detectado: ${number} - processando como derrota`, 'game');
    await processOperationResult(userId, 'green', number);
    return;
  }
  
  // Se operação ativa, processa aposta ou detecção de trigger
  if (operationState[userId]?.active) {
    // Log de operação ativa removido
    
    // 🎯 PRIMEIRA PRIORIDADE: Verificar se há aposta pendente para processar resultado
    // Se há aposta pendente, processar resultado ANTES de verificar trigger
    
    // ✅ VERIFICAR: Se há aposta pendente para este gameId
    const hasActiveBet = operation && operation.waitingForResult && operation.lastGameId === gameId;
    
    if (hasActiveBet) {
      // 🎯 HÁ APOSTA PENDENTE: Processar resultado da aposta
      addWebSocketLog(userId, `🎯 Processando resultado da aposta: ${number} (${colorCode.toUpperCase()}) para gameId ${gameId}`, 'info');
      
      // 🚨 CORREÇÃO: Se acabou de fazer aposta imediata, resetar flag
      if (operation.justMadeImmediateBet) {
        operation.justMadeImmediateBet = false;
      }
      
      // Log de chamada processOperationResult removido
      await processOperationResult(userId, colorCode, number);
      return; // IMPORTANTE: Sair após processar aposta para não verificar trigger
    }
    
    // 🎯 SEGUNDA PRIORIDADE: Se não há aposta pendente, verificar se é trigger
    if (operation && operation.waitingForTrigger && !operation.triggerDetected) {
      // Logs de trigger removidos - sistema estabilizado
      const betType = operation.m4DirectBetType || 'await';
      const shouldTrigger = checkTriggerMatch(betType, colorCode, number);
      // Logs de trigger removidos - sistema estabilizado
      
      // 🔍 DEBUG: Logs removidos após correção do bug
      
      if (shouldTrigger) {
        operation.triggerDetected = true;
        operation.waitingForTrigger = false;
        
        const betTypeName = getBetTypeName(betType);
        addWebSocketLog(userId, `🎯 TRIGGER DETECTADO! ${betTypeName} saiu (${number})`, 'success');
        addWebSocketLog(userId, `💰 Preparando aposta para repetir ${betTypeName}`, 'info');
        
        // 🚨 CORREÇÃO CRÍTICA: Resultado que detecta trigger NÃO é usado como resultado da aposta
        // O sistema deve aguardar o PRÓXIMO resultado para processar a aposta
        addWebSocketLog(userId, `⏳ Resultado atual usado para trigger - aguardando próximo resultado para aposta`, 'info');
        return; // Sair sem processar como resultado da aposta
      } else {
        // 🔍 LOG: Trigger não detectado 
        // Logs de trigger removidos - sistema estabilizado
      }
    }
    
    // 🚨 VERIFICAÇÃO ESPECIAL: Se havia justMadeImmediateBet mas não há aposta pendente
    if (operation && operation.justMadeImmediateBet) {
      // 🛡️ PROTEÇÃO: Se waitingForResult = false, significa que aposta foi cancelada (ex: erro 1007)
      if (!operation.waitingForResult) {
        addWebSocketLog(userId, `🚫 Aposta foi cancelada - ignorando resultado ${gameId}`, 'info');
        operation.justMadeImmediateBet = false; // Resetar flag
        return; // Ignorar este resultado
      }
      
      // 🔄 Este resultado não corresponde à aposta - ignorar
      addWebSocketLog(userId, `⏳ Resultado ${gameId} não corresponde à aposta ${operation.lastGameId} - ignorando`, 'info');
      operation.justMadeImmediateBet = false; // Resetar flag
      return; // Ignorar este resultado
    }
  } else {
    // Log de operação inativa removido
  }
  
  // ✅ ATUALIZAR lastProcessedGameId APENAS NO FINAL, após processamento completo
  if (operation) {
    operation.lastProcessedGameId = gameId;
    // Log de marcar gameId removido
  }
}

// 🔍 FUNÇÃO: Verificar se aposta ganhou baseada no tipo de aposta
function checkBetWin(betColor: 'R' | 'B' | 'E' | 'O' | 'L' | 'H' | 'AWAIT', resultColor: string, resultNumber: number): boolean {
  // Zero sempre perde (exceto se apostou diretamente no zero)
  if (resultNumber === 0) {
    return false;
  }
  
  // Debug checkBetWin removido - funcionando corretamente
  
  switch (betColor) {
    case 'AWAIT': // Aguardar - não há aposta
      return false;
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

  // Debug log removido - função estabilizada
  
  const operation = operationState[userId];
  if (!operation || !operation.active || !operation.strategy?.sequences) {
    addWebSocketLog(userId, `❌ Estado da operação inválido para processar resultado - active: ${operation?.active}, strategy: ${!!operation?.strategy}`, 'error');
    return;
  }

  // 🎲 CORREÇÃO: Usar cor da aposta armazenada
  const betColor = operation.currentBetColor;
  
  // Debug log removido - função estabilizada
  
  if (!betColor) {
    // 🎯 NOVO: Verificar se é monitoramento normal ou erro real
    if (operation.waitingForTrigger && !operation.triggerDetected) {
      // Durante monitoramento, não é erro - sistema está funcionando corretamente
      // Debug log removido
      return;
    }
    
    // 🚨 CRÍTICO: Se não há aposta ativa, não processar resultado
    // Debug log removido
    return;
  }
  
  // 🚨 VERIFICAÇÃO CRÍTICA: Só processar se realmente há aposta pendente
  if (!operation.waitingForResult) {
    // 🔍 DEBUG: Explicar por que não há aposta pendente
    if (operation.justMadeImmediateBet === false && operation.lastGameId) {
      // Debug log removido
    } else {
      // Debug log removido
    }
    return;
  }
  
  // 🔍 LOG: Informar que o resultado está sendo processado
  addWebSocketLog(userId, `🔍 Processando resultado: ${resultColor} (${resultNumber}) vs Aposta: ${betColor}`, 'info');
  
  // Log de tipos de aposta removido - debug concluído
  
  // Log de estado da operação removido - debug concluído
  
  // ✅ NOVA LÓGICA: Verificar vitória baseada no tipo de aposta
  const isWin = checkBetWin(betColor, resultColor, resultNumber);
  
  // Debug log removido - validação funcionando
  
  // ✅ CORREÇÃO: Determinar modo baseado nos contadores, não na propriedade mode
  const isRealMode = canExitAnalysisMode(userId);
  
  // ✅ CORREÇÃO: Só conta estatísticas no modo REAL, não na análise (simulação)
  if (isRealMode) {
    operation.stats.totalBets++;
  }
  
  // ✅ CRÍTICO: Liberar estado "aguardando resultado" IMEDIATAMENTE
  const wasWaitingForResult = operation.waitingForResult;
  operation.waitingForResult = false;
  
  // 🔄 REMOVIDO: Sistema unificado nunca para o polling
  // Polling continua sempre ativo para manter logs e card atualizados
  
  // 🔍 LOG: Confirmar que o estado foi liberado
  if (wasWaitingForResult) {
    // ✅ Estado "aguardando resultado" liberado para próxima aposta - Log removido
  }
  
  // ✅ NOVA ESTRATÉGIA: Obter valor baseado no modo (simulado ou real)
  let betAmount = operation.lastBetAmount;
  // Debug log removido
  
  if (!betAmount) {
    // Fallback: calcular dinamicamente se não foi armazenado
    const currentLevel = STAKE_LEVELS[operation.currentLevel - 1] || STAKE_LEVELS[0];
    const multiplier = operation.stakeMultiplier || 1;
    
    betAmount = currentLevel.m2 * multiplier; // Sempre valor real na repetição inteligente
    // Debug log removido
  }
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
    // ✅ GANHOU - NOVA ESTRATÉGIA: Repetição Inteligente
    // Debug log removido
    
    if (isRealMode) {
      operation.stats.wins++;
      operation.stats.profit += betAmount;
    }
    
    addWebSocketLog(userId, `✅ APOSTA GANHOU! Lucro de R$ ${betAmount.toFixed(2)}`, 'success');
    addWebSocketLog(userId, `💰 🎯 MISSÃO CUMPRIDA!`, 'success');
    
    // 🔥 CORREÇÃO: NÃO desativar operação após missão cumprida - continuar monitorando
    // operation.active = false; // ❌ REMOVIDO: Isso estava causando desconexão
    operation.missionCompleted = true;
    operation.waitingForTrigger = true; // Reset para próxima operação
    operation.triggerDetected = false;
    
    // 🔥 ATUALIZAR: Timestamp para evitar limpeza automática após missão cumprida
    if (operation.stats) {
      operation.stats.startedAt = Date.now(); // Atualizar como se fosse nova operação
    }
    
    console.log('🚨 [BACKEND] Estados após vitória:', {
      active: operation.active, // Permanece true para continuar monitoramento
      missionCompleted: operation.missionCompleted,
      waitingForTrigger: operation.waitingForTrigger,
      timestamp: new Date().toLocaleTimeString()
    });
    
    addWebSocketLog(userId, `✅ Operação finalizada com sucesso - Lucro garantido!`, 'success');
    
    // 🤖 NOVO: Retornar automaticamente ao modo aguardar para próximo candidato
    operation.m4DirectBetType = 'await';
    
    // 🔥 CRÍTICO: Definir waitingForTrigger = false para modo await (polling continua com isOperationActive)
    operation.waitingForTrigger = false;
    operation.triggerDetected = false;
    
    // ✅ RESETAR: Permitir log "Modo aguardar ativo" após missão cumprida
    awaitModeLogShown[userId] = false;
    console.log('🎯 [BACKEND] Missão cumprida - m4DirectBetType definido como await, operation.active=true (mantida ativa para monitoramento)');
    
    return;
  } else {
    // ❌ PERDEU - NOVA ESTRATÉGIA: Repetição Inteligente
    // Debug log removido
    
    const resultCharacteristics = getNumberCharacteristics(resultNumber);
    addWebSocketLog(userId, `🎲 Resultado: ${resultCharacteristics}`, 'info');
    
    if (isRealMode) {
      operation.stats.losses++;
      operation.stats.profit -= betAmount;
    }
    
    addWebSocketLog(userId, `❌ APOSTA PERDEU! Prejuízo de -R$ ${betAmount.toFixed(2)}`, 'error');
    
    // Avançar para próximo nível
    const nextLevelIndex = operation.currentLevel;
    if (nextLevelIndex < STAKE_LEVELS.length) {
      operation.currentLevel = nextLevelIndex + 1;
      operation.waitingForTrigger = true; // Volta para aguardar trigger
      operation.triggerDetected = false;
      
      const nextLevel = STAKE_LEVELS[operation.currentLevel - 1];
      const multiplier = operation.stakeMultiplier || 1;
      const multiplierText = multiplier > 1 ? ` (${multiplier}x)` : '';
      addWebSocketLog(userId, `⬆️ Avançando para Nível ${operation.currentLevel} → Aguardando próximo trigger`, 'info');
      addWebSocketLog(userId, `💰 Próxima aposta será: R$ ${(nextLevel.m2 * multiplier).toFixed(2)}${multiplierText}`, 'info');
      
      // 🔍 DEBUG: Log do estado após derrota
      // Logs de debug removidos - sistema estabilizado
      
      // 🚀 NOVO: Garantir que o polling continue após a derrota
      await startApiPolling(userId);
    } else {
      // Chegou no último nível (12) - Aceitar prejuízo e finalizar
      addWebSocketLog(userId, `⚠️ Último nível atingido (${STAKE_LEVELS.length}) - Aceitando prejuízo e finalizando operação`, 'error');
      addWebSocketLog(userId, `❌ Operação finalizada com prejuízo - Todos os níveis foram tentados`, 'error');
      
      operation.active = false;
      operation.missionCompleted = false; // Missão não cumprida
      operation.currentLevel = 1; // Reset para próxima operação
      operation.waitingForTrigger = true; // Reset para próxima operação
      operation.triggerDetected = false;
      
      // 🤖 NOVO: Retornar automaticamente ao modo aguardar para próximo candidato
      operation.m4DirectBetType = 'await';
      // ✅ RESETAR: Permitir log "Modo aguardar ativo" após finalização
      awaitModeLogShown[userId] = false;
      // Debug removido - sistema funcionando
      
      return;
    }
  }
}

// Função generateRedBet removida - era redundante (sempre retornava 'R')
  
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

    // 🔧 MODIFICADO: Log para sistema programado removido
    // addWebSocketLog(userId, `🔄 Renovando sessão programada (tentativa ${session.renewalAttempts + 1}/${session.maxRenewalAttempts})`, 'info');
    // addWebSocketLog(userId, `⏰ Última renovação: ${new Date(session.lastRenewal).toLocaleTimeString()}`, 'info');
    
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

      // Log removido: Edge Function chamada é silenciosa
      
      // 🔄 USAR SISTEMA DE RETRY para Edge Function
      const authResponse = await retryBlazeRequest(async () => {
        return await fetch('https://pcwekkqhcipvghvqvvtu.supabase.co/functions/v1/blaze-auth', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
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

      // 🔧 NOVO: Log detalhado da resposta da Edge Function removido
      // addWebSocketLog(userId, `📡 Edge Function respondeu com status: ${authResponse.status}`, 'info');

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente
        const simplifiedError = simplifyBlazeError(errorText, authResponse.status);
        addWebSocketLog(userId, `❌ ${simplifiedError}`, 'error');
        
        // 🔧 NOVO: Verificar se é erro de bloqueio geográfico ou rate limit
        if (authResponse.status === 451) {
          addWebSocketLog(userId, '🌍 Erro 451: Bloqueio geográfico detectado', 'error');
        } else if (authResponse.status === 429) {
          addWebSocketLog(userId, '⏰ Erro 429: Rate limit - aguardando próxima janela de renovação', 'error');
        }
        
        return false;
      }

      const authResult = await authResponse.json();
      
      // 🔧 NOVO: Log detalhado da resposta removido
      // addWebSocketLog(userId, `📋 Edge Function retornou: ${authResult.success ? 'SUCCESS' : 'FAILED'}`, 'info');
      
      if (!authResult.success || !authResult.data) {
        // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente
        const rawError = authResult.error || 'Resposta inválida';
        const simplifiedError = simplifyBlazeError(rawError, 422);
        addWebSocketLog(userId, `❌ ${simplifiedError}`, 'error');
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
      
      // Logs removidos: renovação é silenciosa
      // addWebSocketLog(userId, '✅ Sessão renovada com sucesso - reconectando WebSocket', 'success');
      // addWebSocketLog(userId, `🔗 jsessionId: ${authResult.data.jsessionId.substring(0, 10)}...`, 'info');
      
      // 🔄 CRÍTICO: Reconectar WebSocket com novo jsessionId
      if (activeWebSockets[userId]) {
        // Log removido: reconexão silenciosa
        // addWebSocketLog(userId, '🔄 Reconectando WebSocket com novo jsessionId...', 'info');
        
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
          addWebSocketLog(userId, '✅ Conexão renovada com sucesso', 'success');
          addWebSocketLog(userId, '✅ Conexão estável', 'success');
        }, 1000);
      }
      
      // ⏰ Mostrar próximo horário de renovação automática removido
      // const renewal = autoRenewal[userId];
      // if (renewal) {
      //   const nextRenewal = new Date(renewal.nextRenewalTime).toLocaleTimeString();
      //   addWebSocketLog(userId, `⏰ Próxima renovação automática: ${nextRenewal}`, 'info');
      // }
      
      return true;

    } catch (edgeFunctionError) {
      const errorMessage = edgeFunctionError instanceof Error ? edgeFunctionError.message : 'Erro desconhecido';
      // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente  
      const simplifiedError = simplifyBlazeError(errorMessage, 422);
      addWebSocketLog(userId, `❌ ${simplifiedError}`, 'error');
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
async function connectToBettingGame(userId: string, tipValue?: number, clientIP?: string, userFingerprint?: any, clientHeaders?: any, authTokens?: { ppToken: string; jsessionId: string; pragmaticUserId: string }, forceClientSideAuth?: boolean, customMartingaleSequence?: number[], stakeBased?: boolean, m4DirectBetType?: 'await' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high', isStandbyMode?: boolean) {
  try {
    // 🚀 OTIMIZAÇÃO: Conexão mais eficiente com menos logs
    addWebSocketLog(userId, '🔗 Conectando...', 'info');
    
    // Limpar status anterior e parar conexões existentes (preservando sessão se existir)
    const hasExistingSession = sessionControl[userId] != null;
    if (!hasExistingSession) {
      stopAllConnections(userId, false, hasExistingSession);
      resetReconnectionControl(userId);
    }
    
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

    // 🚀 OTIMIZAÇÃO: Autenticação silenciosa
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

    // 🚀 OTIMIZAÇÃO: Log único de sucesso
    addWebSocketLog(userId, '✅ Autenticado com sucesso', 'success');

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
          // ✅ Calcular sequência baseada no tipValue usando os níveis
    const findLevelByStake = (stake: number) => {
      return STAKE_LEVELS.find(l => l.m1 === stake) || STAKE_LEVELS[0];
      };

    const level = findLevelByStake(tipValue || 1.00);
    calculatedSequence = [level.m1, level.m2];
    strategyLabel = `Nível ${level.level} - M1: R$ ${level.m1.toFixed(2)} | M2: R$ ${level.m2.toFixed(2)}`;
      // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, `🎯 Estratégia ${strategyLabel}`, 'info');
    }

    const strategy = {
      sequences: calculatedSequence,
      maxMartingale: 4
    };

    // Sistema simplificado
    
    // Inicializar estados (Nova Lógica de Aquecimento)
    gameResults[userId] = [];
    isFirstConnection[userId] = true; // Marcar como primeira conexão
    
    // 🔍 NOVA LÓGICA: Preservar nível atual e multiplicador se existir
    const existingLevel = operationState[userId]?.currentLevel || 1;
    const existingMultiplier = operationState[userId]?.stakeMultiplier || 1;
    
    operationState[userId] = {
    active: false,
    martingaleLevel: 0,
    waitingForResult: false,
    currentBetColor: undefined,
    lastBetAmount: undefined,
    
    strategy: {
      sequences: calculatedSequence,
      maxMartingale: 2
    },
    // 🚀 NOVA LÓGICA: Sistema de níveis fixos
    currentLevel: existingLevel,
    stakeMultiplier: existingMultiplier, // Preservar multiplicador existente
    stats: {
      totalBets: 0,
      wins: 0,
      losses: 0,
      profit: 0,
      startedAt: Date.now()
    },
    // 🔥 NOVO: Campo para M4 Direto
    m4DirectBetType: m4DirectBetType || 'await',
    // 🎯 NOVA ESTRATÉGIA: Repetição Inteligente
    waitingForTrigger: true, // Inicia aguardando trigger
    triggerDetected: false // Trigger não detectado
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
    // 🚀 INICIALIZAÇÃO RÁPIDA: Criar estado limpo otimizado
    console.log('🧹 Inicializando estado otimizado para usuário:', userId);
    
    // 🔧 CORREÇÃO: Preservar multiplicador existente antes de recriar estado
    const existingMultiplier = operationState[userId]?.stakeMultiplier || 1;
    
    // Criar estado limpo sem lógica pesada
    operationState[userId] = {
      active: true,
      martingaleLevel: 0,
      waitingForResult: false,
      currentBetColor: undefined,
      lastBetAmount: undefined,
      missionCompleted: false,
      strategy: {
        sequences: [0.5, 1],
        maxMartingale: 2
      },
      currentLevel: 1,
      stakeMultiplier: existingMultiplier,
      stats: {
        totalBets: 0,
        wins: 0,
        losses: 0,
        profit: 0,
        startedAt: Date.now()
      },
      m4DirectBetType: 'await',
      // 🎯 NOVA ESTRATÉGIA: Repetição Inteligente
      waitingForTrigger: true, // Inicia aguardando trigger
      triggerDetected: false // Trigger não detectado
    };
    
    // ✅ LOGS ESSENCIAIS: Apenas logs necessários
    if (!websocketLogs[userId]) websocketLogs[userId] = [];
    
    addWebSocketLog(userId, '🚀 Iniciando operações...', 'success');
    
    
    // 🔢 NOVO: Log do multiplicador aplicado
    const appliedMultiplier = operationState[userId]?.stakeMultiplier || 1;
    
    
    // 🔄 LIMPAR: Apenas controles necessários
    awaitModeLogShown[userId] = false;
    shouldTryImmediateBet[userId] = false;
    
    // 🚀 NOVO: Iniciar polling para processar resultados
    await startApiPolling(userId);
    
    // ✅ VERIFICAÇÃO: Não apostar se missão já foi cumprida
    if (operationState[userId]?.missionCompleted) {
      addWebSocketLog(userId, `🛡️ Missão cumprida - não executando apostas automáticas`, 'info');
      return NextResponse.json({
        success: true,
        data: {
          operationActive: true, // 🔥 MANTÉM true para não desconectar frontend
          missionCompleted: true,
          message: 'Missão cumprida - aguardando novo tipo de aposta'
        }
      });
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
      operationState[userId].lastBetAmount = undefined; // ✅ NOVO: Limpar valor da aposta
      // 🎯 NOVO: Resetar flag de missão cumprida quando usuário para manualmente
      operationState[userId].missionCompleted = false;
    }
    
    // 🚀 NOVO: Limpar flag de aposta imediata
    shouldTryImmediateBet[userId] = false;
    
    // 🔄 NOVO: Limpar controle de log do modo aguardar
    awaitModeLogShown[userId] = false;
    
    // 🔄 PARAR: Polling da URL/API
    stopApiPolling(userId);
    
    // 🕐 LIMPEZA: Timers específicos do usuário
    cleanupUserTimers(userId);
    
    // 🧹 LIMPEZA: Arrays do usuário para prevenir acúmulo
    const itemsRemoved = cleanupUserArrays(userId);
    if (itemsRemoved > 0) {
      console.log(`🧹 [CLEANUP] ${itemsRemoved} items antigos removidos para usuário ${userId.substring(0, 8)}...`);
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
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
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
      // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente
      const simplifiedError = simplifyBlazeError(errorText, authResponse.status);
      addWebSocketLog(userId, `❌ ${simplifiedError}`, 'error');
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
              addWebSocketLog(userId, '💀 Conexão morta detectada - reconectando...', 'error');
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
                      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
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
                  // 🔧 USAR NOVA FUNÇÃO para simplificar erro de saldo insuficiente
                  const simplifiedError = simplifyBlazeError(errorText, authResponse.status);
                  addWebSocketLog(userId, `❌ ${simplifiedError}`, 'error');
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
            
            // 🎯 CRÍTICO: Armazenar gameId atual das apostas abertas
            currentBettingGameId[userId] = gameId;
            
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
                addWebSocketLog(userId, `🛡️ Missão cumprida - não executando apostas automáticas`, 'info');
                return; // Não apostar se missão cumprida
              }
              

              
              const isRealMode = canExitAnalysisMode(userId);
              const currentMode = isRealMode ? 'real' : 'analysis';
              // Log removido: informação técnica desnecessária
      // addWebSocketLog(userId, `🎯 Operação ativa detectada - executando aposta automaticamente (modo: ${currentMode})`, 'success');
              
              // 🎯 CORRIGIDO: Só apostar quando trigger foi detectado
              const operation = operationState[userId];
              if (operation && operation.triggerDetected) {
                // Limpar flag de aposta imediata
                if (shouldTryImmediateBet[userId]) {
                  shouldTryImmediateBet[userId] = false;
                }
                
                addWebSocketLog(userId, `🎯 APOSTAS ABERTAS + TRIGGER DETECTADO → Executando aposta`, 'success');
                executeSimpleBet(userId, gameId, ws);
              } else {
                        // 🔍 LOG: Explicar por que não está apostando  
        const currentBetType = operation?.m4DirectBetType || 'await';
        const betTypeName = getBetTypeName(currentBetType);
        addWebSocketLog(userId, `⏳ Apostas abertas, mas aguardando trigger ${betTypeName} (tipo: ${currentBetType})`, 'info');
              }
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
            
            // 🚨 TRATAMENTO ESPECIAL: Erros que cancelam a operação
            const cancelOperationErrors = ['1007']; // Apostas fechadas
            
            if (cancelOperationErrors.includes(errorCode)) {
              let errorMessage = '';
              
              switch (errorCode) {
                case '1007':
                  errorMessage = '⚠️ Apostas já fechadas - não deu tempo para apostar';
                  break;
                default:
                  errorMessage = `⚠️ Erro crítico de aposta (${errorCode})`;
              }
              
              addWebSocketLog(userId, errorMessage, 'error');
              addWebSocketLog(userId, `🔄 Voltando ao modo aguardar para próxima oportunidade`, 'info');
              
              // 🎯 CANCELAR operação pendente
              if (operationState[userId]) {
                operationState[userId].waitingForResult = false;
                operationState[userId].justMadeImmediateBet = false;
                operationState[userId].m4DirectBetType = 'await';
                
                // 🔥 CRÍTICO: Definir waitingForTrigger = false para modo await (polling continua com isOperationActive)
                operationState[userId].waitingForTrigger = false;
                operationState[userId].triggerDetected = false;
                
                addWebSocketLog(userId, `🛡️ Operação cancelada devido ao erro ${errorCode}`, 'info');
              }
              
              return; // Não processar mais esta mensagem
            } else {
              addWebSocketLog(userId, `⚠️ Erro de validação de aposta (code ${errorCode}): ${message}`, 'error');
            }
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

        // ⏰ Verificação de renovação automática - COM RATE LIMITING
        // 🔧 CORREÇÃO: Só verificar renovação se não há uma renovação em andamento E respeitar rate limiting
        if (!renewalInProgress[userId] && shouldRenewAutomatically(userId) && canAttemptRenewal(userId)) {
          renewalInProgress[userId] = true;
          addWebSocketLog(userId, '🔄 Iniciando renovação automática programada...', 'info');
          
          setTimeout(async () => {
            const renewed = await renewSession(userId);
            
            // 🔧 NOVO: Registrar resultado da renovação
            recordRenewalResult(userId, renewed);
            
            if (renewed) {
              // Reativar operação se estava pausada
              if (operationState[userId] && !operationState[userId].active) {
                operationState[userId].active = true;
                addWebSocketLog(userId, '▶️ Operação reativada após renovação automática', 'success');
              }
            } else {
              addWebSocketLog(userId, '❌ Falha na renovação automática', 'error');
            }
            
            // Liberar flag de renovação em andamento
            renewalInProgress[userId] = false;
          }, 2000);
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
  'await': 'AGUARDAR',
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
  'AWAIT': 'AGUARDAR',
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
            addWebSocketLog(userId, `❌ Erro crítico na conexão: ${socketError.message}`, 'error');
            
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

// 🎯 FUNÇÃO PRINCIPAL: Executar apostas (ESTA É A FUNÇÃO PRINCIPAL)
// Responsável por: validar condições, gerar tipos, executar apostas, gerenciar Martingale
async function executeSimpleBet(userId: string, gameId: string, ws: any) {
  const operation = operationState[userId];
  if (!operation || !operation.active || !operation.strategy?.sequences) {
    addWebSocketLog(userId, '❌ Estado da operação inválido ou incompleto', 'error');
    return;
  }
  
  // 🎯 VERIFICAÇÃO CRÍTICA: Não apostar se missão foi cumprida
  if (operation.missionCompleted) {
    addWebSocketLog(userId, '🛡️ Missão já cumprida - sistema protegido contra apostas automáticas', 'info');
    addWebSocketLog(userId, '🎯 MISSÃO CUMPRIDA - Lucro garantido!', 'success');
    addWebSocketLog(userId, '💡 Use "Parar Operação" e "Iniciar Operação" para resetar se necessário', 'info');
    return;
  }
  
  // 🎯 VERIFICAÇÃO ADICIONAL: Não apostar se operação não estiver ativa
  if (!operation.active) {
    addWebSocketLog(userId, '🛡️ Operação não está ativa - não executando apostas', 'info');
    return;
  }
  

  
  // Função redundante generateRedBet removida
  
  // 🎲 NOVO: Usar função atualizada que suporta modo M4 direto
  const betColor = generateBet(userId);
  
  // 🔥 NOVO: Verificar se está em modo aguardar
  if (betColor === 'AWAIT') {
    // Só mostrar log uma vez para evitar repetição
    if (!awaitModeLogShown[userId]) {
      // Debug removido - sistema funcionando
      addWebSocketLog(userId, '⏳ Modo aguardar ativo - Conectado mas não apostando', 'info');
      awaitModeLogShown[userId] = true;
    }
    return;
  }

  // ⏰ NOVA LÓGICA SIMPLIFICADA: Sistema de janela de 10s no frontend
  // A lógica de timing agora é controlada pelo frontend com janela de 10 segundos
  // Não precisamos mais da complexa verificação de trigger aqui
  
  // 🔍 DEBUG: Log quando vai apostar (removido para não poluir)
  
  // 🔥 NOVO: Log para debug do modo M4 direto
  if (operation.m4DirectBetType) {
    // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `🔥 MODO M4 DIRETO ATIVO - Apostando em ${COLOR_NAMES[betColor]}`, 'info');
  }
  
  // ✅ CORREÇÃO: Armazenar cor da aposta atual no estado da operação
  operation.currentBetColor = betColor as 'R' | 'B' | 'E' | 'O' | 'L' | 'H';
  
  // ✅ NOVA LÓGICA: Stakes fixas por nível com multiplicador
  let betAmount: number;
  const currentLevel = STAKE_LEVELS[operation.currentLevel - 1] || STAKE_LEVELS[0];
  const multiplier = operation.stakeMultiplier || 1;
  
  
  
  // 🎯 NOVA ESTRATÉGIA: Repetição Inteligente - Sempre valor real
  betAmount = currentLevel.m2 * multiplier;
  
  
  // ✅ NOVO: Armazenar valor real da aposta
  operation.lastBetAmount = betAmount;
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
    
    // 🎯 NOVA ESTRATÉGIA: Repetição Inteligente - Sempre aposta real
    // 🚨 VERIFICAÇÃO CRÍTICA: WebSocket deve estar OPEN para enviar apostas
    if (wsState !== 1) { // 1 = OPEN
              addWebSocketLog(userId, `❌ Conexão não está disponível! Estado: ${stateNames[wsState] || 'UNKNOWN'}`, 'error');
      return;
    }
    
    const betXml = `<command channel="table-mrbras531mrbr532">
  <lpbet gm="roulette_desktop" gId="${gameId}" uId="${pragmaticUserId}" ck="${timestamp}">
    <bet amt="${betAmount}" bc="${betCode}" ck="${timestamp}" />
  </lpbet>
</command>`;

    // 🚀 NOVO: Verificar se é gameId temporário para ajustar mensagem
    const isTemporaryGameId = gameId.startsWith('temp_');
    
    // Log da mensagem XML que será enviada
    // Log removido: informação técnica desnecessária
  // addWebSocketLog(userId, `📤 Enviando XML: ${betXml.replace(/\n/g, ' ').replace(/\s+/g, ' ')}`, 'info');
          
    // 📤 Enviar aposta com sistema de fallback robusto
    const sendResult = await sendWebSocketMessage(ws, betXml, userId);
    if (!sendResult.success) {
      if (isTemporaryGameId) {
        addWebSocketLog(userId, `⚠️ Tentativa de aposta fora do período - aguardando próxima rodada`, 'error');
      } else {
        addWebSocketLog(userId, `❌ Falha ao enviar aposta: ${sendResult.error}`, 'error');
      }
      return;
    }
    
    // ✅ SUCESSO: Aposta real enviada com sucesso
    operation.waitingForResult = true;
    operation.lastGameId = gameId;
    
    // 🔍 DEBUG: Confirmar estado após aposta
    addWebSocketLog(userId, `🔍 Aposta enviada - Estado: waitingForResult=true, lastGameId=${gameId}`, 'info');
    
    // 🔄 NOVO: Iniciar polling quando aposta é feita
    await startApiPolling(userId);
    
    // Log removido: informação técnica desnecessária
    // addWebSocketLog(userId, `✅ Aposta enviada com sucesso via WebSocket!`, 'success');
    const modeLabel = '💰 REAL';
    
    // 🚀 NOVO: Incrementar contador de progressão e obter status
    // 🚀 REMOVIDO: Progressão automática removida
    const progressionText = '';
    
    // ✅ NOVA LÓGICA: Mostrar qual tipo de aposta
    const betType = operation.martingaleLevel === 0 ? 
      `M1 (Nível ${operation.currentLevel})` : 
      `M2 (Nível ${operation.currentLevel})`;
    
    const multiplierText = multiplier > 1 ? ` | ${multiplier}x` : '';
    
    // 🎯 NOVO: Mostrar progresso da missão
    if (operation.martingaleLevel === 1) {
      addWebSocketLog(userId, `🎯 MISSÃO EM ANDAMENTO: Apostando M2 - Se ganhar = MISSÃO CUMPRIDA!`, 'info');
    }
    
    // 🔢 NOVO: Log do multiplicador sendo aplicado na aposta
    if (multiplier > 1) {
      addWebSocketLog(userId, `🔢 Multiplicador ${multiplier}x aplicado - Valor base: R$ ${(betAmount / multiplier).toFixed(2)} → Valor final: R$ ${betAmount.toFixed(2)}`, 'info');
    }
    
    if (isTemporaryGameId) {
      addWebSocketLog(userId, `🎯 Aposta enviada: R$ ${betAmount.toFixed(2)} no ${colorName} [${betType}${multiplierText}] (tentativa imediata)${progressionText}`, 'game');
    } else {
      addWebSocketLog(userId, `🎯 Aposta realizada: R$ ${betAmount.toFixed(2)} no ${colorName} [${betType}${multiplierText}]${progressionText}`, 'game');
    }
    
    // ✅ NOVO: Marcar timestamp da primeira aposta após conexão
    if (!firstBetTimestamp[userId]) {
      firstBetTimestamp[userId] = Date.now();
    }
    
    // 🎯 NOVA LÓGICA: Verificar se precisa renovar e aproveitar momento pós-aposta
    if (shouldRenewAfterBet(userId)) {
      setTimeout(async () => {
        const renewed = await renewSession(userId);
        if (renewed) {
          addWebSocketLog(userId, '✅ Conexão renovada com sucesso', 'success');
          addWebSocketLog(userId, '✅ Conexão estável', 'success');
        } else {
          addWebSocketLog(userId, '❌ Falha na renovação pós-aposta', 'error');
        }
      }, 1000); // Aguardar 1s para aposta ser processada
    }
    
    // 💰 NOVA ESTRATÉGIA: Sempre debitar créditos (apostas reais)
    if (betAmount > 0) {
      await debitUserCredits(userId, betAmount);
      addWebSocketLog(userId, `💳 Créditos debitados: R$ ${betAmount.toFixed(2)}`, 'info');
    }

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
  
  // Mostrar sempre informações normais do resultado
  const colorName = expectedColor === 'red' ? 'Vermelho' : expectedColor === 'black' ? 'Preto' : 'Verde';
  const parity = number === 0 ? '' : (number % 2 === 0 ? ' - Par' : ' - Ímpar');
  const range = number === 0 ? '' : (number <= 18 ? ' - Baixo' : ' - Alto');
  
  const logMessage = `🎯 Resultado: ${number} - ${colorName}${parity}${range}`;
  
  return {
    correctedColor: expectedColor,
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
    // ✅ VALIDAÇÃO: Verificar se as variáveis de ambiente estão configuradas
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ [DEBIT-CONFIG] Variáveis de ambiente do Supabase não configuradas');
      return false;
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    // 🔍 NOVO: Salvar nível atual e multiplicador antes do reset
    const savedLevel = operationState[userId].currentLevel || 1;
    const savedMultiplier = operationState[userId].stakeMultiplier || 1;
    
    operationState[userId].active = false;
    operationState[userId].waitingForResult = false;
    operationState[userId].currentBetColor = undefined;
    operationState[userId].lastBetAmount = undefined;
    operationState[userId].martingaleLevel = 0;
    
    // 🔍 NOVO: Restaurar nível e multiplicador após reset
    operationState[userId].currentLevel = savedLevel;
    operationState[userId].stakeMultiplier = savedMultiplier;
    
    // 🎯 NOVO: Manter flag de missão cumprida (não resetar automaticamente)
    // O usuário precisa iniciar nova operação para resetar
  }

  // Resetar dados de análise
  resetAnalysisCounters(userId);
  
  // 🔄 NOVO: Limpar controle de log do modo aguardar
  awaitModeLogShown[userId] = false;
  
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
  
  // 🚀 NOVO: Limpar flag de aposta imediata
  shouldTryImmediateBet[userId] = false;

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
    // 🔧 REMOVIDO: pendingStake não existe mais na nova lógica
    
  }
  
  // Fechar WebSocket
  if (activeWebSockets[userId]) {
    try {
      activeWebSockets[userId].ws.close();
      // Log removido: informação técnica desnecessária
      // addWebSocketLog(userId, `🔌 WebSocket fechado`, 'info');
    } catch (error) {
              addWebSocketLog(userId, `⚠️ Erro ao fechar conexão: ${error}`, 'error');
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
  
  // 🚀 NOVO: Limpar flag de aposta imediata
  shouldTryImmediateBet[userId] = false;
  
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
          m4DirectBetType: operation.m4DirectBetType || 'await',
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
        martingaleUsage: [0, 0],
        // 📊 Estatísticas de rodadas analisadas por nível (sistema simplificado)
        analysisRounds: [0, 0],
        // 📋 Histórico detalhado de análises e apostas reais
        detailedHistory: getDetailedHistory(userId),
        // 🚀 NOVO: Operation report incluído para otimizar requisições
        operationReport: operationReport,
              // 🔧 NOVA LÓGICA: Informação sobre níveis fixos com multiplicador
      levelInfo: {
        currentLevel: operation?.currentLevel || 1,
        currentLevelData: (() => {
          const baseLevel = STAKE_LEVELS[operation?.currentLevel - 1] || STAKE_LEVELS[0];
          const multiplier = operation?.stakeMultiplier || 1;
          return {
            ...baseLevel,
            m1: baseLevel.m1 * multiplier,
            m2: baseLevel.m2 * multiplier,
            cost: baseLevel.cost * multiplier
          };
        })(),
        stakeMultiplier: operation?.stakeMultiplier || 1,
        expectedProfit: (operation?.stakeMultiplier || 1) * 2, // Lucro fixo: multiplicador × R$ 2,00
        totalLevels: STAKE_LEVELS.length
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

    // 🔥 OPERAÇÃO ATIVA: true se operação existe (mesmo com missão cumprida)
    const operationActive = !!operation;
    
    return NextResponse.json({
      success: true,
      data: {
        connected: status.connected,
        lastUpdate: status.lastUpdate,
        error: status.error,
        resultsCount: results.length,
        operationActive,
        missionCompleted: operation?.missionCompleted || false,
        operationState: operation ? {
          m4DirectBetType: operation.m4DirectBetType || 'await',
          missionCompleted: operation.missionCompleted || false,
          active: operation.active || false,
          waitingForResult: operation.waitingForResult || false
        } : null
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

// 🎲 FUNÇÃO AUXILIAR: Gerar tipo de aposta baseado no ciclo selecionado (await/red/black/etc)
// Converte o tipo selecionado (m4DirectBetType) em código de aposta para executeSimpleBet
function generateBet(userId: string): 'R' | 'B' | 'E' | 'O' | 'L' | 'H' | 'AWAIT' {
  const operation = operationState[userId];
  if (!operation) return 'R';
  
  // 🔥 NOVO: Sistema simplificado - sempre apostar no tipo configurado
  const betType = operation.m4DirectBetType || 'red';
  
  switch (betType) {
    case 'await': return 'AWAIT';
    case 'red': return 'R';
    case 'black': return 'B';
    case 'even': return 'E';
    case 'odd': return 'O';
    case 'low': return 'L';
    case 'high': return 'H';
    default: return 'R';
  }
}

// 🛡️ FUNÇÃO REMOVIDA: validateTriggerMatch não é mais necessária após correção do bug principal

// 🔍 FUNÇÃO AUXILIAR: Verificar se resultado é trigger para o tipo selecionado
// Usada para detectar quando deve apostar (ex: se selecionou "red" e saiu vermelho = trigger)
function checkTriggerMatch(betType: string, resultColor: string, resultNumber: number): boolean {
  // Zero nunca é trigger
  if (resultNumber === 0) return false;
  
  // Log de debug removido - função corrigida
  
  switch (betType) {
    case 'await': return false;
    case 'red': 
    case 'vermelho': return resultColor === 'R';
    case 'black': 
    case 'preto': return resultColor === 'B';
    case 'even': 
    case 'par': return resultNumber % 2 === 0;
    case 'odd': 
    case 'ímpar': 
    case 'impar': return resultNumber % 2 === 1;
    case 'low': 
    case 'baixas': return resultNumber >= 1 && resultNumber <= 18;
    case 'high': 
    case 'altas': return resultNumber >= 19 && resultNumber <= 36;
         default: 
       return false;
  }
}

// 🎯 FUNÇÃO: Obter nome do tipo de aposta
function getBetTypeName(betType: string): string {
  switch (betType) {
    case 'red': return 'VERMELHO';
    case 'black': return 'PRETO';
    case 'even': return 'PAR';
    case 'odd': return 'ÍMPAR';
    case 'low': return 'BAIXAS (1-18)';
    case 'high': return 'ALTAS (19-36)';
    default: return 'DESCONHECIDO';
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

// 🔧 NOVO: Sistema de controle de renovação para evitar rate limiting
interface RenewalControlState {
  lastRenewalAttempt: number;
  renewalCooldown: number; // Tempo em ms para aguardar entre renovações
  consecutiveFailures: number;
  blocked: boolean;
  blockedUntil: number;
}

// Mapa para controlar renovações automáticas por usuário
const autoRenewal: { [userId: string]: SimpleRenewalState } = {};

// 🔧 NOVO: Controle para evitar renovações simultâneas
const renewalInProgress: { [userId: string]: boolean } = {};

// ⏰ Função para inicializar renovação automática
function initializeAutoRenewal(userId: string) {
  // 🔧 CORREÇÃO: Só inicializar se não existe para evitar logs excessivos
  if (autoRenewal[userId]) return;
  
  const now = Date.now();
  autoRenewal[userId] = {
    nextRenewalTime: now + (10 * 60 * 1000), // 10 minutos
    lastRenewalTime: now
  };
  addWebSocketLog(userId, '⏰ Renovação automática iniciada - próxima em 10 minutos', 'info');
}

// (Funções removidas - duplicatas removidas)

// 🎯 NOVA FUNÇÃO: Forçar renovação imediata após resultado
// 🎯 NOVA FUNÇÃO: Verificar se precisa renovar e aproveitar momento pós-aposta
function shouldRenewAfterBet(userId: string): boolean {
  const renewal = autoRenewal[userId];
  if (!renewal) return false;
  
  const now = Date.now();
  
  // 🎯 INTELIGENTE: Se está próximo do tempo de renovação (dentro de 3 minutos)
  const timeUntilRenewal = renewal.nextRenewalTime - now;
  const shouldRenew = timeUntilRenewal <= (3 * 60 * 1000); // 3 minutos ou menos
  
  if (shouldRenew) {
    // Atualizar timer para próxima renovação
    renewal.lastRenewalTime = now;
    renewal.nextRenewalTime = now + (10 * 60 * 1000); // Próxima em 10 minutos
    
    addWebSocketLog(userId, '🎯 Aproveitando momento pós-aposta para renovar (~20s até resultado)', 'info');
    return true;
  }
  
  return false;
}

function triggerRenewalAfterBet(userId: string) {
  const renewal = autoRenewal[userId];
  if (!renewal) return;
  
  const now = Date.now();
  const timeSinceLastRenewal = now - renewal.lastRenewalTime;
  const minInterval = 8 * 60 * 1000; // Mínimo 8 minutos entre renovações
  
  // Só renovar se passou tempo suficiente desde a última renovação
  if (timeSinceLastRenewal >= minInterval) {
    renewal.nextRenewalTime = now; // Renovar imediatamente
    addWebSocketLog(userId, '🎯 Renovação programada pós-aposta', 'info');
  } else {
    // Agendar para o tempo mínimo
    const remainingTime = minInterval - timeSinceLastRenewal;
    renewal.nextRenewalTime = now + remainingTime;
    const minutesLeft = Math.ceil(remainingTime / 60000);
    addWebSocketLog(userId, `⏳ Renovação em ${minutesLeft} minutos (intervalo mínimo)`, 'info');
  }
}

// ⏰ Função para verificar se deve renovar automaticamente COM INTELIGÊNCIA DE APOSTAS
function shouldRenewAutomatically(userId: string): boolean {
  const renewal = autoRenewal[userId];
  if (!renewal) {
    // 🔧 CORREÇÃO: Só inicializar se não existe, evitando logs excessivos
    initializeAutoRenewal(userId);
    return false;
  }

  const now = Date.now();
  
  // 🔧 CORREÇÃO: Verificar se já passou do tempo e não foi renovado recentemente
  if (now >= renewal.nextRenewalTime) {
    // 🎯 ANTI-DUPLICAÇÃO: Verificar se não foi renovado recentemente (últimos 60 segundos)
    const timeSinceLastRenewal = now - renewal.lastRenewalTime;
    if (timeSinceLastRenewal < 60 * 1000) { // Aumentado para 60 segundos
      // Renovação muito recente, pular
      return false;
    }
    
    // Renovar e agendar próxima
    renewal.lastRenewalTime = now;
    renewal.nextRenewalTime = now + (10 * 60 * 1000); // Próxima em 10 minutos
    
    return true;
  }
  
  return false;
}

// ⏰ Função para limpar renovação automática
function clearAutoRenewal(userId: string) {
  if (autoRenewal[userId]) {
    delete autoRenewal[userId];
    
  }
  
  // 🔧 NOVO: Limpar flag de renovação em andamento
  if (renewalInProgress[userId]) {
    delete renewalInProgress[userId];
  }
}

// 🚀 REMOVIDO: Funções para gerenciar progressão automática - funcionalidade removida
// Todas as funções de progressão automática foram removidas:
// - updateProgressionSettings
// - incrementProgressionCounter  
// - applyProgressionStake
// - resetProgressionCounter
// - getProgressionStatus

// 💰 NOVA LÓGICA: Sistema de stakes fixas por nível
// Funções antigas removidas - agora usa STAKE_LEVELS diretamente

// 🧹 SISTEMA COMPLETO DE MANUTENÇÃO DE MEMÓRIA
// Controle simples para evitar múltiplas instâncias
let maintenanceSystemInitialized = false;

if (!maintenanceSystemInitialized) {
  maintenanceSystemInitialized = true;
  
  // 🕐 Limpeza de timers órfãos a cada 30 minutos
  setInterval(() => {
    const clearedCount = cleanupOrphanedTimers();
    if (clearedCount > 0) {
      console.log(`🕐 [MAINTENANCE] Limpeza de timers: ${clearedCount} órfãos removidos`);
    }
  }, 30 * 60 * 1000);
  
  // 🧹 Monitoramento de memória a cada 15 minutos
  setInterval(() => {
    const memoryStats = calculateMemoryUsage();
    
    // Log apenas se houver uso significativo
    if (memoryStats.totalUsers > 0) {
      console.log(`📊 [MEMORY] ${memoryStats.totalUsers} usuários, ${memoryStats.totalArrayItems} items em arrays, score: ${memoryStats.memoryScore}/100`);
      
      // Log arrays grandes para debugging
      if (memoryStats.largestArrays.length > 0) {
        console.log(`📊 [MEMORY] Top arrays: ${memoryStats.largestArrays.slice(0, 3).map(a => `${a.type}(${a.size})`).join(', ')}`);
      }
    }
    
    // Limpeza automática se score crítico (80+)
    if (memoryStats.memoryScore >= MEMORY_LIMITS.CRITICAL_MEMORY_SCORE) {
      console.warn(`🚨 [MEMORY] Score crítico: ${memoryStats.memoryScore}/100 - Executando limpeza automática`);
      
      // Limpeza progressiva
      let totalCleaned = 0;
      
      // 1. Limpar usuários inativos (2h ao invés de 6h)
      totalCleaned += cleanupInactiveUsers(2);
      
      // 2. Limpar arrays de todos os usuários com limites reduzidos
      Object.keys(websocketLogs).forEach(userId => {
        totalCleaned += cleanupUserArrays(userId, {
          MAX_WEBSOCKET_LOGS_PER_USER: 200,
          MAX_GAME_RESULTS_PER_USER: 100,
          MAX_DETAILED_HISTORY_PER_USER: 200
        });
      });
      
      // 3. Limpar timers órfãos
      totalCleaned += cleanupOrphanedTimers();
      
      console.warn(`🚨 [MEMORY] Limpeza automática concluída: ${totalCleaned} items removidos`);
      
      // Verificar score final
      const newStats = calculateMemoryUsage();
      console.log(`📊 [MEMORY] Score após limpeza: ${newStats.memoryScore}/100`);
      
      // Se ainda crítico, executar limpeza de emergência
      if (newStats.memoryScore >= 90) {
        console.error(`🆘 [MEMORY] Score ainda crítico: ${newStats.memoryScore}/100 - Executando limpeza de emergência`);
        const emergencyCleaned = emergencyMemoryCleanup();
        console.error(`🆘 [MEMORY] Limpeza de emergência: ${emergencyCleaned} items removidos`);
      }
    }
  }, 15 * 60 * 1000); // 15 minutos
  
  // 🧹 Limpeza de usuários inativos a cada 2 horas
  setInterval(() => {
    const inactiveRemoved = cleanupInactiveUsers(6); // 6 horas de inatividade
    if (inactiveRemoved > 0) {
      console.log(`🧹 [MAINTENANCE] Usuários inativos removidos: ${inactiveRemoved}`);
    }
  }, 2 * 60 * 60 * 1000); // 2 horas
  
  // 🕐 Limpeza inicial após 5 minutos de startup  
  setTimeout(() => {
    console.log('🚀 [STARTUP] Executando limpeza inicial do sistema...');
    
    const timersCleaned = cleanupOrphanedTimers();
    const inactiveRemoved = cleanupInactiveUsers(1); // Mais agressivo no startup (1h)
    const memoryStats = calculateMemoryUsage();
    
    console.log(`🚀 [STARTUP] Limpeza concluída: ${timersCleaned} timers, ${inactiveRemoved} usuários inativos removidos`);
    console.log(`📊 [STARTUP] Status da memória: ${memoryStats.totalUsers} usuários, score ${memoryStats.memoryScore}/100`);
  }, 5 * 60 * 1000); // 5 minutos
}

// 🔧 NOVA FUNÇÃO: Detectar e simplificar erros de saldo insuficiente
function simplifyBlazeError(errorText: string, statusCode: number): string {
  try {
    // Tentar parsear como JSON para verificar se é um erro estruturado
    const errorData = JSON.parse(errorText);
    
    // Verificar se é erro de saldo insuficiente
    if (statusCode === 422 && 
        errorData.error && 
        (errorData.error.message?.includes('You currently do not have any balance') ||
         errorData.error.message?.includes('Please deposit funds') ||
         errorData.error.code === 'gameProvider.NoBalance')) {
      return 'saldo insuficiente para ativar o bot';
    }
    
    // Se não é erro de saldo, retornar erro original para outros casos
    return `Erro da Blaze: ${statusCode} - ${errorText}`;
    
  } catch (parseError) {
    // Se não conseguir parsear como JSON, retornar erro original
    return `Erro da Blaze: ${statusCode} - ${errorText}`;
  }
}



