'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import AdminHeader from '@/components/AdminHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import Modal, { useModal } from '@/components/ui/modal'
import { 
  Brain, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Users, 
  DollarSign, 
  Activity,
  Crown,
  AlertTriangle,
  Check,
  X,
  CreditCard,
  RefreshCw
} from 'lucide-react'
import { toast } from 'sonner'

interface Agent {
  id: string
  user_id: string
  email: string
  agent_code: string
  commission_rate: number
  is_active: boolean
  total_referrals: number
  total_commissions_generated: number
  created_at: string
  updated_at: string
}

interface User {
  id: string
  email: string
  created_at: string
}

interface PendingWithdrawal {
  id: string
  user_id: string
  user_email: string
  agent_code: string
  amount: number
  fee_amount: number
  net_amount: number
  withdrawal_type: string
  crypto_type?: string
  wallet_address?: string
  pix_key_type?: string
  pix_key?: string
  full_name?: string
  cpf?: string
  status: string
  created_at: string
  admin_notes?: string
}

export default function AgentsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Saques pendentes
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingWithdrawal[]>([])
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false)
  
  // Modal states
  const { isOpen: isCreateModalOpen, openModal: openCreateModal, closeModal: closeCreateModal } = useModal()
  const { isOpen: isEditModalOpen, openModal: openEditModal, closeModal: closeEditModal } = useModal()
  const { isOpen: isWithdrawalModalOpen, openModal: openWithdrawalModal, closeModal: closeWithdrawalModal } = useModal()
  
  // Form states
  const [selectedUserId, setSelectedUserId] = useState('')
  const [commissionRate, setCommissionRate] = useState('50.00')
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<PendingWithdrawal | null>(null)
  const [processingWithdrawal, setProcessingWithdrawal] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [reversalJustification, setReversalJustification] = useState('')

  useEffect(() => {
    checkCurrentUser()
    loadAgents()
    loadUsers()
    loadPendingWithdrawals()
  }, [])

  const checkCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)
  }

  const loadAgents = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_all_agents')
      
      if (error) {
        console.error('Erro ao carregar agentes:', error)
        toast.error('Erro ao carregar agentes')
        return
      }

      setAgents(data || [])
    } catch (error) {
      console.error('Erro:', error)
      toast.error('Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase.rpc('get_users_admin_simple')
      
      if (error) {
        console.error('Erro ao carregar usuários:', error)
        return
      }

      // A função RPC retorna um array de usuários diretamente
      const usersData = Array.isArray(data) ? data : []
      
      // Filtrar usuários que não são agentes
      const agentUserIds = agents.map(agent => agent.user_id)
      const availableUsers = usersData.filter((user: User) => !agentUserIds.includes(user.id))
      setUsers(availableUsers)
    } catch (error) {
      console.error('Erro ao carregar usuários:', error)
    }
  }

  const loadPendingWithdrawals = async () => {
    try {
      setLoadingWithdrawals(true)
      const { data, error } = await supabase.rpc('get_pending_withdrawals')
      
      if (error) {
        console.error('Erro ao carregar saques pendentes:', error)
        toast.error('Erro ao carregar saques pendentes')
        return
      }

      setPendingWithdrawals(data || [])
    } catch (error) {
      console.error('Erro ao carregar saques pendentes:', error)
      toast.error('Erro inesperado ao carregar saques')
    } finally {
      setLoadingWithdrawals(false)
    }
  }

  const createAgent = async () => {
    if (!selectedUserId || !commissionRate) {
      toast.error('Campos obrigatórios', {
        description: 'Selecione um usuário e defina a taxa de comissão'
      })
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('create_agent', {
        p_user_id: selectedUserId,
        p_commission_rate: parseFloat(commissionRate)
      })

      if (error) {
        console.error('Erro ao criar agente:', error)
        toast.error('Erro ao criar agente')
        return
      }

      toast.success('Agente criado com sucesso', {
        description: `Código do agente: ${data.agent_code}`
      })
      
      closeCreateModal()
      setSelectedUserId('')
      setCommissionRate('50.00')
      setUserSearchTerm('')
      loadAgents()
      loadUsers()
    } catch (error) {
      console.error('Erro:', error)
      toast.error('Erro inesperado ao criar agente')
    } finally {
      setLoading(false)
    }
  }

  const openEditAgentModal = (agent: Agent) => {
    setEditingAgent(agent)
    setCommissionRate(agent.commission_rate.toString())
    openEditModal()
  }

  const updateAgent = async () => {
    if (!editingAgent || !commissionRate) {
      toast.error('Dados inválidos')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('update_agent_commission', {
        p_agent_code: editingAgent.agent_code,
        p_commission_rate: parseFloat(commissionRate)
      })

      if (error) {
        console.error('Erro ao atualizar agente:', error)
        toast.error('Erro ao atualizar agente')
        return
      }

      toast.success('Agente atualizado com sucesso')
      closeEditModal()
      setEditingAgent(null)
      setCommissionRate('50.00')
      loadAgents()
    } catch (error) {
      console.error('Erro:', error)
      toast.error('Erro inesperado ao atualizar agente')
    } finally {
      setLoading(false)
    }
  }

  const deleteAgent = async (agentId: string) => {
    if (!confirm('Tem certeza que deseja remover este agente? Esta ação não pode ser desfeita.')) {
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', agentId)

      if (error) {
        console.error('Erro ao remover agente:', error)
        toast.error('Erro ao remover agente')
        return
      }

      toast.success('Agente removido com sucesso')
      loadAgents()
      loadUsers()
    } catch (error) {
      console.error('Erro:', error)
      toast.error('Erro inesperado ao remover agente')
    } finally {
      setLoading(false)
    }
  }

  const openWithdrawalDetails = (withdrawal: PendingWithdrawal) => {
    setSelectedWithdrawal(withdrawal)
    openWithdrawalModal()
  }

  const closeWithdrawalDetails = () => {
    closeWithdrawalModal()
    setSelectedWithdrawal(null)
    setAdminNotes('')
    setReversalJustification('')
  }

  const approveWithdrawal = async () => {
    if (!selectedWithdrawal || !currentUser?.id) return

    setProcessingWithdrawal(true)
    try {
      console.log('✅ Iniciando aprovação:', {
        withdrawal_id: selectedWithdrawal.id,
        admin_notes: adminNotes,
        admin_user_id: currentUser.id
      })

      const { data, error } = await supabase.rpc('approve_agent_withdrawal', {
        p_withdrawal_id: selectedWithdrawal.id,
        p_admin_notes: adminNotes,
        p_admin_user_id: currentUser.id
      })

      console.log('📊 Resposta do Supabase:', { data, error })

      if (error) {
        console.error('❌ Erro ao aprovar saque:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        toast.error('Erro ao aprovar saque', {
          description: error.message || error.details || 'Erro na comunicação com o banco'
        })
        return
      }

      if (data?.success) {
        toast.success('Saque aprovado com sucesso', {
          description: `R$ ${data.amount_approved.toFixed(2)} aprovados para ${data.user_email}`
        })
        closeWithdrawalDetails()
        loadPendingWithdrawals()
      } else {
        console.error('❌ Falha na aprovação:', data)
        toast.error('Erro ao aprovar saque', {
          description: data?.error || 'Falha no processamento da aprovação'
        })
      }
    } catch (error) {
      console.error('💥 Erro inesperado ao aprovar saque:', {
        error,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack : undefined
      })
      toast.error('Erro inesperado ao aprovar saque', {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      })
    } finally {
      setProcessingWithdrawal(false)
    }
  }

  const reverseWithdrawal = async () => {
    if (!selectedWithdrawal || !currentUser?.id) return

    setProcessingWithdrawal(true)
    try {
      console.log('🔄 Iniciando estorno:', {
        withdrawal_id: selectedWithdrawal.id,
        admin_notes: adminNotes,
        reversal_reason: reversalJustification,
        admin_user_id: currentUser.id
      })

      const { data, error } = await supabase.rpc('reverse_agent_withdrawal', {
        p_withdrawal_id: selectedWithdrawal.id,
        p_admin_notes: adminNotes,
        p_reversal_reason: reversalJustification,
        p_admin_user_id: currentUser.id
      })

      console.log('📊 Resposta do Supabase:', { data, error })

      if (error) {
        console.error('❌ Erro ao estornar saque:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        toast.error('Erro ao estornar saque', {
          description: error.message || error.details || 'Erro na comunicação com o banco'
        })
        return
      }

      if (data?.success) {
        toast.success('Saque estornado com sucesso', {
          description: `R$ ${data.amount_reversed.toFixed(2)} devolvidos para ${data.user_email}`
        })
        closeWithdrawalDetails()
        loadPendingWithdrawals()
      } else {
        console.error('❌ Falha no estorno:', data)
        toast.error('Erro ao estornar saque', {
          description: data?.error || 'Falha no processamento do estorno'
        })
      }
    } catch (error) {
      console.error('💥 Erro inesperado ao estornar saque:', {
        error,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack : undefined
      })
      toast.error('Erro inesperado ao estornar saque', {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      })
    } finally {
      setProcessingWithdrawal(false)
    }
  }

  // Filtrar agentes
  const filteredAgents = agents.filter(agent => 
    agent.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.agent_code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Filtrar usuários disponíveis para criação de agente
  const filteredAvailableUsers = userSearchTerm.length >= 2 
    ? users.filter(user =>
        user.email.toLowerCase().includes(userSearchTerm.toLowerCase())
      )
    : []

  // Estatísticas
  const totalAgents = agents.length
  const activeAgents = agents.filter(a => a.is_active).length
  const totalCommissions = agents.reduce((sum, a) => sum + a.total_commissions_generated, 0)
  const totalReferrals = agents.reduce((sum, a) => sum + a.total_referrals, 0)

  return (
    <div className="bg-black min-h-screen text-white">
      {/* Admin Header */}
      <AdminHeader 
        currentUser={currentUser}
        additionalActions={
          <Button
            onClick={openCreateModal}
            className="bg-purple-500/20 border border-purple-500/50 text-purple-400 hover:bg-purple-500/30 font-mono"
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            CRIAR_AGENTE
          </Button>
        }
      />

      {/* Conteúdo da página */}
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Título da página */}
        <div>
          <h1 className="text-3xl font-bold text-green-400 font-mono mb-2">
            USERS_MANAGER
          </h1>
          <p className="text-gray-400 font-mono text-sm">
            {`// Todos os usuários podem indicar e ganhar comissões (50% padrão)`}
          </p>
        </div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-purple-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-purple-400 font-mono text-sm">
                <Brain className="h-4 w-4" />
                TOTAL_AGENTES
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-400 font-mono">
                {totalAgents}
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-green-400 font-mono text-sm">
                <Activity className="h-4 w-4" />
                AGENTES_ATIVOS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400 font-mono">
                {activeAgents}
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-blue-400 font-mono text-sm">
                <Users className="h-4 w-4" />
                TOTAL_INDICAÇÕES
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-400 font-mono">
                {totalReferrals}
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-yellow-400 font-mono text-sm">
                <DollarSign className="h-4 w-4" />
                COMISSÕES_TOTAL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-400 font-mono">
                R$ {totalCommissions.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Saques Pendentes */}
        {pendingWithdrawals.length > 0 && (
          <Card className="border-orange-500/30 bg-gray-900/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-orange-400 flex items-center gap-2 font-mono">
                    <AlertTriangle className="h-5 w-5" />
                    SAQUES_PENDENTES ({pendingWithdrawals.length})
                  </CardTitle>
                  <CardDescription className="text-gray-400 font-mono text-xs">
                    {`// Solicitações aguardando processamento`}
                  </CardDescription>
                </div>
                <Button
                  onClick={loadPendingWithdrawals}
                  variant="outline"
                  size="sm"
                  disabled={loadingWithdrawals}
                  className="bg-orange-500/20 border border-orange-500/50 text-orange-400 hover:bg-orange-500/30 font-mono"
                >
                  {loadingWithdrawals ? 'CARREGANDO...' : 'ATUALIZAR'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingWithdrawals.map((withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="border border-orange-500/50 rounded-lg p-4 bg-orange-500/5 hover:bg-orange-500/10 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-2 h-2 rounded-full bg-orange-400" />
                          <div className="text-white font-mono font-semibold">
                            {withdrawal.user_email}
                          </div>
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 font-mono text-xs">
                            {withdrawal.agent_code}
                          </Badge>
                        </div>
                        
                        <div className="text-xs font-mono text-gray-400 mb-2">
                          Tipo: {withdrawal.withdrawal_type === 'crypto' ? `${withdrawal.crypto_type || 'CRYPTO'}` : `PIX ${withdrawal.pix_key_type?.toUpperCase() || ''}`}
                        </div>

                        <div className="text-sm">
                          <span className="text-gray-400">Solicitado em:</span>
                          <div className="text-gray-300 font-mono text-xs">
                            {new Date(withdrawal.created_at).toLocaleString('pt-BR')}
                          </div>
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-orange-400 font-bold font-mono text-lg">
                          R$ {withdrawal.amount.toFixed(2)}
                        </div>
                        <div className="text-gray-400 font-mono text-xs mt-1">
                          valor solicitado
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openWithdrawalDetails(withdrawal)}
                          className="mt-2 border-orange-500/50 text-orange-400 hover:bg-orange-500/10 font-mono"
                        >
                          PROCESSAR
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Busca */}
        <Card className="border-gray-700/30 bg-gray-900/50">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por email ou código de indicação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-800 border-gray-600 text-white font-mono"
              />
            </div>
          </CardContent>
        </Card>

        {/* Lista de Agentes */}
        <Card className="border-gray-700/30 bg-gray-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white font-mono">
              <Brain className="h-5 w-5" />
              USUÁRIOS_SISTEMA ({filteredAgents.length})
            </CardTitle>
            <CardDescription className="text-gray-400 font-mono text-xs">
              {`// Todos os usuários podem indicar e ter comissões personalizadas`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-purple-400 mx-auto mb-4" />
                <p className="text-gray-400 font-mono">Carregando agentes...</p>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-8">
                <Brain className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400 font-mono">
                  {searchTerm ? 'NENHUM_USUÁRIO_ENCONTRADO' : 'NENHUM_USUÁRIO_CADASTRADO'}
                </p>
                <p className="text-gray-500 font-mono text-xs mt-2">
                  {`// ${searchTerm ? 'Refine sua busca' : 'Usuários aparecem automaticamente ao se cadastrarem'}`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="border border-gray-700/50 rounded-lg p-4 hover:bg-gray-800/30 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`w-3 h-3 rounded-full ${agent.is_active ? 'bg-green-400' : 'bg-gray-500'}`} />
                          <div className="text-white font-mono font-semibold">
                            {agent.email}
                          </div>
                          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 font-mono text-xs">
                            {agent.agent_code}
                          </Badge>
                          {!agent.is_active && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-mono text-xs">
                              INATIVO
                            </Badge>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-400">Taxa comissão:</span>
                            <div className="text-purple-400 font-mono text-sm font-bold">
                              {agent.commission_rate}%
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-400">Indicações:</span>
                            <div className="text-blue-400 font-mono text-sm font-bold">
                              {agent.total_referrals}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-400">Cadastrado em:</span>
                            <div className="text-gray-300 font-mono text-xs">
                              {new Date(agent.created_at).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-yellow-400 font-bold font-mono text-lg">
                          R$ {agent.total_commissions_generated.toFixed(2)}
                        </div>
                        <div className="text-gray-400 font-mono text-xs mt-1">
                          comissões geradas
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditAgentModal(agent)}
                            className="border-gray-600 text-gray-300 hover:bg-gray-700 font-mono"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteAgent(agent.id)}
                            className="border-red-500/50 text-red-400 hover:bg-red-500/10 font-mono"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
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

      {/* Modais */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        title="Criar Novo Agente"
        type="info"
      >
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="user-search" className="text-white font-mono">Buscar Usuário</Label>
            <Input
              id="user-search"
              type="text"
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              placeholder="Digite o email do usuário..."
              className="bg-gray-800 border-gray-700 text-white font-mono"
            />
            {filteredAvailableUsers.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-gray-700 rounded bg-gray-800">
                {filteredAvailableUsers.map((user) => (
                  <div
                    key={user.id}
                    className="p-2 hover:bg-gray-700 cursor-pointer text-white font-mono text-sm"
                    onClick={() => {
                      setSelectedUserId(user.id)
                      setUserSearchTerm(user.email)
                    }}
                  >
                    {user.email}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="commission-rate" className="text-white font-mono">Taxa de Comissão (%)</Label>
            <Input
              id="commission-rate"
              type="number"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              placeholder="Ex: 50.00"
              className="bg-gray-800 border-gray-700 text-white font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={closeCreateModal} disabled={loading}>
            CANCELAR
          </Button>
          <Button onClick={createAgent} disabled={loading || !selectedUserId}>
            {loading ? 'CRIANDO...' : 'CRIAR_AGENTE'}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        title={`Editar Agente: ${editingAgent?.email || ''}`}
        type="info"
      >
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-commission-rate" className="text-white font-mono">Taxa de Comissão (%)</Label>
            <Input
              id="edit-commission-rate"
              type="number"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              placeholder="Ex: 50.00"
              className="bg-gray-800 border-gray-700 text-white font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={closeEditModal} disabled={loading}>
            CANCELAR
          </Button>
          <Button onClick={updateAgent} disabled={loading}>
            {loading ? 'SALVANDO...' : 'SALVAR_ALTERAÇÕES'}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isWithdrawalModalOpen}
        onClose={closeWithdrawalDetails}
        title={`Processar Saque: ${selectedWithdrawal?.user_email || ''}`}
        type="warning"
      >
        {selectedWithdrawal && (
          <div className="space-y-4 py-4">
            <div className="bg-gray-800 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400 font-mono">Valor:</span>
                <span className="text-white font-mono font-bold">R$ {selectedWithdrawal.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-mono">Taxa:</span>
                <span className="text-white font-mono">R$ {selectedWithdrawal.fee_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-mono">Valor líquido:</span>
                <span className="text-green-400 font-mono font-bold">R$ {selectedWithdrawal.net_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 font-mono">Tipo:</span>
                <span className="text-white font-mono">
                  {selectedWithdrawal.withdrawal_type === 'crypto' ? `${selectedWithdrawal.crypto_type}` : 'PIX'}
                </span>
              </div>
              {selectedWithdrawal.withdrawal_type === 'crypto' ? (
                <div className="flex justify-between">
                  <span className="text-gray-400 font-mono">Carteira:</span>
                  <span className="text-white font-mono text-xs break-all">{selectedWithdrawal.wallet_address}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-mono">Tipo PIX:</span>
                    <span className="text-white font-mono">{selectedWithdrawal.pix_key_type?.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-mono">Chave:</span>
                    <span className="text-white font-mono">{selectedWithdrawal.pix_key}</span>
                  </div>
                  {selectedWithdrawal.full_name && (
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-mono">Nome:</span>
                      <span className="text-white font-mono">{selectedWithdrawal.full_name}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="admin-notes" className="text-white font-mono">Observações do Admin</Label>
              <Input
                id="admin-notes"
                type="text"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Observações sobre o processamento..."
                className="bg-gray-800 border-gray-700 text-white font-mono"
              />
            </div>

            {selectedWithdrawal.withdrawal_type === 'crypto' && (
              <div className="grid gap-2">
                <Label htmlFor="reversal-justification" className="text-white font-mono">Justificativa para Estorno</Label>
                <Input
                  id="reversal-justification"
                  type="text"
                  value={reversalJustification}
                  onChange={(e) => setReversalJustification(e.target.value)}
                  placeholder="Motivo do estorno (obrigatório para crypto)..."
                  className="bg-gray-800 border-gray-700 text-white font-mono"
                />
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={closeWithdrawalDetails} disabled={processingWithdrawal}>
            CANCELAR
          </Button>
          {selectedWithdrawal?.withdrawal_type === 'crypto' ? (
            <Button
              onClick={reverseWithdrawal}
              disabled={processingWithdrawal || !reversalJustification.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {processingWithdrawal ? 'PROCESSANDO...' : 'ESTORNAR'}
            </Button>
          ) : (
            <>
              <Button
                onClick={reverseWithdrawal}
                disabled={processingWithdrawal}
                variant="outline"
                className="border-red-500 text-red-400 hover:bg-red-500/10"
              >
                {processingWithdrawal ? 'PROCESSANDO...' : 'ESTORNAR'}
              </Button>
              <Button
                onClick={approveWithdrawal}
                disabled={processingWithdrawal}
                className="bg-green-600 hover:bg-green-700"
              >
                {processingWithdrawal ? 'PROCESSANDO...' : 'APROVAR'}
              </Button>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}