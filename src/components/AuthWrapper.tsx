'use client'

import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface AuthWrapperProps {
  children: React.ReactNode
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  
  const { user, loading } = useAuth()

  // Evitar problemas de hidratação
  useEffect(() => {
    setMounted(true)
  }, [])

  // Redirecionar para login se não autenticado (usando useEffect para evitar erro de setState durante render)
  useEffect(() => {
    if (mounted && !loading && !user) {
      router.push('/login')
    }
  }, [mounted, loading, user, router])

  // Não renderizar nada até estar montado no cliente
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50 mx-auto mb-4"></div>
          <p className="text-green-400 font-mono">Carregando...</p>
        </div>
      </div>
    )
  }

  // Mostrar loading enquanto verifica autenticação
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50 mx-auto mb-4"></div>
          <p className="text-green-400 font-mono">Verificando autenticação...</p>
        </div>
      </div>
    )
  }

  // Se não há usuário, mostrar loading enquanto redireciona
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50 mx-auto mb-4"></div>
          <p className="text-green-400 font-mono">Redirecionando...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
} 