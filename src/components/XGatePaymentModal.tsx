'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, QrCode, Copy, Clock, CheckCircle, AlertCircle, RefreshCw, Banknote, Coins, DollarSign, CreditCard, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Modal from '@/components/ui/modal'
import CollapsibleSection from '@/components/ui/collapsible-section'
import { toast } from 'sonner'
import { useXGatePayment } from '@/hooks/useXGatePayment'
import QRCodeSVG from 'react-qr-code'

interface XGatePaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (amount: number, transactionId: string) => void
  title?: string
  description?: string
  amount?: number  // Opcional agora
  userId: string
  showAmountInput?: boolean  // Nova prop para controlar se mostra primeiro o input de valor
}

export default function XGatePaymentModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'PAGAMENTO_PIX',
  description = 'Complete sua compra via transferência PIX',
  amount,
  userId,
  showAmountInput = false
}: XGatePaymentModalProps) {
  const {
    isLoading,
    currentTransaction,
    createPixDeposit,
    checkPaymentStatus,
    monitorPaymentStatus,
    clearCurrentTransaction,
    isTransactionCached,
    stopAllChecksForTransaction,
    registerActiveCheck,
    stopAllActiveChecks
  } = useXGatePayment()

  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [autoCheck, setAutoCheck] = useState<NodeJS.Timeout | null>(null)
  const [paymentProcessed, setPaymentProcessed] = useState(false)
  const [shouldRefreshBalance, setShouldRefreshBalance] = useState(false)
  
  // Estados para o modal DIGITE_O_VALOR
  const [showAmountStep, setShowAmountStep] = useState(showAmountInput)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [fixaAmount, setFixaAmount] = useState('')
  const [finalAmount, setFinalAmount] = useState(amount || 0)
  
  // 🔒 SISTEMA ANTI-DUPLICAÇÃO ROBUSTO
  const isCreatingTransaction = useRef(false)
  const hasCreatedTransaction = useRef(false)
  const creationKey = useRef<string | null>(null)

  // Conversão: 1 token = R$ 0,25 (R$ 5,00 = 20 tokens, valor mínimo)
  const FIXA_RATE = 0.25

  // Calcular FIXAs baseado no valor
  const calculateFixas = useCallback((value: number): number => {
    return Math.floor(value / FIXA_RATE)
  }, [])

  // Funções de conversão
  const convertRealToFixa = useCallback((realValue: string) => {
    const real = parseFloat(realValue) || 0
    const fixa = real / FIXA_RATE
    return fixa.toFixed(0)
  }, [])

  const convertFixaToReal = useCallback((fixaValue: string) => {
    const fixa = parseFloat(fixaValue) || 0
    const real = fixa * FIXA_RATE
    return real.toFixed(2)
  }, [])

  // Handlers para os inputs de valor
  const handleRealChange = useCallback((value: string) => {
    setPaymentAmount(value)
    if (value) {
      setFixaAmount(convertRealToFixa(value))
    } else {
      setFixaAmount('')
    }
  }, [convertRealToFixa])

  const handleFixaChange = useCallback((value: string) => {
    setFixaAmount(value)
    if (value) {
      setPaymentAmount(convertFixaToReal(value))
    } else {
      setPaymentAmount('')
    }
  }, [convertFixaToReal])

  // Função para confirmar valor e ir para QR Code
  const handleConfirmAmount = useCallback(() => {
    const amountValue = parseFloat(paymentAmount)
    if (amountValue && amountValue >= 5.00) {
      setFinalAmount(amountValue)
      setShowAmountStep(false)
    }
  }, [paymentAmount])

  // Função para voltar ao step de valor
  const handleBackToAmount = useCallback(() => {
    setShowAmountStep(true)
    // Reset transaction if going back
    if (currentTransaction) {
      clearCurrentTransaction()
    }
  }, [currentTransaction, clearCurrentTransaction])

  // Função para atualizar saldo de tokens FXA
  const triggerBalanceRefresh = useCallback(() => {
    console.log('💰 Sinalizando atualização de saldo FXA')
    setShouldRefreshBalance(true)
    
    // Disparar evento customizado para componentes que escutam mudanças de saldo
    window.dispatchEvent(new CustomEvent('fxaBalanceUpdate', { detail: { userId } }))
    
    // Reset após um tempo
    setTimeout(() => setShouldRefreshBalance(false), 1000)
  }, [userId])

  // Função para processar sucesso do pagamento
  const handlePaymentSuccess = useCallback((transactionId: string, tokensAdded?: number) => {
    console.log('🎉 Processando sucesso do pagamento')
    
    // 🛑 PARAR TODAS as verificações desta transação primeiro
    stopAllChecksForTransaction(transactionId)
    
    // Marcar como processado para evitar duplo processamento
    setPaymentProcessed(true)
    
    // Parar verificação automática local
    if (autoCheck) {
      clearInterval(autoCheck)
      setAutoCheck(null)
    }
    
    // Parar monitoramento
    setIsMonitoring(false)
    
    // Atualizar saldo de tokens FXA
    triggerBalanceRefresh()
    
    // Toast de sucesso
    toast.success('PAGAMENTO_CONFIRMADO!', {
      description: `+${tokensAdded || calculateFixas(finalAmount)} TOKENS FXA adicionados à sua conta`
    })
    
    // Chamar callback de sucesso
    if (onSuccess) {
      onSuccess(finalAmount, transactionId)
    }
    
    // Fechar modal imediatamente após sucesso
    onClose()
  }, [autoCheck, triggerBalanceRefresh, onSuccess, finalAmount, calculateFixas, stopAllChecksForTransaction, onClose])

  // Função para copiar para a área de transferência
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

  // 🔧 Iniciar verificação automática SIMPLIFICADA
  const startAutoStatusCheck = useCallback((transactionId: string) => {
    console.log('🚀 Iniciando verificação para transação única:', transactionId)
    
    // ✅ VERIFICAÇÃO CACHE - Se já foi processada, não iniciar verificação
    if (isTransactionCached(transactionId)) {
      console.log('🚫 Transação já no cache, não iniciando verificação')
      setPaymentProcessed(true)
      return
    }
    
    // 🛑 Parar QUALQUER verificação anterior desta transação
    stopAllChecksForTransaction(transactionId)
    
    // Reset da flag de processamento
    setPaymentProcessed(false)

    const checkStatus = async () => {
      // ✅ Evitar verificação se já foi processado OU está no cache
      if (paymentProcessed || isTransactionCached(transactionId)) {
        console.log('⏭️ Pagamento processado/cache - parando verificação')
        stopAllChecksForTransaction(transactionId)
        return
      }

      try {
        const statusData = await checkPaymentStatus(transactionId)
        
        if (statusData) {
          // ✅ Verificar se deve parar completamente as verificações
          if (statusData.shouldStopChecking) {
            console.log('🛑 Servidor solicitou parada de verificações')
            
            // Se status é completed, processar sucesso
            if (statusData.status === 'completed' || statusData.status === 'COMPLETED') {
              handlePaymentSuccess(transactionId, statusData.tokensAdded)
            }
            
            return
          }
          
          // ✅ Verificação para casos onde ainda não deve parar
          if (statusData.status === 'completed' || statusData.status === 'COMPLETED') {
            console.log('🎉 Pagamento confirmado!')
            handlePaymentSuccess(transactionId, statusData.tokensAdded)
            return
          }
        }
      } catch (error) {
        console.error('❌ Erro na verificação:', error)
      }
    }

    // Verificar a cada 3 segundos (reduzindo ainda mais a frequência)
    checkStatus()
    const interval = setInterval(checkStatus, 3000)
    
    // 📝 REGISTRAR no controle global
    registerActiveCheck(transactionId, interval)
    setAutoCheck(interval)
    
    return interval
  }, [checkPaymentStatus, paymentProcessed, isTransactionCached, handlePaymentSuccess, stopAllChecksForTransaction, registerActiveCheck])

  // 🔒 SISTEMA DE CRIAÇÃO ÚNICA E ANTI-DUPLICAÇÃO ULTRA RIGOROSO
  useEffect(() => {
    // ✅ Verificações fundamentais
    if (!isOpen) return
    if (showAmountStep) return // ✅ Não criar transação se estivermos no step de valor
    if (currentTransaction) return // ✅ Já tem transação
    if (isLoading) return // ✅ Aguardar carregar
    if (!finalAmount || finalAmount < 5.00) return // ✅ Valor válido obrigatório
    
    // 🔒 PROTEÇÃO ANTI-DUPLICAÇÃO ABSOLUTA
    if (isCreatingTransaction.current) {
      console.log('🚫 Criação já em andamento - BLOQUEANDO duplicação')
      return
    }
    
    if (hasCreatedTransaction.current) {
      console.log('🚫 Transação já foi criada nesta sessão - BLOQUEANDO duplicação')
      return
    }
    
    // 🆔 Chave única para esta criação específica
    const currentKey = `${userId}-${finalAmount}-${Date.now()}`
    if (creationKey.current === currentKey) {
      console.log('🚫 Mesma chave de criação - BLOQUEANDO duplicação')
      return
    }
    
    // 🔒 BLOQUEAR imediatamente
    console.log('🔨 Iniciando criação ÚNICA de transação - Valor:', finalAmount)
    isCreatingTransaction.current = true
    hasCreatedTransaction.current = true
    creationKey.current = currentKey

    const createTransaction = async () => {
      try {
        const transaction = await createPixDeposit(finalAmount, userId)
        if (transaction) {
          console.log('✅ Transação criada com sucesso:', transaction.transactionId)
          setTimeLeft(15 * 60) // 15 minutos
          setIsMonitoring(true)
          
          // Iniciar verificação automática para ESTA transação específica
          startAutoStatusCheck(transaction.transactionId)
        }
      } catch (error) {
        console.error('❌ Erro ao criar transação:', error)
        toast.error('ERRO_TRANSAÇÃO', {
          description: 'Falha ao gerar código PIX'
        })
        
        // 🔓 Liberar em caso de erro para permitir nova tentativa
        isCreatingTransaction.current = false
        hasCreatedTransaction.current = false
        creationKey.current = null
        
      } finally {
        // 🔓 Liberar flag de "criando" (mas manter "já criou")
        isCreatingTransaction.current = false
      }
    }

    // 🚀 Debounce de 300ms para evitar múltiplas execuções rápidas
    const debounceTimer = setTimeout(createTransaction, 300)
    
    return () => {
      clearTimeout(debounceTimer)
    }
  }, [isOpen, showAmountStep, currentTransaction, isLoading, finalAmount, userId, createPixDeposit, startAutoStatusCheck])

  // 🔒 RESET COMPLETO ao fechar modal
  useEffect(() => {
    if (!isOpen) {
      console.log('🚪 Modal fechado - RESET COMPLETO')
      
      // 🛑 Parar TODAS as verificações
      stopAllActiveChecks()
      
      if (autoCheck) {
        clearInterval(autoCheck)
        setAutoCheck(null)
      }
      
      // 🔄 RESET ABSOLUTO de TODAS as flags
      setPaymentProcessed(false)
      setIsMonitoring(false)
      setTimeLeft(null)
      setCopied(false)
      
      // 🔄 Reset estados do valor
      setShowAmountStep(showAmountInput)
      setPaymentAmount('')
      setFixaAmount('')
      setFinalAmount(amount || 0)
      
      // 🔓 Liberar flags anti-duplicação para próxima abertura
      isCreatingTransaction.current = false
      hasCreatedTransaction.current = false
      creationKey.current = null
      
      console.log('✅ Reset completo finalizado')
    }
  }, [isOpen, autoCheck, stopAllActiveChecks, showAmountInput, amount])

  // Countdown timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          setIsMonitoring(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
      }, [timeLeft])

  // Formatar tempo restante
  const formatTimeLeft = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // Verificar status manualmente
  const handleCheckStatus = useCallback(async () => {
    if (!currentTransaction || paymentProcessed) return

    // ✅ VERIFICAÇÃO CACHE - Se já foi processada, não verificar
    if (isTransactionCached(currentTransaction.transactionId)) {
      console.log('🚫 Transação já no cache - verificação manual')
      setPaymentProcessed(true)
      toast.info('TRANSAÇÃO_FINALIZADA', {
        description: 'Esta transação já foi processada'
      })
      return
    }

    try {
      setIsMonitoring(true)
      const statusData = await checkPaymentStatus(currentTransaction.transactionId)
      
      if (statusData) {
        console.log('🔍 Verificação manual - Status:', statusData.status)
        
        // ✅ Verificar se deve parar verificações
        if (statusData.shouldStopChecking) {
          console.log('🛑 Servidor solicitou parada de verificações - Verificação manual')
          
          // Se status é completed, processar sucesso
          if (statusData.status === 'completed' || statusData.status === 'COMPLETED') {
            handlePaymentSuccess(currentTransaction.transactionId, statusData.tokensAdded)
          } else {
            toast.info('TRANSAÇÃO_FINALIZADA', {
              description: `Status final: ${statusData.status}`
            })
          }
          
          return
        }
        
        // ✅ Se completed, processar sucesso
        if (statusData.status === 'completed' || statusData.status === 'COMPLETED') {
          handlePaymentSuccess(currentTransaction.transactionId, statusData.tokensAdded)
        } else {
          toast.info('STATUS_ATUALIZADO', {
            description: `Status atual: ${statusData.status}`
          })
        }
      }
    } catch (error) {
      console.error('❌ Erro na verificação manual:', error)
      toast.error('ERRO_VERIFICAÇÃO', {
        description: 'Falha ao verificar status do pagamento'
      })
    } finally {
      setIsMonitoring(false)
    }
  }, [currentTransaction, paymentProcessed, isTransactionCached, checkPaymentStatus, handlePaymentSuccess])

  // 🔒 Fechar modal LIMPANDO TUDO
  const handleClose = useCallback(() => {
    console.log('🚪 Fechando modal e limpando sistema')
    
    // 🛑 Parar TODAS as verificações
    stopAllActiveChecks()
    
    if (autoCheck) {
      clearInterval(autoCheck)
      setAutoCheck(null)
    }
    
    // 🔄 Reset completo do estado
    setIsMonitoring(false)
    setPaymentProcessed(false)
    setTimeLeft(null)
    setCopied(false)
    
    // 🔄 Reset estados do valor
    setShowAmountStep(showAmountInput)
    setPaymentAmount('')
    setFixaAmount('')
    setFinalAmount(amount || 0)
    
    // 🔓 Reset flags anti-duplicação
    isCreatingTransaction.current = false
    hasCreatedTransaction.current = false
    creationKey.current = null
    
    // Limpar transação atual
    clearCurrentTransaction()
    
    // Fechar modal
    onClose()
  }, [clearCurrentTransaction, onClose, autoCheck, stopAllActiveChecks, showAmountInput, amount])

  // Fechar modal de sucesso
  // const handleSuccessClose = useCallback(() => {
  //   successModal.closeModal()
  //   // Não fechar o modal principal automaticamente
  //   // O usuário pode fechar manualmente ou o componente pai decidir
  // }, [successModal])

  // Status info para exibição
  const getStatusInfo = () => {
    if (!currentTransaction) {
      return { icon: Clock, color: 'text-gray-400', text: 'Preparando...' }
    }

    switch (currentTransaction.status) {
      case 'pending':
      case 'PENDING':
        return { icon: Clock, color: 'text-yellow-400', text: 'Aguardando pagamento' }
      case 'completed':
      case 'COMPLETED':
        return { icon: CheckCircle, color: 'text-green-400', text: 'Pagamento confirmado' }
      case 'failed':
      case 'FAILED':
        return { icon: AlertCircle, color: 'text-red-400', text: 'Pagamento falhou' }
      case 'expired':
      case 'EXPIRED':
        return { icon: AlertCircle, color: 'text-red-400', text: 'Pagamento expirado' }
      default:
        return { icon: Clock, color: 'text-gray-400', text: 'Verificando...' }
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <>
      {/* Modal Principal */}
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={showAmountStep ? 'DIGITE_O_VALOR' : title}
        description={showAmountStep ? 'Informe o valor que deseja adicionar' : description}
        type="info"
      >
        {showAmountStep ? (
          /* UI DIGITE_O_VALOR */
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
                    step="0.25"
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
        ) : (
          /* UI PAGAMENTO_PIX */
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
                <span className="text-gray-400">TOKENS:</span>
                <div className="flex items-center gap-1">
                  <Coins className="h-4 w-4 text-purple-400" />
                  <span className="text-purple-400 font-bold">{calculateFixas(finalAmount)} FXA</span>
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

          {/* QR Code e PIX Copia e Cola - Grid Layout */}
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

          {/* Botões de Ação */}
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

      {/* Modal de Sucesso */}
      {/* REMOVIDO */}
    </>
  )
} 