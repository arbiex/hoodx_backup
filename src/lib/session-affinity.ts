import { supabase } from '@/lib/supabase';

interface UserSession {
  user_id: string;
  instance_id: string;
  region: string;
  last_activity: string;
  expires_at: string;
}

export class SessionAffinity {
  private static INSTANCE_ID = process.env.FLY_ALLOC_ID || 'local';
  private static REGION = process.env.FLY_REGION || 'gru';
  private static SESSION_DURATION = 30 * 60 * 1000; // 30 minutos

  // Associar usuário a esta instância
  static async createUserSession(userId: string): Promise<UserSession> {
    const session: UserSession = {
      user_id: userId,
      instance_id: this.INSTANCE_ID,
      region: this.REGION,
      last_activity: new Date().toISOString(),
      expires_at: new Date(Date.now() + this.SESSION_DURATION).toISOString()
    };

    const { data, error } = await supabase
      .from('user_sessions')
      .upsert(session)
      .select()
      .single();

    if (error) {
      console.error('Erro ao criar sessão:', error);
      throw error;
    }

    return data;
  }

  // Verificar se usuário deve permanecer nesta instância
  static async shouldServeUser(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // Primeira vez ou sessão expirada - criar nova sessão
      await this.createUserSession(userId);
      return true;
    }

    // Verificar se sessão expirou
    if (new Date(data.expires_at) < new Date()) {
      await this.createUserSession(userId);
      return true;
    }

    // Se usuário está em outra instância, fazer replay
    if (data.instance_id !== this.INSTANCE_ID) {
      return false;
    }

    // Renovar sessão
    await this.renewUserSession(userId);
    return true;
  }

  // Renovar sessão do usuário
  static async renewUserSession(userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_sessions')
      .update({
        last_activity: new Date().toISOString(),
        expires_at: new Date(Date.now() + this.SESSION_DURATION).toISOString()
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Erro ao renovar sessão:', error);
    }
  }

  // Obter instância preferida para usuário
  static async getPreferredInstance(userId: string): Promise<string | null> {
    const { data } = await supabase
      .from('user_sessions')
      .select('instance_id')
      .eq('user_id', userId)
      .single();

    return data?.instance_id || null;
  }

  // Limpar sessão do usuário
  static async clearUserSession(userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Erro ao limpar sessão:', error);
    }
  }

  // Limpar sessões expiradas (executar periodicamente)
  static async cleanupExpiredSessions(): Promise<void> {
    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      console.error('Erro ao limpar sessões expiradas:', error);
    }
  }
} 