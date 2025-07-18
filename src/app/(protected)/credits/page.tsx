'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DollarSign, TrendingUp, TrendingDown, Clock, CreditCard, History } from 'lucide-react'
import MatrixRain from '@/components/MatrixRain'

import { useCredits } from '@/hooks/useCredits'
import { format } from 'date-fns'

export default function Credits() {
  const { 
    credits, 
    transactions, 
    operationStats, 
    loading 
  } = useCredits()

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'purchase':
        return <TrendingUp className="h-4 w-4 text-green-400" />
      case 'debit':
        return <TrendingDown className="h-4 w-4 text-red-400" />
      case 'bonus':
        return <DollarSign className="h-4 w-4 text-yellow-400" />
      case 'refund':
        return <CreditCard className="h-4 w-4 text-blue-400" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'purchase':
        return 'text-green-400'
      case 'debit':
        return 'text-red-400'
      case 'bonus':
        return 'text-yellow-400'
      case 'refund':
        return 'text-blue-400'
      default:
        return 'text-gray-400'
    }
  }

  return (
    <div className="px-4 relative">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10">
        <div className="flex flex-col gap-6">
          
          {/* Credits Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Available Credits */}
            <Card className="border-green-500/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
                  <DollarSign className="h-5 w-5" />
                  CRÉDITOS_DISPONÍVEIS
                </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
                  {`// Prontos para operações`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-green-400">
                  {loading ? 'CARREGANDO...' : credits ? formatCurrency(credits.available_credits) : formatCurrency(0)}
                </div>
                <p className="text-xs text-gray-500 font-mono mt-1">
                  Última atualização: {credits?.last_transaction_at ? format(new Date(credits.last_transaction_at), 'dd/MM/yyyy HH:mm') : 'Nunca'}
                </p>
              </CardContent>
            </Card>

            {/* In Use Credits */}
            <Card className="border-yellow-500/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-400 font-mono">
                  <Clock className="h-5 w-5" />
                  CRÉDITOS_EM_USO
                </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
                  {`// Atualmente alocados`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-yellow-400">
                  {loading ? 'CARREGANDO...' : credits ? formatCurrency(credits.in_use_credits) : formatCurrency(0)}
                </div>
                <p className="text-xs text-gray-500 font-mono mt-1">
                  Total ganho: {credits ? formatCurrency(credits.total_earned) : formatCurrency(0)}
                </p>
              </CardContent>
            </Card>
          </div>





          {/* Transaction History */}
          <Card className="border-green-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
                <History className="h-5 w-5" />
                HISTÓRICO_TRANSAÇÕES
              </CardTitle>
              <CardDescription className="text-gray-400 font-mono text-xs">
                {`// Transações recentes de créditos`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="text-green-400 font-mono">CARREGANDO_TRANSAÇÕES...</div>
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 font-mono">NENHUMA_TRANSAÇÃO_ENCONTRADA</div>
                  <p className="text-xs text-gray-500 font-mono mt-2">
                    Compre seu primeiro pacote de créditos para começar
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-700/50"
                    >
                      <div className="flex items-center gap-3">
                        {getTransactionIcon(transaction.transaction_type)}
                        <div>
                          <div className="font-medium font-mono text-sm text-white">
                            {transaction.package_name || transaction.description || transaction.transaction_type.toUpperCase()}
                          </div>
                          <div className="text-xs text-gray-400 font-mono">
                            {format(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm')}
                            {transaction.payment_method && ` • ${transaction.payment_method}`}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className={`font-bold font-mono text-sm ${getTransactionColor(transaction.transaction_type)}`}>
                          {transaction.transaction_type === 'debit' ? '-' : '+'}
                          {formatCurrency(Math.abs(transaction.amount))}
                        </div>
                        <Badge 
                          variant={transaction.status === 'completed' ? 'default' : 'secondary'}
                          className={`text-xs font-mono mt-1 ${
                            transaction.status === 'completed' 
                              ? 'bg-green-500/20 text-green-400 border-green-500/50' 
                              : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                          }`}
                        >
                          {transaction.status.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 