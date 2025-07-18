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