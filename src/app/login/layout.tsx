import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Login - HOODX.AI',
  description: 'Entre na sua conta HOODX.AI para acessar o sistema de automação para cassinos',
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
} 