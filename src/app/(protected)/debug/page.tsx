'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, RefreshCw, Zap, Key, Settings } from 'lucide-react';
import MatrixRain from '@/components/MatrixRain';
import DebugStrategyModal from '@/components/DebugStrategyModal';
import StopOperationModal from '@/components/StopOperationModal';
import Modal, { useModal } from '@/components/ui/modal';
import InlineAlert from '@/components/ui/inline-alert';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface HistoryItem {
  gameId: string;
  gameResult: string;
  timestamp: number;
  number: number;
  color: string;
}

export default function DebugPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [patterns, setPatterns] = useState<{
    parity: string;
    color: string;
    range: string;
    matchedPatterns: Array<{
      id: string;
      name?: string;
      pattern_type: 'parity' | 'color' | 'range';
      pattern_sequence: string;
      martingale_pattern: string;
      matched_length: number;
      current_sequence: string;
    }>;
  } | null>(null);

  // Estados para o card de operação
  const [isOperating, setIsOperating] = useState(false);
  const [operationLoading, setOperationLoading] = useState(false);
  const [operationStatus, setOperationStatus] = useState<string>('INATIVO');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [websocketLogs, setWebsocketLogs] = useState<Array<{ timestamp: number; message: string; type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' }>>([]);
  const [gameResults, setGameResults] = useState<Array<{ gameId: string; result: string; timestamp: number; number?: number; color?: string }>>([]);

  // Estados para seleção de padrão
  const [selectedPattern, setSelectedPattern] = useState<{
    id: string;
    name?: string;
    pattern_type: 'parity' | 'color' | 'range';
    pattern_sequence: string;
    martingale_pattern: string;
    matched_length: number;
    current_sequence: string;
    selectedAt: number;
  } | null>(null);
  const [waitingForPattern, setWaitingForPattern] = useState(false);
  
  // Estados para apostas automáticas
  const [autoBettingActive, setAutoBettingActive] = useState(false);
  const [autoBettingStatus, setAutoBettingStatus] = useState<any>(null);
  const [autoBettingLoading, setAutoBettingLoading] = useState(false);
  const [lastProcessedPatternId, setLastProcessedPatternId] = useState<string | null>(null);
  
  // Estados para modal de estratégia
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);
  
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
    created_at: string;
    updated_at: string;
  }>>([]);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error' | 'warning' | 'info', message: string } | null>(null);
  
  // Estados para relatório de operações
  const [operationReport, setOperationReport] = useState<{
    summary: {
      totalOperations: number;
      totalBets: number;
      totalWins: number;
      totalLosses: number;
      totalInvested: number;
      totalProfit: number;
      winRate: number;
      profitRate: number;
      startedAt: number;
      lastOperationAt: number;
    };
    recentOperations: Array<{
      operationId: number;
      pattern: string;
      bets: number;
      wins: number;
      losses: number;
      invested: number;
      profit: number;
      completedAt: number;
    }>;
  } | null>(null);


  const monitoringRef = useRef<boolean>(false);
  const operationRef = useRef<boolean>(false);
  const userIdRef = useRef<string>('');

  useEffect(() => {
    checkUser();
    checkBlazeConfiguration();
    // Buscar relatório inicial
    setTimeout(() => {
      fetchOperationReport();
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup ao desmontar componente
      monitoringRef.current = false;
      operationRef.current = false;
    };
  }, []);

  // Buscar relatório periodicamente quando operando
  useEffect(() => {
    if (!isOperating) return;

    const interval = setInterval(() => {
      fetchOperationReport();
    }, 5000); // A cada 5 segundos

    return () => clearInterval(interval);
  }, [isOperating]);

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
      // Considerar configurado apenas se tem token ativo e não vazio
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
      
      console.log('Configurando token:', { tokenValue: tokenValue || 'EMPTY', length: tokenValue.length });
      
      // Tentar usar a função RPC primeiro
      try {
        const { data, error } = await supabase.rpc('configure_casino_token', {
          p_casino_name: 'Blaze',
          p_casino_code: 'BLAZE',
          p_token: tokenValue || '',
          p_is_active: tokenValue ? true : false
        });

        console.log('Resultado RPC:', { data, error });

        // Se a função RPC não existir ou der erro relacionado à constraint, usar abordagem direta
        if (error && (
          error.message?.includes('function') && error.message?.includes('does not exist') ||
          error.message?.includes('unique_active_token') ||
          error.message?.includes('duplicate key')
        )) {
          console.log('RPC falhou, usando abordagem direta...');
          await handleDirectTokenConfig(tokenValue);
          return;
        }

        if (error) {
          console.error('Error configuring token via RPC:', error);
          setAlertMessage({
            type: 'error',
            message: `Erro no banco de dados: ${error.message || 'Erro desconhecido'}`
          });
          return;
        }

        if (data?.success) {
          setBlazeToken('');
          blazeConfigModal.closeModal();
          setAlertMessage(null);
          await checkBlazeConfiguration();
          console.log('Token configurado com sucesso via RPC');
        } else {
          console.error('RPC returned error:', data);
          if (data?.error_type === 'duplicate_token') {
            setAlertMessage({
              type: 'error',
              message: 'Este token já está sendo usado por outro usuário. Verifique se você está usando o token correto da sua conta.'
            });
          } else {
            setAlertMessage({
              type: 'error',
              message: data?.error || 'Erro ao configurar token'
            });
          }
        }
      } catch (rpcError) {
        console.log('Erro na RPC, usando método direto:', rpcError);
        await handleDirectTokenConfig(tokenValue);
      }
      
    } catch (error) {
      console.error('Error configuring token:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro interno desconhecido';
      setAlertMessage({
        type: 'error',
        message: `Erro interno: ${errorMessage}`
      });
    } finally {
      setConfigLoading(false);
    }
  };

  const handleDirectTokenConfig = async (tokenValue: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAlertMessage({
          type: 'error',
          message: 'Usuário não autenticado'
        });
        return;
      }

      // Para tokens vazios, simplesmente salvar como vazio (agora permitido pela constraint)
      if (!tokenValue) {
        console.log('Token vazio - salvando como inativo');
        
        // Verificar se já existe um token para este usuário
        const { data: existingToken } = await supabase
          .from('user_tokens')
          .select('*')
          .eq('user_id', user.id)
          .eq('casino_code', 'BLAZE')
          .single();

        if (existingToken) {
          // Atualizar para inativo com token vazio
          const { error: updateError } = await supabase
            .from('user_tokens')
            .update({
              token: '',
              is_active: false,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('casino_code', 'BLAZE');

          if (updateError) {
            console.error('Error updating empty token:', updateError);
            setAlertMessage({
              type: 'error',
              message: `Erro ao desativar token: ${updateError.message}`
            });
            return;
          }
        } else {
          // Criar novo registro inativo com token vazio
          const { error: insertError } = await supabase
            .from('user_tokens')
            .insert({
              user_id: user.id,
              casino_code: 'BLAZE',
              token: '',
              is_active: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (insertError) {
            console.error('Error inserting empty token:', insertError);
            setAlertMessage({
              type: 'error',
              message: `Erro ao criar registro inativo: ${insertError.message}`
            });
            return;
          }
        }
      } else {
        // Para tokens não vazios, verificar se o token já existe para outro usuário
        console.log('Token não vazio - verificando unicidade...');
        
        const { data: duplicateCheck } = await supabase
          .from('user_tokens')
          .select('user_id')
          .eq('casino_code', 'BLAZE')
          .eq('token', tokenValue)
          .neq('user_id', user.id);

        if (duplicateCheck && duplicateCheck.length > 0) {
          setAlertMessage({
            type: 'error',
            message: 'Este token já está sendo usado por outro usuário. Verifique se você está usando o token correto da sua conta.'
          });
          return;
        }

        // Verificar se já existe um token para este usuário
        const { data: existingToken } = await supabase
          .from('user_tokens')
          .select('*')
          .eq('user_id', user.id)
          .eq('casino_code', 'BLAZE')
          .single();

        if (existingToken) {
          // Atualizar token existente
          const { error: updateError } = await supabase
            .from('user_tokens')
            .update({
              token: tokenValue,
              is_active: true,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('casino_code', 'BLAZE');

          if (updateError) {
            console.error('Error updating token:', updateError);
            setAlertMessage({
              type: 'error',
              message: `Erro ao atualizar token: ${updateError.message}`
            });
            return;
          }
        } else {
          // Criar novo token
          const { error: insertError } = await supabase
            .from('user_tokens')
            .insert({
              user_id: user.id,
              casino_code: 'BLAZE',
              token: tokenValue,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (insertError) {
            console.error('Error inserting token:', insertError);
            setAlertMessage({
              type: 'error',
              message: `Erro ao salvar token: ${insertError.message}`
            });
            return;
          }
        }
      }

      // Sucesso
      setBlazeToken('');
      blazeConfigModal.closeModal();
      setAlertMessage(null);
      await checkBlazeConfiguration();
      console.log('Token configurado com sucesso (método direto)');
      
    } catch (error) {
      console.error('Error in direct token config:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro interno desconhecido';
      setAlertMessage({
        type: 'error',
        message: `Erro interno: ${errorMessage}`
      });
    }
  };

  const fetchPatterns = async () => {
    if (!userIdRef.current) return;
    
    try {
      const { data: patternsData, error: patternsError } = await supabase.functions.invoke('blaze-mg-pragmatic', {
        body: { 
          action: 'get_patterns', 
          user_id: userIdRef.current
        }
      });

      if (patternsError || !patternsData?.success) {
        console.error('Erro ao buscar padrões:', patternsError?.message || patternsData?.error);
        return;
      }

      // Garantir que sempre temos dados válidos
      const patternData = patternsData?.data || {};
      setPatterns({
        parity: (typeof patternData.parity === 'string') ? patternData.parity : '',
        color: (typeof patternData.color === 'string') ? patternData.color : '',
        range: (typeof patternData.range === 'string') ? patternData.range : '',
        matchedPatterns: Array.isArray(patternData.matchedPatterns) ? patternData.matchedPatterns : []
      });

    } catch (error) {
      console.error('Erro inesperado ao buscar padrões:', error);
      // Definir padrões vazios em caso de erro
      setPatterns({
        parity: '',
        color: '',
        range: '',
        matchedPatterns: []
      });
    }
  };

  // Função para iniciar espera por padrão E ativar apostas automáticas
  const handleSelectPattern = async () => {
    if (selectedPattern) {
      // Se já tem padrão, parar apostas e limpar seleção
      try {
        // Primeiro parar apostas automáticas se estiverem ativas
        if (autoBettingActive) {
          const stopResponse = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: userIdRef.current,
              action: 'stop-auto-betting'
            })
          });

          if (stopResponse.ok) {
            setAutoBettingActive(false);
            setAutoBettingStatus(null);
          }
        }

        // Depois limpar padrão selecionado
        const response = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userIdRef.current,
            action: 'clear-selected-pattern'
          })
        });

        const result = await response.json();
        if (result.success) {
          setSelectedPattern(null);
          setWaitingForPattern(result.data.waitingForNewSelection || false);
        }
      } catch (error) {
        console.error('Erro ao limpar padrão:', error);
      }
    } else {
      // Abrir modal de seleção de estratégia
      setStrategyModalOpen(true);
    }
  };

  // Função para confirmar estratégia e iniciar monitoramento
  const handleStrategyConfirm = async (strategyName: string) => {
    setStrategyLoading(true);
    try {
      console.log('🎯 [DEBUG] Estratégia selecionada:', strategyName);
      
      // Primeiro configurar a estratégia de apostas automáticas
      const configResponse = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'configure-auto-betting',
          martingaleName: strategyName
        })
      });

      const configResult = await configResponse.json();
      if (!configResult.success) {
        throw new Error(configResult.error || 'Erro ao configurar estratégia');
      }

      // Depois iniciar monitoramento de padrões
      const monitorResponse = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'monitor-patterns'
        })
      });

      const monitorResult = await monitorResponse.json();
      if (monitorResult.success) {
        setWaitingForPattern(true);
        setStrategyModalOpen(false);
        console.log('⏳ Monitoramento de padrões iniciado com estratégia:', strategyName);
      } else {
        throw new Error(monitorResult.error || 'Erro ao iniciar monitoramento');
      }
    } catch (error) {
      console.error('❌ Erro ao configurar estratégia:', error);
      setOperationError(error instanceof Error ? error.message : 'Erro desconhecido');
    } finally {
      setStrategyLoading(false);
    }
  };

  const startMonitoring = async () => {
    if (!userIdRef.current) {
      setError('Usuário não autenticado');
      return;
    }

    monitoringRef.current = true;
    
    while (monitoringRef.current) {
      try {
        console.log('🔄 Verificando mudanças...');
        
        const { data: monitorData, error: monitorError } = await supabase.functions.invoke('blaze-mg-pragmatic', {
          body: { 
            action: 'monitor_changes', 
            user_id: userIdRef.current
          }
        });

        if (monitorError) {
          console.error('Erro no monitoramento:', monitorError);
          setError(`Erro no monitoramento: ${monitorError.message}`);
          break;
        }

        if (!monitorData?.success) {
          console.error('Falha no monitoramento:', monitorData?.error);
          setError(`Falha no monitoramento: ${monitorData?.error}`);
          break;
        }

        const { fullHistory } = monitorData.data;

        // Sempre atualizar o histórico completo (os 15 mais recentes)
        if (fullHistory && fullHistory.length > 0) {
          setHistory(fullHistory);
          setLastUpdate(Date.now());
          setError(null);
        }
        
        // SEMPRE buscar padrões atualizados (mesmo sem histórico novo)
        // Isso garante que os padrões sejam atualizados a cada ciclo
        console.log('🔄 Atualizando padrões...');
        await fetchPatterns();

      } catch (error) {
        console.error('Erro inesperado no monitoramento:', error);
        setError('Erro inesperado no monitoramento');
        break;
      }

      // Aguardar 1 segundo antes da próxima verificação
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  const handleStart = async () => {
    if (isRunning) {
      // Parar monitoramento
      setIsRunning(false);
      monitoringRef.current = false;
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Usuário não autenticado');
        return;
      }

      userIdRef.current = user.id;

      // Primeiro iniciar sessão na Edge Function
      const { data: sessionData, error: sessionError } = await supabase.functions.invoke('blaze-mg-pragmatic', {
        body: { action: 'start_session', user_id: user.id }
      });

      if (sessionError || !sessionData?.success) {
        setError(`Erro ao iniciar sessão: ${sessionError?.message || sessionData?.error}`);
        return;
      }

      // Autenticar
      const { data: authData, error: authError } = await supabase.functions.invoke('blaze-mg-pragmatic', {
        body: { action: 'authenticate', user_id: user.id }
      });

      if (authError || !authData?.success) {
        setError(`Erro na autenticação: ${authError?.message || authData?.error}`);
        return;
      }

      // Buscar histórico inicial
      const { data: historyData, error: historyError } = await supabase.functions.invoke('blaze-mg-pragmatic', {
        body: { action: 'get_history', user_id: user.id }
      });

      if (historyError || !historyData?.success) {
        setError(`Erro ao buscar histórico: ${historyError?.message || historyData?.error}`);
        return;
      }

      const initialHistory = historyData.data.history || [];
      setHistory(initialHistory);
      setLastUpdate(Date.now());

      // Buscar padrões iniciais
      await fetchPatterns();

      setIsRunning(true);

      // Iniciar monitoramento em background
      startMonitoring();

    } catch (error) {
      console.error('Erro:', error);
      setError('Erro inesperado no sistema');
    } finally {
      setLoading(false);
    }
  };

  // Função para buscar logs do WebSocket
  const fetchWebSocketLogs = async () => {
    if (!userIdRef.current) return;
    
    try {
      const response = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'get-websocket-logs'
        })
      });

      const result = await response.json();

      if (result.success) {
        setWebsocketLogs(result.data.logs || []);
        setGameResults(result.data.results || []);
        
        // Atualizar status baseado na conexão
        const connectionStatus = result.data.connectionStatus;
        if (connectionStatus) {
          if (connectionStatus.connected) {
            // Conexão ativa - limpar qualquer erro anterior
            if (operationError && operationError.includes('Conexão falhou')) {
              setOperationError(null);
              setOperationStatus('OPERANDO');
            }
          } else if (connectionStatus.error) {
            // Conexão inativa com erro
            setOperationError(`Conexão falhou: ${connectionStatus.error}`);
            setOperationStatus('ERRO');
          }
        }
      } else {
        // Se API retornou shouldStopPolling, parar operação
        if (result.shouldStopPolling) {
          console.log('🛑 Parando polling devido a erro de conexão');
          setIsOperating(false);
          operationRef.current = false;
          setOperationStatus('ERRO');
          setOperationError(result.error || 'Conexão falhou');
        }
      }

    } catch (error) {
      console.error('Erro ao buscar logs:', error);
      // Em caso de erro na requisição, também parar
      setOperationError('Erro na requisição de logs');
      setOperationStatus('ERRO');
    }
  };

  // Função para buscar padrão selecionado da API
  const fetchSelectedPattern = async () => {
    if (!userIdRef.current) return;

    try {
      const response = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'get-selected-pattern'
        })
      });

      const result = await response.json();

      if (result.success) {
        const { selectedPattern: newPattern, monitoringStatus } = result.data;
        
        if (newPattern) {
          // Verificar se é um novo padrão (não estava selecionado antes)
          const isNewPattern = !selectedPattern || selectedPattern.id !== newPattern.id;
          
          setSelectedPattern(newPattern);
          setWaitingForPattern(false);
          
          console.log('🔍 Padrão detectado:', {
            isNewPattern,
            autoBettingActive,
            hasMartingale: !!newPattern.martingale_pattern,
            patternId: newPattern.id,
            selectedAt: newPattern.selectedAt
          });
          
          // 🎯 VERIFICAR SE APOSTAS JÁ ESTÃO ATIVAS (backend pode ter iniciado automaticamente)
          if (isNewPattern && newPattern.martingale_pattern && newPattern.id !== lastProcessedPatternId) {
            console.log('🤖 Padrão selecionado! Verificando status das apostas...', newPattern);
            setLastProcessedPatternId(newPattern.id);
            
            // Primeiro verificar se apostas já estão ativas
            try {
              const statusResponse = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  userId: userIdRef.current,
                  action: 'get-auto-betting-status'
                })
              });

              const statusResult = await statusResponse.json();
              
              if (statusResult.success && statusResult.data.active) {
                // Apostas já estão ativas (backend iniciou automaticamente)
                console.log('✅ Apostas automáticas já estão ativas (iniciadas pelo backend)');
                setAutoBettingActive(true);
                setAutoBettingStatus(statusResult.data);
              } else if (!autoBettingActive && newPattern.martingale_pattern.length > 0) {
                // Apostas não estão ativas, tentar iniciar
                console.log('🚀 Iniciando apostas automáticas...');
                
                const startBettingResponse = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    userId: userIdRef.current,
                    action: 'start-auto-betting'
                  })
                });

                const bettingResult = await startBettingResponse.json();
                if (bettingResult.success) {
                  setAutoBettingActive(true);
                  console.log('✅ Apostas automáticas iniciadas pelo frontend!', bettingResult.data);
                } else {
                  // Se erro for "já estão ativas", apenas atualizar status
                  if (bettingResult.error?.includes('já estão ativas')) {
                    console.log('ℹ️ Apostas já estavam ativas - atualizando status');
                    setAutoBettingActive(true);
                  } else {
                    console.error('❌ Erro ao iniciar apostas automáticas:', bettingResult.error);
                  }
                }
              } else {
                console.log('⚠️ Padrão não possui martingale válido ou apostas já ativas');
              }
            } catch (error) {
              console.error('❌ Erro ao verificar/iniciar apostas automáticas:', error);
            }
          }
        } else {
          // Padrão foi limpo
          if (selectedPattern) {
            console.log('🧹 Padrão limpo - aguardando novo padrão...');
          }
          setSelectedPattern(null);
          setLastProcessedPatternId(null); // Limpar ID do último padrão processado
        }

        setWaitingForPattern(monitoringStatus.waitingForSelection || false);
      }

    } catch (error) {
      console.error('Erro ao buscar padrão selecionado:', error);
    }
  };

  // Função para iniciar apostas automáticas
  const handleStartAutoBetting = async () => {
    if (!userIdRef.current) return;

    setAutoBettingLoading(true);
    try {
      const response = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'start-auto-betting'
        })
      });

      const result = await response.json();

      if (result.success) {
        setAutoBettingActive(true);
        console.log('✅ Apostas automáticas iniciadas:', result.data);
      } else {
        console.error('❌ Erro ao iniciar apostas automáticas:', result.error);
      }
    } catch (error) {
      console.error('Erro ao iniciar apostas automáticas:', error);
    } finally {
      setAutoBettingLoading(false);
    }
  };

  // Função para parar apostas automáticas
  const handleStopAutoBetting = async () => {
    if (!userIdRef.current) return;

    setAutoBettingLoading(true);
    try {
      const response = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'stop-auto-betting'
        })
      });

      const result = await response.json();

      if (result.success) {
        setAutoBettingActive(false);
        console.log('✅ Apostas automáticas paradas:', result.data);
      } else {
        console.error('❌ Erro ao parar apostas automáticas:', result.error);
      }
    } catch (error) {
      console.error('Erro ao parar apostas automáticas:', error);
    } finally {
      setAutoBettingLoading(false);
    }
  };

  // Função para buscar status das apostas automáticas
  const fetchAutoBettingStatus = async () => {
    if (!userIdRef.current) return;

    try {
      const response = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'get-auto-betting-status'
        })
      });

      const result = await response.json();

      if (result.success) {
        setAutoBettingStatus(result.data);
        setAutoBettingActive(result.data.active || false);
      }
    } catch (error) {
      console.error('Erro ao buscar status das apostas automáticas:', error);
    }
  };

  // Função para buscar relatório de operações
  const fetchOperationReport = async () => {
    if (!userIdRef.current) return;

    try {
      const response = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'get-operation-report'
        })
      });

      const result = await response.json();

      if (result.success && result.data && result.data.summary) {
        setOperationReport(result.data);
      } else {
        // Se não há dados válidos, inicializar com estrutura vazia
        setOperationReport({
          summary: {
            totalOperations: 0,
            totalBets: 0,
            totalWins: 0,
            totalLosses: 0,
            totalInvested: 0,
            totalProfit: 0,
            winRate: 0,
            profitRate: 0,
            startedAt: Date.now(),
            lastOperationAt: 0
          },
          recentOperations: []
        });
      }
    } catch (error) {
      console.error('Erro ao buscar relatório de operações:', error);
    }
  };

  // Função para resetar relatório de operações
  const resetOperationReport = async () => {
    if (!userIdRef.current) return;

    try {
      const response = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'reset-operation-report'
        })
      });

      const result = await response.json();

      if (result.success) {
        // Garantir que temos a estrutura correta após reset
        const newReport = result.data.newReport || {
          summary: {
            totalOperations: 0,
            totalBets: 0,
            totalWins: 0,
            totalLosses: 0,
            totalInvested: 0,
            totalProfit: 0,
            winRate: 0,
            profitRate: 0,
            startedAt: Date.now(),
            lastOperationAt: 0
          },
          recentOperations: []
        };
        
        setOperationReport({
          summary: newReport.summary || newReport,
          recentOperations: newReport.recentOperations || []
        });
        
        console.log('✅ Relatório resetado com sucesso');
      }
    } catch (error) {
      console.error('Erro ao resetar relatório de operações:', error);
    }
  };

  // Monitoramento dos logs em tempo real
  useEffect(() => {
    let logsInterval: NodeJS.Timeout | null = null;

    if (isOperating && operationRef.current) {
      // Buscar logs a cada 2 segundos
      logsInterval = setInterval(() => {
        fetchWebSocketLogs();
      }, 2000);
    }

    return () => {
      if (logsInterval) {
        clearInterval(logsInterval);
      }
    };
  }, [isOperating]);

  // Monitoramento de padrões selecionados (sempre quando operando - para detectar loop automático)
  useEffect(() => {
    let patternsInterval: NodeJS.Timeout | null = null;

    if (isOperating && operationRef.current) {
      // Buscar padrões selecionados a cada 3 segundos (sempre quando operando)
      patternsInterval = setInterval(() => {
        fetchSelectedPattern();
      }, 3000);
    }

    return () => {
      if (patternsInterval) {
        clearInterval(patternsInterval);
      }
    };
  }, [isOperating]); // Removido waitingForPattern e selectedPattern das dependências

  // Monitoramento do status das apostas automáticas
  useEffect(() => {
    let autoBettingInterval: NodeJS.Timeout | null = null;

    if (isOperating && operationRef.current) {
      // Buscar status das apostas automáticas a cada 2 segundos
      autoBettingInterval = setInterval(() => {
        fetchAutoBettingStatus();
      }, 2000);
    }

    return () => {
      if (autoBettingInterval) {
        clearInterval(autoBettingInterval);
      }
    };
  }, [isOperating]);

  // Função para conectar ao WebSocket de apostas E iniciar monitoramento
  const handleOperate = async () => {
    if (isOperating) {
      // Abrir modal de confirmação para parar
      setStopModalOpen(true);
      return;
    }

    setOperationLoading(true);
    setOperationError(null);
    
    // RESETAR RELATÓRIO quando iniciar nova operação
    await resetOperationReport();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setOperationError('Usuário não autenticado');
        return;
      }

      userIdRef.current = user.id;
      console.log('🎮 Conectando ao WebSocket para operação...');
      setOperationStatus('CONECTANDO...');

      // 1️⃣ PRIMEIRO: Iniciar sessão e autenticação do histórico
      const { data: sessionData, error: sessionError } = await supabase.functions.invoke('blaze-mg-pragmatic', {
        body: { action: 'start_session', user_id: user.id }
      });

      if (sessionError || !sessionData?.success) {
        setOperationError(`Erro ao iniciar sessão: ${sessionError?.message || sessionData?.error}`);
        setOperationStatus('ERRO');
        return;
      }

      // Autenticar
      const { data: authData, error: authError } = await supabase.functions.invoke('blaze-mg-pragmatic', {
        body: { action: 'authenticate', user_id: user.id }
      });

      if (authError || !authData?.success) {
        setOperationError(`Erro na autenticação: ${authError?.message || authData?.error}`);
        setOperationStatus('ERRO');
        return;
      }

      // Buscar histórico inicial
      const { data: historyData, error: historyError } = await supabase.functions.invoke('blaze-mg-pragmatic', {
        body: { action: 'get_history', user_id: user.id }
      });

      if (historyError || !historyData?.success) {
        setOperationError(`Erro ao buscar histórico: ${historyError?.message || historyData?.error}`);
        setOperationStatus('ERRO');
        return;
      }

      const initialHistory = historyData.data.history || [];
      setHistory(initialHistory);
      setLastUpdate(Date.now());

      // Buscar padrões iniciais
      await fetchPatterns();

      // 2️⃣ SEGUNDO: Conectar ao WebSocket da Pragmatic
      const response = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          action: 'bet-connect',
          gameConfig: {
            tableId: 'mrbras531mrbr532'
          }
        })
      });

      const result = await response.json();

      if (!result.success) {
        setOperationError(`Erro na conexão WebSocket: ${result.error}`);
        setOperationStatus('ERRO');
        return;
      }

      // 3️⃣ TERCEIRO: Ativar ambos os sistemas
      console.log('✅ Conectado ao WebSocket com sucesso');
      console.log('✅ Monitoramento de histórico ativado');
      
      setIsOperating(true);
      operationRef.current = true;
      setOperationStatus('OPERANDO');
      setOperationError(null);

      // Ativar monitoramento de histórico
      setIsRunning(true);
      startMonitoring();

      // Buscar logs iniciais do WebSocket
      setTimeout(() => {
        fetchWebSocketLogs();
      }, 1000);

    } catch (error) {
      console.error('❌ Erro ao conectar:', error);
      setOperationError('Erro inesperado na conexão');
      setOperationStatus('ERRO');
    } finally {
      setOperationLoading(false);
    }
  };

  // Função para confirmar parada da operação
  const handleStopConfirm = async () => {
    if (!userIdRef.current) return;

    setStopLoading(true);
    try {
      console.log('🛑 Parando operação...');

      // Chamar API para parar operação completamente
      const response = await fetch('/api/bots/blaze/pragmatic/megaroulettebrazilian', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userIdRef.current,
          action: 'stop-operation'
        })
      });

      const result = await response.json();

      if (result.success) {
        // Atualizar estados do frontend
        setIsOperating(false);
        operationRef.current = false;
        setOperationStatus('PARADO');
        setOperationError(null);
        
        // Parar monitoramento do frontend
        setIsRunning(false);
        monitoringRef.current = false;
        setError(null);
        
        // Limpar estados relacionados
        setSelectedPattern(null);
        setWaitingForPattern(false);
        setAutoBettingActive(false);
        setAutoBettingStatus(null);
        setLastProcessedPatternId(null);
        setWebsocketLogs([]);
        setGameResults([]);
        
        console.log('✅ Operação parada com sucesso');
        
        // Mostrar alerta de sucesso
        setOperationError('Operação encerrada com sucesso');
        setTimeout(() => {
          setOperationError(null);
        }, 3000);
        
      } else {
        console.error('❌ Erro ao parar operação:', result.error);
        setOperationError(`Erro ao parar operação: ${result.error}`);
      }

    } catch (error) {
      console.error('❌ Erro ao parar operação:', error);
      setOperationError('Erro inesperado ao parar operação');
    } finally {
      setStopLoading(false);
      setStopModalOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-400 relative overflow-hidden">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10 p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Blaze Token Card */}
          <Card className="border-cyan-500/30 backdrop-blur-sm">
            <CardContent className="p-4">
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
                        🤖 BOT_MEGA_ROULETTE
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
            </CardContent>
          </Card>

          {/* Card Operação */}
          <Card className="border-blue-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-400 font-mono">
                ⚡ OPERAÇÃO_WEBSOCKET
              </CardTitle>
              <CardDescription className="text-gray-400 font-mono text-xs">
                {`// Conexão WebSocket para apostas no MegaRoulette`}
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
                  
                  {isOperating && (websocketLogs.length > 0 || gameResults.length > 0) && (
                    <div className="text-xs font-mono text-gray-500">
                      LOGS: {websocketLogs.length} | JOGOS: {gameResults.length}
                    </div>
                  )}
                </div>

                {/* Resultados dos Jogos */}
                {gameResults.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-blue-400 font-semibold">🎯 ÚLTIMOS_RESULTADOS:</div>
                    <div className="grid grid-cols-10 gap-1 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg max-h-16 overflow-hidden">
                      {gameResults.slice(0, 20).map((result, index) => {
                        const baseClasses = "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono shadow-sm transition-all duration-300 hover:scale-110 cursor-pointer";
                        const colorClasses = result.color === 'red' 
                          ? 'bg-red-500 text-white shadow-red-500/50' 
                          : result.color === 'black' 
                            ? 'bg-gray-800 text-white border border-gray-600 shadow-gray-800/50' 
                            : 'bg-green-500 text-white shadow-green-500/50';
                        const highlightClass = index === 0 ? 'ring-1 ring-yellow-400' : '';
                        
                        return (
                          <div
                            key={`game-result-${index}-${result.gameId || 'unknown'}-${result.timestamp}`}
                            className={`${baseClasses} ${colorClasses} ${highlightClass}`}
                            title={`Número: ${result.number} | Game: ${result.gameId} | ${new Date(result.timestamp).toLocaleTimeString('pt-BR')}`}
                          >
                            {result.number}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Padrão Selecionado */}
                {selectedPattern && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-cyan-400 font-semibold">🎯 PADRÃO_SELECIONADO:</div>
                    <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-cyan-300 font-semibold text-xs">{selectedPattern.pattern_type.toUpperCase()}</span>
                        <span className="text-gray-400 text-xs">{selectedPattern.name || selectedPattern.id}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-gray-400 text-xs">Sequence:</span>
                          <div className="text-white tracking-wider font-semibold text-xs">
                            {selectedPattern.pattern_sequence} <span className="text-gray-500">({selectedPattern.matched_length})</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-400 text-xs">Martingale:</span>
                          <div className="text-green-400 tracking-wider font-semibold text-xs">
                            {selectedPattern.martingale_pattern}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-cyan-500/10">
                        <span className="text-gray-500 text-xs">
                          Selecionado em: {new Date(selectedPattern.selectedAt).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Logs do WebSocket */}
                {websocketLogs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-blue-400 font-semibold">📋 LOGS_WEBSOCKET:</div>
                    <div className="max-h-96 overflow-y-auto p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-1">
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

                {/* Botões de Controle */}
                <div className="space-y-2">
                  {/* Botão Principal */}
                  <Button 
                    onClick={handleOperate}
                    disabled={operationLoading}
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
                        ? 'PARAR_OPERAÇÃO' 
                        : 'OPERAR'
                    }
                  </Button>

                  {/* Botão Seleção de Padrão */}
                  <Button 
                    onClick={handleSelectPattern}
                    disabled={!isOperating}
                    className={`w-full font-mono ${
                      waitingForPattern 
                        ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/30' 
                        : selectedPattern
                          ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30'
                          : 'bg-purple-500/20 border border-purple-500/50 text-purple-400 hover:bg-purple-500/30'
                    }`}
                    variant="outline"
                  >
                    {waitingForPattern ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : selectedPattern ? (
                      '🗑️'
                    ) : (
                      '🎯'
                    )}
                    {waitingForPattern 
                      ? 'AGUARDANDO_PRÓXIMO_RESULTADO...' 
                      : selectedPattern 
                        ? 'LIMPAR_PADRÃO'
                        : 'SELECIONAR_PADRÃO'
                    }
                  </Button>

                  {/* Informação sobre apostas automáticas */}
                  {selectedPattern && !autoBettingActive && (
                    <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                      <div className="text-xs font-mono text-blue-400 text-center">
                        🤖 Apostas automáticas serão iniciadas automaticamente quando um padrão for selecionado
                      </div>
                    </div>
                  )}

                  {/* Botão de Parar Apostas Automáticas (Iniciar é automático) */}
                  {selectedPattern && autoBettingActive && (
                    <div className="flex justify-center">
                      <Button 
                        onClick={handleStopAutoBetting}
                        disabled={!autoBettingActive || autoBettingLoading}
                        className="font-mono bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30"
                        variant="outline"
                      >
                        {autoBettingLoading ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          '🛑'
                        )}
                        {autoBettingLoading ? 'PARANDO...' : 'PARAR_APOSTAS'}
                      </Button>
                    </div>
                  )}

                  {/* Status das Apostas Automáticas */}
                  {autoBettingStatus && autoBettingStatus.active && (
                    <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                      <div className="text-xs font-mono text-green-400 font-semibold mb-2">🤖 APOSTAS_AUTOMÁTICAS_ATIVAS:</div>
                      <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                        <div>
                          <span className="text-gray-400">Progresso:</span>
                          <div className="text-white">
                            {autoBettingStatus.currentBetIndex}/{autoBettingStatus.totalBets} ({autoBettingStatus.progress.toFixed(1)}%)
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-400">Win Rate:</span>
                          <div className="text-white">
                            {autoBettingStatus.statistics.winRate.toFixed(1)}% ({autoBettingStatus.statistics.wins}W/{autoBettingStatus.statistics.losses}L)
                          </div>
                        </div>
                      </div>
                      {autoBettingStatus.nextBet && (
                        <div className="mt-2 pt-2 border-t border-green-500/10">
                          <span className="text-gray-400 text-xs">Próxima aposta:</span>
                          <div className="text-green-400 font-semibold">
                            {autoBettingStatus.nextBet.letter} (bc={autoBettingStatus.nextBet.betCode}) - R$ {autoBettingStatus.nextBet.amount}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </CardContent>
          </Card>

          {/* Card Relatório de Operações */}
          {operationReport && operationReport.summary && (
            <Card className="border-cyan-500/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-cyan-400 font-mono">
                  📊 RELATÓRIO_OPERAÇÕES
                </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
                  {`// Estatísticas acumulativas de todas as operações (reseta ao clicar OPERAR)`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  
                                     {/* Resumo Principal */}
                   <div className="grid grid-cols-3 gap-4">
                     <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-center">
                       <div className="text-2xl font-bold text-cyan-400 font-mono">
                         {operationReport.summary.totalOperations || 0}
                       </div>
                       <div className="text-xs text-gray-400 font-mono">OPERAÇÕES</div>
                     </div>
                     
                     <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-center">
                       <div className="text-2xl font-bold text-blue-400 font-mono">
                         {operationReport.summary.totalBets || 0}
                       </div>
                       <div className="text-xs text-gray-400 font-mono">APOSTAS</div>
                     </div>
                     
                     <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                       <div className="text-2xl font-bold text-green-400 font-mono">
                         R$ {(operationReport.summary.totalProfit || 0).toFixed(2)}
                       </div>
                       <div className="text-xs text-gray-400 font-mono">LUCRO</div>
                     </div>
                   </div>

                  {/* Detalhes */}
                  <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                    <div className="space-y-2">
                                             <div className="flex justify-between">
                         <span className="text-gray-400">Vitórias:</span>
                         <span className="text-green-400">{operationReport.summary.totalWins || 0}</span>
                       </div>
                       <div className="flex justify-between">
                         <span className="text-gray-400">Derrotas:</span>
                         <span className="text-red-400">{operationReport.summary.totalLosses || 0}</span>
                       </div>
                       <div className="flex justify-between">
                         <span className="text-gray-400">Investido:</span>
                         <span className="text-blue-400">R$ {(operationReport.summary.totalInvested || 0).toFixed(2)}</span>
                       </div>
                    </div>
                    
                    <div className="space-y-2">
                                             <div className="flex justify-between">
                         <span className="text-gray-400">ROI:</span>
                         <span className={`${(operationReport.summary.profitRate || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                           {(operationReport.summary.profitRate || 0).toFixed(1)}%
                         </span>
                       </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Iniciado:</span>
                        <span className="text-gray-300">
                          {new Date(operationReport.summary.startedAt).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Última Op:</span>
                        <span className="text-gray-300">
                          {operationReport.summary.lastOperationAt > 0 
                            ? new Date(operationReport.summary.lastOperationAt).toLocaleTimeString('pt-BR')
                            : 'N/A'
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Últimas Operações */}
                  {operationReport.recentOperations.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-mono text-cyan-400 font-semibold">🔄 ÚLTIMAS_OPERAÇÕES:</div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {operationReport.recentOperations.slice().reverse().map((op) => (
                          <div key={op.operationId} className="flex items-center justify-between p-2 bg-cyan-500/5 border border-cyan-500/10 rounded text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="text-cyan-400">#{op.operationId}</span>
                              <span className="text-gray-300">{op.pattern}</span>
                              <span className="text-gray-400">({op.bets} apostas)</span>
                            </div>
                                                         <div className="flex items-center gap-2">
                               <span className="text-green-400">{op.wins || 0}W</span>
                               <span className="text-red-400">{op.losses || 0}L</span>
                               <span className={`font-semibold ${(op.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                 R$ {(op.profit || 0).toFixed(2)}
                               </span>
                             </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </CardContent>
            </Card>
          )}

          {/* Card Histórico */}
          <Card className="border-purple-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
                🎲 HISTÓRICO_MEGA_ROULETTE
              </CardTitle>
              <CardDescription className="text-gray-400 font-mono text-xs">
                {`// Monitoramento em tempo real dos resultados`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                
                {/* Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full shadow-lg ${
                      isRunning 
                        ? 'bg-green-400 animate-pulse shadow-green-400/50' 
                        : 'bg-gray-400 shadow-gray-400/50'
                    }`}></div>
                    <span className={`font-medium font-mono ${
                      isRunning ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {isRunning ? 'MONITORANDO' : 'INATIVO'}
                    </span>
                  </div>
                  
                  {isRunning && lastUpdate > 0 && (
                    <div className="text-xs font-mono text-gray-500">
                      ÚLTIMO_UPDATE: {new Date(lastUpdate).toLocaleTimeString('pt-BR')}
                    </div>
                  )}
                </div>

                {/* Histórico Visual - Direto no Card Principal */}
                {history.length > 0 && (
                  <div className="grid grid-cols-15 gap-2 max-w-full overflow-x-auto p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                    {history.map((item, index) => {
                      const baseClasses = "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold font-mono shadow-lg transition-all duration-300 hover:scale-110";
                      const colorClasses = item.color === 'red' 
                        ? 'bg-red-500 text-white shadow-red-500/50' 
                        : item.color === 'black' 
                          ? 'bg-gray-800 text-white border border-gray-600 shadow-gray-800/50' 
                          : 'bg-green-500 text-white shadow-green-500/50';
                      const highlightClass = index === 0 ? 'ring-2 ring-yellow-400 animate-pulse' : '';
                      
                      return (
                        <div
                          key={`history-${index}-${item.gameId || 'unknown'}-${item.timestamp}`}
                          className={`${baseClasses} ${colorClasses} ${highlightClass}`}
                          title={`Número: ${item.number} | Game: ${item.gameId} | ${new Date(item.timestamp).toLocaleTimeString('pt-BR')}`}
                        >
                          {item.number}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Erro */}
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <span className="text-xs font-mono text-red-400">{error}</span>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>

          {/* Padrões - Abaixo do Histórico */}
          {patterns && (
            <Card className="border-yellow-500/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-400 font-mono">
                  🎯 PADRÕES_DETECTADOS
                </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
                  {`// Sequências baseadas nos últimos resultados (verde ignorado)`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  
                  {/* Parity */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-yellow-400 w-16 font-semibold">Parity:</span>
                    <div className="flex-1 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded font-mono text-sm tracking-wider">
                      {(patterns.parity || '').split('').map((char, index) => (
                        <span 
                          key={`parity-${index}-${char}`}
                          className={`${char === 'E' ? 'text-blue-400' : 'text-orange-400'} font-bold`}
                          title={char === 'E' ? 'Even (Par)' : 'Odd (Ímpar)'}
                        >
                          {char}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Color */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-yellow-400 w-16 font-semibold">Color:</span>
                    <div className="flex-1 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded font-mono text-sm tracking-wider">
                      {(patterns.color || '').split('').map((char, index) => (
                        <span 
                          key={`color-${index}-${char}`}
                          className={`${char === 'R' ? 'text-red-400' : 'text-gray-300'} font-bold`}
                          title={char === 'R' ? 'Red (Vermelho)' : 'Black (Preto)'}
                        >
                          {char}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Range */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-yellow-400 w-16 font-semibold">Range:</span>
                    <div className="flex-1 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded font-mono text-sm tracking-wider">
                      {(patterns.range || '').split('').map((char, index) => (
                        <span 
                          key={`range-${index}-${char}`}
                          className={`${char === 'L' ? 'text-green-400' : 'text-purple-400'} font-bold`}
                          title={char === 'L' ? 'Low (1-18)' : 'High (19-36)'}
                        >
                          {char}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Padrões Encontrados */}
                  {patterns.matchedPatterns && patterns.matchedPatterns.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-yellow-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-mono text-yellow-400 font-semibold">🎯 PADRÕES_ENCONTRADOS:</span>
                        <span className="text-xs font-mono text-gray-400">({patterns.matchedPatterns.length} matches)</span>
                      </div>
                      
                      <div className="space-y-2">
                        {patterns.matchedPatterns.map((pattern, index) => (
                          <div key={`pattern-${index}-${pattern.id}`} className="p-3 bg-yellow-500/5 border border-yellow-500/10 rounded text-xs font-mono">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-yellow-300 font-semibold">{pattern.pattern_type.toUpperCase()}</span>
                              <span className="text-gray-400">{pattern.name || pattern.id}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-gray-400 text-xs">Sequence:</span>
                                <div className="text-white tracking-wider font-semibold">
                                  {pattern.pattern_sequence} <span className="text-gray-500">({pattern.matched_length})</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-gray-400 text-xs">Martingale:</span>
                                <div className="text-green-400 tracking-wider font-semibold">
                                  {pattern.martingale_pattern}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
        title={isConfigured ? "EDITAR_TOKEN_BLAZE" : "CONFIG_BLAZE"}
        description={isConfigured ? "Atualize seu token de autenticação Blaze" : "Configure seu token de autenticação Blaze"}
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
              onClose={() => setAlertMessage(null)}
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
              placeholder="Cole seu token Blaze aqui (deixe vazio para ficar offline)..."
              className="w-full p-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
            <p className="text-xs text-gray-400 font-mono">
              {`// Token será criptografado e armazenado com segurança. Deixe vazio para desconectar.`}
            </p>
          </div>

          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400 font-mono">COMO_OBTER_TOKEN</span>
            </div>
            <div className="text-xs text-gray-300 font-mono space-y-1">
              <p>1. Faça login na sua conta Blaze</p>
              <p>2. Abra as Ferramentas do Desenvolvedor:</p>
              <p className="pl-4">• Windows: Pressione F12 ou Ctrl+Shift+I</p>
              <p className="pl-4">• Mac: Pressione Cmd+Option+I ou F12</p>
              <p className="pl-4">• Ou clique com botão direito → &quot;Inspecionar Elemento&quot;</p>
              <p>3. Vá para Application → Local Storage</p>
              <p>4. Selecione &quot;https://blaze.bet.br&quot;</p>
              <p>5. Encontre &quot;ACCESS_TOKEN&quot; e copie o valor</p>
              <p>6. Cole no campo acima</p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal de Seleção de Estratégia */}
      <DebugStrategyModal
        isOpen={strategyModalOpen}
        onClose={() => setStrategyModalOpen(false)}
        onConfirm={handleStrategyConfirm}
        loading={strategyLoading}
      />

      {/* Modal de Confirmação para Parar Operação */}
      <StopOperationModal
        isOpen={stopModalOpen}
        onClose={() => setStopModalOpen(false)}
        onConfirm={handleStopConfirm}
        loading={stopLoading}
      />
    </div>
  );
} 