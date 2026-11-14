'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cog,
  Flame,
  Plus,
  RotateCcw,
  Scale,
  Trash2,
} from 'lucide-react';
import { EditableMasterSelect } from './EditableMasterSelect';
import { PaginationBar, usePagination } from './PaginationBar';

interface ProductionModuleProps {
  mode: 'RBD' | 'DOWNSTREAM';
  data: any;
  onRefresh: () => Promise<void>;
  onNavigateTraceability: (code: string) => void;
}

export function ProductionModule({
  mode,
  data,
  onRefresh,
  onNavigateTraceability,
}: ProductionModuleProps) {
  const { masters, coils, batches } = data;

  const availableProcesses = useMemo(() => {
    if (mode === 'RBD') {
      return masters.processTypes.filter((p: any) => p.code === 'RBD');
    }
    return masters.processTypes.filter((p: any) => p.code !== 'RBD');
  }, [mode, masters.processTypes]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(
    masters.companies[0]?.id || 1
  );
  const [processTypeId, setProcessTypeId] = useState<number>(
    availableProcesses[0]?.id || 1
  );

  useEffect(() => {
    if (availableProcesses.length > 0) {
      setProcessTypeId(availableProcesses[0].id);
    }
  }, [mode, availableProcesses]);

  const filteredMachines = useMemo(
    () => masters.machines.filter((m: any) => m.process_type_id === Number(processTypeId)),
    [masters.machines, processTypeId]
  );

  const [machineId, setMachineId] = useState<number>(
    filteredMachines[0]?.id || masters.machines[0]?.id || 1
  );

  useEffect(() => {
    if (filteredMachines.length > 0) {
      setMachineId(filteredMachines[0].id);
    }
  }, [filteredMachines]);

  const defaultInputDia = useMemo(() => {
    if (mode === 'RBD') {
      return (
        masters.diameters.find((d: any) => Number(d.diameter_mm) === 8)?.id ||
        masters.diameters[0]?.id
      );
    }
    return (
      masters.diameters.find((d: any) => Number(d.diameter_mm) === 1.6)?.id ||
      masters.diameters.find((d: any) => Number(d.diameter_mm) === 1.8)?.id ||
      masters.diameters[0]?.id
    );
  }, [mode, masters.diameters]);

  const defaultOutputDia = useMemo(() => {
    if (mode === 'RBD') {
      return (
        masters.diameters.find((d: any) => Number(d.diameter_mm) === 1.8)?.id ||
        masters.diameters.find((d: any) => Number(d.diameter_mm) === 1.6)?.id ||
        masters.diameters[0]?.id
      );
    }
    return (
      masters.diameters.find((d: any) => Number(d.diameter_mm) === 0.6)?.id ||
      masters.diameters.find((d: any) => Number(d.diameter_mm) === 1.0)?.id ||
      masters.diameters[0]?.id
    );
  }, [mode, masters.diameters]);

  const [inputDiameterId, setInputDiameterId] = useState<number>(defaultInputDia || 1);
  const [outputDiameterId, setOutputDiameterId] = useState<number>(defaultOutputDia || 2);

  useEffect(() => {
    if (defaultInputDia) setInputDiameterId(defaultInputDia);
    if (defaultOutputDia) setOutputDiameterId(defaultOutputDia);
  }, [mode, defaultInputDia, defaultOutputDia]);

  const [productionDate, setProductionDate] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [shift, setShift] = useState('DAY');
  const [operatorName, setOperatorName] = useState('');
  const [scrapQuantityKg, setScrapQuantityKg] = useState('');
  const [recoverableWasteKg, setRecoverableWasteKg] = useState('');
  const [processLossKg, setProcessLossKg] = useState('');
  const [remarks, setRemarks] = useState('');
  const [excessWeightReason, setExcessWeightReason] = useState('');

  // Candidate input coils matching selected company & input diameter with available_weight_kg > 0
  const candidateInputCoils = useMemo(() => {
    return coils.filter(
      (c: any) =>
        c.owner_company_id === Number(selectedCompanyId) &&
        c.diameter_id === Number(inputDiameterId) &&
        Number(c.available_weight_kg) > 0
    );
  }, [coils, selectedCompanyId, inputDiameterId]);

  const [selectedInputs, setSelectedInputs] = useState<
    Array<{ coilId: number; consumedWeightKg: string }>
  >([]);

  // Automatically select first candidate coil when switching company/diameter if empty, with empty weight
  useEffect(() => {
    if (candidateInputCoils.length > 0) {
      const first = candidateInputCoils[0];
      setSelectedInputs([
        { coilId: first.id, consumedWeightKg: '' },
      ]);
    } else {
      setSelectedInputs([]);
    }
  }, [candidateInputCoils]);

  const defaultBobbin = useMemo(() => {
    if (mode === 'RBD') {
      return masters.bobbins.find((b: any) => b.code === 'BOB-DIN630') || masters.bobbins[0];
    }
    return masters.bobbins.find((b: any) => b.code === 'SPL-CFN250') || masters.bobbins[0];
  }, [mode, masters.bobbins]);

  const defaultLocation = useMemo(() => {
    if (mode === 'RBD') {
      return (
        masters.locations.find((l: any) => l.location_type === 'RBD_FLOOR')?.id ||
        masters.locations[0]?.id
      );
    }
    return (
      masters.locations.find((l: any) => l.location_type === 'FINE_WIRE_WIP')?.id ||
      masters.locations[0]?.id
    );
  }, [mode, masters.locations]);

  const [outputRows, setOutputRows] = useState<
    Array<{
      outputBobbinNumber: string;
      bobbinTypeId: number;
      grossWeightKg: string;
      tareWeightKg: string;
      readingMeters: string;
      isHardCopper: boolean;
      storageLocationId: number;
      remarks: string;
    }>
  >([]);

  useEffect(() => {
    setOutputRows([
      {
        outputBobbinNumber: '',
        bobbinTypeId: defaultBobbin?.id || 1,
        grossWeightKg: '',
        tareWeightKg: '',
        readingMeters: '',
        isHardCopper: false,
        storageLocationId: defaultLocation || 1,
        remarks: '',
      },
    ]);
  }, [mode, defaultBobbin, defaultLocation]);

  // Matched route configuration from allowed_process_routes
  const activeRouteConfig = useMemo(() => {
    return masters.routes.find(
      (r: any) =>
        r.process_type_id === Number(processTypeId) &&
        r.input_diameter_id === Number(inputDiameterId) &&
        r.output_diameter_id === Number(outputDiameterId)
    );
  }, [masters.routes, processTypeId, inputDiameterId, outputDiameterId]);

  // Live Reconciliation & Costing Calculations
  const liveCalc = useMemo(() => {
    let totalInputKg = 0;
    let totalInputCost = 0;
    let totalOriginalPurchaseCost = 0;

    for (const item of selectedInputs) {
      const c = coils.find((x: any) => x.id === Number(item.coilId));
      const w = Math.max(0, Number(item.consumedWeightKg || 0));
      totalInputKg += w;
      if (c) {
        totalInputCost += w * Number(c.effective_cost_per_kg || 0);
        totalOriginalPurchaseCost += w * Number(c.original_purchase_rate_per_kg || 0);
      }
    }

    const usableOutputKg = outputRows.reduce((sum, r) => {
      const net = Math.max(0, Number(r.grossWeightKg || 0) - Number(r.tareWeightKg || 0));
      return sum + net;
    }, 0);

    const scrapKg = Math.max(0, Number(scrapQuantityKg || 0));
    const recovKg = Math.max(0, Number(recoverableWasteKg || 0));
    const lossKg = Math.max(0, Number(processLossKg || 0));

    const totalAccountedKg = usableOutputKg + scrapKg + recovKg + lossKg;
    const unexplainedDiffKg = totalInputKg - totalAccountedKg;
    const exceedsInput = unexplainedDiffKg < -0.0001;
    const isReconciled = Math.abs(unexplainedDiffKg) <= 0.0001;

    const yieldPct = totalInputKg > 0 ? (usableOutputKg / totalInputKg) * 100 : 0;
    const weightedAvgOrigRate =
      totalInputKg > 0 ? totalOriginalPurchaseCost / totalInputKg : 0;
    const procCostPerKg = Number(
      activeRouteConfig?.standard_processing_cost_per_kg ?? 12.0
    );
    const scrapCreditPct =
      Number(activeRouteConfig?.scrap_recovery_credit_pct ?? 92.0) / 100;
    const scrapRecoveryCredit =
      (scrapKg + recovKg) * weightedAvgOrigRate * scrapCreditPct;
    const netBatchCost =
      totalInputCost + totalInputKg * procCostPerKg - scrapRecoveryCredit;
    const usableOutputCostPerKg =
      usableOutputKg > 0 ? netBatchCost / usableOutputKg : 0;

    return {
      totalInputKg,
      usableOutputKg,
      scrapKg,
      recovKg,
      lossKg,
      totalAccountedKg,
      unexplainedDiffKg,
      exceedsInput,
      isReconciled,
      yieldPct,
      weightedAvgOrigRate,
      procCostPerKg,
      scrapRecoveryCredit,
      netBatchCost,
      usableOutputCostPerKg,
    };
  }, [
    selectedInputs,
    coils,
    outputRows,
    scrapQuantityKg,
    recoverableWasteKg,
    processLossKg,
    activeRouteConfig,
  ]);

  const excessReasonGiven = excessWeightReason.trim().length > 0;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [reversingBatch, setReversingBatch] = useState<any | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  const addInputCoil = () => {
    const usedIds = new Set(selectedInputs.map((i) => Number(i.coilId)));
    const nextCoil = candidateInputCoils.find((c: any) => !usedIds.has(c.id));
    if (!nextCoil) return;
    setSelectedInputs((prev) => [
      ...prev,
      {
        coilId: nextCoil.id,
        consumedWeightKg: '',
      },
    ]);
  };

  const addOutputBobbin = () => {
    setOutputRows((prev) => [
      ...prev,
      {
        outputBobbinNumber: '',
        bobbinTypeId: defaultBobbin?.id || 1,
        grossWeightKg: '',
        tareWeightKg: '',
        readingMeters: '',
        isHardCopper: false,
        storageLocationId: defaultLocation || 1,
        remarks: '',
      },
    ]);
  };

  const handleAutoBalanceOutput = () => {
    if (outputRows.length === 0 || liveCalc.totalInputKg <= 0) return;
    const nonUsable = liveCalc.scrapKg + liveCalc.recovKg + liveCalc.lossKg;
    const targetUsable = Math.max(0, liveCalc.totalInputKg - nonUsable);
    const perBobbinNet = targetUsable / outputRows.length;

    setOutputRows((prev) =>
      prev.map((row) => {
        const tare = Number(row.tareWeightKg || 0);
        return {
          ...row,
          grossWeightKg: (perBobbinNet + tare).toFixed(2),
        };
      })
    );
  };

  const submitBatch = async (targetStatus: 'DRAFT' | 'POSTED') => {
    setError(null);
    setLastResult(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchNumber: batchNumber.trim() || undefined,
          productionDate,
          processTypeId: Number(processTypeId),
          machineId: Number(machineId),
          inputDiameterId: Number(inputDiameterId),
          outputDiameterId: Number(outputDiameterId),
          status: targetStatus,
          inputs: selectedInputs.map((i) => ({
            coilId: Number(i.coilId),
            consumedWeightKg: Number(i.consumedWeightKg),
          })),
          outputs: outputRows.map((o) => ({
            outputBobbinNumber: o.outputBobbinNumber,
            bobbinTypeId: Number(o.bobbinTypeId),
            grossWeightKg: Number(o.grossWeightKg),
            tareWeightKg: Number(o.tareWeightKg),
            readingMeters: o.readingMeters ? Number(o.readingMeters) : null,
            isHardCopper: Boolean(o.isHardCopper),
            storageLocationId: Number(o.storageLocationId),
            remarks: o.remarks,
          })),
          scrapQuantityKg: Number(scrapQuantityKg || 0),
          recoverableWasteKg: Number(recoverableWasteKg || 0),
          processLossKg: Number(processLossKg || 0),
          shift,
          operatorName,
          remarks,
          excessWeightReason: liveCalc.exceedsInput
            ? excessWeightReason.trim() || undefined
            : undefined,
          isDemo: false,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to save production batch');
      }
      setLastResult(json.result);
      setBatchNumber('');
      setExcessWeightReason('');
      await onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverseBatch = async () => {
    if (!reversingBatch) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REVERSE',
          batchId: reversingBatch.id,
          reason: reversalReason,
          actor: operatorName || 'Supervisor',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Reversal failed');
      }
      setReversingBatch(null);
      setReversalReason('');
      await onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBatches = useMemo(() => {
    if (mode === 'RBD') {
      return batches.filter((b: any) => b.process_code === 'RBD');
    }
    return batches.filter((b: any) => b.process_code !== 'RBD');
  }, [batches, mode]);

  const rbdBobbins = useMemo(
    () => coils.filter((c: any) => c.origin_type === 'RBD_OUTPUT'),
    [coils]
  );

  const batchesPager = usePagination<any>(filteredBatches, 10);
  const rbdBobbinsPager = usePagination<any>(rbdBobbins, 10);

  return (
    <div className="space-y-6">
      {/* Main Operator Entry Card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 shadow-lg space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-copper-100/80 border border-copper-300 text-copper-600">
              {mode === 'RBD' ? <Flame className="w-5 h-5" /> : <Cog className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {mode === 'RBD'
                  ? 'Module 2: RBD Production Entry & Weight Reconciliation'
                  : 'Module 3: Further Copper Processing (China Fine, Hard Copper & Annealing)'}
              </h2>
              <p className="text-xs text-slate-500">
                Supports partial coil consumption, multi-coil mixing, 1-to-many output bobbins, and atomic inventory reconciliation.
              </p>
            </div>
          </div>

          {/* Route Verification Indicator */}
          <div>
            {activeRouteConfig ? (
              <div
                className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${
                  activeRouteConfig.verification_status === 'VERIFIED'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-amber-50 border-amber-300 text-amber-800'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Route {Number(activeRouteConfig.input_mm).toFixed(2)} →{' '}
                  {Number(activeRouteConfig.output_mm).toFixed(2)} mm:{' '}
                  <strong>{activeRouteConfig.verification_status}</strong> (Std Wastage:{' '}
                  {Number(activeRouteConfig.standard_wastage_pct).toFixed(2)}%)
                </span>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Custom / Unverified Route Combination (Allowed in flexible mode)</span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-800">
            <strong>Production Validation / Invariant Error:</strong> {error}
          </div>
        )}

        {lastResult && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-800 space-y-2">
            <div className="font-bold text-sm text-emerald-700">
              Batch {lastResult.batchNumber} ({lastResult.status}) — Reconciliation:{' '}
              {lastResult.reconciliationStatus} • Yield: {lastResult.yieldPct}% • Output Cost: ₹
              {Number(lastResult.usableOutputCostPerKg).toFixed(2)}/kg
            </div>
            <div className="flex flex-wrap gap-2">
              {lastResult.createdOutputCoils.map((c: any) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => onNavigateTraceability(c.coilCode)}
                  className="px-2.5 py-1 rounded bg-emerald-100 border border-emerald-300 font-mono text-slate-900 hover:bg-emerald-200"
                >
                  {c.coilCode} ({c.bobbinNumber} • {Number(c.netWeightKg).toFixed(1)} kg)
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Batch Metadata Controls - Structured 3-column layout for wide, uncluttered fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <EditableMasterSelect
            label="Legal Stock Owner"
            required
            entityType="COMPANY"
            addAction="ADD_COMPANY"
            value={selectedCompanyId}
            onChange={(id) => setSelectedCompanyId(id)}
            onRefresh={onRefresh}
            placeholderPrimary="Company Name"
            options={masters.companies.map((c: any) => ({
              id: c.id,
              label: c.name,
            }))}
          />

          <div>
            <div className="h-5 mb-1.5 flex items-center">
              <label className="text-xs font-semibold text-slate-600 truncate">
                Process Stage *
              </label>
            </div>
            <select
              value={processTypeId}
              onChange={(e) => setProcessTypeId(Number(e.target.value))}
              className="w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              {availableProcesses.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.verification_status === 'PENDING_CONFIRMATION' ? 'Pending Verify' : 'Verified'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="h-5 mb-1.5 flex items-center">
              <label className="text-xs font-semibold text-slate-600 truncate">
                Machine *
              </label>
            </div>
            <select
              value={machineId}
              onChange={(e) => setMachineId(Number(e.target.value))}
              className="w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              {(filteredMachines.length > 0 ? filteredMachines : masters.machines).map(
                (m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                )
              )}
            </select>
          </div>

          <EditableMasterSelect
            label="Input Diameter"
            required
            entityType="DIAMETER"
            addAction="ADD_DIAMETER"
            value={inputDiameterId}
            onChange={(id) => setInputDiameterId(id)}
            onRefresh={onRefresh}
            isNumericPrimary
            placeholderPrimary="mm (e.g. 8.00)"
            className="font-mono"
            options={masters.diameters.map((d: any) => ({
              id: d.id,
              label: `${Number(d.diameter_mm).toFixed(3)} mm (${d.category})`,
            }))}
          />

          <EditableMasterSelect
            label="Output Diameter"
            required
            entityType="DIAMETER"
            addAction="ADD_DIAMETER"
            value={outputDiameterId}
            onChange={(id) => setOutputDiameterId(id)}
            onRefresh={onRefresh}
            isNumericPrimary
            placeholderPrimary="mm (e.g. 1.40)"
            className="font-mono text-copper-700 font-bold"
            options={masters.diameters.map((d: any) => ({
              id: d.id,
              label: `${Number(d.diameter_mm).toFixed(3)} mm`,
            }))}
          />

          <div>
            <div className="h-5 mb-1.5 flex items-center">
              <label className="text-xs font-semibold text-slate-600 truncate">
                Production Date *
              </label>
            </div>
            <input
              type="date"
              value={productionDate}
              onChange={(e) => setProductionDate(e.target.value)}
              className="w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
            />
          </div>
        </div>

        {/* Input Coils & Partial / Mixed Consumption */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-700">
                1. Input Copper Coils & Consumed Quantities (Supports Partial Consumption & Multi-Coil Mixing)
              </h3>
              <p className="text-[11px] text-slate-500">
                {candidateInputCoils.length} coils available for selected company & input diameter. Mixing coils preserves weighted-average source cost & lineage.
              </p>
            </div>
            <button
              type="button"
              onClick={addInputCoil}
              disabled={selectedInputs.length >= candidateInputCoils.length}
              className="px-3 py-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 disabled:opacity-40 border border-sky-300 text-sky-800 text-xs font-semibold flex items-center gap-1.5 self-start"
            >
              <Plus className="w-3.5 h-3.5" /> Mix / Add Another Input Coil
            </button>
          </div>

          {candidateInputCoils.length === 0 ? (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-lg p-3">
              No available copper coils found for this Legal Company and Input Diameter. Receive copper in Module 1 or select another diameter/company.
            </div>
          ) : (
            <div className="space-y-2">
              {selectedInputs.map((inp, idx) => {
                const coilObj = coils.find((c: any) => c.id === Number(inp.coilId));
                const avail = Number(coilObj?.available_weight_kg ?? 0);
                const consumed = Number(inp.consumedWeightKg || 0);
                const remaining = Math.max(0, avail - consumed);
                const isPartial = remaining > 0.001;

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="md:col-span-5">
                      <label className="block text-[10px] uppercase text-slate-500 mb-1">
                        Select Input Coil / Bobbin #{idx + 1}
                      </label>
                      <select
                        value={inp.coilId}
                        onChange={(e) => {
                          const newId = Number(e.target.value);
                          const c = coils.find((x: any) => x.id === newId);
                          setSelectedInputs((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? {
                                    coilId: newId,
                                    consumedWeightKg: Math.min(
                                      1000,
                                      Number(c?.available_weight_kg ?? 0)
                                    ).toFixed(2),
                                  }
                                : row
                            )
                          );
                        }}
                        className="w-full rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900"
                      >
                        {candidateInputCoils.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.coil_code} • Avail: {Number(c.available_weight_kg).toFixed(1)} kg • Orig Rate: ₹
                            {Number(c.original_purchase_rate_per_kg).toFixed(2)}/kg (
                            {c.supplier_coil_number || c.bobbin_number || 'Stock'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[10px] uppercase text-slate-500 mb-1">
                        Quantity Consumed (kg) *
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={inp.consumedWeightKg}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedInputs((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, consumedWeightKg: val } : row
                              )
                            );
                          }}
                          className="w-full rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-mono font-bold text-sky-700"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedInputs((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? { ...row, consumedWeightKg: avail.toFixed(2) }
                                  : row
                              )
                            )
                          }
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-mono text-slate-600 shrink-0"
                        >
                          Full ({avail.toFixed(0)})
                        </button>
                      </div>
                    </div>

                    <div className="md:col-span-3 text-xs font-mono">
                      <div className="text-slate-500">
                        Remaining on Coil:{' '}
                        <span className="text-slate-900 font-bold">{remaining.toFixed(2)} kg</span>
                      </div>
                      <div className="mt-0.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            isPartial
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {isPartial ? 'PARTIAL CONSUMPTION' : 'FULL CONSUMPTION'}
                        </span>
                      </div>
                    </div>

                    <div className="md:col-span-1 text-right">
                      {selectedInputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedInputs((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1.5 text-rose-600 hover:bg-rose-100 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Output Coils / Bobbins Section */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-copper-700">
                2. Output Bobbins / Spools (Net Weight = Gross Weight − Tare Weight)
              </h3>
              <p className="text-[11px] text-slate-500">
                Each output bobbin receives a new unique internal Coil ID linked to all contributing input coils.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoBalanceOutput}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold"
              >
                Auto-Balance Gross Weights to Input
              </button>
              <button
                type="button"
                onClick={addOutputBobbin}
                className="px-3 py-1.5 rounded-lg bg-copper-100/70 hover:bg-copper-100 border border-copper-300 text-copper-800 text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Output Bobbin
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 px-2">Bobbin Sr. NO *</th>
                  <th className="py-2 px-2">Bobbin Type</th>
                  <th className="py-2 px-2">G. Weight (kg) *</th>
                  <th className="py-2 px-2">B. Weight Tare (kg) *</th>
                  <th className="py-2 px-2 text-right">N. Weight Net (kg)</th>
                  <th className="py-2 px-2">Reading (Meters)</th>
                  <th className="py-2 px-2 text-center">Hard (H)</th>
                  <th className="py-2 px-2">Location</th>
                  <th className="py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {outputRows.map((out, idx) => {
                  const net = Math.max(
                    0,
                    Number(out.grossWeightKg || 0) - Number(out.tareWeightKg || 0)
                  );
                  return (
                    <tr key={idx}>
                      <td className="py-2 pr-2 font-mono text-slate-500">#{idx + 1}</td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          required
                          placeholder="e.g. SR-1564"
                          value={out.outputBobbinNumber}
                          onChange={(e) =>
                            setOutputRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, outputBobbinNumber: e.target.value } : r
                              )
                            )
                          }
                          className="w-28 rounded bg-white border border-slate-300 px-2.5 py-1.5 font-mono text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={out.bobbinTypeId}
                          onChange={(e) => {
                            const bId = Number(e.target.value);
                            setOutputRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? { ...r, bobbinTypeId: bId }
                                  : r
                              )
                            );
                          }}
                          className="w-36 rounded bg-white border border-slate-300 px-2 py-1.5 text-slate-900"
                        >
                          {masters.bobbins.map((b: any) => (
                            <option key={b.id} value={b.id}>
                              {b.code} ({Number(b.standard_tare_weight_kg).toFixed(1)} kg)
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={out.grossWeightKg}
                          onChange={(e) =>
                            setOutputRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, grossWeightKg: e.target.value } : r
                              )
                            )
                          }
                          className="w-24 rounded bg-white border border-slate-300 px-2.5 py-1.5 font-mono font-bold text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={out.tareWeightKg}
                          onChange={(e) =>
                            setOutputRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, tareWeightKg: e.target.value } : r
                              )
                            )
                          }
                          className="w-24 rounded bg-white border border-slate-300 px-2.5 py-1.5 font-mono text-slate-600"
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700">
                        {net.toFixed(2)} kg
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="1"
                          placeholder="e.g. 32400"
                          value={out.readingMeters}
                          onChange={(e) =>
                            setOutputRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, readingMeters: e.target.value } : r
                              )
                            )
                          }
                          className="w-24 rounded bg-white border border-slate-300 px-2 py-1.5 font-mono text-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={out.isHardCopper}
                          onChange={(e) =>
                            setOutputRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, isHardCopper: e.target.checked } : r
                              )
                            )
                          }
                          className="w-4 h-4 accent-copper-600 rounded"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={out.storageLocationId}
                          onChange={(e) =>
                            setOutputRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? { ...r, storageLocationId: Number(e.target.value) }
                                  : r
                              )
                            )
                          }
                          className="w-36 rounded bg-white border border-slate-300 px-2 py-1.5 text-slate-900"
                        >
                          {masters.locations.map((l: any) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pl-2 text-right">
                        {outputRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setOutputRows((prev) => prev.filter((_, i) => i !== idx))
                            }
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

        {/* Scrap, Loss & Live Material Reconciliation Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label className="block text-[11px] font-semibold text-amber-800 mb-1">
                Drawing Scrap (kg)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={scrapQuantityKg}
                onChange={(e) => setScrapQuantityKg(e.target.value)}
                className="w-full rounded bg-white border border-slate-300 px-2.5 py-2 text-sm font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-amber-800 mb-1">
                Recov. Waste (kg)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={recoverableWasteKg}
                onChange={(e) => setRecoverableWasteKg(e.target.value)}
                className="w-full rounded bg-white border border-slate-300 px-2.5 py-2 text-sm font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Process Loss (kg)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={processLossKg}
                onChange={(e) => setProcessLossKg(e.target.value)}
                className="w-full rounded bg-white border border-slate-300 px-2.5 py-2 text-sm font-mono text-slate-900"
              />
            </div>
            <div className="col-span-3 grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Operator Name</label>
                <input
                  type="text"
                  placeholder="Enter operator name"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Shift</label>
                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  className="w-full rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="DAY">DAY SHIFT</option>
                  <option value="NIGHT">NIGHT SHIFT</option>
                </select>
              </div>
            </div>
          </div>

          {/* Live Reconciliation & Costing Card */}
          <div
            className={`lg:col-span-7 rounded-xl border p-4 space-y-3 ${
              liveCalc.exceedsInput
                ? excessReasonGiven
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-rose-300 bg-rose-50'
                : liveCalc.isReconciled
                ? 'border-emerald-300 bg-emerald-50/70'
                : 'border-amber-300 bg-amber-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-copper-700" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Live Material Weight Reconciliation & Cost Attribution
                </span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                  liveCalc.exceedsInput
                    ? excessReasonGiven
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-rose-500 text-white'
                    : liveCalc.isReconciled
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {liveCalc.exceedsInput
                  ? excessReasonGiven
                    ? `EXCESS OUTPUT: +${Math.abs(liveCalc.unexplainedDiffKg).toFixed(2)} kg (REASON RECORDED)`
                    : `EXCESS OUTPUT: +${Math.abs(liveCalc.unexplainedDiffKg).toFixed(2)} kg — REASON REQUIRED`
                  : liveCalc.isReconciled
                  ? '100% WEIGHT RECONCILED'
                  : `UNEXPLAINED VARIANCE: ${liveCalc.unexplainedDiffKg.toFixed(2)} kg`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <div className="text-[10px] text-slate-500">Input Weight</div>
                <div className="font-bold text-sky-700">{liveCalc.totalInputKg.toFixed(2)} kg</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Usable Output</div>
                <div className="font-bold text-emerald-700">
                  {liveCalc.usableOutputKg.toFixed(2)} kg
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Scrap + Recov</div>
                <div className="font-bold text-amber-800">
                  {(liveCalc.scrapKg + liveCalc.recovKg).toFixed(2)} kg
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Process Loss</div>
                <div className="font-bold text-slate-600">{liveCalc.lossKg.toFixed(2)} kg</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Unexplained Diff</div>
                <div
                  className={`font-bold ${
                    liveCalc.exceedsInput
                      ? 'text-rose-600'
                      : liveCalc.isReconciled
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {liveCalc.unexplainedDiffKg.toFixed(2)} kg
                </div>
              </div>
            </div>

            {liveCalc.exceedsInput && (
              <div>
                <label className="block text-[11px] font-semibold text-rose-700 mb-1">
                  Reason for Excess Weight (required to post) — output is{' '}
                  {Math.abs(liveCalc.unexplainedDiffKg).toFixed(2)} kg more than input
                </label>
                <input
                  type="text"
                  placeholder="e.g. weighbridge/scale variance, bobbin tare mismatch, lubricant on wire"
                  value={excessWeightReason}
                  onChange={(e) => setExcessWeightReason(e.target.value)}
                  className="w-full rounded bg-white border border-rose-300 px-2.5 py-2 text-xs text-slate-900"
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1">
              <div>
                <span className="text-slate-500">Blended Purchase Rate: </span>
                <span className="text-slate-900 font-bold">
                  ₹{liveCalc.weightedAvgOrigRate.toFixed(2)}/kg
                </span>
              </div>
              <div>
                <span className="text-slate-500">Scrap Credit: </span>
                <span className="text-emerald-700 font-bold">
                  -₹{liveCalc.scrapRecoveryCredit.toFixed(0)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Usable Output Cost: </span>
                <span className="text-copper-700 font-bold">
                  ₹{liveCalc.usableOutputCostPerKg.toFixed(2)}/kg
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <input
            type="text"
            placeholder="Production batch remarks (e.g. inline annealer speed, die change, variance note)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="flex-1 rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => submitBatch('DRAFT')}
              className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs"
            >
              Save as Draft (No Stock Deduction)
            </button>
            <button
              type="button"
              disabled={
                submitting ||
                (liveCalc.exceedsInput && !excessReasonGiven) ||
                selectedInputs.length === 0
              }
              title={
                liveCalc.exceedsInput && !excessReasonGiven
                  ? 'Enter a reason for the excess weight to post this batch'
                  : undefined
              }
              onClick={() => submitBatch('POSTED')}
              className="px-6 py-2.5 rounded-lg bg-copper-600 hover:bg-copper-500 disabled:opacity-40 text-white font-bold text-sm shadow-md"
            >
              {submitting ? 'Posting Atomic Batch...' : 'Post Production Batch'}
            </button>
          </div>
        </div>
      </div>

      {/* Compensating Reversal Modal */}
      {reversingBatch && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-rose-800 flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              Compensating Transaction Reversal for Batch {reversingBatch.batch_number}
            </h3>
            <button
              onClick={() => setReversingBatch(null)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-rose-700">
            Batches are never silently deleted. Reversing creates a compensating ledger movement (`REVERSAL_COMPENSATION`) that restores {Number(reversingBatch.total_input_weight_kg).toFixed(2)} kg back to the input coils and quarantines the output bobbins.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Enter mandatory supervisor audit reason for reversal (min 5 chars)..."
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              className="flex-1 rounded-lg bg-white border border-rose-300 px-3 py-2 text-xs text-slate-900"
            />
            <button
              onClick={handleReverseBatch}
              disabled={submitting || reversalReason.trim().length < 5}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold"
            >
              Execute Compensating Reversal
            </button>
          </div>
        </div>
      )}

      {/* Posted & Draft Batches Register */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 pb-3">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
            {mode === 'RBD'
              ? `RBD Production Batches Register (${filteredBatches.length})`
              : `Further Processing Batches Register (${filteredBatches.length})`}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase">
                  <th className="py-2.5 px-2.5">Batch No</th>
                  <th className="py-2.5 px-2.5">Date / Machine</th>
                  <th className="py-2.5 px-2.5">Company</th>
                  <th className="py-2.5 px-2.5">Size Route</th>
                  <th className="py-2.5 px-2.5 text-right">Input (kg)</th>
                  <th className="py-2.5 px-2.5 text-right">Usable Out (kg)</th>
                  <th className="py-2.5 px-2.5 text-right">Scrap / Loss</th>
                  <th className="py-2.5 px-2.5 text-right">Unexplained Diff</th>
                  <th className="py-2.5 px-2.5 text-right">Output Cost/kg</th>
                  <th className="py-2.5 px-2.5">Reconciliation</th>
                  <th className="py-2.5 px-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {batchesPager.paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-400">
                      No production batches recorded yet. Select input coils and output bobbins above to post a batch.
                    </td>
                  </tr>
                ) : (
                  batchesPager.paginatedItems.map((b: any) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2.5 font-mono font-bold whitespace-nowrap">
                        <button
                          onClick={() => onNavigateTraceability(b.batch_number)}
                          className="text-copper-700 hover:underline"
                        >
                          {b.batch_number}
                        </button>
                        {b.is_mixed_source && (
                          <span className="ml-1.5 px-1.5 py-0.5 text-[9px] rounded bg-sky-100 text-sky-700">
                            MIXED
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                        {String(b.production_date).slice(0, 10)} • {b.machine_code}
                      </td>
                      <td className="py-2.5 px-2.5 text-slate-700 whitespace-nowrap">{b.owner_company_code}</td>
                      <td className="py-2.5 px-2.5 font-mono text-slate-900 whitespace-nowrap">
                        {Number(b.input_mm).toFixed(2)} → {Number(b.output_mm).toFixed(2)} mm
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                        {Number(b.total_input_weight_kg).toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {Number(b.total_usable_output_kg).toFixed(1)} ({Number(b.yield_pct).toFixed(1)}%)
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-600 whitespace-nowrap">
                        {(
                          Number(b.scrap_quantity_kg) + Number(b.recoverable_waste_kg)
                        ).toFixed(1)}{' '}
                        / {Number(b.process_loss_kg).toFixed(1)}
                      </td>
                      <td
                        className={`py-2.5 px-2.5 text-right font-mono font-bold whitespace-nowrap ${
                          Number(b.unexplained_diff_kg) > 0.001
                            ? 'text-rose-600'
                            : Number(b.unexplained_diff_kg) < -0.001
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {Number(b.unexplained_diff_kg).toFixed(2)} kg
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-copper-700 font-bold whitespace-nowrap">
                        ₹{Number(b.usable_output_cost_per_kg).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            b.status === 'REVERSED'
                              ? 'bg-slate-100 text-slate-500 line-through'
                              : b.status === 'DRAFT'
                              ? 'bg-indigo-100 text-indigo-700'
                              : b.reconciliation_status === 'RECONCILED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : b.reconciliation_status === 'EXCESS_OUTPUT'
                              ? 'bg-amber-100 text-amber-800 font-bold'
                              : 'bg-rose-100 text-rose-700 font-bold'
                          }`}
                        >
                          {b.status === 'POSTED' ? b.reconciliation_status : b.status}
                        </span>
                        {b.excess_weight_reason && (
                          <div
                            className="mt-1 max-w-[220px] truncate text-[10px] text-amber-800"
                            title={b.excess_weight_reason}
                          >
                            Reason: {b.excess_weight_reason}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                        {b.status === 'POSTED' && (
                          <button
                            onClick={() => setReversingBatch(b)}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 text-[10px] font-mono"
                          >
                            Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <PaginationBar
          currentPage={batchesPager.currentPage}
          totalItems={batchesPager.totalItems}
          pageSize={batchesPager.pageSize}
          onPageChange={batchesPager.setCurrentPage}
          onPageSizeChange={batchesPager.setPageSize}
          itemLabel="batches"
        />
      </div>

      {/* Individual RBD Output Bobbins Register (Sr. NO, B. Weight, G. Weight, N. Weight, Reading, Hard Flag) */}
      {mode === 'RBD' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  RBD Output Bobbins Register ({rbdBobbins.length} Bobbins)
                </h3>
                <p className="text-xs text-slate-500">
                  Plant RBD Bobbin Log — Showing Sr. NO, Size, Bobbin Tare (B. Weight), Gross (G. Weight), Net (N. Weight), Meter Reading, and Hard (H) Copper Flag.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase bg-slate-50/80">
                    <th className="py-2.5 px-2.5">Bobbin Sr. NO</th>
                    <th className="py-2.5 px-2.5">Internal ID</th>
                    <th className="py-2.5 px-2.5">Date / Batch</th>
                    <th className="py-2.5 px-2.5">Size</th>
                    <th className="py-2.5 px-2.5 text-right">B. Weight (kg)</th>
                    <th className="py-2.5 px-2.5 text-right">G. Weight (kg)</th>
                    <th className="py-2.5 px-2.5 text-right">N. Weight (kg)</th>
                    <th className="py-2.5 px-2.5 text-right">Reading (m)</th>
                    <th className="py-2.5 px-2.5 text-center">Hard (H)</th>
                    <th className="py-2.5 px-2.5 text-right">Rate / Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {rbdBobbinsPager.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center font-sans text-slate-400">
                        No RBD output bobbins recorded yet.
                      </td>
                    </tr>
                  ) : (
                    rbdBobbinsPager.paginatedItems.map((c: any) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-2.5 font-bold text-slate-900 whitespace-nowrap">
                          {c.bobbin_number || '-'}
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <button
                            onClick={() => onNavigateTraceability(c.coil_code)}
                            className="text-copper-700 font-bold hover:underline"
                          >
                            {c.coil_code}
                          </button>
                        </td>
                        <td className="py-2.5 px-2.5 text-slate-600 whitespace-nowrap">
                          {String(c.receipt_or_production_date).slice(0, 10)} •{' '}
                          <span className="text-slate-500">{c.source_batch_number}</span>
                        </td>
                        <td className="py-2.5 px-2.5 font-bold text-sky-700 whitespace-nowrap">
                          {Number(c.diameter_mm).toFixed(3)} mm
                        </td>
                        <td className="py-2.5 px-2.5 text-right text-slate-600 whitespace-nowrap">
                          {Number(c.tare_weight_kg).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right text-slate-700 whitespace-nowrap">
                          {Number(c.gross_weight_kg).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-bold text-emerald-700 whitespace-nowrap">
                          {Number(c.initial_net_weight_kg).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right text-slate-700 whitespace-nowrap">
                          {c.reading_meters ? Number(c.reading_meters).toLocaleString('en-IN') : '-'}
                        </td>
                        <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                          {c.is_hard_copper ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10px]">
                              H (HARD)
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-right text-copper-700 font-bold whitespace-nowrap">
                          ₹{Number(c.original_purchase_rate_per_kg).toFixed(0)} → ₹
                          {Number(c.effective_cost_per_kg).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <PaginationBar
            currentPage={rbdBobbinsPager.currentPage}
            totalItems={rbdBobbinsPager.totalItems}
            pageSize={rbdBobbinsPager.pageSize}
            onPageChange={rbdBobbinsPager.setCurrentPage}
            onPageSizeChange={rbdBobbinsPager.setPageSize}
            itemLabel="bobbins"
          />
        </div>
      )}
    </div>
  );
}

