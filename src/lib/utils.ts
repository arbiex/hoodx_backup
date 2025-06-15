import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Obtém a URL base do site automaticamente
 * Funciona tanto em desenvolvimento quanto em produção (Vercel)
 */
export function getBaseUrl(): string {
  // Se estiver no browser, usar window.location
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  // Se tiver NEXT_PUBLIC_APP_URL definida, usar ela
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  // Se estiver na Vercel, usar VERCEL_URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Fallback para desenvolvimento local
  return 'http://localhost:3000';
}
