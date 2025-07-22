'use client'

import { useState, useEffect } from 'react'
import AdminHeader from '@/components/AdminHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Coins, DollarSign, Users, TrendingUp, Search, Calendar, CreditCard, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface UserTokenStats {
  user_id: string
  user_email: string
  total_purchases: number
  total_amount_brl: number
  total_tokens: number
  first_purchase: string
  last_purchase: string
  avg_price_per_token: number
  purchase_count: number
}

export default function AdminTokensPage() {
  const [userStats, setUserStats] = useState<UserTokenStats[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [totalStats, setTotalStats] = useState({
    total_users: 0,
    total_revenue: 0,
    total_tokens_sold: 0,
    total_transactions: 0
  })

  // Função para buscar dados de compras de tokens de TODOS os usuários
  const fetchTokenStats = async () => {
    try {
      setLoading(true)

      const { data: { user: currentUser } } = await supabase.auth.getUser()
      
      if (!currentUser) {
        console.error('Usuário não autenticado')
        return
      }

      // Buscar dados de TODOS os usuários via API admin
      const response = await fetch('/api/admin/token-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestUserId: currentUser.id
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Erro na API admin:', errorData.error)
        return
      }

      const data = await response.json()
      
      setUserStats(data.userStats || [])
      setTotalStats(data.totalStats || {
        total_users: 0,
        total_revenue: 0,
        total_tokens_sold: 0,
        total_transactions: 0
      })

    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCurrentUser()
    fetchTokenStats()
  }, [])

  // Função para carregar usuário atual
  const loadCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
    } catch (error) {
      console.error('Erro ao carregar usuário:', error)
    }
  }

  // Filtrar usuários pelo termo de busca
  const filteredUsers = userStats.filter(user => 
    user.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

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

  return (
    <div className="bg-black min-h-screen text-white">
      {/* Admin Header */}
      <AdminHeader 
        currentUser={currentUser}
        additionalActions={
          <Button
            onClick={fetchTokenStats}
            disabled={loading}
            className="bg-blue-500/20 border border-blue-500/50 text-blue-400 hover:bg-blue-500/30 font-mono"
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            ATUALIZAR
          </Button>
        }
      />

      {/* Conteúdo da página */}
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Título da página */}
        <div>
          <h1 className="text-3xl font-bold text-green-400 font-mono mb-2">
            ADMIN_TOKENS
          </h1>
          <p className="text-gray-400 font-mono text-sm">
            {`// Relatório de compras de tokens FXA`}
          </p>
        </div>

      {/* Cards de Estatísticas Gerais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-green-500/30 bg-gray-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-green-400 font-mono text-sm">
              <Users className="h-4 w-4" />
              USUÁRIOS_COMPRADORES
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400 font-mono">
              {totalStats.total_users}
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30 bg-gray-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-blue-400 font-mono text-sm">
              <DollarSign className="h-4 w-4" />
              RECEITA_TOTAL
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400 font-mono">
              {formatCurrency(totalStats.total_revenue)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-500/30 bg-gray-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-purple-400 font-mono text-sm">
              <Coins className="h-4 w-4" />
              TOKENS_VENDIDOS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400 font-mono">
              {totalStats.total_tokens_sold.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/30 bg-gray-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-yellow-400 font-mono text-sm">
              <CreditCard className="h-4 w-4" />
              TRANSAÇÕES
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400 font-mono">
              {totalStats.total_transactions}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <Card className="border-gray-700/30 bg-gray-900/50">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por email ou ID do usuário..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-gray-800 border-gray-600 text-white font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lista de Usuários */}
      <Card className="border-gray-700/30 bg-gray-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white font-mono">
            <Users className="h-5 w-5" />
            USUÁRIOS_COMPRADORES ({filteredUsers.length})
          </CardTitle>
          <CardDescription className="text-gray-400 font-mono text-xs">
            {`// Ordenados por valor total gasto`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-400 mx-auto mb-4" />
              <p className="text-gray-400 font-mono">Carregando dados...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 font-mono">
                {searchTerm ? 'Nenhum usuário encontrado para a busca' : 'Nenhuma compra encontrada'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div
                  key={user.user_id}
                  className="border border-gray-700/50 rounded-lg p-4 hover:bg-gray-800/30 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-white font-mono font-semibold">
                          {user.user_email}
                        </div>
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-mono text-xs">
                          {user.purchase_count} compra{user.purchase_count > 1 ? 's' : ''}
                        </Badge>
                      </div>
                      
                      <div className="text-xs font-mono text-gray-400 mb-2">
                        ID: {user.user_id}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">Primeira compra:</span>
                          <div className="text-gray-300 font-mono text-xs">
                            {formatDate(user.first_purchase)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-400">Última compra:</span>
                          <div className="text-gray-300 font-mono text-xs">
                            {formatDate(user.last_purchase)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-right ml-4">
                      <div className="text-green-400 font-bold font-mono text-lg">
                        {formatCurrency(user.total_amount_brl)}
                      </div>
                      <div className="text-purple-400 font-mono text-sm">
                        {user.total_tokens.toLocaleString()} tokens
                      </div>
                      <div className="text-gray-400 font-mono text-xs mt-1">
                        Média: {formatCurrency(user.avg_price_per_token)}/token
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  )
} 