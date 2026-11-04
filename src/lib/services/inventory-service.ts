import { DbClient, withTransaction } from '../db';
import { D, toMoneyDb, toWeightDb } from '../decimal';
import crypto from 'crypto';

/**
 * Physical Location Transfer (preserves legal stock ownership!)
 */
export async function transferCoilLocation(params: {
  coilId: number;
  toLocationId: number;
  transferDate: string;
  referenceNumber?: string;
  notes?: string;
  actor?: string;
}): Promise<{ coilCode: string; fromLocationId: number; toLocationId: number }> {
  return withTransaction(async (tx) => {
    const coilRes = await tx.query<{
      id: number;
      coil_code: string;
      owner_company_id: number;
      plant_id: number;
      current_location_id: number;
      diameter_id: number;
      available_weight_kg: string;
      effective_cost_per_kg: string;
      is_demo: boolean;
    }>(
      `SELECT id, coil_code, owner_company_id, plant_id, current_location_id,
              diameter_id, available_weight_kg, effective_cost_per_kg, is_demo
       FROM copper_coils WHERE id = $1 FOR UPDATE`,
      [params.coilId]
    );
    if (coilRes.rows.length === 0) {
      throw new Error(`Coil ID ${params.coilId} not found.`);
    }
    const coil = coilRes.rows[0];

    const locRes = await tx.query<{ id: number; plant_id: number; name: string }>(
      `SELECT id, plant_id, name FROM storage_locations WHERE id = $1`,
      [params.toLocationId]
    );
    if (locRes.rows.length === 0) {
      throw new Error(`Target storage location ID ${params.toLocationId} not found.`);
    }
    const toLoc = locRes.rows[0];

    if (coil.current_location_id === toLoc.id) {
      throw new Error(`Coil ${coil.coil_code} is already at location ${toLoc.name}.`);
    }

    await tx.query(
      `UPDATE copper_coils
       SET current_location_id = $1,
           plant_id = $2,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $3`,
      [toLoc.id, toLoc.plant_id, coil.id]
    );

    const avail = D(coil.available_weight_kg);
    await tx.query(
      `INSERT INTO inventory_movements (
        movement_uuid, movement_date, movement_type, coil_id,
        owner_company_id, plant_id, from_location_id, to_location_id, diameter_id,
        weight_delta_kg, balance_before_kg, balance_after_kg,
        unit_rate_per_kg, total_value_delta,
        reference_entity_type, reference_entity_id, reference_number,
        notes, actor, is_demo
      ) VALUES (
        $1, $2, 'LOCATION_TRANSFER', $3,
        $4, $5, $6, $7, $8,
        0, $9, $9,
        $10, 0,
        'LOCATION_TRANSFER', $3, $11,
        $12, $13, $14
      )`,
      [
        crypto.randomUUID(),
        params.transferDate,
        coil.id,
        coil.owner_company_id,
        toLoc.plant_id,
        coil.current_location_id,
        toLoc.id,
        coil.diameter_id,
        toWeightDb(avail),
        coil.effective_cost_per_kg,
        params.referenceNumber?.trim() || `LOC-TRF-${coil.coil_code}`,
        params.notes?.trim() || `Physical location transfer to ${toLoc.name} (Legal owner unchanged)`,
        params.actor || 'STORE_OPERATOR',
        coil.is_demo,
      ]
    );

    return {
      coilCode: coil.coil_code,
      fromLocationId: coil.current_location_id,
      toLocationId: toLoc.id,
    };
  });
}

/**
 * Reserve or Release weight on a coil with auditable movement ledger entry
 */
export async function reserveOrReleaseCoilWeight(params: {
  coilId: number;
  action: 'RESERVE' | 'RELEASE';
  weightKg: number | string;
  referenceNumber: string;
  notes?: string;
  actor?: string;
}): Promise<{ coilCode: string; availableWeightKg: string; reservedWeightKg: string }> {
  return withTransaction(async (tx) => {
    const delta = D(params.weightKg);
    if (delta.lessThanOrEqualTo(0)) {
      throw new Error('Reservation/release weight must be greater than zero.');
    }

    const coilRes = await tx.query<{
      id: number;
      coil_code: string;
      owner_company_id: number;
      plant_id: number;
      current_location_id: number;
      diameter_id: number;
      available_weight_kg: string;
      reserved_weight_kg: string;
      consumed_weight_kg: string;
      effective_cost_per_kg: string;
      is_demo: boolean;
    }>(
      `SELECT id, coil_code, owner_company_id, plant_id, current_location_id,
              diameter_id, available_weight_kg, reserved_weight_kg, consumed_weight_kg,
              effective_cost_per_kg, is_demo
       FROM copper_coils WHERE id = $1 FOR UPDATE`,
      [params.coilId]
    );
    if (coilRes.rows.length === 0) {
      throw new Error(`Coil ID ${params.coilId} not found.`);
    }
    const coil = coilRes.rows[0];
    const availBefore = D(coil.available_weight_kg);
    const reservedBefore = D(coil.reserved_weight_kg);

    let availAfter = availBefore;
    let reservedAfter = reservedBefore;
    let movementType: 'RESERVATION' | 'RESERVATION_RELEASE' = 'RESERVATION';
    let signedAvailDelta = D(0);

    if (params.action === 'RESERVE') {
      if (delta.greaterThan(availBefore.plus('0.0001'))) {
        throw new Error(
          `Cannot reserve ${delta.toFixed(2)} kg on coil ${coil.coil_code}: only ${availBefore.toFixed(
            2
          )} kg available.`
        );
      }
      availAfter = availBefore.minus(delta);
      reservedAfter = reservedBefore.plus(delta);
      movementType = 'RESERVATION';
      signedAvailDelta = delta.negated();
    } else {
      if (delta.greaterThan(reservedBefore.plus('0.0001'))) {
        throw new Error(
          `Cannot release ${delta.toFixed(2)} kg on coil ${coil.coil_code}: only ${reservedBefore.toFixed(
            2
          )} kg currently reserved.`
        );
      }
      availAfter = availBefore.plus(delta);
      reservedAfter = reservedBefore.minus(delta);
      movementType = 'RESERVATION_RELEASE';
      signedAvailDelta = delta;
    }

    const newStatus =
      availAfter.lessThanOrEqualTo('0.0001') && reservedAfter.greaterThan('0.0001')
        ? 'RESERVED'
        : D(coil.consumed_weight_kg).greaterThan('0.0001')
        ? 'PARTIALLY_CONSUMED'
        : 'AVAILABLE';

    await tx.query(
      `UPDATE copper_coils
       SET available_weight_kg = $1,
           reserved_weight_kg = $2,
           status = $3,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $4`,
      [toWeightDb(availAfter), toWeightDb(reservedAfter), newStatus, coil.id]
    );

    await tx.query(
      `INSERT INTO inventory_movements (
        movement_uuid, movement_date, movement_type, coil_id,
        owner_company_id, plant_id, from_location_id, to_location_id, diameter_id,
        weight_delta_kg, balance_before_kg, balance_after_kg,
        unit_rate_per_kg, total_value_delta,
        reference_entity_type, reference_entity_id, reference_number,
        notes, actor, is_demo
      ) VALUES (
        $1, CURRENT_DATE, $2, $3,
        $4, $5, $6, $6, $7,
        $8, $9, $10,
        $11, 0,
        'RESERVATION', $3, $12,
        $13, $14, $15
      )`,
      [
        crypto.randomUUID(),
        movementType,
        coil.id,
        coil.owner_company_id,
        coil.plant_id,
        coil.current_location_id,
        coil.diameter_id,
        toWeightDb(signedAvailDelta),
        toWeightDb(availBefore),
        toWeightDb(availAfter),
        coil.effective_cost_per_kg,
        params.referenceNumber.trim(),
        params.notes?.trim() || `${params.action} ${delta.toFixed(2)} kg on ${coil.coil_code}`,
        params.actor || 'PLANNER',
        coil.is_demo,
      ]
    );

    return {
      coilCode: coil.coil_code,
      availableWeightKg: toWeightDb(availAfter),
      reservedWeightKg: toWeightDb(reservedAfter),
    };
  });
}

/**
 * Multi-Company Legal Stock Ownership Transfer
 * Explicitly transfers legal ownership of a coil between Atlanta Tele Cables, Notofire, and Valuecon
 * while preserving original purchase rate and physical location.
 */
export async function executeIntercompanyTransfer(
  params: {
    coilId: number;
    toCompanyId: number;
    transferDate: string;
    transferReferenceDoc: string;
    transferReason: string;
    authorizedBy: string;
    remarks?: string;
    isDemo?: boolean;
  },
  existingTx?: DbClient
): Promise<{
  transferId: number;
  transferNumber: string;
  coilCode: string;
  fromCompanyId: number;
  toCompanyId: number;
  weightTransferredKg: string;
}> {
  const run = async (tx: DbClient) => {
    if (!params.transferReferenceDoc || params.transferReferenceDoc.trim().length < 3) {
      throw new Error('A supporting document reference is required for intercompany ownership transfers.');
    }

    const coilRes = await tx.query<{
      id: number;
      coil_code: string;
      owner_company_id: number;
      plant_id: number;
      current_location_id: number;
      diameter_id: number;
      available_weight_kg: string;
      reserved_weight_kg: string;
      original_purchase_rate_per_kg: string;
      effective_cost_per_kg: string;
      is_demo: boolean;
    }>(
      `SELECT id, coil_code, owner_company_id, plant_id, current_location_id,
              diameter_id, available_weight_kg, reserved_weight_kg,
              original_purchase_rate_per_kg, effective_cost_per_kg, is_demo
       FROM copper_coils WHERE id = $1 FOR UPDATE`,
      [params.coilId]
    );

    if (coilRes.rows.length === 0) {
      throw new Error(`Coil ID ${params.coilId} not found.`);
    }
    const coil = coilRes.rows[0];

    if (coil.owner_company_id === params.toCompanyId) {
      throw new Error(`Coil ${coil.coil_code} is already legally owned by the selected target company.`);
    }
    if (D(coil.reserved_weight_kg).greaterThan('0.0001')) {
      throw new Error(
        `Cannot transfer legal ownership of coil ${coil.coil_code} while ${coil.reserved_weight_kg} kg is reserved.`
      );
    }
    const avail = D(coil.available_weight_kg);
    if (avail.lessThanOrEqualTo(0)) {
      throw new Error(`Coil ${coil.coil_code} has no available weight to transfer.`);
    }

    const ymd = params.transferDate.replace(/-/g, '');
    const countRes = await tx.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM intercompany_transfers`
    );
    const transferNumber = `IC-TRF-${ymd}-${String(Number(countRes.rows[0]?.count ?? 0) + 1).padStart(
      3,
      '0'
    )}`;

    const isDemo = params.isDemo !== undefined ? params.isDemo : coil.is_demo;

    const trfInsert = await tx.query<{ id: number }>(
      `INSERT INTO intercompany_transfers (
        transfer_number, transfer_date, from_company_id, to_company_id,
        coil_id, weight_transferred_kg, original_purchase_rate_per_kg,
        transfer_reference_doc, transfer_reason, authorized_by, remarks, is_demo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        transferNumber,
        params.transferDate,
        coil.owner_company_id,
        params.toCompanyId,
        coil.id,
        toWeightDb(avail),
        coil.original_purchase_rate_per_kg,
        params.transferReferenceDoc.trim(),
        params.transferReason.trim(),
        params.authorizedBy.trim(),
        params.remarks?.trim() || null,
        isDemo,
      ]
    );

    const transferId = trfInsert.rows[0].id;

    // Update legal owner on coil while keeping physical location untouched
    await tx.query(
      `UPDATE copper_coils
       SET owner_company_id = $1,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [params.toCompanyId, coil.id]
    );

    // Record immutable INTERCOMPANY_OWNERSHIP_TRANSFER ledger movement
    await tx.query(
      `INSERT INTO inventory_movements (
        movement_uuid, movement_date, movement_type, coil_id,
        owner_company_id, target_company_id, plant_id,
        from_location_id, to_location_id, diameter_id,
        weight_delta_kg, balance_before_kg, balance_after_kg,
        unit_rate_per_kg, total_value_delta,
        reference_entity_type, reference_entity_id, reference_number,
        notes, actor, is_demo
      ) VALUES (
        $1, $2, 'INTERCOMPANY_OWNERSHIP_TRANSFER', $3,
        $4, $5, $6,
        $7, $7, $8,
        0, $9, $9,
        $10, $11,
        'INTERCOMPANY_TRANSFER', $12, $13,
        $14, $15, $16
      )`,
      [
        crypto.randomUUID(),
        params.transferDate,
        coil.id,
        coil.owner_company_id,
        params.toCompanyId,
        coil.plant_id,
        coil.current_location_id,
        coil.diameter_id,
        toWeightDb(avail),
        coil.effective_cost_per_kg,
        toMoneyDb(avail.times(D(coil.effective_cost_per_kg))),
        transferId,
        transferNumber,
        `Legal ownership transferred (Ref: ${params.transferReferenceDoc}): ${params.transferReason}`,
        params.authorizedBy.trim(),
        isDemo,
      ]
    );

    await tx.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, actor, reason, before_state, after_state, is_demo)
       VALUES ('INTERCOMPANY_TRANSFER', $1, 'TRANSFER_LEGAL_OWNERSHIP', $2, $3, $4, $5, $6)`,
      [
        String(transferId),
        params.authorizedBy.trim(),
        params.transferReason.trim(),
        JSON.stringify({ coilId: coil.id, ownerCompanyId: coil.owner_company_id }),
        JSON.stringify({ coilId: coil.id, ownerCompanyId: params.toCompanyId, transferNumber }),
        isDemo,
      ]
    );

    return {
      transferId,
      transferNumber,
      coilCode: coil.coil_code,
      fromCompanyId: coil.owner_company_id,
      toCompanyId: params.toCompanyId,
      weightTransferredKg: toWeightDb(avail),
    };
  };

  if (existingTx) {
    return run(existingTx);
  }
  return withTransaction(run);
}

/**
 * Module 7: Configurable Cable Production Linkage (supports both COIL_WISE and WEIGHT_BASED modes)
 */
export interface CreateCableIssueInput {
  cableBatchNumber: string;
  issueDate: string;
  ownerCompanyId: number;
  plantId: number;
  cableCategoryId: number;
  cableProductDescription: string;
  issueMode: 'COIL_WISE' | 'WEIGHT_BASED';
  conductorDiameterId: number;
  // For COIL_WISE (or optional candidate coils in WEIGHT_BASED)
  coilAllocations?: Array<{
    coilId: number;
    issuedWeightKg: number | string;
  }>;
  // For pure WEIGHT_BASED when operator only specifies total weight from pool
  bulkWeightKg?: number | string;
  remarks?: string;
  isDemo?: boolean;
  actor?: string;
}

export async function createCableProductionIssue(
  input: CreateCableIssueInput,
  existingTx?: DbClient
): Promise<{
  issueId: number;
  issueNumber: string;
  cableBatchNumber: string;
  issueMode: string;
  totalIssuedWeightKg: string;
  totalAttributedCopperCost: string;
  weightedAvgCopperCostPerKg: string;
  traceabilityPrecision: string;
}> {
  const run = async (tx: DbClient) => {
    const isDemo = Boolean(input.isDemo);
    const ymd = input.issueDate.replace(/-/g, '');
    const cntRes = await tx.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cable_production_issues`
    );
    const issueNumber = `CBL-ISS-${ymd}-${String(Number(cntRes.rows[0]?.count ?? 0) + 1).padStart(
      3,
      '0'
    )}`;

    let allocations: Array<{
      coilId: number;
      issuedWeight: ReturnType<typeof D>;
      attributionMethod:
        | 'SPECIFIC_COIL_SCAN'
        | 'OPERATOR_WEIGHT_ALLOCATION'
        | 'UNRESOLVED_POOL_ESTIMATE';
    }> = [];

    let traceabilityPrecision:
      | 'EXACT_COIL_LINKED'
      | 'WEIGHTED_MULTI_COIL'
      | 'ESTIMATED_POOL_ISSUE'
      | 'UNRESOLVED_PENDING_VERIFICATION' = 'EXACT_COIL_LINKED';

    if (input.issueMode === 'COIL_WISE') {
      if (!input.coilAllocations || input.coilAllocations.length === 0) {
        throw new Error('COIL_WISE issue mode requires at least one specific copper coil selection.');
      }
      allocations = input.coilAllocations.map((a) => ({
        coilId: a.coilId,
        issuedWeight: D(a.issuedWeightKg),
        attributionMethod: 'SPECIFIC_COIL_SCAN',
      }));
      traceabilityPrecision =
        allocations.length === 1 ? 'EXACT_COIL_LINKED' : 'WEIGHTED_MULTI_COIL';
    } else {
      // WEIGHT_BASED mode: either operator provided approximate coil allocations or a bulk weight
      if (input.coilAllocations && input.coilAllocations.length > 0) {
        allocations = input.coilAllocations.map((a) => ({
          coilId: a.coilId,
          issuedWeight: D(a.issuedWeightKg),
          attributionMethod: 'OPERATOR_WEIGHT_ALLOCATION',
        }));
        traceabilityPrecision = 'ESTIMATED_POOL_ISSUE';
      } else {
        const requestedBulk = D(input.bulkWeightKg ?? 0);
        if (requestedBulk.lessThanOrEqualTo(0)) {
          throw new Error('WEIGHT_BASED issue mode requires a positive bulk weight (kg).');
        }
        // Auto-allocate from oldest available coils of that company & diameter in stock,
        // while explicitly marking traceability precision as UNRESOLVED_PENDING_VERIFICATION
        // so the system NEVER presents false precision!
        const poolCoils = await tx.query<{ id: number; available_weight_kg: string }>(
          `SELECT id, available_weight_kg
           FROM copper_coils
           WHERE owner_company_id = $1
             AND diameter_id = $2
             AND available_weight_kg > 0
           ORDER BY receipt_or_production_date ASC, id ASC
           FOR UPDATE`,
          [input.ownerCompanyId, input.conductorDiameterId]
        );

        let remainingToIssue = requestedBulk;
        for (const pc of poolCoils.rows) {
          if (remainingToIssue.lessThanOrEqualTo(0)) break;
          const avail = D(pc.available_weight_kg);
          const take = avail.lessThan(remainingToIssue) ? avail : remainingToIssue;
          allocations.push({
            coilId: pc.id,
            issuedWeight: take,
            attributionMethod: 'UNRESOLVED_POOL_ESTIMATE',
          });
          remainingToIssue = remainingToIssue.minus(take);
        }

        if (remainingToIssue.greaterThan('0.0001')) {
          throw new Error(
            `Insufficient available copper stock for company ID ${input.ownerCompanyId} at diameter ID ${
              input.conductorDiameterId
            }: short by ${remainingToIssue.toFixed(2)} kg.`
          );
        }
        traceabilityPrecision = 'UNRESOLVED_PENDING_VERIFICATION';
      }
    }

    let totalIssuedWeight = D(0);
    let totalAttributedCost = D(0);

    const validatedItems: Array<{
      coilId: number;
      coilCode: string;
      availBefore: ReturnType<typeof D>;
      availAfter: ReturnType<typeof D>;
      consumedAfter: ReturnType<typeof D>;
      issuedWeight: ReturnType<typeof D>;
      costPerKg: ReturnType<typeof D>;
      totalCost: ReturnType<typeof D>;
      locationId: number;
      attributionMethod: string;
    }> = [];

    for (const alloc of allocations) {
      if (alloc.issuedWeight.lessThanOrEqualTo(0)) {
        throw new Error('Issued weight per coil must be greater than zero.');
      }
      const cRes = await tx.query<{
        id: number;
        coil_code: string;
        owner_company_id: number;
        diameter_id: number;
        current_location_id: number;
        available_weight_kg: string;
        consumed_weight_kg: string;
        effective_cost_per_kg: string;
      }>(
        `SELECT id, coil_code, owner_company_id, diameter_id, current_location_id,
                available_weight_kg, consumed_weight_kg, effective_cost_per_kg
         FROM copper_coils WHERE id = $1 FOR UPDATE`,
        [alloc.coilId]
      );
      if (cRes.rows.length === 0) {
        throw new Error(`Coil ID ${alloc.coilId} not found.`);
      }
      const c = cRes.rows[0];
      if (c.owner_company_id !== input.ownerCompanyId) {
        throw new Error(
          `Coil ${c.coil_code} belongs to a different legal entity. Execute an Intercompany Transfer first.`
        );
      }
      const availBefore = D(c.available_weight_kg);
      if (alloc.issuedWeight.greaterThan(availBefore.plus('0.0001'))) {
        throw new Error(
          `Insufficient available weight on coil ${c.coil_code}: requested ${alloc.issuedWeight.toFixed(
            2
          )} kg, available ${availBefore.toFixed(2)} kg.`
        );
      }
      const availAfter = availBefore.minus(alloc.issuedWeight);
      const consumedAfter = D(c.consumed_weight_kg).plus(alloc.issuedWeight);
      const costPerKg = D(c.effective_cost_per_kg);
      const itemCost = alloc.issuedWeight.times(costPerKg);

      totalIssuedWeight = totalIssuedWeight.plus(alloc.issuedWeight);
      totalAttributedCost = totalAttributedCost.plus(itemCost);

      validatedItems.push({
        coilId: c.id,
        coilCode: c.coil_code,
        availBefore,
        availAfter: availAfter.lessThan(0) ? D(0) : availAfter,
        consumedAfter,
        issuedWeight: alloc.issuedWeight,
        costPerKg,
        totalCost: itemCost,
        locationId: c.current_location_id,
        attributionMethod: alloc.attributionMethod,
      });
    }

    const weightedAvgCostPerKg = totalIssuedWeight.greaterThan(0)
      ? totalAttributedCost.dividedBy(totalIssuedWeight)
      : D(0);

    const issueInsert = await tx.query<{ id: number }>(
      `INSERT INTO cable_production_issues (
        issue_number, cable_batch_number, issue_date, owner_company_id, plant_id,
        cable_category_id, cable_product_description, issue_mode, conductor_diameter_id,
        total_issued_weight_kg, total_attributed_copper_cost, weighted_avg_copper_cost_per_kg,
        traceability_precision, workflow_verification_note, remarks, is_demo
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, 'PENDING_PLANT_CONFIRMATION', $14, $15
      ) RETURNING id`,
      [
        issueNumber,
        input.cableBatchNumber.trim(),
        input.issueDate,
        input.ownerCompanyId,
        input.plantId,
        input.cableCategoryId,
        input.cableProductDescription.trim(),
        input.issueMode,
        input.conductorDiameterId,
        toWeightDb(totalIssuedWeight),
        toMoneyDb(totalAttributedCost),
        toMoneyDb(weightedAvgCostPerKg),
        traceabilityPrecision,
        input.remarks?.trim() || null,
        isDemo,
      ]
    );

    const issueId = issueInsert.rows[0].id;

    for (const item of validatedItems) {
      await tx.query(
        `INSERT INTO cable_issue_items (
          cable_issue_id, coil_id, issued_weight_kg, cost_per_kg, total_cost, attribution_method
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          issueId,
          item.coilId,
          toWeightDb(item.issuedWeight),
          toMoneyDb(item.costPerKg),
          toMoneyDb(item.totalCost),
          item.attributionMethod,
        ]
      );

      const newStatus = item.availAfter.greaterThan('0.0001')
        ? 'PARTIALLY_CONSUMED'
        : 'ISSUED_TO_CABLE';

      await tx.query(
        `UPDATE copper_coils
         SET available_weight_kg = $1,
             consumed_weight_kg = $2,
             status = $3,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $4`,
        [toWeightDb(item.availAfter), toWeightDb(item.consumedAfter), newStatus, item.coilId]
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
          $1, $2, 'CABLE_PRODUCTION_ISSUE', $3,
          $4, $5, $6, $7,
          $8, $9, $10,
          $11, $12,
          'CABLE_ISSUE', $13, $14,
          $15, $16, $17
        )`,
        [
          crypto.randomUUID(),
          input.issueDate,
          item.coilId,
          input.ownerCompanyId,
          input.plantId,
          item.locationId,
          input.conductorDiameterId,
          toWeightDb(item.issuedWeight.negated()),
          toWeightDb(item.availBefore),
          toWeightDb(item.availAfter),
          toMoneyDb(item.costPerKg),
          toMoneyDb(item.totalCost.negated()),
          issueId,
          issueNumber,
          `Issued ${toWeightDb(item.issuedWeight)} kg from ${item.coilCode} to Cable Batch ${
            input.cableBatchNumber
          } (${input.issueMode})`,
          input.actor || 'CABLE_SHOP_OPERATOR',
          isDemo,
        ]
      );
    }

    return {
      issueId,
      issueNumber,
      cableBatchNumber: input.cableBatchNumber.trim(),
      issueMode: input.issueMode,
      totalIssuedWeightKg: toWeightDb(totalIssuedWeight),
      totalAttributedCopperCost: toMoneyDb(totalAttributedCost),
      weightedAvgCopperCostPerKg: toMoneyDb(weightedAvgCostPerKg),
      traceabilityPrecision,
    };
  };

  if (existingTx) {
    return run(existingTx);
  }
  return withTransaction(run);
}

