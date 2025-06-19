'use client'

import Modal from '@/components/ui/modal'
import { AlertTriangle, Zap, Wifi, WifiOff } from 'lucide-react'

interface StopOperationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  loading?: boolean
}

export default function StopOperationModal({ isOpen, onClose, onConfirm, loading = false }: StopOperationModalProps) {

  const handleConfirm = () => {
    console.log('🛑 [STOP-OPERATION] Confirmando parada da operação')
    onConfirm()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="PARAR_OPERAÇÃO"
      description="Confirme se deseja encerrar a operação atual"
      type="warning"
      size="sm"
      actions={{
        primary: {
          label: 'SIM, PARAR',
          onClick: handleConfirm,
          loading: loading
        },
        secondary: {
          label: 'CANCELAR',
          onClick: onClose
        }
      }}
    >
      <div className="space-y-4">
        {/* Alerta Principal */}
        <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
          <div className="space-y-1">
            <div className="text-sm font-mono font-semibold text-yellow-400">
              ATENÇÃO: DESCONEXÃO_IMINENTE
            </div>
            <div className="text-xs font-mono text-gray-300">
              Esta ação irá desconectar você do jogo
            </div>
          </div>
        </div>

        {/* O que será parado */}
        <div className="space-y-3">
          <div className="text-xs font-mono text-gray-400 font-semibold">
            AS SEGUINTES OPERAÇÕES SERÃO ENCERRADAS:
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 bg-red-500/5 border border-red-500/20 rounded">
              <WifiOff className="h-4 w-4 text-red-400" />
              <div className="text-xs font-mono text-red-400">
                Conexão WebSocket será fechada
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-2 bg-red-500/5 border border-red-500/20 rounded">
              <Zap className="h-4 w-4 text-red-400" />
              <div className="text-xs font-mono text-red-400">
                Monitoramento de padrões será interrompido
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-2 bg-red-500/5 border border-red-500/20 rounded">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <div className="text-xs font-mono text-red-400">
                Apostas automáticas serão pausadas
              </div>
            </div>
          </div>
        </div>

        {/* Consequências */}
        <div className="p-3 bg-gray-800/30 border border-gray-600 rounded-lg">
          <div className="text-xs font-mono text-gray-400 mb-2">
            CONSEQUÊNCIAS:
          </div>
          <div className="space-y-1 text-xs font-mono text-gray-300">
            <div>• Você sairá do jogo MegaRoulette</div>
            <div>• Padrões selecionados serão perdidos</div>
            <div>• Será necessário reconectar para continuar</div>
          </div>
        </div>

        {/* Confirmação */}
        <div className="text-center">
          <div className="text-xs font-mono text-gray-400">
            Tem certeza que deseja parar a operação?
          </div>
        </div>
      </div>
    </Modal>
  )
} 