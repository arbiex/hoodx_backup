import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Função para obter cliente Supabase de forma segura
function getSupabaseClient() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Variáveis de ambiente do Supabase não configuradas')
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// Log de webhook simplificado (apenas console)
async function logWebhookEvent(event: any, status: string, error?: string) {
  // Log silencioso apenas no console
  console.log(`📋 Webhook XGATE: ${status}`, {
    type: event.type || 'unknown',
    status,
    error: error || null,
    timestamp: new Date().toISOString()
  })
}

// Função para processar comissões dos agentes
async function processAgentCommissions(supabase: any, userId: string, amountBrl: number) {
  try {
    console.log(`💰 Processando comissões para compra de R$ ${amountBrl.toFixed(2)} do usuário ${userId}`)

    // 1. Verificar se o usuário tem um sponsor
    const { data: referral, error: referralError } = await supabase
      .from('user_referrals')
      .select('sponsor_id, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()

    if (referralError || !referral) {
      console.log(`ℹ️ Usuário ${userId} não possui sponsor ativo - sem comissões a processar`)
      return
    }

    const sponsorId = referral.sponsor_id
    console.log(`👥 Encontrado sponsor: ${sponsorId}`)

    // 2. Buscar taxa de comissão do agente/sponsor
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('commission_rate, is_active')
      .eq('user_id', sponsorId)
      .eq('is_active', true)
      .single()

    if (agentError || !agent) {
      console.log(`⚠️ Sponsor ${sponsorId} não é um agente ativo - sem comissões a processar`)
      return
    }

    const commissionRate = Number(agent.commission_rate)
    console.log(`💼 Taxa de comissão do agente: ${commissionRate}%`)

    // 3. Calcular comissão (sobre o valor em R$)
    const commissionAmount = (amountBrl * commissionRate) / 100
    
    if (commissionAmount <= 0) {
      console.log(`⚠️ Valor de comissão inválido: R$ ${commissionAmount.toFixed(2)}`)
      return
    }

    console.log(`🧮 Calculando: R$ ${amountBrl.toFixed(2)} × ${commissionRate}% = R$ ${commissionAmount.toFixed(2)}`)

    // 4. Adicionar comissão para o sponsor usando a função add_credits
    const { error: commissionError } = await supabase.rpc('add_credits', {
      p_user_id: sponsorId,
      p_amount: commissionAmount,
      p_description: `Comissão ${commissionRate}% - Indicado: ${userId.slice(0, 8)}`,
      p_payment_reference: null,
      p_amount_brl: commissionAmount,
      p_metadata: {
        commission_type: 'credit_purchase',
        commission_rate: commissionRate,
        original_purchase_amount_brl: amountBrl,
        referred_user_id: userId,
        processed_at: new Date().toISOString()
      }
    })

    if (commissionError) {
      console.error(`❌ Erro ao adicionar comissão para ${sponsorId}:`, commissionError)
      throw new Error(`Erro ao processar comissão: ${commissionError.message}`)
    }

    console.log(`✅ Comissão processada: R$ ${commissionAmount.toFixed(2)} adicionados para agente ${sponsorId}`)

  } catch (error) {
    console.error('❌ Erro ao processar comissões:', error)
    // Não quebrar o fluxo principal por erro nas comissões
  }
}

// Função para processar confirmação de pagamento
async function processPaymentConfirmation(transactionId: string, webhookData: any) {
  try {
    console.log('💳 Processando confirmação de pagamento:', transactionId)
    
    const supabase = getSupabaseClient()

    // Tentar buscar primeiro em fxa_token_transactions
    let transaction = null
    let transactionType = 'fxa_tokens'
    
    const { data: fxaTransaction, error: fxaError } = await supabase
      .from('fxa_token_transactions')
      .select('*')
      .eq('payment_reference', transactionId)
      .single()

    if (fxaTransaction) {
      transaction = fxaTransaction
      transactionType = 'fxa_tokens'
    } else {
      // Se não encontrou em fxa_token_transactions, buscar em credit_transactions
      const { data: creditTransaction, error: creditError } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('payment_reference', transactionId)
        .single()
        
      if (creditTransaction) {
        transaction = creditTransaction
        transactionType = 'credits'
      }
    }

    if (!transaction) {
      throw new Error(`Transação não encontrada: ${transactionId}`)
    }

    // Verificar se já foi processada
    if (transaction.status === 'completed') {
      console.log('⚠️ Transação já foi processada:', transactionId)
      return { success: true, message: 'Transação já processada' }
    }

    // Atualizar transação como completed
    const tableName = transactionType === 'credits' ? 'credit_transactions' : 'fxa_token_transactions'
    
    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
        metadata: {
          ...transaction.metadata,
          webhook_data: webhookData,
          processed_at: new Date().toISOString()
        }
      })
      .eq('payment_reference', transactionId)

    if (updateError) {
      throw new Error(`Erro ao atualizar transação: ${updateError.message}`)
    }

    let tokensToAdd = 0

    if (transactionType === 'fxa_tokens') {
      // ✨ PROCESSAR TOKENS FXA (R$ 0.25 = 1 TOKEN)
      // 🚫 NÃO USAR add_fxa_tokens aqui pois ele cria nova transação
      // A transação já foi criada pela API e apenas atualizada acima
      
      tokensToAdd = Math.floor(transaction.amount_brl / 0.25)
      console.log(`✅ ${tokensToAdd} tokens FXA confirmados para usuário ${transaction.user_id} (transação ${transactionId})`)
    } else {
      // ✨ PROCESSAR CRÉDITOS (R$ 1.00 = 1.00 CRÉDITO) + COMISSÕES
      // 🚫 NÃO USAR add_credits aqui pois ele cria nova transação
      // A transação já foi criada pela API e apenas atualizada acima
      
      console.log(`✅ ${transaction.amount} créditos confirmados para usuário ${transaction.user_id} (transação ${transactionId})`)

      // 🎯 PROCESSAR COMISSÕES PARA AGENTES (só para créditos)
      await processAgentCommissions(supabase, transaction.user_id, transaction.amount_brl)
    }

    console.log('✅ Pagamento processado com sucesso:', {
      transactionId,
      userId: transaction.user_id,
      amount: transaction.amount,
      transactionType: transactionType,
      tokensAdded: tokensToAdd
    })

    return { 
      success: true, 
      message: 'Pagamento processado com sucesso',
      transactionType: transactionType,
      creditsAdded: transactionType === 'credits' ? transaction.amount : 0,
      tokensAdded: tokensToAdd || 0
    }

  } catch (error) {
    console.error('❌ Erro ao processar pagamento:', error)
    throw error
  }
}

// GET - Teste do webhook
export async function GET() {
  const baseUrl = process.env.NEXT_FLY_APP_URL || 'https://hoodx.fly.dev'
  
  return NextResponse.json({ 
    message: '🚀 Webhook XGATE - Funcionando!',
    timestamp: new Date().toISOString(),
    url: `${baseUrl}/api/xgate-webhook`
  })
}

// POST - Processar webhook do XGATE
export async function POST(request: NextRequest) {
  try {
    console.log('📞 Webhook XGATE recebido')
    
    const webhookData = await request.json()
    console.log('📋 Dados do webhook:', JSON.stringify(webhookData, null, 2))

    // Log do evento recebido
    await logWebhookEvent(webhookData, 'received')

    // Verificar se é uma notificação de pagamento
    if (!webhookData.transactionId && !webhookData.id) {
      console.log('⚠️ Webhook sem transactionId ou id, ignorando')
      return NextResponse.json({ 
        success: true, 
        message: 'Webhook recebido mas sem transactionId' 
      })
    }

    // Usar o ID correto da transação
    const transactionId = webhookData.transactionId || webhookData.id

    // Verificar se é uma confirmação de pagamento
    const isPaymentConfirmed = 
      webhookData.status === 'PAID' || 
      webhookData.status === 'COMPLETED' ||
      webhookData.status === 'SUCCESS' ||
      webhookData.event === 'deposit.confirmed' ||
      webhookData.type === 'payment.confirmed'

    console.log(`💳 Transação ${transactionId}, Status: ${webhookData.status}, Confirmado: ${isPaymentConfirmed}`)

    if (isPaymentConfirmed) {
      console.log('✅ Processando confirmação de pagamento via webhook')
      
      try {
        const result = await processPaymentConfirmation(transactionId, webhookData)
        
        await logWebhookEvent(webhookData, 'processed_success', undefined)
        
        return NextResponse.json({
          success: true,
          message: 'Pagamento processado com sucesso',
          result
        })
        
      } catch (error) {
        console.error('❌ Erro ao processar confirmação:', error)
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
        await logWebhookEvent(webhookData, 'processed_error', errorMessage)
        
        return NextResponse.json({
          success: false,
          message: 'Erro ao processar pagamento',
          error: errorMessage
        }, { status: 500 })
      }
    } else {
      console.log(`ℹ️ Status ${webhookData.status} não requer processamento`)
      await logWebhookEvent(webhookData, 'ignored_status', undefined)
      
      return NextResponse.json({
        success: true,
        message: 'Webhook recebido, status não requer processamento'
      })
    }

  } catch (error) {
    console.error('❌ Erro geral no webhook XGATE:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    await logWebhookEvent({ error: errorMessage }, 'error', errorMessage)
    
    return NextResponse.json({
      success: false,
      message: 'Erro interno no webhook',
      error: errorMessage
    }, { status: 500 })
  }
}

// OPTIONS - CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
} 