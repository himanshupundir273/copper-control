# Copper Control Tower — RBD Production, Traceability & Costing Web App

**Copper Control Tower** is a full-stack manufacturing operations, material traceability, and copper costing system engineered for the copper rod breakdown (RBD) and downstream wire-processing operations of **Atlanta Tele Cables**, **Notofire**, and **Valuecon**.

---

## Key Capabilities

1. **Module 1 — Copper Inward (`src/lib/services/inward-service.ts`)**:
   - Captures purchasing company, supplier, invoice number/date, receipt date, copper grade, input diameter (default `8.00 mm`), lot/heat number, multi-coil weights, purchase rate (`PER_KG` or `PER_MT` normalized automatically), currency, storage location, and supporting document reference.
   - Generates a unique internal ID (`coil_code`, e.g., `ATC-ROD-202610-0001`) for every individual coil while keeping supplier coil numbers separate.
2. **Module 2 — RBD Production & Reconciliation (`src/lib/services/production-service.ts`)**:
   - Supports one input coil producing multiple output bobbins and multiple input coils contributing to one batch, including partial coil consumption.
   - Enforces `Net Weight = Gross Weight - Tare Weight`.
   - Enforces material reconciliation: `Input Copper Weight = Usable Output + Recoverable Scrap + Other Recorded Outputs + Process Loss + Unexplained Difference`.
   - Blocks output weight from exceeding available input weight and explicitly surfaces unexplained differences (`UNEXPLAINED_SHORTAGE`) without auto-classifying them as scrap or process loss.
   - Supports Draft saving, atomic & idempotent Posting (`idempotency_key`), and Compensating Transaction Reversals (`reverseProductionBatch`).
3. **Module 3 — Configurable Further Processing**:
   - Supports multi-stage drawing routes (`CHINA_FINE`, `HARD_COPPER`, `ANNEALING_TINNING`) without hardcoding a rigid sequence.
4. **Module 4 — Copper Size & Process Masters**:
   - Admin screens for Copper Diameters (`8.00, 1.80, 1.60, 1.40, 1.00, 0.90, 0.60 mm` + CAT6 sizes), Machines, Process Types, Allowed Input/Output Size Combinations, Standard Wastage %, Bobbin Types & Tare Weights, Storage Locations, Material Categories, and Finished Cable Categories.
   - Unconfirmed configurations are explicitly badged `PENDING_CONFIRMATION`.
5. **Module 5 — Live Copper Inventory & Immutable Ledger**:
   - PostgreSQL triggers (`db/migrations/002_triggers_and_invariants.sql`) block `UPDATE` and `DELETE` on `inventory_movements` and verify balance conservation on every insert.
   - Separates physical plant custody (`plant_id`, `current_location_id`) from legal stock ownership (`owner_company_id`).
6. **Module 6 — Multi-Stage Copper Traceability (`src/lib/services/traceability-service.ts`)**:
   - Interactive 7-stage visual genealogy explorer: `Original Copper Receipt → 8mm Input Coils → RBD Batch → RBD Output Bobbins & Scrap → Further Processing → Drawn Wire Spools → Finished Cable Batch`.
   - Preserves all contributing purchase invoices and original rates across mixed batches in `coil_root_origins`.
7. **Module 7 — Cable Production Linkage & Intercompany Transfers**:
   - Configurable issuance workflow supporting both `COIL_WISE` and `WEIGHT_BASED` modes. Weight-based pool issues explicitly record `UNRESOLVED_PENDING_VERIFICATION` rather than inventing false source-coil precision.
   - Explicit Intercompany Ownership Transfer workflow between Atlanta Tele Cables, Notofire, and Valuecon.
8. **Module 8 — Copper Costing Engine**:
   - Preserves original purchase rates, calculates weighted-average input rates for mixed batches, adds stage conversion cost, deducts scrap recovery credit, and computes effective cost per kg of usable output.
9. **Module 9 — Dashboard & 10 Operational Reports**:
   - Live KPI cards, exception alerts, and 10 filterable registers with CSV/Excel export.

---

## Local Setup & Quick Start

### Prerequisites
- **Node.js 18+** (tested with Node v24)
- **Database**:
  - **Zero-Config Local Mode (Default)**: When `DATABASE_URL` is not set, the app automatically runs an embedded **PostgreSQL 16 engine (`@electric-sql/pglite`)** persisted in `.data/pgdata` using the exact SQL migrations in `db/migrations/`.
  - **Supabase / Managed PostgreSQL Mode**: Set `DATABASE_URL=postgresql://user:pass@host:5432/dbname` in `.env` to connect via standard `pg.Pool`.

### Commands

```bash
# 1. Install dependencies
npm install

# 2. Run PostgreSQL migrations & seed master + labeled demo data
npm run db:migrate
npm run db:seed

# 3. Run automated test suite (Vitest)
npm test

# 4. Start the local web application
npm run dev
```

Open `http://localhost:3000` in your browser.

