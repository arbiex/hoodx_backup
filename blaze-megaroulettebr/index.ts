import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateUser } from './auth.ts';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://localhost:3000',
  'https://hoodx.ai',
  'https://bot-auto.vercel.app',
  'https://hoodx-production.up.railway.app',
  'http://162.240.225.25:3000',
  'https://hoodx.fly.dev'
];

function corsHeaders(origin) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders(origin)
    });
  }

  try {
    let requestData;
    try {
      requestData = await req.json();
    } catch (parseError) {
      console.error('❌ [PARSE] Erro ao parsear JSON:', parseError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Dados da requisição inválidos'
      }), {
        status: 400,
        headers: corsHeaders(origin)
      });
    }

    const { action, user_id } = requestData;
    console.log('🎯 [REQUEST] Action:', action, 'User ID:', user_id ? 'PROVIDED' : 'MISSING');

    if (!action) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Parâmetro "action" é obrigatório'
      }), {
        status: 400,
        headers: corsHeaders(origin)
      });
    }

    // Apenas ações de autenticação são suportadas agora
    const supportedActions = ['authenticate', 'renew_tokens', 'start_session'];
    
    if (!supportedActions.includes(action)) {
      return new Response(JSON.stringify({
        success: false,
        error: `Ação "${action}" não suportada. Ações disponíveis: ${supportedActions.join(', ')}`
      }), {
        status: 400,
        headers: corsHeaders(origin)
      });
    }

    if (['authenticate', 'renew_tokens'].includes(action) && !user_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Parâmetro "user_id" é obrigatório para esta ação'
      }), {
        status: 400,
        headers: corsHeaders(origin)
      });
    }

    // Configuração do Supabase
    const supabaseUrl = Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || 'https://pcwekkqhcipvghvqvvtu.supabase.co';
    const supabaseKey = Deno.env.get('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ [ENV] Variáveis de ambiente faltando');
      return new Response(JSON.stringify({
        success: false,
        error: 'Configuração do servidor inválida - variáveis de ambiente não encontradas'
      }), {
        status: 500,
        headers: corsHeaders(origin)
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ [SUPABASE] Cliente criado com sucesso');

    let response;
    switch(action) {
      case 'authenticate':
        response = await handleAuthenticate(supabase, user_id);
        break;
      case 'renew_tokens':
        response = await handleRenewTokens(supabase, user_id);
        break;
      case 'start_session':
        response = await handleStartSession();
        break;
      default:
        response = new Response(JSON.stringify({
          success: false,
          error: `Ação "${action}" não implementada`
        }), {
          status: 400,
          headers: corsHeaders(origin)
        });
    }

    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('❌ [MAIN] Erro geral:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Erro interno do servidor',
      stack: error instanceof Error ? error.stack : undefined
    }), {
      status: 500,
      headers: corsHeaders(origin)
    });
  }
});

async function handleStartSession() {
  try {
    return new Response(JSON.stringify({
      success: true,
      data: {
        message: 'Sessão iniciada - Sistema simplificado ativo',
        timestamp: Date.now()
      }
    }), {
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro ao iniciar sessão'
    }), {
      status: 500
    });
  }
}

async function handleAuthenticate(supabase, userId) {
  try {
    console.log('🔐 [AUTH] Iniciando autenticação simplificada para usuário:', userId);
    const result = await authenticateUser(supabase, userId);
    
    if (!result.success) {
      return new Response(JSON.stringify(result), {
        status: result.status || 500
      });
    }

    console.log('✅ [AUTH] Autenticação concluída com sucesso');
    return new Response(JSON.stringify(result), {
      status: 200
    });
  } catch (error) {
    console.error('❌ [AUTH] Erro na autenticação:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro na autenticação'
    }), {
      status: 500
    });
  }
}

async function handleRenewTokens(supabase, userId) {
  try {
    console.log('🔄 [RENEW] Renovando tokens para usuário:', userId);
    const result = await authenticateUser(supabase, userId);
    
    if (!result.success) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falha ao renovar tokens'
      }), {
        status: 500
      });
    }

    console.log('✅ [RENEW] Tokens renovados com sucesso');
    return new Response(JSON.stringify({
      success: true,
      data: {
        ...result.data,
        renewed: true,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 200
    });
  } catch (error) {
    console.error('❌ [RENEW] Erro ao renovar tokens:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro ao renovar tokens'
    }), {
      status: 500
    });
  }
}