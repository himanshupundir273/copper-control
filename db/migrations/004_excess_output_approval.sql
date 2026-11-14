-- ============================================================================
-- Copper Control Tower — Migration 004: Approved Excess Output Weight
-- ============================================================================
-- A batch whose accounted output weighs more than its input (scale variance,
-- tare error, moisture/lubricant pickup, etc.) may now be posted, provided the
-- operator records a reason. Such batches carry reconciliation_status
-- 'EXCESS_OUTPUT' and a negative unexplained_diff_kg.

ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS excess_weight_reason TEXT;

ALTER TABLE production_batches
  DROP CONSTRAINT IF EXISTS production_batches_reconciliation_status_check;

ALTER TABLE production_batches
  ADD CONSTRAINT production_batches_reconciliation_status_check
  CHECK (reconciliation_status IN (
    'DRAFT', 'RECONCILED', 'UNEXPLAINED_SHORTAGE', 'EXCESS_OUTPUT'
  ));

-- Relax the hard invariant from 001: accounted output may exceed input only
-- when a reason has been recorded.
ALTER TABLE production_batches
  DROP CONSTRAINT IF EXISTS chk_batch_output_not_exceeding_input;

ALTER TABLE production_batches
  ADD CONSTRAINT chk_batch_output_not_exceeding_input
  CHECK (
    status = 'DRAFT'
    OR total_usable_output_kg + scrap_quantity_kg + recoverable_waste_kg + process_loss_kg <= total_input_weight_kg + 0.0001
    OR (excess_weight_reason IS NOT NULL AND LENGTH(TRIM(excess_weight_reason)) > 0)
  );

-- An excess-output batch must always carry its reason.
ALTER TABLE production_batches
  DROP CONSTRAINT IF EXISTS production_batches_excess_reason_required;

ALTER TABLE production_batches
  ADD CONSTRAINT production_batches_excess_reason_required
  CHECK (
    reconciliation_status <> 'EXCESS_OUTPUT'
    OR (excess_weight_reason IS NOT NULL AND LENGTH(TRIM(excess_weight_reason)) > 0)
  );
