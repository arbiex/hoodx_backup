'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, QrCode, Copy, Clock, CheckCircle, AlertCircle, RefreshCw, Banknote, Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Modal, { useModal } from '@/components/ui/modal'
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
  amount: number
  userId: string
}

export default function XGatePaymentModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'PAGAMENTO_PIX',
  description = 'Complete sua compra via transferência PIX',
  amount,
  userId
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
  const [showHardcodedSuccessModal, setShowHardcodedSuccessModal] = useState(false) // 🔥 Modal que não pode ser fechado por nada
  const successModal = useModal()

  // 🔒 SISTEMA ANTI-DUPLICAÇÃO ROBUSTO
  const isCreatingTransaction = useRef(false)
  const hasCreatedTransaction = useRef(false)
  const creationKey = useRef<string | null>(null)

  // Conversão: R$ 0.25 = 1 FIXA (Valor mínimo: R$ 5.00 = 20 FIXAS)
  const FIXA_RATE = 0.25

  // Calcular FIXAs baseado no valor
  const calculateFixas = useCallback((value: number): number => {
    return Math.floor(value / FIXA_RATE)
  }, [])

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
    console.log('🎉 [DEBUG] Processando sucesso do pagamento')
    console.log('🎉 [DEBUG] transactionId:', transactionId)
    console.log('🎉 [DEBUG] tokensAdded:', tokensAdded)
    console.log('🎉 [DEBUG] amount:', amount)
    console.log('🎉 [DEBUG] calculateFixas(amount):', calculateFixas(amount))
    
    // 🛑 PARAR TODAS as verificações desta transação primeiro
    stopAllChecksForTransaction(transactionId)
    console.log('🎉 [DEBUG] Verificações paradas')
    
    // Marcar como processado para evitar duplo processamento
    setPaymentProcessed(true)
    console.log('🎉 [DEBUG] Marcado como processado')
    
    // Parar verificação automática local
    if (autoCheck) {
      clearInterval(autoCheck)
      setAutoCheck(null)
      console.log('🎉 [DEBUG] AutoCheck parado')
    }
    
    // Parar monitoramento
    setIsMonitoring(false)
    console.log('🎉 [DEBUG] Monitoramento parado')
    
    // Atualizar saldo de tokens FXA
    triggerBalanceRefresh()
    console.log('🎉 [DEBUG] Balance refresh acionado')
    
    // 🔥 FORÇAR MODAL HARDCODED QUE NÃO PODE SER FECHADO POR NADA
    console.log('🔥 ATIVANDO MODAL HARDCODED!')
    setShowHardcodedSuccessModal(true)
    
    // NÃO mostrar modal de sucesso do useModal - apenas hardcoded
    // successModal.openModal() // DESABILITADO
    
    // Chamar callback de sucesso
    if (onSuccess) {
      console.log('🎉 [DEBUG] Chamando callback onSuccess')
      onSuccess(amount, transactionId)
    }
    
    // Toast de sucesso
    const tokensText = tokensAdded || calculateFixas(amount)
    console.log('🎉 [DEBUG] Exibindo toast com tokens:', tokensText)
    toast.success('PAGAMENTO_CONFIRMADO!', {
      description: `+${tokensText} TOKENS FXA adicionados à sua conta`
    })
    
    console.log('🎉 [DEBUG] handlePaymentSuccess concluído com sucesso!')
  }, [autoCheck, triggerBalanceRefresh, successModal, onSuccess, amount, calculateFixas, stopAllChecksForTransaction])

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
        console.log('🔍 Verificando status da transação:', transactionId)
        const statusData = await checkPaymentStatus(transactionId)
        
        if (statusData) {
          console.log('📊 Status recebido:', statusData.status, 'shouldStopChecking:', statusData.shouldStopChecking)
          
          // ✅ Verificar se deve parar completamente as verificações
          if (statusData.shouldStopChecking) {
            console.log('🛑 Servidor solicitou parada de verificações')
            
            // Se status é completed, processar sucesso
            if (statusData.status === 'completed' || statusData.status === 'COMPLETED') {
              console.log('🎉 Pagamento confirmado via shouldStopChecking! tokensAdded:', statusData.tokensAdded)
              handlePaymentSuccess(transactionId, statusData.tokensAdded)
            }
            
            return
          }
          
          // ✅ Verificação para casos onde ainda não deve parar
          if (statusData.status === 'completed' || statusData.status === 'COMPLETED') {
            console.log('🎉 Pagamento confirmado via status check! tokensAdded:', statusData.tokensAdded)
            
            // 🔥 FORÇAR MODAL DE SUCESSO - Debug
            console.log('🚨 FORÇANDO MODAL DE SUCESSO - DEBUG')
            handlePaymentSuccess(transactionId, statusData.tokensAdded || calculateFixas(amount))
            return
          }
          
          console.log('⏳ Status ainda pendente:', statusData.status)
        } else {
          console.log('❌ Nenhum status retornado')
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
  }, [checkPaymentStatus, paymentProcessed, isTransactionCached, handlePaymentSuccess, stopAllChecksForTransaction, registerActiveCheck, calculateFixas, amount])

  // 🔒 SISTEMA DE CRIAÇÃO ÚNICA E ANTI-DUPLICAÇÃO ULTRA RIGOROSO
  useEffect(() => {
    // ✅ Verificações fundamentais
    if (!isOpen) return
    if (currentTransaction) return // ✅ Já tem transação
    if (isLoading) return // ✅ Aguardar carregar
    
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
    const currentKey = `${userId}-${amount}-${Date.now()}`
    if (creationKey.current === currentKey) {
      console.log('🚫 Mesma chave de criação - BLOQUEANDO duplicação')
      return
    }
    
    // 🔒 BLOQUEAR imediatamente
    console.log('🔨 Iniciando criação ÚNICA de transação - Valor:', amount)
    isCreatingTransaction.current = true
    hasCreatedTransaction.current = true
    creationKey.current = currentKey

    const createTransaction = async () => {
      try {
        const transaction = await createPixDeposit(amount, userId)
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
  }, [isOpen, currentTransaction, isLoading, amount, userId, createPixDeposit, startAutoStatusCheck])

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
      
      // 🔄 Reset ABSOLUTO de TODAS as flags
      setPaymentProcessed(false)
      setIsMonitoring(false)
      setTimeLeft(null)
      setCopied(false)
      // 🔥 NÃO resetar modal hardcoded - deve ser independente!
      
      // 🔓 Liberar flags anti-duplicação para próxima abertura
      isCreatingTransaction.current = false
      hasCreatedTransaction.current = false
      creationKey.current = null
      
      console.log('✅ Reset completo finalizado')
    }
  }, [isOpen, autoCheck, stopAllActiveChecks])

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
    
    // 🔓 Reset flags anti-duplicação
    isCreatingTransaction.current = false
    hasCreatedTransaction.current = false
    creationKey.current = null
    
    // Limpar transação atual
    clearCurrentTransaction()
    
    // Fechar modal
    onClose()
  }, [clearCurrentTransaction, onClose, autoCheck, stopAllActiveChecks])

  // Fechar modal de sucesso
  const handleSuccessClose = useCallback(() => {
    console.log('🚪 handleSuccessClose chamado, showHardcodedSuccessModal:', showHardcodedSuccessModal)
    
    // Se o modal hardcoded estiver ativo, NÃO fechar o modal principal
    if (showHardcodedSuccessModal) {
      console.log('🔒 Modal hardcoded ativo - NÃO fechando modal principal')
      successModal.closeModal()
      return
    }
    
    // Se não há modal hardcoded, fechar normalmente
    successModal.closeModal()
    handleClose()
  }, [successModal, handleClose, showHardcodedSuccessModal])

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
      {/* Modal Principal de Pagamento */}
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={title}
        description={description}
        type="info"
      >
        <div className="space-y-6">
          {/* Header com valor e status */}
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Banknote className="h-6 w-6 text-green-400" />
                <h3 className="text-lg font-bold text-green-400 font-mono">COMPRA_CRÉDITOS</h3>
              </div>
              <div className="text-xl font-bold text-green-400 font-mono">
                R$ {amount.toFixed(2)}
              </div>
            </div>
            
            {/* Detalhes do que receberá */}
            <div className="mt-3 pt-3 border-t border-green-500/20">
              <div className="flex items-center justify-between text-sm font-mono">
                <span className="text-gray-400">TOKENS:</span>
                <div className="flex items-center gap-1">
                  <Coins className="h-4 w-4 text-purple-400" />
                  <span className="text-purple-400 font-bold">{calculateFixas(amount)} FXA</span>
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
            <p>3. Envie exatamente o valor mostrado: R$ {amount.toFixed(2)}</p>
            <p>4. O pagamento será confirmado automaticamente</p>
            <p>5. Seus créditos serão adicionados em instantes</p>
          </CollapsibleSection>

          {/* Botões de Ação */}
          <div className="flex gap-3">
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
              className="flex-1 border-gray-600 text-gray-400 hover:text-white"
            >
              CANCELAR
            </Button>
          </div>


        </div>
      </Modal>

      {/* Modal de Sucesso */}
      <Modal
        isOpen={successModal.isOpen}
        onClose={handleSuccessClose}
        title=""
        description=""
        type="success"
      >
        <div className="text-center space-y-6">
          {/* Success Animation Header */}
          <div className="relative">
            <div className="mx-auto w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-10 w-10 text-green-400" />
            </div>
          </div>

          {/* Success Message */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-green-400 font-mono">
              PAGAMENTO_CONFIRMADO!
            </h2>
            <p className="text-gray-300 font-mono text-sm">
              Seus tokens foram adicionados à sua conta
            </p>
          </div>

          {/* Transaction Details */}
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Banknote className="h-6 w-6 text-green-400" />
                <span className="font-semibold text-green-400 font-mono">COMPRA_REALIZADA</span>
              </div>
              <span className="text-green-400 font-bold font-mono">
                R$ {amount.toFixed(2)}
              </span>
            </div>
            
            <div className="border-t border-green-500/20 pt-3">
              <div className="flex items-center justify-between text-sm font-mono">
                <span className="text-gray-400">TOKENS_RECEBIDOS:</span>
                <div className="flex items-center gap-1">
                  <Coins className="h-4 w-4 text-purple-400" />
                  <span className="text-purple-400 font-bold">+{calculateFixas(amount)} FXA</span>
                </div>
              </div>
              
              <div className="border-t border-green-500/20 pt-2 mt-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-400">MÉTODO_PAGAMENTO:</span>
                  <span className="text-blue-400">PIX</span>
                </div>

                {currentTransaction && (
                  <div className="flex items-center justify-between text-xs font-mono mt-1">
                    <span className="text-gray-400">ID_TRANSAÇÃO:</span>
                    <span className="text-gray-300 text-xs">
                      #{currentTransaction.transactionId.slice(-8).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Success Actions */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 justify-center text-sm text-gray-400 font-mono">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span>Transação processada com sucesso</span>
            </div>
            
            <Button
              onClick={handleSuccessClose}
              className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono"
              variant="outline"
            >
              CONTINUAR
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* 🔥 MODAL HARDCODED QUE NÃO PODE SER FECHADO POR NADA */}
      {showHardcodedSuccessModal && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-green-500/30 rounded-lg p-8 max-w-md w-full shadow-2xl">
            <div className="text-center space-y-6">
              {/* Success Icon */}
              <div className="mx-auto w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-green-400" />
              </div>
              
              {/* Success Message */}
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-green-400 font-mono">
                  🎉 PAGAMENTO CONFIRMADO! 🎉
                </h2>
                <p className="text-gray-300 font-mono text-base">
                  Seus tokens foram adicionados à sua conta!
                </p>
              </div>
              
              {/* Details */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 font-mono">VALOR:</span>
                  <span className="text-green-400 font-bold font-mono">R$ {amount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 font-mono">TOKENS:</span>
                  <span className="text-purple-400 font-bold font-mono">+{calculateFixas(amount)} FXA</span>
                </div>
              </div>
              
              {/* Action Button */}
              <Button
                onClick={() => {
                  console.log('🔥 FECHANDO MODAL HARDCODED')
                  setShowHardcodedSuccessModal(false)
                }}
                className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono text-xl py-4"
              >
                🎯 CONTINUAR
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
} 