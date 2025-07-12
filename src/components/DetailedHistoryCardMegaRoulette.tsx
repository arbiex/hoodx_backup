/**
 * 📋 COMPONENTE: Histórico Detalhado - Mega Roulette
 * 
 * Versão específica para a página blaze-megaroulettebr
 * Exibe histórico completo de análises e apostas reais
 * com filtros e opção de download para análise posterior
 */
'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { History } from 'lucide-react';

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

interface DetailedHistoryCardMegaRouletteProps {
  history: HistoryEntry[];
}

export default function DetailedHistoryCardMegaRoulette({ history }: DetailedHistoryCardMegaRouletteProps) {
  // Ordenar dados por timestamp (mais recentes primeiro)
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => b.timestamp - a.timestamp);
  }, [history]);

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
        if (resultColor === 'R') {
          return { text: 'Vermelho', class: 'text-red-400' };
        } else if (resultColor === 'B') {
          return { text: 'Preto', class: 'text-gray-300' };
        }
        break;
    }
    
    // Fallback para casos não cobertos
    if (resultColor === 'R') {
      return { text: 'Vermelho', class: 'text-red-400' };
    } else if (resultColor === 'B') {
      return { text: 'Preto', class: 'text-gray-300' };
    }
    return { text: 'Verde', class: 'text-green-400' };
  };

  // Função para formatar status da aposta
  const formatBetStatus = (entry: HistoryEntry) => {
    if (entry.mode === 'analysis') {
      // Para análise, mostrar o resultado interpretado
      const result = formatResult(entry);
      
      // Mapear classes de texto para classes de background
      const classMapping: { [key: string]: string } = {
        'text-green-400': 'bg-green-500/20 text-green-400',
        'text-red-400': 'bg-red-500/20 text-red-400',
        'text-gray-300': 'bg-gray-500/20 text-gray-300',
        'text-blue-400': 'bg-blue-500/20 text-blue-400',
        'text-purple-400': 'bg-purple-500/20 text-purple-400',
        'text-yellow-400': 'bg-yellow-500/20 text-yellow-400',
        'text-orange-400': 'bg-orange-500/20 text-orange-400',
      };
      
      const bgClass = classMapping[result.class] || 'bg-gray-500/20 text-gray-400';
      return { text: result.text, class: bgClass };
    } else {
      return entry.isWin 
        ? { text: 'VITÓRIA', class: 'bg-green-500/20 text-green-400' }
        : { text: 'DERROTA', class: 'bg-red-500/20 text-red-400' };
    }
  };

  return (
    <Card className="bg-black/40 backdrop-blur-sm border-purple-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
          <History className="h-5 w-5" />
          HISTÓRICO_DETALHADO
        </CardTitle>
        <CardDescription className="text-gray-400 font-mono text-xs">
          Análises e apostas reais realizadas
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">





        {/* Tabela de Histórico */}
        <div className="max-h-64 overflow-y-auto border border-gray-700 rounded-lg">
          {sortedHistory.length === 0 ? (
            <div className="p-4 text-center text-gray-400 font-mono text-sm">
              Nenhum registro encontrado
            </div>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead className="bg-gray-800/50 sticky top-0">
                <tr>
                  <th className="p-2 text-left text-gray-300">Hora</th>
                  <th className="p-2 text-left text-gray-300">Modo</th>
                  <th className="p-2 text-left text-gray-300">Status</th>
                  <th className="p-2 text-left text-gray-300">Lucro/Prejuízo</th>
                </tr>
              </thead>
              <tbody>
                {sortedHistory.map((entry) => {
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
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs ${formatBetStatus(entry).class}`}>
                          {formatBetStatus(entry).text}
                        </span>
                      </td>
                      <td className={`p-2 font-mono ${
                        entry.mode === 'analysis' ? 'text-gray-400' : entry.isWin ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {entry.mode === 'analysis' ? '-' : `${entry.isWin ? '+' : ''}R$ ${entry.profit.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>


      </CardContent>
    </Card>
  );
} 