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
  Plus
} from 'lucide-react'
import { Pagination } from '@/components/ui/pagination'

interface User {
  id: string;
  email: string;
  created_at: string;
  credits: number;
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
  
  // Calcular paginação com base nos usuários filtrados
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const currentUsers = filteredUsers.slice(startIndex, endIndex);
  
  // Estatísticas
  const totalCredits = users.reduce((sum, u) => sum + (u.credits || 0), 0);
  
  // Reset da página quando pesquisa muda
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Verificar usuário atual ao carregar
  useEffect(() => {
    checkCurrentUser();
  }, []);

  const checkCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
    if (user?.id) {
      loadUsers(); // Carregar dados iniciais
    }
  };

  // Carregar usuários
  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_all_users_admin');
      
      if (error) {
        console.error('Erro ao carregar usuários:', error);
        return;
      }

      // A função SQL retorna um array de usuários diretamente
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro:', error);
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

  // Header sem ações adicionais
  const additionalActions = null;

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader currentUser={currentUser} additionalActions={additionalActions} />

      {/* Conteúdo */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Gerenciamento de Usuários</h1>
              <p className="text-gray-400">Gerencie todos os usuários do sistema</p>
            </div>
            <Button onClick={loadUsers} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? 'Carregando...' : 'Atualizar'}
            </Button>
          </div>

          {/* Cards de estatísticas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/20 rounded-lg">
                    <Users className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Total de Usuários</p>
                    <p className="text-2xl font-bold text-white">{users.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-yellow-500/20 rounded-lg">
                    <CreditCard className="h-6 w-6 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Total Créditos</p>
                    <p className="text-2xl font-bold text-white">R$ {totalCredits.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Campo de pesquisa */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder="Pesquisar usuários por email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            {searchTerm && (
              <div className="text-sm text-gray-400">
                {filteredUsers.length} de {users.length} usuários
              </div>
            )}
          </div>

          {/* Tabela de usuários */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white text-lg">Lista de Usuários</CardTitle>
                  <CardDescription>
                    {searchTerm 
                      ? `${filteredUsers.length} resultado${filteredUsers.length !== 1 ? 's' : ''} encontrado${filteredUsers.length !== 1 ? 's' : ''}`
                      : `${users.length} usuário${users.length !== 1 ? 's' : ''}`
                    } • Página {currentPage} de {totalPages}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  {searchTerm 
                    ? `Nenhum usuário encontrado para "${searchTerm}"`
                    : 'Nenhum usuário encontrado'
                  }
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left p-4 text-sm font-medium text-gray-400">Email</th>
                          <th className="text-right p-4 text-sm font-medium text-gray-400">Créditos</th>
                          <th className="text-left p-4 text-sm font-medium text-gray-400">Criado em</th>
                          <th className="text-right p-4 text-sm font-medium text-gray-400">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentUsers.map((user, index) => (
                          <tr 
                            key={user.id} 
                            className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                          >
                            <td className="p-4">
                              <div>
                                <div className="font-medium text-white text-sm">{user.email}</div>
                                <div className="text-xs text-gray-500">ID: {user.id.slice(0, 8)}...</div>
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-1 text-sm text-yellow-400">
                                <DollarSign className="h-3 w-3" />
                                <span>{(user.credits || 0).toFixed(2)}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="text-sm text-gray-400">
                                {new Date(user.created_at).toLocaleDateString('pt-BR')}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openAddCreditsModal(user)}
                                  className="border-gray-600 text-gray-300 hover:bg-gray-700 text-xs px-2 py-1 h-7"
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Adicionar Créditos
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Paginação */}
                  {totalPages > 1 && (
                    <div className="p-4 border-t border-gray-800">
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        showFirstLast={true}
                      />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Modal de Adicionar Créditos */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={`Adicionar Créditos para ${selectedUser?.email}`}
      >
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="creditAmount">Valor dos Créditos</Label>
            <Input
              id="creditAmount"
              type="number"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              placeholder="Ex: 100.00"
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="creditDescription">Descrição do Crédito</Label>
            <Input
              id="creditDescription"
              type="text"
              value={creditDescription}
              onChange={(e) => setCreditDescription(e.target.value)}
              placeholder="Ex: Reembolso de serviço"
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={closeModal} disabled={addingCredits}>
            Cancelar
          </Button>
          <Button onClick={addManualCredits} disabled={addingCredits}>
            {addingCredits ? 'Adicionando...' : 'Adicionar Créditos'}
          </Button>
        </div>
      </Modal>
    </div>
  );
} 