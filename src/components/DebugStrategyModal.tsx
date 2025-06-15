'use client'

import Modal from '@/components/ui/modal'
import { useState, useEffect } from 'react'

interface MartingaleStrategy {
  id: number
  name: string
  base_bet: number
  profit_increment: number
  max_attempts: number
  description: string
  is_active: boolean
  sequences: Array<{
    attempt_number: number
    bet_amount: number
    total_invested: number
    expected_return: number
    expected_profit: number
  }>
}

interface DebugStrategyModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (strategyName: string) => void
  loading?: boolean
}

export default function DebugStrategyModal({ isOpen, onClose, onConfirm, loading = false }: DebugStrategyModalProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null)
  const [strategies, setStrategies] = useState<MartingaleStrategy[]>([])
  const [loadingData, setLoadingData] = useState(false)

  // Carregar dados reais do Supabase quando modal abrir
  useEffect(() => {
    if (isOpen && strategies.length === 0) {
      loadMartingaleStrategies()
    }
  }, [isOpen])

  const loadMartingaleStrategies = async () => {
    setLoadingData(true)
    try {
      const { supabase } = await import('@/lib/supabase')
      
      // Chamar a RPC para buscar estratégias
      const { data, error } = await supabase.rpc('get_martingale_strategies')

      if (error) {
        console.error('Erro ao carregar estratégias:', error)
        return
      }

      if (data) {
        console.log('🎯 [DEBUG-STRATEGY] Estratégias carregadas:', data)
        setStrategies(data)
      }
    } catch (error) {
      console.error('Erro ao carregar estratégias de martingale:', error)
    } finally {
      setLoadingData(false)
    }
  }

  const handleConfirm = () => {
    if (selectedStrategy) {
      console.log('🎯 [DEBUG-STRATEGY] Estratégia selecionada:', selectedStrategy)
      onConfirm(selectedStrategy)
    }
  }

  const getStrategyColor = (name: string) => {
    switch (name) {
      case '2': return 'green'
      case '5': return 'blue'
      case '10': return 'orange'
      case '20': return 'red'
      default: return 'gray'
    }
  }

  const getRiskLevel = (name: string) => {
    switch (name) {
      case '2': return 'Baixo risco'
      case '5': return 'Risco médio'
      case '10': return 'Alto risco'
      case '20': return 'Risco extremo'
      default: return 'Risco desconhecido'
    }
  }

  const selectedStrategyData = strategies.find(s => s.name === selectedStrategy)
  const maxInvestment = selectedStrategyData?.sequences[selectedStrategyData.sequences.length - 1]?.total_invested || 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="SELECIONAR_ESTRATÉGIA"
      description="Escolha a estratégia de progressão martingale"
      type="info"
      size="sm"
      actions={{
        primary: {
          label: 'CONFIRMAR',
          onClick: handleConfirm,
          loading: loading,
          disabled: !selectedStrategy
        },
        secondary: {
          label: 'CANCELAR',
          onClick: onClose
        }
      }}
    >
      <div className="space-y-3">
        {loadingData ? (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-3 text-blue-400 font-mono text-sm">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span>CARREGANDO_ESTRATÉGIAS...</span>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
            </div>
          </div>
        ) : (
          <>
            {/* Botões de estratégia */}
            <div className="grid grid-cols-2 gap-2">
              {strategies.map((strategy) => {
                const color = getStrategyColor(strategy.name)
                return (
                  <button
                    key={strategy.id}
                    onClick={() => setSelectedStrategy(strategy.name)}
                    className={`p-3 rounded-lg border transition-all duration-200 text-center ${
                      selectedStrategy === strategy.name
                        ? `border-${color}-500 bg-${color}-500/10 text-${color}-400`
                        : 'border-gray-600 hover:border-gray-500 text-gray-300 hover:text-gray-200'
                    }`}
                  >
                    <div className="text-sm font-mono font-semibold">
                      {strategy.name}
                    </div>
                    <div className="text-xs font-mono text-gray-500 mt-1">
                      R$ {strategy.base_bet.toFixed(2)}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Preview da estratégia selecionada */}
            {selectedStrategy && selectedStrategyData && (
              <div className="space-y-3">
                <div className="p-3 bg-gray-800/30 border border-gray-600 rounded-lg">
                  <div className="text-center mb-3">
                    <div className="text-sm font-mono text-gray-400 mb-1">BANCA_IDEAL:</div>
                    <div className={`text-lg font-mono font-bold text-${getStrategyColor(selectedStrategy)}-400`}>
                      R$ {maxInvestment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs font-mono text-gray-500 mt-1">
                      {getRiskLevel(selectedStrategy)}
                    </div>
                  </div>
                  
                  <div className="text-xs font-mono text-gray-400 mb-2">DESCRIÇÃO:</div>
                  <div className="text-xs font-mono text-gray-300 mb-3">
                    {selectedStrategyData.description}
                  </div>
                  
                  <div className="text-xs font-mono text-gray-400 mb-2">SEQUÊNCIA_APOSTAS:</div>
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    {selectedStrategyData.sequences.slice(0, 8).map((seq, index) => (
                      <div 
                        key={seq.attempt_number}
                        className={`p-1 rounded text-center font-mono ${
                          index === 0 ? 'bg-green-500/20 text-green-400' :
                          index < 3 ? 'bg-yellow-500/20 text-yellow-400' :
                          index < 6 ? 'bg-orange-500/20 text-orange-400' :
                          'bg-red-500/20 text-red-400'
                        }`}
                      >
                        <div className="text-xs">#{seq.attempt_number}</div>
                        <div className="font-semibold">R$ {seq.bet_amount.toFixed(0)}</div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-3 pt-2 border-t border-gray-600">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-gray-400">LUCRO_POR_VITÓRIA:</span>
                      <span className="text-green-400">+R$ {selectedStrategyData.profit_increment.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-gray-400">MAX_TENTATIVAS:</span>
                      <span className="text-blue-400">{selectedStrategyData.max_attempts}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
} 