import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Cliente Supabase com service role para bypassar RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: NextRequest) {
  try {
    const { requestUserId } = await request.json()

    // Verificar se o usuário requisitante é admin
    const authorizedIdsEnv = process.env.NEXT_MATRIXX_AUTHORIZED_IDS
    if (!authorizedIdsEnv) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const authorizedIds = authorizedIdsEnv.split(',').map(id => id.trim())
    const isAuthorized = authorizedIds.includes(requestUserId)

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Buscar TODAS as transações de todos os usuários (usando service role)
    const { data: transactions, error } = await supabaseAdmin
      .from('fxa_token_transactions')
      .select('user_id, amount, amount_brl, created_at')
      .eq('transaction_type', 'credit')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar transações:', error)
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }

    // Buscar emails de todos os usuários únicos
    const uniqueUserIds = [...new Set(transactions?.map(t => t.user_id) || [])]
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers()

    const userEmailMap: Record<string, string> = {}
    
    if (users?.users) {
      users.users.forEach(user => {
        if (uniqueUserIds.includes(user.id)) {
          userEmailMap[user.id] = user.email || 'Email não encontrado'
        }
      })
    }

    // Agrupar por usuário e calcular estatísticas
    const userMap = new Map<string, {
      user_id: string
      user_email: string
      total_amount_brl: number
      total_tokens: number
      first_purchase: string
      last_purchase: string
      purchase_count: number
    }>()

    transactions?.forEach(transaction => {
      const userId = transaction.user_id
      const userEmail = userEmailMap[userId] || `user_${userId.slice(-8)}`
      
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user_id: userId,
          user_email: userEmail,
          total_amount_brl: 0,
          total_tokens: 0,
          first_purchase: transaction.created_at,
          last_purchase: transaction.created_at,
          purchase_count: 0
        })
      }

      const userData = userMap.get(userId)!
      userData.total_amount_brl += Number(transaction.amount_brl || 0)
      userData.total_tokens += Number(transaction.amount || 0)
      userData.purchase_count += 1
      
      // Atualizar datas
      if (new Date(transaction.created_at) < new Date(userData.first_purchase)) {
        userData.first_purchase = transaction.created_at
      }
      if (new Date(transaction.created_at) > new Date(userData.last_purchase)) {
        userData.last_purchase = transaction.created_at
      }
    })

    // Converter para array e calcular estatísticas
    const statsArray = Array.from(userMap.values()).map(userData => ({
      user_id: userData.user_id,
      user_email: userData.user_email,
      total_purchases: userData.total_amount_brl,
      total_amount_brl: userData.total_amount_brl,
      total_tokens: userData.total_tokens,
      first_purchase: userData.first_purchase,
      last_purchase: userData.last_purchase,
      avg_price_per_token: userData.total_tokens > 0 ? userData.total_amount_brl / userData.total_tokens : 0,
      purchase_count: userData.purchase_count
    }))

    // Ordenar por valor total gasto (maior para menor)
    statsArray.sort((a, b) => b.total_amount_brl - a.total_amount_brl)

    // Calcular totais gerais
    const totals = {
      total_users: statsArray.length,
      total_revenue: statsArray.reduce((sum, user) => sum + user.total_amount_brl, 0),
      total_tokens_sold: statsArray.reduce((sum, user) => sum + user.total_tokens, 0),
      total_transactions: statsArray.reduce((sum, user) => sum + user.purchase_count, 0)
    }

    return NextResponse.json({
      userStats: statsArray,
      totalStats: totals
    })

  } catch (error) {
    console.error('Erro na API admin/token-stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 