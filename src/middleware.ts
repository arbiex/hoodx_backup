import { NextRequest, NextResponse } from 'next/server';
// import { SimpleSessionAffinity } from '@/lib/simple-session-affinity'; // ❌ DESABILITADO para 1 máquina

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 🆔 BYPASS: Pular chamadas internas (polling, etc)
  const isInternalCall = request.headers.get('x-internal-call') === 'true';
  if (isInternalCall) {
    return NextResponse.next();
  }
  
  // ❌ SESSION AFFINITY DESABILITADO: Com apenas 1 máquina, não é necessário
  // 🎯 SIMPLIFICADO: Todas as requisições vão para a única máquina disponível
  if (pathname.includes('/api/bmgbr')) {
    console.log(`✅ [MIDDLEWARE] Processamento direto (1 máquina): ${pathname}`);
    return NextResponse.next();
  }
  
  // Para outras rotas, continuar normalmente
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/bmgbr/:path*',
    '/api/bmgbr2-old/:path*',
    '/api/bmgbr3/:path*'
  ]
}; 