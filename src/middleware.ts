import { NextRequest, NextResponse } from 'next/server';
import { SimpleSessionAffinity } from '@/lib/simple-session-affinity';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 🆔 BYPASS: Pular chamadas internas (polling, etc)
  const isInternalCall = request.headers.get('x-internal-call') === 'true';
  if (isInternalCall) {
    return NextResponse.next();
  }
  
  // 🔗 APLICAR: Sessões pegajosas para rotas BMGBR
  if (pathname.includes('/api/bmgbr')) {
    console.log(`🔗 [MIDDLEWARE] Verificando session affinity para: ${pathname}`);
    
    const shouldServe = SimpleSessionAffinity.shouldServeUser(request);
    
    if (!shouldServe) {
      // Usuário tem cookie apontando para outra instância - fazer replay
      const cookies = request.cookies.get('fly-instance-id')?.value;
      
      if (cookies) {
        console.log(`🔄 [MIDDLEWARE] Redirecionando para instância: ${cookies}`);
        return SimpleSessionAffinity.createReplayResponse(cookies, request);
      }
    }
    
    // Se é primeira visita ou instância correta, continuar
    const response = NextResponse.next();
    
    // Se é primeira visita, definir cookie de sessão
    if (SimpleSessionAffinity.isFirstVisit(request)) {
      console.log(`🆕 [MIDDLEWARE] Primeira visita - definindo cookie`);
      return SimpleSessionAffinity.createSessionResponse(response);
    }
    
    console.log(`✅ [MIDDLEWARE] Session affinity OK - continuando`);
    return response;
  }
  
  // Para outras rotas, continuar normalmente
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/bmgbr/:path*',
    '/api/bmgbr2/:path*',
    '/api/bmgbr3/:path*'  // 🎯 ADICIONADO: bmgbr3 estava faltando
  ]
}; 