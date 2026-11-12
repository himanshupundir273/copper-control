import { query } from '../db';

export async function getDashboardData(includeDemo = true) {
  const demoFilterCoil = includeDemo ? '' : 'AND c.is_demo = FALSE';
  const demoFilterBatch = includeDemo ? '' : 'AND b.is_demo = FALSE';
  const demoFilterScrap = includeDemo ? '' : 'AND s.is_demo = FALSE';

  // 1. Total stock & Inventory value
  const totalsRes = await query<{
    total_available_kg: string;
    total_reserved_kg: string;
    total_inventory_value: string;
    awaiting_further_processing_kg: string;
    active_coils_count: string;
  }>(
    `SELECT
       COALESCE(SUM(c.available_weight_kg), 0)::text AS total_available_kg,
       COALESCE(SUM(c.reserved_weight_kg), 0)::text AS total_reserved_kg,
       COALESCE(SUM((c.available_weight_kg + c.reserved_weight_kg) * c.effective_cost_per_kg), 0)::text AS total_inventory_value,
       COALESCE(SUM(CASE WHEN c.processing_stage IN ('RAW_8MM_ROD', 'RBD_DRAWN') THEN c.available_weight_kg ELSE 0 END), 0)::text AS awaiting_further_processing_kg,
       COUNT(CASE WHEN c.available_weight_kg > 0 OR c.reserved_weight_kg > 0 THEN 1 END)::text AS active_coils_count
     FROM copper_coils c
     WHERE 1=1 ${demoFilterCoil}`
  );

  // 2. Stock by Company
  const byCompanyRes = await query<{
    company_id: number;
    company_code: string;
    company_name: string;
    available_kg: string;
    reserved_kg: string;
    inventory_value: string;
    coil_count: string;
  }>(
    `SELECT
       comp.id AS company_id,
       comp.code AS company_code,
       comp.name AS company_name,
       COALESCE(SUM(c.available_weight_kg), 0)::text AS available_kg,
       COALESCE(SUM(c.reserved_weight_kg), 0)::text AS reserved_kg,
       COALESCE(SUM((c.available_weight_kg + c.reserved_weight_kg) * c.effective_cost_per_kg), 0)::text AS inventory_value,
       COUNT(CASE WHEN c.available_weight_kg > 0 THEN 1 END)::text AS coil_count
     FROM companies comp
     LEFT JOIN copper_coils c ON c.owner_company_id = comp.id ${demoFilterCoil}
     WHERE comp.is_active = TRUE
     GROUP BY comp.id, comp.code, comp.name
     ORDER BY comp.id`
  );

  // 3. Stock by Diameter
  const byDiameterRes = await query<{
    diameter_id: number;
    diameter_mm: string;
    label: string;
    verification_status: string;
    available_kg: string;
    reserved_kg: string;
    coil_count: string;
  }>(
    `SELECT
       d.id AS diameter_id,
       d.diameter_mm::text,
       d.label,
       d.verification_status,
       COALESCE(SUM(c.available_weight_kg), 0)::text AS available_kg,
       COALESCE(SUM(c.reserved_weight_kg), 0)::text AS reserved_kg,
       COUNT(CASE WHEN c.available_weight_kg > 0 THEN 1 END)::text AS coil_count
     FROM copper_diameters d
     LEFT JOIN copper_coils c ON c.diameter_id = d.id ${demoFilterCoil}
     WHERE d.is_active = TRUE
     GROUP BY d.id, d.diameter_mm, d.label, d.verification_status
     ORDER BY d.diameter_mm DESC`
  );

  // 4. Stock by Processing Stage
  const byStageRes = await query<{
    processing_stage: string;
    available_kg: string;
    reserved_kg: string;
    inventory_value: string;
    coil_count: string;
  }>(
    `SELECT
       c.processing_stage,
       COALESCE(SUM(c.available_weight_kg), 0)::text AS available_kg,
       COALESCE(SUM(c.reserved_weight_kg), 0)::text AS reserved_kg,
       COALESCE(SUM((c.available_weight_kg + c.reserved_weight_kg) * c.effective_cost_per_kg), 0)::text AS inventory_value,
       COUNT(*)::text AS coil_count
     FROM copper_coils c
     WHERE (c.available_weight_kg > 0 OR c.reserved_weight_kg > 0) ${demoFilterCoil}
     GROUP BY c.processing_stage
     ORDER BY available_kg DESC`
  );

  // 5. Production & Yield KPIs
  const prodStatsRes = await query<{
    rbd_output_kg: string;
    today_rbd_output_kg: string;
    total_input_kg: string;
    total_usable_output_kg: string;
    total_scrap_kg: string;
    unreconciled_batches_count: string;
    total_unexplained_kg: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN pt.code = 'RBD' THEN b.total_usable_output_kg ELSE 0 END), 0)::text AS rbd_output_kg,
       COALESCE(SUM(CASE WHEN pt.code = 'RBD' AND b.production_date >= CURRENT_DATE - INTERVAL '3 days' THEN b.total_usable_output_kg ELSE 0 END), 0)::text AS today_rbd_output_kg,
       COALESCE(SUM(b.total_input_weight_kg), 0)::text AS total_input_kg,
       COALESCE(SUM(b.total_usable_output_kg), 0)::text AS total_usable_output_kg,
       COALESCE(SUM(b.scrap_quantity_kg + b.recoverable_waste_kg), 0)::text AS total_scrap_kg,
       COUNT(CASE WHEN b.reconciliation_status = 'UNEXPLAINED_SHORTAGE' THEN 1 END)::text AS unreconciled_batches_count,
       COALESCE(SUM(CASE WHEN b.reconciliation_status = 'UNEXPLAINED_SHORTAGE' THEN b.unexplained_diff_kg ELSE 0 END), 0)::text AS total_unexplained_kg
     FROM production_batches b
     JOIN process_types pt ON pt.id = b.process_type_id
     WHERE b.status = 'POSTED' ${demoFilterBatch}`
  );

  // 6. Scrap Stock
  const scrapRes = await query<{
    in_stock_scrap_kg: string;
    in_stock_scrap_value: string;
  }>(
    `SELECT
       COALESCE(SUM(s.weight_kg), 0)::text AS in_stock_scrap_kg,
       COALESCE(SUM(s.total_recovery_value), 0)::text AS in_stock_scrap_value
     FROM scrap_lots s
     WHERE s.status = 'IN_STOCK' ${demoFilterScrap}`
  );

  // 7. Unreconciled Batches Alert List
  const unreconciledList = await query<{
    id: number;
    batch_number: string;
    production_date: string;
    machine_code: string;
    company_name: string;
    total_input_weight_kg: string;
    total_usable_output_kg: string;
    unexplained_diff_kg: string;
    operator_name: string;
    remarks: string | null;
  }>(
    `SELECT b.id, b.batch_number, b.production_date::text, m.code AS machine_code,
            comp.name AS company_name, b.total_input_weight_kg::text,
            b.total_usable_output_kg::text, b.unexplained_diff_kg::text,
            b.operator_name, b.remarks
     FROM production_batches b
     JOIN machines m ON m.id = b.machine_id
     JOIN companies comp ON comp.id = b.owner_company_id
     WHERE b.status = 'POSTED' AND b.reconciliation_status = 'UNEXPLAINED_SHORTAGE' ${demoFilterBatch}
     ORDER BY b.production_date DESC, b.id DESC`
  );

  // 8. Recent Inventory Movements (Immutable Ledger Feed)
  const recentMovements = await query<{
    id: string;
    movement_date: string;
    movement_type: string;
    coil_code: string | null;
    company_name: string;
    weight_delta_kg: string;
    balance_after_kg: string;
    unit_rate_per_kg: string;
    reference_number: string;
    notes: string | null;
    is_demo: boolean;
  }>(
    `SELECT m.id::text, m.movement_date::text, m.movement_type,
            c.coil_code, comp.name AS company_name,
            m.weight_delta_kg::text, m.balance_after_kg::text,
            m.unit_rate_per_kg::text, m.reference_number, m.notes, m.is_demo
     FROM inventory_movements m
     JOIN companies comp ON comp.id = m.owner_company_id
     LEFT JOIN copper_coils c ON c.id = m.coil_id
     WHERE 1=1 ${includeDemo ? '' : 'AND m.is_demo = FALSE'}
     ORDER BY m.id DESC
     LIMIT 250`
  );

  // 9. Monthly Purchase vs RBD Production Summary (Report Sheet)
  const monthlySummaryRes = await query<{
    month_index: number;
    month_label: string;
    rbd_month_code: string;
    billing_copper_kg: string;
    receive_copper_kg: string;
    receive_aluminium_kg: string;
    rbd_0900_kg: string;
    rbd_1400_kg: string;
    rbd_1800_kg: string;
    rbd_total_kg: string;
  }>(
    `SELECT month_index, month_label, rbd_month_code,
            billing_copper_kg::text, receive_copper_kg::text, receive_aluminium_kg::text,
            rbd_0900_kg::text, rbd_1400_kg::text, rbd_1800_kg::text, rbd_total_kg::text
     FROM monthly_plant_summary
     ORDER BY month_index ASC`
  );

  const pStats = prodStatsRes.rows[0];
  const overallYieldPct =
    Number(pStats.total_input_kg) > 0
      ? ((Number(pStats.total_usable_output_kg) / Number(pStats.total_input_kg)) * 100).toFixed(2)
      : '0.00';

  return {
    summary: {
      ...totalsRes.rows[0],
      ...pStats,
      ...scrapRes.rows[0],
      overall_yield_pct: overallYieldPct,
    },
    monthlySummary: monthlySummaryRes.rows,
    byCompany: byCompanyRes.rows,
    byDiameter: byDiameterRes.rows,
    byStage: byStageRes.rows,
    unreconciledBatches: unreconciledList.rows,
    recentMovements: recentMovements.rows,
  };
}

/**
 * Generate any of the 10 Operational & Management Reports (Module 9) with filters
 */
export async function generateReportData(params: {
  reportKey: string;
  companyId?: number;
  machineId?: number;
  diameterId?: number;
  fromDate?: string;
  toDate?: string;
  batchSearch?: string;
  includeDemo?: boolean;
}) {
  const includeDemo = params.includeDemo ?? true;
  const values: any[] = [];
  const addParam = (val: any) => {
    values.push(val);
    return `$${values.length}`;
  };

  switch (params.reportKey) {
    case 'inward_register': {
      let where = includeDemo ? 'WHERE 1=1' : 'WHERE inv.is_demo = FALSE';
      if (params.companyId) where += ` AND inv.purchasing_company_id = ${addParam(params.companyId)}`;
      if (params.diameterId) where += ` AND inv.input_diameter_id = ${addParam(params.diameterId)}`;
      if (params.fromDate) where += ` AND inv.receipt_date >= ${addParam(params.fromDate)}`;
      if (params.toDate) where += ` AND inv.receipt_date <= ${addParam(params.toDate)}`;

      const res = await query(
        `SELECT
           inv.invoice_number AS "Invoice No",
           inv.invoice_date::text AS "Invoice Date",
           comp.name AS "Bill To",
           s.name AS "Vendor Name",
           inv.copper_grade AS "Particulars",
           d.diameter_mm::text || ' mm' AS "Size",
           inv.number_of_coils AS "No. of Coils",
           ROUND(COALESCE(inv.vendor_billed_weight_kg, inv.total_received_weight_kg), 2)::text AS "Vendor Qty (kg)",
           ROUND(inv.total_received_weight_kg, 2)::text AS "Receive Qty (kg)",
           ROUND(COALESCE(inv.weight_diff_loss_kg, 0), 2)::text AS "Wt. Loss / Diff (kg)",
           ROUND(inv.effective_rate_per_kg, 2)::text AS "Copper Avg Rate/kg (INR)",
           ROUND(inv.total_invoice_copper_value, 2)::text AS "Total Value (INR)",
           loc.name AS "Storage Location"
         FROM purchase_invoices inv
         JOIN companies comp ON comp.id = inv.purchasing_company_id
         JOIN suppliers s ON s.id = inv.supplier_id
         JOIN copper_diameters d ON d.id = inv.input_diameter_id
         JOIN storage_locations loc ON loc.id = inv.storage_location_id
         ${where}
         ORDER BY inv.receipt_date DESC, inv.id DESC`,
        values
      );
      return res.rows;
    }

    case 'rbd_production_register': {
      let where = includeDemo ? 'WHERE 1=1' : 'WHERE b.is_demo = FALSE';
      if (params.companyId) where += ` AND b.owner_company_id = ${addParam(params.companyId)}`;
      if (params.machineId) where += ` AND b.machine_id = ${addParam(params.machineId)}`;
      if (params.diameterId) where += ` AND b.output_diameter_id = ${addParam(params.diameterId)}`;
      if (params.fromDate) where += ` AND b.production_date >= ${addParam(params.fromDate)}`;
      if (params.toDate) where += ` AND b.production_date <= ${addParam(params.toDate)}`;
      if (params.batchSearch) {
        where += ` AND UPPER(b.batch_number) LIKE UPPER(${addParam(`%${params.batchSearch}%`)})`;
      }

      const res = await query(
        `SELECT
           b.batch_number AS "Batch Number",
           b.production_date::text AS "Date",
           pt.code AS "Process",
           m.code AS "Machine",
           comp.name AS "Owner Company",
           din.diameter_mm::text || ' -> ' || dout.diameter_mm::text || ' mm' AS "Size Route",
           ROUND(b.total_input_weight_kg, 2)::text AS "Input (kg)",
           ROUND(b.total_usable_output_kg, 2)::text AS "Usable Output (kg)",
           ROUND(b.scrap_quantity_kg, 2)::text AS "Scrap (kg)",
           ROUND(b.recoverable_waste_kg, 2)::text AS "Recov. Waste (kg)",
           ROUND(b.process_loss_kg, 2)::text AS "Process Loss (kg)",
           ROUND(b.unexplained_diff_kg, 2)::text AS "Unexplained Diff (kg)",
           ROUND(b.yield_pct, 2)::text || '%' AS "Yield %",
           b.reconciliation_status AS "Reconciliation",
           ROUND(b.weighted_avg_input_rate_per_kg, 2)::text AS "Input Cu Rate/kg",
           ROUND(b.usable_output_cost_per_kg, 2)::text AS "Output Cost/kg",
           b.status AS "Status"
         FROM production_batches b
         JOIN process_types pt ON pt.id = b.process_type_id
         JOIN machines m ON m.id = b.machine_id
         JOIN companies comp ON comp.id = b.owner_company_id
         JOIN copper_diameters din ON din.id = b.input_diameter_id
         JOIN copper_diameters dout ON dout.id = b.output_diameter_id
         ${where}
         ORDER BY b.production_date DESC, b.id DESC`,
        values
      );
      return res.rows;
    }

    case 'coil_stock_register': {
      let where = includeDemo ? 'WHERE 1=1' : 'WHERE c.is_demo = FALSE';
      if (params.companyId) where += ` AND c.owner_company_id = ${addParam(params.companyId)}`;
      if (params.diameterId) where += ` AND c.diameter_id = ${addParam(params.diameterId)}`;
      if (params.batchSearch) {
        where += ` AND (UPPER(c.coil_code) LIKE UPPER(${addParam(`%${params.batchSearch}%`)}) OR UPPER(COALESCE(c.supplier_coil_number, '')) LIKE UPPER($${values.length}))`;
      }

      const res = await query(
        `SELECT
           c.coil_code AS "Internal Coil ID",
           COALESCE(c.supplier_coil_number, c.bobbin_number, '-') AS "Supplier Coil / Bobbin",
           comp.name AS "Legal Owner Company",
           p.name AS "Physical Plant",
           loc.name AS "Storage Location",
           d.diameter_mm::text || ' mm' AS "Diameter",
           c.processing_stage AS "Processing Stage",
           ROUND(c.initial_net_weight_kg, 2)::text AS "Initial Net (kg)",
           ROUND(c.available_weight_kg, 2)::text AS "Available (kg)",
           ROUND(c.reserved_weight_kg, 2)::text AS "Reserved (kg)",
           ROUND(c.consumed_weight_kg, 2)::text AS "Consumed (kg)",
           c.status AS "Status",
           c.receipt_or_production_date::text AS "Date",
           ROUND(c.original_purchase_rate_per_kg, 2)::text AS "Orig Purchase Rate/kg",
           ROUND(c.effective_cost_per_kg, 2)::text AS "Effective Cost/kg",
           ROUND(c.available_weight_kg * c.effective_cost_per_kg, 2)::text AS "Available Value (INR)",
           c.lineage_precision AS "Lineage Precision"
         FROM copper_coils c
         JOIN companies comp ON comp.id = c.owner_company_id
         JOIN plants p ON p.id = c.plant_id
         JOIN storage_locations loc ON loc.id = c.current_location_id
         JOIN copper_diameters d ON d.id = c.diameter_id
         ${where}
         ORDER BY c.id DESC`,
        values
      );
      return res.rows;
    }

    case 'machine_production_report': {
      let where = includeDemo ? "WHERE b.status = 'POSTED'" : "WHERE b.status = 'POSTED' AND b.is_demo = FALSE";
      if (params.companyId) where += ` AND b.owner_company_id = ${addParam(params.companyId)}`;
      if (params.machineId) where += ` AND b.machine_id = ${addParam(params.machineId)}`;

      const res = await query(
        `SELECT
           m.code AS "Machine Code",
           m.name AS "Machine Name",
           pt.name AS "Process Type",
           p.name AS "Plant",
           COUNT(b.id)::text AS "Total Batches",
           ROUND(SUM(b.total_input_weight_kg), 2)::text AS "Total Input (kg)",
           ROUND(SUM(b.total_usable_output_kg), 2)::text AS "Total Usable Output (kg)",
           ROUND(SUM(b.scrap_quantity_kg + b.recoverable_waste_kg), 2)::text AS "Total Scrap (kg)",
           ROUND(SUM(b.process_loss_kg), 2)::text AS "Total Process Loss (kg)",
           ROUND(AVG(b.yield_pct), 2)::text || '%' AS "Avg Yield %"
         FROM production_batches b
         JOIN machines m ON m.id = b.machine_id
         JOIN process_types pt ON pt.id = b.process_type_id
         JOIN plants p ON p.id = b.plant_id
         ${where}
         GROUP BY m.code, m.name, pt.name, p.name
         ORDER BY SUM(b.total_usable_output_kg) DESC`,
        values
      );
      return res.rows;
    }

    case 'diameter_output_report': {
      let where = includeDemo ? "WHERE b.status = 'POSTED'" : "WHERE b.status = 'POSTED' AND b.is_demo = FALSE";
      if (params.companyId) where += ` AND b.owner_company_id = ${addParam(params.companyId)}`;
      if (params.diameterId) where += ` AND b.output_diameter_id = ${addParam(params.diameterId)}`;

      const res = await query(
        `SELECT
           dout.diameter_mm::text || ' mm' AS "Output Diameter",
           dout.label AS "Description",
           pt.name AS "Process Stage",
           COUNT(b.id)::text AS "Batches Run",
           ROUND(SUM(b.total_input_weight_kg), 2)::text AS "Input Consumed (kg)",
           ROUND(SUM(b.total_usable_output_kg), 2)::text AS "Usable Wire Produced (kg)",
           ROUND(AVG(b.yield_pct), 2)::text || '%' AS "Avg Yield %",
           ROUND(AVG(b.usable_output_cost_per_kg), 2)::text AS "Avg Output Cost/kg (INR)"
         FROM production_batches b
         JOIN copper_diameters dout ON dout.id = b.output_diameter_id
         JOIN process_types pt ON pt.id = b.process_type_id
         ${where}
         GROUP BY dout.diameter_mm, dout.label, pt.name
         ORDER BY dout.diameter_mm DESC`,
        values
      );
      return res.rows;
    }

    case 'scrap_wastage_report': {
      let where = includeDemo ? "WHERE b.status = 'POSTED'" : "WHERE b.status = 'POSTED' AND b.is_demo = FALSE";
      if (params.companyId) where += ` AND b.owner_company_id = ${addParam(params.companyId)}`;
      if (params.machineId) where += ` AND b.machine_id = ${addParam(params.machineId)}`;

      const res = await query(
        `SELECT
           b.batch_number AS "Batch Number",
           b.production_date::text AS "Date",
           m.code AS "Machine",
           din.diameter_mm::text || ' -> ' || dout.diameter_mm::text || ' mm' AS "Route",
           ROUND(b.total_input_weight_kg, 2)::text AS "Input (kg)",
           ROUND(b.scrap_quantity_kg, 2)::text AS "Drawing Scrap (kg)",
           ROUND(b.recoverable_waste_kg, 2)::text AS "Recoverable Waste (kg)",
           ROUND(b.process_loss_kg, 2)::text AS "Process Loss (kg)",
           ROUND(b.unexplained_diff_kg, 2)::text AS "Unexplained Diff (kg)",
           ROUND(b.actual_wastage_pct, 2)::text || '%' AS "Actual Wastage %",
           ROUND(b.standard_wastage_pct, 2)::text || '%' AS "Standard Wastage %",
           ROUND(b.actual_wastage_pct - b.standard_wastage_pct, 2)::text || '%' AS "Variance vs Std %",
           ROUND(b.scrap_recovery_credit_total, 2)::text AS "Scrap Recovery Credit (INR)"
         FROM production_batches b
         JOIN machines m ON m.id = b.machine_id
         JOIN copper_diameters din ON din.id = b.input_diameter_id
         JOIN copper_diameters dout ON dout.id = b.output_diameter_id
         ${where}
         ORDER BY b.production_date DESC, b.id DESC`,
        values
      );
      return res.rows;
    }

    case 'purchase_rate_history': {
      let where = includeDemo ? 'WHERE 1=1' : 'WHERE inv.is_demo = FALSE';
      if (params.companyId) where += ` AND inv.purchasing_company_id = ${addParam(params.companyId)}`;

      const res = await query(
        `SELECT
           inv.invoice_date::text AS "Invoice Date",
           inv.invoice_number AS "Invoice No",
           comp.name AS "Purchasing Company",
           s.name AS "Supplier",
           inv.copper_grade AS "Copper Grade",
           ROUND(inv.total_received_weight_kg, 2)::text AS "Purchased Weight (kg)",
           ROUND(inv.purchase_rate, 2)::text || ' ' || inv.rate_unit AS "Billed Rate",
           ROUND(inv.effective_rate_per_kg, 2)::text AS "Normalized Rate/kg (INR)",
           ROUND(inv.total_invoice_copper_value, 2)::text AS "Invoice Value (INR)"
         FROM purchase_invoices inv
         JOIN companies comp ON comp.id = inv.purchasing_company_id
         JOIN suppliers s ON s.id = inv.supplier_id
         ${where}
         ORDER BY inv.invoice_date DESC, inv.id DESC`,
        values
      );
      return res.rows;
    }

    case 'traceability_report': {
      let where = includeDemo ? 'WHERE 1=1' : 'WHERE c.is_demo = FALSE';
      if (params.companyId) where += ` AND c.owner_company_id = ${addParam(params.companyId)}`;

      const res = await query(
        `SELECT
           c.coil_code AS "Coil / Bobbin ID",
           d.diameter_mm::text || ' mm' AS "Diameter",
           c.processing_stage AS "Stage",
           comp.name AS "Owner Company",
           rc.coil_code AS "Source 8mm Rod ID",
           COALESCE(rc.supplier_coil_number, '-') AS "Supplier Coil No",
           inv.invoice_number AS "Source Invoice No",
           s.name AS "Original Supplier",
           ROUND(ro.contribution_pct, 2)::text || '%' AS "Source Share %",
           ROUND(ro.attributed_weight_kg, 2)::text AS "Attributed Weight (kg)",
           ROUND(ro.original_rate_per_kg, 2)::text AS "Original Purchase Rate/kg",
           ro.allocation_precision AS "Precision"
         FROM coil_root_origins ro
         JOIN copper_coils c ON c.id = ro.coil_id
         JOIN copper_diameters d ON d.id = c.diameter_id
         JOIN companies comp ON comp.id = c.owner_company_id
         JOIN copper_coils rc ON rc.id = ro.root_coil_id
         JOIN purchase_invoices inv ON inv.id = ro.root_invoice_id
         JOIN suppliers s ON s.id = inv.supplier_id
         ${where}
         ORDER BY c.id DESC, ro.contribution_pct DESC`,
        values
      );
      return res.rows;
    }

    case 'material_consumption_report': {
      let where = includeDemo ? "WHERE b.status = 'POSTED'" : "WHERE b.status = 'POSTED' AND b.is_demo = FALSE";
      if (params.companyId) where += ` AND b.owner_company_id = ${addParam(params.companyId)}`;

      const res = await query(
        `SELECT
           b.batch_number AS "Batch Number",
           b.production_date::text AS "Date",
           pt.code AS "Process",
           m.code AS "Machine",
           c.coil_code AS "Input Coil ID",
           COALESCE(c.supplier_coil_number, c.bobbin_number, '-') AS "Supplier Coil / Bobbin",
           ROUND(bi.available_before_kg, 2)::text AS "Available Before (kg)",
           ROUND(bi.consumed_weight_kg, 2)::text AS "Consumed (kg)",
           ROUND(bi.remaining_after_kg, 2)::text AS "Remaining After (kg)",
           CASE WHEN bi.is_partial_consumption THEN 'PARTIAL' ELSE 'FULL' END AS "Consumption Type",
           ROUND(bi.contribution_share_pct, 2)::text || '%' AS "Batch Share %",
           ROUND(bi.source_purchase_rate_per_kg, 2)::text AS "Orig Purchase Rate/kg",
           ROUND(bi.allocated_input_cost, 2)::text AS "Allocated Input Cost (INR)"
         FROM production_batch_inputs bi
         JOIN production_batches b ON b.id = bi.batch_id
         JOIN process_types pt ON pt.id = b.process_type_id
         JOIN machines m ON m.id = b.machine_id
         JOIN copper_coils c ON c.id = bi.input_coil_id
         ${where}
         ORDER BY b.production_date DESC, b.id DESC`,
        values
      );
      return res.rows;
    }

    case 'intercompany_movement_report': {
      let where = includeDemo ? 'WHERE 1=1' : 'WHERE ic.is_demo = FALSE';
      if (params.companyId) {
        const p = addParam(params.companyId);
        where += ` AND (ic.from_company_id = ${p} OR ic.to_company_id = ${p})`;
      }

      const res = await query(
        `SELECT
           ic.transfer_number AS "Transfer No",
           ic.transfer_date::text AS "Date",
           cfrom.name AS "From Legal Owner",
           cto.name AS "To Legal Owner",
           c.coil_code AS "Coil / Bobbin ID",
           d.diameter_mm::text || ' mm' AS "Diameter",
           p.name AS "Physical Plant (Unchanged)",
           ROUND(ic.weight_transferred_kg, 2)::text AS "Weight Transferred (kg)",
           ROUND(ic.original_purchase_rate_per_kg, 2)::text AS "Preserved Purchase Rate/kg",
           ic.transfer_reference_doc AS "Supporting Reference",
           ic.authorized_by AS "Authorized By",
           ic.transfer_reason AS "Reason"
         FROM intercompany_transfers ic
         JOIN companies cfrom ON cfrom.id = ic.from_company_id
         JOIN companies cto ON cto.id = ic.to_company_id
         JOIN copper_coils c ON c.id = ic.coil_id
         JOIN copper_diameters d ON d.id = c.diameter_id
         JOIN plants p ON p.id = c.plant_id
         ${where}
         ORDER BY ic.transfer_date DESC, ic.id DESC`,
        values
      );
      return res.rows;
    }

    default:
      return [];
  }
}

