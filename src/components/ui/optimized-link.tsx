'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition } from 'react'

interface OptimizedLinkProps {
  href: string
  children: React.ReactNode
  className?: string
  [key: string]: any
}

export const OptimizedLink = ({ 
  href, 
  children, 
  className, 
  ...props 
}: OptimizedLinkProps) => {
  const router = useRouter()

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    
    // Usar startTransition para navegação não-bloqueante
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <Link 
      href={href} 
      className={className}
      onClick={handleClick}
      prefetch={false} // Desabilitar prefetch automático
      {...props}
    >
      {children}
    </Link>
  )
} 