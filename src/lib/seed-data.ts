import { DbClient, withTransaction } from './db';
import { createInwardReceipt } from './services/inward-service';
import { createOrPostProductionBatch } from './services/production-service';
import {
  createCableProductionIssue,
  executeIntercompanyTransfer,
} from './services/inventory-service';

export async function seedDatabase(options: { includeDemoTransactions?: boolean } = {}): Promise<void> {
  const includeDemo = options.includeDemoTransactions ?? true;

  await withTransaction(async (tx: DbClient) => {
    // 1. Seed Legal Companies
    await tx.exec(`
      INSERT INTO companies (code, name, legal_name, gstin, base_currency, coil_prefix) VALUES
        ('ATLANTA', 'Atlanta Tele Cables', 'Atlanta Tele Cables Pvt. Ltd.', '26AABCA1029K1Z5', 'INR', 'ATC'),
        ('NOTOFIRE', 'Notofire', 'Notofire Speciality Cables LLP', '25AADFN4491M1Z2', 'INR', 'NTF'),
        ('VALUECON', 'Valuecon', 'Valuecon Conductors & Wires Pvt. Ltd.', '24AAACV8812B1Z9', 'INR', 'VLC')
      ON CONFLICT (code) DO NOTHING;
    `);

    const compRows = await tx.query<{ id: number; code: string }>('SELECT id, code FROM companies');
    const compMap = Object.fromEntries(compRows.rows.map((r) => [r.code, r.id]));

    // 2. Seed Plants & Storage Locations
    await tx.query(
      `INSERT INTO plants (code, name, operated_by_company_id, city, state) VALUES
        ('PLT-SILVASSA', 'Unit-1 Silvassa RBD & Cable Complex', $1, 'Silvassa', 'Dadra & Nagar Haveli'),
        ('PLT-DAMAN', 'Unit-2 Daman Fine Drawing & CAT6 Plant', $2, 'Daman', 'Daman & Diu'),
        ('PLT-VAPI', 'Unit-3 Vapi Single-Core & Industrial Plant', $3, 'Vapi', 'Gujarat')
       ON CONFLICT (code) DO NOTHING`,
      [compMap.ATLANTA, compMap.NOTOFIRE, compMap.VALUECON]
    );

    const plantRows = await tx.query<{ id: number; code: string }>('SELECT id, code FROM plants');
    const plantMap = Object.fromEntries(plantRows.rows.map((r) => [r.code, r.id]));

    await tx.query(
      `INSERT INTO storage_locations (plant_id, code, name, location_type) VALUES
        ($1, 'SIL-ROD-YARD', 'Silvassa 8mm Rod Inward Yard', 'RAW_ROD_YARD'),
        ($1, 'SIL-RBD-WIP', 'Silvassa RBD Bobbin WIP Bay', 'RBD_FLOOR'),
        ($1, 'SIL-CFN-WIP', 'Silvassa China Fine Spool Bay', 'FINE_WIRE_WIP'),
        ($1, 'SIL-SCRAP-01', 'Silvassa Copper Scrap Vault', 'SCRAP_BAY'),
        ($1, 'SIL-CBL-SHOP', 'Silvassa Railway & Telecom Cable Floor', 'CABLE_SHOP'),
        ($2, 'DMN-ROD-YARD', 'Daman Rod & Intermediate Store', 'RAW_ROD_YARD'),
        ($2, 'DMN-CFN-WIP', 'Daman Fine Wire & CAT6 WIP Bay', 'FINE_WIRE_WIP'),
        ($2, 'DMN-SCRAP-01', 'Daman Scrap Recovery Bay', 'SCRAP_BAY'),
        ($3, 'VAP-RBD-WIP', 'Vapi Hard Copper & Drawing Floor', 'HARD_COPPER_WIP'),
        ($3, 'VAP-CBL-SHOP', 'Vapi Valuecon Single-Core Extrusion Bay', 'CABLE_SHOP')
       ON CONFLICT (code) DO NOTHING`,
      [plantMap['PLT-SILVASSA'], plantMap['PLT-DAMAN'], plantMap['PLT-VAPI']]
    );

    const locRows = await tx.query<{ id: number; code: string }>(
      'SELECT id, code FROM storage_locations'
    );
    const locMap = Object.fromEntries(locRows.rows.map((r) => [r.code, r.id]));

    // 3. Seed Copper Diameters (Module 4) — Explicitly distinguishing verified vs pending confirmation
    await tx.exec(`
      INSERT INTO copper_diameters (diameter_mm, label, swg_awg_ref, category, standard_tolerance_mm, verification_status, notes) VALUES
        (8.0000, '8.00 mm Continuous Cast Rod', '5/16 inch EC Rod', 'RAW_ROD', 0.1500, 'VERIFIED', 'Standard purchased input copper rod diameter across all suppliers'),
        (1.8000, '1.80 mm RBD Drawn Wire', '~15 SWG', 'RBD_MEDIUM', 0.0150, 'VERIFIED', 'Primary RBD output size discussed in plant operations meeting'),
        (1.6000, '1.60 mm RBD Drawn Wire', '16 SWG', 'RBD_MEDIUM', 0.0150, 'VERIFIED', 'Primary RBD output size used for intermediate drawing and railway conductors'),
        (1.4000, '1.40 mm RBD Drawn Wire', '17 SWG', 'RBD_MEDIUM', 0.0120, 'VERIFIED', 'RBD output size used directly or as input for downstream fine drawing'),
        (1.0000, '1.00 mm Drawn Copper Wire', '19 SWG', 'FINE_WIRE', 0.0100, 'PENDING_CONFIRMATION', 'Discussed in meeting; verify whether drawn directly on RBD or via intermediate machine'),
        (0.9000, '0.90 mm Drawn Copper Wire', '20 SWG', 'FINE_WIRE', 0.0100, 'PENDING_CONFIRMATION', 'Discussed in meeting; exact machine route requires plant confirmation'),
        (0.6000, '0.60 mm China Fine Wire', '23 SWG', 'FINE_WIRE', 0.0080, 'VERIFIED', 'Produced on China Fine machine from RBD intermediate wire'),
        (0.5700, '0.57 mm CAT6 Conductor (23 AWG)', '23 AWG CAT6', 'CAT6_CONDUCTOR', 0.0050, 'PENDING_CONFIRMATION', 'CAT6 size discussed in meeting; exact unit/designation (AWG vs mm) awaiting plant confirmation'),
        (0.5100, '0.51 mm CAT6 Conductor (24 AWG)', '24 AWG CAT6', 'CAT6_CONDUCTOR', 0.0050, 'PENDING_CONFIRMATION', 'CAT6 size discussed in meeting; exact unit/designation awaiting plant confirmation')
      ON CONFLICT (diameter_mm) DO NOTHING;
    `);

    const diaRows = await tx.query<{ id: number; diameter_mm: string }>(
      'SELECT id, diameter_mm::text FROM copper_diameters'
    );
    const diaMap = Object.fromEntries(
      diaRows.rows.map((r) => [Number(r.diameter_mm).toFixed(2), r.id])
    );

    // 4. Seed Process Types
    await tx.exec(`
      INSERT INTO process_types (code, name, resulting_stage, sequence_hint, verification_status, description) VALUES
        ('RBD', 'Rod Breakdown (RBD) Drawing', 'RBD_DRAWN', 10, 'VERIFIED', 'Primary breakdown of 8.00 mm copper rod into intermediate/medium wire sizes (1.80, 1.60, 1.40 mm)'),
        ('CHINA_FINE', 'China Fine Wire Drawing', 'CHINA_FINE_DRAWN', 20, 'VERIFIED', 'Secondary fine drawing from RBD wire into fine diameters (e.g. 0.60 mm, CAT6 conductors)'),
        ('HARD_COPPER', 'Hard Copper Drawing Process', 'HARD_COPPER', 25, 'PENDING_CONFIRMATION', 'Unannealed hard-drawn copper route discussed in meeting; annealing bypass parameters pending plant sign-off'),
        ('ANNEALING_TINNING', 'In-Line Annealing / Tinning Stage', 'ANNEALED_WIRE', 30, 'PENDING_CONFIRMATION', 'Optional thermal annealing or tinning stage subject to plant confirmation')
      ON CONFLICT (code) DO NOTHING;
    `);

    const procRows = await tx.query<{ id: number; code: string }>(
      'SELECT id, code FROM process_types'
    );
    const procMap = Object.fromEntries(procRows.rows.map((r) => [r.code, r.id]));

    // 5. Seed Machines
    await tx.query(
      `INSERT INTO machines (plant_id, process_type_id, code, name, min_input_mm, max_input_mm, min_output_mm, max_output_mm, rated_capacity_kg_per_shift, verification_status, notes) VALUES
        ($1, $4, 'RBD-01', 'Niehoff Tandem RBD Line #1 (Silvassa)', 8.0000, 8.0000, 1.2000, 2.5000, 6500.00, 'VERIFIED', 'Primary high-speed RBD line with inline annealer'),
        ($1, $4, 'RBD-02', 'Heavy RBD Line #2 (Silvassa)', 8.0000, 8.0000, 1.4000, 3.0000, 5000.00, 'VERIFIED', 'Secondary RBD line for 1.80 mm and 1.60 mm bobbins'),
        ($1, $5, 'CFN-01', 'China Fine Multi-Wire Drawer #1 (Silvassa)', 1.2000, 2.0000, 0.4000, 1.0000, 1800.00, 'VERIFIED', 'Fine wire drawing machine for 0.60 mm and 0.90 mm spools'),
        ($2, $5, 'CFN-02', 'China Fine High-Speed Drawer #2 (Daman)', 1.2000, 1.8000, 0.4500, 0.9000, 2000.00, 'PENDING_CONFIRMATION', 'Configured for CAT6 conductor drawing; die schedule pending confirmation'),
        ($3, $6, 'HRD-01', 'Hard Copper Bull-Block & Drawer (Vapi)', 1.6000, 8.0000, 1.0000, 2.5000, 3200.00, 'PENDING_CONFIRMATION', 'Hard copper processing line for Valuecon single-core conductors')
       ON CONFLICT (code) DO NOTHING`,
      [
        plantMap['PLT-SILVASSA'],
        plantMap['PLT-DAMAN'],
        plantMap['PLT-VAPI'],
        procMap.RBD,
        procMap.CHINA_FINE,
        procMap.HARD_COPPER,
      ]
    );

    const machRows = await tx.query<{ id: number; code: string }>('SELECT id, code FROM machines');
    const machMap = Object.fromEntries(machRows.rows.map((r) => [r.code, r.id]));

    // 6. Seed Allowed Process Routes (Configurable Input Ø -> Output Ø combinations)
    const routesToInsert = [
      [procMap.RBD, diaMap['8.00'], diaMap['1.80'], 0.65, 0.2, 11.5, 93.0, 'VERIFIED', 'Standard 8.00 mm rod to 1.80 mm RBD route'],
      [procMap.RBD, diaMap['8.00'], diaMap['1.60'], 0.72, 0.22, 12.0, 93.0, 'VERIFIED', 'Standard 8.00 mm rod to 1.60 mm RBD route'],
      [procMap.RBD, diaMap['8.00'], diaMap['1.40'], 0.80, 0.25, 13.0, 92.5, 'VERIFIED', 'Standard 8.00 mm rod to 1.40 mm RBD route'],
      [procMap.RBD, diaMap['8.00'], diaMap['1.00'], 1.10, 0.35, 15.5, 92.0, 'PENDING_CONFIRMATION', 'Direct 8.00 mm to 1.00 mm on RBD — requires plant confirmation'],
      [procMap.CHINA_FINE, diaMap['1.80'], diaMap['1.00'], 0.55, 0.18, 16.0, 91.0, 'VERIFIED', '1.80 mm RBD wire to 1.00 mm on China Fine machine'],
      [procMap.CHINA_FINE, diaMap['1.80'], diaMap['0.90'], 0.60, 0.20, 17.5, 91.0, 'PENDING_CONFIRMATION', '1.80 mm RBD wire to 0.90 mm on China Fine — pending confirmation'],
      [procMap.CHINA_FINE, diaMap['1.60'], diaMap['0.60'], 0.75, 0.25, 22.0, 90.0, 'VERIFIED', '1.60 mm RBD wire to 0.60 mm fine wire on China Fine'],
      [procMap.CHINA_FINE, diaMap['1.40'], diaMap['0.60'], 0.70, 0.22, 21.0, 90.0, 'VERIFIED', '1.40 mm RBD wire to 0.60 mm fine wire on China Fine'],
      [procMap.CHINA_FINE, diaMap['1.40'], diaMap['0.57'], 0.80, 0.25, 24.0, 90.0, 'PENDING_CONFIRMATION', 'CAT6 23 AWG (0.57 mm) from 1.40 mm RBD — pending plant verification'],
      [procMap.CHINA_FINE, diaMap['1.40'], diaMap['0.51'], 0.85, 0.28, 25.5, 90.0, 'PENDING_CONFIRMATION', 'CAT6 24 AWG (0.51 mm) from 1.40 mm RBD — pending plant verification'],
      [procMap.HARD_COPPER, diaMap['8.00'], diaMap['1.80'], 0.60, 0.18, 10.5, 93.5, 'PENDING_CONFIRMATION', 'Hard copper unannealed 8.00 mm to 1.80 mm route'],
      [procMap.HARD_COPPER, diaMap['1.80'], diaMap['1.00'], 0.50, 0.15, 14.0, 92.0, 'PENDING_CONFIRMATION', 'Hard copper secondary draw 1.80 mm to 1.00 mm'],
    ];

    for (const r of routesToInsert) {
      await tx.query(
        `INSERT INTO allowed_process_routes (
          process_type_id, input_diameter_id, output_diameter_id,
          standard_wastage_pct, standard_process_loss_pct,
          standard_processing_cost_per_kg, scrap_recovery_credit_pct,
          verification_status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (process_type_id, input_diameter_id, output_diameter_id) DO NOTHING`,
        r
      );
    }

    // 7. Seed Bobbin Types & Tare Weights
    await tx.exec(`
      INSERT INTO bobbin_types (code, name, material, standard_tare_weight_kg, max_net_capacity_kg, verification_status) VALUES
        ('BOB-DIN630', 'DIN 630 Heavy Steel RBD Bobbin', 'PRESSED_STEEL', 48.5000, 650.0000, 'VERIFIED'),
        ('BOB-DIN500', 'DIN 500 Medium Steel Bobbin', 'PRESSED_STEEL', 32.0000, 350.0000, 'VERIFIED'),
        ('SPL-CFN250', 'China Fine ABS Spool 250', 'HIGH_IMPACT_ABS', 2.4000, 45.0000, 'VERIFIED'),
        ('BKT-COIL800', 'Stem-Pack Basket Carrier 800', 'TUBULAR_STEEL', 65.0000, 1200.0000, 'PENDING_CONFIRMATION')
      ON CONFLICT (code) DO NOTHING;
    `);

    const bobRows = await tx.query<{ id: number; code: string }>(
      'SELECT id, code FROM bobbin_types'
    );
    const bobMap = Object.fromEntries(bobRows.rows.map((r) => [r.code, r.id]));

    // 8. Seed Material Categories & Cable Categories
    await tx.exec(`
      INSERT INTO material_categories (code, name, grade_spec, min_conductivity_iacs, description) VALUES
        ('CU-ETP-9999', 'Electrolytic Tough Pitch (ETP) Copper Rod', 'IS 12444 / ASTM B49 C11000 (99.99% Cu)', 101.00, 'High-conductivity electrolytic grade copper rod for telecom, railway & LAN cables'),
        ('CU-OFC-99995', 'Oxygen-Free Electronic (OFC) Copper Rod', 'ASTM B49 C10200 (99.995% Cu)', 101.50, 'Specialty oxygen-free copper rod for high-frequency data cables'),
        ('CU-CC-STD', 'Standard Continuous Cast Copper Rod', 'IS 12444 Grade 2', 100.00, 'General industrial building wire grade')
      ON CONFLICT (code) DO NOTHING;
    `);

    const matRows = await tx.query<{ id: number; code: string }>(
      'SELECT id, code FROM material_categories'
    );
    const matMap = Object.fromEntries(matRows.rows.map((r) => [r.code, r.id]));

    await tx.query(
      `INSERT INTO cable_categories (code, name, primary_company_id, typical_conductor_sizes, allowed_issue_modes, verification_status, notes) VALUES
        ('RAILWAY_SIGNAL', 'Railway Signalling & Quad Cables (RDSO)', $1, '1.80 mm, 1.60 mm, 1.40 mm', 'BOTH', 'PENDING_CONFIRMATION', 'Strict RDSO batch traceability required; shop-floor issuance method (coil scan vs weight issue) pending confirmation'),
        ('CAT6_LAN', 'CAT6 / Structured Data LAN Cables', $2, '0.57 mm (23 AWG), 0.51 mm (24 AWG), 0.60 mm', 'BOTH', 'PENDING_CONFIRMATION', 'High-speed pairing extrusion; exact conductor gauge and spool issuance workflow awaiting verification'),
        ('VALUECON_SINGLE_CORE', 'Valuecon Single-Core Industrial & House Wires', $3, '1.00 mm, 0.90 mm, 0.60 mm, 1.40 mm', 'BOTH', 'PENDING_CONFIRMATION', 'Multi-strand bunching & extrusion; supports both coil-wise and weight-based pool issuance'),
        ('SPECIAL_ORDER', 'Custom & Special-Order Instrumentation Cables', $1, 'All custom diameters', 'BOTH', 'PENDING_CONFIRMATION', 'Customer-specific cable batches')
       ON CONFLICT (code) DO NOTHING`,
      [compMap.ATLANTA, compMap.NOTOFIRE, compMap.VALUECON]
    );

    const cblCatRows = await tx.query<{ id: number; code: string }>(
      'SELECT id, code FROM cable_categories'
    );
    const cblCatMap = Object.fromEntries(cblCatRows.rows.map((r) => [r.code, r.id]));

    // 9. Seed Suppliers
    await tx.exec(`
      INSERT INTO suppliers (code, name, city, gstin, contact_person) VALUES
        ('SUP-HINDALCO', 'Hindalco Industries Ltd. (Birla Copper)', 'Dahej, Gujarat', '24AAACH1182E1Z4', 'Rajesh Deshmukh'),
        ('SUP-STERLITE', 'Vedanta Ltd. (Sterlite Copper)', 'Silvassa, DNH', '26AAACV2981N1Z1', 'Vikramaditya Nair'),
        ('SUP-KUTCH', 'Kutch Copper Ltd. (Adani)', 'Mundra, Gujarat', '24AALCK7710G1Z8', 'Mehul Shah')
      ON CONFLICT (code) DO NOTHING;
    `);

    const supRows = await tx.query<{ id: number; code: string }>('SELECT id, code FROM suppliers');
    const supMap = Object.fromEntries(supRows.rows.map((r) => [r.code, r.id]));

    // 10. System Settings
    await tx.exec(`
      INSERT INTO system_settings (key, value, description) VALUES
        ('WEIGHT_DECIMAL_PRECISION', '3', 'Display decimal places for copper weights (kg)'),
        ('RATE_DECIMAL_PRECISION', '2', 'Display decimal places for copper rates (INR/kg)'),
        ('DEFAULT_INPUT_ROD_DIAMETER_MM', '8.00', 'Default copper inward rod diameter'),
        ('SHOW_DEMO_DATA', 'true', 'Whether clearly labeled demo records are shown in views'),
        ('ENFORCE_STRICT_ROUTE_MASTERS', 'false', 'If true, block production on routes marked PENDING_CONFIRMATION')
      ON CONFLICT (key) DO NOTHING;
    `);

    // 11. Seed Realistic, Clearly Labeled Demo Workflow (is_demo = TRUE)
    if (includeDemo) {
      const existingDemo = await tx.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM purchase_invoices WHERE is_demo = TRUE'
      );
      if (Number(existingDemo.rows[0]?.count ?? 0) === 0) {
        // DEMO INVOICE 1: Atlanta Tele Cables buys 3 coils of 8mm rod from Hindalco @ ₹818.50/kg
        const inv1 = await createInwardReceipt(
          {
            purchasingCompanyId: compMap.ATLANTA,
            supplierId: supMap['SUP-HINDALCO'],
            invoiceNumber: 'DEMO-BC/26-27/1042',
            invoiceDate: '2026-10-25',
            receiptDate: '2026-10-26',
            materialCategoryId: matMap['CU-ETP-9999'],
            copperGrade: 'ETP 99.99% Birla CC Rod',
            inputDiameterId: diaMap['8.00'],
            supplierLotHeatNumber: 'HEAT-BC-88410',
            purchaseRate: 818.5,
            rateUnit: 'PER_KG',
            currency: 'INR',
            storageLocationId: locMap['SIL-ROD-YARD'],
            supportingDocRef: 'GRN-SIL-2026-0891 / E-Way 2410998123',
            remarks: '[DEMO] Lot-1 October receipt prior to LME copper price spike',
            isDemo: true,
            coils: [
              {
                supplierCoilNumber: 'BC-COIL-9901A',
                grossWeightKg: 2465.0,
                tareWeightKg: 15.0,
                remarks: '[DEMO] 2,450 kg net 8mm coil',
              },
              {
                supplierCoilNumber: 'BC-COIL-9901B',
                grossWeightKg: 2515.0,
                tareWeightKg: 15.0,
                remarks: '[DEMO] 2,500 kg net 8mm coil',
              },
              {
                supplierCoilNumber: 'BC-COIL-9901C',
                grossWeightKg: 2395.0,
                tareWeightKg: 15.0,
                remarks: '[DEMO] 2,380 kg net 8mm coil',
              },
            ],
          },
          tx
        );

        // DEMO INVOICE 2: Atlanta Tele Cables buys 2 coils of 8mm rod from Sterlite @ ₹8,52,000/MT (₹852.00/kg) — price spike!
        const inv2 = await createInwardReceipt(
          {
            purchasingCompanyId: compMap.ATLANTA,
            supplierId: supMap['SUP-STERLITE'],
            invoiceNumber: 'DEMO-STL/26-27/4109',
            invoiceDate: '2026-10-29',
            receiptDate: '2026-10-30',
            materialCategoryId: matMap['CU-ETP-9999'],
            copperGrade: 'Sterlite ETP 99.99% Rod',
            inputDiameterId: diaMap['8.00'],
            supplierLotHeatNumber: 'HEAT-STL-5120',
            purchaseRate: 852000,
            rateUnit: 'PER_MT',
            currency: 'INR',
            storageLocationId: locMap['SIL-ROD-YARD'],
            supportingDocRef: 'GRN-SIL-2026-0914',
            remarks: '[DEMO] Purchased per MT at higher LME rate (₹852/kg)',
            isDemo: true,
            coils: [
              {
                supplierCoilNumber: 'STL-7721-01',
                grossWeightKg: 2612.0,
                tareWeightKg: 12.0,
                remarks: '[DEMO] 2,600 kg net 8mm coil @ ₹852/kg',
              },
              {
                supplierCoilNumber: 'STL-7721-02',
                grossWeightKg: 2562.0,
                tareWeightKg: 12.0,
                remarks: '[DEMO] 2,550 kg net 8mm coil @ ₹852/kg',
              },
            ],
          },
          tx
        );

        // DEMO INVOICE 3: Valuecon buys 2 coils of 8mm rod from Kutch Copper @ ₹836.00/kg
        const inv3 = await createInwardReceipt(
          {
            purchasingCompanyId: compMap.VALUECON,
            supplierId: supMap['SUP-KUTCH'],
            invoiceNumber: 'DEMO-KCL/26-27/0318',
            invoiceDate: '2026-10-31',
            receiptDate: '2026-10-31',
            materialCategoryId: matMap['CU-CC-STD'],
            copperGrade: 'Kutch CC 8mm Rod',
            inputDiameterId: diaMap['8.00'],
            supplierLotHeatNumber: 'HEAT-KCL-309',
            purchaseRate: 836.0,
            rateUnit: 'PER_KG',
            currency: 'INR',
            storageLocationId: locMap['VAP-RBD-WIP'],
            supportingDocRef: 'GRN-VAP-2026-0211',
            remarks: '[DEMO] Valuecon direct purchase for Vapi plant',
            isDemo: true,
            coils: [
              {
                supplierCoilNumber: 'KCL-0318-1',
                grossWeightKg: 2210.0,
                tareWeightKg: 10.0,
              },
              {
                supplierCoilNumber: 'KCL-0318-2',
                grossWeightKg: 2310.0,
                tareWeightKg: 10.0,
              },
            ],
          },
          tx
        );

        // DEMO RBD BATCH 1: Single-source 8.00 mm -> 1.80 mm (One input coil producing 4 output bobbins, fully reconciled)
        const rbdBatch1 = await createOrPostProductionBatch(
          {
            idempotencyKey: 'DEMO-BATCH-RBD-001',
            batchNumber: 'DEMO-RBD-20261028-001',
            productionDate: '2026-10-28',
            processTypeId: procMap.RBD,
            machineId: machMap['RBD-01'],
            inputDiameterId: diaMap['8.00'],
            outputDiameterId: diaMap['1.80'],
            status: 'POSTED',
            inputs: [
              {
                coilId: inv1.createdCoils[0].id, // 2,450 kg coil @ ₹818.50/kg (consume 2,000 kg partially!)
                consumedWeightKg: 2000.0,
              },
            ],
            outputs: [
              {
                outputBobbinNumber: 'DIN630-A101',
                bobbinTypeId: bobMap['BOB-DIN630'],
                grossWeightKg: 543.5,
                tareWeightKg: 48.5, // 495.0 kg net
                storageLocationId: locMap['SIL-RBD-WIP'],
              },
              {
                outputBobbinNumber: 'DIN630-A102',
                bobbinTypeId: bobMap['BOB-DIN630'],
                grossWeightKg: 548.5,
                tareWeightKg: 48.5, // 500.0 kg net
                storageLocationId: locMap['SIL-RBD-WIP'],
              },
              {
                outputBobbinNumber: 'DIN630-A103',
                bobbinTypeId: bobMap['BOB-DIN630'],
                grossWeightKg: 543.5,
                tareWeightKg: 48.5, // 495.0 kg net
                storageLocationId: locMap['SIL-RBD-WIP'],
              },
              {
                outputBobbinNumber: 'DIN630-A104',
                bobbinTypeId: bobMap['BOB-DIN630'],
                grossWeightKg: 539.5,
                tareWeightKg: 48.5, // 491.0 kg net (Total usable = 1,981.0 kg)
                storageLocationId: locMap['SIL-RBD-WIP'],
              },
            ],
            scrapQuantityKg: 12.5,
            recoverableWasteKg: 2.5,
            processLossKg: 4.0, // 1981 + 12.5 + 2.5 + 4.0 = 2000.0 kg (100% reconciled!)
            shift: 'DAY',
            operatorName: 'Suresh Patel',
            remarks: '[DEMO] Partial consumption of 2,000 kg from 2,450 kg coil into 4 DIN-630 bobbins of 1.80 mm wire',
            isDemo: true,
          },
          tx
        );

        // DEMO RBD BATCH 2: Mixed-Source Batch (Combining remaining 450 kg of Inv1 Coil-1 @ ₹818.50/kg + 1,550 kg of Inv2 Coil-1 @ ₹852.00/kg) into 1.60 mm wire!
        const rbdBatch2 = await createOrPostProductionBatch(
          {
            idempotencyKey: 'DEMO-BATCH-RBD-002',
            batchNumber: 'DEMO-RBD-20261031-002',
            productionDate: '2026-10-31',
            processTypeId: procMap.RBD,
            machineId: machMap['RBD-02'],
            inputDiameterId: diaMap['8.00'],
            outputDiameterId: diaMap['1.60'],
            status: 'POSTED',
            inputs: [
              {
                coilId: inv1.createdCoils[0].id, // Remaining 450 kg @ ₹818.50/kg (22.5% share)
                consumedWeightKg: 450.0,
              },
              {
                coilId: inv2.createdCoils[0].id, // 1,550 kg from 2,600 kg coil @ ₹852.00/kg (77.5% share)
                consumedWeightKg: 1550.0,
              },
            ],
            outputs: [
              {
                outputBobbinNumber: 'DIN630-B201',
                bobbinTypeId: bobMap['BOB-DIN630'],
                grossWeightKg: 698.5,
                tareWeightKg: 48.5, // 650.0 kg net
                storageLocationId: locMap['SIL-RBD-WIP'],
              },
              {
                outputBobbinNumber: 'DIN630-B202',
                bobbinTypeId: bobMap['BOB-DIN630'],
                grossWeightKg: 698.5,
                tareWeightKg: 48.5, // 650.0 kg net
                storageLocationId: locMap['SIL-RBD-WIP'],
              },
              {
                outputBobbinNumber: 'DIN630-B203',
                bobbinTypeId: bobMap['BOB-DIN630'],
                grossWeightKg: 726.5,
                tareWeightKg: 48.5, // 678.0 kg net (Total usable = 1,978.0 kg)
                storageLocationId: locMap['SIL-RBD-WIP'],
              },
            ],
            scrapQuantityKg: 14.0,
            recoverableWasteKg: 3.5,
            processLossKg: 4.5, // 1978 + 14 + 3.5 + 4.5 = 2000.0 kg
            shift: 'NIGHT',
            operatorName: 'Mahesh Solanki',
            remarks: '[DEMO] Mixed-rate RBD batch (22.5% Hindalco ₹818.50 + 77.5% Sterlite ₹852.00) producing 1.60 mm wire',
            isDemo: true,
          },
          tx
        );

        // DEMO RBD BATCH 3: Batch with Unexplained Weight Variance (Shortage of 6.50 kg not classified as scrap/loss!)
        await createOrPostProductionBatch(
          {
            idempotencyKey: 'DEMO-BATCH-RBD-003',
            batchNumber: 'DEMO-RBD-20261101-003',
            productionDate: '2026-11-01',
            processTypeId: procMap.RBD,
            machineId: machMap['RBD-01'],
            inputDiameterId: diaMap['8.00'],
            outputDiameterId: diaMap['1.40'],
            status: 'POSTED',
            inputs: [
              {
                coilId: inv1.createdCoils[1].id, // 1,200 kg from 2,500 kg coil
                consumedWeightKg: 1200.0,
              },
            ],
            outputs: [
              {
                outputBobbinNumber: 'DIN630-C301',
                bobbinTypeId: bobMap['BOB-DIN630'],
                grossWeightKg: 638.5,
                tareWeightKg: 48.5, // 590.0 kg net
                storageLocationId: locMap['SIL-RBD-WIP'],
              },
              {
                outputBobbinNumber: 'DIN630-C302',
                bobbinTypeId: bobMap['BOB-DIN630'],
                grossWeightKg: 639.5,
                tareWeightKg: 48.5, // 591.0 kg net (Total usable = 1,181.0 kg)
                storageLocationId: locMap['SIL-RBD-WIP'],
              },
            ],
            scrapQuantityKg: 9.0,
            recoverableWasteKg: 1.0,
            processLossKg: 2.5, // Accounted = 1,193.5 kg -> Unexplained Shortage = 6.50 kg!
            shift: 'DAY',
            operatorName: 'Ramesh Rathod',
            remarks: '[DEMO] Unexplained 6.50 kg variance flagged for supervisor verification (end-cut basket weighing pending)',
            isDemo: true,
          },
          tx
        );

        // DEMO STAGE 2 (CHINA FINE): Draw mixed-source 1.60 mm RBD bobbin (DIN630-B201) into 0.60 mm China Fine Wire spools!
        const cfnBatch1 = await createOrPostProductionBatch(
          {
            idempotencyKey: 'DEMO-BATCH-CFN-001',
            batchNumber: 'DEMO-CFN-20261101-001',
            productionDate: '2026-11-01',
            processTypeId: procMap.CHINA_FINE,
            machineId: machMap['CFN-01'],
            inputDiameterId: diaMap['1.60'],
            outputDiameterId: diaMap['0.60'],
            status: 'POSTED',
            inputs: [
              {
                coilId: rbdBatch2.createdOutputCoils[0].id, // 400 kg consumed from 650 kg 1.60mm RBD bobbin
                consumedWeightKg: 400.0,
              },
            ],
            outputs: [
              {
                outputBobbinNumber: 'CFN-SPL-501',
                bobbinTypeId: bobMap['SPL-CFN250'],
                grossWeightKg: 199.4,
                tareWeightKg: 2.4, // 197.0 kg net
                storageLocationId: locMap['SIL-CFN-WIP'],
              },
              {
                outputBobbinNumber: 'CFN-SPL-502',
                bobbinTypeId: bobMap['SPL-CFN250'],
                grossWeightKg: 201.4,
                tareWeightKg: 2.4, // 199.0 kg net (Total usable = 396.0 kg)
                storageLocationId: locMap['SIL-CFN-WIP'],
              },
            ],
            scrapQuantityKg: 3.0,
            recoverableWasteKg: 0.0,
            processLossKg: 1.0, // 396 + 3 + 1 = 400.0 kg
            shift: 'DAY',
            operatorName: 'Dinesh Verma',
            remarks: '[DEMO] Multi-stage China Fine drawing (1.60 mm -> 0.60 mm) carrying mixed Hindalco/Sterlite purchase lineage',
            isDemo: true,
          },
          tx
        );

        // DEMO INTERCOMPANY OWNERSHIP TRANSFER: Transfer one 1.80mm RBD bobbin (DIN630-A104) from Atlanta Tele Cables to Notofire
        await executeIntercompanyTransfer(
          {
            coilId: rbdBatch1.createdOutputCoils[3].id,
            toCompanyId: compMap.NOTOFIRE,
            transferDate: '2026-11-01',
            transferReferenceDoc: 'DEMO-IC-CHALLAN-2026/019',
            transferReason: '[DEMO] Intercompany sale of 1.80 mm intermediate wire to Notofire for specialty cable order',
            authorizedBy: 'K. V.Subramanian (CFO)',
            remarks: 'Physical bobbin remains at Silvassa WIP bay; legal ownership transferred to Notofire',
            isDemo: true,
          },
          tx
        );

        // DEMO CABLE PRODUCTION ISSUE 1: Coil-wise issue of 1.80 mm RBD wire + 0.60 mm China Fine wire to Atlanta Railway Cable Batch
        await createCableProductionIssue(
          {
            cableBatchNumber: 'DEMO-RLY-QUAD-2026-011',
            issueDate: '2026-11-02',
            ownerCompanyId: compMap.ATLANTA,
            plantId: plantMap['PLT-SILVASSA'],
            cableCategoryId: cblCatMap.RAILWAY_SIGNAL,
            cableProductDescription: 'RDSO 6-Quad 0.60mm / 1.80mm Railway Signalling Cable',
            issueMode: 'COIL_WISE',
            conductorDiameterId: diaMap['0.60'],
            coilAllocations: [
              {
                coilId: cfnBatch1.createdOutputCoils[0].id, // Issue 197 kg of 0.60mm China Fine spool CFN-SPL-501
                issuedWeightKg: 197.0,
              },
            ],
            remarks: '[DEMO] Coil-wise scanned issue to Railway Signalling Cable Batch (preserves multi-stage Hindalco + Sterlite cost attribution)',
            isDemo: true,
          },
          tx
        );

        // DEMO CABLE PRODUCTION ISSUE 2: Weight-based issue for Valuecon Single-Core Cable Batch (marked UNRESOLVED_PENDING_VERIFICATION)
        await createCableProductionIssue(
          {
            cableBatchNumber: 'DEMO-VLC-SC-2026-004',
            issueDate: '2026-11-02',
            ownerCompanyId: compMap.VALUECON,
            plantId: plantMap['PLT-VAPI'],
            cableCategoryId: cblCatMap.VALUECON_SINGLE_CORE,
            cableProductDescription: 'Valuecon FR Single-Core Industrial Cable Batch',
            issueMode: 'WEIGHT_BASED',
            conductorDiameterId: diaMap['8.00'],
            bulkWeightKg: 500.0,
            remarks: '[DEMO] Weight-based pool issuance demonstrating explicit UNRESOLVED_PENDING_VERIFICATION precision marker',
            isDemo: true,
          },
          tx
        );

        void inv3;
      }
    }
  });
}

/**
 * Purge all demo operational records (is_demo = TRUE) without touching real production records
 */
export async function purgeDemoData(): Promise<{ purgedCoils: number; purgedBatches: number }> {
  return withTransaction(async (tx) => {
    await tx.exec(`SET LOCAL app.allow_demo_purge = 'true'`);

    const coilCnt = await tx.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM copper_coils WHERE is_demo = TRUE`
    );
    const batchCnt = await tx.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM production_batches WHERE is_demo = TRUE`
    );

    await tx.exec(`DELETE FROM inventory_movements WHERE is_demo = TRUE`);
    await tx.exec(`DELETE FROM audit_logs WHERE is_demo = TRUE`);
    await tx.exec(`DELETE FROM cable_production_issues WHERE is_demo = TRUE`);
    await tx.exec(`DELETE FROM intercompany_transfers WHERE is_demo = TRUE`);
    await tx.exec(`DELETE FROM scrap_lots WHERE is_demo = TRUE`);
    await tx.exec(`DELETE FROM coil_genealogy WHERE batch_id IN (SELECT id FROM production_batches WHERE is_demo = TRUE)`);
    await tx.exec(`DELETE FROM coil_root_origins WHERE coil_id IN (SELECT id FROM copper_coils WHERE is_demo = TRUE)`);
    await tx.exec(`DELETE FROM production_batch_outputs WHERE batch_id IN (SELECT id FROM production_batches WHERE is_demo = TRUE)`);
    await tx.exec(`DELETE FROM production_batch_inputs WHERE batch_id IN (SELECT id FROM production_batches WHERE is_demo = TRUE)`);
    await tx.exec(`DELETE FROM copper_coils WHERE is_demo = TRUE`);
    await tx.exec(`DELETE FROM production_batches WHERE is_demo = TRUE`);
    await tx.exec(`DELETE FROM purchase_invoices WHERE is_demo = TRUE`);

    return {
      purgedCoils: Number(coilCnt.rows[0]?.count ?? 0),
      purgedBatches: Number(batchCnt.rows[0]?.count ?? 0),
    };
  });
}

