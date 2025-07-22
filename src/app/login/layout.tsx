import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Login - ROLETA.BOT',
  description: 'Entre na sua conta ROLETA.BOT para acessar o sistema de automação para cassinos',
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
} 