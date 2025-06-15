'use client'

import { useState, useEffect } from 'react'

interface BotStatus {
  isActive: boolean
  uptime: string
  profitToday: number
  tradesToday: number
  successRate: number
  lastTrade: string
  lastMultiplier: string
}

export function useBotData() {
  const [botStatus, setBotStatus] = useState<BotStatus>({
    isActive: true,
    uptime: '12h 34m',
    profitToday: 127.50,
    tradesToday: 23,
    successRate: 78,
    lastTrade: 'CRASH',
    lastMultiplier: '2.4x'
  })
  const [loading, setLoading] = useState(false)

  const pauseBot = () => {
    setBotStatus(prev => ({ ...prev, isActive: false }))
  }

  const resumeBot = () => {
    setBotStatus(prev => ({ ...prev, isActive: true }))
  }

  // Simular atualizações periódicas dos dados
  useEffect(() => {
    const interval = setInterval(() => {
      if (botStatus.isActive) {
        setBotStatus(prev => ({
          ...prev,
          profitToday: prev.profitToday + (Math.random() * 10 - 5), // Variação aleatória
          tradesToday: prev.tradesToday + (Math.random() > 0.7 ? 1 : 0), // Ocasionalmente incrementa
          successRate: Math.max(60, Math.min(95, prev.successRate + (Math.random() * 4 - 2))), // Mantém entre 60-95%
          lastMultiplier: `${(Math.random() * 3 + 1).toFixed(1)}x` // Entre 1.0x e 4.0x
        }))
      }
    }, 30000) // Atualiza a cada 30 segundos

    return () => clearInterval(interval)
  }, [botStatus.isActive])

  return {
    botStatus,
    pauseBot,
    resumeBot,
    loading
  }
} 