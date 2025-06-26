import { NextRequest, NextResponse } from 'next/server';
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';

// Interface simplificada para configuração
interface MegaRouletteConfig {
  userId: string;
  action?: 'bet-connect' | 'start-operation' | 'stop-operation' | 'get-websocket-logs' | 'get-operation-report' | 'reset-operation-report' | 'get-connection-status' | 'server-diagnostic';
}

// Interface para resultado de autenticação
interface AuthResult {
  userId: string;
  originalUserId: string;
  ppToken: string;
  jsessionId: string;
  timestamp: string;
}

// Armazenamento dos logs do WebSocket
const websocketLogs: { [userId: string]: Array<{ timestamp: number; message: string; type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' }> } = {};
const connectionStatus: { [userId: string]: { connected: boolean; error?: string; lastUpdate: number } } = {};

// NOVO: Sistema simplificado dos últimos 5 resultados
const lastFiveResults: { [userId: string]: Array<{ number: number; color: string; gameId: string; timestamp: number }> } = {};

// NOVO: Estado da operação simplificada
const operationState: { [userId: string]: {
  active: boolean; 
  currentPattern: string[];        // ['B', 'B', 'B', 'R', 'R'] - padrão sendo apostado
  currentLevel: number;            // 0-4 (qual aposta da sequência)
  martingaleLevel: number;         // 0-4 (nível do martingale)
  waitingForResult: boolean;
  lastGameId?: string;
  strategy: {
    sequences: number[];           // [1, 2, 4, 8, 16]
    maxMartingale: number;        // 5
  };
  stats: {
  totalBets: number;
  wins: number;
  losses: number;
    profit: number;
  startedAt: number;
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

// 🎭 NOVO: Estatísticas de humanização
const humanizationStats: { [userId: string]: {
  totalBets: number;         // Total de apostas feitas
  humanizedBets: number;     // Apostas que receberam ruído
  totalNoise: number;        // Soma total do ruído aplicado
  lastNoiseApplied: number;  // Último ruído aplicado
} } = {};

// 🕶️ Sistema de disfarce por ganhos consecutivos
const disguiseControl: { [userId: string]: {
  // Controle de ganhos consecutivos
  completedSequences: number;      // Sequências de 5 vitórias completadas
  targetSequences: number;         // Meta de sequências antes de pausar (2-5)
  isOnBreakFromWins: boolean;      // Se está em pausa por ganhos consecutivos
  
  // Controle de pausas
  waitingBreakTimer: NodeJS.Timeout | null;  // Timer da pausa
  nextBreakDuration: number;       // Duração da próxima pausa (20-60min)
  lastBreakTime: number;           // Timestamp da última pausa
  
  // ⏰ Campos para timer visual
  breakStartTime: number;          // Timestamp do início da pausa
  breakEndTime: number;            // Timestamp do fim da pausa
} } = {};

// Função para calcular sequência de martingale baseada no tip
function calculateMartingaleSequence(tipValue: number): number[] {
  const sequence: number[] = [];
  
  // Nível 1: 1 tip
  sequence.push(tipValue);
  
  // Níveis 2-5: (anterior × 2) + (2 × tip)
  for (let level = 2; level <= 5; level++) {
    const previousValue = sequence[level - 2];
    const newValue = (previousValue * 2) + (2 * tipValue);
    sequence.push(newValue);
  }
  
  return sequence;
}

// 🎭 NOVO: Funções para humanização das apostas
function shouldApplyNoise(): boolean {
  // 5% a 15% de chance de aplicar ruído
  const noiseChance = Math.random() * 100; // 0-100
  const minChance = 5;  // 5%
  const maxChance = 15; // 15%
  const threshold = Math.random() * (maxChance - minChance) + minChance; // Entre 5% e 15%
  
  return noiseChance <= threshold;
}

function applyHumanNoise(originalAmount: number): { amount: number; noise: number } {
  // Ruído de ±0.50 (múltiplo de 0.50)
  const noiseDirection = Math.random() < 0.5 ? -1 : 1; // +1 ou -1
  const noise = 0.50 * noiseDirection;
  const newAmount = Math.max(0.50, originalAmount + noise); // Mínimo R$ 0,50
  
  return {
    amount: parseFloat(newAmount.toFixed(2)),
    noise: noise
  };
}

function updateMartingaleWithNoise(userId: string, appliedNoise: number) {
  const operation = operationState[userId];
  if (!operation) return;
  
  // Propagar o ruído para os próximos níveis
  for (let i = operation.currentLevel + 1; i < operation.strategy.sequences.length; i++) {
    operation.strategy.sequences[i] += appliedNoise;
    operation.strategy.sequences[i] = Math.max(0.50, parseFloat(operation.strategy.sequences[i].toFixed(2)));
  }
  
  // Log da propagação
  if (appliedNoise !== 0) {
    addWebSocketLog(userId, `🎭 Ruído de R$ ${appliedNoise.toFixed(2)} propagado para próximos níveis`, 'info');
  }
}

function updateHumanizationStats(userId: string, wasHumanized: boolean, appliedNoise: number = 0) {
  // Inicializar estatísticas se não existir
  if (!humanizationStats[userId]) {
    humanizationStats[userId] = {
      totalBets: 0,
      humanizedBets: 0,
      totalNoise: 0,
      lastNoiseApplied: 0
    };
  }
  
  const stats = humanizationStats[userId];
  stats.totalBets++;
  
  if (wasHumanized) {
    stats.humanizedBets++;
    stats.totalNoise += appliedNoise;
    stats.lastNoiseApplied = appliedNoise;
  }
}

// 🕶️ NOVO: Funções do sistema de disfarce
function initializeDisguiseControl(userId: string) {
  if (!disguiseControl[userId]) {
    disguiseControl[userId] = {
      completedSequences: 0,
      targetSequences: generateRandomSequenceTarget(),
      isOnBreakFromWins: false,
      waitingBreakTimer: null,
      nextBreakDuration: generateRandomBreakDuration(),
      lastBreakTime: 0,
      // ⏰ Campos para timer visual
      breakStartTime: 0,
      breakEndTime: 0
    };
    
    addWebSocketLog(userId, `🕶️ Sistema de disfarce ativado - Meta: ${disguiseControl[userId].targetSequences} sequências`, 'info');
  }
}

function generateRandomSequenceTarget(): number {
  // Entre 2 e 5 sequências
  return Math.floor(Math.random() * 4) + 2; // 2, 3, 4 ou 5
}

function generateRandomBreakDuration(): number {
  // Entre 20 e 60 minutos (em milissegundos)
  const minMs = 20 * 60 * 1000; // 20 minutos
  const maxMs = 60 * 60 * 1000; // 60 minutos
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function checkForWinBreak(userId: string): boolean {
  const disguise = disguiseControl[userId];
  if (!disguise || disguise.isOnBreakFromWins) return false;
  
  // 💰 NOVO: Verificar se está com lucro antes de permitir pausa
  const operation = operationState[userId];
  if (!operation || operation.stats.profit <= 0) {
    addWebSocketLog(userId, `🚫 Pausa bloqueada - Bot no prejuízo (R$ ${operation?.stats.profit.toFixed(2) || '0.00'})`, 'info');
    return false;
  }
  
  disguise.completedSequences++;
  addWebSocketLog(userId, `🏆 Sequência completada! Total: ${disguise.completedSequences}/${disguise.targetSequences}`, 'success');
  
  if (disguise.completedSequences >= disguise.targetSequences) {
    // Atingiu meta E está com lucro - iniciar pausa por ganhos consecutivos
    addWebSocketLog(userId, `💰 Bot com lucro (R$ ${operation.stats.profit.toFixed(2)}) - Pausa autorizada`, 'success');
    startWinBreak(userId);
    return true;
  }
  
  return false;
}

function startWinBreak(userId: string) {
  const disguise = disguiseControl[userId];
  if (!disguise) return;
  
  disguise.isOnBreakFromWins = true;
  disguise.lastBreakTime = Date.now();
  
  // ⏰ NOVO: Definir timestamps para timer visual
  disguise.breakStartTime = Date.now();
  disguise.breakEndTime = Date.now() + disguise.nextBreakDuration;
  
  // Parar operação atual
  if (operationState[userId]) {
    operationState[userId].active = false;
  }
  
  // Desconectar WebSocket
  stopAllConnections(userId, false);
  
  const breakMinutes = Math.floor(disguise.nextBreakDuration / (60 * 1000));
  addWebSocketLog(userId, `🕶️ PAUSA POR GANHOS CONSECUTIVOS - ${disguise.completedSequences} sequências completadas`, 'info');
  addWebSocketLog(userId, `⏰ Pausa de ${breakMinutes} minutos iniciada - Reconexão automática`, 'info');
  
  // Programar reconexão automática
  disguise.waitingBreakTimer = setTimeout(() => {
    resumeFromBreak(userId);
  }, disguise.nextBreakDuration);
}



async function resumeFromBreak(userId: string) {
  const disguise = disguiseControl[userId];
  if (!disguise) return;
  
  // Limpar estado de pausa
  disguise.isOnBreakFromWins = false;
  disguise.waitingBreakTimer = null;
  
  // ⏰ Limpar timestamps de pausa
  disguise.breakStartTime = 0;
  disguise.breakEndTime = 0;
  
  // Gerar novos valores aleatórios
  disguise.completedSequences = 0;
  disguise.targetSequences = generateRandomSequenceTarget();
  disguise.nextBreakDuration = generateRandomBreakDuration();
  
  addWebSocketLog(userId, `🔄 RETOMANDO OPERAÇÃO APÓS PAUSA`, 'success');
  addWebSocketLog(userId, `🕶️ Nova meta: ${disguise.targetSequences} sequências`, 'info');
  
  try {
    // Reconectar automaticamente (simular clique no botão conectar)
    // Usar tipValue padrão ou último usado
    const lastTipValue = operationState[userId]?.strategy?.sequences?.[0] || 1.0;
    await connectToBettingGame(userId, lastTipValue);
    
    addWebSocketLog(userId, `✅ Tentativa de reconexão automática iniciada`, 'success');
    
    // Aguardar um pouco e iniciar operação automaticamente
    setTimeout(async () => {
      try {
        // Verificar se conectou com sucesso antes de iniciar operação
        if (activeWebSockets[userId]) {
          await startSimpleOperation(userId);
          addWebSocketLog(userId, `🚀 Operação reiniciada automaticamente após pausa`, 'success');
        } else {
          addWebSocketLog(userId, `⚠️ WebSocket não conectado - tentando novamente em 30s`, 'error');
          // Tentar novamente em 30 segundos
          setTimeout(() => resumeFromBreak(userId), 30000);
        }
      } catch (error) {
        addWebSocketLog(userId, `❌ Erro ao reiniciar operação: ${error}`, 'error');
        // Tentar novamente em 30 segundos
        setTimeout(() => resumeFromBreak(userId), 30000);
      }
    }, 5000); // Aguardar 5 segundos para conexão estabilizar
    
  } catch (error) {
    addWebSocketLog(userId, `❌ Erro na reconexão automática: ${error}`, 'error');
    // Tentar novamente em 30 segundos
    setTimeout(() => resumeFromBreak(userId), 30000);
  }
}



// Estratégias Martingale disponíveis (valor padrão)
const MARTINGALE_STRATEGIES = {
  "moderate": {
    sequences: [0.50, 2.00, 5.00, 11.00, 23.00], // Progressão Martingale personalizada
    maxMartingale: 5
  }
};

// Função principal POST
export async function POST(request: NextRequest) {
  try {
    // ✅ NOVO: Capturar IP real do usuário
    const clientIP = 
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-client-ip') ||
      'unknown';

    let requestBody;
    try {
      requestBody = await request.json();
    } catch (jsonError) {
      console.error('❌ Erro ao parsear JSON:', jsonError);
      return NextResponse.json({
        success: false,
        error: 'Dados da requisição inválidos - JSON malformado'
      }, { status: 400 });
    }

    const { userId, action = 'bet-connect', tipValue } = requestBody;

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'userId é obrigatório'
      }, { status: 400 });
    }

    console.log(`🎯 [${action.toUpperCase()}] Usuário: ${userId.slice(0, 8)}... IP: ${clientIP}`);

    // DEBUG: Mostrar estado atual dos objetos globais para este usuário
    console.log(`🔍 [DEBUG-${action.toUpperCase()}] Estado atual para usuário ${userId.slice(0, 8)}:`, {
      hasWebSocket: !!activeWebSockets[userId],
      hasOperationState: !!operationState[userId],
      operationActive: operationState[userId]?.active || false,
      hasSessionControl: !!sessionControl[userId],
      hasRenewalTimer: !!renewalTimers[userId],
      clientIP: clientIP,
      timestamp: new Date().toISOString()
    });

    // Ações disponíveis
    switch (action) {
      case 'bet-connect':
        return await connectToBettingGame(userId, tipValue, clientIP);
      
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
      
      default:
      return NextResponse.json({
        success: false,
          error: `Ação "${action}" não implementada`
    }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ Erro no MegaRoulette Bot:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor'
    }, { status: 500 });
  }
}

// Função de autenticação usando edge function
async function performAuthentication(userId: string): Promise<{ success: boolean; data?: AuthResult; error?: string }> {
  try {
    console.log('🔗 [AUTH] Iniciando autenticação para usuário:', userId);
    
    let actualUserId = userId;
    
    // Se userId é um email, buscar UUID primeiro
    if (userId.includes('@')) {
      console.log('📧 [AUTH] Buscando UUID para email:', userId);
      
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
    );

      const { data: usersList, error: usersError } = await supabase.auth.admin.listUsers();
      
      if (usersError) {
        return {
          success: false,
          error: 'Erro ao buscar usuário no sistema'
        };
      }

      const foundUser = usersList.users.find(user => user.email === userId);
      
      if (!foundUser?.id) {
        return {
          success: false,
          error: 'Usuário não encontrado no sistema'
        };
      }

      actualUserId = foundUser.id;
      console.log('✅ [AUTH] UUID encontrado para email:', actualUserId);
    }

    // Chamar edge function para autenticação
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/blaze-megaroulettebr`;
    
    const requestBody = {
      action: 'authenticate',
      user_id: actualUserId,
      timestamp: Date.now()
    };
    
    const requestHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY}`,
      'Cache-Control': 'no-cache'
    };
    
    console.log('🚀 [AUTH] Fazendo requisição para edge function...');
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Erro na edge function: ${response.status} - ${errorText}`
      };
    }

    const result = await response.json();
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Erro na autenticação via edge function'
      };
    }

    console.log('✅ [AUTH] Autenticação realizada com sucesso');

    return {
      success: true,
      data: {
        userId: actualUserId,
        originalUserId: userId,
        ppToken: result.data.ppToken,
        jsessionId: result.data.jsessionId,
        timestamp: result.data.timestamp || new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('❌ [AUTH] Erro geral na autenticação:', error);
    return {
      success: false,
      error: `Erro interno na autenticação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

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
  
  console.log(`📝 [LOG-${userId.slice(0, 8)}] ${message}`);
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
  
  // Adiciona aos últimos 5 resultados
  if (!lastFiveResults[userId]) {
    lastFiveResults[userId] = [];
  }
  
  lastFiveResults[userId].push({
    number,
    color: colorCode,
    gameId,
    timestamp: Date.now()
  });
  
  // Mantém apenas os últimos 5
  if (lastFiveResults[userId].length > 5) {
    lastFiveResults[userId].shift();
  }
  
  addWebSocketLog(userId, `🎲 Resultado: ${number} ${color} | Últimos 5: ${lastFiveResults[userId].map(r => r.color).join('')}`, 'game');
  
  // Se operação ativa, processa aposta
  if (operationState[userId]?.active) {
    processOperationResult(userId, colorCode);
  } else {
    // ✅ NOVO: Reativar automaticamente se operação estava pausada e agora tem padrão
    if (operationState[userId] && !operationState[userId].active && lastFiveResults[userId].length >= 5) {
      addWebSocketLog(userId, `🔄 REATIVAÇÃO AUTOMÁTICA: Padrão disponível detectado`, 'success');
      
      operationState[userId].active = true;
      operationState[userId].currentPattern = lastFiveResults[userId].slice().reverse().map(r => r.color);
      operationState[userId].currentLevel = 0;
      operationState[userId].martingaleLevel = 0;
      operationState[userId].waitingForResult = false;
      
      const newPattern = operationState[userId].currentPattern.join('');
      addWebSocketLog(userId, `🚀 NOVO PADRÃO AUTOMÁTICO: ${newPattern}`, 'success');
      addWebSocketLog(userId, `📋 Sequência a seguir: ${newPattern.split('').map((c, i) => `${i+1}°${c}`).join(' → ')}`, 'info');
    }
  }
}

// NOVO: Função para processar resultado da operação
function processOperationResult(userId: string, resultColor: string) {
  const operation = operationState[userId];
  if (!operation || !operation.active) return;

  const expectedColor = operation.currentPattern[operation.currentLevel];
  // ✅ ZERO SEMPRE CONTA COMO DERROTA - só ganha se for exatamente a cor apostada
  const isWin = (resultColor === expectedColor && resultColor !== 'green');
  
  operation.stats.totalBets++;
  operation.waitingForResult = false; // ✅ SEMPRE libera para próxima aposta
  
      if (isWin) {
      // ✅ GANHOU - Avança para próximo nível do padrão
      operation.stats.wins++;
      
      // Usar valor apostado atual para calcular lucro
      const betAmount = operation.strategy.sequences[operation.currentLevel] || 0.50;
      operation.stats.profit += betAmount;
      
      operation.currentLevel++; // ✅ AVANÇA NÍVEL
      operation.martingaleLevel = 0; // ✅ RESETA MARTINGALE
      
      const expectedColorName = COLOR_NAMES[expectedColor] || expectedColor;
      const resultColorName = COLOR_NAMES[resultColor] || resultColor;
      
      addWebSocketLog(userId, `✅ VITÓRIA Nível ${operation.currentLevel}! Apostou ${expectedColorName} R$ ${betAmount.toFixed(2)} → Veio ${resultColorName}`, 'success');
      
      if (operation.currentLevel >= 5) {
        // Completou toda sequência!
        addWebSocketLog(userId, `🎉 SEQUÊNCIA COMPLETA! Padrão ${operation.currentPattern.join('')} finalizado com sucesso!`, 'success');
        
        // 🕶️ NOVO: Verificar se deve aplicar disfarce por ganhos consecutivos
        const shouldBreak = checkForWinBreak(userId);
        if (shouldBreak) {
          return; // Para aqui se entrou em pausa por ganhos consecutivos
        }
        
        resetOperationForNewPattern(userId);
        return; // Para aqui, não continua apostando
    } else {
        // Próximo nível da sequência
        const nextBet = operation.currentPattern[operation.currentLevel];
        const nextBetName = COLOR_NAMES[nextBet] || nextBet;
        addWebSocketLog(userId, `➡️ Próximo nível ${operation.currentLevel + 1}: ${nextBetName} (${nextBet})`, 'info');
        // ✅ Continua ativo para próxima aposta
      }
      
    } else {
      // ❌ PERDEU - Para e pega próximo padrão
      operation.stats.losses++;
      
      const betAmount = operation.strategy.sequences[operation.currentLevel] || 0.50;
      operation.stats.profit -= betAmount;
      
      const expectedColorName = COLOR_NAMES[expectedColor] || expectedColor;
      const resultColorName = COLOR_NAMES[resultColor] || resultColor;
      
      const defeatReason = resultColor === 'green' ? '(ZERO)' : `(${resultColorName})`;
      addWebSocketLog(userId, `❌ DERROTA Nível ${operation.currentLevel + 1}! Apostou ${expectedColorName} R$ ${betAmount.toFixed(2)} → Veio ${resultColorName} ${defeatReason}`, 'error');
      addWebSocketLog(userId, `🛑 Padrão ${operation.currentPattern.join('')} interrompido no nível ${operation.currentLevel + 1}`, 'error');
      
      // Para e aguarda novo padrão
      resetOperationForNewPattern(userId);
    }
}

// NOVO: Reset para novo padrão - OPERAÇÃO CONTÍNUA
function resetOperationForNewPattern(userId: string) {
  if (!operationState[userId]) return;
  
  // ✅ OPERAÇÃO CONTÍNUA - busca automaticamente próximo padrão
  const results = lastFiveResults[userId] || [];
  
  if (results.length >= 5) {
    // Tem padrão disponível - continua automaticamente
    operationState[userId].currentPattern = results.slice().reverse().map(r => r.color);
    operationState[userId].currentLevel = 0;
    operationState[userId].martingaleLevel = 0;
    operationState[userId].waitingForResult = false;
    // ✅ MANTÉM active = true para continuar operando
    
    const newPattern = operationState[userId].currentPattern.join('');
    addWebSocketLog(userId, `🔄 NOVO PADRÃO AUTOMÁTICO: ${newPattern}`, 'success');
    addWebSocketLog(userId, `📋 Próxima sequência: ${newPattern.split('').map((c, i) => `${i+1}°${c}`).join(' → ')}`, 'info');
  } else {
    // Não tem padrão suficiente - para e aguarda
    operationState[userId].active = false;
    operationState[userId].currentPattern = [];
    operationState[userId].currentLevel = 0;
    operationState[userId].martingaleLevel = 0;
    operationState[userId].waitingForResult = false;
    
    addWebSocketLog(userId, `⏳ Aguardando novos resultados para continuar (${results.length}/5)`, 'info');
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

    // Fazer nova autenticação
    const authResult = await performAuthentication(userId);
    if (!authResult.success) {
      addWebSocketLog(userId, `❌ Falha na renovação: ${authResult.error}`, 'error');
      return false;
    }

    // Atualizar dados da sessão
    session.jsessionId = authResult.data!.jsessionId;
    session.ppToken = authResult.data!.ppToken;
    session.pragmaticUserId = authResult.data!.userId;
    session.lastRenewal = Date.now();
    session.renewalAttempts = 0; // Reset contador após sucesso

    addWebSocketLog(userId, '✅ Sessão renovada com sucesso', 'success');

    // Reconectar WebSocket com nova sessão
    const config = {
      jsessionId: session.jsessionId,
      pragmaticUserId: session.pragmaticUserId,
      tableId: 'mrbras531mrbr532'
    };

    // Fechar conexão antiga
    if (activeWebSockets[userId]?.ws) {
      try {
        activeWebSockets[userId].ws.close(1000, 'Renovando sessão');
      } catch (error) {
        console.error('Erro ao fechar WebSocket antigo:', error);
      }
    }

    // Iniciar nova conexão
    startWebSocketConnection(userId, config);
    
    addWebSocketLog(userId, '🔗 WebSocket reconectado com nova sessão', 'success');
    return true;

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
async function connectToBettingGame(userId: string, tipValue?: number, clientIP?: string) {
  try {
    addWebSocketLog(userId, '🔗 Iniciando conexão...', 'info');
    
    // Limpar status anterior e parar conexões existentes
    stopAllConnections(userId, false);
    resetReconnectionControl(userId);
    
    // Autenticar
    const authResult = await performAuthentication(userId);
    if (!authResult.success) {
      const errorMsg = `Falha na autenticação: ${authResult.error}`;
      addWebSocketLog(userId, errorMsg, 'error');
      updateConnectionStatus(userId, false, errorMsg);
      return NextResponse.json({
        success: false,
        error: errorMsg
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

    // Calcular estratégia baseada no tip selecionado
    const calculatedSequence = tipValue ? calculateMartingaleSequence(tipValue) : MARTINGALE_STRATEGIES.moderate.sequences;
    
    addWebSocketLog(userId, `🎯 Tip selecionado: ${tipValue || 'padrão'} - Sequência: [${calculatedSequence.map(v => v.toFixed(2)).join(', ')}]`, 'info');

    // 🕶️ Inicializar sistema de disfarce
    initializeDisguiseControl(userId);
    
    // Inicializar estados
    lastFiveResults[userId] = [];
    resultCollectionEnabled[userId] = false; // Só habilita após primeiro "apostas fechadas"
    operationState[userId] = {
      active: false,
      currentPattern: [],
      currentLevel: 0,
      martingaleLevel: 0,
      waitingForResult: false,
      strategy: {
        sequences: calculatedSequence,
        maxMartingale: 5
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

    startWebSocketConnection(userId, config, undefined, clientIP);

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
    console.error('❌ Erro ao conectar:', error);
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
    // Verificar se tem 5 resultados
    const results = lastFiveResults[userId] || [];
    
    if (results.length < 5) {
      return NextResponse.json({
        success: false,
        error: `Aguarde 5 resultados para iniciar (atual: ${results.length}/5)`
      });
    }
    
    // Inicializar operação - usar mesma ordem do frontend (mais recente primeiro)
    operationState[userId] = {
      ...operationState[userId],
      active: true,
      currentPattern: results.slice().reverse().map(r => r.color),
      currentLevel: 0,
      martingaleLevel: 0,
      waitingForResult: false
    };
    
    const pattern = operationState[userId].currentPattern.join('');
    addWebSocketLog(userId, `🚀 Operação iniciada! Padrão FIXO: ${pattern}`, 'success');
    addWebSocketLog(userId, `📋 Sequência a seguir: ${pattern.split('').map((c, i) => `${i+1}°${c}`).join(' → ')}`, 'info');
    
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
    console.error('❌ Erro ao iniciar operação:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro ao iniciar operação'
    });
  }
}

// NOVO: Parar operação
async function stopSimpleOperation(userId: string) {
  try {
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

// NOVO: Iniciar conexão WebSocket simplificada
function startWebSocketConnection(userId: string, config: { jsessionId: string; pragmaticUserId: string; tableId: string }, customServerUrl?: string, userIP?: string) {
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
    
    const ws = new WebSocket(wsUrl, {
      headers: {
        // Headers corretos conforme API de referência
        'Origin': 'https://client.pragmaticplaylive.net',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Protocol': 'chat',
        // ✅ NOVO: Headers para repassar IP real do usuário
        ...(userIP && {
          'X-Forwarded-For': userIP,
          'X-Real-IP': userIP,
          'X-Client-IP': userIP,
          'CF-Connecting-IP': userIP, // Cloudflare format
          'True-Client-IP': userIP    // Akamai format
        })
      }
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
            
            addWebSocketLog(userId, `🔄 Switch de servidor detectado: ${newServer}`, 'info');
            addWebSocketLog(userId, `🔄 Reconectando ao novo servidor: ${newWsAddress}`, 'info');
            
            // Limpar ping interval
            if (pingInterval) {
              clearInterval(pingInterval);
              pingInterval = null;
            }
            
            // Fechar conexão atual
            ws.close();
            
            // Reconectar ao novo servidor após delay
            setTimeout(() => {
              startWebSocketConnection(userId, config, newWsAddress, userIP);
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
        console.log('📝 [WS] Mensagem não parseável:', data.toString().substring(0, 100));
      }
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
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
              setTimeout(() => {
            startWebSocketConnection(userId, config);
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
    console.error('❌ Erro ao criar WebSocket:', error);
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
      console.log('✅ [WEBSOCKET] Mensagem enviada via método direto');
      return { success: true };
    } catch (directError: any) {
      console.log('⚠️ [WEBSOCKET] Método direto falhou:', directError.message);
      
      // Método 2: Tentar com Buffer (para compatibilidade com diferentes implementações)
      try {
        const buffer = Buffer.from(message, 'utf8');
        ws.send(buffer);
        console.log('✅ [WEBSOCKET] Mensagem enviada via Buffer');
        return { success: true };
      } catch (bufferError: any) {
        console.log('⚠️ [WEBSOCKET] Método Buffer falhou:', bufferError.message);
        
        // Método 3: Tentar forçar como string
        try {
          const stringMessage = String(message);
          ws.send(stringMessage, { binary: false });
          console.log('✅ [WEBSOCKET] Mensagem enviada como string forçada');
          return { success: true };
        } catch (stringError: any) {
          console.log('⚠️ [WEBSOCKET] Método string forçada falhou:', stringError.message);
          
          // Método 4: Tentar usando _socket diretamente (último recurso)
          try {
            if (ws._socket && ws._socket.write) {
              const frame = createWebSocketFrame(message);
              ws._socket.write(frame);
              console.log('✅ [WEBSOCKET] Mensagem enviada via _socket.write');
              return { success: true };
            } else {
              throw new Error('_socket.write não disponível');
            }
          } catch (socketError: any) {
            console.error('❌ [WEBSOCKET] Todos os métodos falharam:', socketError.message);
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
    console.error('❌ [WEBSOCKET] Erro geral:', error);
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
  if (!operation || !operation.active) return;
  
  const expectedColor = operation.currentPattern[operation.currentLevel];
  const betAmount = operation.strategy.sequences[operation.currentLevel]; // Valor original do martingale
  const betCode = COLOR_TO_BET_CODE[expectedColor];
  const colorName = COLOR_NAMES[expectedColor];
  
  if (!betCode || !colorName) {
    addWebSocketLog(userId, `❌ Cor inválida para aposta: ${expectedColor}`, 'error');
    return;
  }

  // 🎭 HUMANIZAÇÃO: Aplicar ruído aleatório
  let finalBetAmount = betAmount;
  let appliedNoise = 0;
  let isHumanized = false;
  
  if (shouldApplyNoise()) {
    const noiseResult = applyHumanNoise(betAmount);
    finalBetAmount = noiseResult.amount;
    appliedNoise = noiseResult.noise;
    isHumanized = true;
    
    // Atualizar o valor na sequência atual
    operation.strategy.sequences[operation.currentLevel] = finalBetAmount;
    
    // Propagar ruído para próximos níveis
    updateMartingaleWithNoise(userId, appliedNoise);
    
    addWebSocketLog(userId, `🎭 HUMANIZAÇÃO: R$ ${betAmount.toFixed(2)} → R$ ${finalBetAmount.toFixed(2)} (${appliedNoise > 0 ? '+' : ''}${appliedNoise.toFixed(2)})`, 'info');
  }

  // Atualizar estatísticas de humanização
  updateHumanizationStats(userId, isHumanized, appliedNoise);

  try {
    // Gerar timestamp para identificação única
    const timestamp = Date.now().toString();
    const pragmaticUserId = `ppc${timestamp}`;
    
    // Criar mensagem de aposta conforme formato da API de referência
    const betXml = `<command channel="table-mrbras531mrbr532">
  <lpbet gm="roulette_desktop" gId="${gameId}" uId="${pragmaticUserId}" ck="${timestamp}">
    <bet amt="${finalBetAmount}" bc="${betCode}" ck="${timestamp}" />
  </lpbet>
</command>`;

    // Log da mensagem XML que será enviada
    console.log('📤 [AUTO-BET] XML da aposta:', betXml);
    addWebSocketLog(userId, `📤 Enviando XML: ${betXml.replace(/\n/g, ' ').replace(/\s+/g, ' ')}`, 'info');
          
    // Enviar aposta via WebSocket com tratamento robusto
    const sendResult = await sendWebSocketMessage(ws, betXml, userId);
    if (!sendResult.success) {
      addWebSocketLog(userId, `❌ Falha ao enviar aposta: ${sendResult.error}`, 'error');
      return;
    }
    operation.waitingForResult = true;
    operation.lastGameId = gameId;
    
    // Log da aposta com indicação de humanização
    const humanTag = isHumanized ? ' 🎭' : '';
    addWebSocketLog(userId, `🎯 APOSTA NÍVEL ${operation.currentLevel + 1}: ${colorName} (${expectedColor}) R$ ${finalBetAmount.toFixed(2)}${humanTag} → Game ${gameId}`, 'success');
    addWebSocketLog(userId, `🔧 Nível: ${operation.currentLevel + 1}/5 | Valor ${isHumanized ? 'humanizado' : 'padrão'} | Padrão: ${operation.currentPattern.join('')} | Código: ${betCode}`, 'info');
    
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
      console.error('❌ Erro ao debitar créditos:', error);
    }
  } catch (error) {
    console.error('❌ Erro ao debitar créditos:', error);
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
  console.log(`🛑 [DEBUG-STOP] Parando conexões para usuário ${userId.slice(0, 8)}...`);
  
  // Fechar WebSocket se existir
  if (activeWebSockets[userId]?.ws) {
    try {
      const ws = activeWebSockets[userId].ws;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Operação parada pelo usuário');
      }
  } catch (error) {
      console.error('❌ Erro ao fechar WebSocket:', error);
    }
      delete activeWebSockets[userId];
      console.log(`✅ [DEBUG-STOP] WebSocket removido para ${userId.slice(0, 8)}`);
    } else {
    console.log(`ℹ️ [DEBUG-STOP] Nenhum WebSocket ativo para ${userId.slice(0, 8)}`);
  }
    
  // Limpar controle de reconexão
  if (reconnectionControl[userId]) {
    delete reconnectionControl[userId];
    console.log(`✅ [DEBUG-STOP] Controle de reconexão removido para ${userId.slice(0, 8)}`);
  }
  
  // ✅ NOVO: Limpar timer de renovação automática
  if (renewalTimers[userId]) {
    clearTimeout(renewalTimers[userId]);
    delete renewalTimers[userId];
    addWebSocketLog(userId, '⏰ Timer de renovação automática cancelado', 'info');
    console.log(`✅ [DEBUG-STOP] Timer de renovação removido para ${userId.slice(0, 8)}`);
  }
  
  // ✅ NOVO: Limpar controle de sessão
  if (sessionControl[userId]) {
    delete sessionControl[userId];
    console.log(`✅ [DEBUG-STOP] Controle de sessão removido para ${userId.slice(0, 8)}`);
  }
  
  // NOVO: Resetar flag de coleta de resultados
  resultCollectionEnabled[userId] = false;
  console.log(`✅ [DEBUG-STOP] Coleta de resultados desabilitada para ${userId.slice(0, 8)}`);
  
  // NOVO: Resetar estado da janela de apostas
  if (bettingWindowState[userId]) {
    delete bettingWindowState[userId];
    console.log(`✅ [DEBUG-STOP] Estado da janela de apostas removido para ${userId.slice(0, 8)}`);
  }
  
  // 🕶️ NOVO: Limpar sistema de disfarce
  if (disguiseControl[userId]) {
    // Cancelar timer de pausa se existir
    if (disguiseControl[userId].waitingBreakTimer) {
      clearTimeout(disguiseControl[userId].waitingBreakTimer);
    }
    delete disguiseControl[userId];
    addWebSocketLog(userId, '🕶️ Sistema de disfarce desativado', 'info');
    console.log(`✅ [DEBUG-STOP] Sistema de disfarce removido para ${userId.slice(0, 8)}`);
  }
  
  // Atualizar status de conexão
  if (setErrorStatus) {
    updateConnectionStatus(userId, false, 'Operação parada pelo usuário');
  }
  
  console.log(`🏁 [DEBUG-STOP] Limpeza completa para usuário ${userId.slice(0, 8)} finalizada`);
}

// Obter logs do WebSocket
async function getWebSocketLogs(userId: string) {
  try {
    const logs = websocketLogs[userId] || [];
    const results = lastFiveResults[userId] || [];
    const status = connectionStatus[userId] || { connected: false, lastUpdate: Date.now() };
    const operation = operationState[userId];

    // NOVO: Verificar se pode iniciar operação (padrão completo + janela de apostas aberta)
    const bettingWindow = bettingWindowState[userId];
    const hasCompletePattern = results.length >= 5;
    const bettingWindowOpen = bettingWindow?.isOpen || false;
    const canStartOperation = hasCompletePattern && bettingWindowOpen && !operation?.active;

    return NextResponse.json({
      success: true,
      data: {
        logs,
        connectionStatus: status,
        lastFiveResults: results,
        operationActive: operation?.active || false,
        operationState: operation ? {
          pattern: operation.currentPattern.join(''),
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
        // ✅ NOVO: Status da sessão para monitoramento
        sessionStatus: sessionControl[userId] ? {
          createdAt: sessionControl[userId].createdAt,
          lastRenewal: sessionControl[userId].lastRenewal,
          renewalAttempts: sessionControl[userId].renewalAttempts,
          timeSinceLastRenewal: Date.now() - sessionControl[userId].lastRenewal,
          nextRenewalIn: renewalTimers[userId] ? 'Ativo' : 'Inativo'
        } : null,
        // 🎭 NOVO: Estatísticas de humanização
        humanizationStats: humanizationStats[userId] ? {
          totalBets: humanizationStats[userId].totalBets,
          humanizedBets: humanizationStats[userId].humanizedBets,
          humanizationRate: humanizationStats[userId].totalBets > 0 ? 
            parseFloat(((humanizationStats[userId].humanizedBets / humanizationStats[userId].totalBets) * 100).toFixed(1)) : 0,
          totalNoise: parseFloat(humanizationStats[userId].totalNoise.toFixed(2)),
          lastNoiseApplied: parseFloat(humanizationStats[userId].lastNoiseApplied.toFixed(2))
        } : null,
        // 🕶️ Sistema de disfarce por ganhos consecutivos
        disguiseStats: disguiseControl[userId] ? (() => {
          const disguise = disguiseControl[userId];
          const now = Date.now();
          
          // Calcular status atual
          let currentStatus = 'Operando';
          let timeRemaining = 0;
          let progressPercent = 0;
          
          if (disguise.isOnBreakFromWins) {
            currentStatus = 'Hibernando (Ganhos)';
            if (disguise.breakEndTime > 0) {
              timeRemaining = Math.max(0, disguise.breakEndTime - now);
              const totalDuration = disguise.breakEndTime - disguise.breakStartTime;
              progressPercent = totalDuration > 0 ? Math.min(100, ((totalDuration - timeRemaining) / totalDuration) * 100) : 0;
            }
          } else if (!operationState[userId]?.active) {
            currentStatus = 'Aguardando';
          }
          
          return {
            // Status atual
            currentStatus,
            
            // Timer da pausa atual (se ativa)
            currentBreak: {
              isActive: disguise.isOnBreakFromWins,
              type: 'wins',
              timeRemainingMs: timeRemaining,
              timeRemainingMinutes: Math.ceil(timeRemaining / (60 * 1000)),
              progressPercent: Math.round(progressPercent),
              startTime: disguise.breakStartTime,
              endTime: disguise.breakEndTime
            },
            
            // Progresso das sequências
            sequences: {
              completed: disguise.completedSequences,
              target: disguise.targetSequences,
              progressPercent: Math.round((disguise.completedSequences / disguise.targetSequences) * 100)
            },
            
            // Informações gerais
            nextBreakDuration: Math.floor(disguise.nextBreakDuration / (60 * 1000)), // em minutos
            timeSinceLastBreak: disguise.lastBreakTime > 0 ? 
              Math.floor((now - disguise.lastBreakTime) / (60 * 1000)) : 0, // em minutos
            hasActiveTimer: !!disguise.waitingBreakTimer
          };
        })() : null
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
    const results = lastFiveResults[userId] || [];
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
async function getServerDiagnostic() {
  try {
    const activeUsers = Object.keys(activeWebSockets);
    const operatingUsers = Object.keys(operationState).filter(id => operationState[id]?.active);
    const usersWithSessions = Object.keys(sessionControl);
    const usersWithTimers = Object.keys(renewalTimers);
    
    console.log('🩺 [SERVER-DIAGNOSTIC] Gerando diagnóstico do servidor...');
    
    return NextResponse.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        server: {
          totalActiveWebSockets: activeUsers.length,
          totalActiveOperations: operatingUsers.length,
          totalSessions: usersWithSessions.length,
          totalRenewalTimers: usersWithTimers.length
        },
        users: {
          activeWebSockets: activeUsers.map(id => ({
            userId: id.slice(0, 8) + '...',
            createdAt: activeWebSockets[id]?.createdAt,
            lastActivity: activeWebSockets[id]?.lastActivity
          })),
          activeOperations: operatingUsers.map(id => ({
            userId: id.slice(0, 8) + '...',
            active: operationState[id]?.active,
            currentLevel: operationState[id]?.currentLevel,
            stats: operationState[id]?.stats
          })),
          activeSessions: usersWithSessions.map(id => ({
            userId: id.slice(0, 8) + '...',
            createdAt: sessionControl[id]?.createdAt,
            lastRenewal: sessionControl[id]?.lastRenewal
          }))
        },
        isolation: {
          message: 'Cada usuário possui instância completamente isolada',
          proof: {
            webSocketsIsolated: 'activeWebSockets[userId] é único por usuário',
            operationsIsolated: 'operationState[userId] é único por usuário',
            sessionsIsolated: 'sessionControl[userId] é único por usuário'
          }
        }
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro ao gerar diagnóstico'
    });
  }
}

export async function GET(request: NextRequest) {
    return NextResponse.json({
      success: true,
    message: 'MegaRoulette BR Bot API - Sistema Simplificado',
    version: '2.0.0',
    actions: [
      'bet-connect',
      'start-operation', 
      'stop-operation',
      'get-websocket-logs',
      'get-operation-report',
      'reset-operation-report',
      'get-connection-status'
    ]
  });
} 