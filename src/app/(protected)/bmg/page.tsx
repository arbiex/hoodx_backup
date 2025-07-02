'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, RefreshCw, Zap, Key, Settings } from 'lucide-react';
import MatrixRain from '@/components/MatrixRain';
import Modal, { useModal } from '@/components/ui/modal';
import InlineAlert from '@/components/ui/inline-alert';
import BlazeMegaRouletteStrategyModal from '@/components/BlazeMegaRouletteStrategyModal';
import CreditDisplay from '@/components/CreditDisplay';

import OperationsCard from '@/components/OperationsCard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function BMG() {
  // Estados básicos
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ NOVO: Estado para tokens de autenticação
  const [authTokens, setAuthTokens] = useState<{
    ppToken: string;
    jsessionId: string;
    pragmaticUserId?: string;
  } | null>(null);

  // Estados para WebSocket logs
  const [websocketLogs, setWebsocketLogs] = useState<Array<{ 
    timestamp: number; 
    message: string; 
    type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' 
  }>>([]);

  // Estados para últimos 7 resultados (nova estratégia)
  const [lastSevenResults, setLastSevenResults] = useState<Array<{ 
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



  // Estados para modal de estratégia
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [selectedTipValue, setSelectedTipValue] = useState<number | null>(null);

  // NOVO: Estado da janela de apostas
  const [bettingWindow, setBettingWindow] = useState<{
    isOpen: boolean;
    currentGameId?: string;
    lastUpdate?: number;
  }>({ isOpen: false });

  const monitoringRef = useRef<boolean>(false);
  const operationRef = useRef<boolean>(false);
  const userIdRef = useRef<string>('');

  // ✅ NOVO: Estado para controlar quando é seguro parar
  const [canSafelyStop, setCanSafelyStop] = useState(true);

  // 🎯 FUNÇÃO INTELIGENTE: Determina quando é seguro parar a operação
  const checkCanSafelyStop = () => {
    if (!isOperating || !operationActive) {
      setCanSafelyStop(true);
      return;
    }

    // ❌ NÃO pode parar durante:
    // - Aguardando resultado de aposta
    // - No meio de sequência martingale
    // - Janela de apostas aberta + bot vai apostar
    if (operationState?.waitingForResult || 
        (operationState && operationState.martingaleLevel > 0) ||
        (bettingWindow?.isOpen && operationActive)) {
      setCanSafelyStop(false);
      return;
    }

    // ✅ Seguro para parar - momento entre operações
    setCanSafelyStop(true);
  };

  // 🔄 Executar verificação sempre que estados mudarem
  useEffect(() => {
    checkCanSafelyStop();
  }, [isOperating, operationActive, operationState, bettingWindow]);



  useEffect(() => {
    checkUser();
    checkBlazeConfiguration();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setUserEmail(user.email);
      userIdRef.current = user.id;
      
      // DEBUG: Log detalhado do usuário removido
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
        return;
      }

      setUserTokens(data || []);
      setIsConfigured(data && data.length > 0 && data.some(token => 
        token.is_active && token.token && token.token.trim() !== ''
      ));
    } catch (error) {
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
      setAlertMessage({
        type: 'error',
        message: `Erro ao configurar token: ${error.message}`
      });
    } finally {
      setConfigLoading(false);
    }
  };

  // Função para iniciar operação com tip específico
  const startOperation = async (tipValue: number) => {
    setOperationLoading(true);
    setOperationError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setOperationError('Usuário não autenticado');
        return;
      }

      userIdRef.current = user.id;
      

      
      setOperationStatus('AUTENTICANDO...');

      // ✅ ETAPA 1: Buscar token da Blaze
      
      const tokenResponse = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'get-blaze-token'
        })
      });
      const tokenData = await tokenResponse.json();
      
      if (!tokenData.success || !tokenData.token) {
        setOperationError('Token da Blaze não configurado. Clique no botão de configuração acima.');
        setOperationStatus('ERRO_AUTENTICAÇÃO');
        return;
      }
      
      // ✅ ETAPA 2: Gerar tokens via Supabase Edge Function (evita erro 451)
      
      const realBrowserHeaders = {
        'sec-ch-ua': (navigator as any).userAgentData?.brands?.map((brand: any) => 
          `"${brand.brand}";v="${brand.version}"`).join(', ') || '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': (navigator as any).userAgentData?.mobile ? '?1' : '?0',
        'sec-ch-ua-platform': `"${(navigator as any).userAgentData?.platform || 'Windows'}"`,
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
          blazeToken: tokenData.token,
          userAgent: navigator.userAgent,
          acceptLanguage: navigator.language,
          selectedCurrencyType: 'BRL',
          realBrowserHeaders: realBrowserHeaders
        })
      });

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        setOperationError(`Erro na Edge Function: ${authResponse.status} - ${errorText}`);
        setOperationStatus('ERRO_AUTENTICAÇÃO');
        return;
      }

      const authResult = await authResponse.json();
      
      if (!authResult.success || !authResult.data) {
        const errorMsg = authResult.error || 'Falha na geração de tokens via Edge Function';
        setOperationError(errorMsg);
        setOperationStatus('ERRO_AUTENTICAÇÃO');
        return;
      }

      // Preparar dados de autenticação
      const authData = authResult.data;
      setAuthTokens(authData);
      
      setOperationStatus('CONECTANDO...');

      // ✅ ETAPA 4: Conectar usando tokens gerados via Edge Function

      // Conectar ao WebSocket
      const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'bet-connect',
          tipValue, // Passar o valor do tip para a API
          // ✅ Usar tokens gerados no client-side
          authTokens: {
            ppToken: authData.ppToken,
            jsessionId: authData.jsessionId,
            pragmaticUserId: authData.pragmaticUserId
          },
          // ✅ NOVO: Enviar dados do usuário para repasse à Pragmatic
          userFingerprint: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: (navigator as any).userAgentData?.platform || navigator.platform,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screenResolution: `${screen.width}x${screen.height}`,
            colorDepth: screen.colorDepth,
            pixelRatio: window.devicePixelRatio,
            hardwareConcurrency: navigator.hardwareConcurrency,
            connectionType: (navigator as any).connection?.effectiveType
          },

        })
      });

      const result = await response.json();

      if (!result.success) {
        let errorMessage = `Erro na conexão WebSocket: ${result.error}`;
        
        // Tratamento específico para token expirado
        if (result.needsTokenUpdate) {
          errorMessage = result.error + ' Clique aqui para configurar.';
          setAlertMessage({
            type: 'error',
            message: errorMessage
          });
          
          // Auto redirect para config após 3 segundos
          setTimeout(() => {
            window.location.href = '/config';
          }, 5000);
        }
        
        setOperationError(errorMessage);
        setOperationStatus('ERRO');
        return;
      }

      
      setIsOperating(true);
      operationRef.current = true;
      setOperationStatus('OPERANDO');
      setOperationError(null);

      // Iniciar monitoramento
      monitoringRef.current = true;
      startMonitoring();

    } catch (error) {
      setOperationError('Erro inesperado na conexão');
      setOperationStatus('ERRO');
    } finally {
      setOperationLoading(false);
    }
  };

  // Função para confirmar estratégia e iniciar operação
  const handleStrategyConfirm = async (tipValue: number) => {
    try {
      setStrategyLoading(true);
      setSelectedTipValue(tipValue);
      
      // Fechar modal de estratégia
      setStrategyModalOpen(false);
      
      // Iniciar operação real
      await startOperation(tipValue);
      
    } catch (error) {
      setOperationError('Erro ao confirmar estratégia');
    } finally {
      setStrategyLoading(false);
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

    // Abrir modal de seleção de estratégia
    setStrategyModalOpen(true);
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
          // DEBUG: Log dos dados recebidos (apenas primeira vez ou mudanças)
          const currentLogsCount = result.data.logs?.length || 0;
          const previousLogsCount = websocketLogs.length;
          
          if (currentLogsCount !== previousLogsCount) {
          }
          
          setWebsocketLogs(result.data.logs || []);
          setLastSevenResults(result.data.lastSevenResults || []);
          setConnectionStatus(result.data.connectionStatus || { connected: false, lastUpdate: Date.now() });
          setOperationActive(result.data.operationActive || false);
          setOperationState(result.data.operationState || null);
          // NOVO: Capturar estado da janela de apostas
          setBettingWindow(result.data.bettingWindow || { isOpen: false });
        }

    } catch (error) {
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
  const hasCompletePattern = lastSevenResults.length >= 7;
  const canStartOperation = hasCompletePattern && bettingWindow.isOpen && !operationActive;
  
  // IMPORTANTE: Verificar se é padrão de repetição válido
  const isValidRepetitionPattern = lastSevenResults.length >= 7 && 
    lastSevenResults[5]?.color === lastSevenResults[0]?.color && 
    lastSevenResults[6]?.color === lastSevenResults[1]?.color;
  
  // Função para inverter cores (adaptada ao formato R/B do backend)
  const invertColor = (color: string): string => {
    if (color === 'R' || color === 'red') return 'B';
    if (color === 'B' || color === 'black') return 'R';
    return color; // green/G permanece inalterado
  };

  // Padrão base para apostas (primeiros 5 resultados - CORES HISTÓRICAS)
  const basePattern = lastSevenResults.slice(0, 5).map((r: any) => r.color);
  
  // ✅ NOVO: Padrão invertido que será apostado (CONTRA o histórico)
  const bettingPattern = basePattern.map(invertColor);
  
  // Padrão atual para exibição - MOSTRA AS CORES QUE SERÃO APOSTADAS
  const currentPattern = bettingPattern.join('');

  // ✅ Debug removido para evitar re-renders infinitos

  // Pattern para exibição no ESTADO_OPERAÇÃO - vem da API quando operação está ativa
  const displayPattern = operationState?.pattern || currentPattern;





  return (
    <div className="min-h-screen bg-black text-green-400 relative overflow-hidden">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10 p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          

          


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
                  
                  {isOperating && (websocketLogs.length > 0 || lastSevenResults.length > 0) && (
                    <div className="text-xs font-mono text-gray-500">
                      LOGS: {websocketLogs.length} | ÚLTIMOS_7: {lastSevenResults.length}/7
                    </div>
                  )}
                </div>

                {/* Últimos 7 Resultados */}
                {lastSevenResults.length > 0 && (
                  <div className="space-y-2">

                    <div className="flex gap-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg flex-wrap">
                      {lastSevenResults.slice().reverse().map((result: any, index: number) => {
                        // Calcular posição cronológica: index 0 = posição 7 (mais recente), index 6 = posição 1 (mais antigo)
                        const cronologicalPosition = lastSevenResults.length - index;
                        const baseClasses = "w-12 h-12 rounded-full flex flex-col items-center justify-center text-xs font-bold font-mono shadow-lg transition-all duration-300 hover:scale-110";
                        const colorClasses = result.color === 'R' 
                          ? 'bg-red-500 text-white shadow-red-500/50' 
                          : 'bg-gray-800 text-white border border-gray-600 shadow-gray-800/50';
                        
                        return (
                          <div
                            key={`result-${index}-${result.gameId}`}
                            className={`${baseClasses} ${colorClasses}`}
                            title={`Posição ${cronologicalPosition} | Número: ${result.number} | Game: ${result.gameId}`}
                          >
                            <div className="text-[8px] leading-none">{cronologicalPosition}</div>
                            <div className="text-xs leading-none">{result.color}</div>
                          </div>
                        );
                      })}
                      {lastSevenResults.length < 7 && (
                        Array.from({ length: 7 - lastSevenResults.length }).map((_, index) => {
                          const cronologicalPosition = 7 - lastSevenResults.length - index;
                          return (
                            <div
                              key={`empty-${index}`}
                              className="w-12 h-12 rounded-full border-2 border-dashed border-gray-600 flex flex-col items-center justify-center text-xs text-gray-500"
                            >
                              <div className="text-[8px] leading-none">{cronologicalPosition}</div>
                              <div className="text-xs leading-none">?</div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {isValidRepetitionPattern && (
                      <div className="text-xs font-mono text-green-300 bg-green-500/10 p-2 rounded border border-green-500/20">
                        ✅ Padrão de repetição válido: Posições 1,2 repetiram em 6,7!
                  </div>
                )}


                  </div>
                )}

                {/* Estado da Operação */}
                {operationState && (
                  <div className="space-y-2">

                    <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg space-y-1 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Apostas:</span>
                        <span className="text-cyan-400">{displayPattern ? displayPattern.split('').map((cor, i) => `${i+1}:${cor}`).join(' ') : 'N/A'}</span>
                      </div>
                      {lastSevenResults.length >= 5 && (
                      <div className="flex justify-between">
                          <span className="text-gray-400">Histórico:</span>
                          <span className="text-gray-500">{basePattern.map((cor, i) => `${i+1}:${cor}`).join(' ')}</span>
                      </div>
                      )}

                    </div>
                  </div>
                )}

                {/* Logs do WebSocket */}
                {websocketLogs.length > 0 && (
                  <div className="space-y-2">

                    <div className="max-h-64 overflow-y-auto p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-1">
                      {websocketLogs.filter(log => 
                        !log.message.includes('🎰 Janela de apostas') && 
                        !log.message.includes('Apostas abertas') && 
                        !log.message.includes('Apostas fechadas')
                      ).slice(0, 20).map((log, index) => (
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
                  {/* Botão Principal - Começar/Parar Apostas */}
                  <Button 
                    onClick={handleOperate}
                    disabled={
                      operationLoading || 
                      !isConfigured || 
                      (isOperating && !canSafelyStop) // ✅ NOVO: Desabilita quando operando e não é seguro parar
                    }
                    className={`w-full font-mono ${
                      isOperating 
                        ? canSafelyStop
                          ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30' // Pode parar
                          : 'bg-gray-500/20 border border-gray-500/50 text-gray-400 cursor-not-allowed' // Não pode parar
                        : 'bg-blue-500/20 border border-blue-500/50 text-blue-400 hover:bg-blue-500/30'
                    } transition-all duration-300`}
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
                        ? canSafelyStop 
                          ? 'PARAR DE APOSTAR'
                          : 'AGUARDE PARA PARAR'
                        : 'COMEÇAR A APOSTAR'
                    }
                  </Button>

                  {/* ✅ ESTADO VISUAL SIMPLIFICADO */}
                  {isOperating && (
                    <div className={`p-2 rounded-lg ${
                      canSafelyStop 
                        ? 'bg-green-500/10 border border-green-500/30' 
                        : 'bg-orange-500/10 border border-orange-500/30'
                    }`}>
                      <div className="flex items-center gap-2 justify-center">
                        <div className={`w-2 h-2 rounded-full ${
                          canSafelyStop 
                            ? 'bg-green-400' 
                            : 'bg-orange-400 animate-pulse'
                        }`}></div>
                        <span className={`text-xs font-mono ${
                          canSafelyStop 
                            ? 'text-green-400' 
                            : 'text-orange-400'
                        }`}>
                          {canSafelyStop ? 'Seguro para parar' : 'Em operação'}
                        </span>
                      </div>
                    </div>
                  )}

                </div>

              </div>
            </CardContent>
          </Card>







          {/* Novos Cards dos Componentes */}
          <OperationsCard operationReport={operationReport} />
          
          <CreditDisplay />

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
              <p>4. Selecione &quot;https://blaze.bet.br&quot;</p>
              <p>5. Encontre &quot;ACCESS_TOKEN&quot; e copie o valor</p>
              <p>6. Cole no campo acima</p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal de Seleção de Estratégia */}
      <BlazeMegaRouletteStrategyModal
        isOpen={strategyModalOpen}
        onClose={() => setStrategyModalOpen(false)}
        onConfirm={handleStrategyConfirm}
        loading={strategyLoading}
      />
    </div>
  );
} 