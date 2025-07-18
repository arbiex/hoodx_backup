import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Função para obter cliente Supabase de forma segura
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Variáveis de ambiente do Supabase não configuradas')
  }

  return createClient(supabaseUrl, supabaseKey)
}

// Configuração do XGATE Global
const XGATE_CONFIG = {
  baseUrl: process.env.XGATE_API_BASE_URL || 'https://api.xgateglobal.com',
  email: process.env.XGATE_EMAIL || '',
  password: process.env.XGATE_PASSWORD || '',
  webhookUrl: process.env.XGATE_WEBHOOK_URL || `${process.env.NEXT_FLY_APP_URL}/api/xgate-webhook`
}

// Cache para token JWT (em produção, usar Redis ou similar)
let tokenCache: { token: string; expiresAt: number } | null = null

// Função para autenticação no XGATE
async function authenticateXGate(): Promise<string> {
  try {
    // Verificar se token existe e não expirou
    if (tokenCache && Date.now() < tokenCache.expiresAt) {
      console.log('🔄 Usando token cached')
      return tokenCache.token
    }

    console.log('🔐 Autenticando no XGATE Global...')
    console.log('🌐 URL:', `${XGATE_CONFIG.baseUrl}/auth/token`)
    console.log('📧 Email:', XGATE_CONFIG.email)
    console.log('🔑 Password length:', XGATE_CONFIG.password?.length || 0)
    
    const payload = {
      email: XGATE_CONFIG.email,
      password: XGATE_CONFIG.password
    }
    
    console.log('📦 Auth payload:', payload)
    
    const response = await fetch(`${XGATE_CONFIG.baseUrl}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    console.log('📊 Auth response status:', response.status)
    console.log('📋 Auth response headers:', response.headers)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`XGATE Auth Error: ${response.status} - ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    const token = data.token
    
    if (!token) {
      console.error('❌ Token não encontrado na resposta:', data)
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

// Função para tentar múltiplos endpoints do XGATE
async function tryMultipleEndpoints(token: string, payload: any) {
  const endpoints = [
    '/payments',
    '/transactions', 
    '/deposits',
    '/pix/create',
    '/payment/create',
    '/create-payment'
  ]

  console.log('🔍 Testando múltiplos endpoints...')

  for (const endpoint of endpoints) {
    try {
      console.log(`🎯 Tentando endpoint: ${endpoint}`)
      
      const response = await fetch(`${XGATE_CONFIG.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      console.log(`📊 Status ${endpoint}: ${response.status}`)

      if (response.ok) {
        const data = await response.json()
        console.log(`✅ Sucesso no endpoint ${endpoint}:`, data)
        return {
          success: true,
          endpoint,
          data
        }
      } else {
        const errorText = await response.text()
        console.log(`❌ Erro ${endpoint} (${response.status}):`, errorText)
      }

    } catch (error) {
      console.log(`❌ Erro ao tentar ${endpoint}:`, error)
    }
  }

  return {
    success: false,
    error: 'Nenhum endpoint funcionou'
  }
}

// Função para criar depósito PIX no XGATE (seguindo documentação oficial)
async function createXGatePixDeposit(amount: number, userId: string, description: string) {
  try {
    const token = await authenticateXGate()
    
    console.log('🚀 Criando depósito PIX no XGATE (seguindo 4 passos da documentação oficial)')
    
    // PASSO 1: Login - já feito pela função authenticateXGate()
    console.log('✅ PASSO 1: Login realizado')
    
    // PASSO 2: Criar cliente (obrigatório!)
    console.log('👤 PASSO 2: Criando cliente...')
    const customerPayload = {
      name: `Usuario_${userId.slice(0, 8)}`, // Nome baseado no userId
      notValidationDuplicated: true // Para permitir clientes duplicados
    }
    
    console.log('📦 Payload do cliente:', customerPayload)
    
    const customerResponse = await fetch(`${XGATE_CONFIG.baseUrl}/customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(customerPayload)
    })
    
    console.log(`📊 Status criação cliente: ${customerResponse.status}`)
    
    let customerId = userId // fallback para o userId original
    
    if (customerResponse.ok) {
      const customerData = await customerResponse.json()
      console.log('✅ Cliente criado:', customerData)
      customerId = customerData.customer?._id || customerData.customer?.id || customerData._id || userId
    } else {
      const errorText = await customerResponse.text()
      console.log('⚠️ Cliente pode já existir ou erro na criação:', errorText)
      // Se o cliente já existe, continuamos com o userId original
      console.log('➡️ Continuando com userId original como customerId')
    }
    
    console.log('🆔 CustomerId final:', customerId)
    
    // PASSO 3: Buscar currencies disponíveis
    console.log('💱 PASSO 3: Buscando currencies disponíveis...')
    const currenciesResponse = await fetch(`${XGATE_CONFIG.baseUrl}/deposit/company/currencies`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    })
    
    if (!currenciesResponse.ok) {
      const error = await currenciesResponse.text()
      console.error('❌ Erro ao buscar currencies:', error)
      throw new Error(`Erro ao buscar currencies: ${currenciesResponse.status}`)
    }
    
    const currencies = await currenciesResponse.json()
    console.log('✅ Currencies disponíveis:', currencies)
    
    // Encontrar BRL nas currencies (formato pode variar)
    let brlCurrency = currencies.find((curr: any) => 
      curr.name === 'BRL' || 
      curr.symbol === 'BRL' || 
      curr.type === 'PIX' ||
      curr.name?.includes('Real') ||
      curr.name?.includes('BRL')
    )
    
    // Se não encontrou, usar o primeiro
    if (!brlCurrency && currencies.length > 0) {
      console.log('⚠️ BRL não encontrado, usando primeira currency:', currencies[0])
      brlCurrency = currencies[0]
    } else if (!brlCurrency) {
      throw new Error('Nenhuma currency encontrada')
    }
    
    console.log('✅ Currency selecionada:', brlCurrency)
    
    // PASSO 4: Criar depósito PIX
    console.log('💳 PASSO 4: Criando depósito PIX...')
    const depositPayload = {
      amount: amount,
      customerId: customerId,
      currency: brlCurrency
    }
    
    console.log('📦 Payload do depósito:', depositPayload)
    
    const depositResponse = await fetch(`${XGATE_CONFIG.baseUrl}/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(depositPayload)
    })
    
    console.log(`📊 Status da criação: ${depositResponse.status}`)
    
    if (!depositResponse.ok) {
      const error = await depositResponse.text()
      console.error('❌ Erro ao criar depósito:', error)
      throw new Error(`Erro ao criar depósito: ${depositResponse.status} - ${error}`)
    }
    
    const depositData = await depositResponse.json()
    console.log('✅ Depósito criado com sucesso:', depositData)
    
    // A resposta deve conter: { "message": "Pix Gerado com Sucesso", "data": { "status": "WAITING_PAYMENT", "code": "0002012692...", "id": "675d979...", "customerId": "9c235..." } }
    return {
      success: true,
      transactionId: depositData.data?.id || depositData.id || depositData._id,
      pixQrCode: depositData.data?.code || depositData.qr_code || depositData.qrCode,
      pixCopyPaste: depositData.data?.code || depositData.pix_code || depositData.pixCode, // O "code" é o PIX copia e cola
      expiresAt: depositData.data?.expires_at || depositData.expiresAt,
      amount: amount,
      currency: brlCurrency,
      status: depositData.data?.status || 'WAITING_PAYMENT',
      customerId: customerId,
      data: depositData
    }

  } catch (error) {
    console.error('❌ Erro ao criar depósito PIX:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }
  }
}

// POST - Criar cobrança PIX
export async function POST(request: NextRequest) {
  try {
    const { amount, userId, description } = await request.json()

    console.log('🎯 Iniciando criação de cobrança PIX via XGATE')
    console.log('👤 Usuário identificado:', userId)
    console.log('💰 Valor:', amount)

    if (!amount || !userId) {
      return NextResponse.json({ 
        error: 'amount e userId são obrigatórios' 
      }, { status: 400 })
    }

    // Validar valores
    if (amount < 5 || amount > 1000) {
      return NextResponse.json({ 
        error: 'Valor deve estar entre R$ 5,00 e R$ 1.000,00' 
      }, { status: 400 })
    }

    // 🔒 VERIFICAÇÃO ANTI-DUPLICAÇÃO: Verificar se já existe transação pendente recente
    const supabase = getSupabaseClient()
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    
    console.log('🔍 Verificando transações pendentes recentes...')
    const { data: recentTransactions, error: checkError } = await supabase
      .from('fxa_token_transactions')
      .select('id, payment_reference, amount, status, created_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(3)

    if (checkError) {
      console.error('⚠️ Erro ao verificar transações pendentes:', checkError)
      // Continuar mesmo com erro na verificação
    }

    // Verificar se existe transação pendente idêntica (mesmo valor ±R$0.01)
    if (recentTransactions && recentTransactions.length > 0) {
      const duplicateTransaction = recentTransactions.find(tx => 
        Math.abs(tx.amount - amount) <= 0.01 // Margem de R$0,01
      )
      
      if (duplicateTransaction) {
        console.log('🚫 BLOQUEANDO: Transação duplicada detectada!', {
          existing: duplicateTransaction,
          requested: { amount, userId }
        })
        
        return NextResponse.json({
          success: false,
          error: 'TRANSAÇÃO_DUPLICADA',
          message: 'Já existe uma transação pendente com este valor',
          existingTransaction: {
            id: duplicateTransaction.payment_reference,
            amount: duplicateTransaction.amount,
            status: duplicateTransaction.status,
            createdAt: duplicateTransaction.created_at
          }
        }, { status: 409 }) // 409 Conflict
      }
      
      // Se há muitas transações pendentes recentes, também bloquear
      if (recentTransactions.length >= 3) {
        console.log('🚫 BLOQUEANDO: Muitas transações pendentes recentes!', {
          count: recentTransactions.length,
          userId
        })
        
        return NextResponse.json({
          success: false,
          error: 'MUITAS_TRANSAÇÕES_PENDENTES',
          message: 'Você tem muitas transações pendentes. Aguarde ou cancele uma transação antes de criar outra.'
        }, { status: 429 }) // 429 Too Many Requests
      }
    }

    console.log('✅ Verificação anti-duplicação aprovada - Prosseguindo...')

    const finalDescription = description || `Compra de créditos - R$ ${amount.toFixed(2)}`

    // Verificar se ambiente está configurado
    if (!XGATE_CONFIG.email || !XGATE_CONFIG.password) {
      console.error('❌ Configuração do XGATE incompleta')
      return NextResponse.json({ error: 'Configuração do XGATE incompleta' }, { status: 500 })
    }

    // Criar depósito no XGATE
    const xgateResult = await createXGatePixDeposit(amount, userId, finalDescription)

    if (!xgateResult.success) {
      console.error('❌ Falha no XGATE:', xgateResult.error)
      return NextResponse.json({ 
        error: 'Falha ao criar depósito no XGATE: ' + xgateResult.error 
      }, { status: 500 })
    }

    // Salvar intent de pagamento (pending) para rastreamento
    const tokensEquivalent = Math.floor(amount * 25) // Converter BRL para tokens (R$ 1,00 = 25 tokens)
    
    const { data: transaction, error: dbError } = await supabase
      .from('fxa_token_transactions')
      .insert({
        user_id: userId,
        transaction_type: 'credit',
        amount: tokensEquivalent, // Tokens que serão adicionados
        amount_brl: amount, // Valor pago em BRL  
        payment_reference: xgateResult.transactionId,
        payment_method: 'PIX',
        status: 'pending',
        description: finalDescription,
        metadata: {
          xgate_transaction_id: xgateResult.transactionId,
          created_via: 'api_payment_pix'
        }
      })
      .select()
      .single()

    if (dbError) {
      console.error('❌ Erro ao salvar transação no banco:', dbError)
      // Continuar mesmo com erro no banco, pois cobrança foi criada
    }

    console.log('✅ Cobrança PIX criada com sucesso')
    console.log('🔗 Endpoint usado: /deposit')
    
    return NextResponse.json({
      success: true,
      transactionId: xgateResult.transactionId,
      pixQrCode: xgateResult.pixQrCode,
      pixCopyPaste: xgateResult.pixCopyPaste,
      expiresAt: xgateResult.expiresAt,
      amount: amount,
      description: finalDescription,
      dbTransactionId: transaction?.id,
      provider: 'XGATE',
      status: 'pending',
      externalId: xgateResult.transactionId,
      endpointUsed: '/deposit'
    })

  } catch (error) {
    console.error('❌ Erro na criação da cobrança PIX:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Erro interno do servidor'
    }, { status: 500 })
  }
}

// GET - Verificar status do pagamento
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')

    if (!transactionId) {
      return NextResponse.json({ 
        error: 'transactionId é obrigatório' 
      }, { status: 400 })
    }

    console.log('🔍 Verificando status do pagamento XGATE:', transactionId)

    // 1. Verificar se já foi processado (buscar por payment_reference)
    const supabase = getSupabaseClient()
    const { data: existingTransaction, error: dbError } = await supabase
      .from('fxa_token_transactions')
      .select('*')
      .eq('payment_reference', transactionId)
      .single()

    if (dbError && dbError.code !== 'PGRST116') {
      console.error('❌ Erro ao consultar banco local:', dbError)
      return NextResponse.json({
        success: false,
        status: 'error',
        message: 'Erro ao consultar banco de dados'
      }, { status: 500 })
    }

    // Se já foi processado como completed, retornar success e parar verificações
    if (existingTransaction?.status === 'completed') {
      console.log('✅ Transação já processada como completed - Parando verificações')
      return NextResponse.json({
        success: true,
        status: 'completed',
        shouldStopChecking: true, // 🛑 Sinal para parar verificações
        transaction: existingTransaction,
        message: 'Pagamento confirmado e processado'
      })
    }

    // 2. Consultar XGATE para verificar status real do depósito
    try {
      const token = await authenticateXGate()
      console.log('🔍 Consultando status no XGATE para transação:', transactionId)

      // Consultar detalhes do depósito no XGATE
      const statusResponse = await fetch(`${XGATE_CONFIG.baseUrl}/deposit/${transactionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      console.log('📊 Status da consulta XGATE:', statusResponse.status)

      if (statusResponse.ok) {
        const depositData = await statusResponse.json()
        console.log('💳 Dados do depósito XGATE:', depositData)

        // Verificar se o status é PAID (confirmado) - pode estar em currency.status
        const paymentStatus = depositData.status || depositData.currency?.status
        if (paymentStatus === 'PAID' || paymentStatus === 'COMPLETED') {
          console.log('✅ Pagamento confirmado no XGATE! Processando...', { status: paymentStatus })

          // Se temos a transação local pendente, processá-la
          if (existingTransaction && existingTransaction.status !== 'completed') {
            try {
              // Atualizar apenas o status para completed
              const { error: updateError } = await supabase
                .from('fxa_token_transactions')
                .update({ 
                  status: 'completed',
                  updated_at: new Date().toISOString()
                })
                .eq('payment_reference', transactionId)

              if (updateError) {
                console.error('❌ Erro ao atualizar transação:', updateError)
                throw new Error(`Erro ao atualizar transação: ${updateError.message}`)
              }

              console.log(`✅ Transação processada: ${existingTransaction.amount} tokens FXA para usuário ${existingTransaction.user_id}`)

              return NextResponse.json({
                success: true,
                status: 'completed',
                shouldStopChecking: true, // 🛑 Parar verificações após processamento
                transaction: {
                  ...existingTransaction,
                  status: 'completed'
                },
                tokensAdded: existingTransaction.amount,
                amountBrl: existingTransaction.amount_brl,
                xgateStatus: paymentStatus,
                message: 'Pagamento confirmado e tokens adicionados!'
              })

            } catch (processError) {
              console.error('❌ Erro ao processar pagamento confirmado:', processError)
              return NextResponse.json({
                success: false,
                status: 'processing_error',
                message: 'Pagamento confirmado mas houve erro no processamento'
              }, { status: 500 })
            }
          }

          // Se não temos transação local, retornar que foi confirmado mas precisa ser processado
          return NextResponse.json({
            success: true,
            status: 'confirmed_pending_processing',
            xgateStatus: paymentStatus,
            message: 'Pagamento confirmado no XGATE, processando...'
          })

        } else {
          // Status ainda é WAITING_PAYMENT ou outro
          const paymentStatus = depositData.status || depositData.currency?.status
          console.log('⏳ Pagamento ainda pendente no XGATE:', paymentStatus)
          
          return NextResponse.json({
            success: true,
            status: 'pending',
            xgateStatus: paymentStatus,
            transaction: existingTransaction,
            message: 'Pagamento ainda pendente'
          })
        }

      } else {
        console.error('❌ Erro ao consultar XGATE:', statusResponse.status)
        
        // Se erro na consulta XGATE, retornar status local
        return NextResponse.json({
          success: true,
          status: existingTransaction?.status || 'unknown',
          transaction: existingTransaction,
          message: 'Erro ao consultar status no XGATE, retornando status local'
        })
      }

    } catch (xgateError) {
      console.error('❌ Erro ao consultar XGATE:', xgateError)
      
      // Em caso de erro na consulta XGATE, retornar status local
      return NextResponse.json({
        success: true,
        status: existingTransaction?.status || 'unknown',
        transaction: existingTransaction,
        message: 'Erro ao consultar XGATE, retornando status local'
      })
    }

  } catch (error) {
    console.error('❌ Erro geral ao verificar status:', error)
    return NextResponse.json({
      error: 'Erro interno do servidor'
    }, { status: 500 })
  }
} 