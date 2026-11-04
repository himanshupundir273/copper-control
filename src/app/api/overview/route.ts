import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getDashboardData } from '@/lib/services/analytics-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeDemoParam = searchParams.get('includeDemo');

    const settingsRes = await query<{ key: string; value: string; description: string }>(
      'SELECT key, value, description FROM system_settings ORDER BY key'
    );
    const settingsMap = Object.fromEntries(settingsRes.rows.map((r) => [r.key, r.value]));
    const includeDemo =
      includeDemoParam !== null
        ? includeDemoParam !== 'false'
        : settingsMap.SHOW_DEMO_DATA !== 'false';

    const demoFilterCoil = includeDemo ? '' : 'WHERE c.is_demo = FALSE';
    const demoFilterInv = includeDemo ? '' : 'WHERE inv.is_demo = FALSE';
    const demoFilterBatch = includeDemo ? '' : 'WHERE b.is_demo = FALSE';

    const [
      dashboard,
      companies,
      plants,
      locations,
      diameters,
      processTypes,
      machines,
      routes,
      bobbins,
      materialCategories,
      cableCategories,
      suppliers,
      coils,
      invoices,
      batches,
      cableIssues,
      intercompanyTransfers,
      scrapLots,
    ] = await Promise.all([
      getDashboardData(includeDemo),
      query('SELECT * FROM companies ORDER BY id'),
      query(
        `SELECT p.*, c.name AS operated_by_company_name
         FROM plants p JOIN companies c ON c.id = p.operated_by_company_id ORDER BY p.id`
      ),
      query(
        `SELECT l.*, p.name AS plant_name, p.code AS plant_code
         FROM storage_locations l JOIN plants p ON p.id = l.plant_id ORDER BY l.id`
      ),
      query('SELECT * FROM copper_diameters ORDER BY diameter_mm DESC'),
      query('SELECT * FROM process_types ORDER BY sequence_hint ASC, id ASC'),
      query(
        `SELECT m.*, p.name AS plant_name, pt.code AS process_code, pt.name AS process_name
         FROM machines m
         JOIN plants p ON p.id = m.plant_id
         JOIN process_types pt ON pt.id = m.process_type_id
         ORDER BY m.id`
      ),
      query(
        `SELECT r.*, pt.code AS process_code, pt.name AS process_name,
                din.diameter_mm::text AS input_mm, dout.diameter_mm::text AS output_mm
         FROM allowed_process_routes r
         JOIN process_types pt ON pt.id = r.process_type_id
         JOIN copper_diameters din ON din.id = r.input_diameter_id
         JOIN copper_diameters dout ON dout.id = r.output_diameter_id
         ORDER BY pt.sequence_hint ASC, din.diameter_mm DESC, dout.diameter_mm DESC`
      ),
      query('SELECT * FROM bobbin_types ORDER BY id'),
      query('SELECT * FROM material_categories ORDER BY id'),
      query(
        `SELECT cc.*, c.name AS primary_company_name
         FROM cable_categories cc LEFT JOIN companies c ON c.id = cc.primary_company_id ORDER BY cc.id`
      ),
      query('SELECT * FROM suppliers ORDER BY id'),
      query(
        `SELECT c.*,
                comp.name AS owner_company_name, comp.code AS owner_company_code,
                p.name AS plant_name, p.code AS plant_code,
                loc.name AS location_name, loc.code AS location_code,
                d.diameter_mm::text AS diameter_mm, d.label AS diameter_label,
                inv.invoice_number AS source_invoice_number,
                b.batch_number AS source_batch_number
         FROM copper_coils c
         JOIN companies comp ON comp.id = c.owner_company_id
         JOIN plants p ON p.id = c.plant_id
         JOIN storage_locations loc ON loc.id = c.current_location_id
         JOIN copper_diameters d ON d.id = c.diameter_id
         LEFT JOIN purchase_invoices inv ON inv.id = c.source_invoice_id
         LEFT JOIN production_batches b ON b.id = c.source_batch_id
         ${demoFilterCoil}
         ORDER BY c.id DESC`
      ),
      query(
        `SELECT inv.*,
                comp.name AS company_name, comp.code AS company_code,
                s.name AS supplier_name,
                d.diameter_mm::text AS diameter_mm,
                loc.name AS location_name
         FROM purchase_invoices inv
         JOIN companies comp ON comp.id = inv.purchasing_company_id
         JOIN suppliers s ON s.id = inv.supplier_id
         JOIN copper_diameters d ON d.id = inv.input_diameter_id
         JOIN storage_locations loc ON loc.id = inv.storage_location_id
         ${demoFilterInv}
         ORDER BY inv.receipt_date DESC, inv.id DESC`
      ),
      query(
        `SELECT b.*,
                comp.name AS owner_company_name, comp.code AS owner_company_code,
                p.name AS plant_name,
                pt.code AS process_code, pt.name AS process_name,
                m.code AS machine_code, m.name AS machine_name,
                din.diameter_mm::text AS input_mm,
                dout.diameter_mm::text AS output_mm
         FROM production_batches b
         JOIN companies comp ON comp.id = b.owner_company_id
         JOIN plants p ON p.id = b.plant_id
         JOIN process_types pt ON pt.id = b.process_type_id
         JOIN machines m ON m.id = b.machine_id
         JOIN copper_diameters din ON din.id = b.input_diameter_id
         JOIN copper_diameters dout ON dout.id = b.output_diameter_id
         ${demoFilterBatch}
         ORDER BY b.production_date DESC, b.id DESC`
      ),
      query(
        `SELECT ci.*,
                comp.name AS owner_company_name,
                p.name AS plant_name,
                cc.name AS cable_category_name, cc.code AS cable_category_code,
                d.diameter_mm::text AS conductor_mm
         FROM cable_production_issues ci
         JOIN companies comp ON comp.id = ci.owner_company_id
         JOIN plants p ON p.id = ci.plant_id
         JOIN cable_categories cc ON cc.id = ci.cable_category_id
         JOIN copper_diameters d ON d.id = ci.conductor_diameter_id
         ${includeDemo ? '' : 'WHERE ci.is_demo = FALSE'}
         ORDER BY ci.issue_date DESC, ci.id DESC`
      ),
      query(
        `SELECT ic.*,
                cfrom.name AS from_company_name,
                cto.name AS to_company_name,
                c.coil_code,
                d.diameter_mm::text AS diameter_mm,
                p.name AS plant_name
         FROM intercompany_transfers ic
         JOIN companies cfrom ON cfrom.id = ic.from_company_id
         JOIN companies cto ON cto.id = ic.to_company_id
         JOIN copper_coils c ON c.id = ic.coil_id
         JOIN copper_diameters d ON d.id = c.diameter_id
         JOIN plants p ON p.id = c.plant_id
         ${includeDemo ? '' : 'WHERE ic.is_demo = FALSE'}
         ORDER BY ic.transfer_date DESC, ic.id DESC`
      ),
      query(
        `SELECT s.*, b.batch_number, comp.name AS owner_company_name, loc.name AS location_name
         FROM scrap_lots s
         JOIN production_batches b ON b.id = s.batch_id
         JOIN companies comp ON comp.id = s.owner_company_id
         JOIN storage_locations loc ON loc.id = s.storage_location_id
         ${includeDemo ? '' : 'WHERE s.is_demo = FALSE'}
         ORDER BY s.id DESC`
      ),
    ]);

    return NextResponse.json({
      includeDemo,
      settings: settingsRes.rows,
      dashboard,
      masters: {
        companies: companies.rows,
        plants: plants.rows,
        locations: locations.rows,
        diameters: diameters.rows,
        processTypes: processTypes.rows,
        machines: machines.rows,
        routes: routes.rows,
        bobbins: bobbins.rows,
        materialCategories: materialCategories.rows,
        cableCategories: cableCategories.rows,
        suppliers: suppliers.rows,
      },
      coils: coils.rows,
      invoices: invoices.rows,
      batches: batches.rows,
      cableIssues: cableIssues.rows,
      intercompanyTransfers: intercompanyTransfers.rows,
      scrapLots: scrapLots.rows,
    });
  } catch (err: any) {
    console.error('GET /api/overview error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to load system overview' },
      { status: 500 }
    );
  }
}

