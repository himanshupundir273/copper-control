import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { purgeDemoData, seedDatabase } from '@/lib/seed-data';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'ADD_DIAMETER') {
      await query(
        `INSERT INTO copper_diameters (diameter_mm, label, swg_awg_ref, category, standard_tolerance_mm, verification_status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          Number(body.diameterMm),
          body.label.trim(),
          body.swgAwgRef?.trim() || null,
          body.category || 'RBD_MEDIUM',
          Number(body.standardToleranceMm || 0.01),
          body.verificationStatus || 'PENDING_CONFIRMATION',
          body.notes?.trim() || null,
        ]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'TOGGLE_DIAMETER_VERIFICATION') {
      await query(
        `UPDATE copper_diameters SET verification_status = $1 WHERE id = $2`,
        [body.verificationStatus, Number(body.id)]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'ADD_ROUTE') {
      await query(
        `INSERT INTO allowed_process_routes (
          process_type_id, input_diameter_id, output_diameter_id,
          standard_wastage_pct, standard_process_loss_pct,
          standard_processing_cost_per_kg, scrap_recovery_credit_pct,
          verification_status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          Number(body.processTypeId),
          Number(body.inputDiameterId),
          Number(body.outputDiameterId),
          Number(body.standardWastagePct || 0.75),
          Number(body.standardProcessLossPct || 0.25),
          Number(body.standardProcessingCostPerKg || 12),
          Number(body.scrapRecoveryCreditPct || 92),
          body.verificationStatus || 'PENDING_CONFIRMATION',
          body.notes?.trim() || null,
        ]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'TOGGLE_ROUTE_VERIFICATION') {
      await query(
        `UPDATE allowed_process_routes SET verification_status = $1 WHERE id = $2`,
        [body.verificationStatus, Number(body.id)]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'ADD_MACHINE') {
      await query(
        `INSERT INTO machines (
          plant_id, process_type_id, code, name,
          min_input_mm, max_input_mm, min_output_mm, max_output_mm,
          rated_capacity_kg_per_shift, verification_status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          Number(body.plantId),
          Number(body.processTypeId),
          body.code.trim().toUpperCase(),
          body.name.trim(),
          Number(body.minInputMm || 1.0),
          Number(body.maxInputMm || 8.0),
          Number(body.minOutputMm || 0.5),
          Number(body.maxOutputMm || 2.5),
          Number(body.ratedCapacityKgPerShift || 3000),
          body.verificationStatus || 'PENDING_CONFIRMATION',
          body.notes?.trim() || null,
        ]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'ADD_BOBBIN') {
      await query(
        `INSERT INTO bobbin_types (code, name, material, standard_tare_weight_kg, max_net_capacity_kg, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          body.code.trim().toUpperCase(),
          body.name.trim(),
          body.material || 'PRESSED_STEEL',
          Number(body.standardTareWeightKg),
          Number(body.maxNetCapacityKg || 500),
          body.verificationStatus || 'VERIFIED',
        ]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'ADD_LOCATION') {
      await query(
        `INSERT INTO storage_locations (plant_id, code, name, location_type)
         VALUES ($1, $2, $3, $4)`,
        [
          Number(body.plantId),
          body.code.trim().toUpperCase(),
          body.name.trim(),
          body.locationType || 'RBD_FLOOR',
        ]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'UPDATE_SETTING') {
      await query(
        `UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = $2`,
        [String(body.value), body.key]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'PURGE_DEMO_DATA') {
      const res = await purgeDemoData();
      return NextResponse.json({ ok: true, result: res });
    }

    if (action === 'RESEED_DEMO_DATA') {
      await seedDatabase({ includeDemoTransactions: true });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: `Unsupported master action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('POST /api/masters error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Master update failed' },
      { status: 400 }
    );
  }
}

