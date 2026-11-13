'use client';

import React, { useState } from 'react';
import { CheckCircle2, FileText, Plus, Scale, Trash2, Truck } from 'lucide-react';
import { EditableMasterSelect } from './EditableMasterSelect';
import { PaginationBar, usePagination } from './PaginationBar';

interface InwardModuleProps {
  data: any;
  onRefresh: () => Promise<void>;
  onNavigateTraceability: (code: string) => void;
}

export function InwardModule({
  data,
  onRefresh,
  onNavigateTraceability,
}: InwardModuleProps) {
  const { masters, invoices, coils } = data;

  const default8mm =
    masters.diameters.find((d: any) => Number(d.diameter_mm) === 8)?.id ||
    masters.diameters[0]?.id ||
    1;

  const rawRodLocations = masters.locations.filter(
    (l: any) => l.location_type === 'RAW_ROD_YARD' || l.location_type === 'RBD_FLOOR'
  );

  const [purchasingCompanyId, setPurchasingCompanyId] = useState<number>(
    masters.companies[0]?.id || 1
  );
  const [supplierId, setSupplierId] = useState<number>(masters.suppliers[0]?.id || 1);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [materialCategoryId, setMaterialCategoryId] = useState<number>(
    masters.materialCategories[0]?.id || 1
  );
  const [copperGrade, setCopperGrade] = useState('');
  const [inputDiameterId, setInputDiameterId] = useState<number>(default8mm);
  const [supplierLotHeatNumber, setSupplierLotHeatNumber] = useState('');
  const [purchaseRate, setPurchaseRate] = useState('');
  const [rateUnit, setRateUnit] = useState<'PER_KG' | 'PER_MT'>('PER_KG');
  const [currency, setCurrency] = useState('INR');
  const [storageLocationId, setStorageLocationId] = useState<number>(
    rawRodLocations[0]?.id || masters.locations[0]?.id || 1
  );
  const [supportingDocRef, setSupportingDocRef] = useState('');
  const [remarks, setRemarks] = useState('');

  const [coilRows, setCoilRows] = useState<
    Array<{
      supplierCoilNumber: string;
      supplierLotHeatNumber: string;
      vendorBilledWeightKg: string;
      grossWeightKg: string;
      tareWeightKg: string;
      remarks: string;
    }>
  >([
    {
      supplierCoilNumber: '',
      supplierLotHeatNumber: '',
      vendorBilledWeightKg: '',
      grossWeightKg: '',
      tareWeightKg: '',
      remarks: '',
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<any | null>(null);

  const effectiveRatePerKg =
    rateUnit === 'PER_MT'
      ? Number(purchaseRate || 0) / 1000
      : Number(purchaseRate || 0);

  const totalNetWeightKg = coilRows.reduce((sum, r) => {
    const net = Math.max(0, Number(r.grossWeightKg || 0) - Number(r.tareWeightKg || 0));
    return sum + net;
  }, 0);

  const totalInvoiceValue = totalNetWeightKg * effectiveRatePerKg;

  const addCoilRow = () => {
    setCoilRows((prev) => [
      ...prev,
      {
        supplierCoilNumber: '',
        supplierLotHeatNumber: '',
        vendorBilledWeightKg: '',
        grossWeightKg: '',
        tareWeightKg: '',
        remarks: '',
      },
    ]);
  };

  const removeCoilRow = (idx: number) => {
    if (coilRows.length <= 1) return;
    setCoilRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCoilRow = (idx: number, field: string, val: string) => {
    setCoilRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: val } : row))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLastCreated(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/inward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchasingCompanyId: Number(purchasingCompanyId),
          supplierId: Number(supplierId),
          invoiceNumber,
          invoiceDate,
          receiptDate,
          materialCategoryId: Number(materialCategoryId),
          copperGrade,
          inputDiameterId: Number(inputDiameterId),
          supplierLotHeatNumber,
          purchaseRate: Number(purchaseRate),
          rateUnit,
          currency,
          storageLocationId: Number(storageLocationId),
          supportingDocRef,
          remarks,
          coils: coilRows,
          isDemo: false,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to save inward receipt');
      }
      setLastCreated(json.result);
      setInvoiceNumber('');
      setSupportingDocRef('');
      await onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const inwardCoils = coils.filter((c: any) => c.origin_type === 'INWARD_PURCHASE');
  const invoicesPager = usePagination<any>(invoices || [], 10);
  const inwardCoilsPager = usePagination<any>(inwardCoils || [], 10);

  return (
    <div className="space-y-6">
      {/* Purchase Receipt Entry Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 shadow-lg space-y-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-copper-100/80 border border-copper-300 text-copper-600">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Module 1: Copper Inward — Purchase Receipt & Individual Coil Registration
              </h2>
              <p className="text-xs text-slate-500">
                Assigns a unique internal Coil ID to every received coil while preserving original purchase rate & supplier identifiers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white px-4 py-2.5 rounded-lg border border-slate-200">
            <div>
              <div className="text-[10px] uppercase text-slate-500">Total Net Weight</div>
              <div className="text-sm font-mono font-bold text-slate-900">
                {totalNetWeightKg.toLocaleString('en-IN', { minimumFractionDigits: 2 })} kg
              </div>
            </div>
            <div className="h-7 w-px bg-slate-100" />
            <div>
              <div className="text-[10px] uppercase text-slate-500">Normalized Rate/kg</div>
              <div className="text-sm font-mono font-bold text-copper-700">
                ₹{effectiveRatePerKg.toFixed(2)}/kg
              </div>
            </div>
            <div className="h-7 w-px bg-slate-100" />
            <div>
              <div className="text-[10px] uppercase text-slate-500">Invoice Copper Value</div>
              <div className="text-sm font-mono font-bold text-emerald-700">
                ₹{totalInvoiceValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-800">
            <strong>Validation Error:</strong> {error}
          </div>
        )}

        {lastCreated && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-800 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              Purchase Invoice {lastCreated.invoiceNumber} Posted — {lastCreated.createdCoils.length}{' '}
              Unique Internal Coil IDs Generated:
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {lastCreated.createdCoils.map((c: any) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => onNavigateTraceability(c.coilCode)}
                  className="px-2.5 py-1 rounded bg-emerald-100 border border-emerald-300 font-mono text-slate-900 hover:bg-emerald-200"
                >
                  {c.coilCode} ({Number(c.netWeightKg).toFixed(1)} kg • Sup:{' '}
                  {c.supplierCoilNumber || 'N/A'})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Header Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <EditableMasterSelect
            label="Purchasing Legal Company"
            required
            entityType="COMPANY"
            addAction="ADD_COMPANY"
            value={purchasingCompanyId}
            onChange={(id) => setPurchasingCompanyId(id)}
            onRefresh={onRefresh}
            placeholderPrimary="Company Name (e.g. ATCL)"
            placeholderSecondary="Code (optional)"
            options={masters.companies.map((c: any) => ({
              id: c.id,
              label: `${c.name} (${c.code})`,
            }))}
          />

          <EditableMasterSelect
            label="Copper Rod Supplier"
            required
            entityType="SUPPLIER"
            addAction="ADD_SUPPLIER"
            value={supplierId}
            onChange={(id) => setSupplierId(id)}
            onRefresh={onRefresh}
            placeholderPrimary="Vendor / Supplier Name"
            placeholderSecondary="City (optional)"
            options={masters.suppliers.map((s: any) => ({
              id: s.id,
              label: s.city ? `${s.name} (${s.city})` : s.name,
            }))}
          />

          <div>
            <div className="h-5 mb-1.5 flex items-center">
              <label className="text-xs font-semibold text-slate-600 truncate">
                Supplier Invoice Number *
              </label>
            </div>
            <input
              type="text"
              required
              placeholder="e.g. BC/26-27/1095"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-copper-500 outline-none"
            />
          </div>

          <EditableMasterSelect
            label="Storage Location (Physical Yard)"
            required
            entityType="LOCATION"
            addAction="ADD_LOCATION"
            value={storageLocationId}
            onChange={(id) => setStorageLocationId(id)}
            onRefresh={onRefresh}
            placeholderPrimary="Location / Yard Name"
            placeholderSecondary="Code (optional)"
            options={masters.locations.map((l: any) => ({
              id: l.id,
              label: l.plant_code ? `${l.name} (${l.plant_code})` : l.name,
            }))}
          />

          <div>
            <div className="h-5 mb-1.5 flex items-center">
              <label className="text-xs font-semibold text-slate-600 truncate">
                Invoice Date *
              </label>
            </div>
            <input
              type="date"
              required
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
            />
          </div>

          <div>
            <div className="h-5 mb-1.5 flex items-center">
              <label className="text-xs font-semibold text-slate-600 truncate">
                Material Receipt Date *
              </label>
            </div>
            <input
              type="date"
              required
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              className="w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
            />
          </div>

          <EditableMasterSelect
            label="Input Diameter (Default 8.00 mm)"
            required
            entityType="DIAMETER"
            addAction="ADD_DIAMETER"
            value={inputDiameterId}
            onChange={(id) => setInputDiameterId(id)}
            onRefresh={onRefresh}
            isNumericPrimary
            placeholderPrimary="Size in mm (e.g. 1.40)"
            placeholderSecondary="Label (optional)"
            className="font-mono"
            options={masters.diameters.map((d: any) => ({
              id: d.id,
              label: `${Number(d.diameter_mm).toFixed(3)} mm — ${d.label}`,
            }))}
          />

          <EditableMasterSelect
            label="Material Category"
            required
            entityType="MATERIAL_CATEGORY"
            addAction="ADD_MATERIAL_CATEGORY"
            value={materialCategoryId}
            onChange={(id) => setMaterialCategoryId(id)}
            onRefresh={onRefresh}
            placeholderPrimary="Category (e.g. COPPER / ATC)"
            placeholderSecondary="Spec (optional)"
            options={masters.materialCategories.map((mc: any) => ({
              id: mc.id,
              label: mc.name,
            }))}
          />

          <div>
            <div className="h-5 mb-1.5 flex items-center">
              <label className="text-xs font-semibold text-slate-600 truncate">
                Copper Grade / Specification
              </label>
            </div>
            <input
              type="text"
              placeholder="e.g. ETP 99.99% Continuous Cast Copper Rod"
              value={copperGrade}
              onChange={(e) => setCopperGrade(e.target.value)}
              className="w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div>
            <div className="h-5 mb-1.5 flex items-center">
              <label className="text-xs font-semibold text-slate-600 truncate">
                Supplier Lot / Heat Number
              </label>
            </div>
            <input
              type="text"
              placeholder="e.g. HEAT-BC-88492"
              value={supplierLotHeatNumber}
              onChange={(e) => setSupplierLotHeatNumber(e.target.value)}
              className="w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
            />
          </div>

          <div>
            <div className="h-5 mb-1.5 flex items-center">
              <label className="text-xs font-semibold text-slate-600 truncate">
                Purchase Rate & Unit *
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                required
                placeholder="e.g. 845.00"
                value={purchaseRate}
                onChange={(e) => setPurchaseRate(e.target.value)}
                className="w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm font-mono text-copper-700 font-bold"
              />
              <select
                value={rateUnit}
                onChange={(e) => setRateUnit(e.target.value as 'PER_KG' | 'PER_MT')}
                className="h-[38px] rounded-lg bg-white border border-slate-300 px-2.5 py-2 text-xs font-mono text-slate-900"
              >
                <option value="PER_KG">PER KG</option>
                <option value="PER_MT">PER MT</option>
              </select>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-[38px] rounded-lg bg-white border border-slate-300 px-2 py-2 text-xs font-mono text-slate-900"
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div>
            <div className="h-5 mb-1.5 flex items-center">
              <label className="text-xs font-semibold text-slate-600 truncate">
                Supporting Document Ref (GRN / E-Way Bill)
              </label>
            </div>
            <input
              type="text"
              placeholder="e.g. GRN-SIL-2026-0940"
              value={supportingDocRef}
              onChange={(e) => setSupportingDocRef(e.target.value)}
              className="w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
            />
          </div>
        </div>

        {/* Individual Coils Entry Section */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-copper-700 flex items-center gap-2">
                <Scale className="w-4 h-4" />
                Individual Coils on Invoice ({coilRows.length} Coils)
              </h3>
              <p className="text-[11px] text-slate-500">
                Each row generates a distinct Internal Coil ID (e.g. ATC-ROD-202611-XXXX) while storing the Supplier Coil # separately.
              </p>
            </div>
            <button
              type="button"
              onClick={addCoilRow}
              className="px-3 py-1.5 rounded-lg bg-copper-100/70 hover:bg-copper-100 border border-copper-300 text-copper-800 text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Another Coil to Invoice
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 px-2">Supplier Coil No</th>
                  <th className="py-2 px-2">Vendor Billed Qty (kg)</th>
                  <th className="py-2 px-2">Received Gross (kg) *</th>
                  <th className="py-2 px-2">Tare (kg)</th>
                  <th className="py-2 px-2 text-right">Received Net (kg)</th>
                  <th className="py-2 px-2 text-right">Wt. Loss / Diff</th>
                  <th className="py-2 px-2 text-right">Coil Value</th>
                  <th className="py-2 px-2">Remarks</th>
                  <th className="py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {coilRows.map((row, idx) => {
                  const net = Math.max(
                    0,
                    Number(row.grossWeightKg || 0) - Number(row.tareWeightKg || 0)
                  );
                  const vend = Number(row.vendorBilledWeightKg || net);
                  const wtDiff = net - vend;
                  const val = net * effectiveRatePerKg;
                  return (
                    <tr key={idx}>
                      <td className="py-2 pr-2 font-mono text-slate-500">#{idx + 1}</td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={row.supplierCoilNumber}
                          onChange={(e) =>
                            updateCoilRow(idx, 'supplierCoilNumber', e.target.value)
                          }
                          placeholder="Supplier Tag #"
                          className="w-32 rounded bg-white border border-slate-300 px-2.5 py-1.5 font-mono text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          value={row.vendorBilledWeightKg}
                          onChange={(e) =>
                            updateCoilRow(idx, 'vendorBilledWeightKg', e.target.value)
                          }
                          placeholder="Vendor Qty"
                          className="w-28 rounded bg-white border border-slate-300 px-2.5 py-1.5 font-mono text-slate-700"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="0.00"
                          value={row.grossWeightKg}
                          onChange={(e) => updateCoilRow(idx, 'grossWeightKg', e.target.value)}
                          className="w-28 rounded bg-white border border-slate-300 px-2.5 py-1.5 font-mono text-slate-900 font-bold"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={row.tareWeightKg}
                          onChange={(e) => updateCoilRow(idx, 'tareWeightKg', e.target.value)}
                          className="w-24 rounded bg-white border border-slate-300 px-2.5 py-1.5 font-mono text-slate-600"
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700">
                        {net.toFixed(2)} kg
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-mono font-bold ${
                          wtDiff < 0
                            ? 'text-rose-600'
                            : wtDiff > 0
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {wtDiff > 0 ? `+${wtDiff.toFixed(2)}` : wtDiff.toFixed(2)} kg
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-700">
                        ₹{val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={(e) => updateCoilRow(idx, 'remarks', e.target.value)}
                          placeholder="Optional note"
                          className="w-36 rounded bg-white border border-slate-300 px-2.5 py-1.5 text-slate-900"
                        />
                      </td>
                      <td className="py-2 pl-2 text-right">
                        {coilRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeCoilRow(idx)}
                            className="p-1.5 text-rose-600 hover:bg-rose-100 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <input
            type="text"
            placeholder="Invoice-level remarks (e.g. LME pricing formula, quality test certificate verified)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="flex-1 rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900"
          />
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg bg-copper-600 hover:bg-copper-500 disabled:opacity-50 text-white font-bold text-sm shadow-md transition-all"
          >
            {submitting
              ? 'Posting Receipt & Generating Coil IDs...'
              : `Post Purchase Receipt (${coilRows.length} Coils)`}
          </button>
        </div>
      </form>

      {/* Registered Purchase Invoices & Received 8mm Coils */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-5 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-copper-600" />
              Purchase Invoices Register ({invoices.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase">
                    <th className="py-2.5 px-2.5">Invoice No</th>
                    <th className="py-2.5 px-2.5">Bill To & Vendor</th>
                    <th className="py-2.5 px-2.5">Date / Size</th>
                    <th className="py-2.5 px-2.5 text-right">Vendor / Receive Qty</th>
                    <th className="py-2.5 px-2.5 text-right">Rate / kg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoicesPager.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No purchase invoices registered yet. Fill out the form above to post your first inward receipt.
                      </td>
                    </tr>
                  ) : (
                    invoicesPager.paginatedItems.map((inv: any) => {
                      const wtDiff = Number(inv.weight_diff_loss_kg || 0);
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-2.5 font-mono font-bold text-copper-700 whitespace-nowrap">
                            <button
                              onClick={() => onNavigateTraceability(inv.invoice_number)}
                              className="hover:underline text-left"
                            >
                              {inv.invoice_number}
                            </button>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <div className="font-semibold text-slate-900">{inv.company_name}</div>
                            <div className="text-[11px] text-slate-500">{inv.supplier_name}</div>
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                            <div>{String(inv.receipt_date).slice(0, 10)}</div>
                            <div className="text-[10px] text-slate-500">
                              {Number(inv.diameter_mm).toFixed(3)} mm • {inv.number_of_coils} coils
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono text-slate-900 whitespace-nowrap">
                            <div className="font-bold">
                              Recv: {Number(inv.total_received_weight_kg).toLocaleString('en-IN')} kg
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Vendor:{' '}
                              {Number(
                                inv.vendor_billed_weight_kg ?? inv.total_received_weight_kg
                              ).toLocaleString('en-IN')}{' '}
                              kg{' '}
                              {wtDiff !== 0 && (
                                <span
                                  className={wtDiff < 0 ? 'text-rose-600 font-bold' : 'text-emerald-700'}
                                >
                                  ({wtDiff > 0 ? `+${wtDiff}` : wtDiff} kg)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono whitespace-nowrap">
                            <div className="font-bold text-emerald-700">
                              ₹{Number(inv.effective_rate_per_kg).toFixed(2)}/kg
                            </div>
                            <div className="text-[10px] text-slate-500">{inv.copper_grade}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <PaginationBar
            currentPage={invoicesPager.currentPage}
            totalItems={invoicesPager.totalItems}
            pageSize={invoicesPager.pageSize}
            onPageChange={invoicesPager.setCurrentPage}
            onPageSizeChange={invoicesPager.setPageSize}
            itemLabel="invoices"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-5 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-3">
              <Scale className="w-4 h-4 text-emerald-700" />
              Individual Inward Copper Coils ({inwardCoils.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase">
                    <th className="py-2.5 px-2.5">Internal Coil ID</th>
                    <th className="py-2.5 px-2.5">Supplier Coil #</th>
                    <th className="py-2.5 px-2.5">Owner</th>
                    <th className="py-2.5 px-2.5 text-right">Initial Net</th>
                    <th className="py-2.5 px-2.5 text-right">Available Now</th>
                    <th className="py-2.5 px-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {inwardCoilsPager.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No inward copper coils registered yet.
                      </td>
                    </tr>
                  ) : (
                    inwardCoilsPager.paginatedItems.map((c: any) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-2.5 font-mono font-bold whitespace-nowrap">
                          <button
                            onClick={() => onNavigateTraceability(c.coil_code)}
                            className="text-copper-700 hover:underline"
                          >
                            {c.coil_code}
                          </button>
                        </td>
                        <td className="py-2.5 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                          {c.supplier_coil_number || '-'}
                        </td>
                        <td className="py-2.5 px-2.5 text-slate-700 whitespace-nowrap">{c.owner_company_code}</td>
                        <td className="py-2.5 px-2.5 text-right font-mono text-slate-600 whitespace-nowrap">
                          {Number(c.initial_net_weight_kg).toFixed(1)} kg
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {Number(c.available_weight_kg).toFixed(1)} kg
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              c.status === 'AVAILABLE'
                                ? 'bg-emerald-100 text-emerald-700'
                                : c.status === 'PARTIALLY_CONSUMED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <PaginationBar
            currentPage={inwardCoilsPager.currentPage}
            totalItems={inwardCoilsPager.totalItems}
            pageSize={inwardCoilsPager.pageSize}
            onPageChange={inwardCoilsPager.setCurrentPage}
            onPageSizeChange={inwardCoilsPager.setPageSize}
            itemLabel="coils"
          />
        </div>
      </div>
    </div>
  );
}

