import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Test Blaze Fix API - GET working',
    timestamp: new Date().toISOString(),
    path: request.url
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Simular a estrutura da resposta original
    if (body.action === 'get-connection-status') {
      return NextResponse.json({
        success: true,
        data: {
          connected: false,
          lastUpdate: Date.now(),
          resultsCount: 0,
          operationActive: false
        }
      });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Test Blaze Fix API - POST working',
      receivedData: body,
      timestamp: new Date().toISOString(),
      path: request.url
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Error parsing request',
      timestamp: new Date().toISOString(),
      path: request.url
    });
  }
} 