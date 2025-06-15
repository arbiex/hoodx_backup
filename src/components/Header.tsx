'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogOut, User, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function Header() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [credits, setCredits] = useState(0)

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { authHelpers } = await import('@/lib/supabase')
        const { data } = await authHelpers.getCurrentUser()
        if (data.user) {
          setUser(data.user)
          // Mock credits for now
          setCredits(1250)
        }
      } catch (error) {
        console.error('Error loading user data:', error)
      }
    }

    loadUserData()
  }, [])

  const handleLogout = async () => {
    try {
      const { authHelpers } = await import('@/lib/supabase')
      await authHelpers.signOut()
      toast.success('Sessão encerrada com sucesso')
      router.push('/login')
    } catch (error) {
      toast.error('Erro ao fazer logout')
    }
  }

  return (
    <div className="flex justify-between items-center p-4 mb-4">
      {/* Logo e Brand */}
      <div className="flex items-center gap-2">
        <Image
          src="/isotipo.svg"
          alt="HoodX Logo"
          width={32}
          height={32}
        />
        <span className="text-lg font-bold font-mono text-green-400">
          HOODX<span className="text-green-500">.AI</span>
        </span>
      </div>

      {/* Logout Icon */}
      <Button 
        onClick={handleLogout} 
        variant="ghost"
        size="sm"
        className="text-green-400 hover:bg-green-500/10 hover:text-green-300 p-2"
      >
        <LogOut className="h-5 w-5" />
      </Button>
    </div>
  )
} 