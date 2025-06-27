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
  const [selectedTip, setSelectedTip] = useState<number | null>(null)

  // Valores de tip disponíveis - apenas 0.50, 1.00 e 2.00
  const tipOptions = [0.50, 1, 2]

  // Função para calcular sequência de martingale com +2 tips - 10 níveis
  const calculateMartingaleSequence = (tipValue: number): StrategyInfo => {
    const sequence: MartingaleSequence[] = []
    
    // Nível 1: 1 tip
    sequence.push({ level: 1, value: tipValue })
    
    // Níveis 2-10: (anterior × 2) + (2 × tip)
    for (let level = 2; level <= 10; level++) {
      const previousValue = sequence[level - 2].value
      const newValue = (previousValue * 2) + (2 * tipValue)
      sequence.push({ level, value: newValue })
    }

    // Banca ideal: soma de todos os níveis de martingale, arredondado para cima
    const somaTotal = sequence.reduce((sum, item) => sum + item.value, 0)
    let bancaIdeal = somaTotal

    // Arredondamento inteligente para cima
    if (somaTotal <= 500) {
      // Arredondar para múltiplos de 50
      bancaIdeal = Math.ceil(somaTotal / 50) * 50
    } else if (somaTotal <= 1000) {
      // Arredondar para múltiplos de 100
      bancaIdeal = Math.ceil(somaTotal / 100) * 100
    } else {
      // Arredondar para múltiplos de 500
      bancaIdeal = Math.ceil(somaTotal / 500) * 500
    }

    return {
      tip: tipValue,
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
    if (tipValue === 0.50) return 'green'
    if (tipValue === 1) return 'blue'
    if (tipValue === 2) return 'orange'
    return 'red'
  }

  const getRiskLevel = (tipValue: number) => {
    if (tipValue === 0.50) return 'Risco muito baixo'
    if (tipValue === 1) return 'Risco baixo'
    if (tipValue === 2) return 'Risco médio'
    return 'Risco alto'
  }

  const selectedStrategyData = selectedTip ? calculateMartingaleSequence(selectedTip) : null

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
        {/* Botões de seleção de tip */}
        <div>
          <div className="text-xs font-mono text-gray-400 mb-2">VALOR_DO_TIP:</div>
          <div className="grid grid-cols-3 gap-3">
            {tipOptions.map((tip) => {
              const color = getStrategyColor(tip)
              return (
                <button
                  key={tip}
                  onClick={() => setSelectedTip(tip)}
                  className={`p-3 rounded-lg border transition-all duration-200 text-center ${
                    selectedTip === tip
                      ? `border-${color}-500 bg-${color}-500/10 text-${color}-400`
                      : 'border-gray-600 hover:border-gray-500 text-gray-300 hover:text-gray-200'
                  }`}
                >
                  <div className="text-sm font-mono font-semibold">
                    R$ {tip.toFixed(2)}
                  </div>
                </button>
              )
            })}
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
                  {getRiskLevel(selectedTip)}
                </div>
              </div>


            </div>
          </div>
        )}
      </div>
    </Modal>
  )
} 