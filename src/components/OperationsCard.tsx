'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap } from 'lucide-react'

interface OperationReport {
  summary: {
    totalBets: number;
    winRate: number;
    profit: number;
    wins?: number;
    losses?: number;
    startedAt: string | number;
  }
}

interface OperationsCardProps {
  operationReport: OperationReport | null;
}

export default function OperationsCard({ operationReport }: OperationsCardProps) {
  if (!operationReport) {
    return (
      <Card className="border-blue-500/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-400 font-mono">
            <Zap className="h-5 w-5" />
            OPERAÇÕES
          </CardTitle>
          <CardDescription className="text-gray-400 font-mono text-xs">
            {`// Estatísticas da sessão atual`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-gray-400 font-mono text-sm">
            Nenhuma operação ativa
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-blue-500/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-400 font-mono">
          <Zap className="h-5 w-5" />
          OPERAÇÕES
        </CardTitle>
        <CardDescription className="text-gray-400 font-mono text-xs">
          {`// Estatísticas da sessão atual`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Cards de Estatísticas */}
          <div className="grid grid-cols-2 gap-4">
            {/* Card APOSTAS */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="text-center">
                <div className="text-gray-400 text-xs font-mono mb-1">APOSTAS</div>
                <div className="text-blue-400 text-lg font-mono font-bold">
                  {operationReport.summary.totalBets || 0}
                </div>
              </div>
            </div>
            
            {/* Card LUCRO */}
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="text-center">
                <div className="text-gray-400 text-xs font-mono mb-1">LUCRO</div>
                <div className={`text-lg font-mono font-bold ${
                  (operationReport.summary.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  R$ {(operationReport.summary.profit || 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Informações Adicionais */}
          <div className="text-sm font-mono">
            <div className="flex justify-between">
              <span className="text-gray-400">Iniciado:</span>
              <span className="text-gray-300">
                {new Date(
                  typeof operationReport.summary.startedAt === 'number' 
                    ? operationReport.summary.startedAt 
                    : operationReport.summary.startedAt
                ).toLocaleTimeString('pt-BR')}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 