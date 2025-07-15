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
    dispatch,
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

  // 💰 40 Evoluções de Stake predefinidas com M1 e M2
  const STAKE_EVOLUTIONS = [
    { id: 1, m1: 1.00, m2: 2.00 },
    { id: 2, m1: 1.00, m2: 3.00 },
    { id: 3, m1: 2.00, m2: 4.00 },
    { id: 4, m1: 3.00, m2: 5.00 },
    { id: 5, m1: 4.00, m2: 6.00 },
    { id: 6, m1: 5.00, m2: 9.00 },
    { id: 7, m1: 6.00, m2: 13.00 },
    { id: 8, m1: 7.00, m2: 18.00 },
    { id: 9, m1: 8.00, m2: 24.00 },
    { id: 10, m1: 9.00, m2: 31.00 },
    { id: 11, m1: 10.00, m2: 39.00 },
    { id: 12, m1: 11.00, m2: 48.00 },
    { id: 13, m1: 12.00, m2: 58.00 },
    { id: 14, m1: 13.00, m2: 69.00 },
    { id: 15, m1: 14.00, m2: 81.00 },
    { id: 16, m1: 15.00, m2: 94.00 },
    { id: 17, m1: 16.00, m2: 108.00 },
    { id: 18, m1: 17.00, m2: 123.00 },
    { id: 19, m1: 18.00, m2: 139.00 },
    { id: 20, m1: 19.00, m2: 156.00 },
    { id: 21, m1: 20.00, m2: 174.00 },
    { id: 22, m1: 21.00, m2: 193.00 },
    { id: 23, m1: 22.00, m2: 213.00 },
    { id: 24, m1: 23.00, m2: 234.00 },
    { id: 25, m1: 24.00, m2: 256.00 },
    { id: 26, m1: 25.00, m2: 279.00 },
    { id: 27, m1: 26.00, m2: 303.00 },
    { id: 28, m1: 27.00, m2: 328.00 },
    { id: 29, m1: 28.00, m2: 354.00 },
    { id: 30, m1: 29.00, m2: 381.00 },
    { id: 31, m1: 30.00, m2: 409.00 },
    { id: 32, m1: 31.00, m2: 439.00 },
    { id: 33, m1: 32.00, m2: 470.00 },
    { id: 34, m1: 33.00, m2: 502.00 },
    { id: 35, m1: 34.00, m2: 535.00 },
    { id: 36, m1: 35.00, m2: 569.00 },
    { id: 37, m1: 36.00, m2: 604.00 },
    { id: 38, m1: 37.00, m2: 640.00 },
    { id: 39, m1: 38.00, m2: 677.00 },
    { id: 40, m1: 39.00, m2: 715.00 }
  ];

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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const currentEvolution = STAKE_EVOLUTIONS.find(e => e.m1 === state.selectedStake);
                        const currentIndex = currentEvolution ? STAKE_EVOLUTIONS.indexOf(currentEvolution) : 0;
                        const newIndex = Math.max(0, currentIndex - 1);
                        setSelectedStake(STAKE_EVOLUTIONS[newIndex].m1);
                      }}
                      disabled={state.isOperating}
                      className="w-8 h-8 bg-gray-700 border border-gray-600 rounded text-gray-300 font-bold text-sm hover:bg-gray-600 disabled:opacity-50"
                    >
                      -
                    </button>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={`R$ ${state.selectedStake.toFixed(2)}`}
                        readOnly
                        className="w-full p-2 bg-gray-800 border border-gray-600 rounded font-mono text-sm text-center"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const currentEvolution = STAKE_EVOLUTIONS.find(e => e.m1 === state.selectedStake);
                        const currentIndex = currentEvolution ? STAKE_EVOLUTIONS.indexOf(currentEvolution) : 0;
                        const newIndex = Math.min(STAKE_EVOLUTIONS.length - 1, currentIndex + 1);
                        setSelectedStake(STAKE_EVOLUTIONS[newIndex].m1);
                      }}
                      disabled={state.isOperating}
                      className="w-8 h-8 bg-gray-700 border border-gray-600 rounded text-gray-300 font-bold text-sm hover:bg-gray-600 disabled:opacity-50"
                    >
                      +
                    </button>
                  </div>
                  
                  {/* Informações M1 e M2 */}
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono text-gray-400">
                    <div>
                      M1: <span className="text-white">R$ {state.selectedStake.toFixed(2)}</span>
                    </div>
                    <div>
                      M2: <span className="text-white">R$ {(STAKE_EVOLUTIONS.find(e => e.m1 === state.selectedStake)?.m2 || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-mono text-gray-300 mb-2 block">
                    Tipo de Aposta
                  </label>
                  <select
                    value={state.m4DirectBetType}
                    onChange={(e) => {
                      dispatch({ type: 'SET_M4_DIRECT_BET_TYPE', payload: e.target.value as typeof state.m4DirectBetType });
                    }}
                    className="w-full p-2 bg-gray-800 border border-gray-600 rounded font-mono text-sm"
                    disabled={state.isOperating}
                  >
                    <option value="await">Aguardar</option>
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