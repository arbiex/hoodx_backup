'use client';

import { AlertTriangle } from 'lucide-react';
import Modal from './ui/modal';

interface SessionControlModalProps {
  isOpen: boolean;
  onTakeControl: () => void;
  onStayInactive: () => void;
  activeSessionInfo?: {
    tabId: string;
    timestamp: number;
    isActive: boolean;
    userAgent?: string;
    lastHeartbeat: number;
  } | null;
  wasControlTaken?: boolean;
}

export const SessionControlModal = ({ 
  isOpen, 
  onTakeControl, 
  onStayInactive,
  activeSessionInfo,
  wasControlTaken = false 
}: SessionControlModalProps) => {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // Não permite fechar - decisão obrigatória
      title="SESSAO_MULTIPLA_DETECTADA"
      description={wasControlTaken 
        ? "Outra aba assumiu controle desta aplicação" 
        : "Esta aplicação já está ativa em outra aba/janela"
      }
      type="warning"
      actions={{
        primary: {
          label: 'ASSUMIR_CONTROLE',
          onClick: onTakeControl,
          loading: false,
          disabled: false
        }
      }}
    >
      <div className="space-y-4">
        {activeSessionInfo && (
          <div className="p-3 sm:p-4 bg-gray-800/20 border border-gray-600/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-semibold text-yellow-400 font-mono">SESSAO_ATIVA</span>
            </div>
            <div className="text-xs text-gray-300 font-mono space-y-1">
              <p><strong>Ativa desde:</strong> {formatTime(activeSessionInfo.timestamp)}</p>
              <p><strong>ID da sessão:</strong> {activeSessionInfo.tabId.slice(-8)}</p>
              <p><strong>Status:</strong> Operacional</p>
            </div>
          </div>
        )}

        <div className="p-3 sm:p-4 bg-red-900/20 border border-red-600/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400 font-mono">AVISO_CONFLITO</span>
          </div>
                                <div className="text-xs text-gray-300 font-mono space-y-1">
              {wasControlTaken ? (
                <>
                  <p>• Outra aba assumiu controle da aplicação</p>
                  <p>• Esta aba foi automaticamente desativada</p>
                  <p>• Todas as operações estão suspensas</p>
                  <p>• Clique em "ASSUMIR_CONTROLE" para retomar</p>
                </>
              ) : (
                <>
                  <p>• Múltiplas sessões podem causar conflitos</p>
                  <p>• Esta aba ficará inativa por segurança</p>
                  <p>• A outra sessão permanece operacional</p>
                  <p>• Clique em "ASSUMIR_CONTROLE" para ativar</p>
                </>
              )}
           </div>
        </div>
      </div>
    </Modal>
  );
}; 