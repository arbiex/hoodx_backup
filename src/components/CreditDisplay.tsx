'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign } from 'lucide-react'
import { useCredits } from '@/hooks/useCredits'

export default function CreditDisplay() {
  const { credits, loading: creditsLoading } = useCredits()

  if (creditsLoading || !credits) {
    return (
      <Card className="border-green-500/30 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400"></div>
            <span className="ml-3 text-green-400 font-mono text-sm">Carregando créditos...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-green-500/30 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
          <DollarSign className="h-5 w-5" />
          CRÉDITOS_DISPONÍVEIS
        </CardTitle>
        <CardDescription className="text-gray-400 font-mono text-xs">
          {`// Alocação de capital para operações`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-mono text-gray-400">DISPONÍVEL:</span>
              <span className="text-sm font-medium font-mono text-green-400">
                R$ {credits.available_credits.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 