import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBaseUrl } from '@/lib/utils';

// 🎯 NOVA INTERFACE: Sinal de Aposta
interface BettingSignal {
  type: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'await';
  amount: number;
  confidence: number; // 0-100%
  reason: string;
  timing: 'immediate' | 'wait_next_round';
  gameId?: string;
  level: number; // Nível de stake (1-12)
}

// 🎯 CONFIGURAÇÃO SIMPLIFICADA: Apenas geração de sinais
interface SignalGeneratorConfig {
  userId: string;
  action?: 'start-analysis' | 'stop-analysis' | 'get-current-signal' | 'get-signal-history' | 'update-strategy' | 'get-stats' | 'reset-stats' | 'get-blaze-token' | 'connect' | 'set-pending-stake' | 'update-stake' | 'stop-operation' | 'get-connection-status' | 'get-websocket-logs';
  m4DirectBetType?: 'await' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';
  stakeMultiplier?: number; // 1x, 2x, 3x, 4x, 5x
  newStake?: number; // Para compatibilidade com update-stake
}

// 🎯 ESTADO SIMPLIFICADO: Apenas para análise
const analysisState: { [userId: string]: {
  active: boolean; 
  currentLevel: number; // Nível atual (1-12)
  stakeMultiplier: number; // Multiplicador de stake
  m4DirectBetType: string;
  lastSignal?: BettingSignal;
  stats: {
    signalsGenerated: number;
    analysisStartedAt: number;
    lastAnalysisUpdate: number;
  };
  strategy: {
    waitingForTrigger: boolean;
    triggerDetected: boolean;
  lastProcessedGameId?: string;
  };
} } = {};

// 🎯 HISTÓRICO DE SINAIS (últimos 50 por usuário)
const signalHistory: { [userId: string]: BettingSignal[] } = {};

// 💰 NÍVEIS DE STAKE (mesma estrutura anterior)
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

// 🎯 FUNÇÃO PRINCIPAL: Processar requisições do gerador de sinais
export async function POST(request: NextRequest) {
  try {
    console.log('✅ [SIGNAL-GENERATOR] Processamento direto (gerador de sinais)');
    
    const { userId, action = 'get-current-signal', m4DirectBetType, stakeMultiplier, newStake }: SignalGeneratorConfig = await request.json();

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'userId é obrigatório'
      }, { status: 400 });
    }

    // Inicializar estado se não existir
    if (!analysisState[userId]) {
      initializeAnalysisState(userId);
    }

    // Processar ações
    switch (action) {
      case 'start-analysis':
        return await startSignalAnalysis(userId, m4DirectBetType);
        
      case 'stop-analysis':
        return await stopSignalAnalysis(userId);
        
      case 'get-current-signal':
        return await getCurrentSignal(userId);
        
      case 'get-signal-history':
        return await getSignalHistory(userId);
        
      case 'update-strategy':
        return await updateStrategy(userId, m4DirectBetType, stakeMultiplier);
        
      case 'get-stats':
        return await getAnalysisStats(userId);
        
      case 'reset-stats':
        return await resetAnalysisStats(userId);

      // 🔄 ADAPTADORES: Actions antigas para compatibilidade
      case 'get-blaze-token':
          return NextResponse.json({
            success: false,
          error: 'Função descontinuada no gerador de sinais. Use tokens compartilhados via insights-shared.',
          deprecated: true
        });

      case 'connect':
        // Simular conexão bem-sucedida para não quebrar o frontend
          return NextResponse.json({
          success: true,
          data: {
            connected: true,
            message: 'Modo gerador de sinais - conexão simulada',
            config: { simulated: true },
            readyForBetting: false, // Não faz apostas reais
            isSignalMode: true
          }
        });

      case 'set-pending-stake':
      case 'update-stake':
        // Simular atualização de stake
            return NextResponse.json({
           success: true,
           message: 'Stake atualizada no gerador de sinais',
           data: { newStake: newStake || 0 }
         });

      case 'stop-operation':
        // Redirecionar para stop-analysis
        return await stopSignalAnalysis(userId);

      case 'get-connection-status':
        // Simular status de conexão para gerador de sinais
            return NextResponse.json({
          success: true,
          data: {
            connected: true,
            signalMode: true,
            lastUpdate: Date.now(),
            message: 'Gerador de sinais ativo'
          }
        });

      case 'get-websocket-logs':
        // Simular logs vazios
            return NextResponse.json({
          success: true,
          data: {
            logs: [],
            connectionStatus: { connected: true, signalMode: true },
            message: 'Gerador de sinais - sem WebSocket'
          }
        });
        
      default:
            return NextResponse.json({
              success: false,
          error: `Ação "${action}" não suportada no gerador de sinais`
            }, { status: 400 });
          }

        } catch (error) {
    console.error('❌ [SIGNAL-GENERATOR] Erro:', error);
          return NextResponse.json({
            success: false,
      error: 'Erro interno do gerador de sinais'
          }, { status: 500 });
        }
}

// 🎯 FUNÇÃO: Inicializar estado de análise
function initializeAnalysisState(userId: string) {
  analysisState[userId] = {
              active: false,
              currentLevel: 1,
    stakeMultiplier: 1,
    m4DirectBetType: 'await',
              stats: {
      signalsGenerated: 0,
      analysisStartedAt: Date.now(),
      lastAnalysisUpdate: Date.now()
    },
    strategy: {
      waitingForTrigger: true,
              triggerDetected: false
    }
  };
  
  signalHistory[userId] = [];
  console.log(`🎯 [SIGNAL-GENERATOR] Estado inicializado para usuário: ${userId}`);
}

// 🚀 FUNÇÃO: Iniciar análise de sinais
async function startSignalAnalysis(userId: string, betType?: string) {
  try {
    const state = analysisState[userId];
    
    if (betType) {
      state.m4DirectBetType = betType;
    }
    
    state.active = true;
    state.stats.analysisStartedAt = Date.now();
    state.strategy.waitingForTrigger = true;
    state.strategy.triggerDetected = false;
    
    console.log(`🚀 [SIGNAL-GENERATOR] Análise iniciada para ${userId} - Tipo: ${state.m4DirectBetType}`);
            
            return NextResponse.json({
              success: true,
              data: {
        message: 'Análise de sinais iniciada',
        betType: state.m4DirectBetType,
        level: state.currentLevel,
        multiplier: state.stakeMultiplier,
        status: 'analysis_active'
      }
    });
          
        } catch (error) {
    console.error('❌ [SIGNAL-GENERATOR] Erro ao iniciar análise:', error);
          return NextResponse.json({
            success: false,
      error: 'Erro ao iniciar análise de sinais'
          }, { status: 500 });
  }
}

// 🛑 FUNÇÃO: Parar análise de sinais
async function stopSignalAnalysis(userId: string) {
  try {
    const state = analysisState[userId];
    state.active = false;
    state.strategy.waitingForTrigger = false;
    state.strategy.triggerDetected = false;
    
    console.log(`🛑 [SIGNAL-GENERATOR] Análise parada para ${userId}`);
          
          return NextResponse.json({
            success: true,
            data: {
        message: 'Análise de sinais parada',
        totalSignals: state.stats.signalsGenerated,
        status: 'analysis_stopped'
      }
    });
    
        } catch (error) {
    console.error('❌ [SIGNAL-GENERATOR] Erro ao parar análise:', error);
          return NextResponse.json({
            success: false,
      error: 'Erro ao parar análise de sinais'
          }, { status: 500 });
  }
}

// 🎯 FUNÇÃO: Obter sinal atual baseado em dados históricos
async function getCurrentSignal(userId: string): Promise<NextResponse> {
  try {
    const state = analysisState[userId];
    
    if (!state.active) {
            return NextResponse.json({
              success: true,
              data: {
          signal: null,
          message: 'Análise não está ativa',
          status: 'analysis_inactive'
        }
      });
    }
    
    // 🔍 BUSCAR DADOS HISTÓRICOS via insights-shared
    const insightsResponse = await fetch(`${getBaseUrl()}/api/bmgbr3/insights-shared`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        action: 'get'
      })
    });
    
    const insightsData = await insightsResponse.json();
    
    if (!insightsData.success || !insightsData.data?.results) {
            return NextResponse.json({
              success: false,
        error: 'Erro ao obter dados históricos para análise'
      }, { status: 500 });
    }
    
    // 🧠 ANALISAR DADOS E GERAR SINAL
    const signal = await generateBettingSignal(userId, insightsData.data.results);
    
    // 📝 SALVAR NO HISTÓRICO se for um novo sinal
    if (signal && signal.gameId !== state.lastSignal?.gameId) {
      addSignalToHistory(userId, signal);
      state.lastSignal = signal;
      state.stats.signalsGenerated++;
      state.stats.lastAnalysisUpdate = Date.now();
    }
    
            return NextResponse.json({
              success: true,
              data: {
        signal: signal,
        analysisActive: state.active,
        totalSignals: state.stats.signalsGenerated,
        lastUpdate: state.stats.lastAnalysisUpdate,
        status: 'signal_generated'
      }
    });
    
        } catch (error) {
    console.error('❌ [SIGNAL-GENERATOR] Erro ao gerar sinal:', error);
          return NextResponse.json({
            success: false,
      error: 'Erro ao gerar sinal de aposta'
          }, { status: 500 });
        }
}

// 🧠 FUNÇÃO: Gerar sinal de aposta baseado na estratégia M4 Direto
async function generateBettingSignal(userId: string, historicalResults: any[]): Promise<BettingSignal | null> {
  try {
    const state = analysisState[userId];
    const currentLevel = STAKE_LEVELS[state.currentLevel - 1];
    
    if (!historicalResults || historicalResults.length < 5) {
      return null;
    }
    
    // 📊 ANALISAR últimos 5 resultados
    const recentResults = historicalResults.slice(0, 5);
    const currentGameId = recentResults[0]?.gameId;
    
    // 🎯 ESTRATÉGIA: Repetição Inteligente
    const betType = state.m4DirectBetType;
    
    if (betType === 'await') {
      return {
        type: 'await',
        amount: 0,
        confidence: 0,
        reason: 'Aguardando configuração do tipo de aposta',
        timing: 'wait_next_round',
        gameId: currentGameId,
        level: state.currentLevel
      };
    }
    
    // 🔍 DETECTAR SE O RESULTADO DESEJADO APARECEU
    const lastResult = recentResults[0];
    const shouldBet = checkTriggerCondition(lastResult, betType);
    
    if (shouldBet && !state.strategy.triggerDetected) {
      // 🎯 TRIGGER DETECTADO - Sinal para apostar na repetição
      state.strategy.triggerDetected = true;
      state.strategy.waitingForTrigger = false;
      
      const stakeAmount = currentLevel.m2 * state.stakeMultiplier;
    
    return {
        type: betType as any,
        amount: stakeAmount,
        confidence: 85,
        reason: `${getBetTypeName(betType)} detectado - apostar para repetir`,
        timing: 'immediate',
        gameId: currentGameId,
        level: state.currentLevel
      };
    }
    
    if (state.strategy.waitingForTrigger) {
    return {
        type: 'await',
        amount: 0,
        confidence: 50,
        reason: `Aguardando ${getBetTypeName(betType)} aparecer`,
        timing: 'wait_next_round',
        gameId: currentGameId,
        level: state.currentLevel
      };
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ [SIGNAL-GENERATOR] Erro ao gerar sinal:', error);
    return null;
  }
}

// 🎯 FUNÇÃO: Verificar condição de trigger
function checkTriggerCondition(result: any, betType: string): boolean {
  if (!result) return false;
  
  const number = result.number;
  const color = result.color;
  
  switch (betType) {
    case 'red': return color === 'red';
    case 'black': return color === 'black';
    case 'even': return number % 2 === 0 && number !== 0;
    case 'odd': return number % 2 === 1;
    case 'low': return number >= 1 && number <= 18;
    case 'high': return number >= 19 && number <= 36;
    default: return false;
  }
}

// 🏷️ FUNÇÃO: Obter nome amigável do tipo de aposta
function getBetTypeName(betType: string): string {
  const names: { [key: string]: string } = {
    'red': 'Vermelho',
    'black': 'Preto', 
    'even': 'Par',
    'odd': 'Ímpar',
    'low': 'Baixo (1-18)',
    'high': 'Alto (19-36)',
    'await': 'Aguardando'
  };
  return names[betType] || betType;
}

// 📝 FUNÇÃO: Adicionar sinal ao histórico
function addSignalToHistory(userId: string, signal: BettingSignal) {
  if (!signalHistory[userId]) {
    signalHistory[userId] = [];
  }
  
  signalHistory[userId].unshift(signal);
  
  // Manter apenas últimos 50 sinais
  if (signalHistory[userId].length > 50) {
    signalHistory[userId] = signalHistory[userId].slice(0, 50);
  }
}

// 📋 FUNÇÃO: Obter histórico de sinais
async function getSignalHistory(userId: string) {
  try {
    const history = signalHistory[userId] || [];
      
      return NextResponse.json({
        success: true,
        data: {
        signals: history,
        total: history.length,
        status: 'history_retrieved'
      }
    });

  } catch (error) {
    console.error('❌ [SIGNAL-GENERATOR] Erro ao obter histórico:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro ao obter histórico de sinais'
    }, { status: 500 });
  }
}

// 🔧 FUNÇÃO: Atualizar estratégia
async function updateStrategy(userId: string, betType?: string, stakeMultiplier?: number) {
  try {
    const state = analysisState[userId];
    
    if (betType) {
      state.m4DirectBetType = betType;
      state.strategy.waitingForTrigger = true;
      state.strategy.triggerDetected = false;
    }
    
    if (stakeMultiplier && stakeMultiplier >= 1 && stakeMultiplier <= 5) {
      state.stakeMultiplier = stakeMultiplier;
    }
    
    console.log(`🔧 [SIGNAL-GENERATOR] Estratégia atualizada: ${betType || state.m4DirectBetType} - ${state.stakeMultiplier}x`);
    
      return NextResponse.json({
        success: true,
        data: {
        message: 'Estratégia atualizada',
        betType: state.m4DirectBetType,
        multiplier: state.stakeMultiplier,
        status: 'strategy_updated'
      }
    });

  } catch (error) {
    console.error('❌ [SIGNAL-GENERATOR] Erro ao atualizar estratégia:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro ao atualizar estratégia'
    }, { status: 500 });
  }
}

// 📊 FUNÇÃO: Obter estatísticas de análise
async function getAnalysisStats(userId: string) {
  try {
    const state = analysisState[userId];
    const history = signalHistory[userId] || [];
    
    // Calcular estatísticas
    const immediateSignals = history.filter(s => s.timing === 'immediate').length;
    const waitSignals = history.filter(s => s.timing === 'wait_next_round').length;
    const avgConfidence = history.length > 0 
      ? Math.round(history.reduce((sum, s) => sum + s.confidence, 0) / history.length)
      : 0;
    
    return NextResponse.json({
      success: true,
      data: {
        analysisActive: state.active,
        totalSignals: state.stats.signalsGenerated,
        immediateSignals,
        waitSignals,
        avgConfidence,
        currentLevel: state.currentLevel,
        currentMultiplier: state.stakeMultiplier,
        analysisRuntime: Date.now() - state.stats.analysisStartedAt,
        lastUpdate: state.stats.lastAnalysisUpdate,
        status: 'stats_retrieved'
      }
    });

  } catch (error) {
    console.error('❌ [SIGNAL-GENERATOR] Erro ao obter stats:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro ao obter estatísticas'
    }, { status: 500 });
  }
}

// 🔄 FUNÇÃO: Resetar estatísticas
async function resetAnalysisStats(userId: string) {
  try {
    const state = analysisState[userId];
    
    state.stats = {
      signalsGenerated: 0,
      analysisStartedAt: Date.now(),
      lastAnalysisUpdate: Date.now()
    };
    
    signalHistory[userId] = [];
    
    console.log(`🔄 [SIGNAL-GENERATOR] Stats resetadas para ${userId}`);

    return NextResponse.json({
      success: true,
      data: {
        message: 'Estatísticas resetadas',
        status: 'stats_reset'
      }
    });
    
  } catch (error) {
    console.error('❌ [SIGNAL-GENERATOR] Erro ao resetar stats:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro ao resetar estatísticas'
    }, { status: 500 });
  }
}



