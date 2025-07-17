'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  QrCode, 
  Copy, 
  CheckCircle, 
  ArrowRight, 
  Clock,
  AlertCircle,
  Loader2
} from 'lucide-react'
import Modal, { useModal } from '@/components/ui/modal'
import { usePixPayment } from '@/hooks/usePixPayment'
import { useCredits } from '@/hooks/useCredits'
import { toast } from 'sonner'
import Image from 'next/image'

interface PixPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  initialAmount?: number
  title?: string
  description?: string
  onSuccess?: (amount: number, transactionId: string) => void
}

type PaymentStep = 'input' | 'generating' | 'qrcode' | 'confirming' | 'success'

export default function PixPaymentModal({
  isOpen,
  onClose,
  initialAmount = 0,
  title = 'PAGAMENTO_PIX',
  description = 'Complete sua compra via transferência PIX',
  onSuccess
}: PixPaymentModalProps) {
  const [customAmount, setCustomAmount] = useState(initialAmount > 0 ? initialAmount.toString() : '')
  const [currentStep, setCurrentStep] = useState<PaymentStep>('input')
  const [timeLeft, setTimeLeft] = useState(0)
  
  const { 
    loading, 
    paymentData, 
    error, 
    createPixPayment, 
    checkPaymentStatus, 
    copyPixToClipboard, 
    resetPayment 
  } = usePixPayment()
  const { refresh } = useCredits()
  
  const successModal = useModal()

  // Função para validar valor
  const isValidAmount = (amount: number): boolean => {
    return !isNaN(amount) && amount >= 10 && amount <= 1000
  }

  // Função para formatar valor
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount)
  }

  // Limpar estado quando modal fecha
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('input')
      setTimeLeft(0)
      resetPayment()
    }
  }, [isOpen, resetPayment])

  // Timer para expiração
  useEffect(() => {
    if (paymentData?.expiresAt && currentStep === 'qrcode') {
      const expirationTime = new Date(paymentData.expiresAt).getTime()
      const updateTimer = () => {
        const now = Date.now()
        const remaining = Math.max(0, expirationTime - now)
        setTimeLeft(Math.floor(remaining / 1000))
        
        if (remaining <= 0) {
          setCurrentStep('input')
          toast.error('PIX expirado. Gere um novo código.')
        }
      }
      
      updateTimer()
      const interval = setInterval(updateTimer, 1000)
      return () => clearInterval(interval)
    }
  }, [paymentData, currentStep])

  // Verificar status do pagamento periodicamente
  useEffect(() => {
    if (paymentData?.transactionId && currentStep === 'qrcode') {
      const checkStatus = async () => {
        try {
          const result = await checkPaymentStatus(paymentData.transactionId)
          if (result.status === 'CONFIRMED') {
            setCurrentStep('success')
            refresh()
            onSuccess?.(result.amount, result.transactionId)
          }
        } catch (error) {
          // Error é tratado no hook
        }
      }
      
      const interval = setInterval(checkStatus, 5000) // Verificar a cada 5 segundos
      return () => clearInterval(interval)
    }
  }, [paymentData, currentStep, checkPaymentStatus, refresh, onSuccess])

  // Função para gerar PIX
  const handleGeneratePix = async () => {
    const amount = parseFloat(customAmount)
    
    if (!isValidAmount(amount)) {
      toast.error('Valor inválido', {
        description: 'Digite um valor entre R$ 10,00 e R$ 1.000,00'
      })
      return
    }

    setCurrentStep('generating')
    
    try {
      const result = await createPixPayment(amount)
      if (result) {
        setCurrentStep('qrcode')
      }
    } catch (error) {
      setCurrentStep('input')
    }
  }

  // Função para copiar PIX
  const handleCopyPix = async () => {
    if (paymentData?.pixCopyPaste) {
      await copyPixToClipboard(paymentData.pixCopyPaste)
    }
  }

  // Função para fechar modal
  const handleClose = () => {
    setCurrentStep('input')
    resetPayment()
    onClose()
  }

  // Formatação do tempo restante
  const formatTimeLeft = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description={description}
      type="info"
    >
      <div className="space-y-6">
        {/* Etapa 1: Input de Valor */}
        {currentStep === 'input' && (
          <div className="space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <h3 className="text-lg font-bold text-blue-400 font-mono mb-2">VALOR_PERSONALIZADO</h3>
              <p className="text-sm text-gray-400 font-mono">
                Digite o valor desejado para adicionar aos seus créditos
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm font-mono text-gray-400">
                VALOR (R$)
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="10"
                max="1000"
                placeholder="Ex: 50.00"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="font-mono text-green-400 bg-gray-900/50 border-gray-600"
              />
              <p className="text-xs text-gray-500 font-mono">
                Valor mínimo: R$ 10,00 | Valor máximo: R$ 1.000,00
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-mono text-sm">{error.message}</span>
                </div>
              </div>
            )}
            
            <div className="flex gap-3">
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1 border-gray-600 text-gray-400 hover:text-white"
              >
                CANCELAR
              </Button>
              <Button
                onClick={handleGeneratePix}
                className="flex-1 bg-blue-500/20 border border-blue-500/50 text-blue-400 hover:bg-blue-500/30"
                disabled={!isValidAmount(parseFloat(customAmount))}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                AVANÇAR
              </Button>
            </div>
          </div>
        )}

        {/* Etapa 2: Gerando PIX */}
        {currentStep === 'generating' && (
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 text-yellow-400 animate-spin" />
                <h3 className="text-lg font-bold text-yellow-400 font-mono">GERANDO_PIX...</h3>
              </div>
              <p className="text-sm text-gray-400 font-mono mt-2">
                Preparando seu código PIX, aguarde...
              </p>
            </div>
          </div>
        )}

        {/* Etapa 3: QR Code e PIX Copia e Cola */}
        {currentStep === 'qrcode' && paymentData && (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-green-400 font-mono">VALOR_A_PAGAR</h3>
                <div className="text-xl font-bold text-green-400 font-mono">
                  {formatAmount(paymentData.amount)}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-400 font-mono">
                  ID: {paymentData.transactionId}
                </p>
                {timeLeft > 0 && (
                  <div className="flex items-center gap-2 text-xs text-orange-400 font-mono">
                    <Clock className="h-3 w-3" />
                    Expira em: {formatTimeLeft(timeLeft)}
                  </div>
                )}
              </div>
            </div>

            {/* QR Code e PIX Copia e Cola */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* QR Code */}
              <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <QrCode className="h-5 w-5 text-blue-400" />
                  <span className="font-semibold text-blue-400 font-mono text-sm">CÓDIGO_QR</span>
                </div>
                <div className="flex justify-center">
                  {paymentData.pixQrCode ? (
                    <Image
                      src={paymentData.pixQrCode}
                      alt="PIX QR Code" 
                      width={160}
                      height={160}
                      className="w-40 h-40 bg-white p-2 rounded-lg"
                      unoptimized
                    />
                  ) : (
                    <div className="w-40 h-40 bg-gray-700 rounded-lg flex items-center justify-center">
                      <QrCode className="h-20 w-20 text-gray-500" />
                    </div>
                  )}
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
                    value={paymentData.pixCopyPaste}
                    readOnly
                    className="w-full flex-1 min-h-[120px] p-2 bg-gray-900/50 border border-gray-600 rounded text-xs font-mono text-green-400 resize-none"
                    placeholder="Código PIX aparecerá aqui..."
                  />
                  <Button
                    onClick={handleCopyPix}
                    className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono text-xs"
                    variant="outline"
                    size="sm"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    COPIAR_CÓDIGO_PIX
                  </Button>
                </div>
              </div>
            </div>

            {/* Instruções */}
            <div className="bg-gray-800/30 border border-gray-600/50 rounded-lg p-4">
              <h4 className="text-sm font-bold text-gray-300 font-mono mb-2">INSTRUÇÕES:</h4>
              <div className="text-xs text-gray-400 font-mono space-y-1">
                <p>1. Abra o app do seu banco ou carteira digital</p>
                <p>2. Escolha: escaneie o QR Code OU copie o código PIX</p>
                <p>3. Envie exatamente o valor: {formatAmount(paymentData.amount)}</p>
                <p>4. O pagamento será confirmado automaticamente</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1 border-gray-600 text-gray-400 hover:text-white"
              >
                CANCELAR
              </Button>
              <Button
                onClick={() => checkPaymentStatus(paymentData.transactionId)}
                className="flex-1 bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30"
                disabled={timeLeft <= 0}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                VERIFICAR_STATUS
              </Button>
            </div>
          </div>
        )}

        {/* Etapa 4: Sucesso */}
        {currentStep === 'success' && paymentData && (
          <div className="text-center space-y-6">
            <div className="relative">
              <div className="mx-auto w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-10 w-10 text-green-400" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-green-400 font-mono">
                PAGAMENTO_CONFIRMADO!
              </h2>
              <p className="text-gray-300 font-mono text-sm">
                Seus créditos foram adicionados à sua conta
              </p>
            </div>

            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-green-400 font-mono">VALOR_PAGO:</span>
                <span className="text-green-400 font-bold font-mono">
                  {formatAmount(paymentData.amount)}
                </span>
              </div>
              
              <div className="border-t border-green-500/20 pt-3">
                <div className="flex items-center justify-between text-sm font-mono">
                  <span className="text-gray-400">CRÉDITOS_ADICIONADOS:</span>
                  <span className="text-green-400 font-bold">
                    +{formatAmount(paymentData.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm font-mono mt-1">
                  <span className="text-gray-400">MÉTODO_PAGAMENTO:</span>
                  <span className="text-blue-400">PIX</span>
                </div>
                <div className="flex items-center justify-between text-sm font-mono mt-1">
                  <span className="text-gray-400">ID_TRANSAÇÃO:</span>
                  <span className="text-gray-300 text-xs">
                    {paymentData.transactionId}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 justify-center text-sm text-gray-400 font-mono">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span>Transação processada com sucesso</span>
              </div>
              
              <Button
                onClick={handleClose}
                className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono"
                variant="outline"
              >
                CONTINUAR
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
} 