'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  CheckCircle,
  Zap,
  Users,
  Bot,
  Server,
  X,
  TrendingUp
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

  // 🔥 REMOVIDO: Função de desconectar não é necessária para monitoramento

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
    },
    {
      id: 'bmgbr3-copy',
      name: 'BMGBR3',
      endpoint: '/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr',
      sourcePage: '/bmgbr3',
      description: 'Versão de testes - /bmgbr3',
      category: 'testing',
      icon: '🔬'
    }
  ];

  useEffect(() => {
    checkCurrentUser();
    
    // 🔧 NOVO: Mostrar alerta sobre nova versão simplificada
    showAlert('info', '📊 Página otimizada: Monitoramento focado apenas em apostas e lucros');
  }, []);

  useEffect(() => {
    if (currentUser && autoRefresh) {
      console.log(`🚀 Iniciando ciclo de monitoramento automático`);
      
      // Descobrir bots ativos primeiro
      discoverActiveBots();
      
      const interval = setInterval(() => {
        discoverActiveBots();
      }, 30000); // 🔧 OTIMIZADO: A cada 30 segundos para monitoramento suave
      
      return () => clearInterval(interval);
    }
  }, [currentUser, autoRefresh]);

  // 🔥 NOVO: useEffect específico para carregar detalhes quando botInstances muda
  useEffect(() => {
    if (botInstances.length > 0) {
      console.log(`🔄 botInstances atualizado: ${botInstances.length} instâncias. Carregando detalhes...`);
      // 🔧 CORREÇÃO: Aguardar mais tempo para evitar sobrecarga
      const timer = setTimeout(() => {
        loadBotsStatus();
      }, 2000); // Era 500ms, agora 2s
      
      return () => clearTimeout(timer);
    }
  }, [botInstances]);

  const checkCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  // 🔥 NOVA FUNÇÃO: Descobrir bots ativos - VERSÃO SIMPLIFICADA PARA MONITORAMENTO
  const discoverActiveBots = async () => {
    if (!currentUser?.id) return;
    
    setDiscoveryLoading(true);
    
    try {
      // 1. Buscar usuários ativos (simplificado)
      const { data: users, error: usersError } = await supabase.rpc('get_all_users_admin');

      if (usersError) {
        console.error('Erro ao buscar usuários:', usersError);
        return;
      }

      console.log(`🔍 Verificando ${users?.length || 0} usuários para monitoramento`);

      // 2. Filtrar apenas usuários ativos nas últimas 6h para monitoramento
      const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
      const activeUsers = (users || []).filter((user: any) => {
        if (!user.last_login) return false;
        const lastLoginTime = new Date(user.last_login).getTime();
        return lastLoginTime > sixHoursAgo;
      });

      setActiveUsers(activeUsers);
      console.log(`👥 Monitorando ${activeUsers.length} usuários ativos`);

      // 3. 🎯 DESCOBERTA SUPER SIMPLIFICADA: Só verificar connection status
      const discoveredBots: BotInstance[] = [];
      
      for (const user of activeUsers) {
        console.log(`🔍 Verificando usuário: ${user.email}`);
        
        // Verificar apenas o endpoint principal para cada usuário
        for (const endpoint of botEndpoints) {
          try {
            const response = await fetch(endpoint.endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                action: 'get-connection-status',
                monitoringOnly: true
              })
            });

            const result = await response.json();
            
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
              
              console.log(`✅ Bot ativo: ${user.email} - ${endpoint.name}`);
              break; // Primeira conexão encontrada, seguir para próximo usuário
            }
            
          } catch (error) {
            console.log(`❌ Erro verificando ${user.email}:`, error);
          }
          
          // Pequeno delay entre endpoints
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Delay entre usuários
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setBotInstances(discoveredBots);
      console.log(`🎯 ${discoveredBots.length} bots ativos descobertos`);
      
    } catch (error) {
      console.error('Erro na descoberta:', error);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  // 🚀 FUNÇÃO SUPER SIMPLIFICADA: Carregar apenas dados de apostas e lucro
  const loadBotsStatus = useCallback(async () => {
    console.log(`📊 Carregando dados de apostas/lucro para ${botInstances.length} bots`);
    
    if (!currentUser?.id || botInstances.length === 0) return;
    
    setLoading(true);
    const botStatuses: BotStatus[] = [];

    // Processar cada bot - APENAS uma requisição por bot
    for (const instance of botInstances) {
      try {
        console.log(`📊 Carregando relatório: ${instance.botType} (${instance.userEmail})`);
        
        // 🎯 UMA ÚNICA REQUISIÇÃO: get-operation-report (contém tudo que precisamos)
        const response = await fetch(instance.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: instance.userId,
            action: 'get-operation-report',
            monitoringOnly: true
          })
        });

        const result = await response.json();
        
        if (result.success && result.data) {
          const report = result.data;
          const summary = report.summary || {};
          
          console.log(`✅ Dados obtidos: ${instance.botType} - ${summary.totalBets || 0} apostas, R$ ${(summary.profit || 0).toFixed(2)}`);
          
          // 🎯 CARD SIMPLIFICADO: Só dados essenciais
          const botStatus: BotStatus = {
            id: `${instance.userId}-${instance.sourcePage.replace('/', '')}`,
            name: `${instance.icon} ${instance.botType}`,
            endpoint: instance.endpoint,
            description: `${instance.sourcePage} • ${instance.userEmail}`,
            connectionStatus: { 
              connected: true, // Se chegou até aqui, está conectado
              lastUpdate: Date.now() 
            },
            operationStatus: {
              isOperating: summary.totalBets > 0, // Se tem apostas, está operando
              operationActive: summary.totalBets > 0,
              startedAt: summary.startedAt,
              stats: {
                totalBets: summary.totalBets || 0,
                wins: summary.wins || 0,
                losses: summary.losses || 0,
                profit: summary.profit || 0,
                winRate: summary.winRate || 0
              }
            },
            userInfo: {
              userId: instance.userId,
              email: instance.userEmail
            }
          };
          
          botStatuses.push(botStatus);
        } else {
          console.log(`❌ Falha ao obter relatório: ${instance.botType}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao carregar ${instance.botType}:`, error);
      }
      
      // Delay suave entre bots
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    console.log(`📋 ${botStatuses.length} relatórios carregados`);
    setBots(botStatuses);
    setLastUpdate(Date.now());
    setLoading(false);
  }, [currentUser, botInstances]);



  // 🔧 NOVO: Funções para gerenciar alertas
  const showAlert = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    setAlertMessage({ type, message });
    setTimeout(() => setAlertMessage(null), 5000);
  };

  // 🔥 REMOVIDO: Função de desconectar não é necessária para monitoramento simples

  // 🎯 FUNÇÕES SIMPLIFICADAS: Apenas apostas e lucro
  const getBotStatusColor = (bot: BotStatus) => {
    if ((bot.operationStatus.stats?.totalBets || 0) > 0) {
      return 'text-green-400 bg-green-500/20 border-green-500/30';
    }
    return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
  };

  const getBotStatusText = (bot: BotStatus) => {
    if ((bot.operationStatus.stats?.totalBets || 0) > 0) {
      return 'Operando';
    }
    return 'Conectado';
  };

  const getBotStatusIcon = (bot: BotStatus) => {
    if ((bot.operationStatus.stats?.totalBets || 0) > 0) {
      return <Zap className="h-4 w-4" />;
    }
    return <Activity className="h-4 w-4" />;
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

  return (
    <div className="bg-black min-h-screen text-white">
      {/* Admin Header */}
      <AdminHeader 
        currentUser={currentUser}
        additionalActions={
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            className={autoRefresh ? "bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono" : "bg-gray-500/20 border border-gray-500/50 text-gray-400 hover:bg-gray-500/30 font-mono"}
          >
            <Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
            AUTO_{autoRefresh ? 'ON' : 'OFF'}
          </Button>
        }
      />

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

      {/* Conteúdo da página */}
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Título da página */}
        <div>
          <h1 className="text-3xl font-bold text-green-400 font-mono mb-2">
            📊 BOTS_APOSTAS & LUCROS
          </h1>
          <p className="text-gray-400 font-mono text-sm">
            {`// Monitoramento simplificado de apostas e lucros • Última atualização: ${new Date(lastUpdate).toLocaleTimeString('pt-BR')} • Auto-refresh ${autoRefresh ? 'ativo' : 'pausado'}`}
          </p>
        </div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-purple-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-purple-400 font-mono text-sm">
                <Users className="h-4 w-4" />
                USUÁRIOS_ATIVOS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-400 font-mono">
                {activeUsers.length}
              </div>
              <p className="text-xs text-gray-400 font-mono">logados 6h</p>
            </CardContent>
          </Card>

          <Card className="border-blue-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-blue-400 font-mono text-sm">
                <Server className="h-4 w-4" />
                INSTÂNCIAS_ATIVAS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-400 font-mono">
                {botInstances.length}
              </div>
              <p className="text-xs text-gray-400 font-mono">detectadas</p>
            </CardContent>
          </Card>

          <Card className="border-green-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-green-400 font-mono text-sm">
                <CheckCircle className="h-4 w-4" />
                BOTS_CONECTADOS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400 font-mono">
                {bots.filter(b => b.connectionStatus.connected).length}
              </div>
              <p className="text-xs text-gray-400 font-mono">online</p>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-yellow-400 font-mono text-sm">
                <TrendingUp className="h-4 w-4" />
                APOSTAS_TOTAIS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-400 font-mono">
                {bots.reduce((total, bot) => total + (bot.operationStatus.stats?.totalBets || 0), 0)}
              </div>
              <p className="text-xs text-gray-400 font-mono">em andamento</p>
            </CardContent>
          </Card>
                </div>

        {/* Gerenciamento de Manutenção */}
        <div>
          <MaintenanceManager
            currentUser={currentUser}
          />
        </div>

        {/* Lista de Bots */}
        <Card className="border-gray-700/30 bg-gray-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-white font-mono">
                  <Bot className="h-5 w-5" />
                  BOTS_SISTEMA ({filteredBots.length})
                </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
                  {`// ${statusFilter === 'all' ? 'Todos os bots de todos usuários' : 
                    statusFilter === 'connected' ? 'Bots conectados de todos usuários' :
                    statusFilter === 'operating' ? 'Bots operando de todos usuários' :
                    statusFilter === 'analyzing' ? 'Bots analisando de todos usuários' :
                    'Bots desconectados de todos usuários'} • Por ${
                    sortBy === 'profit' ? 'lucro' : 
                    sortBy === 'operations' ? 'operações' : 
                    'tempo'}`}
                </CardDescription>
              </div>

              <div className="flex items-center gap-3">
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
          </CardHeader>
          <CardContent>
            {filteredBots.length > 0 ? (
              <div className="space-y-4">
                {sortedBots.map((bot) => (
                  <div
                    key={bot.id}
                    className="border border-gray-700/50 rounded-lg p-4 hover:bg-gray-800/30 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            {getBotStatusIcon(bot)}
                            <Badge className={`font-mono text-xs ${getBotStatusColor(bot)}`}>
                              {getBotStatusText(bot).toUpperCase()}
                            </Badge>
                          </div>
                          <div className="text-white font-mono font-semibold">
                            {bot.name}
                          </div>
                        </div>
                        
                        <div className="text-xs font-mono text-gray-400 mb-3">
                          👤 {bot.userInfo?.email || 'N/A'} • 📄 {bot.description?.split(' • ')[0] || 'N/A'}
                        </div>

                        {/* 🎯 DADOS PRINCIPAIS: Apenas apostas e lucro */}
                        <div className="grid grid-cols-2 gap-6 text-sm">
                          <div className="space-y-2">
                            <div>
                              <span className="text-gray-400 text-xs">📊 Total de Apostas:</span>
                              <div className="text-purple-400 font-mono text-lg font-bold">
                                {bot.operationStatus.stats?.totalBets || 0}
                              </div>
                            </div>
                            <div>
                              <span className="text-gray-400 text-xs">🎯 Taxa de Acerto:</span>
                              <div className="text-blue-400 font-mono text-sm font-semibold">
                                {bot.operationStatus.stats?.winRate || 0}%
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <span className="text-gray-400 text-xs">✅ Vitórias:</span>
                              <div className="text-green-400 font-mono text-sm font-semibold">
                                {bot.operationStatus.stats?.wins || 0}
                              </div>
                            </div>
                            <div>
                              <span className="text-gray-400 text-xs">❌ Derrotas:</span>
                              <div className="text-red-400 font-mono text-sm font-semibold">
                                {bot.operationStatus.stats?.losses || 0}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        <div className={`font-bold font-mono text-lg ${
                          (bot.operationStatus.stats?.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          R$ {(bot.operationStatus.stats?.profit || 0).toFixed(2)}
                        </div>
                        <div className={`text-xs font-mono font-medium ${
                          (bot.operationStatus.stats?.profit || 0) > 0 ? 'text-green-400' : 
                          (bot.operationStatus.stats?.profit || 0) < 0 ? 'text-red-400' : 'text-gray-400'
                        }`}>
                          {(bot.operationStatus.stats?.profit || 0) > 0 ? 'LUCRO' : 
                           (bot.operationStatus.stats?.profit || 0) < 0 ? 'PREJUÍZO' : 'NEUTRO'}
                        </div>
                        {/* 🔥 REMOVIDO: Botão de desconectar - apenas monitoramento */}
                        <div className="text-xs font-mono text-gray-500 mt-2">
                          Monitoramento
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : bots.length > 0 ? (
              <div className="text-center py-8">
                <Bot className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400 font-mono">
                  Nenhum bot corresponde ao filtro selecionado
                </p>
                <p className="text-gray-500 font-mono text-xs mt-2">
                  {`// Filtro: ${statusFilter === 'all' ? 'Todos' :
                    statusFilter === 'connected' ? 'Conectados' :
                    statusFilter === 'operating' ? 'Em operação' :
                    statusFilter === 'analyzing' ? 'Em análise' :
                    'Desconectados'}`}
                </p>
                <Button
                  onClick={() => setStatusFilter('all')}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 font-mono"
                  size="sm"
                >
                  MOSTRAR_TODOS
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <Bot className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400 font-mono">
                  NENHUM_BOT_ATIVO
                </p>
                <p className="text-gray-500 font-mono text-xs mt-2">
                  {`// ${activeUsers.length} usuários logados nas últimas 6h • Auto-refresh ${autoRefresh ? 'ativo' : 'desativado'}`}
                </p>
              </div>
            )}
            </CardContent>
          </Card>


      </div>
    </div>
  );
} 