'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, RefreshCw, Zap, Key, Settings } from 'lucide-react';
import MatrixRain from '@/components/MatrixRain';
import Modal, { useModal } from '@/components/ui/modal';
import InlineAlert from '@/components/ui/inline-alert';
import BlazeMegaRouletteStrategyModal from '@/components/BlazeMegaRouletteStrategyModal';
import CreditDisplay from '@/components/CreditDisplay';
import { OperationsHistoryCard } from '@/components/OperationsHistoryCard';
import { useSimpleOperationsHistory } from '@/hooks/useSimpleOperationsHistory';
import { useBettingLogs } from '@/hooks/useBettingLogs';

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

  // Estados para modal de estratégia
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [tutorialModalOpen, setTutorialModalOpen] = useState(false);
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

  // Hook para histórico de operações
  const operationsHistory = useSimpleOperationsHistory();
  
  // NOVO: Hook simples para logs de apostas
  const bettingLogs = useBettingLogs();

  // NOVO: Estados para dados reais do usuário
  const [userFingerprint, setUserFingerprint] = useState<{
    userAgent: string;
    language: string;
    languages: string[];
    platform: string;
    timezone: string;
    screenResolution: string;
    colorDepth: number;
    pixelRatio: number;
    cookieEnabled: boolean;
    doNotTrack: string | null;
    referrer: string;
    viewport: string;
    connectionType?: string;
    hardwareConcurrency?: number;
    webdriver: boolean | undefined;
    maxTouchPoints: number;
    vendor: string;
    product: string;
    oscpu: string;
    buildID: string;
    deviceMemory: number | undefined;
    connectionDownlink: number | undefined;
    connectionRtt: number | undefined;
    connectionSaveData: boolean | undefined;
    canvasFingerprint: string;
    webglFingerprint: string;
    fontFingerprint: string;
    audioFingerprint: string;
    performanceTiming: {
      loadTime: number;
      domReadyTime: number;
      connectTime: number;
      requestTime: number;
    } | string;
  } | null>(null);

  useEffect(() => {
    checkUser();
    checkBlazeConfiguration();
  }, []);

  // Removido: Sistema complexo de operações ativas removido

  // ✅ NOVO: Sistema simples - controla dados da operação
  const [lastSavedData, setLastSavedData] = useState<{
    totalBets: number;
    netProfit: number;
  } | null>(null);
  const [operationStarted, setOperationStarted] = useState(false);

  // 📊 ATUALIZAÇÃO DE DADOS - só quando operação está ativa E tem dados
  useEffect(() => {
    if (!isOperating || !operationStarted || !operationReport?.summary) {
      return;
    }

    const currentData = {
      totalBets: operationReport.summary.totalBets,
      netProfit: operationReport.summary.profit
    };

    // 🎯 CHAVE: Só continua se os dados mudaram
    const hasChanged = !lastSavedData || 
      lastSavedData.totalBets !== currentData.totalBets ||
      lastSavedData.netProfit !== currentData.netProfit;

    if (!hasChanged) {
      console.log('⏭️ Dados iguais - não atualizando');
      return;
    }

    console.log('📊 ATUALIZANDO OPERAÇÃO:', {
      anterior: lastSavedData,
      atual: currentData
    });

    // 🔄 ATUALIZAR registro existente
    const updateOperationData = async () => {
      const result = await bettingLogs.logCurrentData({
        totalBets: currentData.totalBets,
        netProfit: currentData.netProfit
      });

      if (result.success) {
        setLastSavedData(currentData);
        console.log('✅ Registro atualizado:', result);
        
        // 🔄 DISPARAR SINCRONIZAÇÃO EM CASCATA (atualização contínua)
        window.dispatchEvent(new CustomEvent('credits-updated'));
        window.dispatchEvent(new CustomEvent('operations-updated'));
      } else {
        console.error('❌ Erro ao atualizar:', result.error);
      }
    };
    
    updateOperationData();
  }, [operationReport, isOperating, operationStarted, bettingLogs, lastSavedData]);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setUserEmail(user.email);
      userIdRef.current = user.id;
      

      setTimeout(() => checkInitialServerStatus(), 500); // Delay pequeno para garantir que o estado seja atualizado
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

  // NOVO: Função para capturar fingerprint real do navegador
  const captureUserFingerprint = useCallback(() => {
    try {
      // ✅ CORRIGIDO: Garantir que todos os dados sejam capturados corretamente
      const fingerprint = {
        userAgent: navigator.userAgent || 'unknown',
        language: navigator.language || 'pt-BR',
        languages: navigator.languages ? Array.from(navigator.languages) : [navigator.language || 'pt-BR'],
        platform: navigator.platform || 'unknown',
        timezone: (() => {
          try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
          } catch {
            return 'America/Sao_Paulo';
          }
        })(),
        screenResolution: (() => {
          try {
            return `${screen.width}x${screen.height}` || '1920x1080';
          } catch {
            return '1920x1080';
          }
        })(),
        colorDepth: screen.colorDepth || 24,
        pixelRatio: window.devicePixelRatio || 1,
        cookieEnabled: navigator.cookieEnabled !== undefined ? navigator.cookieEnabled : true,
        doNotTrack: navigator.doNotTrack || null,
        referrer: document.referrer || '',
        viewport: `${window.innerWidth}x${window.innerHeight}` || '1920x1080',
        connectionType: (navigator as any).connection?.effectiveType || 'unknown',
        hardwareConcurrency: navigator.hardwareConcurrency || 4,
        // ✅ NOVOS: Dados adicionais para disfarce mais realista
        webdriver: (navigator as any).webdriver || false,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        vendor: (navigator as any).vendor || 'Google Inc.',
        product: (navigator as any).product || 'Gecko',
        oscpu: (navigator as any).oscpu || 'unknown',
        buildID: (navigator as any).buildID || 'unknown',
        // Informações de memória (se disponível)
        deviceMemory: (navigator as any).deviceMemory || 8,
        // Informações de conexão detalhadas
        connectionDownlink: (navigator as any).connection?.downlink || 10,
        connectionRtt: (navigator as any).connection?.rtt || 100,
        connectionSaveData: (navigator as any).connection?.saveData || false,
        // ✅ SIMPLIFICADO: Fingerprints básicos (evitar problemas)
        canvasFingerprint: (() => {
          try {
            return generateCanvasFingerprint();
          } catch {
            return 'unavailable';
          }
        })(),
        webglFingerprint: (() => {
          try {
            return generateWebGLFingerprint();
          } catch {
            return 'unavailable';
          }
        })(),
        fontFingerprint: (() => {
          try {
            return generateFontFingerprint();
          } catch {
            return 'basic-fonts';
          }
        })(),
        audioFingerprint: (() => {
          try {
            return generateAudioFingerprint();
          } catch {
            return 'unavailable';
          }
        })(),
        performanceTiming: (() => {
          try {
            return getPerformanceTiming();
          } catch {
            return 'unavailable';
          }
        })()
      };
      
      setUserFingerprint(fingerprint);
      console.log('🔍 Fingerprint completo capturado:', {
        ...fingerprint,
        // Log resumido para não poluir console
        canvasFingerprint: fingerprint.canvasFingerprint.slice(0, 20) + '...',
        webglFingerprint: fingerprint.webglFingerprint.slice(0, 30) + '...'
      });
      return fingerprint;
    } catch (error) {
      console.error('❌ Erro ao capturar fingerprint:', error);
      // Retornar dados básicos mesmo em caso de erro
      return {
        userAgent: navigator.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        language: navigator.language || 'pt-BR',
        platform: navigator.platform || 'MacIntel',
        timezone: 'America/Sao_Paulo',
        screenResolution: '1920x1080'
      };
    }
     }, []);

  // ✅ NOVO: Gerar Canvas fingerprint
  const generateCanvasFingerprint = useCallback(() => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'unsupported';
      
      canvas.width = 280;
      canvas.height = 60;
      
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('HoodX 🎰 Blaze', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Mega Roulette BR', 4, 45);
      
      return canvas.toDataURL().slice(-50); // Últimos 50 chars
    } catch (error) {
      return 'error';
    }
  }, []);

  // ✅ NOVO: Gerar WebGL fingerprint
  const generateWebGLFingerprint = useCallback(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'unsupported';
      
      const webgl = gl as WebGLRenderingContext;
      const renderer = webgl.getParameter(webgl.RENDERER);
      const vendor = webgl.getParameter(webgl.VENDOR);
      
      return `${vendor}|${renderer}`.slice(0, 100);
    } catch (error) {
      return 'error';
    }
  }, []);

  // ✅ NOVO: Gerar Font fingerprint (sample)
  const generateFontFingerprint = useCallback(() => {
    try {
      const fonts = ['Arial', 'Helvetica', 'Times', 'Courier', 'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black', 'Impact'];
      const availableFonts = fonts.filter(font => {
        const span = document.createElement('span');
        span.innerHTML = 'mmmmmmmmlli';
        span.style.fontSize = '72px';
        span.style.fontFamily = font;
        document.body.appendChild(span);
        const width = span.offsetWidth;
        document.body.removeChild(span);
        return width > 0;
      });
      return availableFonts.join(',').slice(0, 100);
    } catch (error) {
      return 'error';
    }
  }, []);

  // ✅ NOVO: Gerar Audio fingerprint
  const generateAudioFingerprint = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      const gain = audioContext.createGain();
      
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(10000, audioContext.currentTime);
      
      gain.gain.setValueAtTime(0, audioContext.currentTime);
      oscillator.connect(analyser);
      analyser.connect(gain);
      gain.connect(audioContext.destination);
      
      oscillator.start(0);
      oscillator.stop(audioContext.currentTime + 0.1);
      
      const frequencyData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(frequencyData);
      
      return frequencyData.slice(0, 10).join(',').slice(0, 50);
    } catch (error) {
      return 'unsupported';
    }
  }, []);

  // ✅ NOVO: Obter Performance timing
  const getPerformanceTiming = useCallback(() => {
    try {
      if (!window.performance || !window.performance.timing) return 'unsupported';
      
      const timing = window.performance.timing;
      return {
        loadTime: timing.loadEventEnd - timing.navigationStart,
        domReadyTime: timing.domContentLoadedEventEnd - timing.navigationStart,
        connectTime: timing.connectEnd - timing.connectStart,
        requestTime: timing.responseEnd - timing.requestStart
      };
    } catch (error) {
      return 'error';
    }
  }, []);

  // NOVO: Capturar fingerprint na inicialização
  useEffect(() => {
    captureUserFingerprint();
  }, [captureUserFingerprint]);

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

      // Capturar dados atuais do navegador
      const currentFingerprint = captureUserFingerprint();
      
      // Adicionar headers reais do navegador
      const realHeaders = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': navigator.language + ',' + navigator.languages.slice(1, 3).join(',') + ';q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': navigator.userAgent,
        'X-User-Timezone': currentFingerprint?.timezone,
        'X-User-Resolution': currentFingerprint?.screenResolution,
        'X-User-Language': navigator.language,
        'X-User-Platform': navigator.platform
      };

             const response = await fetch('/api/bots/blaze/pragmatic/blaze-megarouletebr', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json'
         },
        body: JSON.stringify({
          userId: user.id,
          action: 'bet-connect',
          tipValue: tipValue,
          // Enviar fingerprint completo
          userFingerprint: currentFingerprint,
          clientHeaders: realHeaders,
          clientMetadata: {
            timestamp: Date.now(),
            sessionId: crypto.getRandomValues(new Uint32Array(1))[0].toString(16),
            browserFingerprint: currentFingerprint
          }
        })
      });

      const result = await response.json();

      if (!result.success) {
        // Se falhou a conexão, não precisa finalizar histórico (ainda não foi criado)
        setOperationError(`Erro na conexão WebSocket: ${result.error}`);
        setOperationStatus('ERRO');
        return;
      }

      // 🟢 CRIAR OPERAÇÃO NO BANCO - DIRETO DO BOTÃO
      console.log('🟢 BOTÃO INICIAR CLICADO - Criando operação...');
      const operationResult = await bettingLogs.logCurrentData({
        totalBets: 0,
        netProfit: 0
      });
      
      if (operationResult.success) {
        console.log('✅ Operação criada no banco:', operationResult);
        setOperationStarted(true);
        
        // 🔄 DISPARAR SINCRONIZAÇÃO EM CASCATA
        console.log('🔄 Disparando eventos de sincronização (início)...');
        window.dispatchEvent(new CustomEvent('credits-updated'));
        window.dispatchEvent(new CustomEvent('operations-updated'));
      }
      
      setIsOperating(true);
      operationRef.current = true;
      setOperationStatus('OPERANDO');
      setOperationError(null);

      // Iniciar monitoramento
      monitoringRef.current = true;
      startMonitoring();

    } catch (error) {
      // Se houve erro, não precisa finalizar histórico (ainda não foi criado)
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
          // 🏁 FINALIZAR OPERAÇÃO NO BANCO - DIRETO DO BOTÃO
          console.log('🔴 BOTÃO PARAR CLICADO - Finalizando operação...');
          await bettingLogs.finishOperation();
          
          setIsOperating(false);
          operationRef.current = false;
          setOperationStatus('DESCONECTADO');
        setOperationError(null);
          setOperationActive(false);
          
          // Parar monitoramento
          monitoringRef.current = false;
          setError(null);
          setOperationStarted(false); // Reset para próxima operação
          setLastSavedData(null);

          // 🔄 DISPARAR SINCRONIZAÇÃO EM CASCATA
          console.log('🔄 Disparando eventos de sincronização...');
          window.dispatchEvent(new CustomEvent('credits-updated'));
          window.dispatchEvent(new CustomEvent('operations-updated'));

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

          
          setWebsocketLogs(result.data.logs || []);
          setLastFiveResults(result.data.lastFiveResults || []);
          setConnectionStatus(result.data.connectionStatus || { connected: false, lastUpdate: Date.now() });
          setOperationActive(result.data.operationActive || false);
          setOperationState(result.data.operationState || null);
          // NOVO: Capturar estado da janela de apostas
          setBettingWindow(result.data.bettingWindow || { isOpen: false });
          
          // Sistema simplificado - dados salvos automaticamente via useEffect
          
          // NOVO: Atualizar estados do WebSocket baseado nos logs
  
        }

          } catch (error) {
      }

      // Verificar mais frequentemente durante operações ativas
      const delay = operationActive ? 1000 : 2000; // 1 segundo se operando, 2 segundos se não
      await new Promise(resolve => setTimeout(resolve, delay));
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
        
        // Sistema simplificado - dados são salvos automaticamente pelo useEffect
      }

    } catch (error) {
      console.error('Erro ao buscar relatório:', error);
    }
  };





  useEffect(() => {
    if (userIdRef.current && isOperating) {
      fetchOperationReport();
      const interval = setInterval(fetchOperationReport, 2000); // ✅ CORRIGIDO: A cada 2 segundos para tempo real
    return () => clearInterval(interval);
    }
  }, [isOperating]);





  // NOVO: Verificar status inicial do servidor ao carregar a página
  const checkInitialServerStatus = useCallback(async () => {
    if (!userIdRef.current) return;
    

    
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
        const { connectionStatus, operationActive, logs = [], lastFiveResults = [], bettingWindow = { isOpen: false }, operationState = null } = result.data;
        

        
        // Verificar se há atividade REAL no servidor (conexão ativa E operação ativa)
        const isReallyActive = connectionStatus?.connected && operationActive;
        
        // Sempre sincronizar os dados disponíveis (para mostrar logs históricos)
        if (logs.length > 0 || lastFiveResults.length > 0) {
          setWebsocketLogs(logs);
          setLastFiveResults(lastFiveResults);
          setConnectionStatus(connectionStatus || { connected: false, lastUpdate: Date.now() });
          setOperationState(operationState);
          setBettingWindow(bettingWindow);

        }
        
        // Só considerar "operando" se realmente estiver ativo
        if (isReallyActive) {
          setIsOperating(true);
          setOperationActive(true);
          setOperationStatus('OPERANDO');
          monitoringRef.current = true;
          startMonitoring();
        } else {
          setIsOperating(false);
          setOperationActive(false);
          setOperationStatus('DESCONECTADO');
        }
      }
    } catch (error) {
    }
  }, []);



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
          <Card className="border-green-500/30 backdrop-blur-sm">
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
                  

                </div>



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
            <Card className="border-green-500/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
                  📈 OPERAÇÕES
                </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
                  {`// Estatísticas em tempo real`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  
                                     {/* Resumo Principal - Layout Responsivo */}
                   {/* Desktop: Grid 3 colunas / Mobile: Cards empilhados */}
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                     {/* Card APOSTAS */}
                     <div className="p-3 sm:p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                       {/* Mobile: Layout horizontal */}
                       <div className="flex items-center justify-between sm:hidden">
                         <div className="text-sm text-gray-400 font-mono">APOSTAS:</div>
                         <div className="text-2xl font-bold text-green-400 font-mono">
                           {operationReport.summary.totalBets || 0}
                         </div>
                       </div>
                       {/* Desktop: Layout centralizado */}
                       <div className="hidden sm:block text-center">
                         <div className="text-2xl font-bold text-green-400 font-mono">
                           {operationReport.summary.totalBets || 0}
                         </div>
                         <div className="text-xs text-gray-400 font-mono">APOSTAS</div>
                       </div>
                     </div>
                     
                     {/* Card TAXA_ACERTO */}
                     <div className="p-3 sm:p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                       {/* Mobile: Layout horizontal */}
                       <div className="flex items-center justify-between sm:hidden">
                         <div className="text-sm text-gray-400 font-mono">TAXA_ACERTO:</div>
                         <div className="text-2xl font-bold text-green-400 font-mono">
                           {operationReport.summary.winRate || 0}%
                         </div>
                       </div>
                       {/* Desktop: Layout centralizado */}
                       <div className="hidden sm:block text-center">
                         <div className="text-2xl font-bold text-green-400 font-mono">
                           {operationReport.summary.winRate || 0}%
                         </div>
                         <div className="text-xs text-gray-400 font-mono">TAXA_ACERTO</div>
                       </div>
                     </div>
                     
                     {/* Card LUCRO */}
                     <div className="p-3 sm:p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                       {/* Mobile: Layout horizontal */}
                       <div className="flex items-center justify-between sm:hidden">
                         <div className="text-sm text-gray-400 font-mono">LUCRO:</div>
                         <div className={`text-2xl font-bold font-mono ${
                           (operationReport.summary.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                         }`}>
                           R$ {(operationReport.summary.profit || 0).toFixed(2)}
                         </div>
                       </div>
                       {/* Desktop: Layout centralizado */}
                       <div className="hidden sm:block text-center">
                         <div className={`text-2xl font-bold font-mono ${
                           (operationReport.summary.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                         }`}>
                           R$ {(operationReport.summary.profit || 0).toFixed(2)}
                         </div>
                         <div className="text-xs text-gray-400 font-mono">LUCRO</div>
                       </div>
                     </div>
                   </div>

                  {/* Detalhes */}
                  <div className="text-sm font-mono">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Iniciado:</span>
                      <span className="text-gray-300">
                        {new Date(operationReport.summary.startedAt).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>
          )}



          {/* Card CRÉDITOS_DISPONÍVEIS */}
                          <CreditDisplay />

          {/* Card HISTÓRICO_DE_OPERAÇÕES */}
          <OperationsHistoryCard />

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
        title={isConfigured ? 'EDITAR_TOKEN_BLAZE' : 'CONFIGURAR_BLAZE'}
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
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400 font-mono">COMO_OBTER_TOKEN</span>
              </div>
              <button
                onClick={() => setTutorialModalOpen(true)}
                className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-md text-xs font-semibold text-green-400 font-mono transition-colors duration-200"
              >
                VER_TUTORIAL
              </button>
            </div>
            <div className="text-xs text-gray-300 font-mono space-y-1">
              <p>1. Faça login na sua conta Blaze</p>
              <p>2. Abra as Ferramentas do Desenvolvedor (F12)</p>
              <p>3. Vá para Aplicação (Application) → Armazenamento Local (Local Storage)</p>
              <p>4. Selecione &quot;https://blaze.bet.br&quot;</p>
              <p>5. Encontre &quot;ACCESS_TOKEN&quot; e copie o valor</p>
              <p>6. Cole no campo acima</p>
            </div>
            
            <div className="mt-3 p-3 bg-gray-800/50 border border-gray-600/50 rounded-lg">
              <div className="text-xs font-semibold text-yellow-400 font-mono mb-2">EXEMPLO_TOKEN:</div>
              <div className="text-xs text-gray-300 font-mono flex items-center gap-2 overflow-hidden">
                <span className="text-orange-400 flex-shrink-0">ACCESS_TOKEN:</span>
                <span className="text-green-400 truncate">eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTM5N.....</span>
              </div>
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

      {/* Modal do Tutorial GIF */}
      {tutorialModalOpen && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[9999999] p-4">
          <div className="relative bg-gray-900 rounded-xl border border-gray-700 max-w-4xl max-h-[90vh] overflow-hidden">
            {/* Header do Modal */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-green-400 font-mono">TUTORIAL_ACCESS_TOKEN</h3>
              </div>
              <button
                onClick={() => setTutorialModalOpen(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors duration-200 text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Conteúdo do Modal */}
            <div className="p-4">
              <div className="text-sm text-gray-400 mb-4 font-mono">
                // Tutorial visual: Como obter o ACCESS_TOKEN da Blaze
              </div>
              <div className="flex justify-center">
                <img 
                  src="/step_accesstoken.gif" 
                  alt="Tutorial ACCESS_TOKEN"
                  className="max-w-full max-h-[60vh] object-contain rounded-lg border border-gray-700"
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
} 