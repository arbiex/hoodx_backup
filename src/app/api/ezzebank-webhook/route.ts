import { NextRequest, NextResponse } from 'next/server';
import { createHash, createHmac } from 'crypto';

// Configurações
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SIGNATURE_SECRET = process.env.EZZEBANK_SIGNATURE_SECRET!;

// Função para validar assinatura HMAC
function validateSignature(body: string, signature: string): boolean {
  if (!signature) return false;
  
  try {
    const elements = signature.split(',');
    let timestamp = '';
    let receivedSignature = '';
    
    for (const element of elements) {
      const [prefix, value] = element.split('=');
      if (prefix === 't') timestamp = value;
      else if (prefix === 'vsign') receivedSignature = value;
    }
    
    if (!timestamp || !receivedSignature) return false;
    
    const signedPayload = timestamp + '.' + body;
    const computedSignature = createHmac('sha256', SIGNATURE_SECRET)
      .update(signedPayload)
      .digest('hex');
    
    return computedSignature === receivedSignature;
  } catch (error) {
    console.error('❌ Erro na validação de assinatura:', error);
    return false;
  }
}

export async function GET() {
  const baseUrl = process.env.NEXT_FLY_APP_URL || 'https://hoodx.fly.dev';
  
  return NextResponse.json({ 
    message: '🚀 Webhook EzzeBank Proxy - Funcionando!',
    timestamp: new Date().toISOString(),
    url: `${baseUrl}/api/ezzebank-webhook`
  });
}

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Webhook recebido da EzzeBank');
    
    // Ler o body
    const body = await request.text();
    console.log('📄 Body recebido:', body);
    
    // Verificar se é teste da EzzeBank
    if (body.includes('"test":true')) {
      console.log('🧪 Teste EzzeBank detectado - retornando OK');
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }
    
    // Validar assinatura HMAC (opcional)
    const signature = request.headers.get('verify-signature');
    if (signature) {
      if (!validateSignature(body, signature)) {
        console.error('❌ Assinatura inválida');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
      console.log('✅ Assinatura validada');
    } else {
      console.log('⚠️ Processando sem validação de assinatura');
    }
    
    // Repassar para Supabase Edge Function com headers obrigatórios
    const supabaseResponse = await fetch(`${SUPABASE_URL}/functions/v1/ezzebank-webhook-public`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        // Repassar header de assinatura se existir
        ...(signature && { 'verify-signature': signature })
      },
      body: body
    });
    
    if (!supabaseResponse.ok) {
      console.error('❌ Erro ao repassar para Supabase:', supabaseResponse.status);
      return NextResponse.json({ error: 'Supabase error' }, { status: 500 });
    }
    
    console.log('✅ Webhook repassado com sucesso para Supabase');
    
    // Retornar sempre 200 para EzzeBank
    return NextResponse.json({ status: 'ok' }, { status: 200 });
    
  } catch (error) {
    console.error('❌ Erro no proxy:', error);
    
    // Sempre retornar 200 para evitar reenvio
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Verify-Signature'
    }
  });
} 