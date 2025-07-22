import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Cliente Supabase para operações admin (server-side)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Chave de service role para admin
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: NextRequest) {
  try {
    const { userIds, requestUserId } = await request.json()

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

    // Buscar dados dos usuários usando service role key
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers()

    if (error) {
      console.error('Erro ao buscar usuários:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Criar mapa de user_id -> email para os IDs solicitados
    const userEmailMap: Record<string, string> = {}
    
    if (users?.users) {
      users.users.forEach(user => {
        if (userIds.includes(user.id)) {
          userEmailMap[user.id] = user.email || 'Email não encontrado'
        }
      })
    }

    return NextResponse.json({ userEmailMap })

  } catch (error) {
    console.error('Erro na API admin/users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 