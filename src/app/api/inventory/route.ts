import { NextRequest, NextResponse } from 'next/server';
import {
  createCableProductionIssue,
  executeIntercompanyTransfer,
  reserveOrReleaseCoilWeight,
  transferCoilLocation,
} from '@/lib/services/inventory-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'LOCATION_TRANSFER') {
      const result = await transferCoilLocation(body);
      return NextResponse.json({ ok: true, result });
    }

    if (action === 'RESERVE_OR_RELEASE') {
      const result = await reserveOrReleaseCoilWeight({
        coilId: Number(body.coilId),
        action: body.subAction,
        weightKg: body.weightKg,
        referenceNumber: body.referenceNumber,
        notes: body.notes,
        actor: body.actor,
      });
      return NextResponse.json({ ok: true, result });
    }

    if (action === 'INTERCOMPANY_TRANSFER') {
      const result = await executeIntercompanyTransfer(body);
      return NextResponse.json({ ok: true, result });
    }

    if (action === 'CABLE_ISSUE') {
      const result = await createCableProductionIssue(body);
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: `Unknown inventory action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('POST /api/inventory error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Inventory operation failed' },
      { status: 400 }
    );
  }
}

