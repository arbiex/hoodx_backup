'use client';

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import AdminHeader from '@/components/AdminHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Modal from '@/components/ui/modal'
import { toast } from 'sonner'
import { 
  Users, 
  CreditCard, 
  Search,
  DollarSign,
  Plus,
  RefreshCw,
  Activity,
  UserPlus
} from 'lucide-react'
import { Pagination } from '@/components/ui/pagination'

interface User {
  id: string;
  email: string;
  created_at: string;
  credits?: number;  // Opcional caso a RPC não retorne
  last_login?: string;
}

export default function MatrixPage() {
  // Estados do dashboard
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Estados de paginação e pesquisa
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const usersPerPage = 10;
  
  // Estados do modal de créditos
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');
  const [addingCredits, setAddingCredits] = useState(false);
  
  // Aplicar pesquisa nos usuários
  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Paginação
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);

  // Carregar usuário atual
  const loadCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };

  // Carregar usuários
  const loadUsers = async () => {
    setLoading(true);
    try {
      // Usar a mesma abordagem das outras páginas admin
      const { data, error } = await supabase.rpc('get_users_admin_simple');
      
      if (error) {
        console.error('Erro ao buscar usuários:', error);
        toast.error('Erro ao carregar usuários');
        return;
      }

      // A função SQL retorna um array de usuários diretamente
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  // Abrir modal de adicionar créditos
  const openAddCreditsModal = (user: User) => {
    setSelectedUser(user);
    setCreditAmount('');
    setCreditDescription('');
    setIsModalOpen(true);
  };

  // Fechar modal
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
    setCreditAmount('');
    setCreditDescription('');
  };

  // Adicionar créditos manuais
  const addManualCredits = async () => {
    if (!selectedUser || !currentUser?.id) return;
    
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Valor inválido', {
        description: 'Digite um valor maior que zero'
      });
      return;
    }
    
    if (!creditDescription.trim()) {
      toast.error('Descrição obrigatória', {
        description: 'Digite o motivo da adição de créditos'
      });
      return;
    }
    
    setAddingCredits(true);
    
    try {
      const { data, error } = await supabase.rpc('add_manual_credits', {
        p_user_id: selectedUser.id,
        p_amount: amount,
        p_description: creditDescription,
        p_admin_user_id: currentUser.id
      });

      if (error) {
        console.error('Erro ao adicionar créditos:', error);
        toast.error('Erro ao adicionar créditos');
        return;
      }

      if (data.success) {
        toast.success('Créditos adicionados com sucesso', {
          description: `R$ ${amount.toFixed(2)} adicionados para ${data.user_email}`
        });
        closeModal();
        loadUsers(); // Recarregar lista
      } else {
        toast.error('Erro ao adicionar créditos', {
          description: data.error || 'Erro desconhecido'
        });
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro inesperado ao adicionar créditos');
    } finally {
      setAddingCredits(false);
    }
  };

  useEffect(() => {
    loadCurrentUser();
    loadUsers();
  }, []);

  // Calcular estatísticas
  const totalCredits = users.reduce((sum, user) => sum + (user.credits || 0), 0);
  const averageCredits = users.length > 0 ? totalCredits / users.length : 0;
  const recentUsers = users.filter(user => {
    const userDate = new Date(user.created_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return userDate >= thirtyDaysAgo;
  }).length;

  return (
    <div className="bg-black min-h-screen text-white">
      {/* Admin Header */}
      <AdminHeader 
        currentUser={currentUser}
        additionalActions={
          <Button
            onClick={loadUsers}
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
            ADMIN_MATRIX
          </h1>
          <p className="text-gray-400 font-mono text-sm">
            {`// Gerenciamento de usuários do sistema`}
          </p>
        </div>

        {/* Cards de Estatísticas Gerais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-green-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-green-400 font-mono text-sm">
                <Users className="h-4 w-4" />
                TOTAL_USUÁRIOS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400 font-mono">
                {users.length}
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-blue-400 font-mono text-sm">
                <DollarSign className="h-4 w-4" />
                TOTAL_CRÉDITOS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-400 font-mono">
                R$ {totalCredits.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-purple-400 font-mono text-sm">
                <Activity className="h-4 w-4" />
                MÉDIA_CRÉDITOS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-400 font-mono">
                R$ {averageCredits.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/30 bg-gray-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-yellow-400 font-mono text-sm">
                <UserPlus className="h-4 w-4" />
                NOVOS_30D
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-400 font-mono">
                {recentUsers}
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
              USUÁRIOS_SISTEMA ({filteredUsers.length})
            </CardTitle>
            <CardDescription className="text-gray-400 font-mono text-xs">
              {`// Ordenados por data de cadastro`}
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
                  {searchTerm ? 'Nenhum usuário encontrado para a busca' : 'Nenhum usuário encontrado'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentUsers.map((user) => (
                  <div
                    key={user.id}
                    className="border border-gray-700/50 rounded-lg p-4 hover:bg-gray-800/30 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="text-white font-mono font-semibold">
                            {user.email}
                          </div>
                        </div>
                        
                        <div className="text-xs font-mono text-gray-400 mb-2">
                          ID: {user.id}
                        </div>

                        <div className="text-sm">
                          <span className="text-gray-400">Cadastrado em:</span>
                          <div className="text-gray-300 font-mono text-xs">
                            {new Date(user.created_at).toLocaleString('pt-BR')}
                          </div>
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-blue-400 font-bold font-mono text-lg">
                          R$ {(user.credits || 0).toFixed(2)}
                        </div>
                        <div className="text-gray-400 font-mono text-xs mt-1">
                          Créditos
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openAddCreditsModal(user)}
                          className="mt-2 border-gray-600 text-gray-300 hover:bg-gray-700 text-xs font-mono"
                        >
                          <Plus className="h-3 w-3 mr-1" /> ADICIONAR
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="text-center py-4 border-t border-gray-600/30">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                      showFirstLast={true}
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Adicionar Créditos */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={`Adicionar Créditos para ${selectedUser?.email}`}
        type="info"
      >
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="creditAmount" className="text-white font-mono">Valor dos Créditos</Label>
            <Input
              id="creditAmount"
              type="number"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              placeholder="Ex: 100.00"
              className="bg-gray-800 border-gray-700 text-white font-mono"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="creditDescription" className="text-white font-mono">Descrição do Crédito</Label>
            <Input
              id="creditDescription"
              type="text"
              value={creditDescription}
              onChange={(e) => setCreditDescription(e.target.value)}
              placeholder="Ex: Reembolso de serviço"
              className="bg-gray-800 border-gray-700 text-white font-mono"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={closeModal} disabled={addingCredits}>
            CANCELAR
          </Button>
          <Button onClick={addManualCredits} disabled={addingCredits}>
            {addingCredits ? 'ADICIONANDO...' : 'ADICIONAR_CRÉDITOS'}
          </Button>
        </div>
      </Modal>
    </div>
  );
} 