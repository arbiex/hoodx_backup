'use client'

import { useEffect } from 'react'

// Sistema de navegação otimizada sem prefetch
// Usa lazy loading e otimizações nativas do Next.js
export const PrefetchManager = () => {
  useEffect(() => {
    // Preload apenas recursos críticos do sistema
    const preloadCriticalResources = () => {
      // Preload de fontes e assets críticos
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'font'
      link.type = 'font/woff2'
      link.crossOrigin = 'anonymous'
      document.head.appendChild(link)
      

    }

    preloadCriticalResources()
  }, [])

  return null // Componente invisível
} 