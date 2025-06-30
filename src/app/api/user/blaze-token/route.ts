import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    // Buscar usuário autenticado
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({
        success: false,
        error: 'Token de autorização necessário'
      }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Usuário não autenticado'
      }, { status: 401 });
    }

    // Buscar token da Blaze do usuário
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('token')
      .eq('casino_code', 'BLAZE')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData?.token) {
      return NextResponse.json({
        success: false,
        error: 'Token da Blaze não encontrado. Configure seu token na página de configurações.'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      token: tokenData.token
    });

  } catch (error) {
    console.error('Erro ao buscar token da Blaze:', error);
    return NextResponse.json({
      success: false,
      error: 'Erro interno do servidor'
    }, { status: 500 });
  }
} 