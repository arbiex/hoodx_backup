'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User as SupabaseUser } from '@supabase/supabase-js'

export default function ConfigPage() {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { authHelpers } = await import('@/lib/supabase')
        const { data } = await authHelpers.getCurrentUser()
        setUser(data.user)
      } catch (error) {
        console.error('Error loading user:', error)
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  if (loading) {
    return (
      <div className="px-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-green-400 font-mono">CARREGANDO_CONFIG...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4">
      <Card className="mb-6 border-green-500/30 backdrop-blur-lg shadow-2xl shadow-green-500/10">
        <CardHeader>
          <CardTitle className="text-green-400 font-mono">PERFIL_USUÁRIO</CardTitle>
          <CardDescription className="text-gray-400 font-mono text-xs">
            Informações da conta e configurações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-400 font-mono">EMAIL</label>
              <div className="text-green-400 font-mono">{user?.email}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-400 font-mono">ID_USUÁRIO</label>
              <div className="text-green-400 font-mono text-xs">{user?.id}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-400 font-mono">STATUS</label>
              <Badge className="bg-green-500/20 border-green-500/50 text-green-400 font-mono">
                ATIVO
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>


    </div>
  )
} 