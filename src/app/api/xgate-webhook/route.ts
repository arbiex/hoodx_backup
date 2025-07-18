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

// Função para processar confirmação de pagamento
async function processPaymentConfirmation(transactionId: string, webhookData: any) {
  try {
    console.log('💳 Processando confirmação de pagamento:', transactionId)
    
    const supabase = getSupabaseClient()

    // Buscar transação no banco usando payment_reference
    const { data: transaction, error: findError } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('payment_reference', transactionId)
      .single()

    if (findError || !transaction) {
      throw new Error(`Transação não encontrada: ${transactionId}`)
    }

    // Verificar se já foi processada
    if (transaction.status === 'completed') {
      console.log('⚠️ Transação já foi processada:', transactionId)
      return { success: true, message: 'Transação já processada' }
    }

    // Buscar saldo atual do usuário
    const { data: userCredit } = await supabase
      .from('user_credits')
      .select('available_balance, total_earned')
      .eq('user_id', transaction.user_id)
      .single()

    const currentBalance = userCredit?.available_balance || 0
    const newBalance = currentBalance + transaction.amount

    // Atualizar transação como completed
    const { error: updateError } = await supabase
      .from('credit_transactions')
      .update({
        status: 'completed',
        balance_after: newBalance,
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

    // Atualizar saldo do usuário
    const { error: creditError } = await supabase
      .from('user_credits')
      .upsert({
        user_id: transaction.user_id,
        available_balance: newBalance,
        total_earned: (userCredit?.total_earned || 0) + transaction.amount,
        last_transaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (creditError) {
      throw new Error(`Erro ao adicionar créditos: ${creditError.message}`)
    }

    // ✨ ADICIONAR TOKENS FXA (R$ 0.25 = 1 TOKEN)
    const tokensToAdd = Math.floor(transaction.amount / 0.25)
    if (tokensToAdd > 0) {
      const { error: tokenError } = await supabase.rpc('add_fxa_tokens', {
        p_user_id: transaction.user_id,
        p_amount: tokensToAdd,
        p_description: `Compra via PIX - R$ ${transaction.amount.toFixed(2)}`,
        p_payment_reference: transactionId,
        p_metadata: {
          payment_amount_brl: transaction.amount,
          conversion_rate: 0.25,
          purchase_date: new Date().toISOString(),
          webhook_processed: true
        }
      })

      if (tokenError) {
        console.error('❌ Erro ao adicionar tokens FXA:', tokenError)
        // Não falhar o pagamento por causa dos tokens - apenas log
      } else {
        console.log(`✅ ${tokensToAdd} tokens FXA adicionados para usuário ${transaction.user_id}`)
      }
    }

    console.log('✅ Pagamento processado com sucesso:', {
      transactionId,
      userId: transaction.user_id,
      amount: transaction.amount,
      oldBalance: currentBalance,
      newBalance: newBalance,
      tokensAdded: tokensToAdd
    })

    return { 
      success: true, 
      message: 'Pagamento processado com sucesso',
      creditsAdded: transaction.amount,
      newBalance: newBalance,
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
    console.log('🚀 Webhook recebido do XGATE')
    
    // Ler o body
    const body = await request.text()
    let webhookData: any

    try {
      webhookData = JSON.parse(body)
    } catch (parseError) {
      console.error('❌ Erro ao parsear JSON:', parseError)
      await logWebhookEvent({ raw_body: body }, 'ERROR', 'JSON inválido')
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    console.log('📄 Dados recebidos:', webhookData)

    // Verificar se é teste do XGATE
    if (webhookData.test === true || webhookData.type === 'test') {
      console.log('🧪 Teste XGATE detectado - retornando OK')
      await logWebhookEvent(webhookData, 'TEST', 'Evento de teste')
      return NextResponse.json({ status: 'ok' }, { status: 200 })
    }

    // Processar diferentes tipos de eventos
    const eventType = webhookData.type || webhookData.event_type
    const transactionId = webhookData.transaction_id || webhookData.id
    const status = webhookData.status

    if (!transactionId) {
      await logWebhookEvent(webhookData, 'ERROR', 'transaction_id não encontrado')
      return NextResponse.json({ error: 'transaction_id não encontrado' }, { status: 400 })
    }

    // Log do evento
    await logWebhookEvent(webhookData, 'RECEIVED', undefined)

    // Processar baseado no tipo de evento
    switch (eventType) {
      case 'deposit.completed':
      case 'payment.completed':
      case 'pix.completed':
        if (status === 'COMPLETED' || status === 'CONFIRMED' || status === 'PAID') {
          const result = await processPaymentConfirmation(transactionId, webhookData)
          await logWebhookEvent(webhookData, 'PROCESSED', undefined)
          
          return NextResponse.json({ 
            status: 'ok', 
            message: 'Pagamento processado com sucesso',
            result: result
          }, { status: 200 })
        }
        break

      case 'deposit.failed':
      case 'payment.failed':
      case 'pix.failed':
        // Atualizar status para falha
        {
          const supabase = getSupabaseClient()
          await supabase
            .from('credit_transactions')
            .update({
              status: 'failed',
              updated_at: new Date().toISOString(),
              metadata: {
                webhook_data: webhookData,
                failed_at: new Date().toISOString()
              }
            })
            .eq('payment_reference', transactionId)
        }

        await logWebhookEvent(webhookData, 'FAILED', 'Pagamento falhou')
        break

      case 'deposit.expired':
      case 'payment.expired':
      case 'pix.expired':
        // Atualizar status para cancelado (expirado)
        {
          const supabase = getSupabaseClient()
          await supabase
            .from('credit_transactions')
            .update({
              status: 'cancelled',
              updated_at: new Date().toISOString(),
              metadata: {
                webhook_data: webhookData,
                expired_at: new Date().toISOString()
              }
            })
            .eq('payment_reference', transactionId)
        }

        await logWebhookEvent(webhookData, 'EXPIRED', 'Pagamento expirado')
        break

      default:
        console.log('⚠️ Tipo de evento não reconhecido:', eventType)
        await logWebhookEvent(webhookData, 'UNKNOWN', `Evento não reconhecido: ${eventType}`)
    }
    
    // Sempre retornar 200 para XGATE
    return NextResponse.json({ status: 'ok' }, { status: 200 })
    
  } catch (error) {
    console.error('❌ Erro no webhook:', error)
    
    // Log do erro
    await logWebhookEvent({ error: error instanceof Error ? error.message : 'Erro desconhecido' }, 'ERROR', error instanceof Error ? error.message : 'Erro desconhecido')
    
    // Sempre retornar 200 para evitar reenvio
    return NextResponse.json({ status: 'ok' }, { status: 200 })
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