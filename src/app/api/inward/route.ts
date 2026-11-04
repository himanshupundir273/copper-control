import { NextRequest, NextResponse } from 'next/server';
import { createInwardReceipt } from '@/lib/services/inward-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await createInwardReceipt(body);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error('POST /api/inward error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to create inward purchase receipt' },
      { status: 400 }
    );
  }
}

