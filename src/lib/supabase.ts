import { createClient } from '@supabase/supabase-js'

// Configuração do cliente Supabase com verificações de ambiente
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pcwekkqhcipvghvqvvtu.supabase.co').trim()
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd2Vra3FoY2lwdmdodnF2dnR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDkwNTcsImV4cCI6MjA2Mzk4NTA1N30.s9atBox8lrUba0Cb5qnH_dHTVJQkvwupoS2L6VneXHA').trim()

// Debug logs para verificar as variáveis
if (typeof window !== 'undefined') {
  console.log('Supabase URL:', supabaseUrl)
  console.log('Supabase URL length:', supabaseUrl.length)
  console.log('Supabase URL encoded:', encodeURIComponent(supabaseUrl))
  console.log('Supabase Key exists:', !!supabaseAnonKey)
  console.log('Environment URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('Environment Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

// Verificar se as variáveis de ambiente estão definidas
if (!supabaseUrl) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}

if (!supabaseAnonKey) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// Verificar se a URL é válida
try {
  new URL(supabaseUrl)
} catch (error) {
  throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl}`)
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