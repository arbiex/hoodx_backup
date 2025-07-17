'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, CreditCard } from 'lucide-react'
import { useCredits } from '@/hooks/useCredits'
import { useState } from 'react'
import PixPaymentModal from './PixPaymentModal'

export default function CreditDisplay() {
  const { credits, loading: creditsLoading, refresh } = useCredits()
  const [pixModalOpen, setPixModalOpen] = useState(false)

  // Função para lidar com sucesso do pagamento
  const handlePaymentSuccess = (amount: number, transactionId: string) => {
    // Refresh dos créditos
    setTimeout(() => {
      refresh()
      window.dispatchEvent(new CustomEvent('credits-updated', {
        detail: { amount, type: 'purchase' }
      }))
    }, 500)
  }

  if (creditsLoading || !credits) {
    return (
      <Card className="border-green-500/30 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400"></div>
            <span className="ml-3 text-green-400 font-mono text-sm">Carregando créditos...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-green-500/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
            <DollarSign className="h-5 w-5" />
            CRÉDITOS_DISPONÍVEIS
          </CardTitle>
          <CardDescription className="text-gray-400 font-mono text-xs">
            {`// Alocação de capital para operações`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-mono text-gray-400">DISPONÍVEL:</span>
                <span className="text-sm font-medium font-mono text-green-400">
                  R$ {credits.available_credits.toFixed(2)}
                </span>
              </div>
            </div>
            
            {/* Botão Comprar Fixa */}
            <Button
              onClick={() => setPixModalOpen(true)}
              className="w-full bg-blue-500/20 border border-blue-500/50 text-blue-400 hover:bg-blue-500/30 font-mono text-sm"
              variant="outline"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              COMPRAR_FIXA
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Pagamento PIX */}
      <PixPaymentModal
        isOpen={pixModalOpen}
        onClose={() => setPixModalOpen(false)}
        onSuccess={handlePaymentSuccess}
        title="PAGAMENTO_PIX"
        description="Complete sua compra via transferência PIX"
      />
    </>
  )
} 