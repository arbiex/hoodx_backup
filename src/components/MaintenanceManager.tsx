'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Edit, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMaintenanceStatus } from '@/hooks/useMaintenanceStatus';
import MaintenanceConfigModal from '@/components/MaintenanceConfigModal';
import { toast } from 'sonner';

interface MaintenanceManagerProps {
  currentUser?: {
    id: string;
    email: string;
  };
}

export default function MaintenanceManager({ currentUser }: MaintenanceManagerProps) {
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<any>(null);
  const [singleMaintenance, setSingleMaintenance] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  const { 
    maintenanceStatus, 
    createMaintenance, 
    updateMaintenance, 
    deactivateMaintenance, 
    getMaintenanceHistory,
    isLoading 
  } = useMaintenanceStatus();

  useEffect(() => {
    loadSingleMaintenance();
  }, []);

  const loadSingleMaintenance = async () => {
    try {
      const history = await getMaintenanceHistory(1);
      if (history && history.length > 0) {
        setSingleMaintenance(history[0]);
      }
    } catch (error) {
      console.error('Erro ao carregar manutenção:', error);
    }
  };

  const handleToggleStatus = async () => {
    if (!singleMaintenance) return;
    
    setLoading(true);
    try {
      if (singleMaintenance.is_active) {
        // Desativar
        const success = await deactivateMaintenance(singleMaintenance.id);
        if (success) {
          toast.success('Manutenção desativada');
          setSingleMaintenance((prev: any) => ({ ...prev, is_active: false }));
        } else {
          toast.error('Erro ao desativar manutenção');
        }
      } else {
        // Ativar - atualizar para ativo
        const success = await updateMaintenance(singleMaintenance.id, {
          ...singleMaintenance,
          is_active: true
        });
        if (success) {
          toast.success('Manutenção ativada');
          setSingleMaintenance((prev: any) => ({ ...prev, is_active: true }));
        } else {
          toast.error('Erro ao ativar manutenção');
        }
      }
    } catch (error) {
      toast.error('Erro ao alterar status');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setEditingMaintenance(singleMaintenance);
    setIsConfigModalOpen(true);
  };

  const handleCreateNew = () => {
    setEditingMaintenance(null);
    setIsConfigModalOpen(true);
  };

  const handleModalSuccess = (message: string) => {
    toast.success(message);
    setIsConfigModalOpen(false);
    setEditingMaintenance(null);
    loadSingleMaintenance();
  };

  const handleModalError = (message: string) => {
    toast.error(message);
  };

  const getStatusBadge = (maintenance: any) => {
    if (!maintenance.is_active) {
      return <Badge variant="secondary" className="text-gray-400">Desativada</Badge>;
    }
    
    return <Badge className="bg-green-500 text-white">Ativa</Badge>;
  };

  return (
    <>
      <Card className="bg-gray-900 border-gray-800 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-orange-400" />
            Manutenção do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          {singleMaintenance ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="font-medium text-white">{singleMaintenance.title}</h3>
                    <p className="text-sm text-gray-400">{singleMaintenance.message}</p>
                  </div>
                  {getStatusBadge(singleMaintenance)}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleEdit}
                    variant="outline"
                    size="sm"
                    className="border-blue-600 text-blue-400 hover:bg-blue-600 hover:text-white"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleToggleStatus}
                    disabled={loading}
                    variant={singleMaintenance.is_active ? "destructive" : "default"}
                    size="sm"
                    className={singleMaintenance.is_active ? "" : "bg-green-600 hover:bg-green-700"}
                  >
                    <Power className="h-4 w-4 mr-1" />
                    {loading ? 'Alterando...' : (singleMaintenance.is_active ? 'Desativar' : 'Ativar')}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-4">
                <Settings className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma manutenção configurada</p>
              </div>
              <Button onClick={handleCreateNew} className="bg-orange-600 hover:bg-orange-700">
                Configurar Manutenção
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <MaintenanceConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => {
          setIsConfigModalOpen(false);
          setEditingMaintenance(null);
        }}
        currentUser={currentUser}
        editMaintenance={editingMaintenance}
        onSuccess={handleModalSuccess}
        onError={handleModalError}
      />
    </>
  );
} 