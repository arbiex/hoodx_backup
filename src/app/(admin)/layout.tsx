'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
// Imports removidos - não precisamos mais de UI components para telas de erro

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    checkAuthorization()
  }, [])

  const checkAuthorization = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      if (!user) {
        // Usuário não logado - redirecionar para login
        router.push('/login')
        return
      }

      // Verificar autorização via API (mais seguro que variável client-side)
      const response = await fetch('/api/admin/check-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      })
      
      const { isAuthorized: isUserAuthorized } = await response.json()
      


      if (!isUserAuthorized) {
        // Usuário não autorizado - redirecionar imediatamente
        router.push('/dashboard')
        return
      }

      setIsAuthorized(isUserAuthorized)
    } catch (error) {
      console.error('Erro ao verificar autorização:', error)
      setIsAuthorized(false)
    }
  }

  // Se ainda não verificou ou não autorizado, não renderizar nada
  if (isAuthorized !== true) {
    return null
  }

  // Autorizado - mostrar conteúdo
  return (
    <>
      {children}
    </>
  )
} 