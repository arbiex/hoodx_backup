'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  ArrowLeft, 
  Clock, 
  DollarSign, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  CreditCard,
  Wallet,
  RefreshCw
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import MatrixRain from '@/components/MatrixRain'

interface WithdrawalHistory {
  id: string
  amount: number
  fee_amount: number
  net_amount: number
  withdrawal_type: 'pix' | 'crypto'
  crypto_type?: string
  wallet_address?: string
  pix_key_type?: string
  pix_key?: string
  full_name?: string
  cpf?: string
  status: 'pending' | 'completed' | 'cancelled' | 'failed' | 'reversed'
  created_at: string
  processed_at?: string
  rejection_reason?: string
  admin_notes?: string
}

export default function WithdrawalHistoryPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [withdrawals, setWithdrawals] = useState<WithdrawalHistory[]>([])
  const [loading, setLoading] = useState(true)

  const loadWithdrawalHistory = async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_user_withdrawal_history', {
        p_user_id: user.id
      })

      if (error) {
        console.error('Erro ao carregar histórico:', error)
        toast.error('Erro ao carregar histórico de saques')
        return
      }

      setWithdrawals(data || [])
    } catch (error) {
      console.error('Erro:', error)
      toast.error('Erro inesperado ao carregar histórico')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.id) {
      loadWithdrawalHistory()
    }
  }, [user?.id])

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/30',
          label: 'PENDENTE'
        }
      case 'completed':
        return {
          icon: CheckCircle,
          color: 'text-green-400',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/30',
          label: 'CONCLUÍDO'
        }
      case 'cancelled':
        return {
          icon: XCircle,
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
          label: 'CANCELADO'
        }
      case 'failed':
        return {
          icon: AlertCircle,
          color: 'text-red-400',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
          label: 'FALHOU'
        }
      case 'reversed':
        return {
          icon: XCircle,
          color: 'text-orange-400',
          bgColor: 'bg-orange-500/10',
          borderColor: 'border-orange-500/30',
          label: 'ESTORNADO'
        }
      default:
        return {
          icon: AlertCircle,
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/30',
          label: 'DESCONHECIDO'
        }
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTotalWithdrawn = () => {
    return withdrawals
      .filter(w => w.status === 'completed')
      .reduce((sum, w) => sum + w.amount, 0)
  }

  const getPendingAmount = () => {
    return withdrawals
      .filter(w => w.status === 'pending')
      .reduce((sum, w) => sum + w.amount, 0)
  }

  return (
    <div className="bg-black min-h-screen text-white relative">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10 max-w-6xl mx-auto p-6">
                {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-green-400 font-mono mb-2">
              HISTÓRICO_SAQUES
            </h1>
            <p className="text-gray-400 font-mono text-sm">
              {`// Todos os seus saques solicitados`}
            </p>
          </div>
          <Button
            onClick={() => router.back()}
            variant="ghost"
            className="text-gray-400 hover:text-white font-mono"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            VOLTAR
          </Button>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-green-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-green-400 font-mono text-sm">
                <CheckCircle className="h-4 w-4" />
                TOTAL_SACADO
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400 font-mono">
                R$ {getTotalWithdrawn().toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-yellow-400 font-mono text-sm">
                <Clock className="h-4 w-4" />
                PENDENTE
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-400 font-mono">
                R$ {getPendingAmount().toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-blue-400 font-mono text-sm">
                <DollarSign className="h-4 w-4" />
                TOTAL_SAQUES
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-400 font-mono">
                {withdrawals.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Saques */}
        <Card className="border-gray-700/30 bg-gray-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white font-mono">
              <Clock className="h-5 w-5" />
              HISTÓRICO_COMPLETO ({withdrawals.length})
            </CardTitle>
            <CardDescription className="text-gray-400 font-mono text-xs">
              {`// Ordenados por data de solicitação`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-green-400 mx-auto mb-4" />
                <p className="text-gray-400 font-mono">Carregando histórico...</p>
              </div>
            ) : withdrawals.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400 font-mono">
                  NENHUM_SAQUE_ENCONTRADO
                </p>
                <p className="text-gray-500 font-mono text-xs mt-2">
                  {`// Faça sua primeira solicitação de saque`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {withdrawals.map((withdrawal) => {
                  const statusInfo = getStatusInfo(withdrawal.status)
                  const StatusIcon = statusInfo.icon

                  return (
                    <div
                      key={withdrawal.id}
                      className={`border rounded-lg p-4 transition-colors ${statusInfo.borderColor} ${statusInfo.bgColor}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {/* Header com status e tipo */}
                          <div className="flex items-center gap-3 mb-3">
                            <StatusIcon className={`h-5 w-5 ${statusInfo.color}`} />
                            <Badge className={`${statusInfo.bgColor} ${statusInfo.color} ${statusInfo.borderColor} font-mono text-xs`}>
                              {statusInfo.label}
                            </Badge>
                            <div className="flex items-center gap-1">
                              {withdrawal.withdrawal_type === 'pix' ? (
                                <CreditCard className="h-4 w-4 text-green-400" />
                              ) : (
                                <Wallet className="h-4 w-4 text-purple-400" />
                              )}
                              <span className="text-gray-400 font-mono text-xs">
                                {withdrawal.withdrawal_type === 'pix' ? 'PIX' : withdrawal.crypto_type}
                              </span>
                            </div>
                          </div>

                          {/* Valores */}
                          <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                            <div>
                              <span className="text-gray-400">Valor solicitado:</span>
                              <div className={`font-mono font-bold ${statusInfo.color}`}>
                                R$ {withdrawal.amount.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <span className="text-gray-400">Taxa:</span>
                              <div className="text-gray-300 font-mono">
                                R$ {withdrawal.fee_amount.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <span className="text-gray-400">Valor líquido:</span>
                              <div className="text-white font-mono font-bold">
                                R$ {withdrawal.net_amount.toFixed(2)}
                              </div>
                            </div>
                          </div>

                          {/* Detalhes do destino */}
                          <div className="text-xs font-mono text-gray-400 mb-2">
                            {withdrawal.withdrawal_type === 'pix' ? (
                              <div>
                                PIX {withdrawal.pix_key_type?.toUpperCase()}: {withdrawal.pix_key}
                                {withdrawal.full_name && <span> • {withdrawal.full_name}</span>}
                              </div>
                            ) : (
                              <div>
                                Carteira: {withdrawal.wallet_address}
                              </div>
                            )}
                          </div>

                          {/* Datas */}
                          <div className="text-xs font-mono text-gray-500">
                            Solicitado em: {formatDate(withdrawal.created_at)}
                            {withdrawal.processed_at && (
                              <span className="ml-4">
                                Processado em: {formatDate(withdrawal.processed_at)}
                              </span>
                            )}
                          </div>

                          {/* Notas admin ou motivo de rejeição */}
                          {withdrawal.admin_notes && (
                            <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs">
                              <div className="text-blue-400 font-mono font-semibold mb-1">OBSERVAÇÕES_ADMIN:</div>
                              <div className="text-gray-300 font-mono">{withdrawal.admin_notes}</div>
                            </div>
                          )}

                          {withdrawal.rejection_reason && (
                            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs">
                              <div className="text-red-400 font-mono font-semibold mb-1">MOTIVO_REJEIÇÃO:</div>
                              <div className="text-gray-300 font-mono">{withdrawal.rejection_reason}</div>
                            </div>
                          )}
                        </div>

                        {/* ID do saque (pequeno) */}
                        <div className="text-right ml-4">
                          <div className="text-xs text-gray-500 font-mono">
                            ID: {withdrawal.id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 