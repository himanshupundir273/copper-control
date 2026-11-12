-- ============================================================================
-- Copper Control Tower — Migration 003: Plant Sheet Extensions & Master Data
-- Supports Vendor Billed Weight vs Atlanta Received Weight, Wt. Loss,
-- RBD Machine Meter Reading, Hard Copper (H) Flag, ATC & Aluminium Materials,
-- 14 Plant Suppliers, and Monthly Purchase vs RBD Production Summary.
-- ============================================================================

-- 1. Extend purchase_invoices with Vendor Billed Weight & Weight Diff/Loss
ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS vendor_billed_weight_kg NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS weight_diff_loss_kg NUMERIC(14, 4) NOT NULL DEFAULT 0;

UPDATE purchase_invoices
SET vendor_billed_weight_kg = total_received_weight_kg
WHERE vendor_billed_weight_kg IS NULL;

-- 2. Extend copper_coils with Vendor Billed Weight, Weight Diff/Loss, Meter Reading & Hard Copper Flag
ALTER TABLE copper_coils
  ADD COLUMN IF NOT EXISTS vendor_billed_weight_kg NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS weight_diff_loss_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reading_meters NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS is_hard_copper BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE copper_coils
SET vendor_billed_weight_kg = initial_net_weight_kg
WHERE vendor_billed_weight_kg IS NULL;

-- 3. Extend production_batch_outputs with Meter Reading & Hard Copper Flag
ALTER TABLE production_batch_outputs
  ADD COLUMN IF NOT EXISTS reading_meters NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS is_hard_copper BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Create Monthly Purchase vs RBD Production Summary Table (Report Sheet)
CREATE TABLE IF NOT EXISTS monthly_plant_summary (
  id SERIAL PRIMARY KEY,
  month_index INTEGER UNIQUE NOT NULL,
  month_label VARCHAR(32) NOT NULL,
  rbd_month_code VARCHAR(16) NOT NULL,
  billing_copper_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  receive_copper_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  receive_aluminium_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  rbd_0900_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  rbd_1400_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  rbd_1800_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  rbd_total_kg NUMERIC(14, 4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Upsert Real Plant Material Categories (COPPER, ATC, ALUMINIUM)
INSERT INTO material_categories (code, name, grade_spec, min_conductivity_iacs, description) VALUES
  ('CU-ETP-9999', 'COPPER (8mm Continuous Cast Rod & Drawn Wire)', 'IS 12444 / ASTM B49 C11000 (99.99% Cu)', 101.00, 'Primary 8mm ETP Copper Rod and Drawn Copper Wire'),
  ('CU-ATC', 'ATC (Annealed Tinned Copper Wire)', 'IS 8130 / ASTM B33 Tinned Copper', 98.50, 'Purchased Annealed Tinned Copper (0.585 mm, 0.202 mm)'),
  ('AL-ROD-WIRE', 'ALUMINIUM (EC Grade Rod & Drawn Wire)', 'IS 5484 / EC Grade Aluminium', 61.00, 'Purchased Aluminium Wire & Rod (8.00 mm, 2.85 mm, 2.25 mm, 1.80 mm, 0.225 mm)')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 6. Upsert All Real Plant Diameters from Inward & RBD Sheets
INSERT INTO copper_diameters (diameter_mm, label, swg_awg_ref, category, standard_tolerance_mm, verification_status, notes) VALUES
  (8.0000, '8.00 mm Continuous Cast Rod', '5/16 inch EC Rod', 'RAW_ROD', 0.1500, 'VERIFIED', 'Standard purchased input 8mm rod diameter'),
  (2.8500, '2.85 mm Wire (Aluminium / Conductor)', '~11 SWG', 'RBD_MEDIUM', 0.0200, 'VERIFIED', 'Purchased 2.85 mm wire size from Wirehouse India'),
  (2.2500, '2.25 mm Wire (Aluminium / Conductor)', '~13 SWG', 'RBD_MEDIUM', 0.0180, 'VERIFIED', 'Purchased 2.25 mm wire size from Wirehouse India'),
  (1.8000, '1.80 mm RBD Drawn Wire', '~15 SWG', 'RBD_MEDIUM', 0.0150, 'VERIFIED', 'Verified RBD output size (1.800 mm) and purchased wire size'),
  (1.4000, '1.40 mm RBD Drawn Wire', '17 SWG', 'RBD_MEDIUM', 0.0120, 'VERIFIED', 'Primary RBD output size (440,049.30 kg produced Apr–Oct)'),
  (0.9000, '0.90 mm RBD Drawn Wire', '20 SWG', 'FINE_WIRE', 0.0100, 'VERIFIED', 'Verified RBD output size (103,199.80 kg produced Apr–Oct)'),
  (0.5850, '0.585 mm ATC Wire', '23-24 SWG', 'FINE_WIRE', 0.0080, 'VERIFIED', 'Purchased ATC wire from Raycore Electromech'),
  (0.2500, '0.250 mm Copper Reel Wire', '33 SWG', 'FINE_WIRE', 0.0050, 'VERIFIED', 'Purchased fine copper reel wire from K.D. Brass & Components'),
  (0.2250, '0.225 mm Fine Wire', '34-35 SWG', 'FINE_WIRE', 0.0050, 'VERIFIED', 'Purchased fine wire from Wirehouse India'),
  (0.2020, '0.202 mm ATC Fine Wire', '35 SWG', 'FINE_WIRE', 0.0050, 'VERIFIED', 'Purchased 0.202 mm ATC wire from K.D. Brass & Components')
ON CONFLICT (diameter_mm) DO UPDATE SET
  label = EXCLUDED.label,
  verification_status = 'VERIFIED',
  notes = EXCLUDED.notes;

-- 7. Upsert All 14 Real Suppliers from the Plant Sheet
INSERT INTO suppliers (code, name, city, gstin, contact_person) VALUES
  ('SUP-YMPL', 'Yatharth Metatech Pvt Ltd', 'Silvassa / Vapi', '26AABCY1001A1Z1', 'Yatharth Dispatch Desk'),
  ('SUP-MTS', 'Metatech CCR Pvt Ltd', 'Silvassa / Daman', '26AABCM1002B1Z2', 'Metatech CCR Sales'),
  ('SUP-MWC', 'Metatech Wire & Cable', 'Silvassa', '26AABCM1003C1Z3', 'Metatech Wire Desk'),
  ('SUP-ALCHEMY', 'Alchemy', 'Mumbai / Silvassa', '27AABCA1004D1Z4', 'Alchemy Metals Desk'),
  ('SUP-BW', 'Bhawani Metalloy Pvt Ltd', 'Silvassa / Vapi', '26AABCB1005E1Z5', 'Bhawani Dispatch'),
  ('SUP-SRR', 'Shree Ram Recycling Pvt Ltd', 'Gujarat', '24AABCS1006F1Z6', 'Shree Ram Recycling'),
  ('SUP-SRN', 'Shree Ram Nexa Pvt Ltd', 'Gujarat', '24AABCS1007G1Z7', 'Shree Ram Nexa'),
  ('SUP-MAPL', 'Midland Appliances Pvt Ltd', 'Delhi / Silvassa', '07AABCM1008H1Z8', 'Midland Appliances'),
  ('SUP-LOHUM', 'Lohum Material Pvt Ltd', 'Noida / Gujarat', '09AABCL1009J1Z9', 'Lohum Material Desk'),
  ('SUP-BH', 'Bhramari Manufacturing Ind. Pvt. Ltd', 'Silvassa / Vapi', '26AABCB1010K1Z0', 'Bhramari Manufacturing'),
  ('SUP-MARVEL', 'Marvel Wires', 'Daman / Vapi', '25AABCM1011L1Z1', 'Marvel Wires Sales'),
  ('SUP-RAYCORE', 'Raycore Electromech', 'Medchal / Hyderabad', '36AABCR1012M1Z2', 'Raycore Electromech'),
  ('SUP-KDBC', 'K.D. Brass & Components', 'Jamnagar, Gujarat', '24AABCK1013N1Z3', 'K.D. Brass Dispatch'),
  ('SUP-WHI', 'Wirehouse India Pvt Ltd', 'Silvassa / Vapi', '26AABCW1014P1Z4', 'Wirehouse India')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name;

