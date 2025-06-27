'use client'

import { usePathname } from 'next/navigation'
import { OptimizedLink } from '@/components/ui/optimized-link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  LayoutDashboard, 
  DollarSign, 
  Settings
} from 'lucide-react'

interface NavigationItem {
  name: string
  href: string
  icon: any
  description: string
  badge?: string
  status?: string
}

export default function BottomSidebar() {
  const pathname = usePathname()

  const navigationItems: NavigationItem[] = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      description: 'Main dashboard'
    },
    {
      name: 'Config',
      href: '/config',
      icon: Settings,
      description: 'Configuration'
    }
  ]

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className="backdrop-blur-lg border border-green-500/30 rounded-2xl shadow-2xl shadow-green-500/20 p-2" style={{ backgroundColor: '#131619' }}>
        <nav className="flex items-center justify-center gap-2">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href
            
            return (
              <OptimizedLink key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className={`
                    flex items-center justify-center h-12 w-12 relative transition-all duration-300 rounded-xl
                    ${isActive 
                      ? "bg-green-500/20 text-green-400 shadow-lg shadow-green-500/25 border border-green-500/50 hover:text-green-400 hover:bg-green-500/20" 
                      : "text-gray-400 border border-transparent hover:text-green-400"
                    }
                  `}
                >
                  <div className="relative">
                    <item.icon className="h-6 w-6" />
                    
                    {/* Badge para número */}
                    {item.badge && (
                      <Badge 
                        className="absolute -top-2 -right-2 h-4 w-4 p-0 text-xs flex items-center justify-center bg-green-500 text-black font-mono border-0 animate-pulse"
                      >
                        {item.badge}
                      </Badge>
                    )}
                    
                    {/* Indicador de status ativo */}
                    {item.status === 'active' && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-black shadow-lg shadow-green-400/50 animate-pulse"></div>
                    )}
                  </div>
                </Button>
              </OptimizedLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
} 