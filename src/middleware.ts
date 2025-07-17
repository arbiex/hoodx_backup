import { NextRequest, NextResponse } from 'next/server';
import { SimpleSessionAffinity } from '@/lib/simple-session-affinity';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Aplicar sessões pegajosas para rotas BMGBR
  if (pathname.includes('/api/bmgbr')) {
    const shouldServe = SimpleSessionAffinity.shouldServeUser(request);
    
    if (!shouldServe) {
      // Usuário tem cookie apontando para outra instância - fazer replay
      const cookies = request.cookies.get('fly-instance-id')?.value;
      
      if (cookies) {
        return SimpleSessionAffinity.createReplayResponse(cookies);
      }
    }
    
    // Se é primeira visita ou instância correta, continuar
    const response = NextResponse.next();
    
    // Se é primeira visita, definir cookie de sessão
    if (SimpleSessionAffinity.isFirstVisit(request)) {
      return SimpleSessionAffinity.createSessionResponse(response);
    }
    
    return response;
  }
  
  // Para outras rotas, continuar normalmente
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/bmgbr/:path*',
    '/api/bmgbr2/:path*'
  ]
}; 