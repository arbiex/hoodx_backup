'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Users, Link as LinkIcon, DollarSign, Crown, Shield, Target, Check, Filter, ChevronDown, ChevronUp, Clock, CreditCard, AlertCircle } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import MatrixRain from '@/components/MatrixRain'
import Modal, { useModal } from '@/components/ui/modal'
import { useNetwork, NetworkNode } from '@/hooks/useNetwork'
import { Pagination, PaginationInfo, usePagination } from '@/components/ui/pagination'
import { WithdrawalModal } from '@/components/WithdrawalModal'
import { WithdrawalHistoryCard } from '@/components/WithdrawalHistoryCard'

export default function HackerNetworkPage() {
  const { 
    networkStats,
    networkNodes,
    referralInfo,
    commissionBalance,
    getSponsorInfo,
    loading,
    error
  } = useNetwork()
  
  const { isOpen: isFiltersModalOpen, openModal: openFiltersModal, closeModal: closeFiltersModal } = useModal()
  const { isOpen: isWithdrawalModalOpen, openModal: openWithdrawalModal, closeModal: closeWithdrawalModal } = useModal()
  
  // Estados para verificação de agente
  const [isAgent, setIsAgent] = useState<boolean | null>(null)
  const [agentLoading, setAgentLoading] = useState(true)
  const [filters, setFilters] = useState({
    level: '',
    dateFrom: '',
    dateTo: '',
    topNodes: '',
    name: ''
  })
  const [isCommissionRulesOpen, setIsCommissionRulesOpen] = useState(false)
  const [sponsor, setSponsor] = useState<{
    hassponsor: boolean;
    email: string;
    joinedDate: string;
    code: string;
  } | null>(null)
  


  // Filtrar dados baseado nos filtros aplicados
  const filteredNodes = useMemo(() => {
    if (!networkNodes || networkNodes.length === 0) {
      return []
    }

    let filtered = [...networkNodes]

    // Filtro por nível
    if (filters.level) {
      filtered = filtered.filter(node => node.level === parseInt(filters.level))
    }

    // Filtro por nome/email
    if (filters.name) {
      const searchTerm = filters.name.toLowerCase()
      filtered = filtered.filter(node => 
        node.email.toLowerCase().includes(searchTerm)
      )
    }

    // Filtro por data
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom)
      filtered = filtered.filter(node => 
        new Date(node.joined_date) >= fromDate
      )
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo)
      toDate.setHours(23, 59, 59, 999) // Final do dia
      filtered = filtered.filter(node => 
        new Date(node.joined_date) <= toDate
      )
    }

    // Ordenar por comissões (maior para menor)
    filtered.sort((a, b) => b.total_commissions - a.total_commissions)

    // Filtro top N nós
    if (filters.topNodes && parseInt(filters.topNodes) > 0) {
      filtered = filtered.slice(0, parseInt(filters.topNodes))
    }

    return filtered
  }, [networkNodes, filters])

  // Paginação
  const itemsPerPage = 20
  const pagination = usePagination(filteredNodes.length, itemsPerPage)
  const paginatedNodes = pagination.getPageItems(filteredNodes)

  // Verificar se o usuário é um agente (ativo ou inativo)
  useEffect(() => {
    const checkAgentStatus = async () => {
      try {
        setAgentLoading(true)
        const { data, error } = await supabase
          .from('agents')
          .select('is_active')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Erro ao verificar status de agente:', error)
          setIsAgent(false)
          return
        }

        // Se encontrou um agente, independente do status
        if (data) {
          setIsAgent(true)
        } else {
          setIsAgent(false)
        }
      } catch (error) {
        console.error('Erro inesperado:', error)
        setIsAgent(false)
      } finally {
        setAgentLoading(false)
      }
    }

    checkAgentStatus()
  }, [])

  // Check for referral code from URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const refCode = urlParams.get('ref')
    
    if (refCode) {
      getSponsorInfo(refCode).then(sponsorData => {
        if (sponsorData) {
          setSponsor({
            hassponsor: true,
            email: sponsorData.email,
            joinedDate: sponsorData.joined_date,
            code: sponsorData.referral_code
          })
        }
      })
    }
  }, [getSponsorInfo])

  // Função para voltar ao dashboard
  const handleBackToDashboard = () => {
    window.location.href = '/dashboard'
  }

  const commissionRates = [
    { level: 1, rate: 50, icon: Crown, description: 'Indicações diretas', color: 'text-yellow-400 border-yellow-500/50' }
  ]

  const handleWithdrawalClick = () => {
    const currentBalance = commissionBalance?.commission_balance || 0
    
    if (currentBalance < 10) {
      toast.error('Saldo insuficiente', {
        description: 'Valor mínimo para saque é R$ 10,00'
      })
      return
    }
    
    openWithdrawalModal()
  }





  const copyInviteLink = () => {
    if (referralInfo?.referral_url && referralInfo.referral_url.trim() && referralInfo.referral_url !== 'Loading...') {
      navigator.clipboard.writeText(referralInfo.referral_url)
      toast.success('LINK_REDE copiado para área de transferência', {
        description: 'Compartilhe este link para expandir sua rede',
      })
    } else {
      toast.error('Link não disponível', {
        description: 'Atualize a página e tente novamente',
      })
    }
  }

  const applyFilters = () => {
    pagination.goToPage(1) // Reset para primeira página
    closeFiltersModal()
    toast.success('Filtros aplicados', {
      description: `${filteredNodes.length} nós encontrados`
    })
  }

  const resetFilters = () => {
    setFilters({
      level: '',
      dateFrom: '',
      dateTo: '',
      topNodes: '',
      name: ''
    })
    pagination.goToPage(1)
    toast.success('Filtros resetados', {
      description: 'Todos os filtros foram limpos'
    })
  }

  // Loading state
  if (agentLoading) {
    return (
      <div className="px-4 relative">
        <MatrixRain />
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <Card className="border-green-500/30 backdrop-blur-sm max-w-md w-full">
            <CardContent className="p-8 text-center">
              <div className="text-green-400 font-mono">
                Verificando acesso...
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Se não for agente, mostrar acesso negado
  if (!isAgent) {
    return (
      <div className="px-4 relative">
        {/* Matrix Rain Background */}
        <MatrixRain />
        
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <Card className="border-red-500/30 backdrop-blur-sm max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-400 font-mono text-center">
                <Shield className="h-5 w-5" />
                ACESSO_NEGADO
              </CardTitle>
              <CardDescription className="text-gray-400 font-mono text-xs text-center">
                {`// Apenas agentes autorizados podem acessar a rede`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center space-y-4">
                <div className="flex items-center gap-2 text-yellow-400 text-sm font-mono justify-center">
                  <AlertCircle className="h-4 w-4" />
                  Você não é um agente
                </div>
                
                <p className="text-gray-400 text-sm font-mono">
                  Entre em contato com a administração para se tornar um agente.
                </p>
              </div>
              
              <div className="text-center">
                <Button
                  onClick={handleBackToDashboard}
                  variant="ghost"
                  className="text-gray-400 hover:text-white font-mono text-sm"
                >
                  ← VOLTAR AO DASHBOARD
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 relative">
      {/* Matrix Rain Background */}
      <MatrixRain />
      
      <div className="relative z-10">
                 {/* Page Title */}
         <div className="mb-6 flex justify-between items-center">
           <div>
             <h1 className="text-2xl font-bold text-green-400 font-mono mb-2">REDE.exe</h1>
             <p className="text-gray-400 font-mono text-sm">// Expanda sua rede e ganhe comissões</p>
           </div>
           <Button
             onClick={handleBackToDashboard}
             variant="ghost"
             size="sm"
             className="text-gray-500 hover:text-blue-400 font-mono text-xs"
           >
             DASHBOARD
           </Button>
         </div>



         {/* Network Stats Overview */}
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
           {/* Total Earned */}
           <Card className="border-green-500/30 backdrop-blur-sm">
             <CardHeader>
               <CardTitle className="flex items-center gap-2 text-green-400 font-mono">
                 <DollarSign className="h-5 w-5" />
                 TOTAL_GANHO
               </CardTitle>
               <CardDescription className="text-gray-400 font-mono text-xs">
                 {`// Ganhos de comissão de todos os tempos`}
               </CardDescription>
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold font-mono text-green-400">
                 R$ {commissionBalance?.total_commission_earned?.toFixed(2) || '0.00'}
               </div>
             </CardContent>
           </Card>

           {/* Active Nodes */}
           <Card className="border-blue-500/30 backdrop-blur-sm">
             <CardHeader>
               <CardTitle className="flex items-center gap-2 text-blue-400 font-mono">
                 <Users className="h-5 w-5" />
                 NÓS_ATIVOS
               </CardTitle>
               <CardDescription className="text-gray-400 font-mono text-xs">
                 {`// Membros conectados da rede`}
               </CardDescription>
             </CardHeader>
             <CardContent>
               <div className="text-2xl font-bold font-mono text-blue-400">
                 {networkStats?.total_referrals || 0}
               </div>
             </CardContent>
           </Card>
        </div>

        {/* Invite Link Section */}
        <Card className="mb-8 border-green-500/30 backdrop-blur-lg shadow-2xl shadow-green-500/10">
          <CardHeader>
            <CardTitle className="text-green-400 font-mono flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              LINK_REDE
            </CardTitle>
            <CardDescription className="text-gray-400 font-mono text-xs">
              // Compartilhe este link para expandir sua rede
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={referralInfo?.referral_url && referralInfo.referral_url.trim() && referralInfo.referral_url !== 'Loading...' ? referralInfo.referral_url : 'Loading...'}
                readOnly
                className="bg-black/50 border-green-500/30 text-green-400 font-mono text-sm"
              />
              <Button
                onClick={copyInviteLink}
                className="bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Available Balance with Withdrawal */}
        <Card className="mb-8 border-purple-500/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-400 font-mono">
              <DollarSign className="h-5 w-5" />
              SALDO_DISPONÍVEL
            </CardTitle>
            <CardDescription className="text-gray-400 font-mono text-xs">
              {`// Pronto para saque`}
            </CardDescription>
             </CardHeader>
             <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-purple-400 mb-2">
                R$ {commissionBalance?.commission_balance?.toFixed(2) || '0.00'}
              </div>
              <div className="text-sm text-gray-400 font-mono mb-4">Disponível para saque imediato</div>
              <Button
                onClick={handleWithdrawalClick}
                className="bg-purple-500/20 border border-purple-500/50 text-purple-400 hover:bg-purple-500/30 font-mono px-8 py-3"
                size="lg"
              >
                <DollarSign className="h-5 w-5 mr-2" />
                SOLICITAR_SAQUE
              </Button>
            </div>
             </CardContent>
           </Card>

                 {/* Commission Structure */}
         <Card className="mb-8 border-green-500/30 backdrop-blur-lg shadow-2xl shadow-green-500/10">
           <CardHeader>
             <div className="flex items-center justify-between">
               <div>
             <CardTitle className="text-green-400 font-mono">ESTRUTURA_COMISSÕES</CardTitle>
             <CardDescription className="text-gray-400 font-mono text-xs">
               // Taxa de comissão para indicações diretas
             </CardDescription>
               </div>
               <Button
                 onClick={() => setIsCommissionRulesOpen(!isCommissionRulesOpen)}
                 className="bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono text-xs"
                 size="sm"
               >
                 REGRAS
                 {isCommissionRulesOpen ? (
                   <ChevronUp className="h-4 w-4 ml-1" />
                 ) : (
                   <ChevronDown className="h-4 w-4 ml-1" />
                 )}
               </Button>
             </div>
           </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {commissionRates.map((tier) => {
                const Icon = tier.icon
                return (
                  <div key={tier.level} className={`p-4 rounded-lg border-2 bg-black/20 ${tier.color.split(' ')[1]}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className={`h-6 w-6 ${tier.color.split(' ')[0]}`} />
                        <div>
                          <div className={`font-bold font-mono ${tier.color.split(' ')[0]}`}>
                            INDICAÇÃO_DIRETA - {tier.rate}%
                          </div>
                          <div className="text-sm text-gray-400 font-mono">{tier.description}</div>
                        </div>
                      </div>
                                             <div className="text-right">
                         <div className={`text-lg font-bold font-mono ${tier.color.split(' ')[0]}`}>
                           {networkStats?.total_referrals || 0}
                         </div>
                         <div className="text-xs text-gray-400 font-mono">INDICADOS</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Commission Rules - Collapsible */}
            {isCommissionRulesOpen && (
              <div className="mt-6 pt-6 border-t border-green-500/20">
                <h4 className="text-green-400 font-mono font-bold mb-4 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  COMO_FUNCIONA
                </h4>
                
              <div className="space-y-4">
                  {/* Commission Source */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                    <CreditCard className="h-5 w-5 text-green-400 mt-0.5" />
                    <div>
                      <div className="font-medium font-mono text-green-400 text-sm">FONTE_COMISSÃO</div>
                      <div className="text-xs text-gray-400 font-mono mt-1">
                        Ganhos são calculados sobre compras de créditos feitas pelos seus indicados diretos
                      </div>
                    </div>
                  </div>

                  {/* Instant Credit */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <DollarSign className="h-5 w-5 text-blue-400 mt-0.5" />
                    <div>
                      <div className="font-medium font-mono text-blue-400 text-sm">CRÉDITO_INSTANTÂNEO</div>
                      <div className="text-xs text-gray-400 font-mono mt-1">
                        Comissão é creditada na sua conta imediatamente após a compra
                      </div>
                    </div>
                  </div>

                  {/* Withdrawal Time */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                    <Clock className="h-5 w-5 text-yellow-400 mt-0.5" />
                    <div>
                      <div className="font-medium font-mono text-yellow-400 text-sm">TEMPO_SAQUE</div>
                      <div className="text-xs text-gray-400 font-mono mt-1">
                        Saques são processados em até 24 horas após a solicitação
                      </div>
                    </div>
                  </div>

                  {/* Withdrawal Fee */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <Target className="h-5 w-5 text-red-400 mt-0.5" />
                      <div>
                      <div className="font-medium font-mono text-red-400 text-sm">TAXA_SAQUE</div>
                      <div className="text-xs text-gray-400 font-mono mt-1">
                        Taxa de processamento de 2% aplicada a todas as solicitações de saque
                      </div>
                    </div>
                  </div>

                  {/* Withdrawal Limit */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                    <Shield className="h-5 w-5 text-purple-400 mt-0.5" />
                    <div>
                      <div className="font-medium font-mono text-purple-400 text-sm">LIMITE_SAQUE</div>
                      <div className="text-xs text-gray-400 font-mono mt-1">
                        Máximo de uma solicitação de saque por dia
                      </div>
                    </div>
                  </div>

                  {/* Minimum Withdrawal */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                    <DollarSign className="h-5 w-5 text-orange-400 mt-0.5" />
                    <div>
                      <div className="font-medium font-mono text-orange-400 text-sm">SAQUE_MÍNIMO</div>
                      <div className="text-xs text-gray-400 font-mono mt-1">
                        Valor mínimo de R$ 100,00 para solicitar saque
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </CardContent>
          </Card>

        {/* Sponsor Card */}
        {sponsor?.hassponsor && (
          <Card className="mb-8 border-yellow-500/30 backdrop-blur-sm">
             <CardHeader>
              <CardTitle className="text-yellow-400 font-mono flex items-center gap-2">
                <Crown className="h-5 w-5" />
                SEU_PATROCINADOR
              </CardTitle>
               <CardDescription className="text-gray-400 font-mono text-xs">
                // O membro que te convidou para a rede
               </CardDescription>
             </CardHeader>
             <CardContent>
               <div className="flex items-center gap-4 p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                       <div>
                   <div className="font-medium font-mono text-yellow-400 text-lg">{sponsor.email}</div>
                         <div className="text-sm text-gray-400 font-mono">
                     Código: {sponsor.code} • Entrou em: {sponsor.joinedDate}
                   </div>
                 </div>
               </div>
             </CardContent>
          </Card>
        )}

        {/* Withdrawal History */}
        <WithdrawalHistoryCard />

        {/* All Network Nodes */}
        <Card className="border-green-500/30 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-green-400 font-mono flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  SEUS_INDICADOS
                </CardTitle>
                <CardDescription className="text-gray-400 font-mono text-xs">
                  // Lista de todos os seus indicados diretos
                </CardDescription>
              </div>
              <Button
                onClick={openFiltersModal}
                className="bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono text-xs"
                size="sm"
              >
                <Filter className="h-4 w-4 mr-1" />
                FILTROS
              </Button>
            </div>
          </CardHeader>
          <CardContent>


            {/* Loading State */}
            {loading && (
              <div className="text-center py-8">
                <div className="text-green-400 font-mono">Carregando rede...</div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="text-center py-8">
                <div className="text-red-400 font-mono">Erro ao carregar rede: {error}</div>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && filteredNodes.length === 0 && (
              <div className="text-center py-8">
                <div className="text-gray-400 font-mono">
                  {networkNodes.length === 0 
                    ? 'Nenhum indicado ainda. Compartilhe seu link para começar!' 
                    : 'Nenhum resultado encontrado com os filtros aplicados'
                  }
                </div>
              </div>
            )}

            {/* Network Nodes List */}
            {!loading && !error && paginatedNodes.length > 0 && (
              <>
                {/* Nodes List */}
                <div className="space-y-3 mb-6">
                  {paginatedNodes.map((node) => (
                    <div key={node.user_id} className="flex items-center justify-between p-4 rounded-lg bg-gray-800/30 border border-gray-700/50">
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                          node.status === 'active' 
                            ? 'bg-yellow-400' 
                            : 'bg-gray-500 opacity-30'
                        }`}></div>
                        <div className="flex-1">
                          <div className={`font-medium font-mono text-sm transition-all duration-300 ${
                            node.status === 'active' ? 'text-green-400' : 'text-gray-500 opacity-60'
                          }`}>{node.email}</div>
                          <div className={`text-xs font-mono transition-all duration-300 ${
                            node.status === 'active' ? 'text-gray-400' : 'text-gray-600 opacity-50'
                          }`}>
                            Indicado direto • Entrou em: {new Date(node.joined_date).toLocaleDateString('pt-BR')}
                            {node.status === 'inactive' && ' • Sem compras'}
                          </div>
                        </div>
                      </div>
                    
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="font-bold font-mono text-green-400 text-sm">
                            R$ {node.total_commissions.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-400 font-mono">Total gerado</div>
                        </div>
                        
                        <Check 
                          className={`h-5 w-5 transition-all duration-300 ${
                            node.status === 'active' 
                              ? 'text-green-400 opacity-100' 
                              : 'text-gray-500 opacity-30'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="flex justify-center">
                    <Pagination
                      currentPage={pagination.currentPage}
                      totalPages={pagination.totalPages}
                      onPageChange={pagination.goToPage}
                      size="sm"
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Withdrawal Modal */}
        <WithdrawalModal
          isOpen={isWithdrawalModalOpen}
          onClose={closeWithdrawalModal}
          availableBalance={commissionBalance?.commission_balance || 0}
        />

        {/* Filters Modal */}
        <Modal
          isOpen={isFiltersModalOpen}
          onClose={closeFiltersModal}
          title="OPÇÕES_FILTRO"
          description="Configure filtros dos nós da rede"
          size="md"
          actions={{
            primary: {
              label: 'APLICAR_FILTROS',
              onClick: applyFilters
            },
            secondary: {
              label: 'RESETAR',
              onClick: resetFilters
            }
          }}
        >
          <div className="space-y-4">
            {/* Level Filter - Removido pois só há nível 1 */}
            <div style={{ display: 'none' }}>
              <label className="text-green-400 font-mono text-sm mb-2 block">NÍVEL</label>
              <select
                value={filters.level}
                onChange={(e) => setFilters({...filters, level: e.target.value})}
                className="w-full bg-black/50 border border-green-500/30 text-green-400 font-mono text-sm rounded px-3 py-2"
              >
                <option value="">Todas as indicações</option>
                <option value="1">Indicações diretas</option>
              </select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-green-400 font-mono text-sm mb-2 block">DE</label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                  className="bg-black/50 border-green-500/30 text-green-400 font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-green-400 font-mono text-sm mb-2 block">ATÉ</label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                  className="bg-black/50 border-green-500/30 text-green-400 font-mono text-sm"
                />
              </div>
            </div>

            {/* Top Nodes */}
            <div>
              <label className="text-green-400 font-mono text-sm mb-2 block">TOP_NÓS</label>
              <Input
                type="number"
                placeholder="Mostrar top N nós"
                value={filters.topNodes}
                onChange={(e) => setFilters({...filters, topNodes: e.target.value})}
                className="bg-black/50 border-green-500/30 text-green-400 font-mono text-sm"
              />
            </div>

            {/* Name/Email Filter */}
            <div>
              <label className="text-green-400 font-mono text-sm mb-2 block">NOME/EMAIL</label>
              <Input
                type="text"
                placeholder="Buscar por nome ou email"
                value={filters.name}
                onChange={(e) => setFilters({...filters, name: e.target.value})}
                className="bg-black/50 border-green-500/30 text-green-400 font-mono text-sm"
              />
            </div>
        </div>
        </Modal>
      </div>
    </div>
  )
} 