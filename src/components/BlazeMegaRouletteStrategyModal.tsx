'use client'

import Modal from '@/components/ui/modal'
import { useState } from 'react'

interface MartingaleSequence {
  level: number
  value: number
}

interface StrategyInfo {
  tip: number
  sequence: MartingaleSequence[]
  bancaIdeal: number
}

interface BlazeMegaRouletteStrategyModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (tipValue: number) => void
  loading?: boolean
}

export default function BlazeMegaRouletteStrategyModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  loading = false 
}: BlazeMegaRouletteStrategyModalProps) {
  const [selectedTip, setSelectedTip] = useState<number | null>(1.5)

  // Valor fixo para estratégia 1.5
  const tipOptions = [1.5]

  // Estratégia 1.5 com valores fixos e lucro constante
  const getStrategy15 = (): StrategyInfo => {
    // Sequência M1-M10 com lucro fixo de R$ 1,50
    const sequence: MartingaleSequence[] = [
      { level: 1, value: 1.50 },
      { level: 2, value: 3.00 },
      { level: 3, value: 6.00 },
      { level: 4, value: 12.00 },
      { level: 5, value: 24.00 },
      { level: 6, value: 48.00 },
      { level: 7, value: 96.00 },
      { level: 8, value: 192.00 },
      { level: 9, value: 384.00 },
      { level: 10, value: 768.00 }
    ]

    // Banca ideal: soma total dos valores
    const somaTotal = sequence.reduce((sum, item) => sum + item.value, 0)
    const bancaIdeal = Math.ceil(somaTotal) // R$ 1.535,00 (arredondado)

    return {
      tip: 1.5,
      sequence,
      bancaIdeal
    }
  }

  const handleConfirm = () => {
    if (selectedTip) {
  
      onConfirm(selectedTip)
    }
  }

  const getStrategyColor = (tipValue: number) => {
    if (tipValue === 1.5) return 'green'
    return 'gray'
  }

  const getRiskLevel = (tipValue: number) => {
    if (tipValue === 1.5) return 'Lucro fixo R$ 1,50'
    return 'Estratégia desconhecida'
  }

  const selectedStrategyData = selectedTip ? getStrategy15() : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="SELECIONAR_ESTRATÉGIA"
      description="Escolha o valor da aposta inicial"
      type="info"
      size="sm"
      actions={{
        primary: {
          label: 'CONFIRMAR',
          onClick: handleConfirm,
          loading: loading,
          disabled: !selectedTip
        },
        secondary: {
          label: 'CANCELAR',
          onClick: onClose
        }
      }}
    >
      <div className="space-y-4">
        {/* Botão de estratégia única */}
        <div>
          <div className="text-xs font-mono text-gray-400 mb-2">ESTRATÉGIA_DISPONÍVEL:</div>
          <div className="flex justify-center">
            <button
              onClick={() => setSelectedTip(1.5)}
              className={`p-4 rounded-lg border transition-all duration-200 text-center min-w-[200px] ${
                selectedTip === 1.5
                  ? 'border-green-500 bg-green-500/10 text-green-400'
                  : 'border-gray-600 hover:border-gray-500 text-gray-300 hover:text-gray-200'
              }`}
            >
              <div className="text-lg font-mono font-bold">
                1.5
              </div>
              <div className="text-xs font-mono text-gray-400">
                Lucro fixo R$ 1,50
              </div>
            </button>
          </div>
        </div>

        {/* Preview da estratégia selecionada */}
        {selectedTip && selectedStrategyData && (
          <div className="space-y-3">
            <div className="p-4 bg-gray-800/30 border border-gray-600 rounded-lg">
              <div className="text-center mb-4">
                <div className="text-sm font-mono text-gray-400 mb-1">BANCA_IDEAL:</div>
                <div className={`text-xl font-mono font-bold text-${getStrategyColor(selectedTip)}-400`}>
                  R$ {selectedStrategyData.bancaIdeal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs font-mono text-gray-500">
                  {getRiskLevel(selectedTip)} • 10 níveis de martingale
                </div>
              </div>

              {/* Informações sobre lucro fixo */}
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="text-center">
                  <div className="text-sm font-mono text-green-400 font-bold mb-1">
                    LUCRO GARANTIDO
                  </div>
                  <div className="text-lg font-mono font-bold text-green-400">
                    R$ 1,50
                  </div>
                  <div className="text-xs font-mono text-gray-400 mt-1">
                    em qualquer nível de acerto (M1 até M10)
                  </div>
                </div>
              </div>

              {/* Sequência de valores */}
              <div className="mt-3">
                <div className="text-xs font-mono text-gray-400 mb-2">SEQUÊNCIA_MARTINGALE:</div>
                <div className="grid grid-cols-5 gap-2 text-xs font-mono">
                  {selectedStrategyData.sequence.map((item) => (
                    <div key={item.level} className="text-center p-2 bg-gray-700/30 rounded border border-gray-600/30">
                      <div className="text-gray-400">M{item.level}</div>
                      <div className="text-green-400 font-bold">R$ {item.value.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
} 