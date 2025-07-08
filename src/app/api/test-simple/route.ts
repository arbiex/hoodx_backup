import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Test API GET working',
    timestamp: new Date().toISOString(),
    path: request.url
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json({
      success: true,
      message: 'Test API POST working',
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