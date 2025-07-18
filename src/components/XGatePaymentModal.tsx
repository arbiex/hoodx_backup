'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, QrCode, Copy, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useXGatePayment } from '@/hooks/useXGatePayment'

interface XGatePaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (amount: number, transactionId: string) => void
  title?: string
  description?: string
  amount: number
  userId: string
}

export default function XGatePaymentModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'Pagamento PIX',
  description = 'Complete sua compra via PIX',
  amount,
  userId
}: XGatePaymentModalProps) {
  const {
    isLoading,
    currentTransaction,
    createPixDeposit,
    checkPaymentStatus,
    monitorPaymentStatus,
    clearCurrentTransaction
  } = useXGatePayment()

  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [isMonitoring, setIsMonitoring] = useState(false)

  // Função para copiar para a área de transferência
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Código copiado para a área de transferência!')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Erro ao copiar:', error)
      toast.error('Erro ao copiar código')
    }
  }, [])

  // Função para criar depósito quando modal abre
  const handleCreateDeposit = useCallback(async () => {
    if (!amount || !userId) return

    const result = await createPixDeposit(
      amount,
      userId,
      `Compra de créditos - R$ ${amount.toFixed(2)}`
    )

    if (result && result.transactionId) {
      // Iniciar monitoramento automático
      setIsMonitoring(true)
      monitorPaymentStatus(result.transactionId)
        .then((completed) => {
          if (completed) {
            toast.success('Pagamento confirmado!')
            onSuccess?.(amount, result.transactionId)
            handleClose()
          }
        })
        .finally(() => {
          setIsMonitoring(false)
        })
    }
  }, [amount, userId, createPixDeposit, monitorPaymentStatus, onSuccess])

  // Calcular tempo restante
  useEffect(() => {
    if (!currentTransaction?.expiresAt) return

    const updateTimeLeft = () => {
      const now = new Date().getTime()
      const expires = new Date(currentTransaction.expiresAt!).getTime()
      const diff = expires - now

      if (diff > 0) {
        setTimeLeft(Math.floor(diff / 1000))
      } else {
        setTimeLeft(0)
      }
    }

    updateTimeLeft()
    const interval = setInterval(updateTimeLeft, 1000)

    return () => clearInterval(interval)
  }, [currentTransaction])

  // Criar depósito quando modal abre
  useEffect(() => {
    if (isOpen && !currentTransaction && !isLoading) {
      handleCreateDeposit()
    }
  }, [isOpen, currentTransaction, isLoading, handleCreateDeposit])

  // Função para fechar modal
  const handleClose = useCallback(() => {
    clearCurrentTransaction()
    setTimeLeft(null)
    setIsMonitoring(false)
    setCopied(false)
    onClose()
  }, [clearCurrentTransaction, onClose])

  // Função para verificar status manualmente
  const handleCheckStatus = useCallback(async () => {
    if (!currentTransaction?.transactionId) return

    const status = await checkPaymentStatus(currentTransaction.transactionId)
    if (status && status.status === 'COMPLETED') {
      toast.success('Pagamento confirmado!')
      onSuccess?.(amount, currentTransaction.transactionId)
      handleClose()
    }
  }, [currentTransaction, checkPaymentStatus, amount, onSuccess, handleClose])

  // Formatar tempo restante
  const formatTimeLeft = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // Função para obter status visual
  const getStatusInfo = () => {
    if (!currentTransaction) return { icon: Clock, color: 'text-gray-400', text: 'Preparando...' }
    
    switch (currentTransaction.status) {
      case 'PENDING':
        return { icon: Clock, color: 'text-yellow-400', text: 'Aguardando pagamento' }
      case 'COMPLETED':
        return { icon: CheckCircle, color: 'text-green-400', text: 'Pagamento confirmado!' }
      case 'FAILED':
        return { icon: AlertCircle, color: 'text-red-400', text: 'Pagamento falhou' }
      case 'EXPIRED':
        return { icon: AlertCircle, color: 'text-red-400', text: 'Pagamento expirado' }
      default:
        return { icon: Clock, color: 'text-gray-400', text: 'Verificando...' }
    }
  }

  if (!isOpen) return null

  const statusInfo = getStatusInfo()

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto border-gray-800 bg-gray-900 text-white">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-mono text-green-400">{title}</CardTitle>
            <CardDescription className="text-gray-400 font-mono text-sm">
              {description}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0 hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Valor e Status */}
          <div className="text-center space-y-2">
            <div className="text-2xl font-mono text-green-400">
              R$ {amount.toFixed(2)}
            </div>
            <div className="flex items-center justify-center gap-2">
              <statusInfo.icon className={`h-4 w-4 ${statusInfo.color}`} />
              <span className={`text-sm font-mono ${statusInfo.color}`}>
                {statusInfo.text}
              </span>
            </div>
            {timeLeft !== null && timeLeft > 0 && (
              <div className="text-xs text-gray-400 font-mono">
                Expira em: {formatTimeLeft(timeLeft)}
              </div>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400 mx-auto mb-4"></div>
              <p className="text-gray-400 font-mono text-sm">Gerando código PIX...</p>
            </div>
          )}

          {/* QR Code */}
          {currentTransaction?.pixQrCode && (
            <div className="space-y-4">
              <div className="text-center">
                <QrCode className="h-5 w-5 mx-auto mb-2 text-green-400" />
                <p className="text-sm font-mono text-gray-300">QR Code PIX</p>
              </div>
              
              <div className="bg-white p-4 rounded-lg">
                <img
                  src={currentTransaction.pixQrCode}
                  alt="QR Code PIX"
                  className="w-full h-auto max-w-[200px] mx-auto"
                />
              </div>
              
              <p className="text-xs text-center text-gray-400 font-mono">
                Escaneie com o app do seu banco
              </p>
            </div>
          )}

          {/* PIX Copia e Cola */}
          {currentTransaction?.pixCopyPaste && (
            <div className="space-y-4">
              <div className="text-center">
                <Copy className="h-5 w-5 mx-auto mb-2 text-green-400" />
                <p className="text-sm font-mono text-gray-300">PIX Copia e Cola</p>
              </div>
              
              <div className="bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-400 font-mono">Código:</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(currentTransaction.pixCopyPaste!)}
                    className="h-6 px-2 text-xs hover:bg-gray-700"
                  >
                    {copied ? 'Copiado!' : 'Copiar'}
                  </Button>
                </div>
                
                <textarea
                  value={currentTransaction.pixCopyPaste}
                  readOnly
                  className="w-full h-20 bg-gray-700 text-white text-xs font-mono p-2 rounded border-gray-600 resize-none"
                  placeholder="Código PIX aparecerá aqui..."
                />
              </div>
            </div>
          )}

          {/* Instruções */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h4 className="font-mono text-sm text-green-400 mb-2">Como pagar:</h4>
            <ul className="text-xs text-gray-300 space-y-1 font-mono">
              <li>• Abra o app do seu banco</li>
              <li>• Selecione a opção PIX</li>
              <li>• Escaneie o QR Code ou copie o código</li>
              <li>• Confirme o pagamento</li>
              <li>• Aguarde a confirmação automática</li>
            </ul>
          </div>

          {/* Botões */}
          <div className="flex gap-3">
            <Button
              onClick={handleCheckStatus}
              disabled={isLoading || isMonitoring}
              variant="outline"
              className="flex-1 border-gray-600 hover:bg-gray-800"
            >
              {isMonitoring ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isMonitoring ? 'Verificando...' : 'Verificar Status'}
            </Button>
            
            <Button
              onClick={handleClose}
              variant="ghost"
              className="flex-1 hover:bg-gray-800"
            >
              Fechar
            </Button>
          </div>

          {/* Powered by XGATE */}
          <div className="text-center text-xs text-gray-500 font-mono">
            Powered by XGATE Global
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 