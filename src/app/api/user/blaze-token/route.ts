import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  try {
    // Criar cliente Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // Usar anon key em vez de service role
    );
    
    // Tentar buscar usuário via cookie de autorização
    const authHeader = request.headers.get('authorization') || 
                      request.headers.get('cookie')?.match(/sb-.*-auth-token=([^;]+)/)?.[1];
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (!userError && user) {
        console.log('✅ [BLAZE-TOKEN] Usuário autenticado via header:', user.id);
        return await fetchUserToken(supabase, user.id);
      }
    }
    
    // Fallback: buscar via query parameter (último caso)
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
      console.log('✅ [BLAZE-TOKEN] Usando userId via query param:', userId);
      return await fetchUserToken(supabase, userId);
    }

    console.error('❌ [BLAZE-TOKEN] Nenhum método de autenticação funcionou');
    return NextResponse.json({
      success: false,
      error: 'Usuário não autenticado - nenhum token válido encontrado'
    }, { status: 401 });

  } catch (error) {
    console.error('❌ [BLAZE-TOKEN] Erro geral:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor'
    }, { status: 500 });
  }
}

async function fetchUserToken(supabase: any, userId: string) {
  try {
    console.log('🔍 [BLAZE-TOKEN] Buscando token para usuário:', userId);

    // Buscar token da Blaze do usuário
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('token')
      .eq('casino_code', 'BLAZE')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData?.token) {
      console.error('❌ [BLAZE-TOKEN] Token não encontrado:', tokenError);
      return NextResponse.json({
        success: false,
        error: 'Token da Blaze não encontrado. Configure seu token na página de configurações.'
      }, { status: 404 });
    }

    console.log('✅ [BLAZE-TOKEN] Token encontrado com sucesso');
    return NextResponse.json({
      success: true,
      token: tokenData.token
    });

  } catch (error) {
    console.error('❌ [BLAZE-TOKEN] Erro ao buscar token:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor'
    }, { status: 500 });
  }
} 