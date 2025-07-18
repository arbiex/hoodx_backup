import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Configuração do XGATE Global
const XGATE_CONFIG = {
  baseUrl: process.env.XGATE_API_BASE_URL || 'https://api.xgateglobal.com',
  email: process.env.XGATE_EMAIL || '',
  password: process.env.XGATE_PASSWORD || '',
  // clientId: process.env.XGATE_CLIENT_ID || '', // Não necessário para receber PIX
  webhookUrl: process.env.XGATE_WEBHOOK_URL || `${process.env.NEXT_FLY_APP_URL}/api/xgate-webhook`
}

// Cliente Supabase para operações no banco
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Cache para token JWT (em produção, usar Redis ou similar)
let tokenCache: { token: string; expiresAt: number } | null = null

// Função para autenticação no XGATE
async function authenticateXGate(): Promise<string> {
  try {
    // Verificar se token existe e não expirou
    if (tokenCache && Date.now() < tokenCache.expiresAt) {
      return tokenCache.token
    }

    console.log('🔐 Autenticando no XGATE Global...')
    
    const response = await fetch(`${XGATE_CONFIG.baseUrl}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: XGATE_CONFIG.email,
        password: XGATE_CONFIG.password
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`XGATE Auth Error: ${response.status} - ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    const token = data.token || data.access_token
    
    if (!token) {
      throw new Error('Token não encontrado na resposta do XGATE')
    }

    // Cache token por 50 minutos (assumindo 1 hora de expiração)
    tokenCache = {
      token,
      expiresAt: Date.now() + (50 * 60 * 1000)
    }

    console.log('✅ Autenticação XGATE realizada com sucesso')
    return token

  } catch (error) {
    console.error('❌ Erro na autenticação XGATE:', error)
    throw error
  }
}

// Função para criar depósito PIX no XGATE
async function createXGatePixDeposit(amount: number, userId: string, description: string) {
  try {
    const token = await authenticateXGate()
    
    const payload = {
      amount: amount,
      currency: 'BRL',
      external_id: `PIX_${userId}_${Date.now()}`,
      description: description,
      webhook_url: XGATE_CONFIG.webhookUrl,
      payment_method: 'PIX'
    }

    console.log('🚀 Criando depósito PIX no XGATE:', payload)

    const response = await fetch(`${XGATE_CONFIG.baseUrl}/deposits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`XGATE Deposit Error: ${response.status} - ${JSON.stringify(error)}`)
    }

    const responseData = await response.json()

    return {
      success: true,
      transactionId: responseData.id || responseData.transaction_id,
      pixQrCode: responseData.qr_code || responseData.pix_qr_code,
      pixCopyPaste: responseData.pix_code || responseData.pix_copy_paste,
      expiresAt: responseData.expires_at || new Date(Date.now() + 3600000).toISOString(), // 1 hora
      status: responseData.status || 'PENDING'
    }

  } catch (error) {
    console.error('❌ Erro ao criar depósito PIX:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }
  }
}

// Função para verificar status de depósito no XGATE
async function checkXGateDepositStatus(transactionId: string) {
  try {
    const token = await authenticateXGate()
    
    const response = await fetch(`${XGATE_CONFIG.baseUrl}/deposits/${transactionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`XGATE Status Error: ${response.status} - ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    
    return {
      success: true,
      status: data.status,
      amount: data.amount,
      confirmedAt: data.confirmed_at,
      expiresAt: data.expires_at,
      transactionId: data.id || data.transaction_id
    }

  } catch (error) {
    console.error('❌ Erro ao verificar status no XGATE:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }
  }
}

// POST - Criar nova cobrança PIX
export async function POST(request: NextRequest) {
  try {
    console.log('🎯 Iniciando criação de cobrança PIX via XGATE')
    
    const { amount, userId, user, email, description } = await request.json()

    // Validações
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
    }

    // Aceitar userId, user.id, user.email ou email
    let userIdentifier = userId || user?.id || user?.email || email
    
    if (!userIdentifier) {
      return NextResponse.json({ error: 'Usuário não informado (envie userId, user.id, user.email ou email)' }, { status: 400 })
    }

    // Se temos email, usar ele; senão usar o ID
    let userEmail = user?.email || email
    let finalIdentifier = userEmail || userIdentifier

    // Verificar se ambiente está configurado
    if (!XGATE_CONFIG.email || !XGATE_CONFIG.password) {
      console.error('❌ Configuração do XGATE incompleta')
      return NextResponse.json({ error: 'Configuração do XGATE incompleta' }, { status: 500 })
    }

    // Gerar ID único para a transação (usando email se disponível)
    const userHash = finalIdentifier.includes('@') 
      ? finalIdentifier.split('@')[0] 
      : finalIdentifier
    const externalId = `PIX_${userHash}_${Date.now()}`

    console.log('👤 Usuário identificado:', finalIdentifier)
    console.log('🔗 External ID gerado:', externalId)

    // Criar depósito no XGATE
    const xgateResult = await createXGatePixDeposit(
      amount,
      userIdentifier,
      description || `Compra de créditos - R$ ${amount}`
    )

    if (!xgateResult.success) {
      throw new Error('Falha ao criar depósito no XGATE')
    }

    // Salvar transação no banco
    const { data: transaction, error: dbError } = await supabase
      .from('pix_transactions')
      .insert({
        user_id: userIdentifier,
        transaction_id: xgateResult.transactionId,
        amount: amount,
        status: 'PENDING',
        external_id: externalId,
        description: description || `Compra de créditos - R$ ${amount}`,
        xgate_response: xgateResult,
        expires_at: xgateResult.expiresAt
      })
      .select()
      .single()

    if (dbError) {
      console.error('❌ Erro ao salvar no banco:', dbError)
      throw new Error('Erro ao salvar transação no banco')
    }

    console.log('✅ Cobrança PIX criada com sucesso via XGATE')

    return NextResponse.json({
      success: true,
      transactionId: xgateResult.transactionId,
      externalId: externalId,
      userId: userIdentifier,
      amount: amount,
      pixQrCode: xgateResult.pixQrCode,
      pixCopyPaste: xgateResult.pixCopyPaste,
      expiresAt: xgateResult.expiresAt,
      status: 'PENDING',
      provider: 'XGATE'
    })

  } catch (error) {
    console.error('❌ Erro na criação da cobrança PIX:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro interno do servidor',
        provider: 'XGATE'
      }, 
      { status: 500 }
    )
  }
}

// GET - Verificar status de pagamento
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId é obrigatório' }, { status: 400 })
    }

    console.log('🔍 Verificando status do pagamento no XGATE:', transactionId)

    // Verificar status no XGATE
    const xgateStatus = await checkXGateDepositStatus(transactionId)

    if (!xgateStatus.success) {
      throw new Error('Falha ao verificar status no XGATE')
    }

    // Atualizar status no banco
    const { data: transaction, error: updateError } = await supabase
      .from('pix_transactions')
      .update({
        status: xgateStatus.status,
        updated_at: new Date().toISOString(),
        xgate_status: xgateStatus
      })
      .eq('transaction_id', transactionId)
      .select()
      .single()

    if (updateError) {
      console.error('❌ Erro ao atualizar status no banco:', updateError)
    }

    return NextResponse.json({
      success: true,
      status: xgateStatus.status,
      amount: xgateStatus.amount,
      confirmedAt: xgateStatus.confirmedAt,
      expiresAt: xgateStatus.expiresAt,
      provider: 'XGATE'
    })

  } catch (error) {
    console.error('❌ Erro na verificação de status:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro interno do servidor',
        provider: 'XGATE'
      }, 
      { status: 500 }
    )
  }
} 