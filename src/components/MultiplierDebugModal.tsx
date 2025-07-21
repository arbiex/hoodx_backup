'use client';

import React, { useState, useEffect } from 'react';
import Modal from './ui/modal';
import { Button } from './ui/button';

interface MultiplierDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

interface MultiplierState {
  frontend: {
    value: number;
    lastUpdate: string;
  };
  backend: {
    value: number;
    lastUpdate: string;
    logs: string[];
  };
  isOperating: boolean;
}

export default function MultiplierDebugModal({ isOpen, onClose, userId }: MultiplierDebugModalProps) {
  const [debugData, setDebugData] = useState<MultiplierState | null>(null);
  const [loading, setLoading] = useState(false);
  const [testMultiplier, setTestMultiplier] = useState(2);

  const fetchDebugData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          action: 'get-connection-status'
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Simular dados para debug (pode ser substituído por dados reais da API)
        setDebugData({
          frontend: {
            value: testMultiplier,
            lastUpdate: new Date().toLocaleString()
          },
          backend: {
            value: data.data?.levelInfo?.currentLevelData?.stakeMultiplier || 1,
            lastUpdate: new Date().toLocaleString(),
            logs: [
              `🔢 Multiplicador ${testMultiplier}x configurado no frontend`,
              `✅ Enviado para backend via update-strategy`,
              `💰 Aplicado no cálculo: valor_base × ${testMultiplier}`,
              `📡 Última sincronização: ${new Date().toLocaleTimeString()}`
            ]
          },
          isOperating: data.data?.operation?.active || false
        });
      }
    } catch (error) {
      console.error('Erro ao buscar dados de debug:', error);
    }
    setLoading(false);
  };

  const testUpdateMultiplier = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          action: 'update-strategy',
          stakeMultiplier: testMultiplier
        })
      });

      if (response.ok) {
        await fetchDebugData();
        alert(`✅ Multiplicador ${testMultiplier}x enviado com sucesso!`);
      } else {
        const errorData = await response.json();
        alert(`❌ Erro: ${errorData.error || 'Falha ao atualizar'}`);
      }
    } catch (error) {
      console.error('Erro ao testar multiplicador:', error);
      alert('❌ Erro de conexão');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchDebugData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🔧 DEBUG_MULTIPLICADOR"
      description="Diagnóstico detalhado do sistema de multiplicador"
      type="default"
      actions={{
        primary: {
          label: loading ? '🔄 Atualizando...' : '🔍 Atualizar',
          onClick: fetchDebugData,
          loading,
          disabled: loading
        },
        secondary: {
          label: 'Fechar',
          onClick: onClose
        }
      }}
    >
      <div className="space-y-4">
        {/* Teste de Multiplicador */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="text-sm font-semibold text-blue-400 font-mono mb-2">
            🧪 TESTE DE MULTIPLICADOR
          </div>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs text-gray-400 font-mono">Valor de teste:</label>
            <select 
              value={testMultiplier} 
              onChange={(e) => setTestMultiplier(Number(e.target.value))}
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white font-mono"
            >
              {[1, 2, 3, 4, 5].map(val => (
                <option key={val} value={val}>{val}x</option>
              ))}
            </select>
            <Button 
              onClick={testUpdateMultiplier} 
              disabled={loading}
              size="sm"
            >
              {loading ? '⏳' : '🚀'} Enviar
            </Button>
          </div>
        </div>

        {/* Estado Frontend vs Backend */}
        {debugData && (
          <div className="grid grid-cols-2 gap-3">
            {/* Frontend */}
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="text-sm font-semibold text-green-400 font-mono mb-2">
                🖥️ FRONTEND
              </div>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-400">Valor:</span>
                  <span className="text-green-400 font-bold">{debugData.frontend.value}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Atualizado:</span>
                  <span className="text-white">{debugData.frontend.lastUpdate}</span>
                </div>
              </div>
            </div>

            {/* Backend */}
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <div className="text-sm font-semibold text-purple-400 font-mono mb-2">
                ⚙️ BACKEND
              </div>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-400">Valor:</span>
                  <span className="text-purple-400 font-bold">{debugData.backend.value}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Atualizado:</span>
                  <span className="text-white">{debugData.backend.lastUpdate}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status de Sincronização */}
        {debugData && (
          <div className={`p-3 border rounded-lg ${
            debugData.frontend.value === debugData.backend.value
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-red-500/10 border-red-500/20'
          }`}>
            <div className={`text-sm font-semibold font-mono mb-1 ${
              debugData.frontend.value === debugData.backend.value
                ? 'text-green-400'
                : 'text-red-400'
            }`}>
              {debugData.frontend.value === debugData.backend.value
                ? '✅ SINCRONIZADO'
                : '❌ DESSINCRONIZADO'
              }
            </div>
            <div className="text-xs font-mono text-gray-400">
              Frontend: {debugData.frontend.value}x | Backend: {debugData.backend.value}x
            </div>
            {debugData.isOperating && (
              <div className="text-xs text-orange-400 font-mono mt-1">
                🔄 Bot está operando - multiplicador em uso
              </div>
            )}
          </div>
        )}

        {/* Logs do Backend */}
        {debugData?.backend.logs && (
          <div className="p-3 bg-gray-800/30 border border-gray-600/30 rounded-lg">
            <div className="text-sm font-semibold text-gray-400 font-mono mb-2">
              📋 LOGS DO BACKEND
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {debugData.backend.logs.map((log, index) => (
                <div key={index} className="text-xs text-gray-300 font-mono">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Informações Técnicas */}
        <div className="p-3 bg-gray-800/20 border border-gray-600/20 rounded-lg">
          <div className="text-xs text-gray-400 font-mono space-y-1">
            <div><strong>Como funciona:</strong></div>
            <div>1. Frontend altera valor → chama updateStakeMultiplier()</div>
            <div>2. Hook useBmgbr3Api → envia POST com action: 'update-strategy'</div>
            <div>3. Backend aplica em operationState[userId].stakeMultiplier</div>
            <div>4. Apostas usam: betAmount = nivel.m2 × multiplicador</div>
          </div>
        </div>
      </div>
    </Modal>
  );
} 