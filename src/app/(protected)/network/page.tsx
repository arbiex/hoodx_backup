'use client'

import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Users, DollarSign, Link, Crown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import MatrixRain from '@/components/MatrixRain'
import { toast } from 'sonner'
import { useNetwork } from '@/hooks/useNetwork'

export default function HackerNetworkPage() {
  const { 
    agentData,
    networkData,
    generateReferralLink,
    loading,
    error
  } = useNetwork()
  
  const [isAgent, setIsAgent] = useState(false)
  const [agentLoading, setAgentLoading] = useState(true)

  const handleBackClick = () => {
    window.history.back()
  }

  const copyInviteLink = () => {
    const link = generateReferralLink()
    if (link) {
      navigator.clipboard.writeText(link)
      toast.success('Link copiado para área de transferência')
    } else {
      toast.error('Erro ao gerar link de indicação')
    }
  }

  // Verificar se o usuário é um agente
  useEffect(() => {
    const checkAgentStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setAgentLoading(false)
          return
        }

        const { data: agentData } = await supabase
          .from('agents')
          .select('id')
          .eq('user_id', user.id)
          .single()

        setIsAgent(!!agentData)
      } catch (error) {
        console.error('Erro ao verificar status de agente:', error)
        setIsAgent(false)
      } finally {
        setAgentLoading(false)
      }
    }

    checkAgentStatus()
  }, [])

  if (agentLoading) {
    return (
      <div className="min-h-screen bg-black relative overflow-hidden">
        <MatrixRain />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-green-400 font-mono">Carregando...</div>
        </div>
      </div>
    )
  }

  if (!isAgent) {
    return (
      <div className="min-h-screen bg-black relative overflow-hidden">
        <MatrixRain />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-red-400 mb-4">Acesso Negado</h1>
            <p className="text-gray-400 font-mono mb-8">Você não tem permissão para acessar esta área.</p>
            <Button onClick={handleBackClick} variant="ghost" className="text-gray-400 hover:text-white font-mono">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      <MatrixRain />
      <div className="relative z-10 container mx-auto px-4 py-8">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button onClick={handleBackClick} variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold text-green-400 font-mono">NETWORK</h1>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="border-green-500/30 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-400 font-mono">TOTAL_GANHOS</CardTitle>
              <DollarSign className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-green-400">
                R$ {agentData?.total_earnings?.toFixed(2) || '0.00'}
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500/30 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-400 font-mono">TOTAL_INDICADOS</CardTitle>
              <Users className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-blue-400">
                {agentData?.total_invited || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-purple-500/30 backdrop-blur-sm mb-8">
          <CardHeader>
            <CardTitle className="text-purple-400 font-mono">LINK_INDICACAO</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={generateReferralLink() || 'Loading...'}
                readOnly
                className="bg-black/50 border-green-500/30 text-green-400 font-mono text-sm"
              />
              <Button onClick={copyInviteLink} className="bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30">
                <Link className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-700/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-gray-400 font-mono">REDE_INDICADOS</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-400 font-mono">Carregando...</div>
            ) : error ? (
              <div className="text-center py-8 text-red-400 font-mono">Erro ao carregar dados</div>
            ) : !networkData || networkData.length === 0 ? (
              <div className="text-center py-8 text-gray-400 font-mono">
                Nenhum indicado ainda. Compartilhe seu link para começar!
              </div>
            ) : (
              <div className="space-y-3">
                {networkData.map((node) => (
                  <div key={node.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-800/30 border border-gray-700/50">
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full ${node.is_active ? 'bg-green-400' : 'bg-gray-500'}`}></div>
                      <div>
                        <div className={`font-medium font-mono text-sm ${node.is_active ? 'text-green-400' : 'text-gray-500'}`}>
                          {node.invited_user_email}
                        </div>
                        <div className={`text-xs font-mono ${node.is_active ? 'text-gray-400' : 'text-gray-600'}`}>
                          Indicado em: {new Date(node.invited_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className={`text-sm font-mono ${node.is_active ? 'text-green-400' : 'text-gray-500'}`}>
                          R$ {node.commission_earned?.toFixed(2) || '0.00'}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">Comissão</div>
                      </div>
                      <Check className={`h-5 w-5 ${node.is_active ? 'text-green-400' : 'text-gray-500'}`} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 