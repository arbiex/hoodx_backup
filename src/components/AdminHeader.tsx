'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  Home
} from 'lucide-react';

interface AdminHeaderProps {
  currentUser?: {
    email?: string;
    id?: string;
  };
  additionalActions?: React.ReactNode;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminHeader({ currentUser, additionalActions }: AdminHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navigationItems = [
    {
      id: 'matrixx',
      label: 'Painel',
      href: '/matrixx',
      description: 'Gerenciamento de usuários e sistema'
    },
    {
      id: 'bots',
      label: 'Bots',
      href: '/bots',
      description: 'Monitoramento de bots em tempo real'
    },
    {
      id: 'agents',
      label: 'Agents',
      href: '/agents',
      description: 'Gerenciamento de agentes inteligentes'
    },
    {
      id: 'tokens',
      label: 'Tokens',
      href: '/tokens',
      description: 'Relatório de compras de tokens FXA'
    }
  ];

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };



  return (
    <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo e Navegação */}
        <div className="flex items-center gap-6">
          {/* Logo Admin */}
          <Link href="/matrixx" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Shield className="h-5 w-5 text-purple-400" />
            </div>
            <span className="text-lg font-mono text-white">ADMIN_PANEL</span>
          </Link>

          {/* Navegação */}
          <nav className="flex items-center gap-1">
            {navigationItems.map((item) => {
              const active = isActive(item.href);
              
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                  title={item.description}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Ações e Informações do Usuário */}
        <div className="flex items-center gap-4">
          {/* Ações Adicionais */}
          {additionalActions}

          {/* Link para voltar ao app principal */}
          <Button
            asChild
            variant="outline"
            size="sm"
            className="font-mono border-gray-600 text-gray-300 hover:bg-gray-700"
          >
            <Link href="/dashboard">
              <Home className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
} 