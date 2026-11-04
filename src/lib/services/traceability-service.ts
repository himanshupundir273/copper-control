import { query } from '../db';

export interface GenealogyNode {
  id: string;
  nodeType:
    | 'PURCHASE_INVOICE'
    | 'RAW_COIL'
    | 'PRODUCTION_BATCH'
    | 'PROCESSED_COIL'
    | 'SCRAP_LOT'
    | 'CABLE_ISSUE';
  stageColumn: number; // 0: Inward Invoice, 1: 8mm Rod Coil, 2: RBD Batch, 3: RBD Wire Coil, 4: Downstream Batch, 5: Fine/Hard Wire Coil, 6: Cable Issue & Batch
  title: string;
  subtitle: string;
  companyName: string;
  weightKg: string;
  availableWeightKg?: string;
  diameterMm?: string;
  rateOrCostPerKg: string;
  date: string;
  status: string;
  precisionBadge?: string;
  isFocal?: boolean;
  metadata: Record<string, any>;
}

export interface GenealogyEdge {
  from: string;
  to: string;
  label: string;
  weightKg: string;
  sharePct?: string;
  precision?: string;
}

export interface RootSourceContribution {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  supplierName: string;
  companyName: string;
  rootCoilCode: string;
  supplierCoilNumber: string | null;
  supplierLotHeatNumber: string | null;
  originalRatePerKg: string;
  contributionPct: string;
  attributedWeightKg: string;
  attributedOriginalCopperCost: string;
  allocationPrecision: string;
  stageDepth: number;
}

export interface TraceabilityGraphResult {
  focalQuery: string;
  focalType: string;
  nodes: GenealogyNode[];
  edges: GenealogyEdge[];
  rootContributions: RootSourceContribution[];
}

/**
 * Build a complete forward + backward multi-stage genealogy graph around any coil, batch, invoice, or cable batch
 */
export async function buildTraceabilityGraph(
  searchIdentifier?: string,
  includeDemo = true
): Promise<TraceabilityGraphResult> {
  const demoFilter = includeDemo ? '' : 'AND c.is_demo = FALSE';

  // If no search identifier provided, pick a coil that has multi-stage or cable-linked history
  let targetCoilIds = new Set<number>();
  let focalTitle = searchIdentifier?.trim() || '';
  let focalType = 'COIL';

  if (!focalTitle) {
    const sampleRes = await query<{ id: number; coil_code: string }>(
      `SELECT c.id, c.coil_code
       FROM copper_coils c
       WHERE c.origin_type IN ('DOWNSTREAM_OUTPUT', 'RBD_OUTPUT') ${demoFilter}
       ORDER BY c.origin_type ASC, c.id DESC
       LIMIT 1`
    );
    if (sampleRes.rows.length > 0) {
      targetCoilIds.add(sampleRes.rows[0].id);
      focalTitle = sampleRes.rows[0].coil_code;
    }
  } else {
    // 1. Check if identifier matches a coil_code or supplier_coil_number
    const cMatch = await query<{ id: number; coil_code: string }>(
      `SELECT id, coil_code FROM copper_coils
       WHERE UPPER(coil_code) = UPPER($1) OR UPPER(supplier_coil_number) = UPPER($1)`,
      [focalTitle]
    );
    if (cMatch.rows.length > 0) {
      cMatch.rows.forEach((r) => targetCoilIds.add(r.id));
      focalType = 'COIL';
    } else {
      // 2. Check if identifier matches a production batch_number
      const bMatch = await query<{ id: number }>(
        `SELECT id FROM production_batches WHERE UPPER(batch_number) = UPPER($1)`,
        [focalTitle]
      );
      if (bMatch.rows.length > 0) {
        focalType = 'PRODUCTION_BATCH';
        const bId = bMatch.rows[0].id;
        const relCoils = await query<{ coil_id: number }>(
          `SELECT input_coil_id AS coil_id FROM production_batch_inputs WHERE batch_id = $1
           UNION
           SELECT output_coil_id AS coil_id FROM production_batch_outputs WHERE batch_id = $1 AND output_coil_id IS NOT NULL`,
          [bId]
        );
        relCoils.rows.forEach((r) => targetCoilIds.add(r.coil_id));
      } else {
        // 3. Check if identifier matches a purchase invoice_number
        const iMatch = await query<{ id: number }>(
          `SELECT id FROM purchase_invoices WHERE UPPER(invoice_number) = UPPER($1)`,
          [focalTitle]
        );
        if (iMatch.rows.length > 0) {
          focalType = 'PURCHASE_INVOICE';
          const iCoils = await query<{ id: number }>(
            `SELECT id FROM copper_coils WHERE source_invoice_id = $1`,
            [iMatch.rows[0].id]
          );
          iCoils.rows.forEach((r) => targetCoilIds.add(r.id));
        } else {
          // 4. Check if identifier matches a cable_batch_number or issue_number
          const cblMatch = await query<{ id: number }>(
            `SELECT id FROM cable_production_issues
             WHERE UPPER(cable_batch_number) = UPPER($1) OR UPPER(issue_number) = UPPER($1)`,
            [focalTitle]
          );
          if (cblMatch.rows.length > 0) {
            focalType = 'CABLE_BATCH';
            const cblCoils = await query<{ coil_id: number }>(
              `SELECT coil_id FROM cable_issue_items WHERE cable_issue_id = $1 AND coil_id IS NOT NULL`,
              [cblMatch.rows[0].id]
            );
            cblCoils.rows.forEach((r) => targetCoilIds.add(r.coil_id));
          }
        }
      }
    }
  }

  const focalCoilIdSnapshot = new Set(targetCoilIds);

  // Expand both upstream (parents) and downstream (children) iteratively across coil_genealogy
  const allCoilIds = new Set<number>(targetCoilIds);
  const allBatchIds = new Set<number>();

  for (let depth = 0; depth < 5; depth++) {
    if (allCoilIds.size === 0) break;
    const idArr = Array.from(allCoilIds);
    const links = await query<{
      batch_id: number;
      parent_coil_id: number;
      child_coil_id: number;
    }>(
      `SELECT batch_id, parent_coil_id, child_coil_id
       FROM coil_genealogy
       WHERE parent_coil_id = ANY($1::int[]) OR child_coil_id = ANY($1::int[])`,
      [idArr]
    );
    let added = false;
    for (const l of links.rows) {
      allBatchIds.add(l.batch_id);
      if (!allCoilIds.has(l.parent_coil_id)) {
        allCoilIds.add(l.parent_coil_id);
        added = true;
      }
      if (!allCoilIds.has(l.child_coil_id)) {
        allCoilIds.add(l.child_coil_id);
        added = true;
      }
    }
    if (!added) break;
  }

  const nodesMap = new Map<string, GenealogyNode>();
  const edges: GenealogyEdge[] = [];

  if (allCoilIds.size === 0) {
    return {
      focalQuery: focalTitle,
      focalType,
      nodes: [],
      edges: [],
      rootContributions: [],
    };
  }

  const coilIdList = Array.from(allCoilIds);

  // Fetch all coils in the connected component
  const coilsRes = await query<{
    id: number;
    coil_code: string;
    supplier_coil_number: string | null;
    supplier_lot_heat_number: string | null;
    company_name: string;
    plant_name: string;
    location_name: string;
    origin_type: string;
    source_invoice_id: number | null;
    source_batch_id: number | null;
    diameter_mm: string;
    processing_stage: string;
    bobbin_number: string | null;
    initial_net_weight_kg: string;
    available_weight_kg: string;
    consumed_weight_kg: string;
    status: string;
    receipt_or_production_date: string;
    original_purchase_rate_per_kg: string;
    effective_cost_per_kg: string;
    lineage_precision: string;
  }>(
    `SELECT c.id, c.coil_code, c.supplier_coil_number, c.supplier_lot_heat_number,
            comp.name AS company_name, p.name AS plant_name, loc.name AS location_name,
            c.origin_type, c.source_invoice_id, c.source_batch_id,
            d.diameter_mm::text, c.processing_stage, c.bobbin_number,
            c.initial_net_weight_kg::text, c.available_weight_kg::text, c.consumed_weight_kg::text,
            c.status, c.receipt_or_production_date::text,
            c.original_purchase_rate_per_kg::text, c.effective_cost_per_kg::text, c.lineage_precision
     FROM copper_coils c
     JOIN companies comp ON comp.id = c.owner_company_id
     JOIN plants p ON p.id = c.plant_id
     JOIN storage_locations loc ON loc.id = c.current_location_id
     JOIN copper_diameters d ON d.id = c.diameter_id
     WHERE c.id = ANY($1::int[])
     ORDER BY c.id ASC`,
    [coilIdList]
  );

  const invoiceIds = new Set<number>();
  for (const c of coilsRes.rows) {
    if (c.source_invoice_id) {
      invoiceIds.add(c.source_invoice_id);
    }
    if (c.source_batch_id) {
      allBatchIds.add(c.source_batch_id);
    }

    const stageCol =
      c.origin_type === 'INWARD_PURCHASE'
        ? 1
        : c.origin_type === 'RBD_OUTPUT'
        ? 3
        : 5;

    const nodeId = `COIL:${c.id}`;
    nodesMap.set(nodeId, {
      id: nodeId,
      nodeType: c.origin_type === 'INWARD_PURCHASE' ? 'RAW_COIL' : 'PROCESSED_COIL',
      stageColumn: stageCol,
      title: c.coil_code,
      subtitle: `${Number(c.diameter_mm).toFixed(2)} mm • ${c.processing_stage.replace(/_/g, ' ')}`,
      companyName: c.company_name,
      weightKg: c.initial_net_weight_kg,
      availableWeightKg: c.available_weight_kg,
      diameterMm: c.diameter_mm,
      rateOrCostPerKg: c.effective_cost_per_kg,
      date: c.receipt_or_production_date,
      status: c.status,
      precisionBadge: c.lineage_precision,
      isFocal:
        c.coil_code.toUpperCase() === focalTitle.toUpperCase() ||
        (focalCoilIdSnapshot.has(c.id) && focalCoilIdSnapshot.size === 1),
      metadata: {
        coilId: c.id,
        supplierCoilNumber: c.supplier_coil_number,
        heatNumber: c.supplier_lot_heat_number,
        bobbinNumber: c.bobbin_number,
        locationName: c.location_name,
        plantName: c.plant_name,
        originalPurchaseRatePerKg: c.original_purchase_rate_per_kg,
        consumedWeightKg: c.consumed_weight_kg,
      },
    });
  }

  // Fetch Purchase Invoices for stage 0
  if (invoiceIds.size > 0) {
    const invRes = await query<{
      id: number;
      invoice_number: string;
      invoice_date: string;
      receipt_date: string;
      supplier_name: string;
      company_name: string;
      total_received_weight_kg: string;
      effective_rate_per_kg: string;
      copper_grade: string;
      supplier_lot_heat_number: string | null;
    }>(
      `SELECT inv.id, inv.invoice_number, inv.invoice_date::text, inv.receipt_date::text,
              s.name AS supplier_name, comp.name AS company_name,
              inv.total_received_weight_kg::text, inv.effective_rate_per_kg::text,
              inv.copper_grade, inv.supplier_lot_heat_number
       FROM purchase_invoices inv
       JOIN suppliers s ON s.id = inv.supplier_id
       JOIN companies comp ON comp.id = inv.purchasing_company_id
       WHERE inv.id = ANY($1::int[])`,
      [Array.from(invoiceIds)]
    );

    for (const inv of invRes.rows) {
      const invNodeId = `INVOICE:${inv.id}`;
      nodesMap.set(invNodeId, {
        id: invNodeId,
        nodeType: 'PURCHASE_INVOICE',
        stageColumn: 0,
        title: inv.invoice_number,
        subtitle: `Supplier: ${inv.supplier_name}`,
        companyName: inv.company_name,
        weightKg: inv.total_received_weight_kg,
        rateOrCostPerKg: inv.effective_rate_per_kg,
        date: inv.receipt_date,
        status: 'RECEIVED',
        precisionBadge: 'ORIGINAL_PURCHASE',
        isFocal: inv.invoice_number.toUpperCase() === focalTitle.toUpperCase(),
        metadata: {
          invoiceDate: inv.invoice_date,
          copperGrade: inv.copper_grade,
          heatNumber: inv.supplier_lot_heat_number,
        },
      });
    }

    for (const c of coilsRes.rows) {
      if (c.source_invoice_id && nodesMap.has(`INVOICE:${c.source_invoice_id}`)) {
        edges.push({
          from: `INVOICE:${c.source_invoice_id}`,
          to: `COIL:${c.id}`,
          label: `${Number(c.initial_net_weight_kg).toFixed(1)} kg`,
          weightKg: c.initial_net_weight_kg,
          sharePct: '100%',
          precision: 'EXACT',
        });
      }
    }
  }

  // Fetch Production Batches & Scrap Lots
  if (allBatchIds.size > 0) {
    const batchIdList = Array.from(allBatchIds);
    const batchRes = await query<{
      id: number;
      batch_number: string;
      production_date: string;
      company_name: string;
      process_code: string;
      process_name: string;
      machine_code: string;
      machine_name: string;
      in_mm: string;
      out_mm: string;
      total_input_weight_kg: string;
      total_usable_output_kg: string;
      scrap_quantity_kg: string;
      process_loss_kg: string;
      unexplained_diff_kg: string;
      reconciliation_status: string;
      usable_output_cost_per_kg: string;
      yield_pct: string;
      is_mixed_source: boolean;
      status: string;
    }>(
      `SELECT b.id, b.batch_number, b.production_date::text,
              comp.name AS company_name,
              pt.code AS process_code, pt.name AS process_name,
              m.code AS machine_code, m.name AS machine_name,
              din.diameter_mm::text AS in_mm, dout.diameter_mm::text AS out_mm,
              b.total_input_weight_kg::text, b.total_usable_output_kg::text,
              b.scrap_quantity_kg::text, b.process_loss_kg::text, b.unexplained_diff_kg::text,
              b.reconciliation_status, b.usable_output_cost_per_kg::text,
              b.yield_pct::text, b.is_mixed_source, b.status
       FROM production_batches b
       JOIN companies comp ON comp.id = b.owner_company_id
       JOIN process_types pt ON pt.id = b.process_type_id
       JOIN machines m ON m.id = b.machine_id
       JOIN copper_diameters din ON din.id = b.input_diameter_id
       JOIN copper_diameters dout ON dout.id = b.output_diameter_id
       WHERE b.id = ANY($1::int[])`,
      [batchIdList]
    );

    for (const b of batchRes.rows) {
      const stageCol = b.process_code === 'RBD' ? 2 : 4;
      const batchNodeId = `BATCH:${b.id}`;
      nodesMap.set(batchNodeId, {
        id: batchNodeId,
        nodeType: 'PRODUCTION_BATCH',
        stageColumn: stageCol,
        title: b.batch_number,
        subtitle: `${b.machine_code} (${Number(b.in_mm).toFixed(2)} → ${Number(b.out_mm).toFixed(
          2
        )} mm)`,
        companyName: b.company_name,
        weightKg: b.total_usable_output_kg,
        diameterMm: b.out_mm,
        rateOrCostPerKg: b.usable_output_cost_per_kg,
        date: b.production_date,
        status: b.reconciliation_status,
        precisionBadge: b.is_mixed_source ? 'WEIGHTED_MIX' : 'SINGLE_SOURCE',
        isFocal: b.batch_number.toUpperCase() === focalTitle.toUpperCase(),
        metadata: {
          processName: b.process_name,
          machineName: b.machine_name,
          totalInputKg: b.total_input_weight_kg,
          scrapKg: b.scrap_quantity_kg,
          processLossKg: b.process_loss_kg,
          unexplainedDiffKg: b.unexplained_diff_kg,
          yieldPct: b.yield_pct,
        },
      });
    }

    // Batch input edges (Input Coil -> Batch)
    const bInputs = await query<{
      batch_id: number;
      input_coil_id: number;
      consumed_weight_kg: string;
      contribution_share_pct: string;
      is_partial_consumption: boolean;
    }>(
      `SELECT batch_id, input_coil_id, consumed_weight_kg::text,
              contribution_share_pct::text, is_partial_consumption
       FROM production_batch_inputs WHERE batch_id = ANY($1::int[])`,
      [batchIdList]
    );

    for (const bi of bInputs.rows) {
      edges.push({
        from: `COIL:${bi.input_coil_id}`,
        to: `BATCH:${bi.batch_id}`,
        label: `${Number(bi.consumed_weight_kg).toFixed(1)} kg (${Number(
          bi.contribution_share_pct
        ).toFixed(1)}%)${bi.is_partial_consumption ? ' [Partial]' : ''}`,
        weightKg: bi.consumed_weight_kg,
        sharePct: `${Number(bi.contribution_share_pct).toFixed(1)}%`,
      });
    }

    // Batch output edges (Batch -> Output Coil)
    const bOutputs = await query<{
      batch_id: number;
      output_coil_id: number;
      net_weight_kg: string;
    }>(
      `SELECT batch_id, output_coil_id, net_weight_kg::text
       FROM production_batch_outputs
       WHERE batch_id = ANY($1::int[]) AND output_coil_id IS NOT NULL`,
      [batchIdList]
    );

    for (const bo of bOutputs.rows) {
      edges.push({
        from: `BATCH:${bo.batch_id}`,
        to: `COIL:${bo.output_coil_id}`,
        label: `${Number(bo.net_weight_kg).toFixed(1)} kg Out`,
        weightKg: bo.net_weight_kg,
      });
    }

    // Scrap Lots generated by these batches (Scrap Lineage)
    const scrapRes = await query<{
      id: number;
      scrap_code: string;
      batch_id: number;
      scrap_type: string;
      weight_kg: string;
      recovery_valuation_per_kg: string;
      status: string;
      company_name: string;
    }>(
      `SELECT s.id, s.scrap_code, s.batch_id, s.scrap_type, s.weight_kg::text,
              s.recovery_valuation_per_kg::text, s.status, comp.name AS company_name
       FROM scrap_lots s
       JOIN companies comp ON comp.id = s.owner_company_id
       WHERE s.batch_id = ANY($1::int[])`,
      [batchIdList]
    );

    for (const s of scrapRes.rows) {
      const parentBatchNode = nodesMap.get(`BATCH:${s.batch_id}`);
      const stageCol = parentBatchNode ? parentBatchNode.stageColumn + 1 : 3;
      const scrapNodeId = `SCRAP:${s.id}`;
      nodesMap.set(scrapNodeId, {
        id: scrapNodeId,
        nodeType: 'SCRAP_LOT',
        stageColumn: stageCol,
        title: s.scrap_code,
        subtitle: `Scrap: ${s.scrap_type.replace(/_/g, ' ')}`,
        companyName: s.company_name,
        weightKg: s.weight_kg,
        rateOrCostPerKg: s.recovery_valuation_per_kg,
        date: parentBatchNode?.date || '',
        status: s.status,
        precisionBadge: 'SCRAP_LINEAGE',
        metadata: {
          scrapType: s.scrap_type,
        },
      });
      edges.push({
        from: `BATCH:${s.batch_id}`,
        to: scrapNodeId,
        label: `Scrap ${Number(s.weight_kg).toFixed(1)} kg`,
        weightKg: s.weight_kg,
      });
    }
  }

  // Fetch Cable Production Issues linked to any of these coils (Stage 6)
  const cableRes = await query<{
    issue_id: number;
    issue_number: string;
    cable_batch_number: string;
    issue_date: string;
    cable_product_description: string;
    issue_mode: string;
    traceability_precision: string;
    company_name: string;
    coil_id: number;
    issued_weight_kg: string;
    cost_per_kg: string;
    attribution_method: string;
  }>(
    `SELECT ci.id AS issue_id, ci.issue_number, ci.cable_batch_number, ci.issue_date::text,
            ci.cable_product_description, ci.issue_mode, ci.traceability_precision,
            comp.name AS company_name,
            item.coil_id, item.issued_weight_kg::text, item.cost_per_kg::text, item.attribution_method
     FROM cable_issue_items item
     JOIN cable_production_issues ci ON ci.id = item.cable_issue_id
     JOIN companies comp ON comp.id = ci.owner_company_id
     WHERE item.coil_id = ANY($1::int[])`,
    [coilIdList]
  );

  for (const cbl of cableRes.rows) {
    const cblNodeId = `CABLE:${cbl.issue_id}`;
    if (!nodesMap.has(cblNodeId)) {
      nodesMap.set(cblNodeId, {
        id: cblNodeId,
        nodeType: 'CABLE_ISSUE',
        stageColumn: 6,
        title: cbl.cable_batch_number,
        subtitle: `${cbl.cable_product_description} (${cbl.issue_mode})`,
        companyName: cbl.company_name,
        weightKg: cbl.issued_weight_kg,
        rateOrCostPerKg: cbl.cost_per_kg,
        date: cbl.issue_date,
        status: 'ISSUED_TO_CABLE',
        precisionBadge: cbl.traceability_precision,
        isFocal:
          cbl.cable_batch_number.toUpperCase() === focalTitle.toUpperCase() ||
          cbl.issue_number.toUpperCase() === focalTitle.toUpperCase(),
        metadata: {
          issueNumber: cbl.issue_number,
          issueMode: cbl.issue_mode,
          attributionMethod: cbl.attribution_method,
        },
      });
    }
    edges.push({
      from: `COIL:${cbl.coil_id}`,
      to: cblNodeId,
      label: `Issue ${Number(cbl.issued_weight_kg).toFixed(1)} kg`,
      weightKg: cbl.issued_weight_kg,
      precision: cbl.traceability_precision,
    });
  }

  // Fetch Root Purchase Invoice Contributions for the focal coil(s)
  const rootQueryIds =
    focalCoilIdSnapshot.size > 0 ? Array.from(focalCoilIdSnapshot) : coilIdList;

  const rootsRes = await query<{
    invoice_id: number;
    invoice_number: string;
    invoice_date: string;
    supplier_name: string;
    company_name: string;
    root_coil_code: string;
    supplier_coil_number: string | null;
    supplier_lot_heat_number: string | null;
    original_rate_per_kg: string;
    contribution_pct: string;
    attributed_weight_kg: string;
    allocation_precision: string;
    stage_depth: number;
  }>(
    `SELECT inv.id AS invoice_id, inv.invoice_number, inv.invoice_date::text,
            s.name AS supplier_name, comp.name AS company_name,
            rc.coil_code AS root_coil_code, rc.supplier_coil_number, rc.supplier_lot_heat_number,
            ro.original_rate_per_kg::text, ro.contribution_pct::text,
            ro.attributed_weight_kg::text, ro.allocation_precision, ro.stage_depth
     FROM coil_root_origins ro
     JOIN copper_coils rc ON rc.id = ro.root_coil_id
     JOIN purchase_invoices inv ON inv.id = ro.root_invoice_id
     JOIN suppliers s ON s.id = inv.supplier_id
     JOIN companies comp ON comp.id = inv.purchasing_company_id
     WHERE ro.coil_id = ANY($1::int[])
     ORDER BY ro.contribution_pct DESC`,
    [rootQueryIds]
  );

  const rootContributions: RootSourceContribution[] = rootsRes.rows.map((r) => ({
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    supplierName: r.supplier_name,
    companyName: r.company_name,
    rootCoilCode: r.root_coil_code,
    supplierCoilNumber: r.supplier_coil_number,
    supplierLotHeatNumber: r.supplier_lot_heat_number,
    originalRatePerKg: r.original_rate_per_kg,
    contributionPct: r.contribution_pct,
    attributedWeightKg: r.attributed_weight_kg,
    attributedOriginalCopperCost: (
      Number(r.attributed_weight_kg) * Number(r.original_rate_per_kg)
    ).toFixed(2),
    allocationPrecision: r.allocation_precision,
    stageDepth: r.stage_depth,
  }));

  return {
    focalQuery: focalTitle,
    focalType,
    nodes: Array.from(nodesMap.values()),
    edges,
    rootContributions,
  };
}

