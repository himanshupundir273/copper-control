import { NextRequest, NextResponse } from 'next/server';
import { buildTraceabilityGraph } from '@/lib/services/traceability-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || undefined;
    const graph = await buildTraceabilityGraph(q, false);
    return NextResponse.json({ ok: true, graph });
  } catch (err: any) {
    console.error('GET /api/traceability error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Traceability query failed' },
      { status: 500 }
    );
  }
}

