import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { purgeDemoData, seedDatabase } from '@/lib/seed-data';

function makeCode(prefix: string, name: string): string {
  const clean = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 14);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${clean || 'ITEM'}-${rand}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'ADD_COMPANY') {
      const name = String(body.name || '').trim();
      if (!name) throw new Error('Company name is required.');
      const code = (body.code ? String(body.code).trim().toUpperCase() : makeCode('CMP', name));
      const prefix = (
        body.coilPrefix
          ? String(body.coilPrefix).trim().toUpperCase()
          : name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'CMP'
      );
      const res = await query<{ id: number }>(
        `INSERT INTO companies (code, name, legal_name, coil_prefix, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE
         RETURNING id`,
        [code, name, body.legalName?.trim() || name, prefix]
      );
      return NextResponse.json({ ok: true, createdId: res.rows[0]?.id });
    }

    if (action === 'ADD_SUPPLIER') {
      const name = String(body.name || '').trim();
      if (!name) throw new Error('Supplier / Vendor name is required.');
      const code = body.code ? String(body.code).trim().toUpperCase() : makeCode('SUP', name);
      const city = body.city ? String(body.city).trim() : 'India';
      const res = await query<{ id: number }>(
        `INSERT INTO suppliers (code, name, city, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city, is_active = TRUE
         RETURNING id`,
        [code, name, city]
      );
      return NextResponse.json({ ok: true, createdId: res.rows[0]?.id });
    }

    if (action === 'ADD_LOCATION') {
      const name = String(body.name || '').trim();
      if (!name) throw new Error('Storage location name is required.');
      let plantId = Number(body.plantId || 0);
      if (!plantId) {
        const pRes = await query<{ id: number }>('SELECT id FROM plants WHERE is_active = TRUE ORDER BY id LIMIT 1');
        plantId = pRes.rows[0]?.id || 1;
      }
      const code = body.code ? String(body.code).trim().toUpperCase() : makeCode('LOC', name);
      const locationType = body.locationType || 'RAW_ROD_YARD';
      const res = await query<{ id: number }>(
        `INSERT INTO storage_locations (plant_id, code, name, location_type, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE
         RETURNING id`,
        [plantId, code, name, locationType]
      );
      return NextResponse.json({ ok: true, createdId: res.rows[0]?.id });
    }

    if (action === 'ADD_DIAMETER') {
      const mm = Number(body.diameterMm);
      if (!mm || mm <= 0) throw new Error('Valid positive diameter in mm is required.');
      const label = body.label?.trim() || `${mm.toFixed(2)} mm Wire / Rod`;
      const category = body.category || (mm >= 5 ? 'RAW_ROD' : mm >= 1.2 ? 'RBD_MEDIUM' : 'FINE_WIRE');
      const res = await query<{ id: number }>(
        `INSERT INTO copper_diameters (diameter_mm, label, swg_awg_ref, category, standard_tolerance_mm, verification_status, notes, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         ON CONFLICT (diameter_mm) DO UPDATE SET label = EXCLUDED.label, is_active = TRUE
         RETURNING id`,
        [
          mm,
          label,
          body.swgAwgRef?.trim() || null,
          category,
          Number(body.standardToleranceMm || 0.01),
          body.verificationStatus || 'VERIFIED',
          body.notes?.trim() || null,
        ]
      );
      return NextResponse.json({ ok: true, createdId: res.rows[0]?.id });
    }

    if (action === 'ADD_MATERIAL_CATEGORY') {
      const name = String(body.name || '').trim();
      if (!name) throw new Error('Material category name is required.');
      const code = body.code ? String(body.code).trim().toUpperCase() : makeCode('MAT', name);
      const gradeSpec = body.gradeSpec?.trim() || name;
      const res = await query<{ id: number }>(
        `INSERT INTO material_categories (code, name, grade_spec, description, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE
         RETURNING id`,
        [code, name, gradeSpec, body.description?.trim() || name]
      );
      return NextResponse.json({ ok: true, createdId: res.rows[0]?.id });
    }

    if (action === 'REMOVE_MASTER_ITEM') {
      const entityType = String(body.entityType || '').toUpperCase();
      const id = Number(body.id);
      if (!id) throw new Error('Item ID is required to remove an option.');

      const tableMap: Record<string, string> = {
        COMPANY: 'companies',
        SUPPLIER: 'suppliers',
        LOCATION: 'storage_locations',
        DIAMETER: 'copper_diameters',
        MATERIAL_CATEGORY: 'material_categories',
        MACHINE: 'machines',
        BOBBIN: 'bobbin_types',
        ROUTE: 'allowed_process_routes',
      };

      const tableName = tableMap[entityType];
      if (!tableName) {
        throw new Error(`Unsupported master entity type: ${entityType}`);
      }

      try {
        if (entityType === 'DIAMETER') {
          await query(
            `DELETE FROM allowed_process_routes WHERE input_diameter_id = $1 OR output_diameter_id = $1`,
            [id]
          );
        }
        await query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
      } catch {
        // If referenced by existing invoices/coils/plants, soft-deactivate so it disappears from dropdowns
        await query(`UPDATE ${tableName} SET is_active = FALSE WHERE id = $1`, [id]);
      }

      return NextResponse.json({ ok: true, removedId: id });
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
        `INSERT INTO bobbin_types (code, name, material, standard_tare_weight_kg, max_net_capacity_kg, verification_status, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           material = EXCLUDED.material,
           standard_tare_weight_kg = EXCLUDED.standard_tare_weight_kg,
           max_net_capacity_kg = EXCLUDED.max_net_capacity_kg,
           is_active = TRUE`,
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
