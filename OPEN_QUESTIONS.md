# Open Questions Awaiting Plant & Management Verification

This document lists all operational, metallurgical, and accounting parameters discussed in the initial discovery meeting that require plant confirmation before locking strict production rules. In **Copper Control Tower**, each of these items is currently built as **configurable** and explicitly tagged with `PENDING_CONFIRMATION`.

---

## 1. Copper Sizes & Manufacturing Routes (Modules 3 & 4)
1. **Intermediate vs. Direct Drawing for `1.00 mm` and `0.90 mm`**:
   - Are `1.00 mm` and `0.90 mm` drawn directly from `8.00 mm` rod on the RBD line, or are they drawn on the China Fine / intermediate drawing machine from `1.80 mm` / `1.60 mm` RBD wire?
   - *Current System Behavior*: Both direct and two-stage routes are seeded in `allowed_process_routes` with `verification_status = 'PENDING_CONFIRMATION'`.
2. **CAT6 Conductor Exact Designations & Units**:
   - Meeting notes referenced CAT6 conductor sizes without confirming whether plant floor specifications use **AWG** (`23 AWG` = `0.573 mm`, `24 AWG` = `0.511 mm`) or nominal metric diameters (`0.57 mm`, `0.51 mm`, `0.50 mm`).
   - *Current System Behavior*: Seeded `0.57 mm (23 AWG)` and `0.51 mm (24 AWG)` as `PENDING_CONFIRMATION` in the Copper Diameters Master.
3. **Hard Copper Processing Stage**:
   - Does "Hard Copper processing" refer to bypassing the inline RBD annealer on `RBD-01`/`RBD-02`, or a separate bull-block / hard-drawing machine line (`HRD-01`) at Vapi/Silvassa?
   - What are the exact input/output diameters and standard wastage percentages for hard copper vs. annealed copper?

---

## 2. Shop-Floor Weighing, Tare & Reconciliation Rules (Module 2)
4. **Bobbin & Carrier Tare Weight Standardization**:
   - Do DIN-630 / DIN-500 steel bobbins and China Fine plastic spools use a fixed standard tare weight per bobbin type, or is each individual bobbin's stamped tare weight entered at the weighing scale?
   - *Current System Behavior*: Selecting a Bobbin Type auto-fills the standard tare weight, while allowing the operator to override the exact stamped tare weight per bobbin.
5. **Tolerance Threshold for Unexplained Weight Variance**:
   - What is the maximum permissible scale tolerance (e.g., `±0.5 kg` per batch) before a batch with an unexplained difference requires supervisor sign-off?
   - How should oxidized scale / emulsion sludge collected in the RBD pit be periodic-accounted?

---

## 3. Cable Production Copper Issuance Workflow (Module 7)
6. **Method of Issuing Drawn Copper to Extrusion / Stranding / Pairing**:
   - For **Railway Signalling Cables**, **CAT6 LAN Cables**, **Valuecon Single-Core Cables**, and **Special-Order Cables**, does the shop floor scan individual RBD bobbins / China Fine spools at the strander/extruder pay-off stand (`COIL_WISE`), or issue bulk weight by diameter (`WEIGHT_BASED`)?
   - When a bobbin is only partially consumed on a cable run and returned to WIP, is it re-weighed immediately at the end of the cable batch?
   - *Current System Behavior*: Supports both `COIL_WISE` and `WEIGHT_BASED` modes. When `WEIGHT_BASED` mode is used without specific coil scans, the system explicitly marks traceability precision as `UNRESOLVED_PENDING_VERIFICATION` so false coil-level precision is never invented.

---

## 4. Multi-Company & Costing Rules (Module 8)
7. **Intercompany Processing vs. Ownership Transfer**:
   - When a coil owned by **Atlanta Tele Cables** is processed on a machine at a plant operated by **Notofire** or **Valuecon**, is a job-work conversion charge applied, or is legal ownership transferred prior to cable manufacturing?
   - *Current System Behavior*: Physical plant location and legal ownership (`owner_company_id`) are strictly separated. Processing a coil at any plant preserves its legal owner; changing ownership requires an explicit **Intercompany Ownership Transfer** with supporting document reference.
8. **Scrap Recovery Valuation Formula**:
   - Should recoverable copper drawing scrap credit the production batch at a fixed percentage of the source purchase rate (e.g., `92%` of original rod purchase rate) or at the prevailing daily scrap market rate?

