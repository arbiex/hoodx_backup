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

  return (
    <div className="text-green-400 font-mono">Redirecionando...</div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Suspense fallback={<div className="text-green-400 font-mono">Carregando...</div>}>
        <LoginRedirect />
      </Suspense>
    </div>
  )
} 