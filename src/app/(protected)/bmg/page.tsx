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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function BMG() {
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

  // Estados para últimos 10 resultados
  const [lastTenResults, setLastTenResults] = useState<Array<{ 
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

  // 📊 NOVO: Estados para histórico de sessões
  const [sessionsHistory, setSessionsHistory] = useState<{
    sessions: Array<{
      id: string;
      session_id: string;
      started_at: string;
      ended_at?: string;
      total_bets: number;
      total_wins: number;
      total_losses: number;
      net_profit: number;
      win_rate: number;
      session_status: string;
      end_reason?: string;
      betting_pattern?: string;
      tip_value: number;
      duration_seconds?: number;
    }>;
    totals: {
      totalSessions: number;
      totalBets: number;
      totalWins: number;
      totalLosses: number;
      totalProfit: number;
      overallWinRate: number;
    };
    currentSession?: {
      sessionId: string;
      startedAt: string;
      isActive: boolean;
    };
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  const [userNetworkInfo, setUserNetworkInfo] = useState({
    ip: 'Detectando...',
    vpnDetected: false,
    vpnStatus: 'Verificando...',
    location: 'Detectando...'
  });

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
      
      // ✅ NOVO: Capturar dados completos do usuário
      const userInfo = getUserInfo();
      
      setOperationStatus('CONECTANDO...');

      // Conectar ao WebSocket
      const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'bet-connect',
          tipValue, // Passar o valor do tip para a API
          // ✅ NOVO: Enviar dados do usuário para repasse à Pragmatic
          userInfo: {
            ...userInfo,
            ip: userNetworkInfo.ip,
            vpnDetected: userNetworkInfo.vpnDetected,
            location: userNetworkInfo.location
          }
        })
      });

      const result = await response.json();

      if (!result.success) {
        setOperationError(`Erro na conexão WebSocket: ${result.error}`);
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
          setLastTenResults(result.data.lastTenResults || []);
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

  // 📊 NOVO: Buscar histórico de sessões
  const fetchSessionsHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'get-sessions-history'
        })
      });

      const result = await response.json();

      if (result.success) {
        setSessionsHistory(result.data);
      } else {
      }

    } catch (error) {
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (userIdRef.current && isOperating) {
      fetchOperationReport();
      const interval = setInterval(fetchOperationReport, 10000); // A cada 10 segundos
      return () => clearInterval(interval);
    }
  }, [isOperating]);

  // 📊 NOVO: Carregar histórico inicial e atualizar quando necessário
  useEffect(() => {
    if (userIdRef.current) {
      fetchSessionsHistory();
    }
  }, []); // Executar apenas uma vez após carregar o usuário

  // 📊 NOVO: Atualizar histórico quando operação para
  useEffect(() => {
    if (userIdRef.current && !isOperating && operationRef.current) {
      // Delay para garantir que a sessão foi finalizada no backend
      setTimeout(() => {
        fetchSessionsHistory();
      }, 2000);
    }
    operationRef.current = isOperating;
  }, [isOperating]);

  useEffect(() => {
    return () => {
        monitoringRef.current = false;
      operationRef.current = false;
    };
  }, []);

  // NOVO: Controle inteligente do botão baseado no padrão E janela de apostas
  const hasCompletePattern = lastTenResults.length >= 10;
  const canStartOperation = hasCompletePattern && bettingWindow.isOpen && !operationActive;
  
  // IMPORTANTE: Pattern para apostas = inverter ordem (recente→antigo para antigo→recente) + cores opostas
  const currentPattern = lastTenResults
    .slice().reverse()  // 1. Inverter ordem: recente→antigo para antigo→recente
    .map((r: any) => r.color === 'R' ? 'B' : r.color === 'B' ? 'R' : r.color) // 2. Trocar cores
    .join('');

  // Pattern para exibição no ESTADO_OPERAÇÃO (ordem cronológica: antigo → recente, cores opostas)
  const displayPattern = lastTenResults
    .slice().reverse()  // 1. Inverter ordem: recente→antigo para antigo→recente
    .map((r: any) => r.color === 'R' ? 'B' : r.color === 'B' ? 'R' : r.color) // 2. Trocar cores
    .join('');

  // Adicionar função para capturar informações do usuário
  function getUserInfo() {
    const ua = navigator.userAgent;
    
    // Detectar sistema operacional
    let platform = 'Unknown';
    if (ua.includes('Windows')) platform = 'Windows';
    else if (ua.includes('Macintosh') || ua.includes('Mac OS')) platform = 'macOS';
    else if (ua.includes('Linux')) platform = 'Linux';
    else if (ua.includes('Android')) platform = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) platform = 'iOS';

    // Detectar navegador
    let browser = 'Unknown';
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Opera')) browser = 'Opera';

    // Detectar se é mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    // Detectar timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Detectar idioma
    const language = navigator.language || 'pt-BR';

    // Screen info
    const screenInfo = {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth
    };

    return {
      userAgent: ua,
      platform,
      browser,
      isMobile,
      timezone,
      language,
      screenInfo,
      timestamp: new Date().toISOString()
    };
  }

  // ✅ NOVO: Detectar informações de rede do usuário
  useEffect(() => {
    async function detectNetworkInfo() {
      try {
        // Detectar IP usando múltiplas APIs
        const ipApis = [
          'https://api.ipify.org?format=json',
          'https://ipapi.co/json/',
          'https://api.myip.com'
        ];

        let detectedIP = 'Não detectado';
        let location = 'Não detectado';
        let vpnDetected = false;

        for (const api of ipApis) {
          try {
            const response = await fetch(api);
            const data = await response.json();
            
            if (data.ip) {
              detectedIP = data.ip;
              
              // Se a API retorna informações de localização
              if (data.city && data.country) {
                location = `${data.city}, ${data.country}`;
              }
              
              // Verificação básica de VPN (algumas APIs fornecem isso)
              if (data.proxy === true || data.vpn === true || data.hosting === true) {
                vpnDetected = true;
              }
              
              break; // Parar no primeiro sucesso
            }
          } catch (error) {
            continue;
          }
        }

        // Verificação adicional de VPN baseada em padrões de IP
        const vpnPatterns = [
          /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./,
          /^169\.254\./, /^127\./, /^::1/, /^fc00:/, /^fe80:/
        ];
        
        const isPrivateIP = vpnPatterns.some(pattern => pattern.test(detectedIP));
        
        setUserNetworkInfo({
          ip: detectedIP,
          vpnDetected: vpnDetected || isPrivateIP,
          vpnStatus: vpnDetected ? 'DETECTADA' : (isPrivateIP ? 'POSSÍVEL' : 'NÃO DETECTADA'),
          location
        });

        // Atualizar elementos na tela
        const ipElement = document.getElementById('user-ip');
        const vpnElement = document.getElementById('vpn-status');
        
        if (ipElement) ipElement.textContent = detectedIP;
        if (vpnElement) {
          vpnElement.textContent = vpnDetected ? 'DETECTADA' : (isPrivateIP ? 'POSSÍVEL' : 'NÃO DETECTADA');
          vpnElement.className = `font-mono text-sm ${
            vpnDetected ? 'text-red-400' : (isPrivateIP ? 'text-yellow-400' : 'text-green-400')
          }`;
        }

      } catch (error) {
        setUserNetworkInfo({
          ip: 'Erro na detecção',
          vpnDetected: false,
          vpnStatus: 'Erro na verificação',
          location: 'Erro na detecção'
        });
      }
    }

    detectNetworkInfo();
  }, []);

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
                  
                  {isOperating && (websocketLogs.length > 0 || lastTenResults.length > 0) && (
                    <div className="text-xs font-mono text-gray-500">
                      LOGS: {websocketLogs.length} | ÚLTIMOS_10: {lastTenResults.length}/10
                    </div>
                  )}
                </div>

                {/* Últimos 10 Resultados */}
                {lastTenResults.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-blue-400 font-semibold">🎯 ÚLTIMOS_10_RESULTADOS:</div>
                    <div className="flex gap-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg flex-wrap">
                      {lastTenResults.slice().reverse().map((result: any, index: number) => {
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
                      {lastTenResults.length < 10 && (
                        Array.from({ length: 10 - lastTenResults.length }).map((_, index) => (
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
                      Padrão para apostas: {currentPattern || 'Aguardando...'} ({lastTenResults.length}/10 completo)
                    </div>
                    {lastTenResults.length >= 10 && (
                      <div className="text-xs font-mono text-blue-300 bg-blue-500/10 p-2 rounded border border-blue-500/20">
                        💡 Apostas contra padrão: {currentPattern.split('').join(' → ')} (apenas cores opostas)
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
                        <span className="text-cyan-400">{displayPattern}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Nível Atual:</span>
                        <span className="text-cyan-400">{operationState.level + 1}/10</span>
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
                  {/* Botão Principal - Começar/Parar Apostas */}
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
                        ? 'PARAR DE APOSTAR' 
                        : 'COMEÇAR A APOSTAR'
                    }
                  </Button>


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

          {/* 📊 NOVO: Card Histórico de Sessões */}
          <Card className="border-purple-500/30 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
                    📊 HISTÓRICO_SESSÕES
                  </CardTitle>
                  <CardDescription className="text-gray-400 font-mono text-xs">
                    {`// Registro completo de todas as sessões de apostas`}
                  </CardDescription>
                </div>
                <Button 
                  onClick={fetchSessionsHistory}
                  disabled={historyLoading}
                  className="font-mono bg-purple-500/20 border border-purple-500/50 text-purple-400 hover:bg-purple-500/30"
                  variant="outline"
                  size="sm"
                >
                  {historyLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  ATUALIZAR
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-purple-400" />
                  <span className="ml-2 text-purple-400 font-mono">Carregando histórico...</span>
                </div>
              ) : sessionsHistory ? (
                <div className="space-y-6">
                  
                  {/* Totais Gerais */}
                  <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <h3 className="text-purple-400 font-mono font-bold mb-3">TOTAIS_GERAIS</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-400 font-mono">
                          {sessionsHistory.totals.totalSessions}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">SESSÕES</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-400 font-mono">
                          {sessionsHistory.totals.totalBets}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">APOSTAS</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-cyan-400 font-mono">
                          {sessionsHistory.totals.overallWinRate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-400 font-mono">TAXA_ACERTO</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold font-mono ${
                          sessionsHistory.totals.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          R$ {sessionsHistory.totals.totalProfit.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">LUCRO_TOTAL</div>
                      </div>
                    </div>
                    
                    {/* Estatísticas Adicionais */}
                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-purple-500/20">
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-400 font-mono">
                          {sessionsHistory.totals.totalWins}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">VITÓRIAS</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-red-400 font-mono">
                          {sessionsHistory.totals.totalLosses}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">DERROTAS</div>
                      </div>
                    </div>
                  </div>

                  {/* Sessão Atual */}
                  {sessionsHistory.currentSession && (
                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <h3 className="text-green-400 font-mono font-bold mb-2">SESSÃO_ATIVA</h3>
                      <div className="text-sm font-mono space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-400">ID:</span>
                          <span className="text-green-400">{sessionsHistory.currentSession.sessionId.split('_')[1]}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Iniciada:</span>
                          <span className="text-gray-300">
                            {new Date(sessionsHistory.currentSession.startedAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Lista de Sessões */}
                  <div className="space-y-3">
                    <h3 className="text-purple-400 font-mono font-bold">HISTÓRICO_RECENTE</h3>
                    <div className="max-h-96 overflow-y-auto space-y-2">
                      {sessionsHistory.sessions.length > 0 ? (
                        sessionsHistory.sessions.slice(0, 20).map((session) => (
                          <div 
                            key={session.id} 
                            className="p-3 bg-gray-800/30 border border-gray-700/50 rounded-lg hover:bg-gray-800/50 transition-colors"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-purple-400 font-mono text-sm">
                                  #{session.session_id.split('_')[1]?.slice(0, 8)}
                                </span>
                                <span className={`px-2 py-1 rounded text-xs font-mono ${
                                  session.session_status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                  session.session_status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {session.session_status.toUpperCase()}
                                </span>
                                {session.betting_pattern && (
                                  <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-xs font-mono">
                                    {session.betting_pattern}
                                  </span>
                                )}
                              </div>
                              <div className={`text-sm font-mono font-bold ${
                                session.net_profit >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                R$ {session.net_profit.toFixed(2)}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-4 gap-4 text-xs font-mono">
                              <div>
                                <span className="text-gray-400">Apostas:</span>
                                <span className="text-blue-400 ml-1">{session.total_bets}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Taxa:</span>
                                <span className="text-cyan-400 ml-1">{session.win_rate?.toFixed(1) || 0}%</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Tip:</span>
                                <span className="text-yellow-400 ml-1">R$ {session.tip_value?.toFixed(2) || 0}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Duração:</span>
                                <span className="text-gray-300 ml-1">
                                  {session.duration_seconds ? 
                                    `${Math.floor(session.duration_seconds / 60)}min` : 
                                    'N/A'
                                  }
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex justify-between items-center mt-2 text-xs">
                              <span className="text-gray-400 font-mono">
                                {new Date(session.started_at).toLocaleString('pt-BR')}
                              </span>
                              {session.end_reason && (
                                <span className="text-gray-500 font-mono">
                                  {session.end_reason.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-gray-400 font-mono">
                          Nenhuma sessão encontrada
                        </div>
                      )}
                    </div>
                  </div>
                  
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 font-mono">
                  Clique em &quot;ATUALIZAR&quot; para carregar o histórico
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nova seção: Dados Enviados para Pragmatic */}
          <div className="bg-gradient-to-br from-gray-900/50 to-black/50 backdrop-blur-sm rounded-xl border border-gray-700/30 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-blue-400">BMG_DADOS_PRAGMATIC</h3>
            </div>
            
            <div className="text-sm text-gray-400 mb-4">
              // Informações do seu dispositivo repassadas para os servidores da Pragmatic
            </div>

            <div className="space-y-3">
              {/* IP do Usuário */}
              <div className="flex justify-between items-center p-3 bg-gray-800/30 rounded-lg">
                <span className="text-gray-300">IP_ORIGEM:</span>
                <span className="text-green-400 font-mono text-sm" id="user-ip">{userNetworkInfo.ip}</span>
              </div>

              {/* Plataforma */}
              <div className="flex justify-between items-center p-3 bg-gray-800/30 rounded-lg">
                <span className="text-gray-300">PLATAFORMA:</span>
                <span className="text-blue-400 font-mono text-sm" id="user-platform">{typeof window !== 'undefined' ? getUserInfo().platform : 'Loading...'}</span>
              </div>

              {/* Navegador */}
              <div className="flex justify-between items-center p-3 bg-gray-800/30 rounded-lg">
                <span className="text-gray-300">NAVEGADOR:</span>
                <span className="text-purple-400 font-mono text-sm" id="user-browser">{typeof window !== 'undefined' ? getUserInfo().browser : 'Loading...'}</span>
              </div>

              {/* Dispositivo */}
              <div className="flex justify-between items-center p-3 bg-gray-800/30 rounded-lg">
                <span className="text-gray-300">DISPOSITIVO:</span>
                <span className="text-yellow-400 font-mono text-sm" id="user-device">
                  {typeof window !== 'undefined' ? (getUserInfo().isMobile ? 'MOBILE' : 'DESKTOP') : 'Loading...'}
                </span>
              </div>

              {/* Timezone */}
              <div className="flex justify-between items-center p-3 bg-gray-800/30 rounded-lg">
                <span className="text-gray-300">TIMEZONE:</span>
                <span className="text-cyan-400 font-mono text-sm" id="user-timezone">
                  {typeof window !== 'undefined' ? getUserInfo().timezone : 'Loading...'}
                </span>
              </div>

              {/* User Agent */}
              <div className="p-3 bg-gray-800/30 rounded-lg">
                <div className="text-gray-300 mb-2">USER_AGENT:</div>
                <div className="text-orange-400 font-mono text-xs break-all bg-gray-900/50 p-2 rounded border-l-2 border-orange-400/30" id="user-agent">
                  {typeof window !== 'undefined' ? getUserInfo().userAgent : 'Loading...'}
                </div>
              </div>

              {/* Status VPN */}
              <div className="flex justify-between items-center p-3 bg-gray-800/30 rounded-lg">
                <span className="text-gray-300">VPN_DETECTADA:</span>
                <span className="text-red-400 font-mono text-sm" id="vpn-status">{userNetworkInfo.vpnStatus}</span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="font-medium">TRANSPARÊNCIA:</span>
              </div>
              <div className="text-amber-300/80 text-sm mt-1">
                Estes são os dados exatos enviados aos servidores da Pragmatic. Seu IP real é repassado para evitar bloqueios.
              </div>
            </div>
          </div>

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