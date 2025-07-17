import { NextRequest, NextResponse } from 'next/server'

// POST - Criar cobrança PIX (versão de teste)
export async function POST(request: NextRequest) {
  try {
    const { amount, description, externalId } = await request.json()

    // Validar dados
    if (!amount || !externalId) {
      return NextResponse.json(
        { success: false, error: 'Dados incompletos' },
        { status: 400 }
      )
    }

    console.log('Criando PIX:', { amount, description, externalId })

    // Por enquanto, retornar dados mock
    const mockPixData = {
      transactionId: `pix_${Date.now()}`,
      externalId,
      amount,
      pixQrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      pixCopyPaste: '00020126360014BR.GOV.BCB.PIX0114+5511999999999520400005303986540550.005802BR5925HoodX6009SAO PAULO62070503***630493A3',
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hora
      status: 'PENDING'
    }
    
    return NextResponse.json({
      success: true,
      data: mockPixData
    })

  } catch (error) {
    console.error('Erro ao criar cobrança PIX:', error)
    return NextResponse.json(
      { success: false, error: 'Erro ao processar pagamento PIX' },
      { status: 500 }
    )
  }
}

// GET - Verificar status do pagamento (versão de teste)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return NextResponse.json(
        { success: false, error: 'ID da transação é obrigatório' },
        { status: 400 }
      )
    }

    console.log('Verificando status PIX:', transactionId)

    // Por enquanto, retornar dados mock
    const mockStatus = {
      transactionId,
      status: 'PENDING',
      amount: 50,
      confirmedAt: null,
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    }
    
    return NextResponse.json({
      success: true,
      data: mockStatus
    })

  } catch (error) {
    console.error('Erro ao verificar status PIX:', error)
    return NextResponse.json(
      { success: false, error: 'Erro ao verificar status' },
      { status: 500 }
    )
  }
} 