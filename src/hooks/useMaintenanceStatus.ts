import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface MaintenanceStatus {
  id: string;
  is_active: boolean;
  title: string;
  message: string;
  start_time: string;
  end_time: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
}

interface CreateMaintenanceData {
  title: string;
  message: string;
  start_time: string;
  end_time: string;
  created_by: string;
  is_active?: boolean;
}

export function useMaintenanceStatus() {
  const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Verificar autenticação do usuário
  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      return user;
    } catch (error) {
      console.error('Erro ao verificar autenticação:', error);
      setCurrentUser(null);
      return null;
    }
  };

  // Verificar status atual
  const checkStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('maintenance_status')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        setError('Erro ao verificar status de manutenção');
        console.error('Erro ao verificar status:', error);
        return null;
      }

      if (data && data.length > 0) {
        const maintenance = data[0];
        
        // Verificar se estamos dentro do horário
        const now = new Date();
        const startTime = new Date(maintenance.start_time);
        const endTime = new Date(maintenance.end_time);
        
        if (now >= startTime && now <= endTime) {
          setMaintenanceStatus(maintenance);
          return maintenance;
        } else {
          // Fora do horário, desativar automaticamente (sem chamar deactivateMaintenance para evitar loop)
          await supabase
            .from('maintenance_status')
            .update({ 
              is_active: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', maintenance.id);
          setMaintenanceStatus(null);
          return null;
        }
      } else {
        setMaintenanceStatus(null);
        return null;
      }
    } catch (error) {
      setError('Erro ao verificar manutenção');
      console.error('Erro:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Criar nova manutenção
  const createMaintenance = async (data: CreateMaintenanceData): Promise<MaintenanceStatus | null> => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('Criando manutenção:', data);

      // Verificar se o usuário está autenticado
      const user = await checkAuth();
      if (!user) {
        const errorMessage = 'Usuário não autenticado para criar manutenção';
        setError(errorMessage);
        console.error(errorMessage);
        return null;
      }

      console.log('Usuário autenticado:', user.id);

      // Primeiro, desativar qualquer manutenção anterior
      await supabase
        .from('maintenance_status')
        .update({ is_active: false })
        .eq('is_active', true);

      // Criar nova manutenção
      const { data: newMaintenance, error } = await supabase
        .from('maintenance_status')
        .insert([{
          ...data,
          is_active: true
        }])
        .select()
        .single();

      if (error) {
        const errorMessage = `Erro ao criar manutenção: ${error.message || JSON.stringify(error)}`;
        setError(errorMessage);
        console.error('Erro ao criar:', error);
        return null;
      }

      console.log('Manutenção criada com sucesso:', newMaintenance);
      setMaintenanceStatus(newMaintenance);
      return newMaintenance;
    } catch (error) {
      const errorMessage = `Erro ao criar manutenção: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
      setError(errorMessage);
      console.error('Erro capturado:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Desativar manutenção
  const deactivateMaintenance = async (id: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('Desativando manutenção:', id);

      // Verificar se o usuário está autenticado
      const user = await checkAuth();
      if (!user) {
        const errorMessage = 'Usuário não autenticado para desativar manutenção';
        setError(errorMessage);
        console.error(errorMessage);
        return false;
      }

      console.log('Usuário autenticado:', user.id);

      const { error } = await supabase
        .from('maintenance_status')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        const errorMessage = `Erro ao desativar manutenção: ${error.message || JSON.stringify(error)}`;
        setError(errorMessage);
        console.error('Erro ao desativar:', error);
        return false;
      }

      console.log('Manutenção desativada com sucesso');
      setMaintenanceStatus(null);
      return true;
    } catch (error) {
      const errorMessage = `Erro ao desativar manutenção: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
      setError(errorMessage);
      console.error('Erro capturado:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Atualizar manutenção
  const updateMaintenance = async (id: string, updateData: Partial<CreateMaintenanceData>): Promise<MaintenanceStatus | null> => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('Atualizando manutenção:', id, updateData);

      // Verificar se o usuário está autenticado
      const user = await checkAuth();
      if (!user) {
        const errorMessage = 'Usuário não autenticado para atualizar manutenção';
        setError(errorMessage);
        console.error(errorMessage);
        return null;
      }

      console.log('Usuário autenticado:', user.id);

      const { data, error } = await supabase
        .from('maintenance_status')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        const errorMessage = `Erro ao atualizar manutenção: ${error.message || JSON.stringify(error)}`;
        setError(errorMessage);
        console.error('Erro ao atualizar:', error);
        return null;
      }

      console.log('Manutenção atualizada com sucesso:', data);
      setMaintenanceStatus(data);
      return data;
    } catch (error) {
      const errorMessage = `Erro ao atualizar manutenção: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
      setError(errorMessage);
      console.error('Erro capturado:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Buscar histórico de manutenções
  const getMaintenanceHistory = async (limit: number = 10): Promise<MaintenanceStatus[]> => {
    try {
      const { data, error } = await supabase
        .from('maintenance_status')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Erro ao buscar histórico:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      return [];
    }
  };

  // Verificar se estamos em horário de manutenção
  const isInMaintenanceWindow = (): boolean => {
    if (!maintenanceStatus) return false;
    
    const now = new Date();
    const startTime = new Date(maintenanceStatus.start_time);
    const endTime = new Date(maintenanceStatus.end_time);
    
    return now >= startTime && now <= endTime;
  };

  // Obter tempo restante
  const getRemainingTime = (): { hours: number; minutes: number; seconds: number } | null => {
    if (!maintenanceStatus) return null;
    
    const now = new Date();
    const endTime = new Date(maintenanceStatus.end_time);
    const diff = endTime.getTime() - now.getTime();
    
    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0 };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return { hours, minutes, seconds };
  };

  // Verificar ao carregar
  useEffect(() => {
    const initializeHook = async () => {
      await checkAuth();
      await checkStatus();
    };
    
    initializeHook();
    
    // Verificar a cada minuto
    const interval = setInterval(checkStatus, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Excluir manutenção
  const deleteMaintenance = async (id: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('Excluindo manutenção:', id);

      // Verificar se o usuário está autenticado
      const user = await checkAuth();
      if (!user) {
        const errorMessage = 'Usuário não autenticado para excluir manutenção';
        setError(errorMessage);
        console.error(errorMessage);
        return false;
      }

      console.log('Usuário autenticado:', user.id);

      const { error } = await supabase
        .from('maintenance_status')
        .delete()
        .eq('id', id);

      if (error) {
        const errorMessage = `Erro ao excluir manutenção: ${error.message || JSON.stringify(error)}`;
        setError(errorMessage);
        console.error('Erro ao excluir:', error);
        return false;
      }

      console.log('Manutenção excluída com sucesso');
      
      // Se a manutenção excluída era a ativa, limpar o estado
      if (maintenanceStatus?.id === id) {
        setMaintenanceStatus(null);
      }
      
      return true;
    } catch (error) {
      const errorMessage = `Erro ao excluir manutenção: ${error instanceof Error ? error.message : JSON.stringify(error)}`;
      setError(errorMessage);
      console.error('Erro capturado:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    maintenanceStatus,
    isLoading,
    error,
    currentUser,
    checkStatus,
    checkAuth,
    createMaintenance,
    deactivateMaintenance,
    updateMaintenance,
    deleteMaintenance,
    getMaintenanceHistory,
    isInMaintenanceWindow,
    getRemainingTime
  };
} 