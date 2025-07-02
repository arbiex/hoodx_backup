import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ isAuthorized: false })
    }

    // Verificar se o ID do usuário está na lista de IDs autorizados
    const authorizedIds = process.env.NEXT_MATRIXX_AUTHORIZED_IDS?.split(',').map(id => id.trim()) || []
    const isAuthorized = authorizedIds.includes(userId)



    return NextResponse.json({ isAuthorized })
  } catch (error) {
    console.error('Erro na verificação de autorização:', error)
    return NextResponse.json({ isAuthorized: false })
  }
} 