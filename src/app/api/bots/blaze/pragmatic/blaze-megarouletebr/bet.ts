import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Interface para requisição de aposta
interface BetRequest {
  userId: string;
  amount: number;
  betCode?: string;
  prediction?: 'red' | 'black' | 'green' | 'even' | 'odd' | 'low' | 'high';
  tableId?: string;
  maxWaitTime?: number; // tempo máximo para aguardar abertura (default: 30s)
}

// Interface para resultado da aposta
interface BetResult {
  success: boolean;
  data?: {
    gameId: string;
    betSent: boolean;
    amount: number;
    betCode: string;
    timestamp: number;
    result?: string;
    message: string;
  };
  error?: string;
  logs?: string[];
}

// Mapeamento de predições para códigos
const BET_CODES: { [key: string]: string } = {
  'red': '46',      // Vermelho
  'black': '47',    // Preto  
  'even': '48',     // Par
  'odd': '49',      // Ímpar
  'low': '50',      // 1-18
  'high': '51',     // 19-36
  'green': '0',     // Zero (número direto)
  // Números diretos: '0' a '36'
};

// Função principal para fazer apostas usando conexão ativa
export async function POST(request: NextRequest) {
  try {
    const { userId, amount, betCode, prediction, tableId = 'mrbras531mrbr532', maxWaitTime = 30000 }: BetRequest = await request.json();

    // Validações obrigatórias
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'userId é obrigatório'
      }, { status: 400 });
    }

    if (!amount || amount < 0.5) {
      return NextResponse.json({
        success: false,
        error: 'Valor mínimo da aposta é R$ 0,50'
      }, { status: 400 });
    }

    // Determinar código da aposta
    let finalBetCode = betCode;
    if (prediction && BET_CODES[prediction]) {
      finalBetCode = BET_CODES[prediction];
    }

    if (!finalBetCode) {
      return NextResponse.json({
        success: false,
        error: 'Código de aposta (betCode) ou predição (prediction) é obrigatório'
      }, { status: 400 });
    }

    // Validar código de aposta
    if (!isValidBetCode(finalBetCode)) {
      return NextResponse.json({
        success: false,
        error: `Código de aposta inválido: ${finalBetCode}`
      }, { status: 400 });
    }

    // 1. Verificar se já existe conexão ativa para o usuário
    const connectionCheckResult = await checkActiveConnection(userId);
    if (!connectionCheckResult.success) {
      return NextResponse.json({
        success: false,
        error: `Conexão não ativa: ${connectionCheckResult.error}. Use primeiro /api/bots/blaze/pragmatic/megaroulettebrazilian com action=bet-connect`
      }, { status: 400 });
    }

    // 2. Aguardar próxima janela de apostas e enviar aposta via conexão ativa
    const betResult = await placeBetViaActiveConnection({
      userId,
      amount,
      betCode: finalBetCode,
      tableId,
      maxWaitTime
    });

    // 3. Se aposta foi bem-sucedida, debitar créditos
    if (betResult.success && betResult.data?.betSent) {
      await debitUserCredits(userId, amount);
    }

    return NextResponse.json(betResult);

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor'
    }, { status: 500 });
  }
}

// Função para verificar se existe conexão ativa (usando a API principal)
async function checkActiveConnection(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Chamar a API principal para verificar logs/status da conexão
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/bots/blaze/pragmatic/megaroulettebrazilian`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        action: 'get-websocket-logs'
      })
    });

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Não foi possível verificar conexão'
      };
    }

    const connectionStatus = result.data?.connectionStatus;
    
    if (!connectionStatus?.connected) {
      return {
        success: false,
        error: 'WebSocket não está conectado'
      };
    }

    // Verificar se conexão está saudável (último update recente)
    const timeSinceUpdate = Date.now() - connectionStatus.lastUpdate;
    if (timeSinceUpdate > 60000) { // 1 minuto
      return {
        success: false,
        error: 'Conexão pode estar inativa (sem atividade recente)'
      };
    }

    return { success: true };

  } catch (error) {
    return {
      success: false,
      error: `Erro ao verificar conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

// Função para fazer aposta via conexão WebSocket ativa (integrada com route.ts)
async function placeBetViaActiveConnection(config: {
  userId: string;
  amount: number;
  betCode: string;
  tableId: string;
  maxWaitTime: number;
}): Promise<BetResult> {
  return new Promise(async (resolve) => {
    const logs: string[] = [];
    const startTime = Date.now();
    
    try {
      logs.push('🔗 Usando conexão WebSocket ativa existente');
      logs.push(`💰 Preparando aposta: R$ ${config.amount} no código ${config.betCode}`);

      // Variáveis de controle
      let bettingWindowDetected = false;
      let betSent = false;
      let currentGameId = '';
      let betResult = '';
      let monitoringActive = true;

      // Timeout de segurança
      const timeout = setTimeout(() => {
        monitoringActive = false;
        if (!betSent) {
          resolve({
            success: false,
            error: `Timeout - Nenhuma janela de apostas detectada em ${config.maxWaitTime/1000}s`,
            logs
          });
        }
      }, config.maxWaitTime);

      // Função para monitorar logs e detectar janelas de apostas
      const monitoringInterval = setInterval(async () => {
        if (!monitoringActive) {
          clearInterval(monitoringInterval);
          return;
        }

        try {
          // Buscar logs da conexão ativa
          const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/bots/blaze/pragmatic/megaroulettebrazilian`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: config.userId,
              action: 'get-websocket-logs'
            })
          });

          const result = await response.json();
          
          if (!result.success) {
            logs.push(`❌ Erro ao monitorar conexão: ${result.error}`);
            clearTimeout(timeout);
            clearInterval(monitoringInterval);
            resolve({
              success: false,
              error: `Erro no monitoramento: ${result.error}`,
              logs
            });
            return;
          }

          const recentLogs = result.data?.logs || [];
          
          // Procurar por janelas de apostas nos logs recentes (últimos 10 segundos)
          const recentTime = Date.now() - 10000;
          const relevantLogs = recentLogs.filter((log: any) => log.timestamp > recentTime);

          // 1. DETECTAR ABERTURA DE APOSTAS
          const betsOpenLog = relevantLogs.find((log: any) => 
            log.type === 'bets-open' && log.message.includes('Jogo') && log.message.includes('iniciado')
          );

          if (betsOpenLog && !bettingWindowDetected && !betSent) {
            // Extrair Game ID do log
            const gameIdMatch = betsOpenLog.message.match(/Jogo \d+ iniciado: ([^\s]+)/);
            if (gameIdMatch) {
              currentGameId = gameIdMatch[1];
              bettingWindowDetected = true;
              logs.push(`🎮 Janela de apostas detectada - Jogo: ${currentGameId}`);
              
              // Aguardar um pouco e então enviar aposta (timing otimizado)
              setTimeout(async () => {
                await sendBetCommand();
              }, 3000); // 3 segundos após detecção da abertura
            }
          }

          // 2. DETECTAR FECHAMENTO DE APOSTAS
          const betsClosedLog = relevantLogs.find((log: any) => 
            log.type === 'bets-closed' || log.message.includes('fechadas')
          );

          if (betsClosedLog && betSent) {
            logs.push('🔒 Apostas fechadas - Aguardando resultado...');
            
            // Aguardar um pouco para resultado
            setTimeout(async () => {
              clearTimeout(timeout);
              clearInterval(monitoringInterval);
              resolve({
                success: true,
                data: {
                  gameId: currentGameId,
                  betSent: true,
                  amount: config.amount,
                  betCode: config.betCode,
                  timestamp: Date.now(),
                  result: betResult,
                  message: 'Aposta enviada com sucesso via conexão ativa'
                },
                logs
              });
            }, 5000); // 5 segundos para aguardar resultado
          }

          // 3. DETECTAR RESULTADO
          const gameResultLog = relevantLogs.find((log: any) => 
            log.type === 'game' && log.message.includes('Resultado:')
          );

          if (gameResultLog && betSent) {
            betResult = gameResultLog.message;
            logs.push(`🎯 ${betResult}`);
            
            clearTimeout(timeout);
            clearInterval(monitoringInterval);
            resolve({
              success: true,
              data: {
                gameId: currentGameId,
                betSent: true,
                amount: config.amount,
                betCode: config.betCode,
                timestamp: Date.now(),
                result: betResult,
                message: 'Aposta enviada e resultado recebido'
              },
              logs
            });
          }

        } catch (monitorError) {
          logs.push(`❌ Erro no monitoramento: ${monitorError}`);
        }
      }, 2000); // Verificar a cada 2 segundos

      // Função para enviar comando de aposta via API principal
      async function sendBetCommand() {
        try {
          if (!currentGameId || betSent) {
            logs.push(`❌ Não é possível apostar: gameId=${currentGameId}, betSent=${betSent}`);
            return;
          }

          logs.push(`📤 Enviando aposta via conexão ativa...`);

          // Usar a funcionalidade de aposta da API principal
          const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/bots/blaze/pragmatic/megaroulettebrazilian`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: config.userId,
              action: 'bet-place',
              betData: {
                amount: config.amount,
                betCode: config.betCode,
                tableId: config.tableId
              }
            })
          });

          const result = await response.json();

          if (result.success) {
            betSent = true;
            logs.push('✅ Aposta enviada com sucesso via API principal');
          } else {
            logs.push(`❌ Erro ao enviar aposta: ${result.error}`);
            clearTimeout(timeout);
            clearInterval(monitoringInterval);
            resolve({
              success: false,
              error: `Erro ao enviar aposta: ${result.error}`,
              logs
            });
          }

        } catch (sendError) {
          logs.push(`❌ Erro ao enviar aposta: ${sendError}`);
          clearTimeout(timeout);
          clearInterval(monitoringInterval);
          resolve({
            success: false,
            error: `Erro ao enviar aposta: ${sendError instanceof Error ? sendError.message : 'Erro desconhecido'}`,
            logs
          });
        }
      }

    } catch (error) {
      logs.push(`❌ Erro geral: ${error}`);
      resolve({
        success: false,
        error: `Erro geral: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        logs
      });
    }
  });
}

// Validar código de aposta conforme RESUMO
function isValidBetCode(betCode: string): boolean {
  // Códigos externos válidos (46-51)
  const externalCodes = ['46', '47', '48', '49', '50', '51'];
  
  // Números diretos (0-36)
  const numberCodes = Array.from({ length: 37 }, (_, i) => i.toString());
  
  const validCodes = [...externalCodes, ...numberCodes];
  
  return validCodes.includes(betCode);
}

// Função para debitar créditos do usuário
async function debitUserCredits(userId: string, amount: number) {
  try {
    // Implementar integração com sistema de créditos
    return { success: true };
  } catch (error) {
    return { success: false };
  }
}

// Método GET para documentação da API
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'API de Apostas Integrada - MegaRoulette Brazilian',
    version: '2.0.0',
    description: 'API de apostas que utiliza conexão WebSocket ativa mantida pela API principal (route.ts)',
    integration: {
      requires: 'Conexão WebSocket ativa via /api/bots/blaze/pragmatic/megaroulettebrazilian (action=bet-connect)',
      benefits: [
        'Reutiliza conexão existente (mais eficiente)',
        'Não precisa reautenticar',
        'Aproveita sistema de reconexão automática',
        'Integra com logs existentes',
        'Menor latência para apostas'
      ]
    },
    usage: {
      step1: 'POST /api/bots/blaze/pragmatic/megaroulettebrazilian (action=bet-connect) - Estabelecer conexão',
      step2: 'POST /api/bots/blaze/pragmatic/megaroulettebrazilian/bet - Fazer apostas usando conexão ativa',
      endpoint: 'POST /api/bots/blaze/pragmatic/megaroulettebrazilian/bet',
      body: {
        userId: 'string (obrigatório) - ID ou email do usuário',
        amount: 'number (obrigatório) - Valor da aposta (mínimo R$ 0,50)',
        betCode: 'string (opcional se prediction fornecido) - Código direto da aposta',
        prediction: 'string (opcional se betCode fornecido) - red|black|even|odd|low|high|green',
        tableId: 'string (opcional) - ID da mesa (padrão: mrbras531mrbr532)',
        maxWaitTime: 'number (opcional) - Tempo máximo de espera em ms (padrão: 30000)'
      }
    },
    bet_codes: {
      external: {
        '46': 'Vermelho (Red)',
        '47': 'Preto (Black)',
        '48': 'Par (Even)',
        '49': 'Ímpar (Odd)',
        '50': '1-18 (Low)',
        '51': '19-36 (High)'
      },
      direct: 'Números 0-36 para apostas diretas'
    },
    workflow: [
      '1. Verificar se conexão WebSocket está ativa',
      '2. Monitorar logs da conexão ativa em tempo real',
      '3. Detectar abertura de apostas via logs',
      '4. Enviar aposta usando API principal',
      '5. Monitorar fechamento e resultado via logs',
      '6. Retornar resultado completo'
    ],
    advantages: [
      'Não cria conexões desnecessárias',
      'Aproveita infraestrutura de reconexão',
      'Timing otimizado baseado em logs reais',
      'Menor chance de conflitos',
      'Sistema mais robusto e eficiente'
    ]
  });
} 