'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Modal from '@/components/ui/modal';
import { useMaintenanceStatus } from '@/hooks/useMaintenanceStatus';

interface MaintenanceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: {
    id: string;
    email: string;
  };
  editMaintenance?: any;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export default function MaintenanceConfigModal({ 
  isOpen, 
  onClose, 
  currentUser,
  editMaintenance,
  onSuccess,
  onError 
}: MaintenanceConfigModalProps) {
  const [formData, setFormData] = useState({
    title: 'Manutenção Programada',
    message: 'Evite operar das 00h até às 00h.'
  });
  const [loading, setLoading] = useState(false);
  
  const { 
    createMaintenance, 
    updateMaintenance,
    isLoading 
  } = useMaintenanceStatus();

  useEffect(() => {
    if (isOpen) {
      // Sempre usar os valores padrão, tanto para nova quanto para edição
      setFormData({
        title: 'Manutenção Programada',
        message: 'Evite operar das 00h até às 00h.'
      });
    }
  }, [isOpen, editMaintenance]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = (): string | null => {
    if (!formData.title.trim()) return 'Título é obrigatório';
    if (!formData.message.trim()) return 'Mensagem é obrigatória';
    
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      onError?.(validationError);
      return;
    }

    if (!currentUser) {
      onError?.('Usuário não autenticado');
      return;
    }

    setLoading(true);
    
    try {
      // Usar tempos padrão para não quebrar o banco
      const now = new Date();
      const startDateTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hora a partir de agora
      const endDateTime = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 horas a partir de agora
      
      let result;
      
      if (editMaintenance) {
        result = await updateMaintenance(editMaintenance.id, {
          title: formData.title,
          message: formData.message,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          created_by: currentUser.id,
          is_active: editMaintenance.is_active // Preservar o status ativo
        });
        
        if (result) {
          onSuccess?.('Manutenção atualizada com sucesso!');
          onClose();
        } else {
          onError?.('Erro ao atualizar manutenção');
        }
      } else {
        result = await createMaintenance({
          title: formData.title,
          message: formData.message,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          created_by: currentUser.id
        });

        if (result) {
          onSuccess?.('Manutenção programada com sucesso!');
          onClose();
        } else {
          onError?.('Erro ao programar manutenção');
        }
      }
    } catch (error) {
      onError?.(editMaintenance ? 'Erro ao atualizar manutenção' : 'Erro ao programar manutenção');
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editMaintenance ? 'Editar Manutenção' : 'Configurar Manutenção'}
      type="warning"
      size="md"
      actions={{
        primary: {
          label: loading ? 'Salvando...' : 'Salvar',
          onClick: handleSubmit,
          loading: loading || isLoading,
          disabled: loading || isLoading
        },
        secondary: {
          label: 'Cancelar',
          onClick: onClose,
          disabled: loading || isLoading
        }
      }}
    >
      <div className="space-y-4">
        {/* Título */}
        <div>
          <Label htmlFor="title" className="text-white">Título</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleInputChange('title', e.target.value)}
            placeholder="Manutenção Programada"
            className="bg-gray-800 border-gray-700 text-white mt-1"
          />
        </div>

        {/* Subtítulo/Mensagem */}
        <div>
          <Label htmlFor="message" className="text-white">Subtítulo</Label>
          <Input
            id="message"
            value={formData.message}
            onChange={(e) => handleInputChange('message', e.target.value)}
            placeholder="Evite operar das 00h até às 00h."
            className="bg-gray-800 border-gray-700 text-white mt-1"
          />
        </div>
      </div>
    </Modal>
  );
} 