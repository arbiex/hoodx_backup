import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configurar cliente Supabase
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Configurar apenas o signature secret
const SIGNATURE_SECRET = 'HRxzmqjkydI3bOwhlCf5QaeiYrcKPGA0EB8UTN6F';

const supabase = createClient(supabaseUrl, supabaseKey);

// Função para validar assinatura HMAC conforme documentação EzzeBank
async function validateSignature(req: Request, body: string): Promise<boolean> {
  const verifySignatureHeader = req.headers.get('verify-signature');
  
  if (!verifySignatureHeader) {
    console.log('⚠️ Header Verify-Signature não encontrado - processando sem validação');
    return false;
  }
  
  try {
    // Passo 1: Extrair timestamp e assinatura do header
    const elements = verifySignatureHeader.split(',');
    let timestamp = '';
    let receivedSignature = '';
    
    for (const element of elements) {
      const [prefix, value] = element.split('=');
      if (prefix === 't') {
        timestamp = value;
      } else if (prefix === 'vsign') {
        receivedSignature = value;
      }
    }
    
    if (!timestamp || !receivedSignature) {
      console.error('❌ Timestamp ou assinatura não encontrados no header');
      return false;
    }
    
    // Passo 2: Preparar string para comparação
    const signedPayload = timestamp + '.' + body;
    
    // Passo 3: Gerar HMAC SHA256
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SIGNATURE_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(signedPayload)
    );
    
    const computedSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Passo 4: Comparar assinaturas
    const isValid = computedSignature === receivedSignature;
    
    console.log(`🔐 Validação de assinatura: ${isValid ? 'VÁLIDA' : 'INVÁLIDA'}`);
    console.log(`📝 Timestamp: ${timestamp}`);
    console.log(`🔢 Assinatura recebida: ${receivedSignature}`);
    console.log(`🔢 Assinatura computada: ${computedSignature}`);
    
    return isValid;
    
  } catch (error) {
    console.error('❌ Erro na validação de assinatura:', error);
    return false;
  }
}

// Função para salvar logs de forma assíncrona
async function saveLog(eventType: string, data: any) {
  try {
    await supabase
      .from('webhook_logs')
      .insert({
        provider: 'ezzebank',
        event_type: eventType,
        transaction_id: data.transactionId || null,
        status: 'received',
        payload: data,
        processed_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('❌ Erro ao salvar log:', error);
  }
}

// Função para processar transação PIX de forma assíncrona
async function processPixTransaction(data: any) {
  try {
    const { transactionType, transactionId, external_id, amount, statusCode } = data;
    
    // Salvar transação
    await supabase
      .from('pix_transactions')
      .upsert({
        transaction_id: transactionId,
        external_id: external_id,
        type: transactionType,
        amount: parseFloat(amount || 0),
        status: statusCode?.statusId === 2 ? 'CONFIRMED' : 'PENDING',
        status_code: statusCode?.statusId,
        status_description: statusCode?.description,
        raw_data: data,
        created_at: new Date().toISOString()
      }, { onConflict: 'transaction_id' });
    
    // Se foi confirmado, adicionar créditos
    if (statusCode?.statusId === 2 && external_id) {
      await supabase
        .from('user_credits')
        .upsert({
          user_id: external_id,
          credits: parseFloat(amount || 0),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
    }
    
    console.log(`✅ Transação processada: ${transactionId}`);
  } catch (error) {
    console.error('❌ Erro ao processar transação:', error);
  }
}

// Handler principal - COMPLETAMENTE PÚBLICO
Deno.serve(async (req: Request) => {
  const startTime = Date.now();
  
  try {
    console.log(`🚀 Webhook recebido: ${req.method}`);
    console.log(`📋 Headers:`, Object.fromEntries(req.headers.entries()));
    
    // Permitir OPTIONS para CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Verify-Signature'
        }
      });
    }
    
    // Processar GET e POST
    if (req.method !== 'POST' && req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    // Para GET, apenas retornar 200
    if (req.method === 'GET') {
      return new Response('🚀 Webhook EzzeBank RAW - Funcionando!', { 
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // Ler o body
    const body = await req.text();
    console.log(`📄 Body recebido:`, body);
    
    // Verificar se é teste da EzzeBank
    if (body.includes('"test":true')) {
      console.log('🧪 Teste da EzzeBank detectado - retornando 200');
      return new Response('OK', { 
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // Validar assinatura HMAC (opcional)
    const verifySignatureHeader = req.headers.get('verify-signature');
    if (verifySignatureHeader) {
      if (!await validateSignature(req, body)) {
        console.error('❌ Falha na validação de assinatura HMAC');
        return new Response('Unauthorized - Invalid signature', { 
          status: 401,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      console.log('✅ Assinatura HMAC validada com sucesso');
    } else {
      console.log('⚠️ MODO SEM ASSINATURA: Processando sem validação HMAC');
    }
    
    // Responder imediatamente com 200 para evitar timeout
    const response = new Response('OK', { 
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Verify-Signature'
      }
    });
    
    // Processar assincronamente sem bloquear a resposta
    if (body && !body.includes('"test":true')) {
      try {
        const eventData = JSON.parse(body);
        const requestBody = eventData.requestBody || eventData;
        
        console.log(`📋 Evento: ${requestBody.transactionType} - ID: ${requestBody.transactionId}`);
        
        // Salvar log (não aguardar)
        saveLog(requestBody.transactionType, requestBody);
        
        // Processar transação (não aguardar)
        if (requestBody.transactionType === 'PAYMENT' || requestBody.transactionType === 'RECEIVEPIX') {
          processPixTransaction(requestBody);
        }
        
        console.log(`⏱️ Processamento iniciado em ${Date.now() - startTime}ms`);
      } catch (error) {
        console.error('❌ Erro no processamento assíncrono:', error);
        
        // Mesmo com erro, retornar 200 para evitar reenvio
        console.log('⚠️ Erro no processamento, mas retornando 200');
      }
    }
    
    return response;
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
    
    // Sempre retornar 200 para evitar reenvio desnecessário
    return new Response('OK', { 
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}); 