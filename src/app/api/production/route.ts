import { NextRequest, NextResponse } from 'next/server';
import {
  createOrPostProductionBatch,
  reverseProductionBatch,
} from '@/lib/services/production-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === 'REVERSE') {
      const result = await reverseProductionBatch({
        batchId: Number(body.batchId),
        reason: body.reason,
        actor: body.actor,
      });
      return NextResponse.json({ ok: true, result });
    }

    const result = await createOrPostProductionBatch(body);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error('POST /api/production error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Production operation failed' },
      { status: 400 }
    );
  }
}

