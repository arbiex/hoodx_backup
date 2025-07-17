import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Verificar se o sistema está funcionando
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      region: process.env.FLY_REGION || 'unknown',
      instance: process.env.FLY_ALLOC_ID || 'unknown',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || 'unknown'
    };

    return NextResponse.json(healthStatus, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 