'use client'

/**
 * 🧪 MODAL ATUALIZADO PARA BMG2
 * 
 * Modal de seleção de stake atualizado com os novos valores de martingale:
 * - Nova sequência M1-M10: [20.00, 20.00, 21.00, 4.00, 2.50, 2.50, 2.00, 1.50, 1.00, 0.50]
 * - Multiplicadores: 1x(R$20), 3x(R$60), 6x(R$120), 10x(R$200)
 * - Bancas ideais ajustadas: 200, 600, 1200, 2000
 */

import Modal from '@/components/ui/modal'
import { useState } from 'react'

interface MartingaleSequence {
  level: number
  value: number
}

interface StrategyInfo {
  tip: number
  multiplier: number
  sequence: MartingaleSequence[]
  bancaIdeal: number
  totalInvestment: number
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
  const [selectedMultiplier, setSelectedMultiplier] = useState<number>(1)

  // Multiplicadores disponíveis - VALORES ATUALIZADOS BMG2
  const multiplierOptions = [
    { value: 1, baseValue: 20.00 },
    { value: 3, baseValue: 60.00 },
    { value: 6, baseValue: 120.00 },
    { value: 10, baseValue: 200.00 }
  ]

  // Nova sequência base M1-M10 - VALORES ATUALIZADOS BMG2
  const baseSequence = [20.00, 20.00, 21.00, 4.00, 2.50, 2.50, 2.00, 1.50, 1.00, 0.50]

  // Gerar estratégia com multiplicador
  const getStrategy = (multiplier: number): StrategyInfo => {
    const sequence: MartingaleSequence[] = baseSequence.map((value, index) => ({
      level: index + 1,
      value: value * multiplier
    }))

         const totalInvestment = sequence.reduce((sum, item) => sum + item.value, 0)
     // Banca ideal com valores ajustados para nova sequência BMG2
     const bancaIdeal = multiplier === 1 ? 200 : 
                       multiplier === 3 ? 600 :
                       multiplier === 6 ? 1200 :
                       multiplier === 10 ? 2000 :
                       Math.ceil(totalInvestment * 2.5)

    return {
      tip: 20.00 * multiplier, // Valor inicial M1 * multiplicador
      multiplier,
      sequence,
      bancaIdeal,
      totalInvestment
    }
  }

  const handleConfirm = () => {
    if (selectedMultiplier) {
      const strategy = getStrategy(selectedMultiplier)
      onConfirm(strategy.tip)
    }
  }

  const getStrategyColor = (multiplier: number) => {
    switch (multiplier) {
      case 1: return 'green'
      case 3: return 'blue'
      case 6: return 'purple'
      case 10: return 'orange'
      default: return 'gray'
    }
  }

  const getRiskLevel = (multiplier: number) => {
    const option = multiplierOptions.find(opt => opt.value === multiplier)
    const riskLabel = multiplier === 1 ? 'Conservadora' :
                     multiplier === 3 ? 'Moderada' :
                     multiplier === 6 ? 'Agressiva' :
                     multiplier === 10 ? 'Máxima' : 'Desconhecida'
    return option ? `${riskLabel}: R$ ${option.baseValue.toFixed(2)}` : 'Estratégia desconhecida'
  }

  const selectedStrategyData = selectedMultiplier ? getStrategy(selectedMultiplier) : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="SELECIONAR_STAKE"
      description="Escolha o valor da aposta inicial"
      type="info"
      size="sm"
      actions={{
        primary: {
          label: 'CONFIRMAR',
          onClick: handleConfirm,
          loading: loading,
          disabled: !selectedMultiplier
        },
        secondary: {
          label: 'CANCELAR',
          onClick: onClose
        }
      }}
    >
      <div className="space-y-4">
        {/* Botões de multiplicadores */}
        <div>
          <div className="grid grid-cols-2 gap-3">
            {multiplierOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedMultiplier(option.value)}
                className={`p-4 rounded-lg border transition-all duration-200 text-center ${
                  selectedMultiplier === option.value
                    ? `border-${getStrategyColor(option.value)}-500 bg-${getStrategyColor(option.value)}-500/10 text-${getStrategyColor(option.value)}-400`
                    : 'border-gray-600 hover:border-gray-500 text-gray-300 hover:text-gray-200'
                }`}
              >
                <div className="text-lg font-mono font-bold">
                  R$ {option.baseValue.toFixed(2)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Preview da estratégia selecionada */}
        {selectedMultiplier && selectedStrategyData && (
          <div className="space-y-3">
            <div className="p-4 bg-gray-800/30 border border-gray-600 rounded-lg">
              <div className="text-center">
                <div className="text-sm font-mono text-gray-400 mb-1">BANCA_IDEAL:</div>
                <div className={`text-xl font-mono font-bold text-${getStrategyColor(selectedMultiplier)}-400`}>
                  R$ {selectedStrategyData.bancaIdeal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
} 