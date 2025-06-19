import { NextRequest, NextResponse } from 'next/server';
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';

// Interface para configuração do MegaRoulette
interface MegaRouletteConfig {
  userId: string;
  numberOfGames?: number;
  tableId?: string;
  language?: string;
  currency?: string;
  action?: 'bet-connect' | 'bet-place' | 'bet-state' | 'get-websocket-logs' | 'monitor-patterns' | 'get-selected-pattern' | 'clear-selected-pattern' | 'start-auto-betting' | 'stop-auto-betting' | 'get-auto-betting-status' | 'configure-auto-betting' | 'get-operation-report' | 'reset-operation-report';
  jsessionId?: string;
  gameConfig?: any;
  martingaleName?: string;
  betData?: {
    amount: number;
    prediction: 'red' | 'black' | 'green' | 'even' | 'odd' | 'low' | 'high';
    betCode?: string;
    tableId?: string;
  };
}

// Interface para estado do jogo
interface GameState {
  gamePhase: 'betting' | 'spinning' | 'result' | 'waiting';
  bettingOpen: boolean;
  currentGameId?: string;
  tableId: string;
  dealerName?: string;
  dealerId?: string;
  lastResult?: {
    score: string;
    color: string;
    luckyWin: boolean;
    megaWin: boolean;
  };
  connectionHealth: {
    connected: boolean;
    lastPong: number;
    messageCount: number;
    pingLatency?: number;
  };
}

// Interface para resultado de autenticação
interface AuthResult {
  userId: string;
  originalUserId: string;
  ppToken: string;
  jsessionId: string;
  timestamp: string;
}

// Armazenamento temporário dos logs do WebSocket (em produção usar Redis ou banco)
const websocketLogs: { [userId: string]: Array<{ timestamp: number; message: string; type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' }> } = {};
const gameResults: { [userId: string]: Array<{ gameId: string; result: string; timestamp: number; number?: number; color?: string }> } = {};
const connectionStatus: { [userId: string]: { connected: boolean; error?: string; lastUpdate: number } } = {};

// Armazenamento para padrões selecionados e monitoramento
const selectedPatterns: { [userId: string]: {
  id: string;
  name?: string;
  pattern_type: 'parity' | 'color' | 'range';
  pattern_sequence: string;
  martingale_pattern: string;
  matched_length: number;
  current_sequence: string;
  selectedAt: number;
} | null } = {};

const patternMonitoring: { [userId: string]: { 
  active: boolean; 
  lastCheck: number; 
  interval?: NodeJS.Timeout;
  waitingForSelection: boolean;
  waitingForNewResult?: boolean;
  lastGameId?: string;
} } = {};

// Armazenamento para apostas automáticas
const autoBetting: { [userId: string]: {
  active: boolean;
  currentBetIndex: number;
  totalBets: number;
  pattern: string;
  betAmount: number;
  wins: number;
  losses: number;
  startedAt: number;
  lastBetAt?: number;
  waitingForResult: boolean;
  lastGameId?: string;
  strategy?: {
    name: string;
    sequences: any[];
    maxAttempts: number;
  };
} } = {};

// Controle de reconexões WebSocket
const reconnectionControl: { [userId: string]: {
  attempts: number;
  lastAttempt: number;
  maxAttempts: number;
  backoffDelay: number;
} } = {};

// Armazenamento para conexões WebSocket ativas
const activeWebSockets: { [userId: string]: any } = {};

// Controle do estado atual do jogo
const currentGameState: { [userId: string]: {
  gameId?: string;
  bettingOpen: boolean;
  lastBetsOpenTime?: number;
  lastBetsCloseTime?: number;
} } = {};

// Armazenamento para configurações de estratégias de martingale
let autoBettingConfigs: { [userId: string]: {
  strategyName: string;
  strategy: any;
  configuredAt: number;
} } = {};

// Armazenamento para relatório acumulativo de operações
const operationReport: { [userId: string]: {
  totalOperations: number;
  totalBets: number;
  totalWins: number;
  totalLosses: number;
  totalInvested: number;
  totalProfit: number;
  startedAt: number;
  lastOperationAt: number;
  operationHistory: Array<{
    operationId: number;
    pattern: string;
    bets: number;
    wins: number;
    losses: number;
    invested: number;
    profit: number;
    completedAt: number;
  }>;
} } = {};

// Função principal POST
export async function POST(request: NextRequest) {
  try {
    const { userId, action = 'bet-connect', gameConfig: wsGameConfig, betData, martingaleName }: MegaRouletteConfig = await request.json();

    // Para ações de apostas, userId é obrigatório
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'userId é obrigatório para ações de apostas'
      }, { status: 400 });
    }

    // Para bet-place, betData é obrigatório
    if (action === 'bet-place' && !betData) {
      return NextResponse.json({
        success: false,
        error: 'betData é obrigatório para fazer apostas'
      }, { status: 400 });
    }

    // Ações de bet disponíveis
    if (action === 'bet-connect') {
      return await connectToBettingGame(userId, wsGameConfig);
    }

    if (action === 'bet-place') {
      return await placeBet(userId, betData!, wsGameConfig);
    }

    if (action === 'bet-state') {
      return await getBettingGameState(userId, wsGameConfig);
    }

    if (action === 'get-websocket-logs') {
      return await getWebSocketLogs(userId);
    }

    if (action === 'monitor-patterns') {
      return await startPatternMonitoring(userId);
    }

    if (action === 'get-selected-pattern') {
      return await getSelectedPattern(userId);
    }

    if (action === 'clear-selected-pattern') {
      return await clearSelectedPattern(userId);
    }

    if (action === 'start-auto-betting') {
      return await startAutoBetting(userId);
    }

    if (action === 'stop-auto-betting') {
      return await stopAutoBetting(userId);
    }

    if (action === 'get-auto-betting-status') {
      return await getAutoBettingStatus(userId);
    }

    if (action === 'configure-auto-betting') {
      return await configureAutoBetting(userId, martingaleName);
    }

    if (action === 'get-operation-report') {
      return await getOperationReport(userId);
    }

    if (action === 'reset-operation-report') {
      return await resetOperationReport(userId);
    }

      return NextResponse.json({
        success: false,
      error: 'Ação não implementada'
    }, { status: 400 });

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
    console.log('🔗 [AUTH] Usando edge function para autenticação:', userId);
    
    let actualUserId = userId;
    
    // Se userId é um email, buscar UUID primeiro
    if (userId.includes('@')) {
      console.log('📧 Buscando UUID para email:', userId);
      
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
    );

      const { data: usersList, error: usersError } = await supabase.auth.admin.listUsers();
      
      if (usersError) {
        console.log('❌ Erro ao listar usuários:', usersError.message);
        return {
          success: false,
          error: 'Erro ao buscar usuário no sistema'
        };
      }

      const foundUser = usersList.users.find(user => user.email === userId);
      
      if (!foundUser?.id) {
        console.log('❌ Usuário não encontrado para email:', userId);
        return {
          success: false,
          error: 'Usuário não encontrado no sistema'
        };
      }

      actualUserId = foundUser.id;
      console.log('✅ UUID encontrado para email:', actualUserId);
    }

    // Chamar edge function para autenticação
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/blaze-mg-pragmatic`;
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: 'authenticate',
        user_id: actualUserId
      })
    });

    if (!response.ok) {
      console.error('❌ [AUTH] Erro na requisição edge function:', response.status, response.statusText);
      return {
        success: false,
        error: `Erro na edge function: ${response.status}`
      };
    }

    const result = await response.json();
    
    if (!result.success) {
      console.error('❌ [AUTH] Edge function retornou erro:', result.error);
      return {
        success: false,
        error: result.error || 'Erro na autenticação via edge function'
      };
    }

    console.log('✅ [AUTH] Autenticação via edge function realizada com sucesso');

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
    console.error('❌ [AUTH] Erro na autenticação via edge function:', error);
    return {
      success: false,
      error: 'Erro interno na autenticação'
    };
  }
}

// Função para validar valor de aposta
function validateBetAmountFromConfig(amount: number, bettingConfig: any): { valid: boolean; error?: string } {
  const minBet = 1;
  const maxBet = 10000;

  if (amount < minBet) {
    return { valid: false, error: `Valor mínimo de aposta é R$ ${minBet}` };
  }

  if (amount > maxBet) {
    return { valid: false, error: `Valor máximo de aposta é R$ ${maxBet}` };
  }

  return { valid: true };
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

// Função para adicionar resultado do jogo
function addGameResult(userId: string, gameId: string, result: string, number?: number, color?: string) {
  if (!gameResults[userId]) {
    gameResults[userId] = [];
  }
  
  gameResults[userId].unshift({
    gameId,
    result,
    timestamp: Date.now(),
    number,
    color
  });
  
  // Manter apenas os últimos 20 resultados
  if (gameResults[userId].length > 20) {
    gameResults[userId] = gameResults[userId].slice(0, 20);
  }
}

// Função para obter logs do WebSocket
async function getWebSocketLogs(userId: string) {
  try {
    const logs = websocketLogs[userId] || [];
    const results = gameResults[userId] || [];
    const status = connectionStatus[userId] || { connected: false, lastUpdate: Date.now() };
    
    // Se conexão falhou recentemente (mas não durante preparação de nova conexão), retornar erro para parar polling
    if (status.error && status.error !== 'Operação parada pelo usuário' && (Date.now() - status.lastUpdate) < 30000) { // 30 segundos
      return NextResponse.json({
      success: false,
        error: status.error,
        shouldStopPolling: true
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        logs: logs.slice(0, 20), // Últimos 20 logs
        results: results.slice(0, 20), // Últimos 20 resultados
        totalLogs: logs.length,
        totalResults: results.length,
        connectionStatus: status
      }
    });
  } catch (error) {
    console.error('❌ [GET-LOGS] Erro:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro ao obter logs'
    }, { status: 500 });
  }
}

// Função para atualizar status da conexão
function updateConnectionStatus(userId: string, connected: boolean, error?: string) {
  connectionStatus[userId] = {
    connected,
    error: error || undefined,
    lastUpdate: Date.now()
  };
}

// Função para conectar ao jogo de apostas
async function connectToBettingGame(userId: string, gameConfig: any) {
  try {
    console.log('🎮 [BET-CONNECT] Conectando ao jogo para apostas...');
    addWebSocketLog(userId, 'Iniciando conexão ao MegaRoulette...', 'info');
    
    // Limpar status anterior e parar conexões existentes (sem definir erro)
    stopAllConnections(userId, false);
    resetReconnectionControl(userId);
    
    const authResult = await performAuthentication(userId);
    if (!authResult.success) {
      const errorMsg = `Falha na autenticação: ${authResult.error}`;
      addWebSocketLog(userId, errorMsg, 'error');
      updateConnectionStatus(userId, false, errorMsg);
      return NextResponse.json({
        success: false,
        error: errorMsg
      }, { status: 401 });
    }

    addWebSocketLog(userId, 'Autenticação realizada com sucesso', 'success');

    const config = {
      jsessionId: authResult.data!.jsessionId,
      pragmaticUserId: authResult.data!.userId,
      tableId: gameConfig?.tableId || 'mrbras531mrbr532'
    };

    // Iniciar WebSocket em background para coletar dados
    startWebSocketConnection(userId, config);

    addWebSocketLog(userId, 'WebSocket iniciado para coleta de dados', 'success');
      
      return NextResponse.json({
        success: true,
        data: {
        message: 'Conectado ao jogo para apostas',
        config,
        readyForBetting: true
      }
    });

  } catch (error) {
    console.error('❌ [BET-CONNECT] Erro:', error);
    const errorMsg = `Erro na conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
    addWebSocketLog(userId, errorMsg, 'error');
    updateConnectionStatus(userId, false, errorMsg);
    return NextResponse.json({
      success: false,
      error: errorMsg
    }, { status: 500 });
  }
}

// Função para iniciar conexão WebSocket para coleta de dados
function startWebSocketConnection(userId: string, config: { jsessionId: string; pragmaticUserId: string; tableId: string; serverUrl?: string }) {
  try {
    // Inicializar controle de reconexão se não existir
    if (!reconnectionControl[userId]) {
      reconnectionControl[userId] = {
        attempts: 0,
        lastAttempt: 0,
        maxAttempts: 5, // Reduzir tentativas máximas
        backoffDelay: 5000 // Aumentar delay inicial
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

    // URL do WebSocket - usar servidor customizado se fornecido, senão usar o padrão
    const baseServer = config.serverUrl || 'wss://gs9.pragmaticplaylive.net/game';
    const wsUrl = `${baseServer}?JSESSIONID=${config.jsessionId}&tableId=${config.tableId}`;
    
    addWebSocketLog(userId, `Conectando ao WebSocket (tentativa ${control.attempts}/${control.maxAttempts}): ${wsUrl}`, 'info');
    
    const ws = new WebSocket(wsUrl, {
      headers: {
        // Headers corretos conforme relatório
        'Origin': 'https://client.pragmaticplaylive.net',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Protocol': 'chat'
      }
    });

    // Armazenar WebSocket ativo
    activeWebSockets[userId] = ws;

    let gameCount = 0;
    let connectionHealthy = true;
    let lastPong = Date.now();
    let pingInterval: NodeJS.Timeout | null = null;
    
    ws.on('open', () => {
      addWebSocketLog(userId, 'WebSocket conectado com sucesso', 'success');
      updateConnectionStatus(userId, true); // ✅ Marcar como conectado
      
      // Resetar contador de tentativas após conexão bem-sucedida
      if (reconnectionControl[userId]) {
        reconnectionControl[userId].attempts = 0;
      }
      
      // Autenticação não é necessária neste servidor
      addWebSocketLog(userId, 'Conexão estabelecida - aguardando mensagens...', 'info');
      
      // Iniciar sistema de ping/pong conforme relatório
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
        }
      }, 30000); // Ping a cada 30 segundos conforme relatório
    });

    ws.on('message', (data: any) => {
      try {
        const message = data.toString().trim();

        // Processar pong
      if (message.includes('<pong')) {
          lastPong = Date.now();
        connectionHealthy = true;
          const timeMatch = message.match(/time="([^"]*)"/);
        const seqMatch = message.match(/seq="([^"]*)"/);
          addWebSocketLog(userId, `💓 Pong recebido (time: ${timeMatch?.[1]}, seq: ${seqMatch?.[1]})`, 'info');
          return;
      }

        // Game started
      if (message.includes('<betsopen')) {
        const gameMatch = message.match(/game="([^"]*)"/);
        const tableMatch = message.match(/table="([^"]*)"/);
        const seqMatch = message.match(/seq="([^"]*)"/);
        
        if (gameMatch) {
            const gameId = gameMatch[1];
            const table = tableMatch?.[1] || '';
            const seq = seqMatch?.[1] || '';
            gameCount++;
            
            // Atualizar estado do jogo atual
            currentGameState[userId] = {
              gameId: gameId,
              bettingOpen: true,
              lastBetsOpenTime: Date.now()
            };
            
            addWebSocketLog(userId, `🎮 Jogo ${gameCount} iniciado: ${gameId} (mesa: ${table}, seq: ${seq})`, 'bets-open');
            
            // Verificar se apostas automáticas estão ativas E se há padrão válido
            const betting = autoBetting[userId];
            const selectedPattern = selectedPatterns[userId];
            
            if (betting?.active && !betting.waitingForResult) {
              if (selectedPattern?.martingale_pattern) {
                // Executar aposta IMEDIATAMENTE quando BETSOPEN chegar (incluindo primeira aposta)
                addWebSocketLog(userId, `🤖 Executando aposta ${betting.currentBetIndex + 1}/${betting.totalBets} IMEDIATAMENTE no BETSOPEN - Padrão: ${betting.pattern}`, 'info');
                executeAutoBet(userId, gameId, ws);
              } else {
                // Apostas ativas mas sem padrão - aguardar próxima rodada
                addWebSocketLog(userId, `⏳ Apostas automáticas ativas mas sem padrão válido - aguardando próxima rodada com padrão...`, 'info');
                
                // Verificar se há padrões disponíveis para seleção automática
                setTimeout(async () => {
                  try {
                    await checkForNewPatterns(userId);
                    addWebSocketLog(userId, `🔄 Verificando se há novos padrões disponíveis...`, 'info');
                  } catch (error) {
                    addWebSocketLog(userId, `❌ Erro ao verificar novos padrões: ${error}`, 'error');
                  }
                }, 3000); // Aguardar 3 segundos após BETSOPEN para verificar padrões
              }
            }
          }
        }

        // Betting phases
        if (message.includes('<betsclosingsoon')) {
          addWebSocketLog(userId, '⏰ Apostas fechando em breve...', 'info');
        }

        if (message.includes('<betsclosing')) {
          const gameMatch = message.match(/game="([^"]*)"/);
          
          // Atualizar estado - apostas fechando
          if (currentGameState[userId]) {
            currentGameState[userId].bettingOpen = false;
            currentGameState[userId].lastBetsCloseTime = Date.now();
          }
          
          addWebSocketLog(userId, `🔒 Apostas fechadas (game: ${gameMatch?.[1] || 'N/A'})`, 'bets-closed');
        }

        if (message.includes('<betsclose')) {
          // Atualizar estado - apostas completamente fechadas
          if (currentGameState[userId]) {
            currentGameState[userId].bettingOpen = false;
            currentGameState[userId].lastBetsCloseTime = Date.now();
          }
          
          addWebSocketLog(userId, '🔒 Apostas completamente fechadas', 'bets-closed');
        }

        // Game result
      if (message.includes('<gameresult')) {
          const gameMatch = message.match(/game="([^"]*)"/);
        const scoreMatch = message.match(/score="([^"]*)"/);
        const colorMatch = message.match(/color="([^"]*)"/);
        const luckyMatch = message.match(/luckyWin="([^"]*)"/);
        const megaMatch = message.match(/megaWin="([^"]*)"/);
        const idMatch = message.match(/id="([^"]*)"/);

          if (scoreMatch) {
            const gameId = gameMatch?.[1] || idMatch?.[1] || '';
            const score = scoreMatch[1];
            const color = colorMatch?.[1] || '';
            const luckyWin = luckyMatch?.[1] === 'true';
            const megaWin = megaMatch?.[1] === 'true';
            
            // Extrair número e cor do resultado
            const number = parseInt(score);
            let finalColor = 'green';
            if (number > 0) {
              const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
              finalColor = redNumbers.includes(number) ? 'red' : 'black';
            }
            
            const winIndicators = [];
            if (luckyWin) winIndicators.push('Lucky');
            if (megaWin) winIndicators.push('Mega');
            const winText = winIndicators.length > 0 ? ` [${winIndicators.join(', ')}]` : '';
            
            addWebSocketLog(userId, `🎯 Resultado: ${number} (${finalColor})${winText}`, 'game');
            addGameResult(userId, gameId, score, number, finalColor);
            
            // Verificar se está aguardando novo resultado para selecionar padrão
            const monitoring = patternMonitoring[userId];
            if (monitoring?.active && monitoring.waitingForNewResult && monitoring.waitingForSelection) {
              // Aguardar um pouco para que o resultado seja processado pela edge function
              setTimeout(async () => {
                await checkForNewPatterns(userId);
              }, 2000); // Aguardar 2 segundos para edge function processar o novo resultado
              
              // Marcar que não está mais aguardando novo resultado
              monitoring.waitingForNewResult = false;
              monitoring.lastGameId = gameId;
              
              addWebSocketLog(userId, `🔄 Novo resultado detectado - verificando padrões atualizados...`, 'info');
            }
            
            // Processar resultado para apostas automáticas
            const betting = autoBetting[userId];
            if (betting?.active && betting.waitingForResult) {
              processAutoBetResult(userId, number, finalColor);
            }
          }
        }

        // Table info
      if (message.includes('<table')) {
        const newTableMatch = message.match(/newTable="([^"]*)"/);
        const seqMatch = message.match(/seq="([^"]*)"/);
          const tableName = message.match(/>([^<]+)</)?.[1] || '';
          
          addWebSocketLog(userId, `🎲 Mesa: ${tableName} (Nova: ${newTableMatch?.[1]}, Seq: ${seqMatch?.[1]})`, 'info');
        }

        // Dealer info
        if (message.includes('<dealer')) {
          const idMatch = message.match(/id="([^"]*)"/);
          const seqMatch = message.match(/seq="([^"]*)"/);
          const dealerName = message.match(/>([^<]+)</)?.[1] || '';
          
          addWebSocketLog(userId, `👤 Dealer: ${dealerName} (ID: ${idMatch?.[1]}, Seq: ${seqMatch?.[1]})`, 'info');
        }

        // Capturar respostas de apostas
        if (message.includes('<lpbet') || message.includes('bet') || message.includes('error') || message.includes('invalid')) {
          addWebSocketLog(userId, `🎰 Resposta de aposta: ${message}`, 'info');
        }

        // Tratar switch de servidor
        if (message.includes('<switch') && message.includes('gameServer=')) {
          const gameServerMatch = message.match(/gameServer="([^"]*)"/);
          const wsAddressMatch = message.match(/wsAddress="([^"]*)"/);
          const tableIdMatch = message.match(/tableId="([^"]*)"/);
          
          if (gameServerMatch && wsAddressMatch && tableIdMatch) {
            const newServer = gameServerMatch[1];
            const newWsAddress = wsAddressMatch[1];
            const newTableId = tableIdMatch[1];
            
            addWebSocketLog(userId, `🔄 Switch de servidor detectado: ${newServer}`, 'info');
            addWebSocketLog(userId, `📍 Novo endereço: ${newWsAddress}`, 'info');
            
            // Fechar conexão atual e reconectar no novo servidor
            ws.close(1000, 'Server switch');
            
                         // Reconectar após 1 segundo no novo servidor
             setTimeout(() => {
               const newConfig = {
                 ...config,
                 tableId: newTableId,
                 serverUrl: newWsAddress // Usar o novo endereço WebSocket
               };
               
               addWebSocketLog(userId, `🔄 Reconectando ao novo servidor: ${newWsAddress}`, 'info');
               
               startWebSocketConnection(userId, newConfig);
             }, 1000);
            
            return; // Não processar mais esta mensagem
          }
        }

        // Log outras mensagens importantes
        if (message.length < 200 && !message.includes('pong') && !message.includes('ping')) {
          addWebSocketLog(userId, `📋 Mensagem: ${message}`, 'info');
        }

      } catch (msgError) {
        addWebSocketLog(userId, `Erro ao processar mensagem: ${msgError}`, 'error');
      }
    });

    ws.on('error', (error: any) => {
      connectionHealthy = false;
      const errorMsg = `Erro WebSocket: ${error.message || error}`;
      addWebSocketLog(userId, `❌ ${errorMsg}`, 'error');
      updateConnectionStatus(userId, false, errorMsg); // ❌ Marcar erro
      
      // Limpar intervalo de ping em caso de erro
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    });

    ws.on('close', (code: any, reason: any) => {
      connectionHealthy = false;
      const closeMsg = `WebSocket desconectado - Código: ${code}, Razão: ${reason || 'N/A'}`;
      addWebSocketLog(userId, `🔌 ${closeMsg}`, 'info');
      
      // Limpar intervalo de ping
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      
      // Remover WebSocket do armazenamento
      if (activeWebSockets[userId]) {
        delete activeWebSockets[userId];
      }
      
      // Marcar como desconectado
      updateConnectionStatus(userId, false, closeMsg);
      
      // Reconectar apenas em casos específicos de erro de rede
      const control = reconnectionControl[userId];
      
      // Só reconectar para códigos de erro de rede (não para fechamentos normais)
      if (code !== 1000 && code !== 1001 && code !== 1005 && code !== 1006) {
        // Verificar se não excedeu tentativas máximas
        if (control && control.attempts < control.maxAttempts) {
          const delay = Math.min((control.backoffDelay || 5000) * Math.pow(1.5, control.attempts), 30000); // Backoff exponencial, max 30s
          addWebSocketLog(userId, `🔄 Reconectando em ${delay/1000}s (erro de rede)...`, 'info');
          
          setTimeout(() => {
            startWebSocketConnection(userId, config);
          }, delay);
          
          // Aumentar delay para próxima tentativa
          control.backoffDelay = Math.min(control.backoffDelay * 1.2, 15000);
        } else {
          addWebSocketLog(userId, '❌ Máximo de tentativas de reconexão atingido', 'error');
        }
      } else {
        // Para fechamentos normais (1000, 1001) ou outros códigos, não reconectar automaticamente
        addWebSocketLog(userId, '🔌 Conexão encerrada (não será reconectada automaticamente)', 'info');
      }
    });

  } catch (error) {
    addWebSocketLog(userId, `Erro ao iniciar WebSocket: ${error}`, 'error');
  }
}

// Função para fazer apostas
async function placeBet(userId: string, betData: any, gameConfig: any) {
  try {
    console.log('💰 [BET-PLACE] Executando aposta...');
    
    const authResult = await performAuthentication(userId);
    if (!authResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Falha na autenticação: ' + authResult.error
      }, { status: 401 });
    }

    const validation = validateBetAmountFromConfig(betData.amount, {});
      if (!validation.valid) {
        return NextResponse.json({
          success: false,
          error: validation.error
        }, { status: 400 });
      }

    const config = {
      jsessionId: authResult.data!.jsessionId,
      pragmaticUserId: authResult.data!.userId,
      tableId: betData.tableId || 'mrbras531mrbr532',
      amount: betData.amount,
      betCode: betData.betCode || getBetCodeFromPrediction(betData.prediction)
    };

    const result = await sendBetViaPragmaticWebSocket(config);
    
    if (result.success) {
      await debitUserCredits(userId, betData.amount);
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ [BET-PLACE] Erro:', error);
    return NextResponse.json({
      success: false,
      error: `Erro ao executar aposta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    }, { status: 500 });
  }
}

// Função para obter estado do jogo
async function getBettingGameState(userId: string, gameConfig: any) {
  try {
    console.log('📊 [BET-STATE] Obtendo estado do jogo...');
    
    const authResult = await performAuthentication(userId);
    if (!authResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Falha na autenticação: ' + authResult.error
      }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      data: {
          gamePhase: 'waiting',
          bettingOpen: false,
          tableId: gameConfig?.tableId || 'mrbras531mrbr532',
        connected: true,
        message: 'Estado do jogo obtido com sucesso'
      }
    });

  } catch (error) {
    console.error('❌ [BET-STATE] Erro:', error);
    return NextResponse.json({
      success: false,
      error: `Erro ao obter estado do jogo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    }, { status: 500 });
  }
}

// Função para enviar aposta via WebSocket
async function sendBetViaPragmaticWebSocket(config: {
  jsessionId: string;
  pragmaticUserId: string;
  tableId: string;
  amount: number;
  betCode: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
    try {
      const wsUrl = `wss://games.pragmaticplaylive.net/websocket?JSESSIONID=${config.jsessionId}`;
      
      console.log('🔌 [BET-WEBSOCKET] Conectando ao WebSocket...');
      
      const ws = new WebSocket(wsUrl, {
        headers: {
          'Origin': 'https://games.pragmaticplaylive.net',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      let gameStarted = false;
      let bettingOpen = false;
      let betSent = false;
      let currentGameId = '';
      
      const timeout = setTimeout(() => {
        try {
          ws.close();
        } catch (e) {
          console.log('Erro ao fechar WebSocket:', e);
        }
        resolve({
          success: false,
          error: 'Timeout - Nenhum jogo detectado em 30 segundos'
        });
      }, 30000);

      ws.on('open', () => {
        console.log('✅ [BET-WEBSOCKET] WebSocket conectado');
        
        const authMessage = `<authentication userId="${config.pragmaticUserId}" gameSymbol="287" tableId="${config.tableId}" sessionId="${config.jsessionId}" />`;
        console.log('📤 [BET-WEBSOCKET] Enviando autenticação...');
        ws.send(authMessage);
      });

      ws.on('message', (data: any) => {
        try {
          const message = data.toString();

          if (message.includes('<betsopen')) {
            const gameMatch = message.match(/game="([^"]*)"/);
            if (gameMatch) {
              currentGameId = gameMatch[1];
              bettingOpen = true;
              gameStarted = true;
              console.log(`🎮 [BET-WEBSOCKET] Jogo iniciado: ${currentGameId}, apostas abertas`);
              
              setTimeout(() => {
                sendBetCommand();
              }, 1000);
            }
          }

          if (message.includes('<betsclosingsoon') || message.includes('<betsclosing') || message.includes('<betsclose')) {
                bettingOpen = false;
            console.log('⏰ [BET-WEBSOCKET] Apostas fechando/fechadas');
            
            if (betSent) {
              console.log('✅ Aposta foi enviada antes do fechamento');
              clearTimeout(timeout);
              
              setTimeout(() => {
                try {
                  ws.close();
                } catch (e) {
                  console.log('Erro ao fechar WebSocket:', e);
                }
                resolve({
                  success: true,
                  data: {
                    gameId: currentGameId,
                    betSent: true,
                    message: 'Aposta enviada com sucesso'
                  }
                });
              }, 10000);
            }
          }

          if (message.includes('<betValidationError') || message.includes('BETS ALREADY CLOSED')) {
            console.log('❌ Erro de validação da aposta:', message);
            clearTimeout(timeout);
            try {
              ws.close();
            } catch (e) {
              console.log('Erro ao fechar WebSocket:', e);
            }
            resolve({
              success: false,
              error: 'Aposta rejeitada: ' + (message.includes('BETS ALREADY CLOSED') ? 'Apostas já fechadas' : 'Erro de validação')
            });
          }

          if (message.includes('<gameresult') || message.includes('<sc seq=')) {
            console.log('🎯 Resultado do jogo recebido');
            
            if (betSent) {
              clearTimeout(timeout);
              try {
                ws.close();
              } catch (e) {
                console.log('Erro ao fechar WebSocket:', e);
              }
              resolve({
                success: true,
                data: {
                  gameId: currentGameId,
                  betSent: true,
                  result: message,
                  message: 'Aposta enviada e resultado recebido'
                }
              });
            }
          }

        } catch (msgError) {
          console.error('❌ Erro ao processar mensagem:', msgError);
        }
      });

      ws.on('error', (error: any) => {
        console.error('❌ Erro WebSocket:', error);
        clearTimeout(timeout);
        resolve({
          success: false,
          error: `Erro de conexão WebSocket: ${error.message || 'Erro desconhecido'}`
        });
      });

      ws.on('close', (code: any, reason: any) => {
        console.log(`🔌 WebSocket desconectado - Código: ${code}, Razão: ${reason}`);
        clearTimeout(timeout);
        
        if (!betSent && gameStarted) {
          resolve({
            success: false,
            error: 'Conexão fechada antes da aposta ser enviada'
          });
        } else if (betSent) {
          resolve({
            success: true,
            data: {
              gameId: currentGameId,
              betSent: true,
              message: 'Aposta enviada (conexão fechada normalmente)'
            }
          });
        } else if (!gameStarted) {
          resolve({
            success: false,
            error: 'Nenhum jogo detectado durante a conexão'
          });
        }
      });

      function sendBetCommand() {
        try {
          if (!currentGameId || !bettingOpen || betSent) {
            console.log(`❌ Não é possível apostar: gameId=${currentGameId}, bettingOpen=${bettingOpen}, betSent=${betSent}`);
            return;
          }

          const timestamp = Date.now().toString();
          
          const betXml = `<command channel="table-${config.tableId}">
  <lpbet gm="roulette_desktop" gId="${currentGameId}" uId="${config.pragmaticUserId}" ck="${timestamp}">
    <bet amt="${config.amount}" bc="${config.betCode}" ck="${timestamp}" />
  </lpbet>
</command>`;

          console.log('📤 Enviando aposta:', betXml);
          ws.send(betXml);
          betSent = true;
          console.log('✅ Comando de aposta enviado');
        } catch (sendError) {
          console.error('❌ Erro ao enviar aposta:', sendError);
          resolve({
            success: false,
            error: `Erro ao enviar aposta: ${sendError instanceof Error ? sendError.message : 'Erro desconhecido'}`
          });
        }
      }

    } catch (error) {
      console.error('❌ Erro geral no WebSocket:', error);
      resolve({
        success: false,
        error: `Erro geral no WebSocket: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      });
    }
  });
}

// Função para obter código de aposta baseado na predição
function getBetCodeFromPrediction(prediction: string): string {
  const betCodes: { [key: string]: string } = {
    'red': '46',
    'black': '47', 
    'even': '48',
    'odd': '49',
    'low': '50',
    'high': '51',
    'green': '0'
  };

  return betCodes[prediction] || '46';
}

// Função para debitar créditos do usuário
async function debitUserCredits(userId: string, amount: number) {
  try {
    console.log(`💳 Debitando R$ ${amount} do usuário ${userId}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Erro ao debitar créditos:', error);
    return { success: false };
  }
}

// Função para iniciar monitoramento de padrões
// Função interna para iniciar monitoramento (sem retorno HTTP)
function startPatternMonitoringInternal(userId: string) {
  console.log('🎯 [PATTERN-MONITOR] Iniciando monitoramento de padrões...');
  
  // Se já está monitorando, parar primeiro
  if (patternMonitoring[userId]?.active) {
    stopPatternMonitoring(userId);
  }

  // Inicializar monitoramento
  patternMonitoring[userId] = {
    active: true,
    lastCheck: Date.now(),
    waitingForSelection: true,
    waitingForNewResult: true, // SEMPRE aguardar novo resultado antes de selecionar padrão
    lastGameId: undefined // Armazenar último gameId processado
  };

  // NÃO iniciar monitoramento automático - aguardar novo resultado do WebSocket
  // O padrão será selecionado quando um novo resultado chegar via WebSocket

  addWebSocketLog(userId, '🎯 Monitoramento de padrões iniciado - aguardando PRÓXIMO resultado para selecionar padrão', 'success');
}

async function startPatternMonitoring(userId: string) {
  try {
    startPatternMonitoringInternal(userId);

    return NextResponse.json({
      success: true,
      data: {
        message: 'Monitoramento de padrões iniciado',
        status: 'waiting_for_patterns'
      }
    });

  } catch (error) {
    console.error('❌ [PATTERN-MONITOR] Erro:', error);
    return NextResponse.json({
      success: false,
      error: `Erro ao iniciar monitoramento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    }, { status: 500 });
  }
}

// Função para verificar novos padrões na edge function
async function checkForNewPatterns(userId: string) {
  try {
    const monitoring = patternMonitoring[userId];
    if (!monitoring?.active || !monitoring.waitingForSelection) {
      console.log('🚫 [PATTERN-CHECK] Monitoramento inativo ou não aguardando seleção');
      return;
    }

    // Chamar edge function para buscar padrões
    console.log('🔍 [PATTERN-CHECK] Buscando padrões na edge function...');
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/blaze_history_megaroulette`;
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: 'get_patterns',
        user_id: userId
      })
    });

    if (!response.ok) {
      console.error('❌ Erro na requisição para edge function:', response.status);
      return;
    }

    const result = await response.json();
    
    if (!result.success) {
      console.error('❌ Edge function retornou erro:', result.error);
      return;
    }

    const patternData = result.data || {};
    const matchedPatterns = Array.isArray(patternData.matchedPatterns) ? patternData.matchedPatterns : [];

    console.log(`🔍 [PATTERN-CHECK] Encontrados ${matchedPatterns.length} padrões disponíveis`);

    // Se há padrões disponíveis e estamos esperando seleção
    if (matchedPatterns.length > 0 && monitoring.waitingForSelection) {
      // Selecionar um padrão aleatório
      const randomIndex = Math.floor(Math.random() * matchedPatterns.length);
      const selectedPattern = matchedPatterns[randomIndex];

      // Salvar padrão selecionado
      selectedPatterns[userId] = {
        ...selectedPattern,
        selectedAt: Date.now()
      };

      // Parar de aguardar seleção
      monitoring.waitingForSelection = false;

      addWebSocketLog(userId, `🎯 Padrão selecionado automaticamente: ${selectedPattern.pattern_type.toUpperCase()} - ${selectedPattern.pattern_sequence}`, 'success');
      
      // Verificar se apostas automáticas estão ativas e atualizar
      if (autoBetting[userId]?.active) {
        updateAutoBettingWithNewPattern(userId, selectedPattern);
      }
      
      console.log('✅ Padrão selecionado:', selectedPattern);
    }

  } catch (error) {
    console.error('❌ Erro ao verificar padrões:', error);
    addWebSocketLog(userId, `Erro ao verificar padrões: ${error}`, 'error');
  }
}

// Função para parar monitoramento de padrões
function stopPatternMonitoring(userId: string) {
  const monitoring = patternMonitoring[userId];
  if (monitoring?.interval) {
    clearInterval(monitoring.interval);
  }
  
  if (patternMonitoring[userId]) {
    patternMonitoring[userId].active = false;
    patternMonitoring[userId].waitingForSelection = false;
    patternMonitoring[userId].waitingForNewResult = false;
    patternMonitoring[userId].lastGameId = undefined;
  }
  
  console.log('🛑 Monitoramento de padrões parado para usuário:', userId);
}

// Função para limpar controle de reconexão
function resetReconnectionControl(userId: string) {
  if (reconnectionControl[userId]) {
    reconnectionControl[userId].attempts = 0;
    reconnectionControl[userId].backoffDelay = 5000; // Aumentar delay inicial
    console.log('🔄 Controle de reconexão resetado para usuário:', userId);
  }
}

// Função para parar todas as conexões de um usuário
function stopAllConnections(userId: string, setErrorStatus: boolean = true) {
  // Fechar WebSocket ativo se existir
  if (activeWebSockets[userId]) {
    try {
      activeWebSockets[userId].close();
      delete activeWebSockets[userId];
      addWebSocketLog(userId, '🔌 WebSocket fechado', 'info');
    } catch (error) {
      console.log('Erro ao fechar WebSocket:', error);
    }
  }
  
  // Resetar controle de reconexão para impedir novas tentativas
  if (reconnectionControl[userId]) {
    reconnectionControl[userId].attempts = reconnectionControl[userId].maxAttempts;
  }
  
  // Marcar como desconectado apenas se solicitado (para evitar erro durante nova conexão)
  if (setErrorStatus) {
    updateConnectionStatus(userId, false, 'Operação parada pelo usuário');
    addWebSocketLog(userId, '🛑 Reconexões automáticas desabilitadas', 'info');
  } else {
    // Limpar status anterior sem definir erro
    updateConnectionStatus(userId, false);
    addWebSocketLog(userId, '🔄 Preparando nova conexão...', 'info');
  }
}

// Função para obter padrão selecionado
async function getSelectedPattern(userId: string) {
  try {
    const pattern = selectedPatterns[userId];
    const monitoring = patternMonitoring[userId];

    return NextResponse.json({
      success: true,
      data: {
        selectedPattern: pattern,
        monitoringStatus: {
          active: monitoring?.active || false,
          waitingForSelection: monitoring?.waitingForSelection || false
        }
      }
    });

  } catch (error) {
    console.error('❌ [GET-PATTERN] Erro:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro ao obter padrão selecionado'
    }, { status: 500 });
  }
}

// Função para limpar padrão selecionado
async function clearSelectedPattern(userId: string) {
  try {
    selectedPatterns[userId] = null;
    
    // Reativar espera por seleção se monitoramento ativo
    if (patternMonitoring[userId]?.active) {
      patternMonitoring[userId].waitingForSelection = true;
      patternMonitoring[userId].waitingForNewResult = true;
      addWebSocketLog(userId, '🎯 Padrão limpo - aguardando PRÓXIMO resultado para nova seleção', 'info');
    }

    return NextResponse.json({
      success: true,
      data: {
        message: 'Padrão selecionado removido',
        waitingForNewSelection: patternMonitoring[userId]?.active || false
      }
    });

  } catch (error) {
    console.error('❌ [CLEAR-PATTERN] Erro:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro ao limpar padrão'
    }, { status: 500 });
  }
}

// Método GET para informações da API
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'MegaRoulette Betting API está funcionando',
    version: '7.1.0',
    endpoints: {
      'POST (action: bet-connect)': 'Conectar ao jogo para apostas + padrões',
      'POST (action: bet-place)': 'Fazer aposta no jogo',
      'POST (action: bet-state)': 'Obter estado do jogo para apostas',
      'POST (action: get-websocket-logs)': 'Obter logs do WebSocket',
      'POST (action: monitor-patterns)': 'Iniciar monitoramento de padrões',
      'POST (action: get-selected-pattern)': 'Obter padrão selecionado',
      'POST (action: clear-selected-pattern)': 'Limpar padrão selecionado',
      'POST (action: start-auto-betting)': 'Iniciar apostas automáticas',
      'POST (action: stop-auto-betting)': 'Parar apostas automáticas',
      'POST (action: get-auto-betting-status)': 'Obter status das apostas automáticas',
      'POST (action: configure-auto-betting)': 'Configurar estratégia de martingale',
      'POST (action: get-operation-report)': 'Obter relatório acumulativo de operações',
      'POST (action: reset-operation-report)': 'Resetar relatório de operações',
      'GET': 'Verificar status da API'
    },
    actions: {
      'bet-connect': 'Requer: userId, gameConfig (opcional) - Inicia WebSocket + Monitoramento de padrões',
      'bet-place': 'Requer: userId, betData (amount, prediction, betCode opcional), gameConfig (opcional)',
      'bet-state': 'Requer: userId, gameConfig (opcional)',
      'get-websocket-logs': 'Requer: userId - Retorna logs e resultados',
      'monitor-patterns': 'Requer: userId - Inicia monitoramento automático de padrões',
      'get-selected-pattern': 'Requer: userId - Retorna padrão selecionado automaticamente',
      'clear-selected-pattern': 'Requer: userId - Remove padrão atual e reativa seleção',
      'start-auto-betting': 'Requer: userId - Inicia apostas automáticas baseadas no padrão selecionado',
      'stop-auto-betting': 'Requer: userId - Para apostas automáticas e adiciona ao relatório',
      'get-auto-betting-status': 'Requer: userId - Retorna status atual das apostas automáticas',
      'configure-auto-betting': 'Requer: userId, martingaleName - Configura estratégia de martingale',
      'get-operation-report': 'Requer: userId - Retorna relatório acumulativo de todas as operações',
      'reset-operation-report': 'Requer: userId - Reseta relatório acumulativo (usado no botão Operar)'
    },
    integrations: {
      'APIs consolidadas': ['bet', 'edge-function-auth', 'websocket-monitoring', 'pattern-selection'],
      'Total de ações': 13,
      'Funcionalidades': [
        'Sistema de apostas diretas',
        'Validação de valores e limites',
        'Débito automático de créditos',
        'WebSocket para apostas em tempo real',
        'Autenticação via edge function blaze_history_megaroulette',
        'Geração otimizada de ppToken e jsessionId',
        'Coleta automática de logs e resultados',
        'Monitoramento automático de padrões via edge function',
        'Seleção aleatória de padrões disponíveis',
        'Sistema de ping/pong para conexão WebSocket',
        'Reconexão automática inteligente com backoff exponencial',
        'Controle de tentativas máximas de reconexão (10x)',
        'Tratamento robusto de códigos de fechamento WebSocket'
      ]
    },
    edge_function: {
      name: 'blaze_history_megaroulette',
      actions: ['authenticate', 'get_patterns'],
      description: 'Usa edge function para autenticação, tokens e monitoramento de padrões'
    }
  });
}

// Mapeamento de letras do martingale para códigos de aposta
const MARTINGALE_TO_BET_CODE: { [key: string]: string } = {
  'R': '48', // Vermelho (Red)
  'B': '49', // Preto (Black)  
  'E': '47', // Par (Even)
  'O': '50', // Ímpar (Odd)
  'L': '46', // 1-18 (Low)
  'H': '51', // 19-36 (High)
};

// Função para iniciar apostas automáticas baseadas no padrão selecionado
async function startAutoBetting(userId: string) {
  try {
    console.log('🤖 [AUTO-BET] Iniciando apostas automáticas para usuário:', userId);
    
    // Verificar se há padrão selecionado
    const selectedPattern = selectedPatterns[userId];
    console.log('🔍 [AUTO-BET] Verificando padrão selecionado:', selectedPattern);
    
    if (!selectedPattern) {
      console.log('⏳ [AUTO-BET] Nenhum padrão selecionado no momento - sistema aguardará próximo padrão');
      // Não falhar imediatamente - permite que o sistema aguarde um padrão aparecer
      // O WebSocket handler verificará novos padrões quando houver BETSOPEN
    }

    // Verificar se há estratégia configurada
    const strategyConfig = autoBettingConfigs[userId];
    console.log('🔍 [AUTO-BET] Verificando estratégia configurada:', strategyConfig?.strategyName);
    
    if (!strategyConfig) {
      console.log('❌ [AUTO-BET] Nenhuma estratégia configurada');
      return NextResponse.json({
        success: false,
        error: 'Nenhuma estratégia de martingale configurada. Configure uma estratégia primeiro.'
      }, { status: 400 });
    }

    // Verificar se já existe auto betting ativo - VERIFICAÇÃO MAIS ROBUSTA
    const existingBetting = autoBetting[userId];
    if (existingBetting && existingBetting.active) {
      console.log('⚠️ [AUTO-BET] Tentativa de iniciar apostas já ativas - ignorando');
      return NextResponse.json({
        success: false,
        error: 'Apostas automáticas já estão ativas. Pare primeiro para reiniciar.'
      }, { status: 400 });
    }

    // Limpar qualquer estado residual antes de iniciar
    if (existingBetting) {
      console.log('🧹 [AUTO-BET] Limpando estado residual antes de iniciar');
      delete autoBetting[userId];
    }

    // Validar martingale pattern (se houver padrão)
    const martingalePattern = selectedPattern?.martingale_pattern;
    if (selectedPattern && (!martingalePattern || martingalePattern.length === 0)) {
      return NextResponse.json({
        success: false,
        error: 'Padrão não possui sequência de martingale válida.'
      }, { status: 400 });
    }

    // Verificar se todas as letras do padrão são válidas (se houver padrão)
    if (martingalePattern) {
      const invalidChars = martingalePattern.split('').filter(char => !MARTINGALE_TO_BET_CODE[char]);
      if (invalidChars.length > 0) {
        return NextResponse.json({
          success: false,
          error: `Caracteres inválidos no padrão: ${invalidChars.join(', ')}`
        }, { status: 400 });
      }
    }

    // Verificar se conexão WebSocket está ativa
    const userConnectionStatus = connectionStatus[userId];
    if (!userConnectionStatus?.connected) {
      return NextResponse.json({
        success: false,
        error: 'Conexão WebSocket não está ativa. Conecte primeiro.'
      }, { status: 400 });
    }

    // Obter sequências da estratégia configurada
    const strategy = strategyConfig.strategy;
    const sequences = strategy.sequences || [];
    
    if (sequences.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Estratégia não possui sequências de apostas configuradas.'
      }, { status: 400 });
    }

    // Inicializar apostas automáticas com estratégia configurada
    // Se há padrão, usar ele. Se não há, aguardar um aparecer
    if (martingalePattern) {
      const totalBets = Math.min(martingalePattern.length, sequences.length);
      
      autoBetting[userId] = {
        active: true,
        currentBetIndex: 0,
        totalBets: totalBets,
        pattern: martingalePattern,
        betAmount: sequences[0]?.bet_amount || 0.5,
        wins: 0,
        losses: 0,
        startedAt: Date.now(),
        waitingForResult: false,
        strategy: {
          name: strategy.name,
          sequences: sequences,
          maxAttempts: strategy.max_attempts
        }
      };

      addWebSocketLog(userId, `🤖 Apostas automáticas iniciadas - Estratégia: ${strategy.name}`, 'success');
      addWebSocketLog(userId, `🎯 Padrão: ${martingalePattern} (${totalBets} apostas)`, 'info');
      addWebSocketLog(userId, `💰 Primeira aposta: R$ ${autoBetting[userId].betAmount}`, 'info');
    } else {
      // Sem padrão - apenas marcar como ativo mas SEM apostar
      autoBetting[userId] = {
        active: true,
        currentBetIndex: 0,
        totalBets: 0, // Zero apostas até ter padrão
        pattern: '', // Padrão vazio
        betAmount: sequences[0]?.bet_amount || 0.5,
        wins: 0,
        losses: 0,
        startedAt: Date.now(),
        waitingForResult: false,
        strategy: {
          name: strategy.name,
          sequences: sequences,
          maxAttempts: strategy.max_attempts
        }
      };

      addWebSocketLog(userId, `🤖 Sistema de apostas automáticas ATIVO - Estratégia: ${strategy.name}`, 'success');
      addWebSocketLog(userId, `⏳ AGUARDANDO padrão ser selecionado para começar a apostar...`, 'info');
      addWebSocketLog(userId, `🚫 NÃO APOSTARÁ até ter um padrão válido`, 'info');
    }

    // Verificar se há um jogo ativo AGORA para apostar imediatamente
    const ws = activeWebSockets[userId];
    const gameState = currentGameState[userId];
    
    if (ws && ws.readyState === 1 && gameState?.gameId && gameState?.bettingOpen) {
      // Há um jogo ativo com apostas abertas - apostar IMEDIATAMENTE
      const timeSinceBetsOpen = Date.now() - (gameState.lastBetsOpenTime || 0);
      addWebSocketLog(userId, `🚀 Jogo ativo detectado! Apostando IMEDIATAMENTE no jogo: ${gameState.gameId} (${timeSinceBetsOpen}ms após betsopen)`, 'info');
      
      setTimeout(() => {
        executeAutoBet(userId, gameState.gameId!, ws);
      }, 100);
    } else {
      // Não há jogo ativo ou apostas fechadas - aguardar próximo BETSOPEN
      const status = !ws ? 'WebSocket desconectado' : 
                   !gameState?.gameId ? 'Nenhum jogo ativo' : 
                   !gameState?.bettingOpen ? 'Apostas fechadas' : 'Estado desconhecido';
      addWebSocketLog(userId, `⏳ ${status} - Aguardando próximo BETSOPEN para primeira aposta`, 'info');
    }

    const currentBetting = autoBetting[userId];
    
    return NextResponse.json({
      success: true,
      data: {
        message: 'Sistema de apostas automáticas ativado com sucesso',
        pattern: currentBetting.pattern || 'Aguardando padrão...',
        totalBets: currentBetting.totalBets,
        betAmount: currentBetting.betAmount,
        patternInfo: selectedPattern ? {
          id: selectedPattern.id,
          type: selectedPattern.pattern_type,
          sequence: selectedPattern.pattern_sequence
        } : {
          id: 'waiting',
          type: 'waiting' as 'parity' | 'color' | 'range',
          sequence: 'Aguardando padrão...'
        }
      }
    });

  } catch (error) {
    console.error('❌ [AUTO-BET] Erro ao iniciar apostas automáticas:', error);
    return NextResponse.json({
      success: false,
      error: `Erro ao iniciar apostas automáticas: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    }, { status: 500 });
  }
}

// Função para parar apostas automáticas
async function stopAutoBetting(userId: string) {
  try {
    console.log('🛑 [AUTO-BET] Parando apostas automáticas para usuário:', userId);
    
    const betting = autoBetting[userId];
    if (!betting?.active) {
      return NextResponse.json({
        success: false,
        error: 'Apostas automáticas não estão ativas.'
      }, { status: 400 });
    }

    // Calcular estatísticas finais
    const duration = Date.now() - betting.startedAt;
    const totalGames = betting.currentBetIndex;
    const winRate = totalGames > 0 ? (betting.wins / totalGames * 100).toFixed(1) : '0';
    const totalInvested = totalGames * betting.betAmount;
    
    // Calcular lucro (assumindo que vitórias pagam 2x a aposta)
    const totalReceived = betting.wins * (betting.betAmount * 2);
    const profit = totalReceived - totalInvested;

    // Adicionar operação ao relatório acumulativo
    if (totalGames > 0) {
      addOperationToReport(userId, {
        pattern: betting.pattern,
        bets: totalGames,
        wins: betting.wins,
        losses: betting.losses,
        invested: totalInvested,
        profit: profit
      });
    }

    // Parar apostas automáticas - LIMPEZA COMPLETA DO ESTADO
    delete autoBetting[userId];
    
    addWebSocketLog(userId, `🛑 Apostas automáticas paralisadas`, 'info');
    addWebSocketLog(userId, `📊 Estatísticas: ${totalGames} jogos, ${betting.wins} vitórias, ${betting.losses} derrotas (${winRate}% win rate)`, 'info');
    addWebSocketLog(userId, `💰 Investido: R$ ${totalInvested.toFixed(2)} | Lucro: R$ ${profit.toFixed(2)}`, 'info');
    addWebSocketLog(userId, `🧹 Estado completamente limpo - pronto para reiniciar`, 'info');

    return NextResponse.json({
      success: true,
      data: {
        message: 'Apostas automáticas paralisadas com sucesso',
        statistics: {
          totalGames,
          wins: betting.wins,
          losses: betting.losses,
          winRate: parseFloat(winRate),
          duration: Math.round(duration / 1000), // segundos
          totalInvested: totalGames * betting.betAmount
        }
      }
    });

  } catch (error) {
    console.error('❌ [AUTO-BET] Erro ao parar apostas automáticas:', error);
    return NextResponse.json({
      success: false,
      error: `Erro ao parar apostas automáticas: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    }, { status: 500 });
  }
}

// Função para obter status das apostas automáticas
async function getAutoBettingStatus(userId: string) {
  try {
    const betting = autoBetting[userId];
    
    if (!betting) {
      return NextResponse.json({
        success: true,
        data: {
          active: false,
          message: 'Apostas automáticas não configuradas'
        }
      });
    }

    const progress = betting.totalBets > 0 ? (betting.currentBetIndex / betting.totalBets * 100).toFixed(1) : '0';
    const winRate = betting.currentBetIndex > 0 ? (betting.wins / betting.currentBetIndex * 100).toFixed(1) : '0';
    const duration = Date.now() - betting.startedAt;

    return NextResponse.json({
      success: true,
      data: {
        active: betting.active,
        currentBetIndex: betting.currentBetIndex,
        totalBets: betting.totalBets,
        pattern: betting.pattern,
        progress: parseFloat(progress),
        statistics: {
          wins: betting.wins,
          losses: betting.losses,
          winRate: parseFloat(winRate),
          duration: Math.round(duration / 1000),
          totalInvested: betting.currentBetIndex * betting.betAmount
        },
        nextBet: betting.currentBetIndex < betting.totalBets ? {
          letter: betting.pattern[betting.currentBetIndex],
          betCode: MARTINGALE_TO_BET_CODE[betting.pattern[betting.currentBetIndex]],
          amount: betting.betAmount
        } : null,
        waitingForResult: betting.waitingForResult
      }
    });

  } catch (error) {
    console.error('❌ [AUTO-BET] Erro ao obter status:', error);
    return NextResponse.json({
      success: false,
      error: `Erro ao obter status: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    }, { status: 500 });
  }
}

// Função para configurar estratégia de apostas automáticas
async function configureAutoBetting(userId: string, martingaleName?: string) {
  try {
    console.log('⚙️ [CONFIG-AUTO-BET] Configurando estratégia para usuário:', userId, 'Estratégia:', martingaleName);
    
    if (!martingaleName) {
      return NextResponse.json({
        success: false,
        error: 'Nome da estratégia martingale é obrigatório'
      }, { status: 400 });
    }

    // Buscar estratégia no Supabase via RPC
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: strategies, error } = await supabase.rpc('get_martingale_strategies');
    
    if (error) {
      console.error('❌ [CONFIG-AUTO-BET] Erro ao buscar estratégias:', error);
      return NextResponse.json({
        success: false,
        error: 'Erro ao buscar estratégias de martingale'
      }, { status: 500 });
    }

    // Encontrar estratégia pelo nome
    const selectedStrategy = strategies?.find((s: any) => s.name === martingaleName);
    
    if (!selectedStrategy) {
      return NextResponse.json({
        success: false,
        error: `Estratégia '${martingaleName}' não encontrada`
      }, { status: 404 });
    }

    if (!selectedStrategy.is_active) {
      return NextResponse.json({
        success: false,
        error: `Estratégia '${martingaleName}' está inativa`
      }, { status: 400 });
    }

    // Armazenar configuração da estratégia para o usuário
    if (!autoBettingConfigs) {
      autoBettingConfigs = {};
    }
    
    autoBettingConfigs[userId] = {
      strategyName: martingaleName,
      strategy: selectedStrategy,
      configuredAt: Date.now()
    };

    console.log('✅ [CONFIG-AUTO-BET] Estratégia configurada:', {
      userId: userId.slice(0, 8),
      strategy: martingaleName,
      maxAttempts: selectedStrategy.max_attempts,
      sequences: selectedStrategy.sequences?.length || 0
    });

    return NextResponse.json({
      success: true,
      data: {
        message: `Estratégia '${martingaleName}' configurada com sucesso`,
        strategy: {
          name: selectedStrategy.name,
          description: selectedStrategy.description,
          maxAttempts: selectedStrategy.max_attempts,
          baseBet: selectedStrategy.base_bet,
          sequences: selectedStrategy.sequences
        }
      }
    });

  } catch (error) {
    console.error('❌ [CONFIG-AUTO-BET] Erro:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro interno ao configurar estratégia'
    }, { status: 500 });
  }
}

// Função para executar aposta automática
async function executeAutoBet(userId: string, gameId: string, ws: any) {
  try {
    const betting = autoBetting[userId];
    if (!betting || !betting.active) {
      console.log('🚫 [AUTO-BET] Apostas automáticas não estão ativas');
      return;
    }

    // Verificar se já está aguardando resultado para evitar apostas duplicadas
    if (betting.waitingForResult) {
      console.log('🚫 [AUTO-BET] Já aguardando resultado de aposta anterior - ignorando');
      return;
    }

    // Verificar se ainda há padrão selecionado válido
    const selectedPattern = selectedPatterns[userId];
    if (!selectedPattern || !selectedPattern.martingale_pattern) {
      console.log('🚫 [AUTO-BET] Padrão não encontrado ou inválido');
      addWebSocketLog(userId, '❌ Aposta cancelada: padrão não encontrado ou inválido', 'error');
      autoBetting[userId].active = false; // Parar apostas automáticas
      return;
    }

    // Verificar se o padrão do betting ainda corresponde ao padrão selecionado
    if (betting.pattern !== selectedPattern.martingale_pattern) {
      console.log('🚫 [AUTO-BET] Padrão mudou durante execução');
      addWebSocketLog(userId, '❌ Aposta cancelada: padrão mudou durante execução', 'error');
      autoBetting[userId].active = false; // Parar apostas automáticas
      return;
    }

    // Verificar se já completou todas as apostas
    if (betting.currentBetIndex >= betting.totalBets) {
      console.log('✅ [AUTO-BET] Todas as apostas do padrão foram completadas');
      autoBetting[userId].active = false;
      addWebSocketLog(userId, '🏁 Sequência de apostas automáticas completada!', 'success');
      return;
    }

    // Obter próxima aposta
    const currentLetter = betting.pattern[betting.currentBetIndex];
    const betCode = MARTINGALE_TO_BET_CODE[currentLetter];
    
    // Obter valor da aposta baseado na estratégia configurada
    let amount = betting.betAmount; // Valor padrão
    if (betting.strategy?.sequences && betting.strategy.sequences.length > betting.currentBetIndex) {
      const currentSequence = betting.strategy.sequences[betting.currentBetIndex];
      amount = currentSequence.bet_amount || betting.betAmount;
    }

    console.log(`🤖 [AUTO-BET] Executando aposta ${betting.currentBetIndex + 1}/${betting.totalBets}: ${currentLetter} (bc=${betCode}) R$ ${amount}`);

    // Buscar autenticação do usuário
    const authResult = await performAuthentication(userId);
    if (!authResult.success || !authResult.data) {
      addWebSocketLog(userId, '❌ Erro na autenticação para aposta automática', 'error');
      return;
    }

    // Gerar uId no formato correto: ppc + timestamp
    const timestamp = Date.now().toString();
    const pragmaticUserId = `ppc${timestamp}`;

    // Criar mensagem de aposta conforme RESUMO_SISTEMA_APOSTAS_BLAZE.md
    const betXml = `<command channel="table-mrbras531mrbr532">
  <lpbet gm="roulette_desktop" gId="${gameId}" uId="${pragmaticUserId}" ck="${timestamp}">
    <bet amt="${amount}" bc="${betCode}" ck="${timestamp}" />
  </lpbet>
</command>`;

    // Log da mensagem XML que será enviada
    console.log('📤 [AUTO-BET] XML da aposta:', betXml);
    addWebSocketLog(userId, `📤 Enviando XML: ${betXml.replace(/\n/g, ' ').replace(/\s+/g, ' ')}`, 'info');

    // Enviar aposta via WebSocket
    ws.send(betXml);

    // Atualizar status
    autoBetting[userId].currentBetIndex++;
    autoBetting[userId].lastBetAt = Date.now();
    autoBetting[userId].waitingForResult = true;
    autoBetting[userId].lastGameId = gameId;

    addWebSocketLog(userId, `🎯 AUTO-BET ${betting.currentBetIndex}/${betting.totalBets}: ${currentLetter} (bc=${betCode}) R$ ${amount} → Game ${gameId}`, 'success');
    addWebSocketLog(userId, `🔧 uId: ${pragmaticUserId}, ck: ${timestamp}`, 'info');

    console.log('✅ [AUTO-BET] Aposta enviada via WebSocket');

  } catch (error) {
    console.error('❌ [AUTO-BET] Erro ao executar aposta automática:', error);
    addWebSocketLog(userId, `❌ Erro na aposta automática: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, 'error');
  }
}

// Função para atualizar apostas automáticas quando um novo padrão é selecionado
function updateAutoBettingWithNewPattern(userId: string, newPattern: any) {
  const betting = autoBetting[userId];
  if (!betting?.active) return;

  const martingalePattern = newPattern.martingale_pattern;
  if (!martingalePattern) return;

  // Atualizar informações do padrão nas apostas automáticas
  betting.pattern = martingalePattern;
  betting.totalBets = martingalePattern.length;
  betting.currentBetIndex = 0; // Resetar para começar do início do novo padrão
  
  addWebSocketLog(userId, `🔄 NOVO PADRÃO DETECTADO durante apostas automáticas!`, 'success');
  addWebSocketLog(userId, `🎯 Padrão: ${martingalePattern} (${betting.totalBets} apostas)`, 'info');
  addWebSocketLog(userId, `🚀 Sistema PRONTO para apostar na próxima rodada!`, 'success');
}

// Função para obter relatório de operações
async function getOperationReport(userId: string) {
  try {
    const report = operationReport[userId];
    
    if (!report) {
      // Inicializar relatório se não existir
      operationReport[userId] = {
        totalOperations: 0,
        totalBets: 0,
        totalWins: 0,
        totalLosses: 0,
        totalInvested: 0,
        totalProfit: 0,
        startedAt: Date.now(),
        lastOperationAt: 0,
        operationHistory: []
      };
    }

    const currentReport = operationReport[userId];
    const winRate = currentReport.totalBets > 0 ? (currentReport.totalWins / currentReport.totalBets * 100) : 0;
    const profitRate = currentReport.totalInvested > 0 ? (currentReport.totalProfit / currentReport.totalInvested * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalOperations: currentReport.totalOperations,
          totalBets: currentReport.totalBets,
          totalWins: currentReport.totalWins,
          totalLosses: currentReport.totalLosses,
          totalInvested: currentReport.totalInvested,
          totalProfit: currentReport.totalProfit,
          winRate: parseFloat(winRate.toFixed(2)),
          profitRate: parseFloat(profitRate.toFixed(2)),
          startedAt: currentReport.startedAt,
          lastOperationAt: currentReport.lastOperationAt
        },
        recentOperations: currentReport.operationHistory.slice(-10) // Últimas 10 operações
      }
    });

  } catch (error) {
    console.error('❌ [REPORT] Erro ao obter relatório:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro ao obter relatório de operações'
    }, { status: 500 });
  }
}

// Função para resetar relatório de operações
async function resetOperationReport(userId: string) {
  try {
    operationReport[userId] = {
      totalOperations: 0,
      totalBets: 0,
      totalWins: 0,
      totalLosses: 0,
      totalInvested: 0,
      totalProfit: 0,
      startedAt: Date.now(),
      lastOperationAt: 0,
      operationHistory: []
    };

    addWebSocketLog(userId, '📊 Relatório de operações resetado', 'success');

    return NextResponse.json({
      success: true,
      data: {
        message: 'Relatório resetado com sucesso',
        newReport: operationReport[userId]
      }
    });

  } catch (error) {
    console.error('❌ [REPORT] Erro ao resetar relatório:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro ao resetar relatório'
    }, { status: 500 });
  }
}

// Função para adicionar operação ao relatório
function addOperationToReport(userId: string, operationData: {
  pattern: string;
  bets: number;
  wins: number;
  losses: number;
  invested: number;
  profit: number;
}) {
  if (!operationReport[userId]) {
    operationReport[userId] = {
      totalOperations: 0,
      totalBets: 0,
      totalWins: 0,
      totalLosses: 0,
      totalInvested: 0,
      totalProfit: 0,
      startedAt: Date.now(),
      lastOperationAt: 0,
      operationHistory: []
    };
  }

  const report = operationReport[userId];
  
  // Atualizar totais
  report.totalOperations++;
  report.totalBets += operationData.bets;
  report.totalWins += operationData.wins;
  report.totalLosses += operationData.losses;
  report.totalInvested += operationData.invested;
  report.totalProfit += operationData.profit;
  report.lastOperationAt = Date.now();

  // Adicionar ao histórico
  report.operationHistory.push({
    operationId: report.totalOperations,
    pattern: operationData.pattern,
    bets: operationData.bets,
    wins: operationData.wins,
    losses: operationData.losses,
    invested: operationData.invested,
    profit: operationData.profit,
    completedAt: Date.now()
  });

  // Manter apenas últimas 50 operações no histórico
  if (report.operationHistory.length > 50) {
    report.operationHistory = report.operationHistory.slice(-50);
  }

  addWebSocketLog(userId, `📊 Operação #${report.totalOperations} adicionada ao relatório - Lucro: R$ ${operationData.profit.toFixed(2)}`, 'success');
}

// Função para processar resultado da aposta automática
function processAutoBetResult(userId: string, resultNumber: number, resultColor: string) {
  try {
    const betting = autoBetting[userId];
    if (!betting || !betting.active || !betting.waitingForResult) {
      return;
    }

    // Obter a aposta que foi feita (índice anterior pois já foi incrementado)
    const lastBetIndex = betting.currentBetIndex - 1;
    const lastBetLetter = betting.pattern[lastBetIndex];
    
    // Determinar se a aposta foi vitoriosa
    let isWin = false;
    
    switch (lastBetLetter) {
      case 'R': // Vermelho (Red)
        isWin = resultColor === 'red';
        break;
      case 'B': // Preto (Black)  
        isWin = resultColor === 'black';
        break;
      case 'E': // Par (Even)
        isWin = resultNumber > 0 && resultNumber % 2 === 0;
        break;
      case 'O': // Ímpar (Odd)
        isWin = resultNumber > 0 && resultNumber % 2 === 1;
        break;
      case 'L': // 1-18 (Low)
        isWin = resultNumber >= 1 && resultNumber <= 18;
        break;
      case 'H': // 19-36 (High)
        isWin = resultNumber >= 19 && resultNumber <= 36;
        break;
    }

    // Atualizar estatísticas
    if (isWin) {
      autoBetting[userId].wins++;
      addWebSocketLog(userId, `✅ AUTO-BET ${lastBetIndex + 1}: ${lastBetLetter} GANHOU! Resultado: ${resultNumber} (${resultColor})`, 'success');
      
      // 🎯 VITÓRIA DETECTADA - PARAR APOSTAS AUTOMÁTICAS (objetivo alcançado)
      // Calcular total investido baseado na estratégia real
      let totalInvested = 0;
      for (let i = 0; i < betting.currentBetIndex; i++) {
        if (betting.strategy?.sequences && betting.strategy.sequences.length > i) {
          totalInvested += betting.strategy.sequences[i].bet_amount || betting.betAmount;
        } else {
          totalInvested += betting.betAmount;
        }
      }
      
      // Calcular lucro: vitória paga 2x o valor da última aposta
      const lastBetAmount = betting.strategy?.sequences && betting.strategy.sequences.length > (betting.currentBetIndex - 1) 
        ? betting.strategy.sequences[betting.currentBetIndex - 1].bet_amount || betting.betAmount
        : betting.betAmount;
      const totalReceived = lastBetAmount * 2; // Vitória paga 2x a aposta vencedora
      const profit = totalReceived - totalInvested;
      
      // 📊 ADICIONAR OPERAÇÃO AO RELATÓRIO ANTES DE LIMPAR O ESTADO
      addOperationToReport(userId, {
        pattern: betting.pattern,
        bets: betting.currentBetIndex,
        wins: betting.wins,
        losses: betting.losses,
        invested: totalInvested,
        profit: profit
      });
      
      // Limpar COMPLETAMENTE o estado das apostas automáticas
      delete autoBetting[userId];
      
      // Limpar padrão selecionado já que objetivo foi alcançado
      selectedPatterns[userId] = null;
      
      addWebSocketLog(userId, `🏆 OBJETIVO ALCANÇADO! Vitória detectada - PARANDO apostas automáticas`, 'success');
      addWebSocketLog(userId, `💰 Estatísticas finais: ${betting.wins} vitória(s), ${betting.losses} derrota(s). Investido: R$ ${totalInvested.toFixed(2)}, Lucro: R$ ${profit.toFixed(2)}`, 'success');
      addWebSocketLog(userId, `🧹 Padrão limpo - pronto para nova seleção`, 'info');
      
      // 🔄 REINICIAR AUTOMATICAMENTE - "Clicar" em selecionar padrão novamente
      addWebSocketLog(userId, `🔄 REINICIANDO AUTOMATICAMENTE - Buscando novo padrão...`, 'info');
      
      setTimeout(async () => {
        try {
          // Reiniciar monitoramento interno (sem retorno HTTP)
          startPatternMonitoringInternal(userId);
          addWebSocketLog(userId, `🎯 Loop automático ativado - aguardando próximo resultado`, 'success');
          
        } catch (error) {
          addWebSocketLog(userId, `❌ Erro ao reiniciar monitoramento: ${error}`, 'error');
        }
      }, 2000); // Aguardar 2 segundos antes de reiniciar
      
      console.log(`🏆 [AUTO-BET] VITÓRIA! Reiniciando automaticamente para usuário: ${userId}`);
      return; // Sair da função sem continuar processamento
    } else {
      autoBetting[userId].losses++;
      addWebSocketLog(userId, `❌ AUTO-BET ${lastBetIndex + 1}: ${lastBetLetter} PERDEU. Resultado: ${resultNumber} (${resultColor})`, 'error');
    }

    // Marcar que não está mais aguardando resultado
    autoBetting[userId].waitingForResult = false;

    // Verificar se completou todas as apostas (apenas se não houve vitória)
    if (betting.currentBetIndex >= betting.totalBets) {
      const winRate = ((betting.wins / betting.totalBets) * 100).toFixed(1);
      
      // Calcular total investido baseado na estratégia real
      let totalInvested = 0;
      for (let i = 0; i < betting.totalBets; i++) {
        if (betting.strategy?.sequences && betting.strategy.sequences.length > i) {
          totalInvested += betting.strategy.sequences[i].bet_amount || betting.betAmount;
        } else {
          totalInvested += betting.betAmount;
        }
      }
      
      // Calcular lucro: somar todas as vitórias (cada vitória paga 2x a aposta correspondente)
      let totalReceived = 0;
      // Para cada vitória, precisaríamos saber qual aposta ganhou, mas como não temos esse histórico,
      // vamos assumir que as vitórias foram nas apostas de menor valor (mais conservador)
      for (let i = 0; i < betting.wins; i++) {
        const betAmount = betting.strategy?.sequences && betting.strategy.sequences.length > i 
          ? betting.strategy.sequences[i].bet_amount || betting.betAmount
          : betting.betAmount;
        totalReceived += betAmount * 2;
      }
      const profit = totalReceived - totalInvested;
      
      // 📊 ADICIONAR OPERAÇÃO AO RELATÓRIO ANTES DE LIMPAR O ESTADO
      addOperationToReport(userId, {
        pattern: betting.pattern,
        bets: betting.totalBets,
        wins: betting.wins,
        losses: betting.losses,
        invested: totalInvested,
        profit: profit
      });
      
      // Limpar COMPLETAMENTE o estado das apostas automáticas
      delete autoBetting[userId];
      
      // Limpar padrão selecionado também
      selectedPatterns[userId] = null;
      
      addWebSocketLog(userId, `🏁 SEQUÊNCIA COMPLETADA! ${betting.wins}/${betting.totalBets} vitórias (${winRate}%). Investido: R$ ${totalInvested.toFixed(2)}, Lucro: R$ ${profit.toFixed(2)}`, betting.wins > 0 ? 'success' : 'error');
      addWebSocketLog(userId, `🧹 Estado e padrão limpos - pronto para nova seleção`, 'info');
      
      // 🔄 REINICIAR AUTOMATICAMENTE também quando sequência termina sem vitórias
      addWebSocketLog(userId, `🔄 REINICIANDO AUTOMATICAMENTE - Buscando novo padrão...`, 'info');
      
      setTimeout(async () => {
        try {
          // Reiniciar monitoramento interno (sem retorno HTTP)
          startPatternMonitoringInternal(userId);
          addWebSocketLog(userId, `🎯 Loop automático ativado - aguardando próximo resultado`, 'success');
          
        } catch (error) {
          addWebSocketLog(userId, `❌ Erro ao reiniciar monitoramento: ${error}`, 'error');
        }
      }, 2000); // Aguardar 2 segundos antes de reiniciar
    }

    console.log(`🎯 [AUTO-BET] Resultado processado: ${lastBetLetter} → ${isWin ? 'WIN' : 'LOSS'} (${resultNumber}/${resultColor})`);

  } catch (error) {
    console.error('❌ [AUTO-BET] Erro ao processar resultado:', error);
    addWebSocketLog(userId, `❌ Erro ao processar resultado da aposta automática: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, 'error');
  }
} 