-- ============================================================================
-- Copper Control Tower — Migration 002: Ledger Immutability & Guard Triggers
-- ============================================================================

-- 1. Prevent UPDATE or DELETE on inventory_movements (Immutable Ledger)
-- Exception allowed ONLY when system purge of demo data is explicitly executed
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_demo = TRUE AND current_setting('app.allow_demo_purge', TRUE) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Immutable Ledger Violation: inventory_movements rows cannot be updated or deleted. Use a compensating transaction (REVERSAL_COMPENSATION) instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_inventory_movements ON inventory_movements;
CREATE TRIGGER trg_immutable_inventory_movements
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- 2. Verify balance math on every inventory movement insert
CREATE OR REPLACE FUNCTION verify_movement_balance_math()
RETURNS TRIGGER AS $$
BEGIN
  IF ABS((NEW.balance_before_kg + NEW.weight_delta_kg) - NEW.balance_after_kg) > 0.0001 THEN
    RAISE EXCEPTION 'Ledger Balance Math Violation: balance_before_kg (%) + weight_delta_kg (%) != balance_after_kg (%)',
      NEW.balance_before_kg, NEW.weight_delta_kg, NEW.balance_after_kg;
  END IF;
  IF NEW.balance_after_kg < 0 THEN
    RAISE EXCEPTION 'Negative Stock Violation: balance_after_kg (%) cannot be negative for coil %',
      NEW.balance_after_kg, NEW.coil_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verify_movement_balance_math ON inventory_movements;
CREATE TRIGGER trg_verify_movement_balance_math
BEFORE INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION verify_movement_balance_math();

