import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configurar cliente Supabase
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Signature secret para validação
const SIGNATURE_SECRET = 'HRxzmqjkydI3bOwhlCf5QaeiYrcKPGA0EB8UTN6F';

// Função para validar assinatura HMAC
async function validateSignature(req: Request, body: string): Promise<boolean> {
  const verifySignatureHeader = req.headers.get('verify-signature');
  
  if (!verifySignatureHeader) {
    console.log('⚠️ Sem assinatura - modo teste');
    return false;
  }
  
  try {
    const elements = verifySignatureHeader.split(',');
    let timestamp = '';
    let receivedSignature = '';
    
    for (const element of elements) {
      const [prefix, value] = element.split('=');
      if (prefix === 't') timestamp = value;
      else if (prefix === 'vsign') receivedSignature = value;
    }
    
    if (!timestamp || !receivedSignature) return false;
    
    const signedPayload = timestamp + '.' + body;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SIGNATURE_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const computedSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const isValid = computedSignature === receivedSignature;
    console.log(`🔐 Assinatura: ${isValid ? 'VÁLIDA' : 'INVÁLIDA'}`);
    return isValid;
    
  } catch (error) {
    console.error('❌ Erro na validação:', error);
    return false;
  }
}

// Handler principal - SUPER SIMPLES
Deno.serve(async (req: Request) => {
  try {
    console.log(`🚀 Webhook EzzeBank: ${req.method}`);
    
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
    
    if (req.method === 'GET') {
      return new Response('🚀 EzzeBank Webhook - Funcionando!', { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    const body = await req.text();
    console.log(`📄 Body:`, body);
    
    // Teste EzzeBank
    if (body.includes('"test":true')) {
      console.log('🧪 Teste EzzeBank - OK');
      return new Response('OK', { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // Validar assinatura (opcional)
    const hasValidSignature = await validateSignature(req, body);
    if (!hasValidSignature) {
      console.log('⚠️ Processando sem validação de assinatura');
    }
    
    // Processar dados
    try {
      const eventData = JSON.parse(body);
      const requestBody = eventData.requestBody || eventData;
      
      console.log(`📋 Evento: ${requestBody.transactionType} - ${requestBody.transactionId}`);
      
      // Salvar APENAS na tabela - Database Webhook vai processar o resto
      const { data, error } = await supabase
        .from('pix_transactions')
        .insert({
          transaction_id: requestBody.transactionId,
          external_id: requestBody.external_id,
          type: requestBody.transactionType,
          amount: parseFloat(requestBody.amount || 0),
          status: requestBody.statusCode?.statusId === 2 ? 'CONFIRMED' : 'PENDING',
          status_code: requestBody.statusCode?.statusId,
          status_description: requestBody.statusCode?.description,
          raw_data: requestBody,
          created_at: new Date().toISOString()
        });
      
      if (error) {
        console.error('❌ Erro ao salvar:', error);
        return new Response('Database Error', { status: 500 });
      }
      
      console.log('✅ Dados salvos - Database Webhook vai processar');
      
    } catch (error) {
      console.error('❌ Erro no processamento:', error);
    }
    
    // Sempre retornar 200 OK
    return new Response('OK', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
    return new Response('OK', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}); 