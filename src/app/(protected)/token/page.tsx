'use client'

import MatrixRain from '@/components/MatrixRain'
import CreditDisplay from '@/components/CreditDisplay'
import { useFxaTokens } from '@/hooks/useFxaTokens'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { History, TrendingUp, TrendingDown, Calendar, CreditCard } from 'lucide-react'

export default function TokenPage() {
  const { user } = useAuth()
  const { transactions, isLoading: transactionsLoading } = useFxaTokens(user?.id)

  // Função para formatar data
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Função para formatar moeda
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  // Função para obter ícone do tipo de transação
  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'credit':
        return <TrendingUp className="h-4 w-4 text-green-400" />
      case 'debit':
        return <TrendingDown className="h-4 w-4 text-red-400" />
      default:
        return <CreditCard className="h-4 w-4 text-purple-400" />
    }
  }

  // Função para obter cor do tipo de transação
  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'credit':
        return 'text-green-400'
      case 'debit':
        return 'text-red-400'
      default:
        return 'text-purple-400'
    }
  }

  // Função para obter texto do tipo de transação
  const getTransactionTypeText = (type: string) => {
    switch (type) {
      case 'credit':
        return 'COMPRA'
      case 'debit':
        return 'DÉBITO'
      default:
        return 'TRANSAÇÃO'
    }
  }

  return (
    <div className="px-4 relative">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10">
        <div className="flex flex-col gap-6">


          {/* Card de Tokens FXA */}
          <CreditDisplay />

          {/* Card de Histórico de Compras */}
          <Card className="border-gray-700/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
                <History className="h-5 w-5" />
                HISTÓRICO_TRANSAÇÕES
              </CardTitle>
              <CardDescription className="text-gray-400 font-mono text-xs">
                {`// Suas compras e movimentações de tokens`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transactionsLoading ? (
                // Loading state
                <div className="text-center py-8">
                  <div className="inline-flex items-center gap-3 text-purple-400 font-mono text-sm">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                    <span>CARREGANDO_HISTÓRICO...</span>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                  </div>
                </div>
              ) : transactions.length === 0 ? (
                // Empty state
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-400 font-mono text-sm">
                    NENHUMA_TRANSAÇÃO_ENCONTRADA
                  </p>
                  <p className="text-gray-500 font-mono text-xs mt-2">
                    {`// Suas compras aparecerão aqui`}
                  </p>
                </div>
              ) : (
                // Transactions list
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {transactions.slice(0, 20).map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 bg-gray-800/30 border border-gray-600/30 rounded-lg hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {getTransactionIcon(transaction.transaction_type)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-mono text-sm font-semibold ${getTransactionColor(transaction.transaction_type)}`}>
                              {getTransactionTypeText(transaction.transaction_type)}
                            </span>
                            {transaction.payment_reference && (
                              <span className="text-xs font-mono text-gray-500">
                                REF: {transaction.payment_reference.slice(-8)}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-gray-400 mt-1">
                            {formatDate(transaction.created_at)}
                          </div>
                          {transaction.amount_brl && transaction.amount && (
                            <div className="text-xs font-mono text-gray-500 mt-1">
                              Pago: R$ {transaction.amount_brl.toFixed(2)} • Tokens: {transaction.amount} • Preço/token: R$ {(transaction.amount_brl / transaction.amount).toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                      
                                            <div className="text-right">
                        <div className={`font-mono font-bold ${getTransactionColor(transaction.transaction_type)}`}>
                          {transaction.transaction_type === 'credit' ? '+' : '-'}{transaction.amount.toLocaleString()} FXA
                        </div>
                        {transaction.amount_brl && (
                          <div className="text-xs font-mono text-gray-400 mt-1">
                            R$ {transaction.amount_brl.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Indicador se há mais transações */}
                  {transactions.length > 20 && (
                    <div className="text-center py-4 border-t border-gray-600/30">
                      <p className="text-xs font-mono text-gray-500">
                        {`// Mostrando últimas 20 transações de ${transactions.length} total`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 