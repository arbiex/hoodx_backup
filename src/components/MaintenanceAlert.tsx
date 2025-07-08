'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
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
}

interface MaintenanceAlertProps {
  className?: string;
}

export default function MaintenanceAlert({ 
  className = '' 
}: MaintenanceAlertProps) {
  const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    checkMaintenanceStatus();
    
    // Verificar a cada 30 segundos
    const interval = setInterval(checkMaintenanceStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const checkMaintenanceStatus = async () => {
    try {
      // Buscar manutenção ativa (sem filtro de horário)
      const { data, error } = await supabase
        .from('maintenance_status')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        return;
      }

      if (data && data.length > 0) {
        const maintenance = data[0];
        setMaintenanceStatus(maintenance);
        setIsVisible(true);
      } else {
        setIsVisible(false);
        setMaintenanceStatus(null);
      }
    } catch (error) {
    }
  };

  if (!isVisible || !maintenanceStatus) {
    return null;
  }

  return (
    <div className={`w-full relative z-20 ${className}`}>
      <div className="bg-gradient-to-r from-orange-900/40 to-orange-800/40 backdrop-blur-sm border-b border-orange-500/30 text-orange-400 py-2 px-4 mb-4 shadow-lg shadow-orange-500/10">
        <div className="flex items-center justify-center text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-400" />
            <span className="font-mono font-medium text-orange-300">{maintenanceStatus.title}</span>
            <span className="text-orange-500/60">•</span>
            <span className="text-orange-400/90">{maintenanceStatus.message}</span>
          </div>
        </div>
      </div>
    </div>
  );
} 