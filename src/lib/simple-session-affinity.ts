// Implementação simples de sessões pegajosas usando cookies
export class SimpleSessionAffinity {
  private static INSTANCE_ID = process.env.FLY_ALLOC_ID || 'local';
  private static COOKIE_NAME = 'fly-instance-id';
  private static REDIRECT_COUNT_COOKIE = 'fly-redirect-count';
  private static MAX_REDIRECTS = 3; // Máximo de redirecionamentos para evitar loop
  
  // Verificar se deve servir este usuário
  static shouldServeUser(request: Request): boolean {
    const cookies = this.parseCookies(request.headers.get('cookie') || '');
    const sessionInstanceId = cookies[this.COOKIE_NAME];
    const redirectCount = parseInt(cookies[this.REDIRECT_COUNT_COOKIE] || '0');
    
    // 🛡️ PROTEÇÃO: Se muitos redirecionamentos, aceitar na instância atual
    if (redirectCount >= this.MAX_REDIRECTS) {
      console.warn(`⚠️ [SESSION-AFFINITY] Muitos redirecionamentos (${redirectCount}) - forçando aceitação`);
      return true;
    }
    
    // Se não tem cookie ou é a primeira vez, aceita
    if (!sessionInstanceId) {
      return true;
    }
    
    // Se o cookie aponta para esta instância, aceita
    return sessionInstanceId === this.INSTANCE_ID;
  }
  
  // Criar response com cookie de sessão
  static createSessionResponse(response: Response): Response {
    const newResponse = new Response(response.body, response);
    
    // Definir cookie que "gruda" usuário nesta instância
    newResponse.headers.set('Set-Cookie', 
      `${this.COOKIE_NAME}=${this.INSTANCE_ID}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`
    );
    
    // Resetar contador de redirecionamentos
    newResponse.headers.append('Set-Cookie',
      `${this.REDIRECT_COUNT_COOKIE}=0; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`
    );
    
    return newResponse;
  }
  
  // Criar response de redirecionamento com proteção contra loop
  static createReplayResponse(sessionInstanceId: string, request?: Request): Response {
    let redirectCount = 0;
    
    if (request) {
      const cookies = this.parseCookies(request.headers.get('cookie') || '');
      redirectCount = parseInt(cookies[this.REDIRECT_COUNT_COOKIE] || '0');
    }
    
    // 🛡️ PROTEÇÃO: Se muitos redirecionamentos, não redirecionar mais
    if (redirectCount >= this.MAX_REDIRECTS) {
      console.error(`❌ [SESSION-AFFINITY] LOOP DETECTADO! ${redirectCount} redirecionamentos - parando`);
      return new Response(
        JSON.stringify({ 
          error: 'Loop de redirecionamentos detectado',
          redirectCount,
          currentInstance: this.INSTANCE_ID,
          targetInstance: sessionInstanceId
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const response = new Response(
      JSON.stringify({ 
        message: 'Redirecionando para instância correta',
        instance: sessionInstanceId,
        redirectCount: redirectCount + 1
      }),
      { 
        status: 409,
        headers: { 
          'Content-Type': 'application/json',
          'fly-replay': `instance=${sessionInstanceId}`
        }
      }
    );
    
    // Incrementar contador de redirecionamentos
    response.headers.set('Set-Cookie',
      `${this.REDIRECT_COUNT_COOKIE}=${redirectCount + 1}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=60`
    );
    
    return response;
  }
  
  // Utilitário para parsear cookies
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
  
  // Obter ID da instância atual
  static getCurrentInstanceId(): string {
    return this.INSTANCE_ID;
  }
  
  // Verificar se é a primeira visita (sem cookie)
  static isFirstVisit(request: Request): boolean {
    const cookies = this.parseCookies(request.headers.get('cookie') || '');
    return !cookies[this.COOKIE_NAME];
  }
  
  // Verificar se há possível loop
  static checkForLoop(request: Request): { hasLoop: boolean; redirectCount: number } {
    const cookies = this.parseCookies(request.headers.get('cookie') || '');
    const redirectCount = parseInt(cookies[this.REDIRECT_COUNT_COOKIE] || '0');
    
    return {
      hasLoop: redirectCount >= this.MAX_REDIRECTS,
      redirectCount
    };
  }
} 