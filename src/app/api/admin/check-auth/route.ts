import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      console.log('❌ Admin check: userId não fornecido')
      return NextResponse.json({ isAuthorized: false })
    }

    // Verificar se o ID do usuário está na lista de IDs autorizados
    const authorizedIdsEnv = process.env.NEXT_MATRIXX_AUTHORIZED_IDS
    
    // Debug logs
    console.log('🔍 Admin check:', {
      userId,
      authorizedIdsEnv,
      hasEnvVar: !!authorizedIdsEnv
    })

    if (!authorizedIdsEnv) {
      console.log('❌ Admin check: Variável NEXT_MATRIXX_AUTHORIZED_IDS não definida')
      return NextResponse.json({ isAuthorized: false })
    }

    const authorizedIds = authorizedIdsEnv.split(',').map(id => id.trim())
    const isAuthorized = authorizedIds.includes(userId)

    console.log('🔍 Admin check result:', {
      authorizedIds,
      isAuthorized,
      userId
    })

    return NextResponse.json({ isAuthorized })
  } catch (error) {
    console.error('❌ Erro na verificação de autorização:', error)
    return NextResponse.json({ isAuthorized: false })
  }
} 