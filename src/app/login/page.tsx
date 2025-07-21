'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Redirecionar para a rota raiz
  useEffect(() => {
    // Preservar quaisquer parâmetros de query
    const queryString = searchParams.toString()
    const newUrl = queryString ? `/?${queryString}` : '/'
    
    router.replace(newUrl)
  }, [router, searchParams])

  return null
}

export default function LoginPage() {
  // Mostrar carregamento durante o redirecionamento
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-green-400 font-mono">Redirecionando...</div>
      <Suspense fallback={null}>
        <LoginRedirect />
      </Suspense>
    </div>
  )
} 