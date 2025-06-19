import { NextResponse } from 'next/server';

export async function GET() {
  console.log('Hello from API route');
  return NextResponse.json({ message: 'Hello from API' });
}

export async function POST(request: Request) {
  const data = await request.json();
  console.log('Received data:', data);
  return NextResponse.json({ received: data });
}