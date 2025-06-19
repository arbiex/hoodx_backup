import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface WebSocketLog {
  timestamp: number;
  message: string;
  type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed';
}

interface GameResult {
  gameId: string;
  result: string;
  timestamp: number;
  number?: number;
  color?: string;
}

interface UseMegaRouletteWebSocketProps {
  userId: string;
  onPatternUpdate?: (patterns: any) => void;
  onGameResult?: (result: GameResult) => void;
}

export function useMegaRouletteWebSocket({ 
  userId, 
  onPatternUpdate, 
  onGameResult 
}: UseMegaRouletteWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<WebSocketLog[]>([]);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [pragmaticConnected, setPragmaticConnected] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const isConnectingRef = useRef(false);
  const onPatternUpdateRef = useRef(onPatternUpdate);
  const onGameResultRef = useRef(onGameResult);

  // Atualizar refs quando callbacks mudarem
  useEffect(() => {
    onPatternUpdateRef.current = onPatternUpdate;
    onGameResultRef.current = onGameResult;
  }, [onPatternUpdate, onGameResult]);

  // URL do nosso servidor WebSocket no Railway
  const RAILWAY_WEBSOCKET_URL = 'wss://websocket-blaze-megaroulette-production.up.railway.app';

  // Função para adicionar log
  const addLog = useCallback((message: string, type: WebSocketLog['type'] = 'info') => {
    const newLog: WebSocketLog = {
      timestamp: Date.now(),
      message,
      type
    };
    
    setLogs(prev => [newLog, ...prev.slice(0, 49)]); // Manter últimos 50 logs
  }, []);

  // Função para obter credenciais do Pragmatic Play
  const obtainPragmaticCredentials = useCallback(async () => {
    if (!userId) {
      addLog('❌ UserId não disponível para obter credenciais', 'error');
      return;
    }

    try {
      addLog('🔑 Obtendo credenciais do Pragmatic Play...', 'info');
      
      const response = await fetch('/api/bots/blaze/pragmatic_machine_learning/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          action: 'bet-connect',
          gameConfig: {
            tableId: 'mrbras531mrbr532' // Table ID padrão para Brazilian Mega Roulette
          }
        })
      });

      const result = await response.json();

      if (result.success && result.data?.config?.jsessionId) {
        const { jsessionId, tableId } = result.data.config;
        addLog(`✅ Credenciais obtidas: ${jsessionId.substring(0, 16)}...`, 'success');
        
        // Enviar credenciais para o servidor Railway
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'pragmatic_connect',
            jsessionId: jsessionId,
            tableId: tableId || 'mrbras531mrbr532'
          }));
          addLog('📤 Credenciais enviadas para o servidor Railway', 'info');
        } else {
          addLog('❌ WebSocket não está conectado para enviar credenciais', 'error');
        }
      } else {
        addLog(`❌ Erro ao obter credenciais: ${result.error || 'Resposta inválida'}`, 'error');
        console.log('🔍 Debug - Resposta completa:', result);
      }
    } catch (error: any) {
      addLog(`❌ Erro ao obter credenciais: ${error.message}`, 'error');
    }
  }, [userId, addLog]);

  // Função para conectar ao nosso servidor WebSocket
  const connectWebSocket = useCallback(async () => {
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      addLog('⚠️ WebSocket já está conectado ou conectando', 'info');
      return;
    }

    if (!userId) {
      addLog('❌ UserId não informado', 'error');
      return;
    }

    try {
      isConnectingRef.current = true;
      setConnectionStatus('connecting');
      reconnectAttemptsRef.current++;
      
      // Obter credenciais do Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        addLog('❌ Sessão não encontrada', 'error');
        return;
      }
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const accessToken = session.access_token;
      
      const wsUrl = `${RAILWAY_WEBSOCKET_URL}?userId=${userId}&supabaseUrl=${encodeURIComponent(supabaseUrl)}&supabaseKey=${encodeURIComponent(supabaseAnonKey)}&accessToken=${encodeURIComponent(accessToken)}`;
      addLog(`🔌 Conectando ao servidor Railway (tentativa ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`, 'info');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        addLog('✅ Conectado ao servidor Railway', 'success');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        isConnectingRef.current = false;

        // Enviar ping para manter conexão ativa
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'welcome':
              addLog(`🎉 ${data.message}`, 'success');
              break;
              
            case 'auth_success':
              addLog(`🔐 Autenticação realizada com sucesso`, 'success');
              // Tentar obter credenciais do Pragmatic Play
              addLog(`🔄 Iniciando obtenção de credenciais em 1 segundo...`, 'info');
              setTimeout(() => {
                addLog(`🔑 Executando obtainPragmaticCredentials...`, 'info');
                obtainPragmaticCredentials();
              }, 1000);
              break;
              
            case 'pragmatic_connected':
              addLog('🎰 Conectado ao Pragmatic Play', 'success');
              setPragmaticConnected(true);
              break;
              
            case 'pragmatic_disconnected':
              addLog(`🔌 Desconectado do Pragmatic Play - Code: ${data.code}, Reason: ${data.reason}`, 'info');
              setPragmaticConnected(false);
              
              // Se a desconexão não foi intencional (code !== 1000), tentar obter credenciais frescas
              if (data.code && data.code !== 1000) {
                addLog('🔄 Tentando obter credenciais frescas para reconexão...', 'info');
                setTimeout(() => {
                  obtainPragmaticCredentials();
                }, 3000);
              }
              break;
              
            case 'request_fresh_credentials':
              addLog('🔄 Railway solicitou credenciais frescas', 'info');
              setTimeout(() => {
                obtainPragmaticCredentials();
              }, 1000);
              break;
              
            case 'pragmatic_error':
              // Filtrar erros de parsing XML (são esperados)
              if (!data.message.includes('Unexpected token')) {
                addLog(`❌ Erro Pragmatic: ${data.message}`, 'error');
              }
              break;
              
            case 'game_started':
              addLog(`🎮 Novo jogo iniciado: ${data.gameId}`, 'game');
              break;
              
            case 'game_timer':
              if (data.timeLeft <= 10) {
                addLog(`⏰ Tempo restante: ${data.timeLeft}s`, 'bets-closed');
              }
              break;
              
            case 'game_history':
              addLog(`📊 Histórico recebido: ${data.results.length} resultados`, 'success');
              // Adicionar resultados do histórico ao início
              data.results.forEach((result: any) => {
                setGameResults(prev => {
                  const exists = prev.some(r => r.number === result.number && r.gameId === result.gameId);
                  if (!exists) {
                    return [result, ...prev.slice(0, 49)];
                  }
                  return prev;
                });
              });
              break;
              
            case 'pragmatic_xml':
              // Processar mensagens XML específicas sem mostrar todas
              if (data.message.includes('<timer')) {
                const timerMatch = data.message.match(/>(\d+)</);
                if (timerMatch) {
                  const timeLeft = parseInt(timerMatch[1]);
                  if (timeLeft <= 5 && timeLeft > 0) {
                    addLog(`⏰ Apostas encerrando em ${timeLeft}s`, 'bets-closed');
                  }
                }
              } else if (data.message.includes('<game id=')) {
                const gameIdMatch = data.message.match(/id="([^"]+)"/);
                if (gameIdMatch) {
                  addLog(`🎮 Jogo ${gameIdMatch[1]} iniciado`, 'game');
                }
              }
              // Não logar todas as mensagens XML para evitar spam
              break;
              
            case 'pragmatic_message':
              // Processar mensagens do Pragmatic Play
              const pragmaticData = data.data;
              if (pragmaticData) {
                addLog(`📨 Pragmatic: ${pragmaticData.command || pragmaticData.type || 'mensagem'}`, 'info');
              }
              break;
              
            case 'game_result':
              const { gameId, number, color } = data;
              
              const finalColor = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';
              addLog(`🎯 Resultado: ${number} (${finalColor})`, 'game');

              const gameResult: GameResult = {
                gameId,
                result: number.toString(),
                timestamp: data.timestamp || Date.now(),
                number,
                color
              };

              setGameResults(prev => [gameResult, ...prev.slice(0, 49)]);
              onGameResultRef.current?.(gameResult);

              // Atualizar padrões após resultado
              setTimeout(async () => {
                try {
                  const { data: patternsData } = await supabase.functions.invoke('machine_learning_blaze_megaroulette', {
                    body: { action: 'get_patterns', user_id: userId }
                  });
                  
                  if (patternsData?.success) {
                    onPatternUpdateRef.current?.(patternsData.data);
                  }
                } catch (error) {
                  console.error('Erro ao atualizar padrões:', error);
                }
              }, 1000);
              break;
              
            case 'pong':
              // addLog(`💓 Pong recebido`, 'info'); // Comentado para não poluir logs
              break;
              
            case 'error':
              addLog(`❌ Erro: ${data.message}`, 'error');
              break;
              
            default:
              addLog(`📦 ${data.type}: ${data.message || 'mensagem recebida'}`, 'info');
          }

        } catch (error: any) {
          addLog(`❌ Erro ao processar mensagem: ${error.message}`, 'error');
        }
      };

      ws.onerror = (error) => {
        addLog(`❌ Erro WebSocket: ${error}`, 'error');
        setConnectionStatus('error');
        isConnectingRef.current = false;
        setPragmaticConnected(false);
      };

      ws.onclose = (event) => {
        addLog(`🔌 Desconectado do servidor Railway - Código: ${event.code}`, 'info');
        setIsConnected(false);
        setConnectionStatus('disconnected');
        isConnectingRef.current = false;
        setPragmaticConnected(false);

        // Tentar reconectar se não foi fechamento intencional
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
          addLog(`🔄 Reconectando em ${delay/1000}s...`, 'info');
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          addLog('❌ Máximo de tentativas de reconexão atingido', 'error');
        }
      };

    } catch (error: any) {
      addLog(`❌ Erro ao conectar: ${error.message}`, 'error');
      setConnectionStatus('error');
      isConnectingRef.current = false;
    }
  }, [userId, addLog]); // Remover onPatternUpdate e onGameResult das dependências

  // Função para desconectar
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Desconexão intencional');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setPragmaticConnected(false);
    reconnectAttemptsRef.current = 0;
    isConnectingRef.current = false;
    
    addLog('🔌 Desconectado intencionalmente', 'info');
  }, [addLog]);

  // Função para enviar mensagem
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    addLog('❌ WebSocket não está conectado', 'error');
    return false;
  }, [addLog]);

  // NÃO conectar automaticamente - apenas quando solicitado
  useEffect(() => {
    // Cleanup ao desmontar componente
    return () => {
      disconnect();
    };
  }, [userId]); // Remover connectWebSocket e disconnect das dependências

  return {
    isConnected,
    connectionStatus,
    pragmaticConnected,
    logs,
    gameResults,
    connect: connectWebSocket,
    disconnect,
    sendMessage
  };
} 