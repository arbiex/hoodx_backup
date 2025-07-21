// Sistema aprimorado de Session Affinity para Fly.io
export class EnhancedSessionAffinity {
  private static INSTANCE_ID = process.env.FLY_ALLOC_ID || 'local';
  private static REGION = process.env.FLY_REGION || 'local';
  private static APP_NAME = process.env.FLY_APP_NAME || 'hoodx';
  private static COOKIE_NAME = 'fly-instance-id';
  private static USER_HASH_COOKIE = 'user-session-hash';
  
  // Gerar hash único baseado no userId para consistency
  private static generateUserHash(userId: string): string {
    // Usar hash simples baseado no userId para garantir que mesmo usuário sempre vai para mesma máquina
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString();
  }
  
  // Verificar se deve servir este usuário (versão melhorada)
  static shouldServeUser(request: Request, userId?: string): boolean {
    const cookies = this.parseCookies(request.headers.get('cookie') || '');
    const sessionInstanceId = cookies[this.COOKIE_NAME];
    const userSessionHash = cookies[this.USER_HASH_COOKIE];
    
    // 🎯 PRIMEIRA PRIORIDADE: Se tem cookie de instância e é desta máquina, aceitar
    if (sessionInstanceId === this.INSTANCE_ID) {
      return true;
    }
    
    // 🎯 SEGUNDA PRIORIDADE: Se não tem cookie mas temos userId, verificar consistência
    if (!sessionInstanceId && userId) {
      const expectedHash = this.generateUserHash(userId);
      const currentInstanceNumber = parseInt(this.INSTANCE_ID.slice(-3) || '0', 16);
      const expectedInstanceNumber = parseInt(expectedHash.slice(-3), 10) % 10;
      
      // Se este usuário "pertence" a esta máquina baseado no hash, aceitar
      if (currentInstanceNumber === expectedInstanceNumber) {
        return true;
      }
    }
    
    // 🎯 TERCEIRA PRIORIDADE: Se é primeira visita, aceitar
    if (!sessionInstanceId) {
      return true;
    }
    
    // Se chegou aqui, não deve servir
    return false;
  }
  
  // Criar response com cookies aprimorados
  static createEnhancedSessionResponse(response: Response, userId?: string): Response {
    const newResponse = new Response(response.body, response);
    
    // Cookie principal de instância
    newResponse.headers.append('Set-Cookie', 
      `${this.COOKIE_NAME}=${this.INSTANCE_ID}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7200`
    );
    
    // Cookie de hash do usuário para consistency checking
    if (userId) {
      const userHash = this.generateUserHash(userId);
      newResponse.headers.append('Set-Cookie',
        `${this.USER_HASH_COOKIE}=${userHash}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7200`
      );
    }
    
    // Headers informativos para debug
    newResponse.headers.set('X-Fly-Instance', this.INSTANCE_ID);
    newResponse.headers.set('X-Fly-Region', this.REGION);
    newResponse.headers.set('X-App-Name', this.APP_NAME);
    
    return newResponse;
  }
  
  // Criar response de redirecionamento melhorado
  static createEnhancedReplayResponse(targetInstanceId: string, userId?: string): Response {
    const responseBody = {
      message: 'Redirecionando para instância correta',
      currentInstance: this.INSTANCE_ID,
      targetInstance: targetInstanceId,
      region: this.REGION,
      userId: userId ? `hash:${this.generateUserHash(userId)}` : undefined,
      timestamp: new Date().toISOString()
    };
    
    return new Response(
      JSON.stringify(responseBody),
      { 
        status: 409, // Conflict - indica que precisa de replay
        headers: { 
          'Content-Type': 'application/json',
          'fly-replay': `instance=${targetInstanceId}`,
          'X-Fly-Current-Instance': this.INSTANCE_ID,
          'X-Fly-Target-Instance': targetInstanceId,
          'X-Session-Affinity': 'replay-required'
        }
      }
    );
  }
  
  // Obter informações da instância atual
  static getInstanceInfo(): {
    instanceId: string;
    region: string;
    appName: string;
    timestamp: string;
  } {
    return {
      instanceId: this.INSTANCE_ID,
      region: this.REGION,
      appName: this.APP_NAME,
      timestamp: new Date().toISOString()
    };
  }
  
  // Verificar se request tem indicadores de session affinity
  static validateSessionAffinity(request: Request, userId?: string): {
    isValid: boolean;
    shouldServe: boolean;
    targetInstance?: string;
    details: {
      hasInstanceCookie: boolean;
      hasUserHashCookie: boolean;
      currentInstance: string;
      region: string;
      userHash?: string;
    };
  } {
    const cookies = this.parseCookies(request.headers.get('cookie') || '');
    const sessionInstanceId = cookies[this.COOKIE_NAME];
    const userSessionHash = cookies[this.USER_HASH_COOKIE];
    const shouldServe = this.shouldServeUser(request, userId);
    
    const details = {
      hasInstanceCookie: !!sessionInstanceId,
      hasUserHashCookie: !!userSessionHash,
      currentInstance: this.INSTANCE_ID,
      region: this.REGION,
      userHash: userId ? this.generateUserHash(userId) : undefined
    };
    
    return {
      isValid: shouldServe,
      shouldServe,
      targetInstance: sessionInstanceId && sessionInstanceId !== this.INSTANCE_ID ? sessionInstanceId : undefined,
      details
    };
  }
  
  // Utilitário para parsear cookies (mesmo do sistema original)
  private static parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = value;
      }
    });
    
    return cookies;
  }
  
  // Verificar se está rodando no Fly.io
  static isRunningOnFly(): boolean {
    return !!(process.env.FLY_ALLOC_ID && process.env.FLY_REGION);
  }
  
  // Log de debug para session affinity
  static logSessionAffinity(
    action: 'serve' | 'replay' | 'accept',
    userId?: string,
    details?: any
  ): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔗 [SESSION-AFFINITY] ${action.toUpperCase()}:`, {
        instance: this.INSTANCE_ID,
        region: this.REGION,
        userId: userId ? `${userId.slice(0, 8)}...` : 'unknown',
        timestamp: new Date().toLocaleTimeString(),
        ...details
      });
    }
  }
} 