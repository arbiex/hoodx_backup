// Implementação simples de sessões pegajosas usando cookies
export class SimpleSessionAffinity {
  private static INSTANCE_ID = process.env.FLY_ALLOC_ID || 'local';
  private static COOKIE_NAME = 'fly-instance-id';
  
  // Verificar se deve servir este usuário
  static shouldServeUser(request: Request): boolean {
    const cookies = this.parseCookies(request.headers.get('cookie') || '');
    const sessionInstanceId = cookies[this.COOKIE_NAME];
    
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
    
    return newResponse;
  }
  
  // Criar response de redirecionamento
  static createReplayResponse(sessionInstanceId: string): Response {
    const response = new Response(
      JSON.stringify({ 
        message: 'Redirecionando para instância correta',
        instance: sessionInstanceId 
      }),
      { 
        status: 409,
        headers: { 
          'Content-Type': 'application/json',
          'fly-replay': `instance=${sessionInstanceId}`
        }
      }
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
} 