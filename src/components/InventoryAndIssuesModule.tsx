'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  Boxes,
  Cable,
  Lock,
  MapPin,
  Search,
  ShieldCheck,
} from 'lucide-react';

interface InventoryAndIssuesProps {
  mode: 'INVENTORY' | 'ISSUES';
  data: any;
  onRefresh: () => Promise<void>;
  onNavigateTraceability: (code: string) => void;
}

export function InventoryAndIssuesModule({
  mode,
  data,
  onRefresh,
  onNavigateTraceability,
}: InventoryAndIssuesProps) {
  const { masters, coils, cableIssues, intercompanyTransfers, scrapLots } = data;

  // Filters for Live Inventory
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');
  const [plantFilter, setPlantFilter] = useState<string>('ALL');
  const [diameterFilter, setDiameterFilter] = useState<string>('ALL');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE_ONLY');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Action Modals for Inventory
  const [transferCoil, setTransferCoil] = useState<any | null>(null);
  const [targetLocId, setTargetLocId] = useState<number>(masters.locations[0]?.id || 1);
  const [locRef, setLocRef] = useState('');

  const [reserveCoil, setReserveCoil] = useState<any | null>(null);
  const [reserveSubAction, setReserveSubAction] = useState<'RESERVE' | 'RELEASE'>('RESERVE');
  const [reserveWeight, setReserveWeight] = useState('250.00');
  const [reserveRef, setReserveRef] = useState('ORD-2026-105');

  // Cable Issue Form State (Module 7)
  const [cableBatchNumber, setCableBatchNumber] = useState('RLY-QUAD-2026-108');
  const [issueDate, setIssueDate] = useState('2026-11-02');
  const [issueCompanyId, setIssueCompanyId] = useState<number>(masters.companies[0]?.id || 1);
  const [issuePlantId, setIssuePlantId] = useState<number>(masters.plants[0]?.id || 1);
  const [cableCategoryId, setCableCategoryId] = useState<number>(
    masters.cableCategories[0]?.id || 1
  );
  const [cableDescription, setCableDescription] = useState(
    'RDSO Underground Railway Signalling Cable Batch'
  );
  const [issueMode, setIssueMode] = useState<'COIL_WISE' | 'WEIGHT_BASED'>('COIL_WISE');
  const [conductorDiameterId, setConductorDiameterId] = useState<number>(
    masters.diameters.find((d: any) => Number(d.diameter_mm) === 1.8)?.id ||
      masters.diameters[0]?.id ||
      1
  );
  const [selectedIssueCoilId, setSelectedIssueCoilId] = useState<number>(0);
  const [issueWeightKg, setIssueWeightKg] = useState('250.00');
  const [issueRemarks, setIssueRemarks] = useState('');

  // Intercompany Transfer Form State
  const [icCoilId, setIcCoilId] = useState<number>(0);
  const [icToCompanyId, setIcToCompanyId] = useState<number>(masters.companies[1]?.id || 2);
  const [icDate, setIcDate] = useState('2026-11-02');
  const [icDocRef, setIcDocRef] = useState('IC-CHALLAN-2026/045');
  const [icReason, setIcReason] = useState(
    'Intercompany copper transfer for specialty cable order execution'
  );
  const [icAuthBy, setIcAuthBy] = useState('Plant Commercial Head');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const filteredCoils = useMemo(() => {
    return coils.filter((c: any) => {
      if (companyFilter !== 'ALL' && c.owner_company_id !== Number(companyFilter)) return false;
      if (plantFilter !== 'ALL' && c.plant_id !== Number(plantFilter)) return false;
      if (diameterFilter !== 'ALL' && c.diameter_id !== Number(diameterFilter)) return false;
      if (stageFilter !== 'ALL' && c.processing_stage !== stageFilter) return false;
      if (
        statusFilter === 'ACTIVE_ONLY' &&
        Number(c.available_weight_kg) <= 0 &&
        Number(c.reserved_weight_kg) <= 0
      ) {
        return false;
      }
      if (statusFilter !== 'ALL' && statusFilter !== 'ACTIVE_ONLY' && c.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchCode = c.coil_code?.toLowerCase().includes(q);
        const matchSup = c.supplier_coil_number?.toLowerCase().includes(q);
        const matchBob = c.bobbin_number?.toLowerCase().includes(q);
        const matchInv = c.source_invoice_number?.toLowerCase().includes(q);
        const matchBatch = c.source_batch_number?.toLowerCase().includes(q);
        if (!matchCode && !matchSup && !matchBob && !matchInv && !matchBatch) return false;
      }
      return true;
    });
  }, [
    coils,
    companyFilter,
    plantFilter,
    diameterFilter,
    stageFilter,
    statusFilter,
    searchQuery,
  ]);

  const availableCoilsForCableIssue = useMemo(() => {
    return coils.filter(
      (c: any) =>
        c.owner_company_id === Number(issueCompanyId) &&
        c.diameter_id === Number(conductorDiameterId) &&
        Number(c.available_weight_kg) > 0
    );
  }, [coils, issueCompanyId, conductorDiameterId]);

  const availableCoilsForIcTransfer = useMemo(() => {
    return coils.filter(
      (c: any) =>
        Number(c.available_weight_kg) > 0 && Number(c.reserved_weight_kg) === 0
    );
  }, [coils]);

  const handleLocationTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferCoil) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOCATION_TRANSFER',
          coilId: transferCoil.id,
          toLocationId: Number(targetLocId),
          transferDate: '2026-11-02',
          referenceNumber: locRef || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error);
      setFeedback({
        type: 'ok',
        msg: `Physical location of ${transferCoil.coil_code} updated (Legal owner ${transferCoil.owner_company_name} preserved).`,
      });
      setTransferCoil(null);
      await onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReserveOrRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reserveCoil) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RESERVE_OR_RELEASE',
          coilId: reserveCoil.id,
          subAction: reserveSubAction,
          weightKg: Number(reserveWeight),
          referenceNumber: reserveRef,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error);
      setFeedback({
        type: 'ok',
        msg: `${reserveSubAction} ${reserveWeight} kg on ${reserveCoil.coil_code} recorded in immutable ledger.`,
      });
      setReserveCoil(null);
      await onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCableIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const targetCoilId =
        selectedIssueCoilId || availableCoilsForCableIssue[0]?.id || 0;

      const payload: any = {
        action: 'CABLE_ISSUE',
        cableBatchNumber,
        issueDate,
        ownerCompanyId: Number(issueCompanyId),
        plantId: Number(issuePlantId),
        cableCategoryId: Number(cableCategoryId),
        cableProductDescription: cableDescription,
        issueMode,
        conductorDiameterId: Number(conductorDiameterId),
        remarks: issueRemarks,
      };

      if (issueMode === 'COIL_WISE') {
        if (!targetCoilId) {
          throw new Error('Select a specific coil with available stock for COIL_WISE issuance.');
        }
        payload.coilAllocations = [
          { coilId: Number(targetCoilId), issuedWeightKg: Number(issueWeightKg) },
        ];
      } else {
        payload.bulkWeightKg = Number(issueWeightKg);
      }

      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error);

      setFeedback({
        type: 'ok',
        msg: `Cable Issue ${json.result.issueNumber} posted (${json.result.totalIssuedWeightKg} kg • Precision: ${json.result.traceabilityPrecision}).`,
      });
      await onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleIntercompanyTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const coilIdToUse = icCoilId || availableCoilsForIcTransfer[0]?.id;
      if (!coilIdToUse) throw new Error('Select an available coil to transfer.');

      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'INTERCOMPANY_TRANSFER',
          coilId: Number(coilIdToUse),
          toCompanyId: Number(icToCompanyId),
          transferDate: icDate,
          transferReferenceDoc: icDocRef,
          transferReason: icReason,
          authorizedBy: icAuthBy,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error);

      setFeedback({
        type: 'ok',
        msg: `Intercompany Ownership Transfer ${json.result.transferNumber} completed for coil ${json.result.coilCode}.`,
      });
      await onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'INVENTORY') {
    return (
      <div className="space-y-6">
        {/* Filter Bar */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-copper-600" />
                Module 5: Live Copper Inventory & Auditable Stock Control
              </h2>
              <p className="text-xs text-slate-500">
                Physical plant custody and legal company ownership are tracked separately. Balances are governed strictly by the immutable movement ledger.
              </p>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Coil ID, Supplier Tag, Bobbin, Batch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-copper-500 outline-none"
              />
            </div>
          </div>

          {feedback && (
            <div
              className={`rounded-lg border px-4 py-2.5 text-xs ${
                feedback.type === 'ok'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-rose-300 bg-rose-50 text-rose-800'
              }`}
            >
              {feedback.msg}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                Legal Company Owner
              </label>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="ALL">All Legal Companies</option>
                {masters.companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                Physical Plant
              </label>
              <select
                value={plantFilter}
                onChange={(e) => setPlantFilter(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="ALL">All Plants</option>
                {masters.plants.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                Copper Diameter
              </label>
              <select
                value={diameterFilter}
                onChange={(e) => setDiameterFilter(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="ALL">All Diameters</option>
                {masters.diameters.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {Number(d.diameter_mm).toFixed(2)} mm — {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                Processing Stage
              </label>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="ALL">All Stages</option>
                <option value="RAW_8MM_ROD">RAW_8MM_ROD</option>
                <option value="RBD_DRAWN">RBD_DRAWN</option>
                <option value="CHINA_FINE_DRAWN">CHINA_FINE_DRAWN</option>
                <option value="HARD_COPPER">HARD_COPPER</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                Material Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="ACTIVE_ONLY">In-Stock Only (Avail/Reserved &gt; 0)</option>
                <option value="ALL">All Coils (Including Consumed)</option>
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="PARTIALLY_CONSUMED">PARTIALLY_CONSUMED</option>
                <option value="RESERVED">RESERVED</option>
                <option value="CONSUMED">CONSUMED</option>
                <option value="ISSUED_TO_CABLE">ISSUED_TO_CABLE</option>
              </select>
            </div>
          </div>
        </div>

        {/* Action Drawer for Location Transfer or Reservation */}
        {transferCoil && (
          <form
            onSubmit={handleLocationTransfer}
            className="rounded-xl border border-sky-300 bg-sky-50 p-4 flex flex-col md:flex-row md:items-end gap-4"
          >
            <div className="flex-1">
              <div className="text-xs font-bold text-sky-700 flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                Physical Location Transfer for {transferCoil.coil_code} (Legal Owner:{' '}
                {transferCoil.owner_company_name})
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Current Location: {transferCoil.location_name}. Moving physical location will NOT alter legal company ownership.
              </p>
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-600 mb-1">
                Target Storage Location
              </label>
              <select
                value={targetLocId}
                onChange={(e) => setTargetLocId(Number(e.target.value))}
                className="rounded bg-white border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
              >
                {masters.locations.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.plant_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-600 mb-1">
                Gate / Internal Pass Ref
              </label>
              <input
                type="text"
                placeholder="e.g. MOVE-SIL-102"
                value={locRef}
                onChange={(e) => setLocRef(e.target.value)}
                className="rounded bg-white border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
              >
                Post Transfer
              </button>
              <button
                type="button"
                onClick={() => setTransferCoil(null)}
                className="px-3 py-1.5 rounded bg-slate-100 text-slate-600 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {reserveCoil && (
          <form
            onSubmit={handleReserveOrRelease}
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-col md:flex-row md:items-end gap-4"
          >
            <div className="flex-1">
              <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                <Lock className="w-4 h-4" />
                Stock Reservation / Release on {reserveCoil.coil_code}
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Available: {Number(reserveCoil.available_weight_kg).toFixed(2)} kg • Currently Reserved:{' '}
                {Number(reserveCoil.reserved_weight_kg).toFixed(2)} kg
              </p>
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-600 mb-1">Action</label>
              <select
                value={reserveSubAction}
                onChange={(e) => setReserveSubAction(e.target.value as 'RESERVE' | 'RELEASE')}
                className="rounded bg-white border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
              >
                <option value="RESERVE">RESERVE WEIGHT</option>
                <option value="RELEASE">RELEASE RESERVATION</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-600 mb-1">
                Weight (kg)
              </label>
              <input
                type="number"
                step="0.01"
                value={reserveWeight}
                onChange={(e) => setReserveWeight(e.target.value)}
                className="w-28 rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-slate-600 mb-1">
                Order Reference
              </label>
              <input
                type="text"
                required
                value={reserveRef}
                onChange={(e) => setReserveRef(e.target.value)}
                className="w-36 rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
              >
                Execute
              </button>
              <button
                type="button"
                onClick={() => setReserveCoil(null)}
                className="px-3 py-1.5 rounded bg-slate-100 text-slate-600 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Main Coil-wise Stock Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase">
                  <th className="py-2.5 pr-2">Internal Coil ID</th>
                  <th className="py-2.5 px-2">Supplier Tag / Bobbin</th>
                  <th className="py-2.5 px-2">Legal Owner</th>
                  <th className="py-2.5 px-2">Plant & Location</th>
                  <th className="py-2.5 px-2">Size & Stage</th>
                  <th className="py-2.5 px-2 text-right">Available (kg)</th>
                  <th className="py-2.5 px-2 text-right">Reserved</th>
                  <th className="py-2.5 px-2 text-right">Orig Rate/kg</th>
                  <th className="py-2.5 px-2 text-right">Stage Cost/kg</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 pl-2 text-right">Ledger Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredCoils.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-2 font-mono font-bold">
                      <button
                        onClick={() => onNavigateTraceability(c.coil_code)}
                        className="text-copper-700 hover:underline"
                      >
                        {c.coil_code}
                      </button>
                      {c.is_demo && (
                        <span className="ml-1.5 px-1 py-0.5 text-[9px] rounded bg-amber-100 text-amber-800">
                          DEMO
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-slate-600">
                      {c.supplier_coil_number || c.bobbin_number || '-'}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="font-semibold text-slate-900">{c.owner_company_name}</span>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="text-slate-700">{c.location_name}</div>
                      <div className="text-[10px] text-slate-500">{c.plant_name}</div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="font-mono font-bold text-sky-700">
                        {Number(c.diameter_mm).toFixed(2)} mm
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {c.processing_stage}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-700">
                      {Number(c.available_weight_kg).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-amber-800">
                      {Number(c.reserved_weight_kg).toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                      ₹{Number(c.original_purchase_rate_per_kg).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-copper-700">
                      ₹{Number(c.effective_cost_per_kg).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          c.status === 'AVAILABLE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : c.status === 'PARTIALLY_CONSUMED'
                            ? 'bg-amber-100 text-amber-800'
                            : c.status === 'RESERVED'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 text-right space-x-1">
                      <button
                        onClick={() => {
                          setTransferCoil(c);
                          setTargetLocId(c.current_location_id);
                        }}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] text-sky-700"
                      >
                        Move
                      </button>
                      <button
                        onClick={() => {
                          setReserveCoil(c);
                          setReserveSubAction(
                            Number(c.reserved_weight_kg) > 0 ? 'RELEASE' : 'RESERVE'
                          );
                        }}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] text-amber-800"
                      >
                        Reserve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Scrap Lots Inventory */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
            Audited Scrap & Recoverable Waste Lots ({scrapLots.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase">
                  <th className="py-2 pr-3">Scrap Lot Code</th>
                  <th className="py-2 px-3">Source Batch</th>
                  <th className="py-2 px-3">Owner Company</th>
                  <th className="py-2 px-3">Scrap Type</th>
                  <th className="py-2 px-3 text-right">Weight (kg)</th>
                  <th className="py-2 px-3 text-right">Source Cu Rate/kg</th>
                  <th className="py-2 px-3 text-right">Recovery Valuation/kg</th>
                  <th className="py-2 pl-3 text-right">Total Recovery Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {scrapLots.map((s: any) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-3 font-mono font-bold text-amber-800">
                      {s.scrap_code}
                    </td>
                    <td className="py-2 px-3 font-mono text-copper-700">
                      <button
                        onClick={() => onNavigateTraceability(s.batch_number)}
                        className="hover:underline"
                      >
                        {s.batch_number}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-slate-700">{s.owner_company_name}</td>
                    <td className="py-2 px-3 font-mono text-slate-600">{s.scrap_type}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                      {Number(s.weight_kg).toFixed(2)} kg
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600">
                      ₹{Number(s.source_copper_rate_per_kg).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-700">
                      ₹{Number(s.recovery_valuation_per_kg).toFixed(2)}
                    </td>
                    <td className="py-2 pl-3 text-right font-mono font-bold text-emerald-700">
                      ₹{Number(s.total_recovery_value).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // MODE === 'ISSUES': Cable Production Linkage (Module 7) + Intercompany Transfers
  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-xs ${
            feedback.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-rose-300 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 1. Module 7: Configurable Cable Production Issue Entry */}
        <form
          onSubmit={handleCreateCableIssue}
          className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-copper-100/80 border border-copper-300 text-copper-600">
                <Cable className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Module 7: Cable Production Linkage (Configurable Issuance)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Supports both Coil-wise scanned issues and Weight-based pool issues without inventing false precision.
                </p>
              </div>
            </div>
            <span className="px-2 py-1 rounded text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
              WORKFLOW PENDING PLANT VERIFICATION
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Finished Cable Batch Number *
              </label>
              <input
                type="text"
                required
                value={cableBatchNumber}
                onChange={(e) => setCableBatchNumber(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Issue Mode (Configurable) *
              </label>
              <select
                value={issueMode}
                onChange={(e) =>
                  setIssueMode(e.target.value as 'COIL_WISE' | 'WEIGHT_BASED')
                }
                className="w-full rounded-lg bg-white border border-copper-300 px-3 py-2 text-xs font-mono font-bold text-copper-700"
              >
                <option value="COIL_WISE">
                  COIL_WISE (Exact Coil/Bobbin Linked)
                </option>
                <option value="WEIGHT_BASED">
                  WEIGHT_BASED (Bulk Weight — Marks Precision as UNRESOLVED)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Legal Company *
              </label>
              <select
                value={issueCompanyId}
                onChange={(e) => setIssueCompanyId(Number(e.target.value))}
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900"
              >
                {masters.companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Cable Category *
              </label>
              <select
                value={cableCategoryId}
                onChange={(e) => setCableCategoryId(Number(e.target.value))}
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900"
              >
                {masters.cableCategories.map((cc: any) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Conductor Copper Diameter *
              </label>
              <select
                value={conductorDiameterId}
                onChange={(e) => setConductorDiameterId(Number(e.target.value))}
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
              >
                {masters.diameters.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {Number(d.diameter_mm).toFixed(2)} mm — {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Issue Quantity (kg) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={issueWeightKg}
                onChange={(e) => setIssueWeightKg(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-emerald-700"
              />
            </div>
          </div>

          {issueMode === 'COIL_WISE' ? (
            <div>
              <label className="block text-xs font-semibold text-sky-700 mb-1">
                Select Specific Copper Coil / Bobbin to Issue From *
              </label>
              <select
                value={selectedIssueCoilId || availableCoilsForCableIssue[0]?.id || ''}
                onChange={(e) => setSelectedIssueCoilId(Number(e.target.value))}
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
              >
                {availableCoilsForCableIssue.length === 0 ? (
                  <option value="">No available coils for selected company & diameter</option>
                ) : (
                  availableCoilsForCableIssue.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.coil_code} ({c.bobbin_number || c.supplier_coil_number || 'Stock'}) • Avail:{' '}
                      {Number(c.available_weight_kg).toFixed(1)} kg • Cost: ₹
                      {Number(c.effective_cost_per_kg).toFixed(2)}/kg
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>Weight-Based Issuance Mode Active:</strong> Because specific bobbins are not scanned in this mode, the system will deduct {issueWeightKg} kg from the company&apos;s diameter stock pool and explicitly mark source traceability as{' '}
                <code className="text-amber-800">UNRESOLVED_PENDING_VERIFICATION</code> rather than inventing false coil-level precision.
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Cable Product Description
            </label>
            <input
              type="text"
              value={cableDescription}
              onChange={(e) => setCableDescription(e.target.value)}
              className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-copper-600 hover:bg-copper-500 text-white font-bold text-xs shadow"
          >
            Post Copper Issue to Cable Production
          </button>
        </form>

        {/* 2. Explicit Intercompany Legal Ownership Transfer */}
        <form
          onSubmit={handleIntercompanyTransfer}
          className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-100 border border-purple-300 text-purple-600">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Multi-Company Legal Ownership Transfer
                </h2>
                <p className="text-[11px] text-slate-500">
                  A coil owned by one company never becomes another company&apos;s stock automatically at a shared plant. Record explicit transfers here.
                </p>
              </div>
            </div>
            <ShieldCheck className="w-5 h-5 text-purple-600 shrink-0" />
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Select Copper Coil / Bobbin to Transfer Ownership *
              </label>
              <select
                value={icCoilId || availableCoilsForIcTransfer[0]?.id || ''}
                onChange={(e) => setIcCoilId(Number(e.target.value))}
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
              >
                {availableCoilsForIcTransfer.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.coil_code} • Current Legal Owner: {c.owner_company_name} •{' '}
                    {Number(c.diameter_mm).toFixed(2)} mm ({Number(c.available_weight_kg).toFixed(1)}{' '}
                    kg @ ₹{Number(c.original_purchase_rate_per_kg).toFixed(2)}/kg)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Transfer Legal Ownership To *
                </label>
                <select
                  value={icToCompanyId}
                  onChange={(e) => setIcToCompanyId(Number(e.target.value))}
                  className="w-full rounded-lg bg-white border border-purple-300 px-3 py-2 text-xs font-bold text-purple-700"
                >
                  {masters.companies.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Transfer Date *
                </label>
                <input
                  type="date"
                  value={icDate}
                  onChange={(e) => setIcDate(e.target.value)}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Supporting Document Reference *
                </label>
                <input
                  type="text"
                  required
                  value={icDocRef}
                  onChange={(e) => setIcDocRef(e.target.value)}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Authorized By *
                </label>
                <input
                  type="text"
                  required
                  value={icAuthBy}
                  onChange={(e) => setIcAuthBy(e.target.value)}
                  className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Commercial / Operational Transfer Reason *
              </label>
              <input
                type="text"
                required
                value={icReason}
                onChange={(e) => setIcReason(e.target.value)}
                className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow"
            >
              Execute Intercompany Legal Ownership Transfer
            </button>
          </div>
        </form>
      </div>

      {/* Cable Production Issues & Intercompany Transfers Registers */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
            Cable Production Issues Register ({cableIssues.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase">
                  <th className="py-2 pr-2">Issue / Cable Batch</th>
                  <th className="py-2 px-2">Company & Category</th>
                  <th className="py-2 px-2">Mode & Precision</th>
                  <th className="py-2 px-2 text-right">Weight (kg)</th>
                  <th className="py-2 pl-2 text-right">Copper Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {cableIssues.map((ci: any) => (
                  <tr key={ci.id}>
                    <td className="py-2.5 pr-2 font-mono">
                      <button
                        onClick={() => onNavigateTraceability(ci.cable_batch_number)}
                        className="font-bold text-copper-700 hover:underline"
                      >
                        {ci.cable_batch_number}
                      </button>
                      <div className="text-[10px] text-slate-500">{ci.issue_number}</div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="text-slate-900 font-semibold">{ci.owner_company_name}</div>
                      <div className="text-[10px] text-slate-500">
                        {ci.cable_category_name} ({Number(ci.conductor_mm).toFixed(2)} mm)
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="font-mono text-sky-700 text-[11px]">{ci.issue_mode}</div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                          ci.traceability_precision === 'EXACT_COIL_LINKED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ci.traceability_precision}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900">
                      {Number(ci.total_issued_weight_kg).toFixed(2)} kg
                    </td>
                    <td className="py-2.5 pl-2 text-right font-mono">
                      <div className="font-bold text-emerald-700">
                        ₹{Number(ci.total_attributed_copper_cost).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ₹{Number(ci.weighted_avg_copper_cost_per_kg).toFixed(2)}/kg
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
            Intercompany Legal Ownership Transfers ({intercompanyTransfers.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase">
                  <th className="py-2 pr-2">Transfer No</th>
                  <th className="py-2 px-2">Coil ID</th>
                  <th className="py-2 px-2">From → To Company</th>
                  <th className="py-2 px-2 text-right">Weight / Rate</th>
                  <th className="py-2 pl-2">Reference & Auth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {intercompanyTransfers.map((ic: any) => (
                  <tr key={ic.id}>
                    <td className="py-2.5 pr-2 font-mono font-bold text-purple-700">
                      {ic.transfer_number}
                      <div className="text-[10px] text-slate-500">
                        {String(ic.transfer_date).slice(0, 10)}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 font-mono">
                      <button
                        onClick={() => onNavigateTraceability(ic.coil_code)}
                        className="text-copper-700 hover:underline font-bold"
                      >
                        {ic.coil_code}
                      </button>
                      <div className="text-[10px] text-slate-500">
                        {Number(ic.diameter_mm).toFixed(2)} mm
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="text-rose-700">{ic.from_company_name}</span>
                      <span className="mx-1 text-slate-500">→</span>
                      <span className="text-emerald-700 font-semibold">{ic.to_company_name}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono">
                      <div className="text-slate-900 font-bold">
                        {Number(ic.weight_transferred_kg).toFixed(1)} kg
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Orig: ₹{Number(ic.original_purchase_rate_per_kg).toFixed(2)}/kg
                      </div>
                    </td>
                    <td className="py-2.5 pl-2">
                      <div className="font-mono text-slate-700">{ic.transfer_reference_doc}</div>
                      <div className="text-[10px] text-slate-500">By: {ic.authorized_by}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

