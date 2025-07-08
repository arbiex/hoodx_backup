import { createClient } from '@supabase/supabase-js'

// Configuração do cliente Supabase com verificações de ambiente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Verificação de segurança: as variáveis devem estar definidas
if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL é obrigatória')
}

if (!supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY é obrigatória')
}

// Debug logs para verificar as variáveis (apenas no desenvolvimento)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Debug removido para evitar logs desnecessários
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Auth helpers
export const authHelpers = {
  // Sign in function
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  },

  // Sign up function
  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { data, error }
  },

  // Função para logout
  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Função para obter usuário atual
  async getCurrentUser() {
    const { data, error } = await supabase.auth.getUser()
    return { data, error }
  },

  // Função para ouvir mudanças de autenticação
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback)
  }
}

export const userHelpers = {
  // Salvar preferência de idioma do usuário
  saveLanguagePreference: async (language: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // Primeiro tentar UPDATE
      const { data: updateData, error: updateError } = await supabase
        .from('user_preferences')
        .update({
          language: language,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .select()

      // Se o UPDATE não afetou nenhuma linha, fazer INSERT
      if (updateError || !updateData || updateData.length === 0) {
        const { data: insertData, error: insertError } = await supabase
          .from('user_preferences')
          .insert({
            user_id: user.id,
            language: language,
            updated_at: new Date().toISOString()
          })
          .select()

        if (insertError) {
          console.error('Error inserting language preference:', insertError)
          // Fallback para user metadata se a tabela falhar
          const { error: fallbackError } = await supabase.auth.updateUser({
            data: { language: language }
          })
          
          if (fallbackError) throw fallbackError
          return { data: { language }, error: null }
        }

        return { data: insertData?.[0], error: null }
      }

      return { data: updateData?.[0], error: null }
    } catch (error) {
      console.error('Error saving language preference:', error)
      return { data: null, error }
    }
  },

  // Carregar preferência de idioma do usuário
  getLanguagePreference: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { data: null, error: 'User not authenticated' }

      // Tentar buscar da tabela user_preferences
      const { data, error } = await supabase
        .from('user_preferences')
        .select('language')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        // Erro diferente de "not found"
        console.warn('Error fetching from user_preferences:', error)
      }

      if (data?.language) {
        return { data, error: null }
      }

      // Fallback para metadados do usuário
      const language = user.user_metadata?.language || 'en'
      return { data: { language }, error: null }
    } catch (error) {
      console.error('Error getting language preference:', error)
      return { data: { language: 'en' }, error: null } // fallback para inglês
    }
  },

  // Obter todas as preferências do usuário
  getUserPreferences: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { data: null, error: 'User not authenticated' }

      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code === 'PGRST116') {
        // Preferências não existem, criar com valores padrão
        const defaultPrefs = {
          user_id: user.id,
          language: 'en',
          timezone: 'UTC',
          theme: 'dark',
          notifications_enabled: true
        }
        
        const { data: newData, error: insertError } = await supabase
          .from('user_preferences')
          .insert(defaultPrefs)
          .select()
          .single()
          
        return { data: newData, error: insertError }
      }

      return { data, error }
    } catch (error) {
      console.error('Error getting user preferences:', error)
      return { data: null, error }
    }
  }
} 