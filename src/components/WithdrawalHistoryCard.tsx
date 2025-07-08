'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, DollarSign, CreditCard, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { useWithdrawal } from '@/hooks/useWithdrawal'

export function WithdrawalHistoryCard() {
  const { withdrawalHistory, loading } = useWithdrawal()

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-400" />
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-400" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-400" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-400" />
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-gray-400" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'border-yellow-500/50 text-yellow-400'
      case 'processing':
        return 'border-blue-500/50 text-blue-400'
      case 'completed':
        return 'border-green-500/50 text-green-400'
      case 'failed':
        return 'border-red-500/50 text-red-400'
      case 'cancelled':
        return 'border-gray-500/50 text-gray-400'
      default:
        return 'border-gray-500/50 text-gray-400'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pendente'
      case 'processing':
        return 'Processando'
      case 'completed':
        return 'Concluído'
      case 'failed':
        return 'Rejeitado'
      case 'cancelled':
        return 'Cancelado'
      default:
        return status
    }
  }

  if (loading) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-400" />
            Extrato de Saques
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-400">Carregando histórico...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-400" />
          Extrato de Saques
        </CardTitle>
      </CardHeader>
      <CardContent>
        {withdrawalHistory.length === 0 ? (
          <div className="text-center py-8">
            <DollarSign className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">Nenhum saque realizado ainda</p>
            <p className="text-sm text-gray-500 mt-2">
              Seus saques aparecerão aqui
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {withdrawalHistory.map((withdrawal) => (
              <div
                key={withdrawal.id}
                className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50 border border-gray-700"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(withdrawal.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">
                          R$ {withdrawal.amount.toFixed(2)}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getStatusColor(withdrawal.status)}`}
                        >
                          {getStatusText(withdrawal.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                        <span>
                          {withdrawal.withdrawal_type === 'crypto' ? (
                            <>
                              <CreditCard className="h-3 w-3 inline mr-1" />
                              {withdrawal.crypto_type}
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-3 w-3 inline mr-1" />
                              PIX {withdrawal.pix_key_type?.toUpperCase()}
                            </>
                          )}
                        </span>
                        <span>
                          {new Date(withdrawal.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-sm text-gray-300">
                    Valor Solicitado
                  </div>
                  <div className="text-lg font-semibold text-white">
                    R$ {withdrawal.amount.toFixed(2)}
                  </div>
                  {withdrawal.status === 'completed' && (
                    <div className="text-xs text-gray-400 mt-1">
                      Recebido: R$ {withdrawal.net_amount.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
} 