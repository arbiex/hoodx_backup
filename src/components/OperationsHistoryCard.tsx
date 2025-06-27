import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History, RefreshCw } from 'lucide-react';
import { useBettingLogs } from '@/hooks/useBettingLogs';

interface BettingLog {
  id: string;
  total_bets: number;
  net_profit: number;
  credits: number;
  status: string;
  started_at: string;
  updated_at: string;
}

export function OperationsHistoryCard() {
  const bettingLogs = useBettingLogs();
  const [totals, setTotals] = useState({
    totalOperations: 0,
    totalBets: 0,
    totalProfit: 0,
    totalCredits: 0,
    activeOperations: 0
  });
  const [isLoading, setIsLoading] = useState(false);

  const loadTotals = async () => {
    setIsLoading(true);
    try {
      const response = await bettingLogs.getRecentLogs(100); // Buscar mais dados para calcular totais
      if (response.success) {
        const logs = response.logs || [];
        
        // Calcular totais - TODOS os registros
        const totalOperations = logs.length; // Cada registro = 1 operação
        const totalBets = logs.reduce((sum, log) => sum + log.total_bets, 0); // Soma de todas as apostas
        const totalProfit = logs.reduce((sum, log) => sum + parseFloat(log.net_profit.toString()), 0); // Soma de todos os lucros
        const activeOperations = logs.filter(log => log.status === 'active').length;
        
        setTotals({
          totalOperations,
          totalBets,
          totalProfit,
          totalCredits: 0, // Removido - créditos são mostrados no card específico
          activeOperations
        });
      }
      
      // Disparar evento para atualizar créditos do usuário também
      console.log('🔄 Disparando evento credits-updated para atualizar CreditDisplay');
      window.dispatchEvent(new CustomEvent('credits-updated'));
      
    } catch (error) {
      console.error('Erro ao carregar totais:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTotals();
    
    // Escutar eventos de atualização
    const handleOperationsUpdate = () => {
      console.log('🔄 OperationsHistoryCard: Recebido evento operations-updated');
      loadTotals();
    };
    
    window.addEventListener('operations-updated', handleOperationsUpdate);
    
    return () => {
      window.removeEventListener('operations-updated', handleOperationsUpdate);
    };
  }, []);

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };



  if (isLoading) {
    return (
      <Card className="border-green-500/30 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400"></div>
            <span className="ml-3 text-green-400 font-mono text-sm">Carregando totais...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-green-500/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
          <History className="h-5 w-5" />
          HISTÓRICO_OPERAÇÕES
        </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
          {`// Resumo geral de todas as operações`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* TOTAIS GERAIS */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
              <div className="text-center">
                <div className="text-gray-400 text-xs font-mono mb-1">OPERAÇÕES</div>
                <div className="text-green-400 text-lg font-mono font-bold">
                  {totals.totalOperations}
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
              <div className="text-center">
                <div className="text-gray-400 text-xs font-mono mb-1">APOSTAS</div>
                <div className="text-blue-400 text-lg font-mono font-bold">
                  {totals.totalBets}
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
              <div className="text-center">
                <div className="text-gray-400 text-xs font-mono mb-1">LUCRO</div>
                <div className={`text-lg font-mono font-bold ${
                  totals.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatCurrency(totals.totalProfit)}
                </div>
              </div>
            </div>
          </div>

          {/* STATUS ATUAL */}
          {totals.activeOperations > 0 && (
            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
              <div className="flex items-center justify-center text-blue-400 font-mono text-sm">
                <div className="w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse"></div>
                {totals.activeOperations} OPERAÇÃO(ÕES) ATIVA(S)
              </div>
            </div>
          )}
          
          <div className="pt-2">
            <Button 
              onClick={loadTotals}
              disabled={isLoading}
              className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono" 
              size="sm"
              variant="outline"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  CARREGANDO...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  ATUALIZAR_TOTAIS
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 