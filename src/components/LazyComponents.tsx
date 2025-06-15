'use client'

import { lazy, Suspense } from 'react'

// Loading component otimizado
const PageLoader = ({ pageName }: { pageName: string }) => (
  <div className="min-h-screen bg-black flex items-center justify-center">
    <div className="text-center">
      <div className="animate-pulse space-y-4 mb-6">
        <div className="h-12 bg-green-900/30 rounded w-80 mx-auto"></div>
        <div className="h-6 bg-green-900/20 rounded w-56 mx-auto"></div>
        <div className="h-4 bg-green-900/20 rounded w-32 mx-auto"></div>
      </div>
      <h2 className="text-2xl font-bold text-green-400 font-mono mb-4">LOADING_{pageName.toUpperCase()}</h2>
      <p className="text-green-500 text-sm animate-pulse font-mono">
        {`// Initializing ${pageName} module`}
      </p>
      <div className="mt-4">
        <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50 mx-auto"></div>
      </div>
    </div>
  </div>
)

// Lazy load dos componentes principais (sem prefetch)
export const LazyDashboard = lazy(() => import('@/app/(protected)/dashboard/page'))
export const LazyCredits = lazy(() => import('@/app/(protected)/credits/page'))
export const LazyNetwork = lazy(() => import('@/app/(protected)/network/page'))
export const LazyConfig = lazy(() => import('@/app/(protected)/config/page'))

// Wrapper com Suspense otimizado
export const LazyPageWrapper = ({ 
  children, 
  pageName 
}: { 
  children: React.ReactNode
  pageName: string 
}) => (
  <Suspense fallback={<PageLoader pageName={pageName} />}>
    {children}
  </Suspense>
)

// Hook para preload manual (quando necessário)
export const usePagePreloader = () => {
  const preloadPage = (pageName: 'dashboard' | 'credits' | 'network' | 'config') => {
    switch (pageName) {
      case 'dashboard':
        import('@/app/(protected)/dashboard/page')
        break
      case 'credits':
        import('@/app/(protected)/credits/page')
        break
      case 'network':
        import('@/app/(protected)/network/page')
        break
      case 'config':
        import('@/app/(protected)/config/page')
        break
    }
  }

  return { preloadPage }
}

// Loading skeletons com tema Matrix
const PageSkeleton = () => {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-black text-green-400 font-mono">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-green-900/30 rounded w-64"></div>
        <div className="h-4 bg-green-900/20 rounded w-48"></div>
        <div className="h-4 bg-green-900/20 rounded w-32"></div>
      </div>
      <p className="mt-4 text-green-500 text-sm animate-pulse">
        Loading...
      </p>
    </div>
  )
}

const CardSkeleton = () => (
  <div className="bg-black/40 border border-green-500/30 rounded-lg p-4 animate-pulse">
    <div className="h-6 bg-green-900/30 rounded mb-3"></div>
    <div className="space-y-2">
      <div className="h-4 bg-green-900/20 rounded w-3/4"></div>
      <div className="h-4 bg-green-900/20 rounded w-1/2"></div>
    </div>
  </div>
)

// HOC para wrapper com Suspense
export const withSuspense = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
) => {
  return (props: P) => (
    <Suspense fallback={fallback || <PageSkeleton />}>
      <Component {...props} />
    </Suspense>
  )
}

// Wrapper para listas de cards
export const withCardSuspense = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return (props: P) => (
    <Suspense fallback={
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    }>
      <Component {...props} />
    </Suspense>
  )
} 