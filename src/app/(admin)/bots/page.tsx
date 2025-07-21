'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  CheckCircle,
  Clock,
  Zap,
  Users,
  Bot,
  RefreshCw,
  Server,
  X,
  Power
} from 'lucide-react';
import AdminHeader from '@/components/AdminHeader';
import MaintenanceManager from '@/components/MaintenanceManager';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface BotStatus {
  id: string;
  name: string;
  endpoint: string;
  description?: string;
  connectionStatus: {
    connected: boolean;
    error?: string;
    lastUpdate: number;
  };
  operationStatus: {
    isOperating: boolean;
    operationActive: boolean;
    mode?: 'analysis' | 'real'; // Status real da API bmgbr
    startedAt?: number;
    stats?: {
      totalBets: number;
      wins: number;
      losses: number;
      profit: number;
      winRate?: number;
    };
  };
  userInfo?: {
    userId: string;
    email: string;
  };
  lastSevenResults?: Array<{ 
    number: number; 
    color: string;
    gameId: string; 
    timestamp: number 
  }>;
  websocketLogs?: Array<{ 
    timestamp: number; 
    message: string; 
    type: 'info' | 'error' | 'success' | 'game' | 'bets-open' | 'bets-closed' 
  }>;
  // 🔥 NOVOS CAMPOS DETALHADOS
  operationDetails?: {
    pattern?: string;
    currentLevel?: number;
    martingaleLevel?: number;
    waitingForResult?: boolean;
    profitStatus?: {
      current: number;
      isProfit: boolean;
      formatted: string;
      status: string;
    };
  };
  sessionInfo?: {
    createdAt?: number;
    lastRenewal?: number;
    renewalAttempts?: number;
    timeSinceLastRenewal?: number;
    nextRenewalIn?: string;
  };
  bettingWindow?: {
    isOpen?: boolean;
    currentGameId?: string;
    lastUpdate?: number;
  };
}

// 🔥 NOVOS TIPOS PARA DESCOBERTA DINÂMICA
interface ActiveUser {
  id: string;
  email: string;
  created_at: string;
  credits: number;
  last_login?: string;
}

interface BotInstance {
  userId: string;
  userEmail: string;
  botType: string;
  endpoint: string;
  sourcePage: string;
  isActive: boolean;
  lastActivity: number;
  icon: string;
}

export default function BotsMonitoringPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [bots, setBots] = useState<BotStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  // 🔥 NOVOS ESTADOS PARA DESCOBERTA DINÂMICA
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [botInstances, setBotInstances] = useState<BotInstance[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  // 🔥 NOVO: Estado para controle de loading dos botões de desconectar
  const [disconnectingBots, setDisconnectingBots] = useState<Set<string>>(new Set());

  // 🔥 NOVO: Estado para filtro de ordenação
  const [sortBy, setSortBy] = useState<'profit' | 'operations' | 'time'>('profit');

  // 🔥 NOVO: Estado para filtro de status
  const [statusFilter, setStatusFilter] = useState<'all' | 'connected' | 'operating' | 'analyzing' | 'disconnected'>('all');

  const [alertMessage, setAlertMessage] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
  } | null>(null);

  // 🎯 MAPEAMENTO PRECISO POR PÁGINA DE ORIGEM
  const botEndpoints = [
    {
      id: 'blaze-megaroulette-main',
      name: 'Blaze Mega Roulette BR',
      endpoint: '/api/bots/blaze/pragmatic/blaze-megarouletebr',
      sourcePage: '/blaze-megaroulettebr',
      description: 'Página principal - /blaze-megaroulettebr',
      category: 'production',
      icon: '🎯'
    },
    {
      id: 'bmg-simple',
      name: 'BMG Simple',
      endpoint: '/api/bots/blaze/pragmatic/blaze-megarouletebr',
      sourcePage: '/bmg',
      description: 'Página BMG simples - /bmg',
      category: 'production',
      icon: '⚡'
    },
    {
      id: 'bmg2-graphs',
      name: 'BMG2 Graphs',
      endpoint: '/api/bots2/blaze/pragmatic/blaze-megarouletebr',
      sourcePage: '/bmg2',
      description: 'Versão teste c/ gráficos - /bmg2',
      category: 'testing',
      icon: '📊'
    },
        {
      id: 'bmgbr-copy',
      name: 'BMGBR',
      endpoint: '/api/bmgbr/blaze/pragmatic/blaze-megarouletebr',
      sourcePage: '/bmgbr',
      description: 'Cópia teste independente - /bmgbr',
      category: 'testing',
      icon: '🧪'
    },
    {
      id: 'bmgbr2-copy',
      name: 'BMGBR2',
              endpoint: '/api/bmgbr2-old/blaze/pragmatic/blaze-megarouletebr',
      sourcePage: '/bmgbr2-old',
      description: 'Cópia teste independente - /bmgbr2',
      category: 'testing',
      icon: '🧪'
    }
  ];

  useEffect(() => {
    checkCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser && autoRefresh) {
      console.log(`🚀 Iniciando ciclo de monitoramento automático`);
      
      // Descobrir bots ativos primeiro
      discoverActiveBots();
      
      const interval = setInterval(() => {
        discoverActiveBots();
      }, 5000); // A cada 5 segundos
      
      return () => clearInterval(interval);
    }
  }, [currentUser, autoRefresh]);

  // 🔥 NOVO: useEffect específico para carregar detalhes quando botInstances muda
  useEffect(() => {
    if (botInstances.length > 0) {
      console.log(`🔄 botInstances atualizado: ${botInstances.length} instâncias. Carregando detalhes...`);
      // Aguardar um pouco e carregar detalhes
      const timer = setTimeout(() => {
        loadBotsStatus();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [botInstances]);

  const checkCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  // 🔥 NOVA FUNÇÃO: Descobrir bots ativos dinamicamente - VERSÃO APRIMORADA
  const discoverActiveBots = async () => {
    if (!currentUser?.id) return;
    
    setDiscoveryLoading(true);
    
    try {
      // 1. Buscar todos os usuários usando a mesma função RPC do matrixx
      const { data: users, error: usersError } = await supabase.rpc('get_all_users_admin');

      if (usersError) {
        console.error('Erro ao buscar usuários ativos:', usersError);
        return;
      }

      console.log(`🔍 Encontrados ${users?.length || 0} usuários no banco`);

      // 2. Buscar usuários recentes (últimas 6 horas para ser menos restritivo)
      const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
      const activeUsersFiltered = (users || []).filter((user: any) => {
        if (!user.last_login) return false;
        const lastLoginTime = new Date(user.last_login).getTime();
        return lastLoginTime > sixHoursAgo;
      });

      // 3. TAMBÉM verificar o usuário atual sempre (caso não apareça na RPC)
      if (currentUser && !activeUsersFiltered.find((u: any) => u.id === currentUser.id)) {
        activeUsersFiltered.push({
          id: currentUser.id,
          email: currentUser.email,
          created_at: currentUser.created_at,
          credits: 0,
          last_login: new Date().toISOString()
        });
      }

      setActiveUsers(activeUsersFiltered);
      console.log(`👥 ${activeUsersFiltered.length} usuários ativos nas últimas 6h`);

      // 4. Para cada usuário ativo + cada endpoint, verificar conexões
      const discoveredBots: BotInstance[] = [];
      let totalChecked = 0;

      for (const user of activeUsersFiltered) {
        console.log(`🔍 Verificando usuário: ${user.email}`);
        
        for (const endpoint of botEndpoints) {
          try {
            totalChecked++;
            
            // Timeout mais rápido para verificação
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
            
            const response = await fetch(endpoint.endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                action: 'get-connection-status',
                sourcePage: endpoint.sourcePage,
                verifyOrigin: true
              }),
              signal: controller.signal
            });

            clearTimeout(timeoutId);
            const result = await response.json();
            
            console.log(`📡 ${user.email} em ${endpoint.name}: ${result.success ? (result.data?.connected ? 'CONECTADO' : 'desconectado') : 'erro'}`);
            
            if (result.success && result.data?.connected) {
              discoveredBots.push({
                userId: user.id,
                userEmail: user.email,
                botType: endpoint.name,
                endpoint: endpoint.endpoint,
                sourcePage: endpoint.sourcePage,
                isActive: result.data.operationActive || false,
                lastActivity: result.data.lastUpdate || Date.now(),
                icon: endpoint.icon
              });
              
              console.log(`✅ BOT ATIVO ENCONTRADO: ${user.email} - ${endpoint.name} (${endpoint.sourcePage})`);
            }
            
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              console.log(`⏱️ Timeout verificando ${user.email} em ${endpoint.name}`);
            } else {
              console.log(`❌ Erro verificando ${user.email} em ${endpoint.name}:`, error);
            }
          }
        }
      }

      // 🔍 DETECÇÃO INTELIGENTE DE ORIGEM: Filtrar conexões duplicadas da mesma API
      const uniqueConnections = discoveredBots.reduce((unique: BotInstance[], bot) => {
        // Verificar se já existe uma conexão deste usuário para esta API
        const existingConnection = unique.find(existing => 
          existing.userId === bot.userId && existing.endpoint === bot.endpoint
        );
        
        if (!existingConnection) {
          // Primeira conexão para esta API, adicionar
          unique.push(bot);
          console.log(`✅ Origem detectada: ${bot.userEmail} → ${bot.sourcePage} (${bot.endpoint})`);
        } else {
          // Já existe conexão para esta API, preferir a mais específica
          // Heurística: /bmg, /bmg2, /bmgbr, /bmgbr2 são mais específicos que /blaze-megaroulettebr
          const isMoreSpecific = bot.sourcePage !== '/blaze-megaroulettebr' && 
                                 existingConnection.sourcePage === '/blaze-megaroulettebr';
          
          if (isMoreSpecific) {
            // Substituir pela origem mais específica
            const index = unique.indexOf(existingConnection);
            unique[index] = bot;
            console.log(`🔄 Origem atualizada: ${bot.userEmail} → ${existingConnection.sourcePage} ➜ ${bot.sourcePage}`);
          } else {
            console.log(`🔄 Origem duplicada ignorada: ${bot.userEmail} → ${bot.sourcePage} (já existe ${existingConnection.sourcePage})`);
          }
        }
        
        return unique;
      }, []);

      setBotInstances(uniqueConnections);
      
      console.log(`🎯 DESCOBERTA CONCLUÍDA: ${uniqueConnections.length} conexões únicas de ${discoveredBots.length} encontradas (${totalChecked} verificações)`);
      if (uniqueConnections.length > 0) {
        console.log(`📋 Conexões finais:`);
        uniqueConnections.forEach((bot, i) => {
          console.log(`  ${i+1}. ${bot.icon} ${bot.botType} - ${bot.userEmail} - ${bot.sourcePage}`);
        });
      }
      
      const duplicatesRemoved = discoveredBots.length - uniqueConnections.length;
      if (duplicatesRemoved > 0) {
        console.log(`🧹 ${duplicatesRemoved} conexões duplicadas removidas`);
      }
      
    } catch (error) {
      console.error('Erro na descoberta de bots:', error);
    } finally {
      setDiscoveryLoading(false);
    }
  };

    // 🚀 FUNÇÃO SUPER MELHORADA: Carregar status completo dos bots
  const loadBotsStatus = useCallback(async () => {
    console.log(`🔧 loadBotsStatus chamado com ${botInstances.length} instâncias descobertas`);
    
    if (!currentUser?.id) {
      console.log(`❌ Não há usuário atual logado`);
      return;
    }
    
    if (botInstances.length === 0) {
      console.log(`❌ Nenhuma instância descoberta ainda`);
      return;
    }
    
    setLoading(true);
    const botStatuses: BotStatus[] = [];

    console.log(`📊 Carregando detalhes para ${botInstances.length} bots descobertos:`);
    botInstances.forEach((inst, i) => {
      console.log(`  ${i+1}. ${inst.botType} - ${inst.userEmail} - ${inst.endpoint}`);
    });

    // 📊 Para cada bot ativo descoberto, buscar TODOS os dados disponíveis
    for (const instance of botInstances) {
      try {
        console.log(`🔍 Carregando detalhes do bot: ${instance.botType} (${instance.userEmail})`);
        
        // 🔥 FAZER MÚLTIPLAS CHAMADAS EM PARALELO para cada bot
        const [logsResponse, reportResponse] = await Promise.all([
          // 1. Buscar logs e status da conexão
          fetch(instance.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: instance.userId,
              action: 'get-websocket-logs'
            })
          }),
          // 2. Buscar relatório de operação
          fetch(instance.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: instance.userId,
              action: 'get-operation-report'
            })
          })
        ]);

        console.log(`📡 Respostas obtidas para ${instance.botType}:`, {
          logsStatus: logsResponse.status,
          reportStatus: reportResponse.status
        });

        const logsResult = await logsResponse.json();
        const reportResult = await reportResponse.json();
        
        console.log(`📋 Dados processados para ${instance.botType}:`, {
          logsSuccess: logsResult.success,
          reportSuccess: reportResult.success,
          hasData: !!logsResult.data
        });
        
        if (logsResult.success && logsResult.data) {
          const data = logsResult.data;
          const report = reportResult.success ? reportResult.data : null;
          
          console.log(`✅ Criando card para ${instance.botType}:`, {
            connected: data.connectionStatus?.connected,
            operationActive: data.operationActive,
            hasStats: !!(report?.summary || data.operationState?.stats)
          });
          
          // 🎯 CONSTRUIR OBJETO COMPLETO COM TODAS AS INFORMAÇÕES
          // Usar página de origem + userId para ID único por origem
          const pageId = instance.sourcePage.replace('/', '');
          const botStatus: BotStatus = {
            id: `${instance.userId}-${pageId}`,
            name: `${instance.icon} ${instance.botType}`,
            endpoint: instance.endpoint,
            description: `${instance.sourcePage} • ${instance.userEmail}`,
            connectionStatus: data.connectionStatus || { 
              connected: false, 
              lastUpdate: Date.now() 
            },
            operationStatus: {
              isOperating: data.operationActive || false,
              operationActive: data.operationActive || false,
              mode: data.operationState?.mode, // Capturar o modo da API bmgbr
              startedAt: report?.summary?.startedAt || data.operationState?.stats?.startedAt,
              stats: report?.summary || data.operationState?.stats || {
                totalBets: 0,
                wins: 0,
                losses: 0,
                profit: 0
              }
            },
            userInfo: {
              userId: instance.userId,
              email: instance.userEmail
            },
            lastSevenResults: data.lastSevenResults || [],
            websocketLogs: (data.logs || []).slice(-10),
            // 🔥 NOVOS DADOS DETALHADOS
            operationDetails: data.operationState ? {
              pattern: data.operationState.pattern,
              currentLevel: data.operationState.level,
              martingaleLevel: data.operationState.martingaleLevel,
              waitingForResult: data.operationState.waitingForResult,
              profitStatus: data.operationState.profitStatus
            } : undefined,
            sessionInfo: data.sessionStatus,
            bettingWindow: data.bettingWindow
          };
          
          botStatuses.push(botStatus);
          console.log(`✅ Card criado com sucesso para ${instance.botType}`);
        } else {
          console.log(`❌ Falha ao obter dados para ${instance.botType}:`, logsResult.error);
        }
      } catch (error) {
        console.error(`❌ Erro ao monitorar bot ${instance.botType} do usuário ${instance.userEmail}:`, error);
      }
    }

    console.log(`🎯 RESULTADO FINAL: ${botStatuses.length} cards serão exibidos de ${botInstances.length} bots descobertos`);
    setBots(botStatuses);
    setLastUpdate(Date.now());
    setLoading(false);
  }, [currentUser, botInstances]);

  // 🔥 NOVA FUNÇÃO: Forçar nova descoberta
  const forceDiscovery = async () => {
    setBots([]);
    setBotInstances([]);
    await discoverActiveBots();
  };

  // 🔧 NOVO: Funções para gerenciar alertas
  const showAlert = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    setAlertMessage({ type, message });
    setTimeout(() => setAlertMessage(null), 5000);
  };

  // 🔥 NOVO: Função para desconectar bot
  const disconnectBot = async (bot: BotStatus) => {
    if (!bot.userInfo?.userId) {
      showAlert('error', 'ID do usuário não encontrado');
      return;
    }

    const botId = bot.id;
    setDisconnectingBots(prev => new Set(prev).add(botId));

    try {
      console.log(`🔌 Desconectando bot: ${bot.name} (${bot.userInfo.email})`);
      
      const response = await fetch(bot.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: bot.userInfo.userId,
          action: 'stop-operation'
        })
      });

      const result = await response.json();

      if (result.success) {
        showAlert('success', `Bot ${bot.name} desconectado com sucesso`);
        
        // Atualizar o status local imediatamente
        setBots(prevBots => 
          prevBots.map(b => 
            b.id === botId 
              ? {
                  ...b,
                  connectionStatus: { ...b.connectionStatus, connected: false },
                  operationStatus: { 
                    ...b.operationStatus, 
                    isOperating: false, 
                    operationActive: false,
                    startedAt: undefined // ✅ CORREÇÃO: Resetar timestamp para parar contagem
                  },
                  sessionInfo: {
                    ...b.sessionInfo,
                    createdAt: undefined // ✅ CORREÇÃO: Resetar timestamp da sessão
                  }
                }
              : b
          )
        );

        // Forçar nova descoberta após um tempo
        setTimeout(() => {
          discoverActiveBots();
        }, 2000);
      } else {
        showAlert('error', `Erro ao desconectar: ${result.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao desconectar bot:', error);
      showAlert('error', 'Erro de conexão ao desconectar bot');
    } finally {
      setDisconnectingBots(prev => {
        const newSet = new Set(prev);
        newSet.delete(botId);
        return newSet;
      });
    }
  };

  const getBotStatusColor = (bot: BotStatus) => {
    if (bot.operationStatus.isOperating && bot.connectionStatus.connected) {
      if (bot.operationStatus.mode === 'real') {
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      } else if (bot.operationStatus.mode === 'analysis') {
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      }
      return 'text-green-400 bg-green-500/20 border-green-500/30';
    }
    if (bot.connectionStatus.connected) {
      return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
    }
    return 'text-red-400 bg-red-500/20 border-red-500/30';
  };

  const getBotStatusText = (bot: BotStatus) => {
    if (bot.operationStatus.isOperating && bot.connectionStatus.connected) {
      if (bot.operationStatus.mode === 'real') {
        return 'Em operação';
      } else if (bot.operationStatus.mode === 'analysis') {
        return 'Em análise';
      }
      return 'Operando';
    }
    if (bot.connectionStatus.connected) {
      return 'Conectado';
    }
    return 'Desconectado';
  };

  const getBotStatusIcon = (bot: BotStatus) => {
    if (bot.operationStatus.isOperating && bot.connectionStatus.connected) {
      if (bot.operationStatus.mode === 'real') {
        return <Zap className="h-4 w-4" />; // Operação real
      } else if (bot.operationStatus.mode === 'analysis') {
        return <Clock className="h-4 w-4" />; // Análise
      }
      return <Activity className="h-4 w-4" />;
    }
    if (bot.connectionStatus.connected) {
      return <Wifi className="h-4 w-4" />;
    }
    return <WifiOff className="h-4 w-4" />;
  };

  const formatDuration = (startTime: number) => {
    const now = Date.now();
    const diff = now - startTime;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // 🔥 NOVO: Função para ordenar bots baseado no filtro
  const sortBots = (botsToSort: BotStatus[]) => {
    return [...botsToSort].sort((a, b) => {
      switch (sortBy) {
        case 'profit':
          const profitA = a.operationStatus.stats?.profit || 0;
          const profitB = b.operationStatus.stats?.profit || 0;
          return profitB - profitA; // Maior lucro primeiro
        
        case 'operations':
          const operationsA = a.operationStatus.stats?.totalBets || 0;
          const operationsB = b.operationStatus.stats?.totalBets || 0;
          return operationsB - operationsA; // Mais operações primeiro
        
        case 'time':
          const timeA = a.operationStatus.startedAt || a.sessionInfo?.createdAt || 0;
          const timeB = b.operationStatus.startedAt || b.sessionInfo?.createdAt || 0;
          return timeB - timeA; // Maior tempo ligado primeiro (mais recente = maior timestamp)
        
        default:
          return 0;
      }
    });
  };

  // 🔥 NOVO: Função para filtrar bots por status
  const filterBotsByStatus = (botsToFilter: BotStatus[]) => {
    if (statusFilter === 'all') return botsToFilter;
    
    return botsToFilter.filter(bot => {
      switch (statusFilter) {
        case 'connected':
          return bot.connectionStatus.connected && !bot.operationStatus.isOperating;
        
        case 'operating':
          return bot.operationStatus.isOperating && bot.operationStatus.mode === 'real';
        
        case 'analyzing':
          return bot.operationStatus.isOperating && bot.operationStatus.mode === 'analysis';
        
        case 'disconnected':
          return !bot.connectionStatus.connected;
        
        default:
          return true;
      }
    });
  };

  // 🔥 NOVO: Aplicar filtro de status e depois ordenação
  const filteredBots = filterBotsByStatus(bots);
  const sortedBots = sortBots(filteredBots);

  // Header sem ações adicionais (igual em ambas as páginas)
  const additionalActions = null;

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader currentUser={currentUser} additionalActions={additionalActions} />

      {/* Alerta de Mensagem */}
      {alertMessage && (
        <div className={`mx-auto max-w-7xl px-6 py-3 ${
          alertMessage.type === 'success' ? 'bg-green-500/20 text-green-400' :
          alertMessage.type === 'error' ? 'bg-red-500/20 text-red-400' :
          alertMessage.type === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-blue-500/20 text-blue-400'
        }`}>
          <div className="flex items-center justify-between">
            <span>{alertMessage.message}</span>
            <Button
              onClick={() => setAlertMessage(null)}
              variant="ghost"
              size="sm"
              className="text-current hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="space-y-6">
          {/* 🔥 NOVO: Header com descoberta dinâmica */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white font-mono">SISTEMA_MONITORAMENTO_BOTS</h1>
              <p className="text-gray-400 font-mono text-sm">Descoberta automática de bots ativos em tempo real</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={forceDiscovery}
                disabled={discoveryLoading}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className={`h-4 w-4 ${discoveryLoading ? 'animate-spin' : ''}`} />
              </Button>
              
              <Button
                onClick={() => setAutoRefresh(!autoRefresh)}
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
              >
                <Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
                Auto-Refresh {autoRefresh ? 'ON' : 'OFF'}
              </Button>
            </div>
          </div>

          {/* 🔥 NOVA: Estatísticas de Descoberta */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Users className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Usuários Ativos (6h)</p>
                    <p className="text-xl font-bold text-white">{activeUsers.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Server className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Instâncias Ativas</p>
                    <p className="text-xl font-bold text-white">{botInstances.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Conectados</p>
                    <p className="text-xl font-bold text-white">
                      {bots.filter(b => b.connectionStatus.connected).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <Activity className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Operando</p>
                    <p className="text-xl font-bold text-white">
                      {bots.filter(b => b.operationStatus.isOperating).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>


          </div>

          {/* 🔧 GERENCIAMENTO DE MANUTENÇÃO */}
          <div className="mt-8">
            <MaintenanceManager
              currentUser={currentUser}
            />
          </div>

          {/* 📊 TABELA SIMPLES DE BOTS */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white font-mono flex items-center gap-2">
                    <Bot className="h-5 w-5 text-blue-400" />
                    BOTS CONECTADOS
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    {filteredBots.length} de {bots.length} bots • 
                    Filtro: {
                      statusFilter === 'all' ? 'Todos' :
                      statusFilter === 'connected' ? 'Conectados' :
                      statusFilter === 'operating' ? 'Em operação' :
                      statusFilter === 'analyzing' ? 'Em análise' :
                      'Desconectados'
                    } • 
                    Ordenado por: {
                      sortBy === 'profit' ? 'Maior lucro' : 
                      sortBy === 'operations' ? 'Mais operações' : 
                      'Maior tempo'
                    } • 
                    Última atualização: {new Date(lastUpdate).toLocaleTimeString('pt-BR')}
                  </CardDescription>
                </div>
                
                {/* 🔥 NOVO: Filtros de ordenação e status */}
                <div className="flex items-center gap-4">
                  {/* Filtro de Status */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono">Filtrar:</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as 'all' | 'connected' | 'operating' | 'analyzing' | 'disconnected')}
                      className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-sm text-gray-300 font-mono focus:outline-none focus:border-green-500"
                    >
                      <option value="all">🌐 Todos</option>
                      <option value="connected">📶 Conectados</option>
                      <option value="operating">⚡ Em Operação</option>
                      <option value="analyzing">🔍 Em Análise</option>
                      <option value="disconnected">📵 Desconectados</option>
                    </select>
                  </div>

                  {/* Filtro de Ordenação */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono">Ordenar:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'profit' | 'operations' | 'time')}
                      className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-sm text-gray-300 font-mono focus:outline-none focus:border-blue-500"
                    >
                      <option value="profit">💰 Maior Lucro</option>
                      <option value="operations">🎯 Mais Operações</option>
                      <option value="time">⏱️ Maior Tempo</option>
                    </select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredBots.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Status</th>
                        <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Bot</th>
                        <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Usuário</th>
                        <th className="text-center py-3 px-4 text-gray-400 text-sm font-medium">Tempo</th>
                        <th className="text-center py-3 px-4 text-gray-400 text-sm font-medium">Operações</th>
                        <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Lucro</th>
                        <th className="text-center py-3 px-4 text-gray-400 text-sm font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBots.map((bot) => (
                        <tr key={bot.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              {getBotStatusIcon(bot)}
                              <span className={`text-xs px-2 py-1 rounded ${getBotStatusColor(bot)}`}>
                                {getBotStatusText(bot).toUpperCase()}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div>
                              <p className="text-white font-medium">{bot.name}</p>
                              <p className="text-xs text-gray-400">{bot.description?.split(' • ')[0] || 'N/A'}</p>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-gray-300">{bot.userInfo?.email || 'N/A'}</span>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div>
                              <p className="text-white font-bold">
                                {/* ✅ CORREÇÃO: Mostrar "--" quando desconectado */}
                                {!bot.connectionStatus.connected 
                                  ? '--'
                                  : bot.operationStatus.startedAt 
                                  ? formatDuration(bot.operationStatus.startedAt)
                                  : bot.sessionInfo?.createdAt 
                                  ? formatDuration(bot.sessionInfo.createdAt)
                                  : '--'
                                }
                              </p>
                              <p className="text-xs text-gray-400">
                                {!bot.connectionStatus.connected 
                                  ? 'desconectado'
                                  : bot.operationStatus.isOperating 
                                  ? (bot.operationStatus.mode === 'real' ? 'operando' : 'analisando')
                                  : 'conectado'
                                }
                              </p>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div>
                              <p className="text-white font-bold text-lg">
                                {bot.operationStatus.stats?.totalBets || 0}
                              </p>
                              <p className="text-xs text-gray-400">apostas</p>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <div>
                              <p className={`font-bold text-lg ${
                                (bot.operationStatus.stats?.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                R$ {(bot.operationStatus.stats?.profit || 0).toFixed(2)}
                              </p>
                              <p className={`text-xs font-medium ${
                                (bot.operationStatus.stats?.profit || 0) > 0 ? 'text-green-400' : 
                                (bot.operationStatus.stats?.profit || 0) < 0 ? 'text-red-400' : 'text-gray-400'
                              }`}>
                                {(bot.operationStatus.stats?.profit || 0) > 0 ? 'LUCRO' : 
                                 (bot.operationStatus.stats?.profit || 0) < 0 ? 'PREJUÍZO' : 'NEUTRO'}
                              </p>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={disconnectingBots.has(bot.id) || !bot.connectionStatus.connected}
                              className={`border-red-500/50 text-red-400 hover:text-red-300 hover:bg-red-500/10 ${
                                disconnectingBots.has(bot.id) ? 'opacity-50' : ''
                              }`}
                              onClick={() => disconnectBot(bot)}
                            >
                              {disconnectingBots.has(bot.id) ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : bots.length > 0 ? (
                <div className="text-center py-12">
                  <Bot className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">Nenhum bot encontrado</h3>
                  <p className="text-gray-400 mb-4">
                    Nenhum bot corresponde ao filtro &quot;{
                      statusFilter === 'all' ? 'Todos' :
                      statusFilter === 'connected' ? 'Conectados' :
                      statusFilter === 'operating' ? 'Em operação' :
                      statusFilter === 'analyzing' ? 'Em análise' :
                      'Desconectados'
                    }&quot; selecionado
                  </p>
                  <Button
                    onClick={() => setStatusFilter('all')}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Mostrar Todos
                  </Button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Bot className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">Nenhum bot ativo</h3>
                  <p className="text-gray-400 mb-4">
                    {activeUsers.length} usuários ativos detectados
                  </p>
                  <Button
                    onClick={forceDiscovery}
                    disabled={discoveryLoading}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <RefreshCw className={`h-4 w-4 ${discoveryLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>


        </div>
      </main>


    </div>
  );
} 