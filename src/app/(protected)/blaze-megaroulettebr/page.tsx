'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, RefreshCw, Zap, Key, Settings, PlayCircle, StopCircle } from 'lucide-react';
import MatrixRain from '@/components/MatrixRain';
import Modal, { useModal } from '@/components/ui/modal';
import InlineAlert from '@/components/ui/inline-alert';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function BlazeMegaRouletteBR() {
  // Estados básicos
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para WebSocket logs
  const [websocketLogs, setWebsocketLogs] = useState<Array<{ 
    timestamp: number; 
    message: string; 
    type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' 
  }>>([]);

  // Estados para últimos 5 resultados
  const [lastFiveResults, setLastFiveResults] = useState<Array<{ 
    number: number; 
      color: string;
    gameId: string; 
    timestamp: number 
  }>>([]);

  // Estados da operação
  const [operationActive, setOperationActive] = useState(false);
  const [operationState, setOperationState] = useState<{
    pattern: string;
    level: number;
    martingaleLevel: number;
    waitingForResult: boolean;
    stats: {
      totalBets: number;
      wins: number;
      losses: number;
      profit: number;
      startedAt: number;
    };
  } | null>(null);

  // Estados de conexão
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    error?: string;
    lastUpdate: number;
  }>({ connected: false, lastUpdate: Date.now() });

  // Estados para operação
  const [isOperating, setIsOperating] = useState(false);
  const [operationLoading, setOperationLoading] = useState(false);
  const [operationStatus, setOperationStatus] = useState<string>('INATIVO');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationSuccess, setOperationSuccess] = useState<string | null>(null);
  
  // Estados para token da Blaze
  const blazeConfigModal = useModal();
  const [blazeToken, setBlazeToken] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [userTokens, setUserTokens] = useState<Array<{
    casino_name: string;
    casino_code: string;
    token: string;
    is_active: boolean;
  }>>([]);
  const [alertMessage, setAlertMessage] = useState<{ 
    type: 'success' | 'error' | 'warning' | 'info', 
    message: string 
  } | null>(null);
  
  // Estados para relatório
  const [operationReport, setOperationReport] = useState<{
    summary: {
      totalBets: number;
      wins: number;
      losses: number;
      profit: number;
      winRate: number;
      startedAt: number;
    };
  } | null>(null);

  // NOVO: Estado da janela de apostas
  const [bettingWindow, setBettingWindow] = useState<{
    isOpen: boolean;
    currentGameId?: string;
    lastUpdate?: number;
  }>({ isOpen: false });

  const monitoringRef = useRef<boolean>(false);
  const operationRef = useRef<boolean>(false);
  const userIdRef = useRef<string>('');

  useEffect(() => {
    checkUser();
    checkBlazeConfiguration();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setUserEmail(user.email);
      userIdRef.current = user.id;
    }
  };

  const checkBlazeConfiguration = async () => {
    try {
      setIsLoadingStatus(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_tokens')
        .select('*')
        .eq('user_id', user.id)
        .eq('casino_code', 'BLAZE');

      if (error) {
        console.error('Error checking Blaze configuration:', error);
        return;
      }

      setUserTokens(data || []);
      setIsConfigured(data && data.length > 0 && data.some(token => 
        token.is_active && token.token && token.token.trim() !== ''
      ));
    } catch (error) {
      console.error('Error checking Blaze configuration:', error);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const handleOpenModal = () => {
    const blazeTokenData = userTokens.find(token => token.casino_code === 'BLAZE');
    const currentToken = blazeTokenData?.token || '';
    setBlazeToken(currentToken);
    setAlertMessage(null);
    blazeConfigModal.openModal();
  };

  const handleConfigureBlaze = async () => {
    try {
      setConfigLoading(true);
      const tokenValue = blazeToken.trim();
      
        const { data, error } = await supabase.rpc('configure_casino_token', {
          p_casino_name: 'Blaze',
          p_casino_code: 'BLAZE',
          p_token: tokenValue || '',
          p_is_active: tokenValue ? true : false
        });

      if (error) {
        throw error;
      }

          setAlertMessage({
        type: 'success',
        message: 'Token da Blaze configurado com sucesso!'
          });

      await checkBlazeConfiguration();
      
      setTimeout(() => {
          blazeConfigModal.closeModal();
          setAlertMessage(null);
      }, 2000);

    } catch (error: any) {
      console.error('Erro ao configurar token:', error);
      setAlertMessage({
        type: 'error',
        message: `Erro ao configurar token: ${error.message}`
      });
    } finally {
      setConfigLoading(false);
    }
  };

  // Conectar ao WebSocket e iniciar operação
  const handleOperate = async () => {
    if (isOperating) {
      // Parar operação
      try {
        setOperationLoading(true);
        
        const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId: userIdRef.current,
            action: 'stop-operation'
                  })
                });
                
        const result = await response.json();

        if (result.success) {
          setIsOperating(false);
          operationRef.current = false;
          setOperationStatus('DESCONECTADO');
        setOperationError(null);
          setOperationActive(false);
          
          // Parar monitoramento
          monitoringRef.current = false;
          setError(null);
          
          setOperationSuccess('Operação encerrada com sucesso');
          setTimeout(() => setOperationSuccess(null), 3000);
          } else {
          setOperationError(`Erro ao parar operação: ${result.error}`);
        }
      } catch (error: any) {
        setOperationError('Erro inesperado ao parar operação');
      } finally {
        setOperationLoading(false);
      }
      return;
    }

    // Iniciar operação
    setOperationLoading(true);
    setOperationError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setOperationError('Usuário não autenticado');
        return;
      }

      userIdRef.current = user.id;
      console.log('🎮 Conectando ao WebSocket para operação...');
      setOperationStatus('CONECTANDO...');

      // Conectar ao WebSocket
      const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'bet-connect'
        })
      });

      const result = await response.json();

      if (!result.success) {
        setOperationError(`Erro na conexão WebSocket: ${result.error}`);
        setOperationStatus('ERRO');
        return;
      }

      console.log('✅ Conectado ao WebSocket com sucesso');
      
      setIsOperating(true);
      operationRef.current = true;
              setOperationStatus('OPERANDO');
      setOperationError(null);

      // Iniciar monitoramento
      monitoringRef.current = true;
      startMonitoring();

    } catch (error) {
      console.error('❌ Erro ao conectar:', error);
      setOperationError('Erro inesperado na conexão');
      setOperationStatus('ERRO');
    } finally {
      setOperationLoading(false);
    }
  };

  // Iniciar operação de apostas
  const handleStartOperation = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'start-operation'
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setOperationSuccess('Operação de apostas iniciada!');
      setTimeout(() => setOperationSuccess(null), 3000);

    } catch (error: any) {
      setOperationError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Parar operação de apostas
  const handleStopOperation = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'stop-operation'
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setOperationSuccess('Operação de apostas parada!');
      setTimeout(() => setOperationSuccess(null), 3000);

    } catch (error: any) {
      setOperationError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Iniciar monitoramento dos logs
  const startMonitoring = async () => {
    while (monitoringRef.current) {
    try {
      const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
            action: 'get-websocket-logs'
        })
      });

      const result = await response.json();

        if (result.success && result.data) {
          setWebsocketLogs(result.data.logs || []);
          setLastFiveResults(result.data.lastFiveResults || []);
          setConnectionStatus(result.data.connectionStatus || { connected: false, lastUpdate: Date.now() });
          setOperationActive(result.data.operationActive || false);
          setOperationState(result.data.operationState || null);
          // NOVO: Capturar estado da janela de apostas
          setBettingWindow(result.data.bettingWindow || { isOpen: false });
        }

    } catch (error) {
        console.error('Erro no monitoramento:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos
    }
  };

  // Buscar relatório
  const fetchOperationReport = async () => {
    try {
      const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'get-operation-report'
        })
      });

      const result = await response.json();

      if (result.success && result.data) {
        setOperationReport(result.data);
      }

    } catch (error) {
      console.error('Erro ao buscar relatório:', error);
    }
  };

  // Reset relatório
  const resetOperationReport = async () => {
    try {
      const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'reset-operation-report'
        })
      });

      const result = await response.json();

      if (result.success) {
        await fetchOperationReport();
      }

    } catch (error) {
      console.error('Erro ao resetar relatório:', error);
    }
  };

  useEffect(() => {
    if (userIdRef.current && isOperating) {
      fetchOperationReport();
      const interval = setInterval(fetchOperationReport, 10000); // A cada 10 segundos
      return () => clearInterval(interval);
    }
  }, [isOperating]);

  useEffect(() => {
    return () => {
        monitoringRef.current = false;
      operationRef.current = false;
    };
  }, []);

  // NOVO: Controle inteligente do botão baseado no padrão E janela de apostas
  const hasCompletePattern = lastFiveResults.length >= 5;
  const canStartOperation = hasCompletePattern && bettingWindow.isOpen && !operationActive;
  
  // IMPORTANTE: Pattern para apostas deve seguir ordem visual (mais recente → mais antigo)
  const currentPattern = lastFiveResults.slice().reverse().map(r => r.color).join('');

  return (
    <div className="min-h-screen bg-black text-green-400 relative overflow-hidden">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10 p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Título */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2 font-mono">
              🎰 BLAZE MEGAROULETTE BR - SISTEMA SIMPLIFICADO
            </h1>
            <p className="text-gray-400 font-mono">
              // Operação baseada nos últimos 5 resultados
            </p>
          </div>

          {/* Erro Global */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 font-mono">
              {error}
            </div>
          )}
          
          {/* Blaze Token Card */}
          <button
            onClick={handleOpenModal}
            className={`
              w-full p-4 rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:scale-[1.02]
              ${isConfigured 
                ? 'bg-green-500/5 border-green-500/30 shadow-lg shadow-green-500/20' 
                : 'bg-red-500/5 border-red-500/30 shadow-lg shadow-red-500/20'
              }
            `}
            style={{ backgroundColor: isConfigured ? '#131619' : '#1a1416' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`
                  p-2 rounded-lg
                  ${isConfigured 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-red-500/20 text-red-400'
                  }
                `}>
                  <Key className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <h3 className={`text-sm font-semibold font-mono ${
                    isConfigured ? 'text-green-400' : 'text-red-400'
                  }`}>
                    🔑 ACESSO_BLAZE
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">
                    {`// Credenciais de autenticação para sistema Blaze`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-mono font-semibold ${
                  isConfigured 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {isConfigured ? 'CONFIGURADO' : 'NÃO_CONFIGURADO'}
                </span>
                <Settings className={`h-4 w-4 ${
                  isConfigured ? 'text-green-400' : 'text-red-400'
                }`} />
              </div>
            </div>
          </button>

          {/* Card Operação */}
          <Card className="border-blue-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-400 font-mono">
                ⚡ OPERAÇÃO_WEBSOCKET
              </CardTitle>
              <CardDescription className="text-gray-400 font-mono text-xs">
                {`// Conexão WebSocket para apostas no MegaRoulette - Sistema Simplificado`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                
                {/* Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full shadow-lg ${
                      isOperating 
                        ? 'bg-blue-400 animate-pulse shadow-blue-400/50' 
                        : operationStatus === 'ERRO'
                          ? 'bg-red-400 shadow-red-400/50'
                          : 'bg-gray-400 shadow-gray-400/50'
                    }`}></div>
                    <span className={`font-medium font-mono ${
                      isOperating 
                        ? 'text-blue-400' 
                        : operationStatus === 'ERRO'
                          ? 'text-red-400'
                          : 'text-gray-400'
                    }`}>
                      {operationStatus}
                    </span>
                  </div>
                  
                  {isOperating && (websocketLogs.length > 0 || lastFiveResults.length > 0) && (
                    <div className="text-xs font-mono text-gray-500">
                      LOGS: {websocketLogs.length} | ÚLTIMOS_5: {lastFiveResults.length}/5
                    </div>
                  )}
                </div>

                {/* Últimos 5 Resultados */}
                {lastFiveResults.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-blue-400 font-semibold">🎯 ÚLTIMOS_5_RESULTADOS:</div>
                    <div className="flex gap-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                      {lastFiveResults.slice().reverse().map((result, index) => {
                        const baseClasses = "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold font-mono shadow-lg transition-all duration-300 hover:scale-110";
                        const colorClasses = result.color === 'R' 
                          ? 'bg-red-500 text-white shadow-red-500/50' 
                          : 'bg-gray-800 text-white border border-gray-600 shadow-gray-800/50';
                        
                        return (
                          <div
                            key={`result-${index}-${result.gameId}`}
                            className={`${baseClasses} ${colorClasses}`}
                            title={`Número: ${result.number} | Game: ${result.gameId}`}
                          >
                            {result.color}
                          </div>
                        );
                      })}
                      {lastFiveResults.length < 5 && (
                        Array.from({ length: 5 - lastFiveResults.length }).map((_, index) => (
                          <div
                            key={`empty-${index}`}
                            className="w-8 h-8 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center text-xs text-gray-500"
                          >
                            ?
                    </div>
                        ))
                      )}
                    </div>
                    <div className="text-xs font-mono text-gray-400">
                      Padrão para apostas: {currentPattern || 'Aguardando...'} ({lastFiveResults.length}/5 completo)
                    </div>
                    {lastFiveResults.length >= 5 && (
                      <div className="text-xs font-mono text-blue-300 bg-blue-500/10 p-2 rounded border border-blue-500/20">
                        💡 Apostas seguem ordem visual: {currentPattern.split('').join(' → ')} (mais recente primeiro)
                  </div>
                )}

                    {/* NOVO: Estado da janela de apostas */}
                    {isOperating && (
                      <div className={`text-xs font-mono p-2 rounded border ${
                        bettingWindow.isOpen 
                          ? 'text-green-300 bg-green-500/10 border-green-500/20' 
                          : 'text-orange-300 bg-orange-500/10 border-orange-500/20'
                      }`}>
                        🎰 Janela de apostas: {bettingWindow.isOpen ? 'ABERTA' : 'FECHADA'}
                        {bettingWindow.currentGameId && ` | Jogo: ${bettingWindow.currentGameId}`}
                      </div>
                    )}
                  </div>
                )}

                {/* Estado da Operação */}
                {operationState && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-cyan-400 font-semibold">🤖 ESTADO_OPERAÇÃO:</div>
                    <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg space-y-1 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Padrão Ativo:</span>
                        <span className="text-cyan-400">{operationState.pattern}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Nível Atual:</span>
                        <span className="text-cyan-400">{operationState.level + 1}/5</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Martingale:</span>
                        <span className="text-cyan-400">{operationState.martingaleLevel}x</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Status:</span>
                        <span className={operationState.waitingForResult ? 'text-yellow-400' : 'text-green-400'}>
                          {operationState.waitingForResult ? 'AGUARDANDO_RESULTADO' : 'PRONTO'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Logs do WebSocket */}
                {websocketLogs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-blue-400 font-semibold">📋 LOGS_WEBSOCKET:</div>
                    <div className="max-h-64 overflow-y-auto p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-1">
                      {websocketLogs.slice(0, 20).map((log, index) => (
                        <div key={`log-${index}-${log.timestamp}`} className="text-xs font-mono flex items-start gap-2">
                          <span className="text-gray-500 text-xs">
                            {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                          </span>
                          <span className={`flex-1 ${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-green-400' :
                            log.type === 'game' ? 'text-yellow-400' :
                            log.type === 'bets-open' ? 'text-green-400 font-bold' :
                            log.type === 'bets-closed' ? 'text-red-400 font-bold' :
                            'text-gray-300'
                          }`}>
                            {log.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Erro */}
                {operationError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <span className="text-xs font-mono text-red-400">{operationError}</span>
                  </div>
                )}

                {/* Sucesso */}
                {operationSuccess && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <span className="text-xs font-mono text-green-400">{operationSuccess}</span>
                  </div>
                )}

                {/* Botões de Controle */}
                <div className="space-y-2">
                  {/* Botão Principal - Conectar/Desconectar */}
                  <Button 
                    onClick={handleOperate}
                    disabled={operationLoading || !isConfigured}
                    className={`w-full font-mono ${
                      isOperating 
                        ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30' 
                        : 'bg-blue-500/20 border border-blue-500/50 text-blue-400 hover:bg-blue-500/30'
                    }`}
                    variant="outline"
                  >
                    {operationLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : isOperating ? (
                      <Square className="h-4 w-4 mr-2" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    {operationLoading 
                      ? 'CONECTANDO...' 
                      : isOperating 
                        ? 'DESCONECTAR' 
                        : 'CONECTAR'
                    }
                  </Button>

                  {/* Botões de Operação de Apostas */}
                  {isOperating && (
                    <div className="flex gap-2">
                  <Button 
                        onClick={handleStartOperation}
                        disabled={!canStartOperation || loading || operationActive}
                        className="flex-1 font-mono bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30"
                    variant="outline"
                  >
                      <PlayCircle className="h-4 w-4 mr-2" />
                        {canStartOperation 
                          ? `INICIAR (${currentPattern})` 
                          : !hasCompletePattern 
                            ? `AGUARDANDO (${lastFiveResults.length}/5)`
                            : !bettingWindow.isOpen
                              ? 'APOSTAS_FECHADAS'
                              : 'AGUARDANDO...'
                    }
                  </Button>

                      <Button 
                        onClick={handleStopOperation}
                        disabled={loading || !operationActive}
                        className="flex-1 font-mono bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30"
                        variant="outline"
                      >
                        <StopCircle className="h-4 w-4 mr-2" />
                        PARAR_APOSTAS
                      </Button>
                    </div>
                  )}
                </div>

              </div>
            </CardContent>
          </Card>

          {/* Card Relatório de Operações */}
          {operationReport && (
            <Card className="border-cyan-500/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-cyan-400 font-mono">
                  📊 RELATÓRIO_OPERAÇÕES
                </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
                  {`// Estatísticas das operações de apostas automáticas`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  
                                     {/* Resumo Principal */}
                   <div className="grid grid-cols-3 gap-4">
                     <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-center">
                       <div className="text-2xl font-bold text-cyan-400 font-mono">
                        {operationReport.summary.totalBets || 0}
                       </div>
                      <div className="text-xs text-gray-400 font-mono">APOSTAS</div>
                     </div>
                     
                     <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-center">
                       <div className="text-2xl font-bold text-blue-400 font-mono">
                        {operationReport.summary.winRate || 0}%
                       </div>
                      <div className="text-xs text-gray-400 font-mono">TAXA_ACERTO</div>
                     </div>
                     
                     <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                      <div className={`text-2xl font-bold font-mono ${
                        (operationReport.summary.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        R$ {(operationReport.summary.profit || 0).toFixed(2)}
                       </div>
                       <div className="text-xs text-gray-400 font-mono">LUCRO</div>
                     </div>
                   </div>

                  {/* Detalhes */}
                  <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                    <div className="space-y-2">
                                             <div className="flex justify-between">
                         <span className="text-gray-400">Vitórias:</span>
                        <span className="text-green-400">{operationReport.summary.wins || 0}</span>
                       </div>
                       <div className="flex justify-between">
                         <span className="text-gray-400">Derrotas:</span>
                        <span className="text-red-400">{operationReport.summary.losses || 0}</span>
                       </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Iniciado:</span>
                        <span className="text-gray-300">
                          {new Date(operationReport.summary.startedAt).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botão Reset */}
                  <Button 
                    onClick={resetOperationReport}
                    className="w-full font-mono bg-gray-500/20 border border-gray-500/50 text-gray-400 hover:bg-gray-500/30"
                    variant="outline"
                  >
                    RESET_RELATÓRIO
                  </Button>

                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* Modal de Configuração do Token Blaze */}
      <Modal
        isOpen={blazeConfigModal.isOpen}
        onClose={() => {
          setBlazeToken('');
          setAlertMessage(null);
          blazeConfigModal.closeModal();
        }}
        title={isConfigured ? 'EDITAR_TOKEN_BLAZE' : 'CONFIG_BLAZE'}
        description={isConfigured ? 'Atualize seu token de autenticação Blaze' : 'Configure seu token de autenticação Blaze'}
        type="info"
        actions={{
          primary: {
            label: isConfigured ? 'ATUALIZAR_TOKEN' : 'SALVAR_TOKEN',
            onClick: handleConfigureBlaze,
            loading: configLoading,
            disabled: false
          },
          secondary: {
            label: 'CANCELAR',
            onClick: () => {
              setBlazeToken('');
              setAlertMessage(null);
              blazeConfigModal.closeModal();
            }
          }
        }}
      >
        <div className="space-y-4">
          {alertMessage && (
            <InlineAlert
              type={alertMessage.type}
              message={alertMessage.message}
            />
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-300 font-mono">
              TOKEN_ACESSO
            </label>
            <input
              type="text"
              value={blazeToken}
              onChange={(e) => setBlazeToken(e.target.value)}
              placeholder="Cole seu token Blaze aqui..."
              className="w-full p-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
            <p className="text-xs text-gray-400 font-mono">
              {`// Token será criptografado e armazenado com segurança`}
            </p>
          </div>

          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400 font-mono">COMO_OBTER_TOKEN</span>
            </div>
            <div className="text-xs text-gray-300 font-mono space-y-1">
              <p>1. Faça login na sua conta Blaze</p>
              <p>2. Abra as Ferramentas do Desenvolvedor (F12)</p>
              <p>3. Vá para Application → Local Storage</p>
              <p>4. Selecione "https://blaze.bet.br"</p>
              <p>5. Encontre "ACCESS_TOKEN" e copie o valor</p>
              <p>6. Cole no campo acima</p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
} 