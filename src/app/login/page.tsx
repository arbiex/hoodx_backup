'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  // Redirecionar para a rota raiz
  useEffect(() => {
    // Preservar quaisquer parâmetros de query
    const searchParams = new URLSearchParams(window.location.search)
    const queryString = searchParams.toString()
    const newUrl = queryString ? `/?${queryString}` : '/'
    
    router.replace(newUrl)
  }, [router])

  // Mostrar carregamento durante o redirecionamento
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-green-400 font-mono">Redirecionando...</div>
    </div>
  )
} 