'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Coins } from 'lucide-react'
import { useFxaTokens } from '@/hooks/useFxaTokens'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import XGatePaymentModal from './XGatePaymentModal'

export default function CreditDisplay() {
  const { user } = useAuth()
  const { balance: fxaBalance, isLoading: fxaLoading, refresh: refreshFxa } = useFxaTokens(user?.id)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  // Função para lidar com sucesso do pagamento
  const handlePaymentSuccess = (amount: number, transactionId: string) => {
    // Refresh dos tokens FXA
    setTimeout(() => {
      refreshFxa()
      window.dispatchEvent(new CustomEvent('credits-updated', {
        detail: { amount, type: 'purchase' }
      }))
    }, 500)
  }

  // ✅ Escutar eventos de atualização de saldo FXA
  useEffect(() => {
    const handleFxaBalanceUpdate = (event: CustomEvent) => {
      console.log('💰 Recebido evento de atualização de saldo FXA')
      refreshFxa()
    }

    window.addEventListener('fxaBalanceUpdate', handleFxaBalanceUpdate as EventListener)
    
    return () => {
      window.removeEventListener('fxaBalanceUpdate', handleFxaBalanceUpdate as EventListener)
    }
  }, [refreshFxa])

  // Função para abrir modal de compra
  const handleOpenPaymentModal = () => {
    setShowPaymentModal(true)
  }

  // Função para fechar modal
  const handleCloseModal = () => {
    setShowPaymentModal(false)
  }

  if (fxaLoading) {
    return (
      <Card className="border-gray-700/30 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
            <span className="ml-3 text-purple-400 font-mono text-sm">Carregando tokens...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-gray-700/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
            <Coins className="h-5 w-5" />
            TOKENS_FXA
          </CardTitle>
          <CardDescription className="text-gray-400 font-mono text-xs">
            {`// Compra antecipada do Token FIXA`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Saldo FXA Token */}
            <div className="text-center py-4">
              <div className="flex items-center justify-center gap-3 mb-2">
                <Coins className="h-8 w-8 text-purple-400" />
                <div className="text-3xl font-bold text-purple-400 font-mono">
                  {fxaBalance.toLocaleString()}
                </div>
                <span className="text-lg font-mono text-purple-400">FXA</span>
              </div>
              <div className="text-sm text-gray-400 font-mono">
                DISPONÍVEL
              </div>
            </div>
            
            {/* Botão Comprar Tokens */}
            <Button
              onClick={handleOpenPaymentModal}
              className="w-full bg-purple-500/20 border border-purple-500/50 text-purple-400 hover:bg-purple-500/30 font-mono text-sm"
              variant="outline"
            >
              <Coins className="h-4 w-4 mr-2" />
              COMPRAR_TOKENS
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Pagamento Unificado */}
      {user && (
        <XGatePaymentModal
          isOpen={showPaymentModal}
          onClose={handleCloseModal}
          onSuccess={handlePaymentSuccess}
          title="PAGAMENTO_PIX"
          description="Complete sua compra via PIX"
          userId={user.id}
          showAmountInput={true}  // Sempre mostrar input de valor primeiro
        />
      )}
    </>
  )
} 