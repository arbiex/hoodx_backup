import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Obtém a URL base do site automaticamente
 * Funciona tanto em desenvolvimento quanto em produção (Vercel/Fly.io)
 */
export function getBaseUrl(): string {
  // Se estiver no browser, SEMPRE usar window.location.origin
  // Isso garante que as requisições sejam sempre para o domínio atual
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  // 🚀 NOVO: Detectar ambiente Fly.io para requisições internas da API
  if (process.env.FLY_APP_NAME || process.env.FLY_REGION) {
    return 'https://hoodx.fly.dev';
  }
  
  // Se tiver NEXT_PUBLIC_APP_URL definida, usar ela (apenas para links públicos)
  if (process.env.NEXT_PUBLIC_APP_URL && !process.env.FLY_APP_NAME) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  // Fallback para produção
  return 'https://roleta.bot';
}

/**
 * Obtém a URL pública do site (para links de indicação, etc.)
 */
export function getPublicUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://roleta.bot';
}

/**
 * Obtém um cache buster único baseado na versão do site
 */
export function getCacheBuster(): string {
  const cacheBustEnv = process.env.NEXT_PUBLIC_CACHE_BUST || '0';
  return `v${cacheBustEnv}-${Date.now()}`;
}

/**
 * Adiciona parâmetros de cache busting para forçar novas requisições
 */
export function addCacheBusting(url: string): string {
  const timestamp = Date.now();
  const cacheBustEnv = process.env.NEXT_PUBLIC_CACHE_BUST || '0';
  const cacheBuster = `v=${timestamp}&cb=${cacheBustEnv}`;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${cacheBuster}`;
}

/**
 * Função para fazer fetch com cache busting automático
 */
export async function fetchWithCacheBusting(url: string, options?: RequestInit): Promise<Response> {
  const bustedUrl = addCacheBusting(url);
  return fetch(bustedUrl, {
    ...options,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...options?.headers,
    },
  });
}
