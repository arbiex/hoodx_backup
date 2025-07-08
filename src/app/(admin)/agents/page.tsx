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
  CreditCard
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
      const { data, error } = await supabase.rpc('get_all_users_admin')
      
      if (error) {
        console.error('Erro ao carregar usuários:', error)
        return
      }

      // Filtrar usuários que não são agentes
      const agentUserIds = agents.map(agent => agent.user_id)
      const availableUsers = (data || []).filter((user: User) => !agentUserIds.includes(user.id))
      setUsers(availableUsers)
    } catch (error) {
      console.error('Erro:', error)
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
      toast.error('Preencha todos os campos')
      return
    }

    try {
      const { data, error } = await supabase.rpc('create_agent', {
        p_user_id: selectedUserId,
        p_commission_rate: parseFloat(commissionRate),
        p_admin_user_id: currentUser?.id
      })

      if (error) {
        console.error('Erro ao criar agente:', error)
        toast.error('Erro ao criar agente')
        return
      }

      if (data.success) {
        toast.success('Agente criado com sucesso', {
          description: `Código: ${data.agent_code}`
        })
        closeCreateModal()
        setSelectedUserId('')
        setCommissionRate('50.00')
        setUserSearchTerm('')
        loadAgents()
        loadUsers()
      } else {
        toast.error(data.error || 'Erro ao criar agente')
      }
    } catch (error) {
      console.error('Erro:', error)
      toast.error('Erro inesperado')
    }
  }

  const updateAgent = async () => {
    if (!editingAgent || !commissionRate) {
      toast.error('Dados inválidos')
      return
    }

    try {
      const { data, error } = await supabase.rpc('update_agent', {
        p_agent_id: editingAgent.id,
        p_commission_rate: parseFloat(commissionRate),
        p_is_active: editingAgent.is_active
      })

      if (error) {
        console.error('Erro ao atualizar agente:', error)
        toast.error('Erro ao atualizar agente')
        return
      }

      if (data.success) {
        toast.success('Agente atualizado com sucesso')
        closeEditModal()
        setEditingAgent(null)
        loadAgents()
      } else {
        toast.error(data.error || 'Erro ao atualizar agente')
      }
    } catch (error) {
      console.error('Erro:', error)
      toast.error('Erro inesperado')
    }
  }

  // Função para desativar código de agente
  const disableAgentCode = async (agentCode: string) => {
    try {
      const { data, error } = await supabase.rpc('disable_agent_code', {
        p_agent_code: agentCode
      });

      if (error) {
        console.error('Erro ao desativar código:', error);
        toast.error('Erro ao desativar código do agente');
        return;
      }

      if (data.success) {
        toast.success(data.message);
        await loadAgents(); // Recarregar lista
      } else {
        toast.error(data.error || 'Erro ao desativar código');
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
      toast.error('Erro inesperado ao desativar código');
    }
  };

  // Função para ativar código de agente
  const enableAgentCode = async (agentCode: string) => {
    try {
      const { data, error } = await supabase.rpc('enable_agent_code', {
        p_agent_code: agentCode
      });

      if (error) {
        console.error('Erro ao ativar código:', error);
        toast.error('Erro ao ativar código do agente');
        return;
      }

      if (data.success) {
        toast.success(data.message);
        await loadAgents(); // Recarregar lista
      } else {
        toast.error(data.error || 'Erro ao ativar código');
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
      toast.error('Erro inesperado ao ativar código');
    }
  };

  // Função para alternar status do agente
  const toggleAgentStatus = async (agentCode: string, currentStatus: boolean) => {
    try {
      const { data, error } = await supabase.rpc('toggle_agent_code', {
        p_agent_code: agentCode
      });

      if (error) {
        console.error('Erro ao alterar status:', error);
        toast.error('Erro ao alterar status do agente');
        return;
      }

      if (data.success) {
        toast.success(data.message);
        await loadAgents(); // Recarregar lista
      } else {
        toast.error(data.error || 'Erro ao alterar status');
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
      toast.error('Erro inesperado ao alterar status');
    }
  };

  const removeAgent = async (agent: Agent) => {
    if (!confirm(`Tem certeza que deseja remover o agente ${agent.email}?`)) {
      return
    }

    try {
      const { data, error } = await supabase.rpc('remove_agent', {
        p_agent_id: agent.id
      })

      if (error) {
        console.error('Erro ao remover agente:', error)
        toast.error('Erro ao remover agente')
        return
      }

      if (data.success) {
        toast.success('Agente removido com sucesso')
        loadAgents()
        loadUsers()
      } else {
        toast.error(data.error || 'Erro ao remover agente')
      }
    } catch (error) {
      console.error('Erro:', error)
      toast.error('Erro inesperado')
    }
  }

  const openEditAgentModal = (agent: Agent) => {
    setEditingAgent(agent)
    setCommissionRate(agent.commission_rate.toString())
    openEditModal()
  }

  const openWithdrawalDetails = (withdrawal: PendingWithdrawal) => {
    setSelectedWithdrawal(withdrawal)
    setAdminNotes('')
    setReversalJustification('')
    openWithdrawalModal()
  }

  const processWithdrawal = async (status: 'completed' | 'failed' | 'cancelled', rejectionReason?: string) => {
    if (!selectedWithdrawal) return;

    setProcessingWithdrawal(true);
    try {
      const { data, error } = await supabase.rpc('process_withdrawal', {
        p_withdrawal_id: selectedWithdrawal.id,
        p_status: status,
        p_admin_notes: adminNotes || rejectionReason || null,
        p_admin_user_id: currentUser?.id
      });

      if (error) {
        console.error('Erro ao processar saque:', error);
        toast.error('Erro ao processar saque');
        return;
      }

      if (data.success) {
        toast.success(`Saque ${status === 'completed' ? 'aprovado' : status === 'failed' ? 'rejeitado' : 'cancelado'} com sucesso`);
        closeWithdrawalModal();
        setSelectedWithdrawal(null);
        setAdminNotes('');
        loadPendingWithdrawals();
      } else {
        toast.error('Erro ao processar saque', {
          description: data.error || 'Erro desconhecido'
        });
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro inesperado ao processar saque');
    } finally {
      setProcessingWithdrawal(false);
    }
  };

  const reverseWithdrawal = async () => {
    if (!selectedWithdrawal || !reversalJustification.trim()) {
      toast.error('Justificativa é obrigatória para estorno');
      return;
    }

    setProcessingWithdrawal(true);
    try {
      const { data, error } = await supabase.rpc('reverse_withdrawal', {
        p_withdrawal_id: selectedWithdrawal.id,
        p_admin_notes: reversalJustification,
        p_admin_user_id: currentUser?.id
      });

      if (error) {
        console.error('Erro ao estornar saque:', error);
        toast.error('Erro ao estornar saque');
        return;
      }

      if (data.success) {
        toast.success('Saque estornado com sucesso', {
          description: `R$ ${data.amount_reversed.toFixed(2)} devolvidos para ${data.user_email}`
        });
        closeWithdrawalModal();
        setSelectedWithdrawal(null);
        setAdminNotes('');
        setReversalJustification('');
        loadPendingWithdrawals();
      } else {
        toast.error('Erro ao estornar saque', {
          description: data.error || 'Erro desconhecido'
        });
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro inesperado ao estornar saque');
    } finally {
      setProcessingWithdrawal(false);
    }
  };

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

  // Header sem ações adicionais
  const additionalActions = null

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader currentUser={currentUser} additionalActions={additionalActions} />

      {/* Conteúdo */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Brain className="h-7 w-7 text-purple-400" />
                Gerenciamento de Agentes
              </h1>
              <p className="text-gray-400">Controle de agentes e suas comissões personalizadas</p>
            </div>
            <Button 
              onClick={openCreateModal}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar Agente
            </Button>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-500/20 rounded-lg">
                    <Brain className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Total de Agentes</p>
                    <p className="text-2xl font-bold text-white">{totalAgents}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-500/20 rounded-lg">
                    <Activity className="h-6 w-6 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Agentes Ativos</p>
                    <p className="text-2xl font-bold text-white">{activeAgents}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/20 rounded-lg">
                    <Users className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Total Indicações</p>
                    <p className="text-2xl font-bold text-white">{totalReferrals}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-yellow-500/20 rounded-lg">
                    <DollarSign className="h-6 w-6 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Comissões Geradas</p>
                    <p className="text-2xl font-bold text-white">R$ {totalCommissions.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Saques Pendentes */}
          {pendingWithdrawals.length > 0 && (
            <Card className="bg-gray-900 border-orange-500/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-orange-400 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Saques Pendentes
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      {pendingWithdrawals.length} solicitação(ões) aguardando processamento
                    </CardDescription>
                  </div>
                  <Button
                    onClick={loadPendingWithdrawals}
                    variant="outline"
                    size="sm"
                    disabled={loadingWithdrawals}
                    className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                  >
                    {loadingWithdrawals ? 'Carregando...' : 'Atualizar'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingWithdrawals.map((withdrawal) => (
                    <div
                      key={withdrawal.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-orange-500/5 border border-orange-500/20"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-2 h-2 rounded-full bg-orange-400" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{withdrawal.user_email}</span>
                            <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-400">
                              {withdrawal.agent_code}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-400 mt-1">
                            R$ {withdrawal.amount.toFixed(2)} • {withdrawal.withdrawal_type === 'crypto' ? `${withdrawal.crypto_type || 'CRYPTO'}` : `PIX ${withdrawal.pix_key_type?.toUpperCase() || ''}`} • {new Date(withdrawal.created_at).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openWithdrawalDetails(withdrawal)}
                        className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                      >
                        Processar
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filtros */}
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Buscar por email ou código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-800 border-gray-700"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Agentes */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Lista de Agentes</CardTitle>
              <CardDescription className="text-gray-400">
                Agentes do sistema com taxas individuais. Agentes inativos bloqueiam novos cadastros e não geram comissões.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <p className="text-gray-400">Carregando agentes...</p>
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="text-center py-8">
                  <Brain className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">
                    {searchTerm ? 'Nenhum agente encontrado' : 'Nenhum agente cadastrado'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50 border border-gray-700"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${agent.is_active ? 'bg-green-400' : 'bg-gray-500'}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-white">{agent.email}</h3>
                            <Badge variant="outline" className="text-xs">
                              {agent.agent_code}
                            </Badge>
                            {!agent.is_active && (
                              <Badge variant="destructive" className="text-xs">
                                Inativo
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                            <span>Comissão: {agent.commission_rate}%</span>
                            <span>Indicações: {agent.total_referrals}</span>
                            <span>Gerado: R$ {agent.total_commissions_generated.toFixed(2)}</span>
                            {!agent.is_active && (
                              <span className="text-red-400 font-medium">• Bloqueia cadastros</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleAgentStatus(agent.agent_code, agent.is_active)}
                          className={agent.is_active ? 'text-red-400 hover:bg-red-400/10' : 'text-green-400 hover:bg-green-400/10'}
                        >
                          {agent.is_active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditAgentModal(agent)}
                          className="text-blue-400 hover:bg-blue-400/10"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeAgent(agent)}
                          className="text-red-400 hover:bg-red-400/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>


        </div>
      </main>

      {/* Modal Criar Agente */}
      <Modal isOpen={isCreateModalOpen} onClose={closeCreateModal}>
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Criar Novo Agente
          </h2>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="user-search" className="text-white">Buscar Usuário</Label>
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${
                  userSearchTerm.length >= 2 ? 'text-purple-400' : 'text-gray-400'
                }`} />
                <Input
                  id="user-search"
                  type="text"
                  placeholder="Digite o email do usuário..."
                  value={userSearchTerm}
                  onChange={(e) => {
                    setUserSearchTerm(e.target.value)
                    setSelectedUserId('') // Limpar seleção quando buscar
                  }}
                  className={`pl-10 bg-gray-800 border-gray-700 text-white ${
                    userSearchTerm.length >= 2 ? 'border-purple-500/50' : ''
                  }`}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="user-select" className="text-white">Usuário</Label>
              <select
                id="user-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                disabled={filteredAvailableUsers.length === 0}
              >
                <option value="">
                  {userSearchTerm.length < 2 
                    ? 'Digite pelo menos 2 caracteres para buscar'
                    : filteredAvailableUsers.length === 0 
                      ? 'Nenhum usuário encontrado'
                      : 'Selecione um usuário'
                  }
                </option>
                {filteredAvailableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
              {userSearchTerm.length >= 2 ? (
                <p className="text-xs text-gray-400 mt-1">
                  {filteredAvailableUsers.length > 0 
                    ? `${filteredAvailableUsers.length} usuário(s) encontrado(s)`
                    : 'Nenhum usuário encontrado'
                  }
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  {users.length} usuário(s) disponível(is) para se tornar agente
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="commission-rate" className="text-white">Taxa de Comissão (%)</Label>
              <Input
                id="commission-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="50.00"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button 
              variant="outline" 
              onClick={() => {
                closeCreateModal()
                setSelectedUserId('')
                setCommissionRate('50.00')
                setUserSearchTerm('')
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={createAgent} 
              className="bg-purple-600 hover:bg-purple-700"
              disabled={!selectedUserId || !commissionRate}
            >
              Criar Agente
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Editar Agente */}
      <Modal isOpen={isEditModalOpen} onClose={closeEditModal}>
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            Editar Agente
          </h2>
          
          {editingAgent && (
            <div className="space-y-4">
              <div>
                <Label className="text-white">Email</Label>
                <Input
                  value={editingAgent.email}
                  readOnly
                  className="bg-gray-800 border-gray-700 text-gray-400"
                />
              </div>

              <div>
                <Label className="text-white">Código do Agente</Label>
                <Input
                  value={editingAgent.agent_code}
                  readOnly
                  className="bg-gray-800 border-gray-700 text-gray-400"
                />
              </div>

              <div>
                <Label htmlFor="edit-commission-rate" className="text-white">Taxa de Comissão (%)</Label>
                <Input
                  id="edit-commission-rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={closeEditModal}>
              Cancelar
            </Button>
            <Button onClick={updateAgent} className="bg-blue-600 hover:bg-blue-700">
              Salvar Alterações
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Processar Saque */}
      <Modal 
        isOpen={isWithdrawalModalOpen} 
        onClose={() => {
          closeWithdrawalModal()
          setSelectedWithdrawal(null)
          setAdminNotes('')
          setReversalJustification('')
        }}
        title="Processar Saque"
        size="lg"
      >
        {selectedWithdrawal && (
          <div className="space-y-4 py-4">
            {/* Informações do Saque */}
            <div className="grid gap-2">
              <Label className="text-white">Informações do Saque</Label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-400">ID:</span>
                    <span className="text-white ml-2">#{selectedWithdrawal.id.slice(0, 8)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Status:</span>
                    <Badge variant="outline" className="ml-2 border-orange-500/50 text-orange-400">
                      {selectedWithdrawal.status.toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-gray-400">Agente:</span>
                    <span className="text-white ml-2">{selectedWithdrawal.user_email}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Código:</span>
                    <span className="text-white ml-2">{selectedWithdrawal.agent_code}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Data:</span>
                    <span className="text-white ml-2">{new Date(selectedWithdrawal.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Tipo:</span>
                    <span className="text-white ml-2">
                      {selectedWithdrawal.withdrawal_type === 'crypto' 
                        ? selectedWithdrawal.crypto_type || 'CRYPTO' 
                        : 'PIX'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Valores */}
            <div className="grid gap-2">
              <Label className="text-white">Valores</Label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-gray-400">Solicitado:</span>
                    <span className="text-green-400 ml-2 font-medium">R$ {selectedWithdrawal.amount.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Taxa:</span>
                    <span className="text-red-400 ml-2">-R$ {selectedWithdrawal.fee_amount.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Líquido:</span>
                    <span className="text-white ml-2 font-medium">R$ {selectedWithdrawal.net_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dados de Pagamento */}
            <div className="grid gap-2">
              <Label className="text-white">Dados de Pagamento</Label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm">
                {selectedWithdrawal.withdrawal_type === 'crypto' ? (
                  <div className="space-y-2">
                    <div>
                      <span className="text-gray-400">Cripto:</span>
                      <span className="text-white ml-2">{selectedWithdrawal.crypto_type}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Wallet:</span>
                      <span className="text-white ml-2 font-mono text-xs break-all">{selectedWithdrawal.wallet_address}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <span className="text-gray-400">PIX:</span>
                      <span className="text-white ml-2">{selectedWithdrawal.pix_key}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Nome:</span>
                      <span className="text-white ml-2">{selectedWithdrawal.full_name}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">CPF:</span>
                      <span className="text-white ml-2">{selectedWithdrawal.cpf}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notas do Admin */}
            <div className="grid gap-2">
              <Label htmlFor="admin-notes" className="text-white">Notas do Administrador</Label>
              <textarea
                id="admin-notes"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Observações sobre o processamento..."
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-lg p-3 text-sm"
                rows={2}
              />
            </div>

            {/* Estorno (só para saques completed ou failed) */}
            {(selectedWithdrawal.status === 'completed' || selectedWithdrawal.status === 'failed') && (
              <div className="grid gap-2">
                <Label className="text-yellow-400">Estorno de Saque</Label>
                <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-sm text-gray-400 mb-2">
                    Devolverá R$ {selectedWithdrawal.amount.toFixed(2)} para o saldo do agente.
                  </p>
                  <textarea
                    value={reversalJustification}
                    onChange={(e) => setReversalJustification(e.target.value)}
                    placeholder="Justificativa obrigatória para o estorno..."
                    className="w-full bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-lg p-3 text-sm"
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => {
              closeWithdrawalModal()
              setSelectedWithdrawal(null)
              setAdminNotes('')
              setReversalJustification('')
            }}
            disabled={processingWithdrawal}
          >
            Cancelar
          </Button>
          
          <div className="flex gap-2">
            {/* Estorno */}
            {selectedWithdrawal && (selectedWithdrawal.status === 'completed' || selectedWithdrawal.status === 'failed') && (
              <Button
                onClick={reverseWithdrawal}
                disabled={processingWithdrawal || !reversalJustification.trim()}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                {processingWithdrawal ? 'Estornando...' : 'Estornar'}
              </Button>
            )}
            
            {/* Ações para saques pendentes */}
            {selectedWithdrawal && selectedWithdrawal.status === 'pending' && (
              <>
                <Button
                  onClick={() => processWithdrawal('failed', 'Saque rejeitado pelo administrador')}
                  disabled={processingWithdrawal}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {processingWithdrawal ? 'Processando...' : 'Rejeitar'}
                </Button>
                <Button
                  onClick={() => processWithdrawal('completed')}
                  disabled={processingWithdrawal}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {processingWithdrawal ? 'Processando...' : 'Aprovar'}
                </Button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
} 