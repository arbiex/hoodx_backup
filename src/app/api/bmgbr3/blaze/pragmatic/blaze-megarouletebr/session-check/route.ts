import { NextRequest, NextResponse } from 'next/server';
import { EnhancedSessionAffinity } from '@/lib/enhanced-session-affinity';
import { SimpleSessionAffinity } from '@/lib/simple-session-affinity';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') || undefined;
    
    // Verificações usando o sistema atual
    const shouldServeSimple = SimpleSessionAffinity.shouldServeUser(request);
    const isFirstVisit = SimpleSessionAffinity.isFirstVisit(request);
    const currentInstanceId = SimpleSessionAffinity.getCurrentInstanceId();
    
    // Verificações usando o sistema aprimorado
    const enhancedValidation = EnhancedSessionAffinity.validateSessionAffinity(request, userId);
    const instanceInfo = EnhancedSessionAffinity.getInstanceInfo();
    const isOnFly = EnhancedSessionAffinity.isRunningOnFly();
    
    // Informações dos cookies
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) acc[name] = value;
      return acc;
    }, {} as Record<string, string>);
    
    // Cabeçalhos relacionados ao Fly.io
    const flyHeaders = {
      'fly-client-ip': request.headers.get('fly-client-ip'),
      'fly-forwarded-port': request.headers.get('fly-forwarded-port'),
      'fly-region': request.headers.get('fly-region'),
      'x-forwarded-for': request.headers.get('x-forwarded-for'),
      'x-forwarded-proto': request.headers.get('x-forwarded-proto')
    };
    
    const response = {
      timestamp: new Date().toISOString(),
      instance: {
        ...instanceInfo,
        isRunningOnFly: isOnFly
      },
      sessionAffinity: {
        simple: {
          shouldServe: shouldServeSimple,
          isFirstVisit,
          currentInstanceId
        },
        enhanced: enhancedValidation
      },
      cookies,
      flyHeaders,
      request: {
        url: request.url,
        method: request.method,
        userAgent: request.headers.get('user-agent')?.slice(0, 100) + '...',
        userId: userId ? `${userId.slice(0, 8)}...` : undefined
      },
      recommendations: [] as string[]
    };
    
    // Adicionar recomendações baseadas no status
    if (!shouldServeSimple && !enhancedValidation.shouldServe) {
      response.recommendations.push('🔄 Requisição deveria ser redirecionada para outra instância');
    }
    
    if (isFirstVisit) {
      response.recommendations.push('🆕 Primeira visita - cookie será definido');
    }
    
    if (!isOnFly) {
      response.recommendations.push('⚠️ Não está rodando no Fly.io - session affinity limitada');
    }
    
    if (cookies['fly-instance-id'] && cookies['fly-instance-id'] !== currentInstanceId) {
      response.recommendations.push(`🎯 Cookie aponta para instância ${cookies['fly-instance-id']} mas está na ${currentInstanceId}`);
    }
    
    // Definir cookie se necessário
    const finalResponse = shouldServeSimple 
      ? SimpleSessionAffinity.createSessionResponse(NextResponse.json(response))
      : NextResponse.json(response);
    
    // Headers informativos
    finalResponse.headers.set('X-Session-Check', 'completed');
    finalResponse.headers.set('X-Instance-Info', JSON.stringify(instanceInfo));
    
    return finalResponse;
    
  } catch (error) {
    console.error('❌ Erro na verificação de session affinity:', error);
    
    return NextResponse.json({
      error: 'Erro na verificação de session affinity',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
      timestamp: new Date().toISOString(),
      instance: EnhancedSessionAffinity.getInstanceInfo()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, testAffinity } = body;
    
    if (testAffinity) {
      // Simular diferentes cenários de session affinity
      const scenarios = [
        {
          name: 'Nova sessão',
          shouldServe: true,
          action: 'create_session'
        },
        {
          name: 'Sessão existente (mesma instância)',
          shouldServe: true,
          action: 'serve_existing'
        },
        {
          name: 'Sessão existente (outra instância)', 
          shouldServe: false,
          action: 'replay_required'
        }
      ];
      
      return NextResponse.json({
        message: 'Teste de session affinity concluído',
        scenarios,
        currentInstance: EnhancedSessionAffinity.getInstanceInfo(),
        timestamp: new Date().toISOString()
      });
    }
    
    // Validação padrão
    const validation = EnhancedSessionAffinity.validateSessionAffinity(request, userId);
    
    return validation.shouldServe
      ? EnhancedSessionAffinity.createEnhancedSessionResponse(
          NextResponse.json({
            message: 'Session affinity válida',
            ...validation,
            timestamp: new Date().toISOString()
          }),
          userId
        )
      : EnhancedSessionAffinity.createEnhancedReplayResponse(
          validation.targetInstance || 'unknown',
          userId
        );
        
  } catch (error) {
    return NextResponse.json({
      error: 'Erro no teste de session affinity',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
} 