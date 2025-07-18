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

// Log de webhook para debugging
async function logWebhookEvent(event: any, status: string, error?: string) {
  try {
    const supabase = getSupabaseClient()
    await supabase
      .from('webhook_logs')
      .insert({
        provider: 'XGATE',
        event_type: event.type || 'unknown',
        event_data: event,
        status: status,
        error_message: error,
        created_at: new Date().toISOString()
      })
  } catch (logError) {
    console.error('❌ Erro ao salvar log do webhook:', logError)
  }
}

// Função para processar confirmação de pagamento
async function processPaymentConfirmation(transactionId: string, webhookData: any) {
  try {
    console.log('🔄 Processando confirmação de pagamento:', transactionId)
    
    const supabase = getSupabaseClient()

    // Buscar transação no banco
    const { data: transaction, error: findError } = await supabase
      .from('pix_transactions')
      .select('*')
      .eq('transaction_id', transactionId)
      .single()

    if (findError || !transaction) {
      throw new Error(`Transação não encontrada: ${transactionId}`)
    }

    // Verificar se já foi processada
    if (transaction.status === 'COMPLETED') {
      console.log('⚠️ Transação já foi processada:', transactionId)
      return { success: true, message: 'Transação já processada' }
    }

    // Atualizar status da transação
    const { error: updateError } = await supabase
      .from('pix_transactions')
      .update({
        status: 'COMPLETED',
        confirmed_at: new Date().toISOString(),
        xgate_webhook_data: webhookData,
        updated_at: new Date().toISOString()
      })
      .eq('transaction_id', transactionId)

    if (updateError) {
      throw new Error(`Erro ao atualizar transação: ${updateError.message}`)
    }

    // Adicionar créditos ao usuário
    const { data: creditResult, error: creditError } = await supabase
      .rpc('add_credits_to_user', {
        p_user_id: transaction.user_id,
        p_amount: transaction.amount,
        p_transaction_type: 'purchase',
        p_transaction_id: transactionId,
        p_description: `Compra via PIX XGATE - R$ ${transaction.amount}`
      })

    if (creditError) {
      throw new Error(`Erro ao adicionar créditos: ${creditError.message}`)
    }

    console.log('✅ Pagamento processado com sucesso:', {
      transactionId,
      userId: transaction.user_id,
      amount: transaction.amount,
      credits: creditResult
    })

    return { 
      success: true, 
      message: 'Pagamento processado com sucesso',
      creditsAdded: creditResult
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
            .from('pix_transactions')
            .update({
              status: 'FAILED',
              xgate_webhook_data: webhookData,
              updated_at: new Date().toISOString()
            })
            .eq('transaction_id', transactionId)
        }

        await logWebhookEvent(webhookData, 'FAILED', 'Pagamento falhou')
        break

      case 'deposit.expired':
      case 'payment.expired':
      case 'pix.expired':
        // Atualizar status para expirado
        {
          const supabase = getSupabaseClient()
          await supabase
            .from('pix_transactions')
            .update({
              status: 'EXPIRED',
              xgate_webhook_data: webhookData,
              updated_at: new Date().toISOString()
            })
            .eq('transaction_id', transactionId)
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