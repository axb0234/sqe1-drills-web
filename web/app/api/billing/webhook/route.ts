import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    await req.text();
  } catch {}
  return NextResponse.json({ ok: true });
}