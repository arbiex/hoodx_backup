'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Redirecionar para a rota raiz
  useEffect(() => {
    // Preservar quaisquer parâmetros de query
    const queryString = searchParams.toString()
    const newUrl = queryString ? `/?${queryString}` : '/'
    
    router.replace(newUrl)
  }, [router, searchParams])

  // Mostrar carregamento durante o redirecionamento
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-green-400 font-mono">Redirecionando...</div>
    </div>
  )
} 