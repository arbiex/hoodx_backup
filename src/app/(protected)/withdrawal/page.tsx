'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DollarSign, Clock, History, ArrowLeft } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import MatrixRain from '@/components/MatrixRain'
import Modal, { useModal } from '@/components/ui/modal'
import { useRouter } from 'next/navigation'
import { useNetwork } from '@/hooks/useNetwork'

export default function WithdrawalPage() {
  const router = useRouter()
  const { isOpen: isWithdrawalModalOpen, openModal: openWithdrawalModal, closeModal: closeWithdrawalModal } = useModal()
  
  const {
    commissionBalance,
    withdrawalHistory,
    requestWithdrawal,
    loadFullData
  } = useNetwork()

  // Load withdrawal history when page mounts
  useEffect(() => {
    loadFullData()
  }, [loadFullData])

  const [withdrawalForm, setWithdrawalForm] = useState({
    amount: '',
    pixKeyType: 'email',
    pixKey: '',
    fullName: '',
    cpf: ''
  })

  const [loading, setLoading] = useState(false)

  // Check withdrawal eligibility based on last withdrawal date
  const [isWithdrawalEnabled, setIsWithdrawalEnabled] = useState(false)
  const [withdrawalTimeLeft, setWithdrawalTimeLeft] = useState(0)

  // Check withdrawal eligibility on mount and when balance changes
  useEffect(() => {
    if (commissionBalance?.last_withdrawal_at) {
      const lastWithdrawal = new Date(commissionBalance.last_withdrawal_at)
      const nextWithdrawal = new Date(lastWithdrawal.getTime() + (7 * 24 * 60 * 60 * 1000)) // 7 days later
      const now = new Date()
      
      if (now >= nextWithdrawal) {
        setIsWithdrawalEnabled(true)
        setWithdrawalTimeLeft(0)
      } else {
        setIsWithdrawalEnabled(false)
        setWithdrawalTimeLeft(Math.floor((nextWithdrawal.getTime() - now.getTime()) / 1000))
      }
    } else {
      setIsWithdrawalEnabled(true) // First withdrawal
      setWithdrawalTimeLeft(0)
    }
  }, [commissionBalance])

  const availableBalance = commissionBalance?.commission_balance || 0

  // Countdown timer effect
  useEffect(() => {
    if (withdrawalTimeLeft <= 0) {
      setIsWithdrawalEnabled(true)
      return
    }

    const timer = setInterval(() => {
      setWithdrawalTimeLeft(prev => {
        if (prev <= 1) {
          setIsWithdrawalEnabled(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [withdrawalTimeLeft])

  // Format time for countdown display
  const formatTimeLeft = (seconds: number) => {
    if (seconds <= 0) return "00:00:00:00"
    
    const days = Math.floor(seconds / (24 * 60 * 60))
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60))
    const minutes = Math.floor((seconds % (60 * 60)) / 60)
    const secs = seconds % 60
    
    return `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleInputChange = (field: string, value: string) => {
    setWithdrawalForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleWithdrawalSubmit = async () => {
    if (!withdrawalForm.amount || !withdrawalForm.pixKey || !withdrawalForm.fullName || !withdrawalForm.cpf) {
      toast.error('Todos os campos são obrigatórios')
      return
    }

    const amount = parseFloat(withdrawalForm.amount)
    if (amount <= 0 || amount > availableBalance) {
      toast.error('Valor de saque inválido')
      return
    }

    if (amount < 10) {
      toast.error('Valor mínimo de saque é R$ 10,00')
      return
    }

    setLoading(true)

    try {
      await requestWithdrawal({
        amount,
        pix_key_type: withdrawalForm.pixKeyType,
        pix_key: withdrawalForm.pixKey,
        full_name: withdrawalForm.fullName,
        cpf: withdrawalForm.cpf
      })

      closeWithdrawalModal()
      
      // Reset form
      setWithdrawalForm({
        amount: '',
        pixKeyType: 'email',
        pixKey: '',
        fullName: '',
        cpf: ''
      })

      toast.success('Solicitação de saque enviada', {
        description: 'Seu saque será processado em até 24 horas'
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Falha ao enviar solicitação de saque'
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/50'
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/50'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50'
    }
  }

  const calculateFee = (amount: number) => {
    return amount * 0.03 // 3% fee
  }

  return (
    <div className="px-4 relative">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-green-400 font-mono mb-2">SAQUE.exe</h1>
            <p className="text-gray-400 font-mono text-sm">// Gerencie seus saques de comissão</p>
          </div>
          <Button
            onClick={() => router.back()}
            className="bg-gray-500/20 border border-gray-500/50 text-gray-400 hover:bg-gray-500/30 font-mono"
            size="sm"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            VOLTAR
          </Button>
        </div>

        {/* Withdrawal Access */}
        <Card className="mb-8 border-purple-500/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-purple-400 font-mono flex items-center gap-2">
              <Clock className="h-5 w-5" />
              ACESSO_SAQUE
            </CardTitle>
            <CardDescription className="text-gray-400 font-mono text-xs">
              // Gerenciamento de saques de comissão
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isWithdrawalEnabled ? (
              <div className="text-center p-6">
                <Clock className="h-12 w-12 text-purple-400 mx-auto mb-4" />
                <div className="text-lg font-bold font-mono text-purple-400 mb-2">
                  COOLDOWN_SAQUE
                </div>
                <div className="text-2xl font-bold font-mono text-white mb-4">
                  {formatTimeLeft(withdrawalTimeLeft)}
                </div>
                <div className="text-xs text-gray-400 font-mono">
                  Dias : Horas : Minutos : Segundos
                </div>
                <div className="text-sm text-gray-500 font-mono mt-2">
                  Próximo saque disponível após período de cooldown
                </div>
              </div>
            ) : (
              <div className="text-center p-6">
                <DollarSign className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <div className="text-lg font-bold font-mono text-green-400 mb-4">
                  SAQUE_DISPONÍVEL
                </div>
                <Button
                  onClick={openWithdrawalModal}
                  className="bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono px-8 py-3"
                  disabled={availableBalance < 50}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  SOLICITAR_SAQUE
                </Button>
                <div className="text-sm text-gray-400 font-mono mt-2">
                  Saldo disponível: R$ {availableBalance.toFixed(2)} • Taxa 3% • Processamento 24h
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Withdrawal History */}
        <Card className="border-green-500/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-green-400 font-mono flex items-center gap-2">
              <History className="h-5 w-5" />
              HISTÓRICO_SAQUES
            </CardTitle>
            <CardDescription className="text-gray-400 font-mono text-xs">
              // Suas solicitações de saque e status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {withdrawalHistory.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 font-mono">NENHUM_SAQUE_ENCONTRADO</div>
                <p className="text-xs text-gray-500 font-mono mt-2">
                  Nenhuma solicitação de saque foi feita ainda
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {withdrawalHistory.map((withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-700/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                      <div>
                        <div className="font-medium font-mono text-green-400 text-sm">
                          {withdrawal.id}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">
                          PIX: {withdrawal.pix_key} • Solicitado: {new Date(withdrawal.created_at).toLocaleString()}
                        </div>
                        {withdrawal.status === 'completed' && (
                          <div className="text-xs text-gray-400 font-mono">
                            Concluído: Processamento completo
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right flex items-center gap-4">
                      <div>
                        <div className="font-bold font-mono text-green-400 text-sm">
                          {formatCurrency(withdrawal.net_amount)}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">
                          Taxa: {formatCurrency(withdrawal.fee_amount)}
                        </div>
                      </div>
                      
                      <Badge className={`text-xs font-mono ${getStatusColor(withdrawal.status)}`}>
                        {withdrawal.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Withdrawal Modal */}
        <Modal
          isOpen={isWithdrawalModalOpen}
          onClose={closeWithdrawalModal}
          title="SOLICITAR_SAQUE"
          description="Envie os detalhes da sua solicitação de saque"
          size="md"
          actions={{
            primary: {
              label: loading ? 'PROCESSANDO...' : 'ENVIAR_SOLICITAÇÃO',
              onClick: handleWithdrawalSubmit,
              loading: loading,
              disabled: loading
            },
            secondary: {
              label: 'CANCELAR',
              onClick: closeWithdrawalModal,
              disabled: loading
            }
          }}
        >
          <div className="space-y-4">
            {/* Amount */}
            <div>
              <label className="text-green-400 font-mono text-sm mb-2 block">VALOR</label>
              <Input
                type="number"
                placeholder="0.00"
                value={withdrawalForm.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                className="bg-black/50 border-green-500/30 text-green-400 font-mono"
                min="50"
                max={availableBalance}
                step="0.01"
              />
              {withdrawalForm.amount && (
                <div className="text-xs text-gray-400 font-mono mt-1">
                  Taxa (3%): {formatCurrency(calculateFee(parseFloat(withdrawalForm.amount) || 0))} • 
                  Líquido: {formatCurrency((parseFloat(withdrawalForm.amount) || 0) - calculateFee(parseFloat(withdrawalForm.amount) || 0))}
                </div>
              )}
            </div>

            {/* PIX Key Type */}
            <div>
              <label className="text-green-400 font-mono text-sm mb-2 block">TIPO_CHAVE_PIX</label>
              <select
                value={withdrawalForm.pixKeyType}
                onChange={(e) => handleInputChange('pixKeyType', e.target.value)}
                className="w-full bg-black/50 border border-green-500/30 text-green-400 font-mono text-sm rounded px-3 py-2"
              >
                <option value="email">Email</option>
                <option value="phone">Telefone</option>
                <option value="cpf">CPF</option>
                <option value="random">Chave Aleatória</option>
              </select>
            </div>

            {/* PIX Key */}
            <div>
              <label className="text-green-400 font-mono text-sm mb-2 block">CHAVE_PIX</label>
              <Input
                type="text"
                placeholder={`Digite sua chave PIX ${withdrawalForm.pixKeyType === 'email' ? 'email' : withdrawalForm.pixKeyType === 'phone' ? 'telefone' : withdrawalForm.pixKeyType === 'random' ? 'aleatória' : withdrawalForm.pixKeyType}`}
                value={withdrawalForm.pixKey}
                onChange={(e) => handleInputChange('pixKey', e.target.value)}
                className="bg-black/50 border-green-500/30 text-green-400 font-mono"
              />
            </div>

            {/* Full Name */}
            <div>
              <label className="text-green-400 font-mono text-sm mb-2 block">NOME_COMPLETO</label>
              <Input
                type="text"
                placeholder="Nome completo conforme documentos"
                value={withdrawalForm.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                className="bg-black/50 border-green-500/30 text-green-400 font-mono"
              />
            </div>

            {/* CPF */}
            <div>
              <label className="text-green-400 font-mono text-sm mb-2 block">CPF</label>
              <Input
                type="text"
                placeholder="000.000.000-00"
                value={withdrawalForm.cpf}
                onChange={(e) => handleInputChange('cpf', e.target.value)}
                className="bg-black/50 border-green-500/30 text-green-400 font-mono"
                maxLength={14}
              />
            </div>

            {/* Info */}
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="text-xs text-yellow-400 font-mono">
                ⚠️ Tempo de processamento: Até 24 horas<br/>
                ⚠️ Taxa de processamento: 3% do valor do saque<br/>
                ⚠️ Saque mínimo: R$ 50,00
              </div>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  )
} 