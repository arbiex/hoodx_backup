'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
  persistent?: boolean;
}

interface NotificationSystemProps {
  notifications: Notification[];
  onRemove: (id: string) => void;
}

const NotificationCard: React.FC<{
  notification: Notification;
  onRemove: (id: string) => void;
}> = ({ notification, onRemove }) => {
  const { id, type, title, message, duration = 5000, persistent = false } = notification;

  useEffect(() => {
    if (!persistent && duration > 0) {
      const timer = setTimeout(() => {
        onRemove(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, persistent, onRemove]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-400" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-400" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-400" />;
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-900/20 border-green-500/30 text-green-100';
      case 'error':
        return 'bg-red-900/20 border-red-500/30 text-red-100';
      case 'warning':
        return 'bg-yellow-900/20 border-yellow-500/30 text-yellow-100';
      case 'info':
        return 'bg-blue-900/20 border-blue-500/30 text-blue-100';
    }
  };

  return (
    <div className={`p-4 rounded-lg border backdrop-blur-sm ${getStyles()} animate-slide-in`}>
      <div className="flex items-start gap-3">
        {getIcon()}
        <div className="flex-1 min-w-0">
          <h4 className="font-mono font-semibold text-sm">{title}</h4>
          <p className="font-mono text-xs mt-1 opacity-90">{message}</p>
        </div>
        <button
          onClick={() => onRemove(id)}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export const NotificationSystem: React.FC<NotificationSystemProps> = ({
  notifications,
  onRemove,
}) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
};

// Hook para gerenciar notificações
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification: Notification = { ...notification, id };
    
    setNotifications(prev => [...prev, newNotification]);
    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Funções de conveniência
  const showSuccess = useCallback((title: string, message: string, options?: Partial<Notification>) => {
    return addNotification({ type: 'success', title, message, ...options });
  }, [addNotification]);

  const showError = useCallback((title: string, message: string, options?: Partial<Notification>) => {
    return addNotification({ 
      type: 'error', 
      title, 
      message, 
      persistent: true, // Erros ficam até serem fechados manualmente
      ...options 
    });
  }, [addNotification]);

  const showWarning = useCallback((title: string, message: string, options?: Partial<Notification>) => {
    return addNotification({ type: 'warning', title, message, duration: 8000, ...options });
  }, [addNotification]);

  const showInfo = useCallback((title: string, message: string, options?: Partial<Notification>) => {
    return addNotification({ type: 'info', title, message, ...options });
  }, [addNotification]);

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
}

// Componente principal que combina tudo
export const BMGBRNotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { notifications, removeNotification } = useNotifications();

  return (
    <>
      {children}
      <NotificationSystem 
        notifications={notifications} 
        onRemove={removeNotification} 
      />
    </>
  );
}; 