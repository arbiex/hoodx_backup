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
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Users,
  Bot,
  Shield
} from 'lucide-react';
import AdminHeader from '@/components/AdminHeader';

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
    startedAt?: number;
    stats?: {
      totalBets: number;
      wins: number;
      losses: number;
      profit: number;
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
}

export default function BotsMonitoringPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [bots, setBots] = useState<BotStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [selectedBot, setSelectedBot] = useState<string | null>(null);

  // Configuração dos bots
  const botConfigs = [
    {
      id: 'blaze-megaroulette',
      name: 'Blaze MegaRoulette',
      endpoint: '/api/bots/blaze/pragmatic/blaze-megarouletebr',
      description: 'Bot de apostas automáticas na MegaRoulette da Blaze'
    },
    {
      id: 'bmg',
      name: 'BMG Strategy Bot', 
      endpoint: '/api/bots/blaze/pragmatic/blaze-megarouletebr',
      description: 'Bot com estratégias avançadas de apostas'
    }
  ];

  useEffect(() => {
    checkCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser && autoRefresh) {
      loadBotsStatus();
      const interval = setInterval(loadBotsStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [currentUser, autoRefresh]);

  const checkCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  const loadBotsStatus = useCallback(async () => {
    if (!currentUser?.id) return;
    
    setLoading(true);
    const botStatuses: BotStatus[] = [];

    for (const config of botConfigs) {
      try {
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            action: 'get-websocket-logs'
          })
        });

        const result = await response.json();
        
        if (result.success && result.data) {
          botStatuses.push({
            id: config.id,
            name: config.name,
            endpoint: config.endpoint,
            description: config.description,
            connectionStatus: result.data.connectionStatus || { 
              connected: false, 
              lastUpdate: Date.now() 
            },
            operationStatus: {
              isOperating: result.data.isOperating || false,
              operationActive: result.data.operationActive || false,
              startedAt: result.data.startedAt,
              stats: result.data.stats
            },
            userInfo: {
              userId: currentUser.id,
              email: currentUser.email || 'N/A'
            },
            lastSevenResults: result.data.lastSevenResults || [],
            websocketLogs: (result.data.logs || []).slice(-10)
          });
        } else {
          botStatuses.push({
            id: config.id,
            name: config.name,
            endpoint: config.endpoint,
            description: config.description,
            connectionStatus: { 
              connected: false, 
              error: result.error || 'Erro desconhecido',
              lastUpdate: Date.now() 
            },
            operationStatus: {
              isOperating: false,
              operationActive: false
            },
            userInfo: {
              userId: currentUser.id,
              email: currentUser.email || 'N/A'
            }
          });
        }
      } catch (error) {
        botStatuses.push({
          id: config.id,
          name: config.name,
          endpoint: config.endpoint,
          description: config.description,
          connectionStatus: { 
            connected: false, 
            error: 'Erro de conexão',
            lastUpdate: Date.now() 
          },
          operationStatus: {
            isOperating: false,
            operationActive: false
          },
          userInfo: {
            userId: currentUser.id,
            email: currentUser.email || 'N/A'
          }
        });
      }
    }

    setBots(botStatuses);
    setLastUpdate(Date.now());
    setLoading(false);
  }, [currentUser]);

  const getBotStatusColor = (bot: BotStatus) => {
    if (bot.operationStatus.isOperating && bot.connectionStatus.connected) {
      return 'text-green-400 bg-green-500/20 border-green-500/30';
    }
    if (bot.connectionStatus.connected) {
      return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
    }
    return 'text-red-400 bg-red-500/20 border-red-500/30';
  };

  const getBotStatusText = (bot: BotStatus) => {
    if (bot.operationStatus.isOperating && bot.connectionStatus.connected) {
      return 'Operando';
    }
    if (bot.connectionStatus.connected) {
      return 'Conectado';
    }
    return 'Desconectado';
  };

  const getBotStatusIcon = (bot: BotStatus) => {
    if (bot.operationStatus.isOperating && bot.connectionStatus.connected) {
      return <Activity className="h-4 w-4" />;
    }
    if (bot.connectionStatus.connected) {
      return <Wifi className="h-4 w-4" />;
    }
    return <WifiOff className="h-4 w-4" />;
  };

  const formatDuration = (startTime: number) => {
    const duration = Date.now() - startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  // Header sem ações adicionais (igual em ambas as páginas)
  const additionalActions = null;

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader currentUser={currentUser} additionalActions={additionalActions} />

      {/* Conteúdo */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="space-y-6">
          {/* Estatísticas Globais */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/20 rounded-lg">
                    <Bot className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Total de Bots</p>
                    <p className="text-2xl font-bold text-white">{bots.length || botConfigs.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-500/20 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Conectados</p>
                    <p className="text-2xl font-bold text-white">
                      {bots.filter(b => b.connectionStatus.connected).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-yellow-500/20 rounded-lg">
                    <Activity className="h-6 w-6 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Operando</p>
                    <p className="text-2xl font-bold text-white">
                      {bots.filter(b => b.operationStatus.isOperating).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-500/20 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Com Erro</p>
                    <p className="text-2xl font-bold text-white">
                      {bots.filter(b => !b.connectionStatus.connected).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lista de Bots */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(bots.length > 0 ? bots : botConfigs.map(config => ({
              id: config.id,
              name: config.name,
              endpoint: config.endpoint,
              description: config.description,
              connectionStatus: { connected: false, lastUpdate: Date.now() },
              operationStatus: { isOperating: false, operationActive: false }
            } as BotStatus))).map((bot) => (
              <Card key={bot.id} className="bg-gray-900 border-gray-800">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getBotStatusIcon(bot)}
                      <div>
                        <CardTitle className="text-white text-lg">{bot.name}</CardTitle>
                        <CardDescription className="text-gray-400">
                          {bot.description || `Bot ID: ${bot.id}`}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className={`text-xs ${getBotStatusColor(bot)}`}>
                      {getBotStatusText(bot)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Status de Conexão */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">WebSocket:</span>
                      <span className={bot.connectionStatus.connected ? 'text-green-400' : 'text-red-400'}>
                        {bot.connectionStatus.connected ? 'Conectado' : 'Desconectado'}
                      </span>
                    </div>
                    {bot.connectionStatus.error && (
                      <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded">
                        {bot.connectionStatus.error}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Última atualização:</span>
                      <span className="text-gray-300">
                        {new Date(bot.connectionStatus.lastUpdate).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Status de Operação */}
                  {bot.operationStatus.isOperating && (
                    <div className="space-y-2 border-t border-gray-700 pt-4">
                      <h4 className="text-sm font-medium text-white flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-400" />
                        Operação Ativa
                      </h4>
                      {bot.operationStatus.startedAt && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Duração:</span>
                          <span className="text-green-400 font-mono">
                            {formatDuration(bot.operationStatus.startedAt)}
                          </span>
                        </div>
                      )}
                      {bot.operationStatus.stats && (
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-gray-400">Apostas:</span>
                            <span className="text-white ml-2">{bot.operationStatus.stats.totalBets}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Vitórias:</span>
                            <span className="text-green-400 ml-2">{bot.operationStatus.stats.wins}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Derrotas:</span>
                            <span className="text-red-400 ml-2">{bot.operationStatus.stats.losses}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Lucro:</span>
                            <span className={`ml-2 ${bot.operationStatus.stats.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              R$ {bot.operationStatus.stats.profit.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Últimos Resultados */}
                  {bot.lastSevenResults && bot.lastSevenResults.length > 0 && (
                    <div className="space-y-2 border-t border-gray-700 pt-4">
                      <h4 className="text-sm font-medium text-white">Últimos Resultados</h4>
                      <div className="flex gap-1 flex-wrap">
                        {bot.lastSevenResults.slice(-7).map((result, index) => (
                          <div
                            key={`${result.gameId}-${index}`}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                              result.color === 'red' ? 'bg-red-500 text-white' :
                              result.color === 'black' ? 'bg-gray-800 text-white border border-gray-600' :
                              'bg-green-500 text-white'
                            }`}
                          >
                            {result.number}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Últimos Logs */}
                  {bot.websocketLogs && bot.websocketLogs.length > 0 && (
                    <div className="space-y-2 border-t border-gray-700 pt-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-white">Últimos Logs</h4>
                        <Button
                          onClick={() => setSelectedBot(selectedBot === bot.id ? null : bot.id)}
                          variant="outline"
                          size="sm"
                          className="text-xs px-2 py-1 h-6"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                      {selectedBot === bot.id && (
                        <div className="space-y-1 max-h-32 overflow-y-auto bg-gray-800/50 p-2 rounded text-xs">
                          {bot.websocketLogs.slice(-5).map((log, index) => (
                            <div
                              key={`${log.timestamp}-${index}`}
                              className={`text-xs ${
                                log.type === 'error' ? 'text-red-400' :
                                log.type === 'success' ? 'text-green-400' :
                                log.type === 'game' ? 'text-blue-400' :
                                'text-gray-300'
                              }`}
                            >
                              <span className="text-gray-500">
                                {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                              </span>
                              {' '}
                              {log.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Informações do Usuário */}
                  <div className="border-t border-gray-700 pt-4 text-xs">
                    {bot.userInfo && (
                      <div className="flex items-center gap-2 text-gray-400 mb-1">
                        <Users className="h-3 w-3" />
                        <span>Usuário: {bot.userInfo.email}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-400">
                      <Clock className="h-3 w-3" />
                      <span>
                        {bots.length > 0 
                          ? `Última verificação: ${new Date(lastUpdate).toLocaleTimeString('pt-BR')}`
                          : 'Aguardando configuração...'
                        }
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-8 text-center">
              <Bot className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Sistema de Monitoramento de Bots</p>
              <p className="text-gray-500 text-sm mt-2">
                Esta página monitora o status em tempo real dos bots WebSocket ativos
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
} 