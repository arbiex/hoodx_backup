'use client'

import Header from '@/components/Header'
import BottomSidebar from '@/components/BottomSidebar'
import MatrixRain from '@/components/MatrixRain'
import MaintenanceAlert from '@/components/MaintenanceAlert'
import { AuthWrapper } from '@/components/AuthWrapper'
import { usePathname } from 'next/navigation'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const shouldHideBottomSidebar = pathname === '/blaze-megaroulettebr' || pathname === '/bmg' || pathname === '/bmg2' || pathname === '/bmgbr' || pathname === '/bmgbr2'

  return (
    <AuthWrapper>
    <div className="relative min-h-screen bg-black/95">
      {/* Efeito de chuva matrix de fundo */}
      <MatrixRain />
      
      {/* Alerta de Manutenção - Fixado no topo */}
      <MaintenanceAlert />
      
      {/* Conteúdo */}
      <div className="relative z-10">
        <div className="max-w-[720px] mx-auto">
          <Header />
          <div className={shouldHideBottomSidebar ? "pb-4" : "pb-24"}>
            {children}
          </div>
        </div>
        {!shouldHideBottomSidebar && <BottomSidebar />}
      </div>
    </div>
    </AuthWrapper>
  )
} 