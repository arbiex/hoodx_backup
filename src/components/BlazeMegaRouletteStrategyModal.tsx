'use client'

/**
 * 🧪 MODAL DINÂMICO PARA DIFERENTES ESTRATÉGIAS
 * 
 * Modal de seleção de stake que adapta-se automaticamente às diferentes sequências:
 * - BMG/BOTS: [1.50, 3.00, 6.00, 12.50, 25.50, 51.50, 103.50, 207.50, 415.50, 831.50]
 * - BMG2/BOTS2: [20.00, 20.00, 21.00, 4.00, 2.50, 2.50, 2.00, 1.50, 1.00, 0.50]
 * - BMGBR: [20.00, 20.00, 21.00, 4.00, 2.50, 2.50, 2.00, 1.50, 1.00, 0.50]
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
  // ✅ NOVA PROP: Sequência de martingales específica da estratégia
  martingaleSequence?: number[]
  // ✅ NOVA PROP: Nome da estratégia para personalização
  strategyName?: string
}

export default function BlazeMegaRouletteStrategyModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  loading = false,
  martingaleSequence = [1.50, 3.00, 6.00, 12.50, 25.50, 51.50, 103.50, 207.50, 415.50, 831.50], // Default BMG
  strategyName = 'BMG'
}: BlazeMegaRouletteStrategyModalProps) {
  const [selectedMultiplier, setSelectedMultiplier] = useState<number>(1)

  // ✅ MULTIPLICADORES DINÂMICOS baseados na primeira aposta da sequência
  const baseValue = martingaleSequence[0] // M1 da sequência
  
  const multiplierOptions = [
    { value: 1, baseValue: baseValue * 1 },
    { value: 3, baseValue: baseValue * 3 },
    { value: 6, baseValue: baseValue * 6 },
    { value: 10, baseValue: baseValue * 10 }
  ]

  // ✅ BANCA IDEAL DINÂMICA baseada na sequência total
  const calculateBancaIdeal = (multiplier: number): number => {
    const totalSequenceValue = martingaleSequence.reduce((sum, value) => sum + value, 0) * multiplier
    
    // Diferentes estratégias de banca ideal
    if (strategyName === 'BMG' || strategyName === 'BLAZE_MEGA_ROULETTE') {
      // BMG/BOTS: Simplesmente a soma total M1-M10 arredondada para cima
      return Math.ceil(totalSequenceValue)
    } else {
      // BMG2/BMGBR: Sequência personalizada com valores fixos
      return multiplier === 1 ? 200 : 
             multiplier === 3 ? 600 :
             multiplier === 6 ? 1200 :
             multiplier === 10 ? 2000 :
             Math.ceil(totalSequenceValue * 2.5)
    }
  }

  // Gerar estratégia com multiplicador
  const getStrategy = (multiplier: number): StrategyInfo => {
    const sequence: MartingaleSequence[] = martingaleSequence.map((value, index) => ({
      level: index + 1,
      value: value * multiplier
    }))

    const totalInvestment = sequence.reduce((sum, item) => sum + item.value, 0)
    const bancaIdeal = calculateBancaIdeal(multiplier)

    return {
      tip: baseValue * multiplier, // Valor inicial M1 * multiplicador
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
    const riskLabel = multiplier === 1 ? 'Conservadora' :
                     multiplier === 3 ? 'Moderada' :
                     multiplier === 6 ? 'Agressiva' :
                     multiplier === 10 ? 'Máxima' : 'Desconhecida'
    return riskLabel
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
                <div className="text-xs font-mono text-gray-400 mt-1">
                  {getRiskLevel(option.value)}
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