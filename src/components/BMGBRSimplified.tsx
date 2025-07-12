'use client';

import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, Settings, Target } from 'lucide-react';
import { useBMGBRState } from '@/hooks/useBMGBRState';
import { useBMGBROperations } from '@/hooks/useBMGBROperations';
import { useNotifications } from './BMGBRNotificationSystem';

export default function BMGBRSimplified() {
  const { 
    state, 
    setOperating, 
    setOperationError, 
    setOperationSuccess,
    setSelectedStake,
    setConnectionStatus,
    setWebsocketLogs,
    setLastTenResults 
  } = useBMGBRState();

  const { showSuccess, showError, showWarning, showInfo } = useNotifications();

  const operations = useBMGBROperations({
    onSuccess: (message) => {
      showSuccess('Sucesso', message);
      setOperationSuccess(message);
    },
    onError: (error) => {
      showError('Erro', error);
      setOperationError(error);
    },
    onStatusChange: (status) => {
      setOperating(status.operating);
      setConnectionStatus({
        connected: status.connected,
        lastUpdate: Date.now()
      });
    }
  });

  const handleStartOperation = async () => {
    if (state.selectedStake < 0.5) {
      showWarning('Atenção', 'Configure uma stake mínima de R$ 0,50 primeiro');
      return;
    }

    setOperationError(null);
    setOperationSuccess(null);

    const result = await operations.startOperation(state.selectedStake, state.m4DirectBetType);
    
    if (result.success) {
      setOperating(true);
      // Iniciar monitoramento
      setTimeout(() => {
        operations.startMonitoring();
      }, 1000);
    }
  };

  const handleStopOperation = async () => {
    const result = await operations.stopOperation();
    
    if (result.success) {
      setOperating(false);
    }
  };

  const STAKE_OPTIONS = [0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="text-center py-8">
          <h1 className="text-4xl font-bold font-mono text-green-400">BMGBR</h1>
          <p className="text-gray-400 font-mono mt-2">Sistema de Apostas Automatizado</p>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Card de Status */}
          <Card className="border-blue-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-400 font-mono">
                <Target className="h-5 w-5" />
                STATUS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400 font-mono text-sm">Operação:</span>
                  <span className={`font-mono text-sm ${state.isOperating ? 'text-green-400' : 'text-gray-500'}`}>
                    {state.isOperating ? 'ATIVA' : 'INATIVA'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 font-mono text-sm">Conexão:</span>
                  <span className={`font-mono text-sm ${state.connectionStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                    {state.connectionStatus.connected ? 'CONECTADO' : 'DESCONECTADO'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 font-mono text-sm">Modo:</span>
                  <span className="text-yellow-400 font-mono text-sm">M4 DIRETO</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card de Configuração */}
          <Card className="border-purple-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
                <Settings className="h-5 w-5" />
                CONFIGURAÇÃO
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-mono text-gray-300 mb-2 block">
                    Stake Selecionada
                  </label>
                  <select
                    value={state.selectedStake}
                    onChange={(e) => setSelectedStake(Number(e.target.value))}
                    className="w-full p-2 bg-gray-800 border border-gray-600 rounded font-mono text-sm"
                    disabled={state.isOperating}
                  >
                    {STAKE_OPTIONS.map(stake => (
                      <option key={stake} value={stake}>
                        R$ {stake.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-mono text-gray-300 mb-2 block">
                    Tipo de Aposta
                  </label>
                  <select
                    value={state.m4DirectBetType}
                    onChange={(e) => {
                      // Dispatch manual já que não temos setter direto
                      // state.dispatch({ type: 'SET_M4_DIRECT_BET_TYPE', payload: e.target.value as any });
                    }}
                    className="w-full p-2 bg-gray-800 border border-gray-600 rounded font-mono text-sm"
                    disabled={state.isOperating}
                  >
                    <option value="red">Vermelho</option>
                    <option value="black">Preto</option>
                    <option value="even">Par</option>
                    <option value="odd">Ímpar</option>
                    <option value="low">Baixas (1-18)</option>
                    <option value="high">Altas (19-36)</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card de Sequência Martingale */}
          <Card className="border-green-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
                SEQUÊNCIA MARTINGALE
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {state.martingaleSequence.map((value, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-gray-400 font-mono text-sm">M{index + 1}:</span>
                    <span className="text-green-400 font-mono text-sm">
                      R$ {value.toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-gray-600 pt-2 mt-2">
                  <div className="flex justify-between font-bold">
                    <span className="text-gray-300 font-mono text-sm">Total:</span>
                    <span className="text-yellow-400 font-mono text-sm">
                      R$ {state.totalMartingaleAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controles */}
        <Card className="border-gray-500/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-center text-white font-mono">CONTROLES</CardTitle>
            <CardDescription className="text-center text-gray-400 font-mono">
              Iniciar ou parar operação
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center gap-4">
              <Button
                onClick={handleStartOperation}
                disabled={state.isOperating || state.operationLoading}
                className="bg-green-600 hover:bg-green-700 font-mono"
                size="lg"
              >
                <Play className="h-5 w-5 mr-2" />
                {state.operationLoading ? 'Conectando...' : 'INICIAR'}
              </Button>

              <Button
                onClick={handleStopOperation}
                disabled={!state.isOperating}
                className="bg-red-600 hover:bg-red-700 font-mono"
                size="lg"
              >
                <Square className="h-5 w-5 mr-2" />
                PARAR
              </Button>
            </div>

            {/* Mensagens de Status */}
            {state.operationError && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded">
                <p className="text-red-400 font-mono text-sm text-center">{state.operationError}</p>
              </div>
            )}

            {state.operationSuccess && (
              <div className="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded">
                <p className="text-green-400 font-mono text-sm text-center">{state.operationSuccess}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Logs */}
        {state.websocketLogs.length > 0 && (
          <Card className="border-gray-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white font-mono">LOGS DA OPERAÇÃO</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {state.websocketLogs.slice(-20).map((log, index) => (
                  <div key={index} className="font-mono text-xs">
                    <span className="text-gray-400">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`ml-2 ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'game' ? 'text-yellow-400' :
                      'text-gray-300'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
} 