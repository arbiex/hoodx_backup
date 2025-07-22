'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, QrCode, Copy, Clock, CheckCircle, AlertCircle, RefreshCw, Banknote, Coins, DollarSign, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Modal from '@/components/ui/modal'
import CollapsibleSection from '@/components/ui/collapsible-section'
import { toast } from 'sonner'
import QRCodeSVG from 'react-qr-code'

interface CreditPurchaseModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (amount: number, transactionId: string) => void
  userId: string
}

export default function CreditPurchaseModal({
  isOpen,
  onClose,
  onSuccess,
  userId
}: CreditPurchaseModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [paymentProcessed, setPaymentProcessed] = useState(false)
  const [autoCheck, setAutoCheck] = useState<NodeJS.Timeout | null>(null)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  
  // Estados do modal - clone do XGatePaymentModal
  const [showAmountStep, setShowAmountStep] = useState(true)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [finalAmount, setFinalAmount] = useState(0)
  const [currentTransaction, setCurrentTransaction] = useState<any>(null)
  
  // 🔒 SISTEMA ANTI-DUPLICAÇÃO
  const isCreatingTransaction = useRef(false)
  const hasCreatedTransaction = useRef(false)

  // Conversão: R$ 1,00 = 1,00 crédito
  const CREDIT_RATE = 1.00

  // Calcular créditos baseado no valor - clone da função calculateFixas
  const calculateCredits = useCallback((value: number): number => {
    return value * CREDIT_RATE
  }, [])

  // Handler para o input de valor - simplificado
  const handleRealChange = useCallback((value: string) => {
    setPaymentAmount(value)
    // Limpar erro de duplicação quando usuário alterar o valor
    if (duplicateError) {
      setDuplicateError(null)
    }
  }, [duplicateError])

  // Função para confirmar valor e ir para QR Code - clone do XGate
  const handleConfirmAmount = useCallback(() => {
    const amountValue = parseFloat(paymentAmount)
    if (amountValue && amountValue >= 5.00) {
      setFinalAmount(amountValue)
      setShowAmountStep(false)
    }
  }, [paymentAmount])

  // Função para voltar ao step de valor - clone do XGate
  const handleBackToAmount = useCallback(() => {
    setShowAmountStep(true)
    setDuplicateError(null)
    // Reset transaction if going back
    if (currentTransaction) {
      setCurrentTransaction(null)
      setPaymentProcessed(false)
      setIsMonitoring(false)
      if (autoCheck) {
        clearInterval(autoCheck)
        setAutoCheck(null)
      }
    }
  }, [currentTransaction, autoCheck])

  // Função para copiar para a área de transferência - clone do XGate
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copiado!', {
        description: 'Código PIX copiado para área de transferência'
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error('Erro ao copiar', {
        description: 'Não foi possível copiar o código'
      })
    }
  }, [])

  // Formatar tempo restante - clone do XGate
  const formatTimeLeft = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // Verificar status manualmente - clone do XGate
  const handleCheckStatus = useCallback(async () => {
    if (!currentTransaction || paymentProcessed) return

    try {
      setIsMonitoring(true)
      console.log('🔍 Verificando status do pagamento:', currentTransaction.transactionId)
      
      const response = await fetch(`/api/payments/pix?transactionId=${currentTransaction.transactionId}`)
      const data = await response.json()
      
      if (data.success && data.status === 'completed') {
        console.log('✅ Pagamento confirmado!')
        setPaymentProcessed(true)
        setIsMonitoring(false)
        
        toast.success('PAGAMENTO_CONFIRMADO!', {
          description: `+${calculateCredits(finalAmount).toFixed(2)} CRÉDITOS adicionados à sua conta`
        })
        
        if (onSuccess) {
          onSuccess(finalAmount, currentTransaction.transactionId)
        }
        
        onClose()
        
      } else if (data.shouldStopChecking) {
        console.log('🛑 Parando verificações - pagamento já processado')
        setIsMonitoring(false)
      } else {
        // ✅ ATUALIZAR DADOS DA TRANSAÇÃO (QR CODE, PIX, ETC.)
        if (data.transaction && !currentTransaction.pixQrCode && !currentTransaction.pixCopyPaste) {
          console.log('🔄 Atualizando dados da transação reutilizada')
          setCurrentTransaction((prev: any) => ({
            ...prev,
            pixQrCode: data.transaction.pixQrCode || data.pixQrCode,
            pixCopyPaste: data.transaction.pixCopyPaste || data.pixCopyPaste,
            expiresAt: data.transaction.expiresAt || data.expiresAt
          }))
        }
        
        toast.info('Pagamento ainda pendente', {
          description: 'Aguarde o pagamento ser processado'
        })
      }
      
    } catch (error) {
      console.error('❌ Erro ao verificar status:', error)
      toast.error('Erro ao verificar status')
    } finally {
      setIsMonitoring(false)
    }
  }, [currentTransaction, paymentProcessed, onSuccess, finalAmount, calculateCredits, onClose])

  // Criar cobrança PIX para créditos
  const createPixPayment = useCallback(async () => {
    if (isCreatingTransaction.current || hasCreatedTransaction.current) {
      console.log('🔒 Criação de transação bloqueada - já em andamento ou criada')
      return
    }

    try {
      isCreatingTransaction.current = true
      setIsLoading(true)
      
      console.log('💳 Criando cobrança PIX para créditos:', { amount: finalAmount, userId })

      const response = await fetch('/api/payments/pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: finalAmount,
          userId: userId,
          type: 'credits', // 🎯 NOVO: tipo créditos
          description: `Compra de ${calculateCredits(finalAmount).toFixed(2)} créditos - R$ ${finalAmount.toFixed(2)}`
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // ✅ TRATAR TRANSAÇÃO DUPLICADA ESPECIFICAMENTE
        if (response.status === 409 && data.error === 'TRANSAÇÃO_DUPLICADA') {
          console.log('🚫 Transação duplicada detectada - orientando usuário')
          
          const suggestedValue = (finalAmount + 0.01).toFixed(2)
          
          // Definir mensagem de erro para mostrar na tela
          setDuplicateError(`Já existe um pagamento pendente para R$ ${finalAmount.toFixed(2)}. Tente outro valor, como R$ ${suggestedValue}.`)
          
          toast.error('Pagamento duplicado', {
            description: `Já existe um pagamento pendente para R$ ${finalAmount.toFixed(2)}. Tente outro valor, como R$ ${suggestedValue}.`
          })
          
          // Manter na tela DIGITE_O_VALOR para usuário alterar o valor
          setShowAmountStep(true)
          return
        }
        
        throw new Error(data.error || 'Erro ao criar pagamento')
      }

      if (data.success) {
        setCurrentTransaction(data)
        hasCreatedTransaction.current = true
        
        // Iniciar monitoramento
        startPaymentMonitoring(data.transactionId)
        
        toast.success('Cobrança PIX criada com sucesso!')
      } else {
        throw new Error(data.error || 'Falha ao criar cobrança')
      }

    } catch (error: any) {
      console.error('❌ Erro ao criar cobrança PIX:', error)
      
      // ✅ MELHOR TRATAMENTO DE ERRO PARA USUÁRIO
      if (error.message === 'TRANSAÇÃO_DUPLICADA') {
        toast.error('Transação duplicada', {
          description: 'Já existe um pagamento pendente. Tente alterar o valor ou aguarde alguns minutos.'
        })
        // Voltar para tela de valor para permitir alteração
        setShowAmountStep(true)
      } else {
        toast.error(error.message || 'Erro ao criar cobrança PIX')
      }
    } finally {
      setIsLoading(false)
      isCreatingTransaction.current = false
    }
  }, [finalAmount, userId, calculateCredits])

  // Monitorar status do pagamento
  const startPaymentMonitoring = useCallback(async (transactionId: string) => {
    if (isMonitoring) return
    
    setIsMonitoring(true)
    
    const checkInterval = setInterval(async () => {
      try {
        console.log('🔍 Verificando status do pagamento:', transactionId)
        
        const response = await fetch(`/api/payments/pix?transactionId=${transactionId}`)
        const data = await response.json()
        
        if (data.success && data.status === 'completed') {
          console.log('✅ Pagamento confirmado!')
          clearInterval(checkInterval)
          setIsMonitoring(false)
          setPaymentProcessed(true)
          
          toast.success('PAGAMENTO_CONFIRMADO!', {
            description: `+${calculateCredits(finalAmount).toFixed(2)} CRÉDITOS adicionados à sua conta`
          })
          
          if (onSuccess) {
            onSuccess(finalAmount, transactionId)
          }
          
          onClose()
          
        } else if (data.shouldStopChecking) {
          console.log('🛑 Parando verificações - pagamento já processado')
          clearInterval(checkInterval)
          setIsMonitoring(false)
        }
        
      } catch (error) {
        console.error('❌ Erro ao verificar status:', error)
      }
    }, 3000) // Verificar a cada 3 segundos

    setAutoCheck(checkInterval)

    // Limpar após 10 minutos
    setTimeout(() => {
      clearInterval(checkInterval)
      setIsMonitoring(false)
      setAutoCheck(null)
    }, 10 * 60 * 1000)
    
  }, [isMonitoring, onSuccess, finalAmount, calculateCredits, onClose])

  // Fechar modal - resetar todos os estados
  const handleClose = useCallback(() => {
    setShowAmountStep(true)
    setPaymentAmount('')
    setFinalAmount(0)
    setCurrentTransaction(null)
    setPaymentProcessed(false)
    setIsMonitoring(false)
    setDuplicateError(null)
    if (autoCheck) {
      clearInterval(autoCheck)
      setAutoCheck(null)
    }
    isCreatingTransaction.current = false
    hasCreatedTransaction.current = false
    onClose()
  }, [onClose, autoCheck])

  // Calcular tempo restante - clone do XGate
  useEffect(() => {
    if (!currentTransaction?.expiresAt) return

    const updateTimeLeft = () => {
      const now = new Date().getTime()
      const expiry = new Date(currentTransaction.expiresAt).getTime()
      const remaining = Math.max(0, Math.floor((expiry - now) / 1000))
      setTimeLeft(remaining)

      if (remaining <= 0) {
        setIsMonitoring(false)
        if (autoCheck) {
          clearInterval(autoCheck)
          setAutoCheck(null)
        }
      }
    }

    updateTimeLeft()
    const interval = setInterval(updateTimeLeft, 1000)

    return () => clearInterval(interval)
  }, [currentTransaction, autoCheck])

  // Trigger criação do PIX quando sair do step de valor
  useEffect(() => {
    if (!showAmountStep && finalAmount > 0 && !currentTransaction) {
      createPixPayment()
    }
  }, [showAmountStep, finalAmount, currentTransaction, createPixPayment])

  // Status info - clone do XGate
  const getStatusInfo = () => {
    if (paymentProcessed) {
      return {
        icon: CheckCircle,
        text: 'PAGAMENTO_CONFIRMADO',
        color: 'text-green-400'
      }
    }
    
    if (isLoading) {
      return {
        icon: RefreshCw,
        text: 'PROCESSANDO...',
        color: 'text-blue-400'
      }
    }
    
    return {
      icon: Clock,
      text: 'AGUARDANDO_PAGAMENTO',
      color: 'text-yellow-400'
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={showAmountStep ? 'DIGITE_O_VALOR' : 'PAGAMENTO_PIX'}
      description={showAmountStep ? 'Informe o valor que deseja adicionar' : 'Complete sua compra via transferência PIX'}
      type="info"
    >
      {showAmountStep ? (
        /* UI DIGITE_O_VALOR - Simplificado para créditos */
        <div className="space-y-6">
          {/* Campo de valor em reais */}
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
                  placeholder="5.00"
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



            {/* Info sobre os créditos que receberá */}
            {paymentAmount && parseFloat(paymentAmount) >= 5.00 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-400">VOCÊ_RECEBERÁ:</span>
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-blue-400" />
                    <span className="text-sm font-mono text-blue-400 font-bold">
                      {parseFloat(paymentAmount).toFixed(2)} CRÉDITOS
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-400 font-mono mt-1">
                  Conversão: R$ 1,00 = 1,00 crédito
                </div>
              </div>
            )}

            {/* Erro de duplicação */}
            {duplicateError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs text-red-400 font-mono text-center">
                  🚫 {duplicateError}
                </p>
              </div>
            )}

            {/* Validação de valor mínimo */}
            {paymentAmount && parseFloat(paymentAmount) < 5.00 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs text-red-400 font-mono text-center">
                  ⚠️ Valor mínimo: R$ 5,00 (5,00 créditos)
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
      ) : (
        /* UI PAGAMENTO_PIX - Clone exato do XGate */
        <div className="space-y-6">
          {/* Header com valor e status */}
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Banknote className="h-6 w-6 text-green-400" />
                <h3 className="text-lg font-bold text-green-400 font-mono">COMPRA_CRÉDITOS</h3>
              </div>
              <div className="text-xl font-bold text-green-400 font-mono">
                R$ {finalAmount.toFixed(2)}
              </div>
            </div>
            
            {/* Detalhes do que receberá */}
            <div className="mt-3 pt-3 border-t border-green-500/20">
              <div className="flex items-center justify-between text-sm font-mono">
                <span className="text-gray-400">CRÉDITOS:</span>
                <div className="flex items-center gap-1">
                  <Coins className="h-4 w-4 text-green-400" />
                  <span className="text-green-400 font-bold">{calculateCredits(finalAmount).toFixed(2)} créditos</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-green-500/20">
              <div className="flex items-center gap-2">
                <statusInfo.icon className={`h-4 w-4 ${statusInfo.color}`} />
                <span className={`text-sm font-mono ${statusInfo.color}`}>
                  {statusInfo.text}
                </span>
              </div>
              {timeLeft !== null && timeLeft > 0 && (
                <div className="text-sm text-yellow-400 font-mono">
                  ⏱️ {formatTimeLeft(timeLeft)}
                </div>
              )}
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
              <p className="text-gray-400 font-mono text-sm">Gerando código PIX...</p>
              <p className="text-gray-500 font-mono text-xs mt-2">Aguarde alguns segundos</p>
            </div>
          )}

          {/* QR Code e PIX Copia e Cola - Grid Layout como o XGate */}
          {currentTransaction?.pixQrCode && currentTransaction?.pixCopyPaste && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* QR Code */}
              <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <QrCode className="h-5 w-5 text-blue-400" />
                  <span className="font-semibold text-blue-400 font-mono text-sm">CÓDIGO_QR</span>
                </div>
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-lg">
                    <QRCodeSVG
                      value={currentTransaction.pixQrCode}
                      size={160}
                      level="M"
                      className="w-40 h-40"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 font-mono text-center mt-2">
                  Escaneie com o app do seu banco
                </p>
              </div>

              {/* PIX Copia e Cola */}
              <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <Copy className="h-5 w-5 text-green-400" />
                  <span className="font-semibold text-green-400 font-mono text-sm">PIX_COPIA_E_COLA</span>
                </div>
                <div className="flex flex-col flex-1 space-y-2">
                  <textarea 
                    value={currentTransaction.pixCopyPaste}
                    readOnly
                    className="w-full flex-1 min-h-[120px] p-2 bg-gray-900/50 border border-gray-600 rounded text-xs font-mono text-green-400 resize-none"
                    placeholder="Código PIX aparecerá aqui..."
                  />
                  <Button
                    onClick={() => copyToClipboard(currentTransaction.pixCopyPaste!)}
                    className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono text-xs"
                    variant="outline"
                    size="sm"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {copied ? 'COPIADO!' : 'COPIAR_CÓDIGO_PIX'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Instruções de Pagamento */}
          <CollapsibleSection
            title="INSTRUÇÕES_PAGAMENTO"
            icon={<Banknote />}
          >
            <p>1. Abra o app do seu banco ou carteira digital</p>
            <p>2. Escolha um dos métodos de pagamento:</p>
            <p className="pl-4">• Escaneie o QR Code acima, OU</p>
            <p className="pl-4">• Copie o código PIX copia e cola</p>
            <p>3. Envie exatamente o valor mostrado: R$ {finalAmount.toFixed(2)}</p>
            <p>4. O pagamento será confirmado automaticamente</p>
            <p>5. Seus créditos serão adicionados em instantes</p>
          </CollapsibleSection>

          {/* Botões de Ação - igual ao XGate */}
          <div className="flex gap-3">
            <Button
              onClick={handleBackToAmount}
              variant="outline"
              className="border-gray-600 text-gray-400 hover:text-white hover:bg-gray-800"
            >
              ALTERAR_VALOR
            </Button>
            
            <Button
              onClick={handleCheckStatus}
              disabled={isLoading || isMonitoring}
              variant="outline"
              className="flex-1 border-gray-600 text-gray-400 hover:text-white hover:bg-gray-800"
            >
              {isMonitoring ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isMonitoring ? 'VERIFICANDO...' : 'VERIFICAR_STATUS'}
            </Button>
            
            <Button
              onClick={handleClose}
              variant="outline"
              className="border-gray-600 text-gray-400 hover:text-white"
            >
              CANCELAR
            </Button>
          </div>

        </div>
      )}
    </Modal>
  )
} 