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

  // Valores de tip disponíveis
  const tipOptions = [1, 2, 5, 10, 25, 50, 100, 250]

  // Função para calcular sequência de martingale com +2 tips
  const calculateMartingaleSequence = (tipValue: number): StrategyInfo => {
    const sequence: MartingaleSequence[] = []
    
    // Nível 1: 1 tip
    sequence.push({ level: 1, value: tipValue })
    
    // Níveis 2-5: (anterior × 2) + (2 × tip)
    for (let level = 2; level <= 5; level++) {
      const previousValue = sequence[level - 2].value
      const newValue = (previousValue * 2) + (2 * tipValue)
      sequence.push({ level, value: newValue })
    }

    // Banca ideal: M5 × 10, arredondado para cima
    const m5Value = sequence[4].value // 5º nível (índice 4)
    const bancaBase = m5Value * 10
    let bancaIdeal = bancaBase

    // Arredondamento inteligente
    if (bancaBase <= 500) {
      // Arredondar para múltiplos de 50
      bancaIdeal = Math.ceil(bancaBase / 50) * 50
    } else if (bancaBase <= 1000) {
      // Arredondar para múltiplos de 100
      bancaIdeal = Math.ceil(bancaBase / 100) * 100
    } else {
      // Arredondar para múltiplos de 500
      bancaIdeal = Math.ceil(bancaBase / 500) * 500
    }

    return {
      tip: tipValue,
      sequence,
      bancaIdeal
    }
  }

  const handleConfirm = () => {
    if (selectedTip) {
      console.log('🎯 [STRATEGY] Tip selecionado:', selectedTip)
      onConfirm(selectedTip)
    }
  }

  const getStrategyColor = (tipValue: number) => {
    if (tipValue <= 2) return 'green'
    if (tipValue <= 10) return 'blue'
    if (tipValue <= 50) return 'orange'
    return 'red'
  }

  const getRiskLevel = (tipValue: number) => {
    if (tipValue <= 2) return 'Baixo risco'
    if (tipValue <= 10) return 'Risco médio'
    if (tipValue <= 50) return 'Alto risco'
    return 'Risco extremo'
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
          <div className="grid grid-cols-4 gap-2">
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
                    {tip}
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
                
              </div>
              
              <div className="text-xs font-mono text-gray-400 mb-2">SEQUÊNCIA_MARTINGALE:</div>
              <div className="grid grid-cols-5 gap-2 text-xs mb-4">
                {selectedStrategyData.sequence.map((seq, index) => (
                  <div 
                    key={seq.level}
                    className={`p-2 rounded text-center font-mono ${
                      index === 0 ? 'bg-green-500/20 text-green-400' :
                      index === 1 ? 'bg-blue-500/20 text-blue-400' :
                      index === 2 ? 'bg-yellow-500/20 text-yellow-400' :
                      index === 3 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-red-500/20 text-red-400'
                    }`}
                  >
                                         <div className="text-xs">M{seq.level}</div>
                     <div className="font-semibold">{seq.value.toFixed(2)}</div>
                  </div>
                ))}
              </div>
              
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
} 