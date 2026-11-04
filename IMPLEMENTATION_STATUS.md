# Implementation Status — Copper Control Tower

This document separates **completed and verified functionality**, **configurable / pending-confirmation workflows**, and **future integrations**.

---

## 1. Completed & Operational Now (Phases 1, 2 & 3 Foundation)

| Area | Status | Implementation Details |
| :--- | :--- | :--- |
| **PostgreSQL Schema & Migrations** | **COMPLETED** | `db/migrations/001_initial_schema.sql` & `002_triggers_and_invariants.sql`. Compatible with Supabase/PostgreSQL (`DATABASE_URL`) and embedded PostgreSQL 16 (`@electric-sql/pglite`). |
| **Immutable Inventory Ledger** | **COMPLETED** | `inventory_movements` table with PostgreSQL trigger `trg_immutable_inventory_movements` blocking `UPDATE`/`DELETE` and `trg_verify_movement_balance_math` enforcing exact balance conservation. |
| **Decimal-Safe Arithmetic** | **COMPLETED** | All weights (`NUMERIC(14,4)`), percentages (`NUMERIC(7,3)`), and currency values (`NUMERIC(16,4)`) use `decimal.js` (`src/lib/decimal.ts`). |
| **Module 1: Copper Inward** | **COMPLETED** | Multi-coil purchase receipt workflow, automatic `PER_KG` / `PER_MT` normalization, unique internal `coil_code` generation separate from supplier coil numbers. |
| **Module 2: RBD Production & Weight Reconciliation** | **COMPLETED** | Supports partial coil consumption, multi-coil mixing, 1-to-many output bobbins, `Net = Gross - Tare`, hard block on `Output > Input`, explicit flagging of `UNEXPLAINED_SHORTAGE`, idempotent posting, Draft saving, and Compensating Reversals. |
| **Module 3: Further Processing** | **COMPLETED** | Configurable downstream processing (`CHINA_FINE`, `HARD_COPPER`, `ANNEALING_TINNING`) feeding from RBD output bobbins or raw rod. |
| **Module 4: Copper Size & Process Masters** | **COMPLETED** | Interactive master management for Diameters, Allowed Routes, Standard Wastage %, Machines, Bobbin Tare Weights, Storage Locations, and Categories with `VERIFIED` vs `PENDING_CONFIRMATION` badges. |
| **Module 5: Live Copper Inventory** | **COMPLETED** | Real-time coil-wise stock visibility by legal company, plant, location, diameter, and stage; includes Physical Location Transfers and Stock Reservations/Releases. |
| **Module 6: Multi-Stage Traceability** | **COMPLETED** | 7-stage visual genealogy pipeline (Invoice → 8mm Coils → RBD Batch → RBD Bobbins & Scrap → Further Processing → Fine Spools → Cable Issue) + transitive root purchase invoice attribution (`coil_root_origins`). |
| **Module 7: Cable Production Linkage** | **COMPLETED** | Supports both `COIL_WISE` and `WEIGHT_BASED` issue modes with explicit precision markers (`EXACT_COIL_LINKED`, `WEIGHTED_MULTI_COIL`, `ESTIMATED_POOL_ISSUE`, `UNRESOLVED_PENDING_VERIFICATION`). |
| **Module 8: Copper Costing Engine** | **COMPLETED** | Preserves original purchase rate per coil, computes weighted-average input copper cost on mixed batches, applies stage processing cost, credits scrap recovery value, and calculates cost per kg of usable output. |
| **Module 9: Dashboard & 10 Reports** | **COMPLETED** | Executive & operator dashboard + all 10 operational registers with filters and CSV/Excel export. |
| **Multi-Company Ownership Separation** | **COMPLETED** | Strict separation between `owner_company_id` (Atlanta Tele Cables, Notofire, Valuecon) and physical `plant_id`/`current_location_id`, plus explicit `intercompany_transfers` workflow. |
| **Demo Data Isolation** | **COMPLETED** | Every demo record carries `is_demo = TRUE`, is visibly badged `[DEMO]`, and can be toggled or purged cleanly from the Settings screen without affecting real production data. |
| **Automated Test Suite** | **COMPLETED** | Vitest suite (`src/__tests__/copper-control-tower.test.ts`) verifying inward receipts, ledger immutability triggers, partial consumption, reconciliation invariants, mixed-source costing, multi-stage genealogy, intercompany transfers, and batch reversals. |

---

## 2. Configurable / Pending Plant Confirmation Behavior

- **Unverified Manufacturing Routes**: Spoken routes (`8.00 mm -> 1.00 mm` direct, `1.80 mm -> 0.90 mm`, `CAT6 0.57 mm / 0.51 mm`, and `HARD_COPPER` routes) are seeded with `verification_status = 'PENDING_CONFIRMATION'`. Administrators can flip routes to `VERIFIED` in the **Masters** module once confirmed by the plant head.
- **Cable Shop Issuance Workflow**: Until the shop floor confirms whether bobbins are barcode-scanned at the extrusion/stranding payoff or issued by weight pool, the **Material Issues** screen allows operators to choose either `COIL_WISE` or `WEIGHT_BASED` mode and flags weight-based pool issues as `UNRESOLVED_PENDING_VERIFICATION`.

---

## 3. Future Integrations (Out of Scope for Phase 1–3 Foundation)

- **Role-Based Authentication & Permissions**: Intentionally omitted per specification ("Do not add authentication roles or elaborate permission structures yet. We will define them separately").
- **Full Cable Product ROI / BOM Costing**: Copper material and drawing conversion costs are fully calculated; non-copper BOM components (PVC/XLPE insulation, steel armor, masterbatch, drums, labor, power, and sales invoice margins) will be integrated in the downstream Cable ERP module.
- **Digital Weighbridge / RS-232 Scale & Barcode Scanner Hardware Integration**: Currently supports keyboard/scanner input; direct serial port scale capture can be connected once plant weighing hardware models are finalized.
- **Accounting ERP Voucher Sync (Tally / SAP)**: Intercompany ownership transfers record operational & commercial references without generating accounting journal vouchers.

