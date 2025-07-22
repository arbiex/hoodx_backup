'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Image from 'next/image'
import { Terminal, Lock, User, Crown, Mail, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import MatrixRain from '@/components/MatrixRain'
import { useNetwork } from '@/hooks/useNetwork'

// Função para traduzir mensagens de erro do Supabase
const translateSupabaseError = (errorMessage: string): string => {
  const translations: { [key: string]: string } = {
    'Invalid login credentials': 'Credenciais de login inválidas',
    'Email not confirmed': 'Email não confirmado',
    'User not found': 'Usuário não encontrado',
    'Invalid email': 'Email inválido',
    'Password should be at least 6 characters': 'Senha deve ter pelo menos 6 caracteres',
    'User already registered': 'Usuário já registrado',
    'Email already registered': 'Email já registrado',
    'Signup is disabled': 'Registro está desabilitado',
    'Invalid password': 'Senha inválida',
    'Email rate limit exceeded': 'Limite de tentativas de email excedido',
    'Too many requests': 'Muitas tentativas',
    'Network error': 'Erro de rede',
    'Database error': 'Erro de banco de dados',
    'Authentication failed': 'Falha na autenticação',
    'Access denied': 'Acesso negado',
    'Session expired': 'Sessão expirada',
    'Invalid token': 'Token inválido',
    'Token expired': 'Token expirado',
    'For security purposes, you can only request this once every 60 seconds': 'Por segurança, você só pode solicitar isso uma vez a cada 60 segundos'
  }
  
  // Procurar por traduções exatas primeiro
  if (translations[errorMessage]) {
    return translations[errorMessage]
  }
  
  // Procurar por traduções parciais
  for (const [english, portuguese] of Object.entries(translations)) {
    if (errorMessage.toLowerCase().includes(english.toLowerCase())) {
      return portuguese
    }
  }
  
  // Se não encontrar tradução, retornar mensagem genérica
  return 'Erro de autenticação'
}

interface AuthProps {
  onAuthSuccess: () => void
  defaultMode?: 'login' | 'register' | 'invite-only'
  initialReferralCode?: string
}

export default function Auth({ onAuthSuccess, defaultMode = 'login', initialReferralCode }: AuthProps) {
  const [isLogin, setIsLogin] = useState(defaultMode === 'login')
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const isInviteOnly = defaultMode === 'invite-only'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [referralCode, setReferralCode] = useState(initialReferralCode || '')
  const [sponsorInfo, setSponsorInfo] = useState<{
    email: string;
    referral_code: string;
    joined_date: string;
  } | null>(null)
  
  // const { getSponsorInfo, registerWithReferral } = useNetwork() // Removido temporariamente
  const hasShownToast = useRef(false)

  // Check for referral code on mount
  useEffect(() => {
    if (hasShownToast.current) return // Prevent multiple executions
    
    // Use initial referral code from props or URL
    const urlParams = new URLSearchParams(window.location.search)
    const urlRefCode = urlParams.get('ref')
    const refCode = initialReferralCode || urlRefCode
    
    if (isInviteOnly) {
      // Force register mode for invite-only
      setIsLogin(false)
      
      if (!refCode) {
        // No referral code in invite-only mode - show error
        toast.error("CONVITE_INVÁLIDO", {
          description: "Este link de convite é inválido ou expirou"
        })
        hasShownToast.current = true
        return
      }
    }
    
    if (refCode) {
      setReferralCode(refCode)
      // Automatically switch to register mode when referral code is detected
      setIsLogin(false)
      // Get sponsor info
      // getSponsorInfo(refCode).then(sponsor => { // Removido temporariamente
      //   if (sponsor) {
      //     setSponsorInfo(sponsor)
      //     if (isInviteOnly && !hasShownToast.current) {
      //       toast.success("CONVITE_ACEITO", {
      //         description: `Bem-vindo ao círculo interno. Convidado por ${sponsor.email}`
      //       })
      //       hasShownToast.current = true
      //     } else if (!isInviteOnly && !hasShownToast.current) {
      //       toast.success("INDICAÇÃO_DETECTADA", {
      //         description: `Você foi convidado por ${sponsor.email}`
      //       })
      //       hasShownToast.current = true
      //     }
      //   } else if (isInviteOnly && !hasShownToast.current) {
      //     toast.error("CONVITE_INVÁLIDO", {
      //       description: "Este código de convite não é válido"
      //     })
      //     hasShownToast.current = true
      //   }
      // }).catch(error => { // Removido temporariamente
      //   console.error('Error in getSponsorInfo:', error)
      //   if (isInviteOnly && !hasShownToast.current) {
      //     toast.error("CONVITE_INVÁLIDO", {
      //       description: "Erro ao validar código de convite"
      //     })
      //     hasShownToast.current = true
      //   }
      // })
    }
  }, [initialReferralCode]) // Removido getSponsorInfo e registerWithReferral da dependência

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { supabase } = await import('@/lib/supabase')
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      if (error) {
        console.error('Password reset error:', error)
        toast.error("ERRO_RESET_SENHA", {
          description: translateSupabaseError(error.message)
        })
      } else {
        toast.success("EMAIL_ENVIADO", {
          description: "Verifique seu email para redefinir sua senha"
        })
        setIsForgotPassword(false)
        setEmail('')
      }
    } catch (error: unknown) {
      toast.error("FALHA_SISTEMA", {
        description: "Erro inesperado ao enviar email de reset"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { authHelpers } = await import('@/lib/supabase')
      
      let result
      if (isLogin) {
        result = await authHelpers.signIn(email, password)
      } else {
        result = await authHelpers.signUp(email, password)
        
        // If signup was successful, register the user (with or without referral)
        if (!result.error && result.data?.user) {
          try {
            // registerWithReferral( // Removido temporariamente
            //   result.data.user.id,
            //   email,
            //   result.data.user.user_metadata?.full_name,
            //   referralCode || undefined // Pass referral code if exists
            // )
            
            // if (referralCode && sponsorInfo) { // Removido temporariamente
            //   toast.success("INDICAÇÃO_REGISTRADA", {
            //     description: `Conectado à rede de ${sponsorInfo.email}`
            //   })
            // }
          } catch (referralError) {
            console.error('Error registering user:', referralError)
            // Don't fail the whole signup for registration errors
          }
        }
      }

      if (result.error) {
        console.error('Auth error:', result.error)
        toast.error("ACESSO_NEGADO", {
          description: translateSupabaseError(result.error.message) || "Falha na autenticação"
        })
      } else {
        toast.success(isLogin ? "AUTENTICAÇÃO_SUCESSO" : "USUÁRIO_REGISTRADO", {
          description: isLogin ? "Acesso ao sistema concedido" : "Novo usuário inicializado com sucesso"
        })
        onAuthSuccess()
      }
    } catch (error: unknown) {
      toast.error("FALHA_SISTEMA", {
        description: "Erro inesperado ocorreu"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Matrix Rain Background - Canvas dinâmico */}
      <MatrixRain />
      
      <div className="w-full max-w-md relative z-10">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/isotipo.svg"
              alt="Roleta Bot Logo"
              width={80}
              height={80}
              className={isInviteOnly ? "opacity-80 filter drop-shadow-lg" : ""}
            />
          </div>
          {isInviteOnly ? (
            <>
              <h1 className="text-4xl font-bold font-mono text-green-400 mb-2">
                CÍRCULO <span className="text-green-500">INTERNO</span>
              </h1>
              <p className="text-xs text-gray-500 font-mono">
                &ldquo;Apenas os convidados podem entrar&rdquo;
              </p>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-bold font-mono text-green-400 mb-2">
                ROLETA<span className="text-green-500">.BOT</span>
              </h1>
              <p className="text-gray-500 font-mono text-sm">
                // A matemática oculta da sorte
              </p>
            </>
          )}
        </div>

        {/* Regular sponsor card for non-invite mode */}
        {!isInviteOnly && sponsorInfo && !isLogin && !isForgotPassword && (
          <Card className="border-yellow-500/30 bg-black/80 backdrop-blur-lg shadow-2xl shadow-yellow-500/10 mb-4">
            <CardHeader className="text-center">
              <CardTitle className="text-lg font-mono text-yellow-400 flex items-center justify-center gap-2">
                <Crown className="h-5 w-5" />
                CONVIDADO_POR
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-yellow-400 font-mono font-bold">{sponsorInfo.email}</div>
                <div className="text-xs text-gray-400 font-mono mt-1">
                  Código: {sponsorInfo.referral_code} • Entrou em: {new Date(sponsorInfo.joined_date).toLocaleDateString('pt-BR')}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className={`${isInviteOnly ? 'border-green-500/40 bg-gradient-to-br from-green-900/10 to-black/90' : 'border-green-500/30 bg-black/80'} backdrop-blur-lg shadow-2xl shadow-green-500/10`}>
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-mono text-green-400 flex items-center justify-center gap-2">
              {isForgotPassword ? (
                <>
                  <Mail className="h-5 w-5" />
                  RESET_SENHA
                </>
              ) : (
                <>
                  <Terminal className="h-5 w-5" />
                  {isInviteOnly ? 'PROTOCOLO_INICIAÇÃO' : isLogin ? 'LOGIN_SISTEMA' : 'REGISTRO_USUÁRIO'}
                </>
              )}
            </CardTitle>
            <CardDescription className="text-gray-400 font-mono text-xs">
              {isForgotPassword 
                ? '// Redefinir senha de acesso via email'
                : isInviteOnly 
                  ? '// Entre no Círculo Interno - Convite Obrigatório'
                  : isLogin 
                    ? '// Autenticação de controle de acesso necessária' 
                    : sponsorInfo 
                      ? '// Junte-se à rede e comece a ganhar comissões'
                      : '// Inicialização de nova conta de usuário'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isForgotPassword ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300 font-mono text-sm flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    ENDEREÇO_EMAIL
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    placeholder="user@roleta.bot"
                    required
                    className="bg-black/50 border-green-500/30 text-green-400 placeholder:text-gray-600 font-mono focus:border-green-400 focus:ring-green-400/20"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono uppercase tracking-wide disabled:opacity-50"
                  disabled={loading}
                  variant="outline"
                >
                  {loading ? 'ENVIANDO...' : 'ENVIAR_EMAIL_RESET'}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false)
                      setEmail('')
                    }}
                    className="text-sm text-gray-500 hover:text-green-400 font-mono transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    // Voltar para login
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {isInviteOnly && (
                  <div className="space-y-2">
                    <Label htmlFor="inviteCode" className="text-gray-300 font-mono text-sm flex items-center gap-2">
                      <Crown className="h-4 w-4" />
                      CÓDIGO_CONVITE
                    </Label>
                    <Input
                      id="inviteCode"
                      type="text"
                      value={referralCode}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const code = e.target.value.toUpperCase()
                        setReferralCode(code)
                        // getSponsorInfo(code).then(sponsor => { // Removido temporariamente
                        //   if (sponsor) {
                        //     setSponsorInfo(sponsor)
                        //     toast.success("CÓDIGO_VÁLIDO", {
                        //       description: `Agente encontrado: ${sponsor.email}`
                        //     })
                        //   } else {
                        //     setSponsorInfo(null)
                        //     toast.error("CÓDIGO_INVÁLIDO", {
                        //       description: "Código não encontrado ou inativo"
                        //     })
                        //   }
                        // }).catch(error => { // Removido temporariamente
                        //   console.error('Error in input getSponsorInfo:', error)
                        //   setSponsorInfo(null)
                        //   toast.error("ERRO_VALIDAÇÃO", {
                        //     description: "Erro ao validar código"
                        //   })
                        // })
                      }}
                      placeholder="Digite o código de convite"
                      required
                      className="bg-black/50 border-green-500/30 text-green-400 placeholder:text-gray-600 font-mono focus:border-green-400 focus:ring-green-400/20 uppercase tracking-wider"
                    />
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300 font-mono text-sm flex items-center gap-2">
                    <User className="h-4 w-4" />
                    ENDEREÇO_EMAIL
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    placeholder="user@roleta.bot"
                    required
                    className="bg-black/50 border-green-500/30 text-green-400 placeholder:text-gray-600 font-mono focus:border-green-400 focus:ring-green-400/20"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-300 font-mono text-sm flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    SENHA_HASH
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      minLength={6}
                      className="bg-black/50 border-green-500/30 text-green-400 placeholder:text-gray-600 font-mono focus:border-green-400 focus:ring-green-400/20 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-green-400 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30 font-mono uppercase tracking-wide disabled:opacity-50"
                  disabled={loading || (isInviteOnly && (!referralCode || !sponsorInfo))}
                  variant="outline"
                >
                  {loading ? 'PROCESSANDO...' : isInviteOnly ? 'ENTRAR_NO_CÍRCULO' : (isLogin ? 'AUTENTICAR' : 'REGISTRAR_USUÁRIO')}
                </Button>
              </form>
            )}

            {!isInviteOnly && !isForgotPassword && defaultMode !== 'login' && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-sm text-gray-500 hover:text-green-400 font-mono transition-colors"
                >
                  {isLogin 
                    ? '// Precisa de conta? Inicializar registro de usuário' 
                    : '// Já tem conta? Retornar para autenticação'
                  }
                </button>
              </div>
            )}

            {!isInviteOnly && !isForgotPassword && isLogin && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  className="text-sm text-gray-500 hover:text-green-400 font-mono transition-colors"
                >
                  // Esqueceu a senha? Redefinir acesso
                </button>
              </div>
            )}

            {defaultMode === 'login' && !isForgotPassword && (
              <div className="mt-6 text-center">
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-xs text-yellow-400 font-mono">
                    <Crown className="h-3 w-3 inline mr-1" />
                    CADASTROS APENAS POR CONVITE
                  </p>
                  <p className="text-xs text-gray-400 font-mono mt-1">
                    // Solicite um link de indicação para criar sua conta
                  </p>
                </div>
              </div>
            )}

            {isInviteOnly && (
              <div className="mt-6 text-center">
                <p className="text-xs text-green-500/60 font-mono italic">
                  &ldquo;O caminho para a riqueza está oculto das massas&rdquo;
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 