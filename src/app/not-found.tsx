import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-xl mb-8">Página não encontrada</p>
      <Link href="/" className="text-blue-400 hover:text-blue-300">
        Voltar para o início
      </Link>
    </div>
  )
} 