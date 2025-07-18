'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DollarSign, CreditCard, X, ArrowUpDown, Coins } from 'lucide-react'
import { useCredits } from '@/hooks/useCredits'
import { useFxaTokens } from '@/hooks/useFxaTokens'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import XGatePaymentModal from './XGatePaymentModal'

export default function CreditDisplay() {
  const { credits, loading: creditsLoading, refresh } = useCredits()
  const { user } = useAuth()
  const { balance: fxaBalance, isLoading: fxaLoading, refresh: refreshFxa } = useFxaTokens(user?.id)
  const [showAmountModal, setShowAmountModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [fixaAmount, setFixaAmount] = useState('')
  const [finalAmount, setFinalAmount] = useState(0)

  // Conversão: R$ 0.25 = 1 FIXA
  const FIXA_RATE = 0.25

  // Função para lidar com sucesso do pagamento
  const handlePaymentSuccess = (amount: number, transactionId: string) => {
    // Refresh dos créditos e tokens FXA
    setTimeout(() => {
      refresh()
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

  // Funções de conversão
  const convertRealToFixa = (realValue: string) => {
    const real = parseFloat(realValue) || 0
    const fixa = real / FIXA_RATE
    return fixa.toFixed(0)
  }

  const convertFixaToReal = (fixaValue: string) => {
    const fixa = parseFloat(fixaValue) || 0
    const real = fixa * FIXA_RATE
    return real.toFixed(2)
  }

  // Handlers para os inputs
  const handleRealChange = (value: string) => {
    setPaymentAmount(value)
    if (value) {
      setFixaAmount(convertRealToFixa(value))
    } else {
      setFixaAmount('')
    }
  }

  const handleFixaChange = (value: string) => {
    setFixaAmount(value)
    if (value) {
      setPaymentAmount(convertFixaToReal(value))
    } else {
      setPaymentAmount('')
    }
  }

  // Função para abrir modal de digitar valor
  const handleOpenAmountModal = () => {
    setPaymentAmount('')
    setFixaAmount('')
    setShowAmountModal(true)
  }

  // Função para confirmar valor e ir para QR Code
  const handleConfirmAmount = () => {
    const amount = parseFloat(paymentAmount)
    if (amount && amount >= 5.00) {
      setFinalAmount(amount)
      setShowAmountModal(false)
      setShowPaymentModal(true)
    }
  }

  // Função para fechar modais
  const handleCloseModals = () => {
    setShowAmountModal(false)
    setShowPaymentModal(false)
    setPaymentAmount('')
    setFinalAmount(0)
  }

  if (creditsLoading || fxaLoading || !credits) {
    return (
      <Card className="border-purple-500/30 backdrop-blur-sm">
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
      <Card className="border-purple-500/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
            <Coins className="h-5 w-5" />
            TOKENS_FXA
          </CardTitle>
          <CardDescription className="text-gray-400 font-mono text-xs">
            {`// Tokens para operar na plataforma`}
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
              onClick={handleOpenAmountModal}
              className="w-full bg-purple-500/20 border border-purple-500/50 text-purple-400 hover:bg-purple-500/30 font-mono text-sm"
              variant="outline"
            >
              <Coins className="h-4 w-4 mr-2" />
              COMPRAR_TOKENS
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal 1: Digitar Valor */}
      {showAmountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md border-gray-800 bg-gray-900 text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg font-mono text-green-400">DIGITE_O_VALOR</CardTitle>
                <CardDescription className="text-gray-400 font-mono text-sm">
                  Informe o valor que deseja adicionar
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseModals}
                className="h-8 w-8 p-0 hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-6">
                {/* Conversor estilo cripto */}
                <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 space-y-4">

                  {/* Campo Real */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-400" />
                      <Label htmlFor="real-amount" className="text-sm font-mono text-green-400 font-semibold">
                        REAL BRASILEIRO (BRL)
                      </Label>
                    </div>
                    <div className="relative">
                                              <Input
                          id="real-amount"
                          type="number"
                          min="5.00"
                          step="0.01"
                          placeholder="0.00"
                          value={paymentAmount}
                          onChange={(e) => handleRealChange(e.target.value)}
                          className="bg-gray-900/50 border border-green-500/30 text-green-400 font-mono text-lg pl-12 pr-16 h-12 text-center focus:border-green-400"
                        />
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                        <span className="text-green-400 font-mono text-sm">R$</span>
                      </div>
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <span className="text-green-400/60 font-mono text-xs">BRL</span>
                      </div>
                    </div>
                  </div>

                  {/* Ícone de conversão */}
                  <div className="flex justify-center">
                    <div className="bg-blue-500/20 border border-blue-500/30 rounded-full p-2">
                      <ArrowUpDown className="h-4 w-4 text-blue-400" />
                    </div>
                  </div>

                  {/* Campo FIXA */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-purple-400" />
                      <Label htmlFor="fixa-amount" className="text-sm font-mono text-purple-400 font-semibold">
                        FIXA TOKEN (FXA)
                      </Label>
                    </div>
                    <div className="relative">
                      <Input
                        id="fixa-amount"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={fixaAmount}
                        onChange={(e) => handleFixaChange(e.target.value)}
                        className="bg-gray-900/50 border border-purple-500/30 text-purple-400 font-mono text-lg pl-12 pr-16 h-12 text-center focus:border-purple-400"
                      />
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                        <Coins className="h-4 w-4 text-purple-400" />
                      </div>
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <span className="text-purple-400/60 font-mono text-xs">FXA</span>
                      </div>
                    </div>
                  </div>

                  {/* Info sobre os créditos que receberá */}
                  {paymentAmount && parseFloat(paymentAmount) >= 5.00 && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-gray-400">VOCÊ_RECEBERÁ:</span>
                        <div className="flex items-center gap-2">
                          <Coins className="h-4 w-4 text-blue-400" />
                          <span className="text-sm font-mono text-blue-400 font-bold">
                            {fixaAmount} TOKENS
                          </span>
                        </div>
                      </div>
                                              <div className="text-xs text-gray-400 font-mono mt-1">
                          ≈ R$ {parseFloat(paymentAmount).toFixed(2)} convertidos em tokens
                        </div>
                    </div>
                  )}

                  {/* Validação */}
                  {paymentAmount && parseFloat(paymentAmount) < 5.00 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <p className="text-xs text-red-400 font-mono text-center">
                        ⚠️ Valor mínimo: R$ 5,00 (20 TOKENS)
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleConfirmAmount}
                  disabled={!paymentAmount || parseFloat(paymentAmount) < 5.00}
                  className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono h-12 text-base"
                  variant="outline"
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  CONTINUAR_PARA_PIX
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal 2: QR Code PIX */}
      {user && (
        <XGatePaymentModal
          isOpen={showPaymentModal}
          onClose={handleCloseModals}
          onSuccess={handlePaymentSuccess}
          title="PAGAMENTO_PIX"
          description="Complete sua compra via PIX"
          amount={finalAmount}
          userId={user.id}
        />
      )}
    </>
  )
} 