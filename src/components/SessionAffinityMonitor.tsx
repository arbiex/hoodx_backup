'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface SessionAffinityInfo {
  timestamp: string;
  instance: {
    instanceId: string;
    region: string;
    appName: string;
    isRunningOnFly: boolean;
  };
  sessionAffinity: {
    simple: {
      shouldServe: boolean;
      isFirstVisit: boolean;
      currentInstanceId: string;
    };
    enhanced: {
      isValid: boolean;
      shouldServe: boolean;
      targetInstance?: string;
      details: {
        hasInstanceCookie: boolean;
        hasUserHashCookie: boolean;
        currentInstance: string;
        region: string;
        userHash?: string;
      };
    };
  };
  cookies: Record<string, string>;
  flyHeaders: Record<string, string | null>;
  recommendations: string[];
}

interface SessionAffinityMonitorProps {
  userId?: string;
  className?: string;
}

export const SessionAffinityMonitor = ({ userId, className }: SessionAffinityMonitorProps) => {
  const [affinityInfo, setAffinityInfo] = useState<SessionAffinityInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const checkSessionAffinity = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = `/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr/session-check${userId ? `?userId=${userId}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include' // Para incluir cookies
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setAffinityInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao verificar session affinity');
    } finally {
      setLoading(false);
    }
  };

  const testSessionAffinity = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr/session-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          userId,
          testAffinity: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('🧪 Teste de session affinity:', data);
      alert('Teste concluído - verifique o console para detalhes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no teste');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Verificação inicial
    checkSessionAffinity();
  }, [userId]);

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(checkSessionAffinity, 10000); // 10 segundos
    return () => clearInterval(interval);
  }, [autoRefresh, userId]);

  const getStatusColor = (isValid: boolean) => {
    return isValid ? 'text-green-400' : 'text-red-400';
  };

  const getStatusIcon = (isValid: boolean) => {
    return isValid ? '✅' : '❌';
  };

  return (
    <Card className={`bg-gray-800/50 border-gray-600 ${className}`}>
      <CardHeader>
        <CardTitle className="text-green-400 font-mono text-sm">
          🔗 SESSION_AFFINITY_MONITOR
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controles */}
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={checkSessionAffinity}
            disabled={loading}
            size="sm"
            className="text-xs"
          >
            {loading ? '🔄' : '🔍'} Verificar
          </Button>
          
          <Button
            onClick={testSessionAffinity}
            disabled={loading}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            🧪 Testar
          </Button>
          
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            size="sm"
            variant={autoRefresh ? "default" : "outline"}
            className="text-xs"
          >
            {autoRefresh ? '⏹️' : '▶️'} Auto
          </Button>
        </div>

        {error && (
          <div className="p-2 bg-red-900/20 border border-red-600/30 rounded text-red-400 text-xs font-mono">
            ❌ {error}
          </div>
        )}

        {affinityInfo && (
          <div className="space-y-3">
            {/* Informações da Instância */}
            <div className="p-2 bg-gray-800/30 border border-gray-600/30 rounded">
              <div className="text-xs font-semibold text-blue-400 mb-1">INSTÂNCIA</div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-gray-400">ID:</span>{' '}
                  <span className="text-white">{affinityInfo.instance.instanceId}</span>
                </div>
                <div>
                  <span className="text-gray-400">Region:</span>{' '}
                  <span className="text-white">{affinityInfo.instance.region}</span>
                </div>
                <div>
                  <span className="text-gray-400">Fly.io:</span>{' '}
                  <span className={affinityInfo.instance.isRunningOnFly ? 'text-green-400' : 'text-yellow-400'}>
                    {affinityInfo.instance.isRunningOnFly ? 'Sim' : 'Não'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">App:</span>{' '}
                  <span className="text-white">{affinityInfo.instance.appName}</span>
                </div>
              </div>
            </div>

            {/* Status de Session Affinity */}
            <div className="p-2 bg-gray-800/30 border border-gray-600/30 rounded">
              <div className="text-xs font-semibold text-blue-400 mb-1">SESSION_AFFINITY</div>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span>Sistema Simples:</span>
                  <span className={getStatusColor(affinityInfo.sessionAffinity.simple.shouldServe)}>
                    {getStatusIcon(affinityInfo.sessionAffinity.simple.shouldServe)} 
                    {affinityInfo.sessionAffinity.simple.shouldServe ? 'OK' : 'REPLAY'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Sistema Aprimorado:</span>
                  <span className={getStatusColor(affinityInfo.sessionAffinity.enhanced.shouldServe)}>
                    {getStatusIcon(affinityInfo.sessionAffinity.enhanced.shouldServe)} 
                    {affinityInfo.sessionAffinity.enhanced.shouldServe ? 'OK' : 'REPLAY'}
                  </span>
                </div>
                {affinityInfo.sessionAffinity.simple.isFirstVisit && (
                  <div className="text-yellow-400">🆕 Primeira visita</div>
                )}
              </div>
            </div>

            {/* Cookies */}
            <div className="p-2 bg-gray-800/30 border border-gray-600/30 rounded">
              <div className="text-xs font-semibold text-blue-400 mb-1">COOKIES</div>
              <div className="space-y-1 text-xs font-mono">
                {Object.entries(affinityInfo.cookies).map(([name, value]) => (
                  <div key={name} className="flex justify-between">
                    <span className="text-gray-400">{name}:</span>
                    <span className="text-white truncate max-w-32">{value}</span>
                  </div>
                ))}
                {Object.keys(affinityInfo.cookies).length === 0 && (
                  <span className="text-gray-500">Nenhum cookie encontrado</span>
                )}
              </div>
            </div>

            {/* Recomendações */}
            {affinityInfo.recommendations.length > 0 && (
              <div className="p-2 bg-yellow-900/20 border border-yellow-600/30 rounded">
                <div className="text-xs font-semibold text-yellow-400 mb-1">RECOMENDAÇÕES</div>
                <div className="space-y-1">
                  {affinityInfo.recommendations.map((rec, index) => (
                    <div key={index} className="text-xs text-yellow-300 font-mono">
                      {rec}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamp */}
            <div className="text-xs text-gray-500 font-mono text-center">
              Última verificação: {new Date(affinityInfo.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 