'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Auth from '@/components/Auth'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Verificar se já está logado ao acessar a página
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { authHelpers } = await import('@/lib/supabase')
        const { data } = await authHelpers.getCurrentUser()
        if (data.user) {
          // Já está logado, redirecionar para dashboard
          router.push('/dashboard')
        }
      } catch (error) {
        // Erro ou não logado, permanecer na página de login

      }
    }

    checkAuth()
  }, [router, searchParams])

  const handleAuthSuccess = () => {
    // Redirecionar para dashboard
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-black">
      <Auth onAuthSuccess={handleAuthSuccess} defaultMode="login" />
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-green-400 font-mono">Carregando...</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
