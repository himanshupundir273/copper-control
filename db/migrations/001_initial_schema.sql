-- ============================================================================
-- Copper Control Tower — Migration 001: Core Schema & Invariants
-- Compatible with standard PostgreSQL 14+ and Supabase
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 1. Legal Entities (Companies), Plants & Storage Locations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  legal_name VARCHAR(200) NOT NULL,
  gstin VARCHAR(32),
  base_currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  coil_prefix VARCHAR(12) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plants (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  operated_by_company_id INTEGER NOT NULL REFERENCES companies(id),
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER NOT NULL REFERENCES plants(id),
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  location_type VARCHAR(40) NOT NULL CHECK (location_type IN (
    'RAW_ROD_YARD', 'RBD_FLOOR', 'FINE_WIRE_WIP', 'HARD_COPPER_WIP', 'SCRAP_BAY', 'CABLE_SHOP', 'QUARANTINE'
  )),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Master Data (Module 4) with Verification Status
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copper_diameters (
  id SERIAL PRIMARY KEY,
  diameter_mm NUMERIC(8, 4) UNIQUE NOT NULL CHECK (diameter_mm > 0),
  label VARCHAR(64) NOT NULL,
  swg_awg_ref VARCHAR(64),
  category VARCHAR(40) NOT NULL CHECK (category IN (
    'RAW_ROD', 'RBD_MEDIUM', 'FINE_WIRE', 'CAT6_CONDUCTOR', 'SPECIAL'
  )),
  standard_tolerance_mm NUMERIC(6, 4) NOT NULL DEFAULT 0.0100,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN (
    'VERIFIED', 'PENDING_CONFIRMATION'
  )),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  resulting_stage VARCHAR(40) NOT NULL,
  sequence_hint INTEGER NOT NULL DEFAULT 10,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN (
    'VERIFIED', 'PENDING_CONFIRMATION'
  )),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS machines (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER NOT NULL REFERENCES plants(id),
  process_type_id INTEGER NOT NULL REFERENCES process_types(id),
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  min_input_mm NUMERIC(8, 4) NOT NULL,
  max_input_mm NUMERIC(8, 4) NOT NULL,
  min_output_mm NUMERIC(8, 4) NOT NULL,
  max_output_mm NUMERIC(8, 4) NOT NULL,
  rated_capacity_kg_per_shift NUMERIC(12, 2),
  verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN (
    'VERIFIED', 'PENDING_CONFIRMATION'
  )),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS allowed_process_routes (
  id SERIAL PRIMARY KEY,
  process_type_id INTEGER NOT NULL REFERENCES process_types(id),
  input_diameter_id INTEGER NOT NULL REFERENCES copper_diameters(id),
  output_diameter_id INTEGER NOT NULL REFERENCES copper_diameters(id),
  standard_wastage_pct NUMERIC(6, 3) NOT NULL DEFAULT 0.800 CHECK (standard_wastage_pct >= 0 AND standard_wastage_pct < 50),
  standard_process_loss_pct NUMERIC(6, 3) NOT NULL DEFAULT 0.250 CHECK (standard_process_loss_pct >= 0 AND standard_process_loss_pct < 25),
  standard_processing_cost_per_kg NUMERIC(12, 4) NOT NULL DEFAULT 12.0000 CHECK (standard_processing_cost_per_kg >= 0),
  scrap_recovery_credit_pct NUMERIC(6, 3) NOT NULL DEFAULT 92.000 CHECK (scrap_recovery_credit_pct >= 0 AND scrap_recovery_credit_pct <= 100),
  verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN (
    'VERIFIED', 'PENDING_CONFIRMATION'
  )),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (process_type_id, input_diameter_id, output_diameter_id)
);

CREATE TABLE IF NOT EXISTS bobbin_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  material VARCHAR(60) NOT NULL DEFAULT 'STEEL',
  standard_tare_weight_kg NUMERIC(10, 4) NOT NULL CHECK (standard_tare_weight_kg >= 0),
  max_net_capacity_kg NUMERIC(12, 4) NOT NULL CHECK (max_net_capacity_kg > 0),
  verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN (
    'VERIFIED', 'PENDING_CONFIRMATION'
  )),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS material_categories (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  grade_spec VARCHAR(100) NOT NULL,
  min_conductivity_iacs NUMERIC(6, 2) DEFAULT 100.00,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS cable_categories (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  primary_company_id INTEGER REFERENCES companies(id),
  typical_conductor_sizes VARCHAR(160),
  allowed_issue_modes VARCHAR(64) NOT NULL DEFAULT 'BOTH' CHECK (allowed_issue_modes IN (
    'COIL_WISE_ONLY', 'WEIGHT_BASED_ALLOWED', 'BOTH'
  )),
  verification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_CONFIRMATION' CHECK (verification_status IN (
    'VERIFIED', 'PENDING_CONFIRMATION'
  )),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  city VARCHAR(80),
  gstin VARCHAR(32),
  contact_person VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. Module 1: Copper Inward (Purchase Invoices & Coils)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(80) NOT NULL,
  purchasing_company_id INTEGER NOT NULL REFERENCES companies(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  invoice_date DATE NOT NULL,
  receipt_date DATE NOT NULL,
  material_category_id INTEGER NOT NULL REFERENCES material_categories(id),
  copper_grade VARCHAR(100) NOT NULL,
  input_diameter_id INTEGER NOT NULL REFERENCES copper_diameters(id),
  supplier_lot_heat_number VARCHAR(100),
  number_of_coils INTEGER NOT NULL CHECK (number_of_coils > 0),
  total_received_weight_kg NUMERIC(14, 4) NOT NULL CHECK (total_received_weight_kg > 0),
  purchase_rate NUMERIC(14, 4) NOT NULL CHECK (purchase_rate > 0),
  rate_unit VARCHAR(16) NOT NULL DEFAULT 'PER_KG' CHECK (rate_unit IN ('PER_KG', 'PER_MT')),
  effective_rate_per_kg NUMERIC(14, 4) NOT NULL CHECK (effective_rate_per_kg > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  total_invoice_copper_value NUMERIC(16, 4) NOT NULL CHECK (total_invoice_copper_value > 0),
  storage_location_id INTEGER NOT NULL REFERENCES storage_locations(id),
  supporting_doc_ref VARCHAR(160),
  remarks TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (purchasing_company_id, supplier_id, invoice_number)
);

-- ----------------------------------------------------------------------------
-- 4. Production Batches (Module 2 RBD & Module 3 Further Processing)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_batches (
  id SERIAL PRIMARY KEY,
  batch_number VARCHAR(64) UNIQUE NOT NULL,
  idempotency_key VARCHAR(100) UNIQUE NOT NULL,
  production_date DATE NOT NULL,
  owner_company_id INTEGER NOT NULL REFERENCES companies(id),
  plant_id INTEGER NOT NULL REFERENCES plants(id),
  process_type_id INTEGER NOT NULL REFERENCES process_types(id),
  machine_id INTEGER NOT NULL REFERENCES machines(id),
  input_diameter_id INTEGER NOT NULL REFERENCES copper_diameters(id),
  output_diameter_id INTEGER NOT NULL REFERENCES copper_diameters(id),
  status VARCHAR(24) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
  
  -- Weight Reconciliation (Decimal-safe NUMERIC(14,4))
  total_input_weight_kg NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (total_input_weight_kg >= 0),
  total_usable_output_kg NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (total_usable_output_kg >= 0),
  scrap_quantity_kg NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (scrap_quantity_kg >= 0),
  recoverable_waste_kg NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (recoverable_waste_kg >= 0),
  process_loss_kg NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (process_loss_kg >= 0),
  unexplained_diff_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  
  reconciliation_status VARCHAR(32) NOT NULL DEFAULT 'RECONCILED' CHECK (reconciliation_status IN (
    'DRAFT', 'RECONCILED', 'UNEXPLAINED_SHORTAGE'
  )),
  yield_pct NUMERIC(7, 3) NOT NULL DEFAULT 0,
  actual_wastage_pct NUMERIC(7, 3) NOT NULL DEFAULT 0,
  standard_wastage_pct NUMERIC(7, 3) NOT NULL DEFAULT 0,
  
  -- Costing Engine Fields (Module 8)
  input_copper_cost_total NUMERIC(16, 4) NOT NULL DEFAULT 0,
  weighted_avg_input_rate_per_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  processing_cost_per_kg NUMERIC(12, 4) NOT NULL DEFAULT 0,
  processing_cost_total NUMERIC(16, 4) NOT NULL DEFAULT 0,
  scrap_recovery_rate_per_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  scrap_recovery_credit_total NUMERIC(16, 4) NOT NULL DEFAULT 0,
  net_batch_cost_total NUMERIC(16, 4) NOT NULL DEFAULT 0,
  usable_output_cost_per_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',

  is_mixed_source BOOLEAN NOT NULL DEFAULT FALSE,
  shift VARCHAR(24) DEFAULT 'DAY',
  operator_name VARCHAR(100),
  remarks TEXT,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Hard invariant: Output + Scrap + Recoverable + Process Loss must NEVER exceed Input Weight
  CONSTRAINT chk_batch_output_not_exceeding_input CHECK (
    status = 'DRAFT' OR (
      total_usable_output_kg + scrap_quantity_kg + recoverable_waste_kg + process_loss_kg <= total_input_weight_kg + 0.0001
    )
  )
);

-- ----------------------------------------------------------------------------
-- 5. Copper Coils / Bobbins Inventory Table (Module 1, 2, 3, 5)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copper_coils (
  id SERIAL PRIMARY KEY,
  coil_code VARCHAR(64) UNIQUE NOT NULL,
  supplier_coil_number VARCHAR(100),
  supplier_lot_heat_number VARCHAR(100),
  
  -- Legal ownership vs Physical custody separation
  owner_company_id INTEGER NOT NULL REFERENCES companies(id),
  plant_id INTEGER NOT NULL REFERENCES plants(id),
  current_location_id INTEGER NOT NULL REFERENCES storage_locations(id),
  
  origin_type VARCHAR(32) NOT NULL CHECK (origin_type IN (
    'INWARD_PURCHASE', 'RBD_OUTPUT', 'DOWNSTREAM_OUTPUT'
  )),
  source_invoice_id INTEGER REFERENCES purchase_invoices(id),
  source_batch_id INTEGER REFERENCES production_batches(id),
  
  material_category_id INTEGER REFERENCES material_categories(id),
  copper_grade VARCHAR(100) NOT NULL,
  diameter_id INTEGER NOT NULL REFERENCES copper_diameters(id),
  processing_stage VARCHAR(40) NOT NULL CHECK (processing_stage IN (
    'RAW_8MM_ROD', 'RBD_DRAWN', 'CHINA_FINE_DRAWN', 'HARD_COPPER', 'ANNEALED_WIRE'
  )),
  
  bobbin_type_id INTEGER REFERENCES bobbin_types(id),
  bobbin_number VARCHAR(80),
  
  -- Weight fields (Net = Gross - Tare)
  gross_weight_kg NUMERIC(14, 4) NOT NULL CHECK (gross_weight_kg > 0),
  tare_weight_kg NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (tare_weight_kg >= 0),
  initial_net_weight_kg NUMERIC(14, 4) NOT NULL CHECK (initial_net_weight_kg > 0),
  available_weight_kg NUMERIC(14, 4) NOT NULL CHECK (available_weight_kg >= 0),
  reserved_weight_kg NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (reserved_weight_kg >= 0),
  consumed_weight_kg NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (consumed_weight_kg >= 0),
  
  status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN (
    'AVAILABLE', 'PARTIALLY_CONSUMED', 'RESERVED', 'CONSUMED', 'ISSUED_TO_CABLE', 'QUARANTINED'
  )),
  receipt_or_production_date DATE NOT NULL,
  
  -- Costing preservation
  original_purchase_rate_per_kg NUMERIC(14, 4) NOT NULL CHECK (original_purchase_rate_per_kg > 0),
  accumulated_processing_cost_per_kg NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (accumulated_processing_cost_per_kg >= 0),
  effective_cost_per_kg NUMERIC(14, 4) NOT NULL CHECK (effective_cost_per_kg > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  
  lineage_precision VARCHAR(32) NOT NULL DEFAULT 'EXACT_SINGLE_SOURCE' CHECK (lineage_precision IN (
    'EXACT_SINGLE_SOURCE', 'WEIGHTED_MULTI_SOURCE', 'ESTIMATED', 'UNRESOLVED'
  )),
  
  remarks TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_coil_net_weight_formula CHECK (
    ABS((gross_weight_kg - tare_weight_kg) - initial_net_weight_kg) <= 0.0001
  ),
  CONSTRAINT chk_coil_weight_conservation CHECK (
    available_weight_kg + reserved_weight_kg + consumed_weight_kg <= initial_net_weight_kg + 0.0001
  )
);

-- ----------------------------------------------------------------------------
-- 6. Batch Inputs, Outputs & Scrap Lots
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_batch_inputs (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  input_coil_id INTEGER NOT NULL REFERENCES copper_coils(id),
  available_before_kg NUMERIC(14, 4) NOT NULL CHECK (available_before_kg > 0),
  consumed_weight_kg NUMERIC(14, 4) NOT NULL CHECK (consumed_weight_kg > 0),
  remaining_after_kg NUMERIC(14, 4) NOT NULL CHECK (remaining_after_kg >= 0),
  is_partial_consumption BOOLEAN NOT NULL DEFAULT FALSE,
  source_purchase_rate_per_kg NUMERIC(14, 4) NOT NULL,
  source_effective_cost_per_kg NUMERIC(14, 4) NOT NULL,
  allocated_input_cost NUMERIC(16, 4) NOT NULL,
  contribution_share_pct NUMERIC(8, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_input_not_exceeding_available CHECK (consumed_weight_kg <= available_before_kg + 0.0001)
);

CREATE TABLE IF NOT EXISTS production_batch_outputs (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  output_coil_id INTEGER REFERENCES copper_coils(id),
  output_bobbin_number VARCHAR(80) NOT NULL,
  bobbin_type_id INTEGER REFERENCES bobbin_types(id),
  output_diameter_id INTEGER NOT NULL REFERENCES copper_diameters(id),
  gross_weight_kg NUMERIC(14, 4) NOT NULL CHECK (gross_weight_kg > 0),
  tare_weight_kg NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (tare_weight_kg >= 0),
  net_weight_kg NUMERIC(14, 4) NOT NULL CHECK (net_weight_kg > 0),
  storage_location_id INTEGER NOT NULL REFERENCES storage_locations(id),
  allocated_cost_per_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  allocated_total_cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_output_net_weight CHECK (ABS((gross_weight_kg - tare_weight_kg) - net_weight_kg) <= 0.0001)
);

CREATE TABLE IF NOT EXISTS scrap_lots (
  id SERIAL PRIMARY KEY,
  scrap_code VARCHAR(64) UNIQUE NOT NULL,
  batch_id INTEGER NOT NULL REFERENCES production_batches(id),
  owner_company_id INTEGER NOT NULL REFERENCES companies(id),
  plant_id INTEGER NOT NULL REFERENCES plants(id),
  storage_location_id INTEGER NOT NULL REFERENCES storage_locations(id),
  scrap_type VARCHAR(40) NOT NULL CHECK (scrap_type IN ('DRAWING_SCRAP', 'RECOVERABLE_WASTE', 'END_CUTS')),
  weight_kg NUMERIC(14, 4) NOT NULL CHECK (weight_kg > 0),
  source_copper_rate_per_kg NUMERIC(14, 4) NOT NULL,
  recovery_valuation_per_kg NUMERIC(14, 4) NOT NULL,
  total_recovery_value NUMERIC(16, 4) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'IN_STOCK' CHECK (status IN ('IN_STOCK', 'SOLD', 'REMELTED', 'REVERSED')),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. Module 6: Multi-Stage Copper Genealogy & Source Attribution
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coil_genealogy (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  parent_coil_id INTEGER NOT NULL REFERENCES copper_coils(id),
  child_coil_id INTEGER NOT NULL REFERENCES copper_coils(id),
  parent_consumed_in_batch_kg NUMERIC(14, 4) NOT NULL CHECK (parent_consumed_in_batch_kg > 0),
  parent_share_of_batch_pct NUMERIC(8, 4) NOT NULL CHECK (parent_share_of_batch_pct > 0 AND parent_share_of_batch_pct <= 100.0001),
  attributed_input_weight_kg NUMERIC(14, 4) NOT NULL CHECK (attributed_input_weight_kg > 0),
  attributed_output_weight_kg NUMERIC(14, 4) NOT NULL CHECK (attributed_output_weight_kg > 0),
  original_purchase_rate_per_kg NUMERIC(14, 4) NOT NULL,
  allocation_precision VARCHAR(32) NOT NULL DEFAULT 'EXACT' CHECK (allocation_precision IN (
    'EXACT', 'WEIGHTED_MIX', 'ESTIMATED', 'UNRESOLVED'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Root purchase invoice attribution preserved across arbitrary number of stages
CREATE TABLE IF NOT EXISTS coil_root_origins (
  id SERIAL PRIMARY KEY,
  coil_id INTEGER NOT NULL REFERENCES copper_coils(id) ON DELETE CASCADE,
  root_coil_id INTEGER NOT NULL REFERENCES copper_coils(id),
  root_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id),
  contribution_pct NUMERIC(8, 4) NOT NULL CHECK (contribution_pct > 0 AND contribution_pct <= 100.0001),
  attributed_weight_kg NUMERIC(14, 4) NOT NULL CHECK (attributed_weight_kg > 0),
  original_rate_per_kg NUMERIC(14, 4) NOT NULL,
  allocation_precision VARCHAR(32) NOT NULL DEFAULT 'EXACT' CHECK (allocation_precision IN (
    'EXACT', 'WEIGHTED_MIX', 'ESTIMATED', 'UNRESOLVED'
  )),
  stage_depth INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. Module 7: Cable Production Linkage (Configurable Coil-wise & Weight-based)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cable_production_issues (
  id SERIAL PRIMARY KEY,
  issue_number VARCHAR(64) UNIQUE NOT NULL,
  cable_batch_number VARCHAR(64) NOT NULL,
  issue_date DATE NOT NULL,
  owner_company_id INTEGER NOT NULL REFERENCES companies(id),
  plant_id INTEGER NOT NULL REFERENCES plants(id),
  cable_category_id INTEGER NOT NULL REFERENCES cable_categories(id),
  cable_product_description VARCHAR(200) NOT NULL,
  issue_mode VARCHAR(32) NOT NULL CHECK (issue_mode IN ('COIL_WISE', 'WEIGHT_BASED')),
  conductor_diameter_id INTEGER NOT NULL REFERENCES copper_diameters(id),
  total_issued_weight_kg NUMERIC(14, 4) NOT NULL CHECK (total_issued_weight_kg > 0),
  total_attributed_copper_cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
  weighted_avg_copper_cost_per_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  traceability_precision VARCHAR(32) NOT NULL CHECK (traceability_precision IN (
    'EXACT_COIL_LINKED', 'WEIGHTED_MULTI_COIL', 'ESTIMATED_POOL_ISSUE', 'UNRESOLVED_PENDING_VERIFICATION'
  )),
  workflow_verification_note VARCHAR(200) NOT NULL DEFAULT 'PENDING_PLANT_CONFIRMATION',
  remarks TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cable_issue_items (
  id SERIAL PRIMARY KEY,
  cable_issue_id INTEGER NOT NULL REFERENCES cable_production_issues(id) ON DELETE CASCADE,
  coil_id INTEGER REFERENCES copper_coils(id),
  issued_weight_kg NUMERIC(14, 4) NOT NULL CHECK (issued_weight_kg > 0),
  cost_per_kg NUMERIC(14, 4) NOT NULL,
  total_cost NUMERIC(16, 4) NOT NULL,
  attribution_method VARCHAR(40) NOT NULL CHECK (attribution_method IN (
    'SPECIFIC_COIL_SCAN', 'OPERATOR_WEIGHT_ALLOCATION', 'UNRESOLVED_POOL_ESTIMATE'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. Intercompany Ownership Transfers (Multi-Company Separation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intercompany_transfers (
  id SERIAL PRIMARY KEY,
  transfer_number VARCHAR(64) UNIQUE NOT NULL,
  transfer_date DATE NOT NULL,
  from_company_id INTEGER NOT NULL REFERENCES companies(id),
  to_company_id INTEGER NOT NULL REFERENCES companies(id),
  coil_id INTEGER NOT NULL REFERENCES copper_coils(id),
  weight_transferred_kg NUMERIC(14, 4) NOT NULL CHECK (weight_transferred_kg > 0),
  original_purchase_rate_per_kg NUMERIC(14, 4) NOT NULL,
  transfer_reference_doc VARCHAR(120) NOT NULL,
  transfer_reason VARCHAR(200) NOT NULL,
  authorized_by VARCHAR(100) NOT NULL,
  remarks TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_different_companies CHECK (from_company_id <> to_company_id)
);

-- ----------------------------------------------------------------------------
-- 10. Module 5: Immutable Inventory Movement Ledger & Audit Trail
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  movement_uuid VARCHAR(64) UNIQUE NOT NULL,
  movement_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  movement_date DATE NOT NULL,
  movement_type VARCHAR(40) NOT NULL CHECK (movement_type IN (
    'INWARD_RECEIPT',
    'PRODUCTION_CONSUMPTION',
    'PRODUCTION_OUTPUT',
    'SCRAP_GENERATION',
    'RESERVATION',
    'RESERVATION_RELEASE',
    'LOCATION_TRANSFER',
    'INTERCOMPANY_OWNERSHIP_TRANSFER',
    'CABLE_PRODUCTION_ISSUE',
    'REVERSAL_COMPENSATION'
  )),
  coil_id INTEGER REFERENCES copper_coils(id),
  scrap_lot_id INTEGER REFERENCES scrap_lots(id),
  owner_company_id INTEGER NOT NULL REFERENCES companies(id),
  target_company_id INTEGER REFERENCES companies(id),
  plant_id INTEGER NOT NULL REFERENCES plants(id),
  from_location_id INTEGER REFERENCES storage_locations(id),
  to_location_id INTEGER REFERENCES storage_locations(id),
  diameter_id INTEGER REFERENCES copper_diameters(id),
  
  -- Signed delta on available_weight_kg (+ for receipt/output/reversal, - for consumption/issue/reservation)
  weight_delta_kg NUMERIC(14, 4) NOT NULL,
  balance_before_kg NUMERIC(14, 4) NOT NULL CHECK (balance_before_kg >= 0),
  balance_after_kg NUMERIC(14, 4) NOT NULL CHECK (balance_after_kg >= 0),
  
  unit_rate_per_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_value_delta NUMERIC(16, 4) NOT NULL DEFAULT 0,
  
  reference_entity_type VARCHAR(40) NOT NULL,
  reference_entity_id INTEGER NOT NULL,
  reference_number VARCHAR(80) NOT NULL,
  notes TEXT,
  actor VARCHAR(80) NOT NULL DEFAULT 'SYSTEM_OPERATOR',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entity_type VARCHAR(48) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  action VARCHAR(40) NOT NULL,
  actor VARCHAR(80) NOT NULL DEFAULT 'OPERATOR',
  reason TEXT,
  before_state JSONB,
  after_state JSONB,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_coils_owner_company ON copper_coils(owner_company_id);
CREATE INDEX IF NOT EXISTS idx_coils_diameter ON copper_coils(diameter_id);
CREATE INDEX IF NOT EXISTS idx_coils_stage ON copper_coils(processing_stage);
CREATE INDEX IF NOT EXISTS idx_coils_status ON copper_coils(status);
CREATE INDEX IF NOT EXISTS idx_movements_coil ON inventory_movements(coil_id);
CREATE INDEX IF NOT EXISTS idx_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_genealogy_parent ON coil_genealogy(parent_coil_id);
CREATE INDEX IF NOT EXISTS idx_genealogy_child ON coil_genealogy(child_coil_id);
CREATE INDEX IF NOT EXISTS idx_root_origins_coil ON coil_root_origins(coil_id);
CREATE INDEX IF NOT EXISTS idx_root_origins_invoice ON coil_root_origins(root_invoice_id);

