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
  X
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

export default function AgentsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Modal states
  const { isOpen: isCreateModalOpen, openModal: openCreateModal, closeModal: closeCreateModal } = useModal()
  const { isOpen: isEditModalOpen, openModal: openEditModal, closeModal: closeEditModal } = useModal()
  
  // Form states
  const [selectedUserId, setSelectedUserId] = useState('')
  const [commissionRate, setCommissionRate] = useState('50.00')
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [userSearchTerm, setUserSearchTerm] = useState('')

  useEffect(() => {
    checkCurrentUser()
    loadAgents()
    loadUsers()
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

  const toggleAgentStatus = async (agent: Agent) => {
    try {
      const { data, error } = await supabase.rpc('update_agent', {
        p_agent_id: agent.id,
        p_is_active: !agent.is_active
      })

      if (error) {
        console.error('Erro ao alterar status:', error)
        toast.error('Erro ao alterar status')
        return
      }

      if (data.success) {
        toast.success(`Agente ${!agent.is_active ? 'ativado' : 'desativado'} com sucesso`)
        loadAgents()
      } else {
        toast.error(data.error || 'Erro ao alterar status')
      }
    } catch (error) {
      console.error('Erro:', error)
      toast.error('Erro inesperado')
    }
  }

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
                Agentes ativos no sistema com suas respectivas comissões
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
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleAgentStatus(agent)}
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
    </div>
  )
} 