import { DbClient, withTransaction } from '../db';
import { D, calcNetWeight, reconcileWeights, toMoneyDb, toPctDb, toWeightDb } from '../decimal';
import crypto from 'crypto';

export interface BatchInputCoilSpec {
  coilId: number;
  consumedWeightKg: number | string;
}

export interface BatchOutputCoilSpec {
  outputBobbinNumber: string;
  bobbinTypeId?: number | null;
  grossWeightKg: number | string;
  tareWeightKg: number | string;
  readingMeters?: number | string | null;
  isHardCopper?: boolean;
  storageLocationId: number;
  remarks?: string;
}

export interface CreateProductionBatchInput {
  idempotencyKey?: string;
  batchNumber?: string;
  productionDate: string;
  processTypeId: number;
  machineId: number;
  inputDiameterId: number;
  outputDiameterId: number;
  status?: 'DRAFT' | 'POSTED';
  inputs: BatchInputCoilSpec[];
  outputs: BatchOutputCoilSpec[];
  scrapQuantityKg?: number | string;
  recoverableWasteKg?: number | string;
  processLossKg?: number | string;
  scrapStorageLocationId?: number;
  processingCostPerKg?: number | string;
  scrapRecoveryRatePerKg?: number | string;
  shift?: string;
  operatorName?: string;
  remarks?: string;
  isDemo?: boolean;
  actor?: string;
}

export interface ProductionBatchResult {
  batchId: number;
  batchNumber: string;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  reconciliationStatus: string;
  totalInputWeightKg: string;
  totalUsableOutputKg: string;
  scrapQuantityKg: string;
  recoverableWasteKg: string;
  processLossKg: string;
  unexplainedDiffKg: string;
  yieldPct: string;
  weightedAvgInputRatePerKg: string;
  usableOutputCostPerKg: string;
  netBatchCostTotal: string;
  createdOutputCoils: Array<{
    id: number;
    coilCode: string;
    bobbinNumber: string;
    netWeightKg: string;
    effectiveCostPerKg: string;
  }>;
  idempotentReplay?: boolean;
}

async function generateOutputCoilCode(
  tx: DbClient,
  companyPrefix: string,
  processCode: string,
  dateStr: string
): Promise<string> {
  const ym = dateStr.replace(/-/g, '').slice(0, 6);
  const stageShort =
    processCode === 'RBD'
      ? 'RBD'
      : processCode === 'CHINA_FINE'
      ? 'CFN'
      : processCode === 'HARD_COPPER'
      ? 'HRD'
      : 'PRC';
  const pattern = `${companyPrefix}-${stageShort}-${ym}-%`;
  const res = await tx.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM copper_coils WHERE coil_code LIKE $1`,
    [pattern]
  );
  let seq = Number(res.rows[0]?.count ?? 0) + 1;
  while (true) {
    const candidate = `${companyPrefix}-${stageShort}-${ym}-${String(seq).padStart(4, '0')}`;
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

async function generateBatchNumber(
  tx: DbClient,
  processCode: string,
  dateStr: string
): Promise<string> {
  const ymd = dateStr.replace(/-/g, '');
  const prefix = `BATCH-${processCode}-${ymd}-`;
  const res = await tx.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM production_batches WHERE batch_number LIKE $1`,
    [`${prefix}%`]
  );
  let seq = Number(res.rows[0]?.count ?? 0) + 1;
  while (true) {
    const candidate = `${prefix}${String(seq).padStart(3, '0')}`;
    const check = await tx.query<{ id: number }>(
      `SELECT id FROM production_batches WHERE batch_number = $1`,
      [candidate]
    );
    if (check.rows.length === 0) {
      return candidate;
    }
    seq++;
  }
}

export async function createOrPostProductionBatch(
  input: CreateProductionBatchInput,
  existingTx?: DbClient
): Promise<ProductionBatchResult> {
  const run = async (tx: DbClient): Promise<ProductionBatchResult> => {
    const idempotencyKey = input.idempotencyKey?.trim() || crypto.randomUUID();
    const targetStatus = input.status || 'POSTED';
    const isDemo = Boolean(input.isDemo);

    // 1. Check idempotency key to prevent duplicate production posting
    const existingBatch = await tx.query<{
      id: number;
      batch_number: string;
      status: 'DRAFT' | 'POSTED' | 'REVERSED';
      reconciliation_status: string;
      total_input_weight_kg: string;
      total_usable_output_kg: string;
      scrap_quantity_kg: string;
      recoverable_waste_kg: string;
      process_loss_kg: string;
      unexplained_diff_kg: string;
      yield_pct: string;
      weighted_avg_input_rate_per_kg: string;
      usable_output_cost_per_kg: string;
      net_batch_cost_total: string;
    }>(
      `SELECT id, batch_number, status, reconciliation_status,
              total_input_weight_kg, total_usable_output_kg, scrap_quantity_kg,
              recoverable_waste_kg, process_loss_kg, unexplained_diff_kg,
              yield_pct, weighted_avg_input_rate_per_kg, usable_output_cost_per_kg, net_batch_cost_total
       FROM production_batches WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    if (existingBatch.rows.length > 0) {
      const b = existingBatch.rows[0];
      const outCoils = await tx.query<{
        id: number;
        coil_code: string;
        bobbin_number: string;
        initial_net_weight_kg: string;
        effective_cost_per_kg: string;
      }>(
        `SELECT id, coil_code, bobbin_number, initial_net_weight_kg, effective_cost_per_kg
         FROM copper_coils WHERE source_batch_id = $1 ORDER BY id`,
        [b.id]
      );
      return {
        batchId: b.id,
        batchNumber: b.batch_number,
        status: b.status,
        reconciliationStatus: b.reconciliation_status,
        totalInputWeightKg: b.total_input_weight_kg,
        totalUsableOutputKg: b.total_usable_output_kg,
        scrapQuantityKg: b.scrap_quantity_kg,
        recoverableWasteKg: b.recoverable_waste_kg,
        processLossKg: b.process_loss_kg,
        unexplainedDiffKg: b.unexplained_diff_kg,
        yieldPct: b.yield_pct,
        weightedAvgInputRatePerKg: b.weighted_avg_input_rate_per_kg,
        usableOutputCostPerKg: b.usable_output_cost_per_kg,
        netBatchCostTotal: b.net_batch_cost_total,
        createdOutputCoils: outCoils.rows.map((c) => ({
          id: c.id,
          coilCode: c.coil_code,
          bobbinNumber: c.bobbin_number || '',
          netWeightKg: c.initial_net_weight_kg,
          effectiveCostPerKg: c.effective_cost_per_kg,
        })),
        idempotentReplay: true,
      };
    }

    if (!input.inputs || input.inputs.length === 0) {
      throw new Error('At least one input copper coil is required.');
    }
    if (targetStatus === 'POSTED' && (!input.outputs || input.outputs.length === 0)) {
      throw new Error('At least one output coil/bobbin is required to post a production batch.');
    }

    // 2. Load Process Type, Machine & Allowed Route metadata
    const procRes = await tx.query<{
      id: number;
      code: string;
      name: string;
      resulting_stage: string;
    }>(`SELECT id, code, name, resulting_stage FROM process_types WHERE id = $1`, [
      input.processTypeId,
    ]);
    if (procRes.rows.length === 0) {
      throw new Error(`Invalid process type ID: ${input.processTypeId}`);
    }
    const processType = procRes.rows[0];

    const machRes = await tx.query<{
      id: number;
      plant_id: number;
      code: string;
      process_type_id: number;
    }>(`SELECT id, plant_id, code, process_type_id FROM machines WHERE id = $1`, [
      input.machineId,
    ]);
    if (machRes.rows.length === 0) {
      throw new Error(`Invalid machine ID: ${input.machineId}`);
    }
    const machine = machRes.rows[0];

    const routeRes = await tx.query<{
      standard_wastage_pct: string;
      standard_process_loss_pct: string;
      standard_processing_cost_per_kg: string;
      scrap_recovery_credit_pct: string;
    }>(
      `SELECT standard_wastage_pct, standard_process_loss_pct,
              standard_processing_cost_per_kg, scrap_recovery_credit_pct
       FROM allowed_process_routes
       WHERE process_type_id = $1 AND input_diameter_id = $2 AND output_diameter_id = $3`,
      [input.processTypeId, input.inputDiameterId, input.outputDiameterId]
    );

    const stdWastagePct = D(routeRes.rows[0]?.standard_wastage_pct ?? 0.8);
    const defaultProcCostPerKg = D(routeRes.rows[0]?.standard_processing_cost_per_kg ?? 12.0);
    const defaultScrapRecoveryPct = D(routeRes.rows[0]?.scrap_recovery_credit_pct ?? 92.0);

    // 3. Lock and validate all input coils
    let totalInputWeight = D(0);
    let totalInputOriginalCopperCost = D(0);
    let totalInputEffectiveCost = D(0);
    let ownerCompanyId: number | null = null;
    let ownerCompanyPrefix = 'ATC';
    let materialCategoryId: number | null = null;
    let copperGrade = 'ETP Copper';
    let currency = 'INR';

    const lockedInputs: Array<{
      coilId: number;
      coilCode: string;
      availableBefore: ReturnType<typeof D>;
      consumedWeight: ReturnType<typeof D>;
      remainingAfter: ReturnType<typeof D>;
      isPartial: boolean;
      originalPurchaseRatePerKg: ReturnType<typeof D>;
      effectiveCostPerKg: ReturnType<typeof D>;
      allocatedCost: ReturnType<typeof D>;
      currentLocationId: number;
      consumedBefore: ReturnType<typeof D>;
      sourceInvoiceId: number | null;
      lineagePrecision: string;
    }> = [];

    for (const item of input.inputs) {
      const consumed = D(item.consumedWeightKg);
      if (consumed.lessThanOrEqualTo(0)) {
        throw new Error(`Consumed weight for coil ID ${item.coilId} must be greater than zero.`);
      }

      const coilRes = await tx.query<{
        id: number;
        coil_code: string;
        owner_company_id: number;
        current_location_id: number;
        diameter_id: number;
        available_weight_kg: string;
        consumed_weight_kg: string;
        original_purchase_rate_per_kg: string;
        effective_cost_per_kg: string;
        material_category_id: number | null;
        copper_grade: string;
        currency: string;
        status: string;
        source_invoice_id: number | null;
        lineage_precision: string;
      }>(
        `SELECT id, coil_code, owner_company_id, current_location_id, diameter_id,
                available_weight_kg, consumed_weight_kg, original_purchase_rate_per_kg,
                effective_cost_per_kg, material_category_id, copper_grade, currency,
                status, source_invoice_id, lineage_precision
         FROM copper_coils
         WHERE id = $1
         FOR UPDATE`,
        [item.coilId]
      );

      if (coilRes.rows.length === 0) {
        throw new Error(`Input coil ID ${item.coilId} not found.`);
      }
      const coil = coilRes.rows[0];

      if (coil.diameter_id !== input.inputDiameterId) {
        throw new Error(
          `Coil ${coil.coil_code} diameter does not match batch input diameter selection.`
        );
      }

      const availBefore = D(coil.available_weight_kg);
      if (consumed.greaterThan(availBefore.plus('0.0001'))) {
        throw new Error(
          `Insufficient available weight on coil ${coil.coil_code}: requested ${consumed.toFixed(
            3
          )} kg, but only ${availBefore.toFixed(3)} kg is available.`
        );
      }

      if (ownerCompanyId === null) {
        ownerCompanyId = coil.owner_company_id;
        materialCategoryId = coil.material_category_id;
        copperGrade = coil.copper_grade;
        currency = coil.currency;
        const compRes = await tx.query<{ coil_prefix: string }>(
          `SELECT coil_prefix FROM companies WHERE id = $1`,
          [ownerCompanyId]
        );
        ownerCompanyPrefix = compRes.rows[0]?.coil_prefix || 'ATC';
      } else if (ownerCompanyId !== coil.owner_company_id) {
        throw new Error(
          `Multi-company ownership violation: Coil ${coil.coil_code} belongs to a different legal entity. Record an explicit Intercompany Ownership Transfer before mixing coils across companies.`
        );
      }

      const remainingAfter = availBefore.minus(consumed);
      const isPartial = remainingAfter.greaterThan('0.0001');
      const origRate = D(coil.original_purchase_rate_per_kg);
      const effCost = D(coil.effective_cost_per_kg);
      const allocatedCost = consumed.times(effCost);

      totalInputWeight = totalInputWeight.plus(consumed);
      totalInputOriginalCopperCost = totalInputOriginalCopperCost.plus(consumed.times(origRate));
      totalInputEffectiveCost = totalInputEffectiveCost.plus(allocatedCost);

      lockedInputs.push({
        coilId: coil.id,
        coilCode: coil.coil_code,
        availableBefore: availBefore,
        consumedWeight: consumed,
        remainingAfter: remainingAfter.lessThan(0) ? D(0) : remainingAfter,
        isPartial,
        originalPurchaseRatePerKg: origRate,
        effectiveCostPerKg: effCost,
        allocatedCost,
        currentLocationId: coil.current_location_id,
        consumedBefore: D(coil.consumed_weight_kg),
        sourceInvoiceId: coil.source_invoice_id,
        lineagePrecision: coil.lineage_precision,
      });
    }

    // 4. Validate outputs & compute usable output weight
    let totalUsableOutputWeight = D(0);
    const validatedOutputs = (input.outputs || []).map((out, idx) => {
      const gross = D(out.grossWeightKg);
      const tare = D(out.tareWeightKg ?? 0);
      const net = calcNetWeight(gross, tare);
      if (net.lessThanOrEqualTo(0)) {
        throw new Error(
          `Output bobbin #${idx + 1} (${out.outputBobbinNumber}): Net weight (${net.toFixed(
            3
          )} kg) must be greater than zero.`
        );
      }
      totalUsableOutputWeight = totalUsableOutputWeight.plus(net);
      return {
        ...out,
        gross,
        tare,
        net,
      };
    });

    const scrapKg = D(input.scrapQuantityKg ?? 0);
    const recoverableWasteKg = D(input.recoverableWasteKg ?? 0);
    const processLossKg = D(input.processLossKg ?? 0);

    if (scrapKg.lessThan(0) || recoverableWasteKg.lessThan(0) || processLossKg.lessThan(0)) {
      throw new Error('Scrap, recoverable waste, and process loss quantities cannot be negative.');
    }

    // 5. Perform Material Weight Reconciliation
    const recon = reconcileWeights({
      totalInputKg: totalInputWeight,
      usableOutputKg: totalUsableOutputWeight,
      scrapKg,
      recoverableWasteKg,
      processLossKg,
    });

    if (targetStatus === 'POSTED' && recon.exceedsInput) {
      throw new Error(
        `Material Reconciliation Violation: Total accounted outputs (${recon.totalAccountedKg.toFixed(
          3
        )} kg = usable ${totalUsableOutputWeight.toFixed(3)} + scrap ${scrapKg.toFixed(
          3
        )} + recoverable ${recoverableWasteKg.toFixed(3)} + loss ${processLossKg.toFixed(
          3
        )}) exceed total input copper weight (${totalInputWeight.toFixed(
          3
        )} kg) by ${recon.unexplainedDiffKg.abs().toFixed(3)} kg.`
      );
    }

    const reconciliationStatus =
      targetStatus === 'DRAFT'
        ? 'DRAFT'
        : recon.isReconciled
        ? 'RECONCILED'
        : 'UNEXPLAINED_SHORTAGE';

    // 6. Copper Costing Engine Calculations (Module 8)
    const weightedAvgOriginalPurchaseRate = totalInputWeight.greaterThan(0)
      ? totalInputOriginalCopperCost.dividedBy(totalInputWeight)
      : D(0);

    const weightedAvgEffectiveInputRate = totalInputWeight.greaterThan(0)
      ? totalInputEffectiveCost.dividedBy(totalInputWeight)
      : D(0);

    const processingCostPerKg =
      input.processingCostPerKg !== undefined && input.processingCostPerKg !== ''
        ? D(input.processingCostPerKg)
        : defaultProcCostPerKg;

    const processingCostTotal = totalInputWeight.times(processingCostPerKg);

    const scrapRecoveryRatePerKg =
      input.scrapRecoveryRatePerKg !== undefined && input.scrapRecoveryRatePerKg !== ''
        ? D(input.scrapRecoveryRatePerKg)
        : weightedAvgOriginalPurchaseRate.times(defaultScrapRecoveryPct.dividedBy(100));

    const totalRecoverableScrapKg = scrapKg.plus(recoverableWasteKg);
    const scrapRecoveryCreditTotal = totalRecoverableScrapKg.times(scrapRecoveryRatePerKg);

    const netBatchCostTotal = totalInputEffectiveCost
      .plus(processingCostTotal)
      .minus(scrapRecoveryCreditTotal);

    const usableOutputCostPerKg = totalUsableOutputWeight.greaterThan(0)
      ? netBatchCostTotal.dividedBy(totalUsableOutputWeight)
      : weightedAvgEffectiveInputRate.plus(processingCostPerKg);

    // Check if batch mixes multiple input coils or already-mixed coils
    const isMixedSource =
      lockedInputs.length > 1 ||
      lockedInputs.some((i) => i.lineagePrecision !== 'EXACT_SINGLE_SOURCE');

    const batchNumber =
      input.batchNumber?.trim() ||
      (await generateBatchNumber(tx, processType.code, input.productionDate));

    // 7. Insert production_batches row
    const batchInsert = await tx.query<{ id: number }>(
      `INSERT INTO production_batches (
        batch_number, idempotency_key, production_date, owner_company_id, plant_id,
        process_type_id, machine_id, input_diameter_id, output_diameter_id, status,
        total_input_weight_kg, total_usable_output_kg, scrap_quantity_kg,
        recoverable_waste_kg, process_loss_kg, unexplained_diff_kg,
        reconciliation_status, yield_pct, actual_wastage_pct, standard_wastage_pct,
        input_copper_cost_total, weighted_avg_input_rate_per_kg,
        processing_cost_per_kg, processing_cost_total,
        scrap_recovery_rate_per_kg, scrap_recovery_credit_total,
        net_batch_cost_total, usable_output_cost_per_kg, currency,
        is_mixed_source, shift, operator_name, remarks, is_demo
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22,
        $23, $24,
        $25, $26,
        $27, $28, $29,
        $30, $31, $32, $33, $34
      ) RETURNING id`,
      [
        batchNumber,
        idempotencyKey,
        input.productionDate,
        ownerCompanyId!,
        machine.plant_id,
        input.processTypeId,
        input.machineId,
        input.inputDiameterId,
        input.outputDiameterId,
        targetStatus,
        toWeightDb(totalInputWeight),
        toWeightDb(totalUsableOutputWeight),
        toWeightDb(scrapKg),
        toWeightDb(recoverableWasteKg),
        toWeightDb(processLossKg),
        toWeightDb(recon.unexplainedDiffKg),
        reconciliationStatus,
        toPctDb(recon.yieldPct),
        toPctDb(recon.actualWastagePct),
        toPctDb(stdWastagePct),
        toMoneyDb(totalInputEffectiveCost),
        toMoneyDb(weightedAvgOriginalPurchaseRate),
        toMoneyDb(processingCostPerKg),
        toMoneyDb(processingCostTotal),
        toMoneyDb(scrapRecoveryRatePerKg),
        toMoneyDb(scrapRecoveryCreditTotal),
        toMoneyDb(netBatchCostTotal),
        toMoneyDb(usableOutputCostPerKg),
        currency,
        isMixedSource,
        input.shift || 'DAY',
        input.operatorName?.trim() || 'RBD Operator',
        input.remarks?.trim() || null,
        isDemo,
      ]
    );

    const batchId = batchInsert.rows[0].id;
    const createdOutputCoils: ProductionBatchResult['createdOutputCoils'] = [];

    // 8. Record production_batch_inputs and, if POSTED, deduct inventory + create ledger movements
    for (const inp of lockedInputs) {
      const sharePct = inp.consumedWeight.dividedBy(totalInputWeight).times(100);

      await tx.query(
        `INSERT INTO production_batch_inputs (
          batch_id, input_coil_id, available_before_kg, consumed_weight_kg,
          remaining_after_kg, is_partial_consumption,
          source_purchase_rate_per_kg, source_effective_cost_per_kg,
          allocated_input_cost, contribution_share_pct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          batchId,
          inp.coilId,
          toWeightDb(inp.availableBefore),
          toWeightDb(inp.consumedWeight),
          toWeightDb(inp.remainingAfter),
          inp.isPartial,
          toMoneyDb(inp.originalPurchaseRatePerKg),
          toMoneyDb(inp.effectiveCostPerKg),
          toMoneyDb(inp.allocatedCost),
          toPctDb(sharePct),
        ]
      );

      if (targetStatus === 'POSTED') {
        const newStatus = inp.isPartial ? 'PARTIALLY_CONSUMED' : 'CONSUMED';
        const newConsumedTotal = inp.consumedBefore.plus(inp.consumedWeight);

        await tx.query(
          `UPDATE copper_coils
           SET available_weight_kg = $1,
               consumed_weight_kg = $2,
               status = $3,
               version = version + 1,
               updated_at = NOW()
           WHERE id = $4`,
          [
            toWeightDb(inp.remainingAfter),
            toWeightDb(newConsumedTotal),
            newStatus,
            inp.coilId,
          ]
        );

        await tx.query(
          `INSERT INTO inventory_movements (
            movement_uuid, movement_date, movement_type, coil_id,
            owner_company_id, plant_id, from_location_id, diameter_id,
            weight_delta_kg, balance_before_kg, balance_after_kg,
            unit_rate_per_kg, total_value_delta,
            reference_entity_type, reference_entity_id, reference_number,
            notes, actor, is_demo
          ) VALUES (
            $1, $2, 'PRODUCTION_CONSUMPTION', $3,
            $4, $5, $6, $7,
            $8, $9, $10,
            $11, $12,
            'PRODUCTION_BATCH', $13, $14,
            $15, $16, $17
          )`,
          [
            crypto.randomUUID(),
            input.productionDate,
            inp.coilId,
            ownerCompanyId!,
            machine.plant_id,
            inp.currentLocationId,
            input.inputDiameterId,
            toWeightDb(inp.consumedWeight.negated()),
            toWeightDb(inp.availableBefore),
            toWeightDb(inp.remainingAfter),
            toMoneyDb(inp.effectiveCostPerKg),
            toMoneyDb(inp.allocatedCost.negated()),
            batchId,
            batchNumber,
            `${inp.isPartial ? 'Partial' : 'Full'} consumption of ${inp.coilCode} into ${batchNumber}`,
            input.actor || input.operatorName || 'PRODUCTION_OPERATOR',
            isDemo,
          ]
        );
      }
    }

    // 9. Pre-compute root purchase invoice origins from all input coils for transitive genealogy
    const parentRootMap = new Map<
      string,
      {
        rootCoilId: number;
        rootInvoiceId: number;
        weightedSharePct: ReturnType<typeof D>;
        originalRatePerKg: ReturnType<typeof D>;
        maxStageDepth: number;
      }
    >();

    for (const inp of lockedInputs) {
      const inputBatchShare = inp.consumedWeight.dividedBy(totalInputWeight); // 0..1
      const rootsRes = await tx.query<{
        root_coil_id: number;
        root_invoice_id: number;
        contribution_pct: string;
        original_rate_per_kg: string;
        stage_depth: number;
      }>(
        `SELECT root_coil_id, root_invoice_id, contribution_pct, original_rate_per_kg, stage_depth
         FROM coil_root_origins WHERE coil_id = $1`,
        [inp.coilId]
      );

      for (const r of rootsRes.rows) {
        const key = `${r.root_coil_id}:${r.root_invoice_id}`;
        const effectiveContributionPct = D(r.contribution_pct).times(inputBatchShare);
        const existing = parentRootMap.get(key);
        if (existing) {
          existing.weightedSharePct = existing.weightedSharePct.plus(effectiveContributionPct);
          existing.maxStageDepth = Math.max(existing.maxStageDepth, r.stage_depth);
        } else {
          parentRootMap.set(key, {
            rootCoilId: r.root_coil_id,
            rootInvoiceId: r.root_invoice_id,
            weightedSharePct: effectiveContributionPct,
            originalRatePerKg: D(r.original_rate_per_kg),
            maxStageDepth: r.stage_depth,
          });
        }
      }
    }

    // 10. Create Output Coils, Ledger Entries & Genealogy Links
    for (const out of validatedOutputs) {
      let outputCoilId: number | null = null;
      const allocatedTotalCost = out.net.times(usableOutputCostPerKg);

      const readingVal =
        out.readingMeters !== undefined &&
        out.readingMeters !== null &&
        String(out.readingMeters).trim() !== ''
          ? Number(out.readingMeters)
          : null;
      const isHard = Boolean(out.isHardCopper);

      if (targetStatus === 'POSTED') {
        const outCoilCode = await generateOutputCoilCode(
          tx,
          ownerCompanyPrefix,
          processType.code,
          input.productionDate
        );

        const originType =
          processType.code === 'RBD' ? 'RBD_OUTPUT' : 'DOWNSTREAM_OUTPUT';

        const processingStage = isHard
          ? 'HARD_COPPER'
          : (processType.resulting_stage as any) ||
            (processType.code === 'RBD'
              ? 'RBD_DRAWN'
              : processType.code === 'CHINA_FINE'
              ? 'CHINA_FINE_DRAWN'
              : processType.code === 'HARD_COPPER'
              ? 'HARD_COPPER'
              : 'ANNEALED_WIRE');

        const accumProcCost = usableOutputCostPerKg.minus(weightedAvgOriginalPurchaseRate);

        const coilInsert = await tx.query<{ id: number }>(
          `INSERT INTO copper_coils (
            coil_code, owner_company_id, plant_id, current_location_id,
            origin_type, source_batch_id,
            material_category_id, copper_grade, diameter_id, processing_stage,
            bobbin_type_id, bobbin_number,
            reading_meters, is_hard_copper,
            gross_weight_kg, tare_weight_kg, initial_net_weight_kg,
            available_weight_kg, reserved_weight_kg, consumed_weight_kg,
            status, receipt_or_production_date,
            original_purchase_rate_per_kg, accumulated_processing_cost_per_kg, effective_cost_per_kg,
            currency, lineage_precision, remarks, is_demo
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6,
            $7, $8, $9, $10,
            $11, $12,
            $13, $14,
            $15, $16, $17,
            $17, 0, 0,
            'AVAILABLE', $18,
            $19, $20, $21,
            $22, $23, $24, $25
          ) RETURNING id`,
          [
            outCoilCode,
            ownerCompanyId!,
            machine.plant_id,
            out.storageLocationId,
            originType,
            batchId,
            materialCategoryId,
            copperGrade,
            input.outputDiameterId,
            processingStage,
            out.bobbinTypeId || null,
            out.outputBobbinNumber.trim(),
            readingVal,
            isHard,
            toWeightDb(out.gross),
            toWeightDb(out.tare),
            toWeightDb(out.net),
            input.productionDate,
            toMoneyDb(weightedAvgOriginalPurchaseRate),
            toMoneyDb(accumProcCost.lessThan(0) ? D(0) : accumProcCost),
            toMoneyDb(usableOutputCostPerKg),
            currency,
            isMixedSource ? 'WEIGHTED_MULTI_SOURCE' : 'EXACT_SINGLE_SOURCE',
            out.remarks?.trim() || input.remarks?.trim() || null,
            isDemo,
          ]
        );

        outputCoilId = coilInsert.rows[0].id;

        // Movement ledger entry for output coil creation
        await tx.query(
          `INSERT INTO inventory_movements (
            movement_uuid, movement_date, movement_type, coil_id,
            owner_company_id, plant_id, to_location_id, diameter_id,
            weight_delta_kg, balance_before_kg, balance_after_kg,
            unit_rate_per_kg, total_value_delta,
            reference_entity_type, reference_entity_id, reference_number,
            notes, actor, is_demo
          ) VALUES (
            $1, $2, 'PRODUCTION_OUTPUT', $3,
            $4, $5, $6, $7,
            $8, 0, $8,
            $9, $10,
            'PRODUCTION_BATCH', $11, $12,
            $13, $14, $15
          )`,
          [
            crypto.randomUUID(),
            input.productionDate,
            outputCoilId,
            ownerCompanyId!,
            machine.plant_id,
            out.storageLocationId,
            input.outputDiameterId,
            toWeightDb(out.net),
            toMoneyDb(usableOutputCostPerKg),
            toMoneyDb(allocatedTotalCost),
            batchId,
            batchNumber,
            `Produced output coil ${outCoilCode} (Bobbin: ${out.outputBobbinNumber}) from ${batchNumber}`,
            input.actor || input.operatorName || 'PRODUCTION_OPERATOR',
            isDemo,
          ]
        );

        // Record direct parent -> child links in coil_genealogy
        for (const inp of lockedInputs) {
          const shareRatio = inp.consumedWeight.dividedBy(totalInputWeight);
          const sharePct = shareRatio.times(100);
          const attributedOutKg = out.net.times(shareRatio);
          const attributedInKg = totalUsableOutputWeight.greaterThan(0)
            ? inp.consumedWeight.times(out.net.dividedBy(totalUsableOutputWeight))
            : inp.consumedWeight.times(shareRatio);

          await tx.query(
            `INSERT INTO coil_genealogy (
              batch_id, parent_coil_id, child_coil_id,
              parent_consumed_in_batch_kg, parent_share_of_batch_pct,
              attributed_input_weight_kg, attributed_output_weight_kg,
              original_purchase_rate_per_kg, allocation_precision
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              batchId,
              inp.coilId,
              outputCoilId,
              toWeightDb(inp.consumedWeight),
              toPctDb(sharePct),
              toWeightDb(attributedInKg),
              toWeightDb(attributedOutKg),
              toMoneyDb(inp.originalPurchaseRatePerKg),
              isMixedSource ? 'WEIGHTED_MIX' : 'EXACT',
            ]
          );
        }

        // Record transitive root purchase origins in coil_root_origins
        for (const root of parentRootMap.values()) {
          const attrWeight = out.net.times(root.weightedSharePct.dividedBy(100));
          await tx.query(
            `INSERT INTO coil_root_origins (
              coil_id, root_coil_id, root_invoice_id,
              contribution_pct, attributed_weight_kg,
              original_rate_per_kg, allocation_precision, stage_depth
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              outputCoilId,
              root.rootCoilId,
              root.rootInvoiceId,
              root.weightedSharePct.toFixed(4),
              toWeightDb(attrWeight),
              toMoneyDb(root.originalRatePerKg),
              isMixedSource ? 'WEIGHTED_MIX' : 'EXACT',
              root.maxStageDepth + 1,
            ]
          );
        }

        createdOutputCoils.push({
          id: outputCoilId,
          coilCode: outCoilCode,
          bobbinNumber: out.outputBobbinNumber.trim(),
          netWeightKg: toWeightDb(out.net),
          effectiveCostPerKg: toMoneyDb(usableOutputCostPerKg),
        });
      }

      await tx.query(
        `INSERT INTO production_batch_outputs (
          batch_id, output_coil_id, output_bobbin_number, bobbin_type_id,
          output_diameter_id, gross_weight_kg, tare_weight_kg, net_weight_kg,
          reading_meters, is_hard_copper,
          storage_location_id, allocated_cost_per_kg, allocated_total_cost, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          batchId,
          outputCoilId,
          out.outputBobbinNumber.trim(),
          out.bobbinTypeId || null,
          input.outputDiameterId,
          toWeightDb(out.gross),
          toWeightDb(out.tare),
          toWeightDb(out.net),
          readingVal,
          isHard,
          out.storageLocationId,
          toMoneyDb(usableOutputCostPerKg),
          toMoneyDb(allocatedTotalCost),
          out.remarks?.trim() || null,
        ]
      );
    }

    // 11. Record Scrap & Recoverable Waste Lots if POSTED and > 0
    if (targetStatus === 'POSTED' && totalRecoverableScrapKg.greaterThan(0)) {
      let scrapLocId = input.scrapStorageLocationId;
      if (!scrapLocId) {
        const sLocRes = await tx.query<{ id: number }>(
          `SELECT id FROM storage_locations WHERE plant_id = $1 AND location_type = 'SCRAP_BAY' LIMIT 1`,
          [machine.plant_id]
        );
        scrapLocId = sLocRes.rows[0]?.id || validatedOutputs[0]?.storageLocationId || lockedInputs[0].currentLocationId;
      }

      if (scrapKg.greaterThan(0)) {
        const scrapCode = `SCRAP-${batchNumber}`;
        const scrapVal = scrapKg.times(scrapRecoveryRatePerKg);
        const sInsert = await tx.query<{ id: number }>(
          `INSERT INTO scrap_lots (
            scrap_code, batch_id, owner_company_id, plant_id, storage_location_id,
            scrap_type, weight_kg, source_copper_rate_per_kg,
            recovery_valuation_per_kg, total_recovery_value, status, is_demo
          ) VALUES ($1, $2, $3, $4, $5, 'DRAWING_SCRAP', $6, $7, $8, $9, 'IN_STOCK', $10) RETURNING id`,
          [
            scrapCode,
            batchId,
            ownerCompanyId!,
            machine.plant_id,
            scrapLocId,
            toWeightDb(scrapKg),
            toMoneyDb(weightedAvgOriginalPurchaseRate),
            toMoneyDb(scrapRecoveryRatePerKg),
            toMoneyDb(scrapVal),
            isDemo,
          ]
        );

        await tx.query(
          `INSERT INTO inventory_movements (
            movement_uuid, movement_date, movement_type, scrap_lot_id,
            owner_company_id, plant_id, to_location_id, diameter_id,
            weight_delta_kg, balance_before_kg, balance_after_kg,
            unit_rate_per_kg, total_value_delta,
            reference_entity_type, reference_entity_id, reference_number,
            notes, actor, is_demo
          ) VALUES (
            $1, $2, 'SCRAP_GENERATION', $3,
            $4, $5, $6, $7,
            $8, 0, $8,
            $9, $10,
            'PRODUCTION_BATCH', $11, $12,
            $13, $14, $15
          )`,
          [
            crypto.randomUUID(),
            input.productionDate,
            sInsert.rows[0].id,
            ownerCompanyId!,
            machine.plant_id,
            scrapLocId,
            input.outputDiameterId,
            toWeightDb(scrapKg),
            toMoneyDb(scrapRecoveryRatePerKg),
            toMoneyDb(scrapVal),
            batchId,
            batchNumber,
            `Generated drawing scrap ${scrapCode} from ${batchNumber}`,
            input.actor || input.operatorName || 'PRODUCTION_OPERATOR',
            isDemo,
          ]
        );
      }

      if (recoverableWasteKg.greaterThan(0)) {
        const recCode = `RECOV-${batchNumber}`;
        const recVal = recoverableWasteKg.times(scrapRecoveryRatePerKg);
        await tx.query(
          `INSERT INTO scrap_lots (
            scrap_code, batch_id, owner_company_id, plant_id, storage_location_id,
            scrap_type, weight_kg, source_copper_rate_per_kg,
            recovery_valuation_per_kg, total_recovery_value, status, is_demo
          ) VALUES ($1, $2, $3, $4, $5, 'RECOVERABLE_WASTE', $6, $7, $8, $9, 'IN_STOCK', $10)`,
          [
            recCode,
            batchId,
            ownerCompanyId!,
            machine.plant_id,
            scrapLocId,
            toWeightDb(recoverableWasteKg),
            toMoneyDb(weightedAvgOriginalPurchaseRate),
            toMoneyDb(scrapRecoveryRatePerKg),
            toMoneyDb(recVal),
            isDemo,
          ]
        );
      }
    }

    // 12. Audit Log
    await tx.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, actor, reason, after_state, is_demo)
       VALUES ('PRODUCTION_BATCH', $1, $2, $3, $4, $5, $6)`,
      [
        String(batchId),
        targetStatus === 'POSTED' ? 'POST_PRODUCTION_BATCH' : 'SAVE_PRODUCTION_DRAFT',
        input.actor || input.operatorName || 'PRODUCTION_OPERATOR',
        `Batch ${batchNumber} (${processType.code}): Input ${toWeightDb(
          totalInputWeight
        )} kg -> Output ${toWeightDb(totalUsableOutputWeight)} kg (${reconciliationStatus})`,
        JSON.stringify({
          batchId,
          batchNumber,
          reconciliationStatus,
          unexplainedDiffKg: toWeightDb(recon.unexplainedDiffKg),
          createdOutputCoils,
        }),
        isDemo,
      ]
    );

    return {
      batchId,
      batchNumber,
      status: targetStatus,
      reconciliationStatus,
      totalInputWeightKg: toWeightDb(totalInputWeight),
      totalUsableOutputKg: toWeightDb(totalUsableOutputWeight),
      scrapQuantityKg: toWeightDb(scrapKg),
      recoverableWasteKg: toWeightDb(recoverableWasteKg),
      processLossKg: toWeightDb(processLossKg),
      unexplainedDiffKg: toWeightDb(recon.unexplainedDiffKg),
      yieldPct: toPctDb(recon.yieldPct),
      weightedAvgInputRatePerKg: toMoneyDb(weightedAvgOriginalPurchaseRate),
      usableOutputCostPerKg: toMoneyDb(usableOutputCostPerKg),
      netBatchCostTotal: toMoneyDb(netBatchCostTotal),
      createdOutputCoils,
    };
  };

  if (existingTx) {
    return run(existingTx);
  }
  return withTransaction(run);
}

/**
 * Compensating Transaction Reversal for a Posted Production Batch
 * Restores input coil weights via REVERSAL_COMPENSATION movements and zeroes out unconsumed output coils.
 * Fails safely if any output coil from this batch has already been consumed downstream.
 */
export async function reverseProductionBatch(params: {
  batchId: number;
  reason: string;
  actor?: string;
}): Promise<{ reversedBatchNumber: string; restoredCoils: number }> {
  return withTransaction(async (tx) => {
    if (!params.reason || params.reason.trim().length < 5) {
      throw new Error('A clear audit reason (minimum 5 characters) is required to reverse a production batch.');
    }

    const batchRes = await tx.query<{
      id: number;
      batch_number: string;
      status: string;
      owner_company_id: number;
      plant_id: number;
      input_diameter_id: number;
      output_diameter_id: number;
      production_date: string;
      is_demo: boolean;
    }>(
      `SELECT id, batch_number, status, owner_company_id, plant_id,
              input_diameter_id, output_diameter_id, production_date::text, is_demo
       FROM production_batches WHERE id = $1 FOR UPDATE`,
      [params.batchId]
    );

    if (batchRes.rows.length === 0) {
      throw new Error(`Batch ID ${params.batchId} not found.`);
    }
    const batch = batchRes.rows[0];
    if (batch.status === 'REVERSED') {
      throw new Error(`Batch ${batch.batch_number} is already reversed.`);
    }
    if (batch.status === 'DRAFT') {
      await tx.query(
        `UPDATE production_batches SET status = 'REVERSED', reversed_at = NOW(), reversal_reason = $1 WHERE id = $2`,
        [params.reason.trim(), batch.id]
      );
      return { reversedBatchNumber: batch.batch_number, restoredCoils: 0 };
    }

    // 1. Verify no output coil from this batch has been partially or fully consumed downstream
    const outCoilsRes = await tx.query<{
      id: number;
      coil_code: string;
      available_weight_kg: string;
      consumed_weight_kg: string;
      reserved_weight_kg: string;
      current_location_id: number;
      effective_cost_per_kg: string;
    }>(
      `SELECT id, coil_code, available_weight_kg, consumed_weight_kg,
              reserved_weight_kg, current_location_id, effective_cost_per_kg
       FROM copper_coils WHERE source_batch_id = $1 FOR UPDATE`,
      [batch.id]
    );

    for (const oc of outCoilsRes.rows) {
      if (D(oc.consumed_weight_kg).greaterThan('0.0001') || D(oc.reserved_weight_kg).greaterThan('0.0001')) {
        throw new Error(
          `Cannot reverse batch ${batch.batch_number}: Output coil ${oc.coil_code} has already had ${oc.consumed_weight_kg} kg consumed or reserved downstream. Reverse downstream operations first.`
        );
      }
    }

    // 2. Compensate output coils to 0 available weight and status QUARANTINED
    for (const oc of outCoilsRes.rows) {
      const avail = D(oc.available_weight_kg);
      if (avail.greaterThan(0)) {
        await tx.query(
          `UPDATE copper_coils
           SET available_weight_kg = 0,
               consumed_weight_kg = initial_net_weight_kg,
               status = 'QUARANTINED',
               remarks = COALESCE(remarks, '') || ' [REVERSED BATCH ' || $1 || ']',
               version = version + 1,
               updated_at = NOW()
           WHERE id = $2`,
          [batch.batch_number, oc.id]
        );

        await tx.query(
          `INSERT INTO inventory_movements (
            movement_uuid, movement_date, movement_type, coil_id,
            owner_company_id, plant_id, from_location_id, diameter_id,
            weight_delta_kg, balance_before_kg, balance_after_kg,
            unit_rate_per_kg, total_value_delta,
            reference_entity_type, reference_entity_id, reference_number,
            notes, actor, is_demo
          ) VALUES (
            $1, CURRENT_DATE, 'REVERSAL_COMPENSATION', $2,
            $3, $4, $5, $6,
            $7, $8, 0,
            $9, $10,
            'PRODUCTION_BATCH', $11, $12,
            $13, $14, $15
          )`,
          [
            crypto.randomUUID(),
            oc.id,
            batch.owner_company_id,
            batch.plant_id,
            oc.current_location_id,
            batch.output_diameter_id,
            toWeightDb(avail.negated()),
            toWeightDb(avail),
            oc.effective_cost_per_kg,
            toMoneyDb(avail.times(D(oc.effective_cost_per_kg)).negated()),
            batch.id,
            batch.batch_number,
            `Compensating reversal of output coil ${oc.coil_code}: ${params.reason}`,
            params.actor || 'SUPERVISOR',
            batch.is_demo,
          ]
        );
      }
    }

    // 3. Restore input coils via REVERSAL_COMPENSATION movements
    const inputsRes = await tx.query<{
      input_coil_id: number;
      consumed_weight_kg: string;
      source_effective_cost_per_kg: string;
    }>(
      `SELECT input_coil_id, consumed_weight_kg, source_effective_cost_per_kg
       FROM production_batch_inputs WHERE batch_id = $1`,
      [batch.id]
    );

    for (const inp of inputsRes.rows) {
      const coilRes = await tx.query<{
        id: number;
        coil_code: string;
        available_weight_kg: string;
        consumed_weight_kg: string;
        initial_net_weight_kg: string;
        current_location_id: number;
      }>(
        `SELECT id, coil_code, available_weight_kg, consumed_weight_kg,
                initial_net_weight_kg, current_location_id
         FROM copper_coils WHERE id = $1 FOR UPDATE`,
        [inp.input_coil_id]
      );
      const c = coilRes.rows[0];
      const restoreKg = D(inp.consumed_weight_kg);
      const beforeAvail = D(c.available_weight_kg);
      const afterAvail = beforeAvail.plus(restoreKg);
      const afterConsumed = D(c.consumed_weight_kg).minus(restoreKg);
      const restoredStatus = afterConsumed.lessThanOrEqualTo('0.0001')
        ? 'AVAILABLE'
        : 'PARTIALLY_CONSUMED';

      await tx.query(
        `UPDATE copper_coils
         SET available_weight_kg = $1,
             consumed_weight_kg = $2,
             status = $3,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $4`,
        [
          toWeightDb(afterAvail),
          toWeightDb(afterConsumed.lessThan(0) ? D(0) : afterConsumed),
          restoredStatus,
          c.id,
        ]
      );

      await tx.query(
        `INSERT INTO inventory_movements (
          movement_uuid, movement_date, movement_type, coil_id,
          owner_company_id, plant_id, to_location_id, diameter_id,
          weight_delta_kg, balance_before_kg, balance_after_kg,
          unit_rate_per_kg, total_value_delta,
          reference_entity_type, reference_entity_id, reference_number,
          notes, actor, is_demo
        ) VALUES (
          $1, CURRENT_DATE, 'REVERSAL_COMPENSATION', $2,
          $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11,
          'PRODUCTION_BATCH', $12, $13,
          $14, $15, $16
        )`,
        [
          crypto.randomUUID(),
          c.id,
          batch.owner_company_id,
          batch.plant_id,
          c.current_location_id,
          batch.input_diameter_id,
          toWeightDb(restoreKg),
          toWeightDb(beforeAvail),
          toWeightDb(afterAvail),
          inp.source_effective_cost_per_kg,
          toMoneyDb(restoreKg.times(D(inp.source_effective_cost_per_kg))),
          batch.id,
          batch.batch_number,
          `Restored ${toWeightDb(restoreKg)} kg to input coil ${c.coil_code} on reversal of ${batch.batch_number}`,
          params.actor || 'SUPERVISOR',
          batch.is_demo,
        ]
      );
    }

    // 4. Mark scrap lots as REVERSED
    await tx.query(`UPDATE scrap_lots SET status = 'REVERSED' WHERE batch_id = $1`, [batch.id]);

    // 5. Mark batch as REVERSED and write audit log
    await tx.query(
      `UPDATE production_batches
       SET status = 'REVERSED', reversed_at = NOW(), reversal_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [params.reason.trim(), batch.id]
    );

    await tx.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, actor, reason, before_state, after_state, is_demo)
       VALUES ('PRODUCTION_BATCH', $1, 'REVERSE_BATCH', $2, $3, $4, $5, $6)`,
      [
        String(batch.id),
        params.actor || 'SUPERVISOR',
        params.reason.trim(),
        JSON.stringify({ status: 'POSTED', batchNumber: batch.batch_number }),
        JSON.stringify({ status: 'REVERSED', restoredInputCoils: inputsRes.rows.length }),
        batch.is_demo,
      ]
    );

    return {
      reversedBatchNumber: batch.batch_number,
      restoredCoils: inputsRes.rows.length,
    };
  });
}

