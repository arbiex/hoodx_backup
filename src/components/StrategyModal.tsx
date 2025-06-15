'use client'

import Modal from '@/components/ui/modal'
import { useState, useEffect } from 'react'

interface Strategy {
  id: '2+2' | '5+5' | '10+10' | '20+20'
  name: string
  description: string
  baseAmount: number
  totalRequired: number // Será atualizado com dados reais do Supabase
  riskLevel: 'baixo' | 'médio' | 'alto' | 'extremo'
  color: string
}

interface StrategyModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (strategyId: string) => void
  loading?: boolean
}

const INITIAL_STRATEGIES: Strategy[] = [
  {
    id: '2+2',
    name: '2',
    description: 'Baixo risco',
    baseAmount: 2,
    totalRequired: 0, // Será carregado do Supabase
    riskLevel: 'baixo',
    color: 'green'
  },
  {
    id: '5+5',
    name: '5',
    description: 'Risco médio',
    baseAmount: 5,
    totalRequired: 0, // Será carregado do Supabase
    riskLevel: 'médio',
    color: 'blue'
  },
  {
    id: '10+10',
    name: '10',
    description: 'Alto risco',
    baseAmount: 10,
    totalRequired: 0, // Será carregado do Supabase
    riskLevel: 'alto',
    color: 'orange'
  },
  {
    id: '20+20',
    name: '20',
    description: 'Risco extremo',
    baseAmount: 20,
    totalRequired: 0, // Será carregado do Supabase
    riskLevel: 'extremo',
    color: 'red'
  }
]

export default function StrategyModal({ isOpen, onClose, onConfirm, loading = false }: StrategyModalProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null)
  const [strategies, setStrategies] = useState<Strategy[]>(INITIAL_STRATEGIES)
  const [loadingData, setLoadingData] = useState(false)

  // Carregar dados reais do Supabase quando modal abrir
  useEffect(() => {
    if (isOpen && !loadingData) {
      loadMartingaleData()
    }
  }, [isOpen])

  const loadMartingaleData = async () => {
    setLoadingData(true)
    try {
      // Buscar userId do usuário logado
      const { supabase } = await import('@/lib/supabase')
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user?.email) {
        console.error('Usuário não encontrado')
        return
      }

      // Buscar dados via API route para evitar problemas de autenticação
      const response = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'get-martingale-data',
          userId: user.email
        })
      })

      const result = await response.json()

      if (result.success && result.data) {
        // Atualizar estratégias com dados reais
        setStrategies(prev => prev.map(strategy => ({
          ...strategy,
          totalRequired: result.data[strategy.id] || strategy.totalRequired
        })))
      }
    } catch (error) {
      console.error('Erro ao carregar dados de martingale:', error)
    } finally {
      setLoadingData(false)
    }
  }

  const handleConfirm = async () => {
    if (selectedStrategy) {
      try {
        // Buscar userId do usuário logado
        const { supabase } = await import('@/lib/supabase')
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user?.email) {
          console.error('Usuário não encontrado')
          return
        }

        console.log('🧹 [STRATEGY] Limpando sessões antes de ativar nova estratégia...')
        
        // Limpar sessões existentes antes de ativar nova estratégia
        const cleanupResponse = await fetch('/api/bots/blaze/pragmatic/api/megaroulette-bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'cleanup-sessions',
            userId: user.email
          })
        })

        const cleanupResult = await cleanupResponse.json()
        
        if (cleanupResult.success) {
          console.log('✅ [STRATEGY] Sessões limpas com sucesso:', cleanupResult.data)
        } else {
          console.warn('⚠️ [STRATEGY] Aviso na limpeza de sessões:', cleanupResult.error)
        }

        // Aguardar um pouco para garantir que a limpeza foi processada
        await new Promise(resolve => setTimeout(resolve, 500))

        // Ativar nova estratégia
        console.log('🎯 [STRATEGY] Ativando estratégia:', selectedStrategy)
        onConfirm(selectedStrategy)
        
      } catch (error) {
        console.error('❌ [STRATEGY] Erro ao limpar sessões:', error)
        // Mesmo com erro na limpeza, continuar com a ativação
        onConfirm(selectedStrategy)
      }
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="SELECIONAR_ESTRATÉGIA"
      description="Escolha a estratégia de progressão"
      type="info"
      size="sm"
      actions={{
        primary: {
          label: 'ATIVAR',
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
        {/* Botões de estratégia */}
        <div className="grid grid-cols-2 gap-2">
          {strategies.map((strategy) => (
            <button
              key={strategy.id}
              onClick={() => setSelectedStrategy(strategy.id)}
              className={`p-3 rounded-lg border transition-all duration-200 text-center ${
                selectedStrategy === strategy.id
                  ? `border-${strategy.color}-500 bg-${strategy.color}-500/10 text-${strategy.color}-400`
                  : 'border-gray-600 hover:border-gray-500 text-gray-300 hover:text-gray-200'
              }`}
            >
              <div className="text-sm font-mono font-semibold">
                {strategy.name}
              </div>
            </button>
          ))}
        </div>

        {/* Preview da estratégia selecionada */}
        {selectedStrategy && (
          <div className="p-3 bg-gray-800/30 border border-gray-600 rounded-lg text-center">
            {(() => {
              const selected = strategies.find(s => s.id === selectedStrategy)!
              
              return (
                <>
                  <div className="text-sm font-mono text-gray-400 mb-1">BANCA_IDEAL:</div>
                  <div className={`text-lg font-mono font-bold text-${selected.color}-400`}>
                    {selected.totalRequired > 0 
                      ? `R$ ${selected.totalRequired.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : loadingData ? 'Carregando...' : 'R$ 0,00'
                    }
                  </div>
                  <div className="text-xs font-mono text-gray-500 mt-1">
                    {selected.description}
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </div>
    </Modal>
  )
} 