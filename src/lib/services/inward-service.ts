import { DbClient, withTransaction } from '../db';
import { D, toMoneyDb, toWeightDb } from '../decimal';
import crypto from 'crypto';

export interface InwardCoilInput {
  supplierCoilNumber?: string;
  supplierLotHeatNumber?: string;
  grossWeightKg: number | string;
  tareWeightKg?: number | string;
  remarks?: string;
}

export interface CreateInwardReceiptInput {
  purchasingCompanyId: number;
  supplierId: number;
  invoiceNumber: string;
  invoiceDate: string;
  receiptDate: string;
  materialCategoryId: number;
  copperGrade: string;
  inputDiameterId: number;
  supplierLotHeatNumber?: string;
  purchaseRate: number | string;
  rateUnit: 'PER_KG' | 'PER_MT';
  currency?: string;
  storageLocationId: number;
  supportingDocRef?: string;
  remarks?: string;
  coils: InwardCoilInput[];
  isDemo?: boolean;
  actor?: string;
}

export interface CreatedInwardResult {
  invoiceId: number;
  invoiceNumber: string;
  effectiveRatePerKg: string;
  totalWeightKg: string;
  totalValue: string;
  createdCoils: Array<{
    id: number;
    coilCode: string;
    supplierCoilNumber: string | null;
    netWeightKg: string;
  }>;
}

/**
 * Generate a unique internal coil ID, e.g. ATC-ROD-202611-0001
 * Keeps internal coil ID completely separate from supplier coil number.
 */
async function generateUniqueCoilCode(
  tx: DbClient,
  companyPrefix: string,
  stagePrefix: string,
  dateStr: string
): Promise<string> {
  const ym = dateStr.replace(/-/g, '').slice(0, 6);
  const pattern = `${companyPrefix}-${stagePrefix}-${ym}-%`;
  const res = await tx.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM copper_coils WHERE coil_code LIKE $1`,
    [pattern]
  );
  let seq = Number(res.rows[0]?.count ?? 0) + 1;

  // Ensure no collision
  while (true) {
    const candidate = `${companyPrefix}-${stagePrefix}-${ym}-${String(seq).padStart(4, '0')}`;
    const check = await tx.query<{ id: number }>(
      `SELECT id FROM copper_coils WHERE coil_code = $1`,
      [candidate]
    );
    if (check.rows.length === 0) {
      return candidate;
    }
    seq++;
  }
}

export async function createInwardReceipt(
  input: CreateInwardReceiptInput,
  existingTx?: DbClient
): Promise<CreatedInwardResult> {
  const run = async (tx: DbClient): Promise<CreatedInwardResult> => {
    if (!input.coils || input.coils.length === 0) {
      throw new Error('At least one copper coil is required for an inward purchase receipt.');
    }

    // 1. Fetch company and location details
    const compRes = await tx.query<{ id: number; coil_prefix: string; base_currency: string }>(
      `SELECT id, coil_prefix, base_currency FROM companies WHERE id = $1`,
      [input.purchasingCompanyId]
    );
    if (compRes.rows.length === 0) {
      throw new Error(`Invalid purchasing company ID: ${input.purchasingCompanyId}`);
    }
    const company = compRes.rows[0];

    const locRes = await tx.query<{ id: number; plant_id: number }>(
      `SELECT id, plant_id FROM storage_locations WHERE id = $1`,
      [input.storageLocationId]
    );
    if (locRes.rows.length === 0) {
      throw new Error(`Invalid storage location ID: ${input.storageLocationId}`);
    }
    const location = locRes.rows[0];

    // 2. Calculate normalized rate per kg
    const rawRate = D(input.purchaseRate);
    if (rawRate.lessThanOrEqualTo(0)) {
      throw new Error('Purchase rate must be greater than zero.');
    }
    const effectiveRatePerKg =
      input.rateUnit === 'PER_MT' ? rawRate.dividedBy(1000) : rawRate;

    // 3. Validate coils and calculate total net weight
    let totalReceivedWeight = D(0);
    const validatedCoils = input.coils.map((c, idx) => {
      const gross = D(c.grossWeightKg);
      const tare = D(c.tareWeightKg ?? 0);
      const net = gross.minus(tare);
      if (net.lessThanOrEqualTo(0)) {
        throw new Error(
          `Coil #${idx + 1}: Net weight (${net.toFixed(2)} kg) must be positive (Gross: ${gross.toFixed(2)}, Tare: ${tare.toFixed(2)}).`
        );
      }
      totalReceivedWeight = totalReceivedWeight.plus(net);
      return {
        ...c,
        gross,
        tare,
        net,
      };
    });

    const totalInvoiceValue = totalReceivedWeight.times(effectiveRatePerKg);
    const currency = input.currency || company.base_currency || 'INR';
    const isDemo = Boolean(input.isDemo);

    // 4. Insert Purchase Invoice header
    const invInsert = await tx.query<{ id: number }>(
      `INSERT INTO purchase_invoices (
        invoice_number, purchasing_company_id, supplier_id, invoice_date, receipt_date,
        material_category_id, copper_grade, input_diameter_id, supplier_lot_heat_number,
        number_of_coils, total_received_weight_kg, purchase_rate, rate_unit,
        effective_rate_per_kg, currency, total_invoice_copper_value,
        storage_location_id, supporting_doc_ref, remarks, is_demo
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20
      ) RETURNING id`,
      [
        input.invoiceNumber.trim(),
        input.purchasingCompanyId,
        input.supplierId,
        input.invoiceDate,
        input.receiptDate,
        input.materialCategoryId,
        input.copperGrade.trim(),
        input.inputDiameterId,
        input.supplierLotHeatNumber?.trim() || null,
        validatedCoils.length,
        toWeightDb(totalReceivedWeight),
        toMoneyDb(rawRate),
        input.rateUnit,
        toMoneyDb(effectiveRatePerKg),
        currency,
        toMoneyDb(totalInvoiceValue),
        input.storageLocationId,
        input.supportingDocRef?.trim() || null,
        input.remarks?.trim() || null,
        isDemo,
      ]
    );

    const invoiceId = invInsert.rows[0].id;
    const createdCoils: CreatedInwardResult['createdCoils'] = [];

    // 5. Insert each individual coil with its own unique internal ID and ledger entry
    for (const c of validatedCoils) {
      const coilCode = await generateUniqueCoilCode(
        tx,
        company.coil_prefix,
        'ROD',
        input.receiptDate
      );

      const coilRes = await tx.query<{ id: number }>(
        `INSERT INTO copper_coils (
          coil_code, supplier_coil_number, supplier_lot_heat_number,
          owner_company_id, plant_id, current_location_id,
          origin_type, source_invoice_id, material_category_id, copper_grade,
          diameter_id, processing_stage,
          gross_weight_kg, tare_weight_kg, initial_net_weight_kg,
          available_weight_kg, reserved_weight_kg, consumed_weight_kg,
          status, receipt_or_production_date,
          original_purchase_rate_per_kg, accumulated_processing_cost_per_kg, effective_cost_per_kg,
          currency, lineage_precision, remarks, is_demo
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6,
          'INWARD_PURCHASE', $7, $8, $9,
          $10, 'RAW_8MM_ROD',
          $11, $12, $13,
          $13, 0, 0,
          'AVAILABLE', $14,
          $15, 0, $15,
          $16, 'EXACT_SINGLE_SOURCE', $17, $18
        ) RETURNING id`,
        [
          coilCode,
          c.supplierCoilNumber?.trim() || null,
          c.supplierLotHeatNumber?.trim() || input.supplierLotHeatNumber?.trim() || null,
          input.purchasingCompanyId,
          location.plant_id,
          input.storageLocationId,
          invoiceId,
          input.materialCategoryId,
          input.copperGrade.trim(),
          input.inputDiameterId,
          toWeightDb(c.gross),
          toWeightDb(c.tare),
          toWeightDb(c.net),
          input.receiptDate,
          toMoneyDb(effectiveRatePerKg),
          currency,
          c.remarks?.trim() || input.remarks?.trim() || null,
          isDemo,
        ]
      );

      const coilId = coilRes.rows[0].id;

      // Record stage-0 root origin for fast multi-stage genealogy & cost attribution
      await tx.query(
        `INSERT INTO coil_root_origins (
          coil_id, root_coil_id, root_invoice_id, contribution_pct,
          attributed_weight_kg, original_rate_per_kg, allocation_precision, stage_depth
        ) VALUES ($1, $1, $2, 100.0000, $3, $4, 'EXACT', 0)`,
        [coilId, invoiceId, toWeightDb(c.net), toMoneyDb(effectiveRatePerKg)]
      );

      // Record immutable INWARD_RECEIPT movement in inventory_movements
      const coilValue = c.net.times(effectiveRatePerKg);
      await tx.query(
        `INSERT INTO inventory_movements (
          movement_uuid, movement_date, movement_type, coil_id,
          owner_company_id, plant_id, to_location_id, diameter_id,
          weight_delta_kg, balance_before_kg, balance_after_kg,
          unit_rate_per_kg, total_value_delta,
          reference_entity_type, reference_entity_id, reference_number,
          notes, actor, is_demo
        ) VALUES (
          $1, $2, 'INWARD_RECEIPT', $3,
          $4, $5, $6, $7,
          $8, 0, $8,
          $9, $10,
          'PURCHASE_INVOICE', $11, $12,
          $13, $14, $15
        )`,
        [
          crypto.randomUUID(),
          input.receiptDate,
          coilId,
          input.purchasingCompanyId,
          location.plant_id,
          input.storageLocationId,
          input.inputDiameterId,
          toWeightDb(c.net),
          toMoneyDb(effectiveRatePerKg),
          toMoneyDb(coilValue),
          invoiceId,
          input.invoiceNumber.trim(),
          `Inward receipt of coil ${coilCode} (Supplier Coil: ${c.supplierCoilNumber || 'N/A'})`,
          input.actor || 'INWARD_OPERATOR',
          isDemo,
        ]
      );

      createdCoils.push({
        id: coilId,
        coilCode,
        supplierCoilNumber: c.supplierCoilNumber?.trim() || null,
        netWeightKg: toWeightDb(c.net),
      });
    }

    // 6. Write audit log
    await tx.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, actor, reason, after_state, is_demo)
       VALUES ('PURCHASE_INVOICE', $1, 'CREATE_INWARD_RECEIPT', $2, $3, $4, $5)`,
      [
        String(invoiceId),
        input.actor || 'INWARD_OPERATOR',
        `Registered invoice ${input.invoiceNumber} with ${createdCoils.length} coils (${toWeightDb(totalReceivedWeight)} kg)`,
        JSON.stringify({ invoiceId, invoiceNumber: input.invoiceNumber, createdCoils }),
        isDemo,
      ]
    );

    return {
      invoiceId,
      invoiceNumber: input.invoiceNumber,
      effectiveRatePerKg: toMoneyDb(effectiveRatePerKg),
      totalWeightKg: toWeightDb(totalReceivedWeight),
      totalValue: toMoneyDb(totalInvoiceValue),
      createdCoils,
    };
  };

  if (existingTx) {
    return run(existingTx);
  }
  return withTransaction(run);
}

