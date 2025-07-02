'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Auth from '@/components/Auth'

function ConviteContent() {
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
        // Erro ou não logado, permanecer na página de convite

      }
    }

    checkAuth()
  }, [router])

  const handleAuthSuccess = () => {
    // Redirecionar para dashboard após login/registro bem-sucedido
    router.push('/dashboard')
  }

  // Capturar código de indicação da URL
  const referralCode = searchParams.get('ref')

  return (
    <Auth 
      onAuthSuccess={handleAuthSuccess} 
      defaultMode="invite-only"
      initialReferralCode={referralCode || undefined}
    />
  )
}

export default function InviteClient() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-green-400 font-mono">Carregando...</div>
      </div>
    }>
      <ConviteContent />
    </Suspense>
  )
} 