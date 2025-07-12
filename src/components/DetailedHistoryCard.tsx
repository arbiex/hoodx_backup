/**
 * 📋 COMPONENTE: Histórico Detalhado
 * 
 * Exibe histórico completo de análises e apostas reais
 * com filtros e opção de download para análise posterior
 */
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Filter, History, TrendingUp, TrendingDown } from 'lucide-react';

interface HistoryEntry {
  id: string;
  timestamp: number;
  mode: 'analysis' | 'real';
  martingaleLevel: number;
  betColor: 'R' | 'B' | 'E' | 'O' | 'L' | 'H';
  resultColor: string; // 'R', 'B', 'green' (sem pending/sent)
  resultNumber: number;
  gameId: string;
  isWin: boolean;
  betAmount: number;
  profit: number;
  sequencePosition: string;
}

interface DetailedHistoryCardProps {
  history: HistoryEntry[];
}

export default function DetailedHistoryCard({ history }: DetailedHistoryCardProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'analysis' | 'real'>('all');
  const [showOnlyWins, setShowOnlyWins] = useState(false);
  const [showSessions, setShowSessions] = useState(true);

  // Filtrar dados baseado nos filtros selecionados
  const filteredHistory = useMemo(() => {
    let filtered = [...history];
    
    if (filterMode !== 'all') {
      filtered = filtered.filter(entry => entry.mode === filterMode);
    }
    
    if (showOnlyWins) {
      filtered = filtered.filter(entry => entry.isWin);
    }
    
    return filtered.sort((a, b) => b.timestamp - a.timestamp); // Mais recentes primeiro
  }, [history, filterMode, showOnlyWins]);

  // Detectar sessões de modo real e criar resumos
  const realSessions = useMemo(() => {
    const sessions: Array<{
      id: string;
      startTime: number;
      endTime: number;
      entries: HistoryEntry[];
      totalBets: number;
      wins: number;
      losses: number;
      totalProfit: number;
      winRate: number;
    }> = [];
    
    let currentSession: HistoryEntry[] = [];
    let sessionId = 1;
    
    // Ordenar por timestamp (mais antigo primeiro para processar cronologicamente)
    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
    
    for (let i = 0; i < sortedHistory.length; i++) {
      const entry = sortedHistory[i];
      
      if (entry.mode === 'real') {
        currentSession.push(entry);
      } else if (entry.mode === 'analysis' && currentSession.length > 0) {
        // Transição de real para análise - finalizar sessão
        const sessionEntries = [...currentSession];
        const wins = sessionEntries.filter(e => e.isWin).length;
        const losses = sessionEntries.filter(e => !e.isWin).length;
        const totalProfit = sessionEntries.reduce((sum, e) => sum + e.profit, 0);
        
        sessions.push({
          id: `session_${sessionId}`,
          startTime: sessionEntries[0].timestamp,
          endTime: sessionEntries[sessionEntries.length - 1].timestamp,
          entries: sessionEntries,
          totalBets: sessionEntries.length,
          wins,
          losses,
          totalProfit,
          winRate: sessionEntries.length > 0 ? (wins / sessionEntries.length * 100) : 0
        });
        
        currentSession = [];
        sessionId++;
      }
    }
    
    // Se ainda há uma sessão ativa (modo real), incluí-la
    if (currentSession.length > 0) {
      const sessionEntries = [...currentSession];
      const wins = sessionEntries.filter(e => e.isWin).length;
      const losses = sessionEntries.filter(e => !e.isWin).length;
      const totalProfit = sessionEntries.reduce((sum, e) => sum + e.profit, 0);
      
      sessions.push({
        id: `session_${sessionId}_active`,
        startTime: sessionEntries[0].timestamp,
        endTime: sessionEntries[sessionEntries.length - 1].timestamp,
        entries: sessionEntries,
        totalBets: sessionEntries.length,
        wins,
        losses,
        totalProfit,
        winRate: sessionEntries.length > 0 ? (wins / sessionEntries.length * 100) : 0
      });
    }
    
    return sessions.reverse(); // Mais recentes primeiro
  }, [history]);

  // Calcular estatísticas
  const stats = useMemo(() => {
    const analysisEntries = history.filter(entry => entry.mode === 'analysis');
    const realEntries = history.filter(entry => entry.mode === 'real');
    
    return {
      total: history.length,
      analysis: {
        total: analysisEntries.length,
        wins: analysisEntries.filter(entry => entry.isWin).length,
        winRate: analysisEntries.length > 0 ? (analysisEntries.filter(entry => entry.isWin).length / analysisEntries.length * 100) : 0
      },
      real: {
        total: realEntries.length,
        wins: realEntries.filter(entry => entry.isWin).length,
        winRate: realEntries.length > 0 ? (realEntries.filter(entry => entry.isWin).length / realEntries.length * 100) : 0,
        totalProfit: realEntries.reduce((sum, entry) => sum + entry.profit, 0)
      }
    };
  }, [history]);

  // Função para baixar histórico em CSV
  const downloadCSV = () => {
    const csvHeaders = [
      'Timestamp',
      'Data/Hora',
      'Modo',
      'Nível',
      'Cor Apostada',
      'Resultado',
      'Número',
      'Game ID',
      'Status',
      'Valor Apostado',
      'Lucro/Prejuízo'
    ];

    const csvData = filteredHistory.map(entry => {
      const betColor = entry.betColor === 'R' ? 'Vermelho' : 
                         entry.betColor === 'B' ? 'Preto' : 
                         entry.betColor === 'E' ? 'Par' : 
                         entry.betColor === 'O' ? 'Ímpar' : 
                         entry.betColor === 'L' ? 'Baixas (1-18)' : 
                         entry.betColor === 'H' ? 'Altas (19-36)' : 'Verde';
      
      // Usar a mesma lógica de formatResult para CSV
      const resultFormatted = formatResult(entry);
      const resultColor = resultFormatted.text;
      
      const status = entry.isWin ? 'Vitória' : 'Derrota';
      
      return [
        entry.timestamp,
        new Date(entry.timestamp).toLocaleString('pt-BR'),
        entry.mode === 'analysis' ? 'Análise' : 'Real',
        entry.sequencePosition,
        betColor,
        resultColor,
        entry.resultNumber,
        entry.gameId,
        status,
        entry.betAmount,
        entry.profit,
        entry.isWin ? 'Sim' : 'Não'
      ];
    });

    const csvContent = [
      csvHeaders.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bmgbr_historico_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Função para formatar cor
  const formatColor = (color: string) => {
    switch (color) {
      case 'R':
        return { text: 'Vermelho', class: 'text-red-400' };
      case 'B':
        return { text: 'Preto', class: 'text-gray-300' };
      case 'E':
        return { text: 'Par', class: 'text-blue-400' };
      case 'O':
        return { text: 'Ímpar', class: 'text-purple-400' };
      case 'L':
        return { text: 'Baixas (1-18)', class: 'text-yellow-400' };
      case 'H':
        return { text: 'Altas (19-36)', class: 'text-orange-400' };
      default:
        return { text: 'Verde', class: 'text-green-400' };
    }
  };

  // Função para interpretar resultado baseado no tipo de aposta
  const formatResult = (entry: HistoryEntry) => {
    const { betColor, resultColor, resultNumber } = entry;
    
    // Se o resultado foi verde (zero), sempre mostrar verde
    if (resultColor === 'green' || resultNumber === 0) {
      return { text: 'Verde (0)', class: 'text-green-400' };
    }
    
    // Interpretar resultado baseado no tipo de aposta
    switch (betColor) {
      case 'E': // Aposta Par
      case 'O': // Aposta Ímpar
        // Para apostas par/ímpar, mostrar se o número é par ou ímpar
        if (resultNumber % 2 === 0) {
          return { text: 'Par', class: 'text-blue-400' };
        } else {
          return { text: 'Ímpar', class: 'text-purple-400' };
        }
        
      case 'L': // Aposta Baixas
      case 'H': // Aposta Altas
        // Para apostas baixas/altas, mostrar se o número é baixo ou alto
        if (resultNumber >= 1 && resultNumber <= 18) {
          return { text: 'Baixas (1-18)', class: 'text-yellow-400' };
        } else if (resultNumber >= 19 && resultNumber <= 36) {
          return { text: 'Altas (19-36)', class: 'text-orange-400' };
        }
        break;
        
      case 'R': // Aposta Vermelho
      case 'B': // Aposta Preto
      default:
        // Para apostas vermelho/preto, mostrar a cor normalmente
        return formatColor(resultColor);
    }
    
    // Fallback para casos não cobertos
    return formatColor(resultColor);
  };

  // Função para formatar status da aposta
  const formatBetStatus = (entry: HistoryEntry) => {
    return entry.isWin 
      ? { text: 'VITÓRIA', class: 'bg-green-500/20 text-green-400' }
      : { text: 'DERROTA', class: 'bg-red-500/20 text-red-400' };
  };

  return (
    <Card className="bg-black/40 backdrop-blur-sm border-purple-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <History className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-purple-400 font-mono">📋 HISTÓRICO_DETALHADO</CardTitle>
              <CardDescription className="font-mono text-xs">
                Análises e apostas reais para análise posterior
              </CardDescription>
            </div>
          </div>
          
          <Button
            onClick={downloadCSV}
            disabled={filteredHistory.length === 0}
            className="bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono text-xs"
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            BAIXAR CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Estatísticas Resumidas */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-400 font-mono">{stats.analysis.total}</div>
              <div className="text-xs text-gray-400 font-mono">Análises</div>
              <div className="text-xs text-blue-400 font-mono">{stats.analysis.winRate.toFixed(1)}% win</div>
            </div>
          </div>
          
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="text-center">
              <div className="text-lg font-bold text-red-400 font-mono">{stats.real.total}</div>
              <div className="text-xs text-gray-400 font-mono">Apostas Reais</div>
              <div className="text-xs text-red-400 font-mono">{stats.real.winRate.toFixed(1)}% win</div>
            </div>
          </div>
          
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="text-center">
              <div className={`text-lg font-bold font-mono flex items-center justify-center gap-1 ${
                stats.real.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {stats.real.totalProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                R$ {stats.real.totalProfit.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 font-mono">Lucro Real</div>
            </div>
          </div>
        </div>

        {/* Resumo de Sessões do Modo Real */}
        {realSessions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-mono text-purple-400">📊 RESUMO_SESSÕES_REAIS</div>
              <button
                onClick={() => setShowSessions(!showSessions)}
                className="text-xs text-gray-400 hover:text-purple-400 font-mono"
              >
                {showSessions ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {showSessions && (
              <div className="max-h-40 overflow-y-auto space-y-2">
              {realSessions.map((session, index) => {
                const isActive = session.id.includes('_active');
                const duration = Math.round((session.endTime - session.startTime) / 1000 / 60); // em minutos
                
                return (
                  <div
                    key={session.id}
                    className={`p-3 rounded-lg border ${
                      isActive 
                        ? 'bg-blue-500/10 border-blue-500/30' 
                        : session.totalProfit >= 0 
                          ? 'bg-green-500/10 border-green-500/30' 
                          : 'bg-red-500/10 border-red-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`px-2 py-1 rounded text-xs font-mono ${
                          isActive 
                            ? 'bg-blue-500/20 text-blue-400' 
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {isActive ? 'ATIVA' : `SESSÃO ${realSessions.length - index}`}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">
                          {new Date(session.startTime).toLocaleTimeString('pt-BR')} - {new Date(session.endTime).toLocaleTimeString('pt-BR')}
                          {duration > 0 && ` (${duration}min)`}
                        </div>
                      </div>
                      
                      <div className={`text-sm font-bold font-mono ${
                        session.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {session.totalProfit >= 0 ? '+' : ''}R$ {session.totalProfit.toFixed(2)}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 font-mono">
                      <span>{session.totalBets} apostas</span>
                      <span className="text-green-400">{session.wins} vitórias</span>
                      <span className="text-red-400">{session.losses} derrotas</span>
                      <span>{session.winRate.toFixed(1)}% win rate</span>
                    </div>
                  </div>
                );
                             })}
               </div>
             )}
           </div>
         )}

        {/* Filtros */}
        <div className="flex items-center gap-2 p-3 bg-gray-800/30 rounded-lg">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-400 font-mono">Filtros:</span>
          
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as any)}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs font-mono text-white"
          >
            <option value="all">Todos</option>
            <option value="analysis">Apenas Análise</option>
            <option value="real">Apenas Real</option>
          </select>
          
          <label className="flex items-center gap-1 text-xs font-mono text-gray-400">
            <input
              type="checkbox"
              checked={showOnlyWins}
              onChange={(e) => setShowOnlyWins(e.target.checked)}
              className="rounded"
            />
            Apenas vitórias
          </label>
        </div>

        {/* Tabela de Histórico */}
        <div className="max-h-64 overflow-y-auto border border-gray-700 rounded-lg">
          {filteredHistory.length === 0 ? (
            <div className="p-4 text-center text-gray-400 font-mono text-sm">
              Nenhum registro encontrado
            </div>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead className="bg-gray-800/50 sticky top-0">
                <tr>
                  <th className="p-2 text-left text-gray-300">Hora</th>
                  <th className="p-2 text-left text-gray-300">Modo</th>
                  <th className="p-2 text-left text-gray-300">Nível</th>
                  <th className="p-2 text-left text-gray-300">Aposta</th>
                  <th className="p-2 text-left text-gray-300">Resultado</th>
                  <th className="p-2 text-left text-gray-300">Status</th>
                  <th className="p-2 text-left text-gray-300">Lucro/Prejuízo</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((entry) => {
                  const betColorFormatted = formatColor(entry.betColor);
                  const resultColorFormatted = formatResult(entry);
                  
                  return (
                    <tr key={entry.id} className="border-b border-gray-700/50 hover:bg-gray-800/30">
                      <td className="p-2 text-gray-400">
                        {new Date(entry.timestamp).toLocaleTimeString('pt-BR')}
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          entry.mode === 'analysis' 
                            ? 'bg-blue-500/20 text-blue-400' 
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {entry.mode === 'analysis' ? 'ANÁLISE' : 'REAL'}
                        </span>
                      </td>
                      <td className="p-2 text-yellow-400">{entry.sequencePosition}</td>
                      <td className={`p-2 ${betColorFormatted.class}`}>
                        {betColorFormatted.text}
                      </td>
                      <td className={`p-2 ${resultColorFormatted.class}`}>
                        {resultColorFormatted.text}
                        {entry.resultNumber !== -1 && entry.resultNumber !== undefined && (
                          <span className="ml-1 text-xs text-gray-400">
                            ({entry.resultNumber})
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs ${formatBetStatus(entry).class}`}>
                          {formatBetStatus(entry).text}
                        </span>
                      </td>
                      <td className={`p-2 font-mono ${
                        entry.isWin ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {entry.isWin ? '+' : ''}R$ {entry.profit.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Informação sobre limpeza */}
        <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="text-xs text-yellow-400 font-mono text-center">
            💾 Histórico temporário - Limpa ao recarregar página ou reiniciar operação
          </div>
        </div>

        {/* Removido: Informação sobre status especiais */}
      </CardContent>
    </Card>
  );
} 