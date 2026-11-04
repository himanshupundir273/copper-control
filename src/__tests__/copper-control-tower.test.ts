import { describe, it, expect, beforeEach } from 'vitest';
import { query, resetDatabaseForTests } from '../lib/db';
import { seedDatabase } from '../lib/seed-data';
import { createInwardReceipt } from '../lib/services/inward-service';
import {
  createOrPostProductionBatch,
  reverseProductionBatch,
} from '../lib/services/production-service';
import {
  createCableProductionIssue,
  executeIntercompanyTransfer,
  reserveOrReleaseCoilWeight,
} from '../lib/services/inventory-service';
import { buildTraceabilityGraph } from '../lib/services/traceability-service';

describe('Copper Control Tower — Core Manufacturing, Ledger, Traceability & Costing Suite', () => {
  beforeEach(async () => {
    process.env.SKIP_AUTO_SEED = 'true';
    await resetDatabaseForTests();
    await seedDatabase({ includeDemoTransactions: false });
  });

  async function getMasterIds() {
    const comp = await query<{ id: number; code: string }>('SELECT id, code FROM companies');
    const sup = await query<{ id: number; code: string }>('SELECT id, code FROM suppliers');
    const mat = await query<{ id: number; code: string }>('SELECT id, code FROM material_categories');
    const dia = await query<{ id: number; diameter_mm: string }>(
      'SELECT id, diameter_mm::text FROM copper_diameters'
    );
    const loc = await query<{ id: number; code: string }>('SELECT id, code FROM storage_locations');
    const proc = await query<{ id: number; code: string }>('SELECT id, code FROM process_types');
    const mach = await query<{ id: number; code: string }>('SELECT id, code FROM machines');
    const bob = await query<{ id: number; code: string }>('SELECT id, code FROM bobbin_types');
    const plant = await query<{ id: number; code: string }>('SELECT id, code FROM plants');
    const cblCat = await query<{ id: number; code: string }>('SELECT id, code FROM cable_categories');

    return {
      compMap: Object.fromEntries(comp.rows.map((r) => [r.code, r.id])),
      supMap: Object.fromEntries(sup.rows.map((r) => [r.code, r.id])),
      matMap: Object.fromEntries(mat.rows.map((r) => [r.code, r.id])),
      diaMap: Object.fromEntries(
        dia.rows.map((r) => [Number(r.diameter_mm).toFixed(2), r.id])
      ),
      locMap: Object.fromEntries(loc.rows.map((r) => [r.code, r.id])),
      procMap: Object.fromEntries(proc.rows.map((r) => [r.code, r.id])),
      machMap: Object.fromEntries(mach.rows.map((r) => [r.code, r.id])),
      bobMap: Object.fromEntries(bob.rows.map((r) => [r.code, r.id])),
      plantMap: Object.fromEntries(plant.rows.map((r) => [r.code, r.id])),
      cblCatMap: Object.fromEntries(cblCat.rows.map((r) => [r.code, r.id])),
    };
  }

  it('1. Copper Inward: generates unique internal coil IDs separate from supplier coil numbers, normalizes PER_MT rates, and writes immutable ledger movements', async () => {
    const m = await getMasterIds();

    const receipt = await createInwardReceipt({
      purchasingCompanyId: m.compMap.ATLANTA,
      supplierId: m.supMap['SUP-HINDALCO'],
      invoiceNumber: 'INV-TEST-1001',
      invoiceDate: '2026-11-01',
      receiptDate: '2026-11-02',
      materialCategoryId: m.matMap['CU-ETP-9999'],
      copperGrade: 'ETP 99.99% Rod',
      inputDiameterId: m.diaMap['8.00'],
      supplierLotHeatNumber: 'HEAT-991',
      purchaseRate: 840000, // ₹8,40,000 per MT -> ₹840.0000 per kg
      rateUnit: 'PER_MT',
      currency: 'INR',
      storageLocationId: m.locMap['SIL-ROD-YARD'],
      coils: [
        { supplierCoilNumber: 'SUP-C1', grossWeightKg: 2515, tareWeightKg: 15 },
        { supplierCoilNumber: 'SUP-C2', grossWeightKg: 2412, tareWeightKg: 12 },
      ],
    });

    expect(receipt.effectiveRatePerKg).toBe('840.0000');
    expect(receipt.totalWeightKg).toBe('4900.0000');
    expect(receipt.createdCoils).toHaveLength(2);
    expect(receipt.createdCoils[0].coilCode).not.toBe(receipt.createdCoils[1].coilCode);
    expect(receipt.createdCoils[0].coilCode).toContain('ATC-ROD-');
    expect(receipt.createdCoils[0].supplierCoilNumber).toBe('SUP-C1');

    // Verify immutable ledger entries exist
    const movs = await query(
      `SELECT movement_type, weight_delta_kg::text, balance_after_kg::text
       FROM inventory_movements WHERE reference_number = 'INV-TEST-1001' ORDER BY id`
    );
    expect(movs.rows).toHaveLength(2);
    expect(movs.rows[0].movement_type).toBe('INWARD_RECEIPT');
    expect(movs.rows[0].weight_delta_kg).toBe('2500.0000');

    // Verify PostgreSQL trigger blocks direct deletion or mutation of ledger rows
    await expect(
      query(`DELETE FROM inventory_movements WHERE reference_number = 'INV-TEST-1001'`)
    ).rejects.toThrow(/Immutable Ledger Violation/);
  });

  it('2. RBD Production: supports partial consumption, 1-to-many output bobbins, idempotency, and blocks output exceeding input weight', async () => {
    const m = await getMasterIds();

    const inward = await createInwardReceipt({
      purchasingCompanyId: m.compMap.ATLANTA,
      supplierId: m.supMap['SUP-HINDALCO'],
      invoiceNumber: 'INV-TEST-2001',
      invoiceDate: '2026-11-01',
      receiptDate: '2026-11-01',
      materialCategoryId: m.matMap['CU-ETP-9999'],
      copperGrade: 'ETP Rod',
      inputDiameterId: m.diaMap['8.00'],
      purchaseRate: 820,
      rateUnit: 'PER_KG',
      storageLocationId: m.locMap['SIL-ROD-YARD'],
      coils: [{ supplierCoilNumber: 'SUP-2001', grossWeightKg: 2510, tareWeightKg: 10 }], // 2500 kg net
    });

    const inputCoilId = inward.createdCoils[0].id;

    // Attempt to post a batch where output + scrap exceeds input (1000 kg input, 1005 kg output) -> must fail!
    await expect(
      createOrPostProductionBatch({
        productionDate: '2026-11-02',
        processTypeId: m.procMap.RBD,
        machineId: m.machMap['RBD-01'],
        inputDiameterId: m.diaMap['8.00'],
        outputDiameterId: m.diaMap['1.80'],
        inputs: [{ coilId: inputCoilId, consumedWeightKg: 1000 }],
        outputs: [
          {
            outputBobbinNumber: 'BOB-ERR-1',
            grossWeightKg: 1050,
            tareWeightKg: 45, // 1005 kg net > 1000 kg input!
            storageLocationId: m.locMap['SIL-RBD-WIP'],
          },
        ],
        scrapQuantityKg: 5,
        processLossKg: 1,
      })
    ).rejects.toThrow(/Material Reconciliation Violation/);

    // Now post a valid partial consumption (consume 1,500 kg out of 2,500 kg) with an unexplained shortage of 4.00 kg
    const batchRes = await createOrPostProductionBatch({
      idempotencyKey: 'IDEMP-KEY-RBD-2001',
      productionDate: '2026-11-02',
      processTypeId: m.procMap.RBD,
      machineId: m.machMap['RBD-01'],
      inputDiameterId: m.diaMap['8.00'],
      outputDiameterId: m.diaMap['1.80'],
      inputs: [{ coilId: inputCoilId, consumedWeightKg: 1500 }],
      outputs: [
        {
          outputBobbinNumber: 'BOB-OK-1',
          grossWeightKg: 788.5,
          tareWeightKg: 48.5, // 740 kg net
          storageLocationId: m.locMap['SIL-RBD-WIP'],
        },
        {
          outputBobbinNumber: 'BOB-OK-2',
          grossWeightKg: 793.5,
          tareWeightKg: 48.5, // 745 kg net (Total usable = 1,485 kg)
          storageLocationId: m.locMap['SIL-RBD-WIP'],
        },
      ],
      scrapQuantityKg: 8.0,
      recoverableWasteKg: 1.0,
      processLossKg: 2.0, // Accounted = 1485 + 8 + 1 + 2 = 1496 kg -> 4.0000 kg unexplained shortage!
    });

    expect(batchRes.reconciliationStatus).toBe('UNEXPLAINED_SHORTAGE');
    expect(batchRes.unexplainedDiffKg).toBe('4.0000');
    expect(batchRes.createdOutputCoils).toHaveLength(2);

    // Check remaining available weight on the partially consumed input coil (2500 - 1500 = 1000 kg)
    const updatedCoil = await query<{ available_weight_kg: string; status: string }>(
      `SELECT available_weight_kg::text, status FROM copper_coils WHERE id = $1`,
      [inputCoilId]
    );
    expect(updatedCoil.rows[0].available_weight_kg).toBe('1000.0000');
    expect(updatedCoil.rows[0].status).toBe('PARTIALLY_CONSUMED');

    // Verify idempotent replay with same idempotencyKey does NOT consume another 1,500 kg
    const replay = await createOrPostProductionBatch({
      idempotencyKey: 'IDEMP-KEY-RBD-2001',
      productionDate: '2026-11-02',
      processTypeId: m.procMap.RBD,
      machineId: m.machMap['RBD-01'],
      inputDiameterId: m.diaMap['8.00'],
      outputDiameterId: m.diaMap['1.80'],
      inputs: [{ coilId: inputCoilId, consumedWeightKg: 1500 }],
      outputs: [
        {
          outputBobbinNumber: 'BOB-OK-1',
          grossWeightKg: 788.5,
          tareWeightKg: 48.5,
          storageLocationId: m.locMap['SIL-RBD-WIP'],
        },
      ],
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.batchId).toBe(batchRes.batchId);
  });

  it('3. Mixed-Source Costing, Multi-Stage Genealogy (RBD -> China Fine -> Cable Issue), and Compensating Reversal', async () => {
    const m = await getMasterIds();

    // Purchase Lot A @ ₹800/kg
    const lotA = await createInwardReceipt({
      purchasingCompanyId: m.compMap.ATLANTA,
      supplierId: m.supMap['SUP-HINDALCO'],
      invoiceNumber: 'INV-LOT-A',
      invoiceDate: '2026-11-01',
      receiptDate: '2026-11-01',
      materialCategoryId: m.matMap['CU-ETP-9999'],
      copperGrade: 'ETP Rod',
      inputDiameterId: m.diaMap['8.00'],
      purchaseRate: 800,
      rateUnit: 'PER_KG',
      storageLocationId: m.locMap['SIL-ROD-YARD'],
      coils: [{ supplierCoilNumber: 'A-1', grossWeightKg: 1010, tareWeightKg: 10 }], // 1000 kg @ ₹800
    });

    // Purchase Lot B @ ₹900/kg
    const lotB = await createInwardReceipt({
      purchasingCompanyId: m.compMap.ATLANTA,
      supplierId: m.supMap['SUP-STERLITE'],
      invoiceNumber: 'INV-LOT-B',
      invoiceDate: '2026-11-01',
      receiptDate: '2026-11-01',
      materialCategoryId: m.matMap['CU-ETP-9999'],
      copperGrade: 'ETP Rod',
      inputDiameterId: m.diaMap['8.00'],
      purchaseRate: 900,
      rateUnit: 'PER_KG',
      storageLocationId: m.locMap['SIL-ROD-YARD'],
      coils: [{ supplierCoilNumber: 'B-1', grossWeightKg: 1010, tareWeightKg: 10 }], // 1000 kg @ ₹900
    });

    // Mix 600 kg of Lot A (₹800) + 400 kg of Lot B (₹900) in RBD Batch (8.00 mm -> 1.60 mm)
    // Weighted avg original purchase rate = (600*800 + 400*900) / 1000 = ₹840.0000 / kg
    const rbdMix = await createOrPostProductionBatch({
      productionDate: '2026-11-02',
      processTypeId: m.procMap.RBD,
      machineId: m.machMap['RBD-01'],
      inputDiameterId: m.diaMap['8.00'],
      outputDiameterId: m.diaMap['1.60'],
      processingCostPerKg: 10, // ₹10/kg processing cost -> ₹10,000
      scrapRecoveryRatePerKg: 800, // ₹800/kg scrap recovery credit
      inputs: [
        { coilId: lotA.createdCoils[0].id, consumedWeightKg: 600 },
        { coilId: lotB.createdCoils[0].id, consumedWeightKg: 400 },
      ],
      outputs: [
        {
          outputBobbinNumber: 'MIX-RBD-160',
          grossWeightKg: 1028.5,
          tareWeightKg: 48.5, // 980 kg usable output
          storageLocationId: m.locMap['SIL-RBD-WIP'],
        },
      ],
      scrapQuantityKg: 15, // 15 kg * ₹800 = ₹12,000 scrap recovery credit
      processLossKg: 5, // 980 + 15 + 5 = 1000 kg
    });

    // Verify costing math:
    // Input copper cost = ₹8,40,000 + Processing cost ₹10,000 - Scrap credit ₹12,000 = ₹8,38,000 net cost
    // Usable output = 980 kg -> Cost/kg = 838000 / 980 = 855.1020 INR/kg
    expect(rbdMix.weightedAvgInputRatePerKg).toBe('840.0000');
    expect(rbdMix.netBatchCostTotal).toBe('838000.0000');
    expect(rbdMix.usableOutputCostPerKg).toBe('855.1020');

    // Stage 2: Process 500 kg of MIX-RBD-160 on China Fine (1.60 mm -> 0.60 mm)
    const cfnBatch = await createOrPostProductionBatch({
      productionDate: '2026-11-02',
      processTypeId: m.procMap.CHINA_FINE,
      machineId: m.machMap['CFN-01'],
      inputDiameterId: m.diaMap['1.60'],
      outputDiameterId: m.diaMap['0.60'],
      inputs: [{ coilId: rbdMix.createdOutputCoils[0].id, consumedWeightKg: 500 }],
      outputs: [
        {
          outputBobbinNumber: 'CFN-060-SPL1',
          grossWeightKg: 497.4,
          tareWeightKg: 2.4, // 495 kg net
          storageLocationId: m.locMap['SIL-CFN-WIP'],
        },
      ],
      scrapQuantityKg: 4,
      processLossKg: 1,
    });

    const fineCoilCode = cfnBatch.createdOutputCoils[0].coilCode;
    const fineCoilId = cfnBatch.createdOutputCoils[0].id;

    // Issue 200 kg of fine coil to a Finished Cable Batch
    const cblIssue = await createCableProductionIssue({
      cableBatchNumber: 'CBL-RAIL-900',
      issueDate: '2026-11-02',
      ownerCompanyId: m.compMap.ATLANTA,
      plantId: m.plantMap['PLT-SILVASSA'],
      cableCategoryId: m.cblCatMap.RAILWAY_SIGNAL,
      cableProductDescription: 'Railway Quad Cable',
      issueMode: 'COIL_WISE',
      conductorDiameterId: m.diaMap['0.60'],
      coilAllocations: [{ coilId: fineCoilId, issuedWeightKg: 200 }],
    });
    expect(cblIssue.traceabilityPrecision).toBe('EXACT_COIL_LINKED');

    // Build Traceability Graph for the Stage-2 Fine Coil and verify both original 8mm invoices (60% / 40%) are preserved!
    const graph = await buildTraceabilityGraph(fineCoilCode, true);
    expect(graph.rootContributions).toHaveLength(2);
    expect(graph.rootContributions[0].invoiceNumber).toBe('INV-LOT-A');
    expect(Number(graph.rootContributions[0].contributionPct)).toBeCloseTo(60, 2);
    expect(Number(graph.rootContributions[0].originalRatePerKg)).toBeCloseTo(800, 2);
    expect(graph.rootContributions[1].invoiceNumber).toBe('INV-LOT-B');
    expect(Number(graph.rootContributions[1].contributionPct)).toBeCloseTo(40, 2);
    expect(Number(graph.rootContributions[1].originalRatePerKg)).toBeCloseTo(900, 2);
  });

  it('4. Multi-Company Separation & Compensating Reversal: enforces legal ownership boundaries and reverses unconsumed batches cleanly', async () => {
    const m = await getMasterIds();

    const vlcReceipt = await createInwardReceipt({
      purchasingCompanyId: m.compMap.VALUECON,
      supplierId: m.supMap['SUP-KUTCH'],
      invoiceNumber: 'INV-VLC-501',
      invoiceDate: '2026-11-01',
      receiptDate: '2026-11-01',
      materialCategoryId: m.matMap['CU-CC-STD'],
      copperGrade: 'CC Rod',
      inputDiameterId: m.diaMap['8.00'],
      purchaseRate: 830,
      rateUnit: 'PER_KG',
      storageLocationId: m.locMap['SIL-ROD-YARD'],
      coils: [{ supplierCoilNumber: 'VLC-C1', grossWeightKg: 1010, tareWeightKg: 10 }], // 1000 kg owned by VALUECON
    });

    const coilId = vlcReceipt.createdCoils[0].id;

    // Test Reservation & Release
    const res1 = await reserveOrReleaseCoilWeight({
      coilId,
      action: 'RESERVE',
      weightKg: 300,
      referenceNumber: 'ORD-VLC-01',
    });
    expect(res1.availableWeightKg).toBe('700.0000');
    expect(res1.reservedWeightKg).toBe('300.0000');

    const rel1 = await reserveOrReleaseCoilWeight({
      coilId,
      action: 'RELEASE',
      weightKg: 300,
      referenceNumber: 'ORD-VLC-01',
    });
    expect(rel1.availableWeightKg).toBe('1000.0000');
    expect(rel1.reservedWeightKg).toBe('0.0000');

    // Execute explicit Intercompany Transfer from VALUECON to NOTOFIRE
    const trf = await executeIntercompanyTransfer({
      coilId,
      toCompanyId: m.compMap.NOTOFIRE,
      transferDate: '2026-11-02',
      transferReferenceDoc: 'IC-DOC-771',
      transferReason: 'Intercompany sale of rod coil to Notofire',
      authorizedBy: 'Plant Director',
    });
    expect(trf.fromCompanyId).toBe(m.compMap.VALUECON);
    expect(trf.toCompanyId).toBe(m.compMap.NOTOFIRE);

    // Post an RBD batch for NOTOFIRE and then reverse it via compensating transaction
    const batch = await createOrPostProductionBatch({
      productionDate: '2026-11-02',
      processTypeId: m.procMap.RBD,
      machineId: m.machMap['RBD-01'],
      inputDiameterId: m.diaMap['8.00'],
      outputDiameterId: m.diaMap['1.80'],
      inputs: [{ coilId, consumedWeightKg: 1000 }],
      outputs: [
        {
          outputBobbinNumber: 'NTF-BOB-1',
          grossWeightKg: 1038.5,
          tareWeightKg: 48.5, // 990 kg net
          storageLocationId: m.locMap['SIL-RBD-WIP'],
        },
      ],
      scrapQuantityKg: 8,
      processLossKg: 2,
    });

    const rev = await reverseProductionBatch({
      batchId: batch.batchId,
      reason: 'Incorrect bobbin tare weight entered by operator',
      actor: 'Shift Supervisor',
    });
    expect(rev.restoredCoils).toBe(1);

    // Verify input coil has its 1000 kg available balance restored
    const restored = await query<{ available_weight_kg: string; status: string }>(
      `SELECT available_weight_kg::text, status FROM copper_coils WHERE id = $1`,
      [coilId]
    );
    expect(restored.rows[0].available_weight_kg).toBe('1000.0000');
    expect(restored.rows[0].status).toBe('AVAILABLE');
  });
});

