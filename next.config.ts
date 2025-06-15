import type { NextConfig } from "next";

// Verificar variáveis de ambiente obrigatórias
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'
];

// Variáveis recomendadas (não obrigatórias mas importantes)
const recommendedEnvVars = [
  'NEXT_PUBLIC_APP_URL'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
const missingRecommendedVars = recommendedEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0 && process.env.NODE_ENV !== 'development') {
  console.warn('⚠️  Missing environment variables:', missingEnvVars.join(', '));
  console.warn('🔧 Please configure these variables in your Vercel dashboard or .env.local file');
}

if (missingRecommendedVars.length > 0) {
  console.warn('💡 Recommended environment variables:', missingRecommendedVars.join(', '));
  console.warn('ℹ️  NEXT_PUBLIC_APP_URL should be set to your domain (e.g., https://hoodx.ai)');
}

const nextConfig: NextConfig = {
  // Otimizações de performance
  experimental: {
    optimizePackageImports: ['lucide-react'],
    webpackBuildWorker: true,
  },
  
  // Compressão e cache
  compress: true,
  poweredByHeader: false,
  
  // Otimizar imagens
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Permitir URLs de dados para QR codes
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  
  // Build otimizado - swcMinify is now enabled by default in Next.js 15
  
  // Headers de performance
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=86400' },
        ],
      },
    ]
  },

  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    // Ignorar linting nos arquivos antigos
    ignoreDuringBuilds: false,
    dirs: ['src'], // Apenas lintar o diretório src
  },
  // Ignorar arquivos específicos durante o build
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/old-archives/**', '**/node_modules']
    };
    return config;
  },
};

export default nextConfig;
