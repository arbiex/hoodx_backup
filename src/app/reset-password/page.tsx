'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Image from 'next/image'
import { Lock, Shield, CheckCircle, Eye, EyeOff } from 'lucide-react'
import MatrixRain from '@/components/MatrixRain'

function ResetPasswordContent() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isValidSession, setIsValidSession] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { supabase } = await import('@/lib/supabase')
        
        // Verificar se há uma sessão de recuperação de senha ativa
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session) {
          setIsValidSession(true)
        } else {
          // Tentar verificar se há parâmetros de token na URL
          const accessToken = searchParams.get('access_token')
          const refreshToken = searchParams.get('refresh_token')
          
          if (accessToken && refreshToken) {
            // Definir a sessão usando os tokens da URL
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            })
            
            if (!error) {
              setIsValidSession(true)
            } else {
              toast.error("SESSÃO_INVÁLIDA", {
                description: "Link de redefinição inválido ou expirado"
              })
              setTimeout(() => router.push('/'), 3000)
            }
          } else {
            toast.error("ACESSO_NEGADO", {
              description: "Acesso direto não permitido. Use o link do email."
            })
            setTimeout(() => router.push('/'), 3000)
          }
        }
      } catch (error) {
        console.error('Error checking session:', error)
        toast.error("ERRO_SESSÃO", {
          description: "Erro ao verificar sessão de redefinição"
        })
        setTimeout(() => router.push('/'), 3000)
      }
    }

    checkSession()
  }, [router, searchParams])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      toast.error("SENHAS_DIFERENTES", {
        description: "As senhas não coincidem"
      })
      return
    }

    if (password.length < 6) {
      toast.error("SENHA_FRACA", {
        description: "A senha deve ter pelo menos 6 caracteres"
      })
      return
    }

    setLoading(true)

    try {
      const { supabase } = await import('@/lib/supabase')
      
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) {
        console.error('Password update error:', error)
        toast.error("ERRO_ATUALIZAÇÃO", {
          description: "Erro ao atualizar senha. Tente novamente."
        })
      } else {
        toast.success("SENHA_ATUALIZADA", {
          description: "Senha redefinida com sucesso!"
        })
        setIsSuccess(true)
        
        // Redirecionar para login após 3 segundos
        setTimeout(() => {
          router.push('/')
        }, 3000)
      }
    } catch (error: unknown) {
      toast.error("FALHA_SISTEMA", {
        description: "Erro inesperado ao redefinir senha"
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isValidSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <MatrixRain />
        <div className="w-full max-w-md relative z-10">
          <div className="text-center">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50 mx-auto mb-4"></div>
            <p className="text-green-400 font-mono">Verificando sessão...</p>
          </div>
        </div>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <MatrixRain />
        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image
                src="/isotipo.svg"
                alt="HoodX Logo"
                width={80}
                height={80}
              />
            </div>
            <h1 className="text-4xl font-bold font-mono text-green-400 mb-2">
              HOODX<span className="text-green-500">.AI</span>
            </h1>
            <p className="text-gray-500 font-mono text-sm">
              // A matemática oculta da sorte
            </p>
          </div>

          <Card className="border-green-500/30 bg-black/80 backdrop-blur-lg shadow-2xl shadow-green-500/10">
            <CardHeader className="text-center">
              <CardTitle className="text-xl font-mono text-green-400 flex items-center justify-center gap-2">
                <CheckCircle className="h-5 w-5" />
                SENHA_REDEFINIDA
              </CardTitle>
              <CardDescription className="text-gray-400 font-mono text-xs">
                // Senha atualizada com sucesso
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-400 font-mono text-sm">
                  Sua senha foi redefinida com sucesso!
                </p>
                <p className="text-gray-400 font-mono text-xs mt-2">
                  Redirecionando para login em 3 segundos...
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <MatrixRain />
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/isotipo.svg"
              alt="HoodX Logo"
              width={80}
              height={80}
            />
          </div>
          <h1 className="text-4xl font-bold font-mono text-green-400 mb-2">
            HOODX<span className="text-green-500">.AI</span>
          </h1>
          <p className="text-gray-500 font-mono text-sm">
            // A matemática oculta da sorte
          </p>
        </div>

        <Card className="border-green-500/30 bg-black/80 backdrop-blur-lg shadow-2xl shadow-green-500/10">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-mono text-green-400 flex items-center justify-center gap-2">
              <Shield className="h-5 w-5" />
              REDEFINIR_SENHA
            </CardTitle>
            <CardDescription className="text-gray-400 font-mono text-xs">
              // Digite sua nova senha
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-green-400 font-mono text-sm">
                  Nova Senha
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-black/50 border-green-500/30 text-green-400 font-mono focus:border-green-500 pr-10"
                    placeholder="Digite sua nova senha"
                    required
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-green-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-green-400" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-green-400 font-mono text-sm">
                  Confirmar Senha
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-black/50 border-green-500/30 text-green-400 font-mono focus:border-green-500 pr-10"
                    placeholder="Confirme sua nova senha"
                    required
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-green-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-green-400" />
                    )}
                  </Button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-green-600 hover:bg-green-700 text-black font-mono font-bold"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    PROCESSANDO...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    REDEFINIR_SENHA
                  </div>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <MatrixRain />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50 mx-auto mb-4"></div>
          <p className="text-green-400 font-mono">Carregando...</p>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordContent />
    </Suspense>
  )
} 