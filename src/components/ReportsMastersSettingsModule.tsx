'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Sliders,
  Trash2,
  Wrench,
} from 'lucide-react';

interface ReportsMastersSettingsProps {
  mode: 'REPORTS' | 'MASTERS' | 'SETTINGS';
  data: any;
  onRefresh: () => Promise<void>;
}

const REPORT_DEFINITIONS = [
  { key: 'inward_register', label: '1. Copper Inward Register' },
  { key: 'rbd_production_register', label: '2. RBD & Production Register' },
  { key: 'coil_stock_register', label: '3. Coil-Wise Stock Register' },
  { key: 'machine_production_report', label: '4. Machine-Wise Production Report' },
  { key: 'diameter_output_report', label: '5. Diameter-Wise Output Report' },
  { key: 'scrap_wastage_report', label: '6. Scrap & Wastage Report' },
  { key: 'purchase_rate_history', label: '7. Purchase-Rate History' },
  { key: 'traceability_report', label: '8. Copper Traceability Report' },
  { key: 'material_consumption_report', label: '9. Material Consumption Report' },
  { key: 'intercompany_movement_report', label: '10. Intercompany Movement Report' },
];

export function ReportsMastersSettingsModule({
  mode,
  data,
  onRefresh,
}: ReportsMastersSettingsProps) {
  const { masters, settings } = data;

  // Reports State
  const [reportKey, setReportKey] = useState('inward_register');
  const [companyId, setCompanyId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [diameterId, setDiameterId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [batchSearch, setBatchSearch] = useState('');
  const [reportRows, setReportRows] = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  // Masters Form States
  const [newDiaMm, setNewDiaMm] = useState('');
  const [newDiaLabel, setNewDiaLabel] = useState('');
  const [newDiaRef, setNewDiaRef] = useState('');
  const [newDiaCat, setNewDiaCat] = useState('FINE_WIRE');
  const [newDiaVerify, setNewDiaVerify] = useState('PENDING_CONFIRMATION');

  const [newRouteProcId, setNewRouteProcId] = useState<number>(
    masters.processTypes[0]?.id || 1
  );
  const [newRouteInDiaId, setNewRouteInDiaId] = useState<number>(
    masters.diameters[0]?.id || 1
  );
  const [newRouteOutDiaId, setNewRouteOutDiaId] = useState<number>(
    masters.diameters[1]?.id || 2
  );
  const [newRouteWastage, setNewRouteWastage] = useState('0.75');
  const [newRouteCost, setNewRouteCost] = useState('14.00');

  const [newBobCode, setNewBobCode] = useState('');
  const [newBobName, setNewBobName] = useState('');
  const [newBobTare, setNewBobTare] = useState('25.00');
  const [newBobCap, setNewBobCap] = useState('400.00');

  const [feedback, setFeedback] = useState<string | null>(null);

  const loadReport = async () => {
    setLoadingReport(true);
    try {
      const qs = new URLSearchParams({
        reportKey,
        includeDemo: String(data.includeDemo),
      });
      if (companyId) qs.set('companyId', companyId);
      if (machineId) qs.set('machineId', machineId);
      if (diameterId) qs.set('diameterId', diameterId);
      if (fromDate) qs.set('fromDate', fromDate);
      if (toDate) qs.set('toDate', toDate);
      if (batchSearch) qs.set('batchSearch', batchSearch);

      const res = await fetch(`/api/reports?${qs.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setReportRows(json.rows || []);
      }
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (mode === 'REPORTS') {
      loadReport();
    }
  }, [
    mode,
    reportKey,
    companyId,
    machineId,
    diameterId,
    fromDate,
    toDate,
    batchSearch,
    data.includeDemo,
  ]);

  const exportCsv = () => {
    if (!reportRows || reportRows.length === 0) return;
    const headers = Object.keys(reportRows[0]);
    const csvLines = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...reportRows.map((row) =>
        headers
          .map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `copper_control_tower_${reportKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const postMasterAction = async (payload: any, msg: string) => {
    setFeedback(null);
    const res = await fetch('/api/masters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      setFeedback(msg);
      await onRefresh();
    } else {
      setFeedback(`Error: ${json.error}`);
    }
  };

  if (mode === 'REPORTS') {
    const columns = reportRows.length > 0 ? Object.keys(reportRows[0]) : [];

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-copper-100/80 border border-copper-300 text-copper-600">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Module 9: Operational Registers & Management Reports (10 Registers)
                </h2>
                <p className="text-xs text-slate-500">
                  Filter by company, machine, copper diameter, date range, or batch number and export to CSV/Excel.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={exportCsv}
              disabled={reportRows.length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-2 self-start"
            >
              <Download className="w-4 h-4" /> Export CSV / Excel ({reportRows.length} Rows)
            </button>
          </div>

          {/* 10 Report Selector Tabs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {REPORT_DEFINITIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setReportKey(r.key)}
                className={`text-left px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                  reportKey === r.key
                    ? 'bg-copper-100/90 border-copper-400 text-slate-900'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-2">
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                Company Filter
              </label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="">All Companies</option>
                {masters.companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                Machine Filter
              </label>
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="w-full rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="">All Machines</option>
                {masters.machines.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                Diameter Filter
              </label>
              <select
                value={diameterId}
                onChange={(e) => setDiameterId(e.target.value)}
                className="w-full rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              >
                <option value="">All Diameters</option>
                {masters.diameters.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {Number(d.diameter_mm).toFixed(2)} mm
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-1">
                Batch / Coil Search
              </label>
              <input
                type="text"
                placeholder="Search ID..."
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                className="w-full rounded bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900"
              />
            </div>
          </div>

          {/* Report Data Table */}
          <div className="overflow-x-auto pt-2">
            {loadingReport ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Loading register data...
              </div>
            ) : reportRows.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No matching rows found for the selected filter criteria.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase">
                    {columns.map((col) => (
                      <th key={col} className="py-2.5 px-2.5 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {reportRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50">
                      {columns.map((col) => (
                        <td
                          key={col}
                          className="py-2.5 px-2.5 font-mono text-slate-700 whitespace-nowrap"
                        >
                          {row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'MASTERS') {
    return (
      <div className="space-y-6">
        {feedback && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
            {feedback}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* 1. Copper Diameters Master */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-copper-600" />
                  Copper Diameters Master ({masters.diameters.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Spoken sizes from meeting (1.8, 1.6, 1.4, 1.0, 0.9, 0.6 mm & CAT6 sizes) with explicit plant verification status.
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                postMasterAction(
                  {
                    action: 'ADD_DIAMETER',
                    diameterMm: newDiaMm,
                    label: newDiaLabel,
                    swgAwgRef: newDiaRef,
                    category: newDiaCat,
                    verificationStatus: newDiaVerify,
                  },
                  `Added copper diameter ${newDiaMm} mm.`
                );
                setNewDiaMm('');
                setNewDiaLabel('');
              }}
              className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-white p-3 rounded-lg border border-slate-200"
            >
              <input
                type="number"
                step="0.01"
                required
                placeholder="Ø mm (e.g. 1.20)"
                value={newDiaMm}
                onChange={(e) => setNewDiaMm(e.target.value)}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs font-mono text-slate-900"
              />
              <input
                type="text"
                required
                placeholder="Label"
                value={newDiaLabel}
                onChange={(e) => setNewDiaLabel(e.target.value)}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs text-slate-900"
              />
              <input
                type="text"
                placeholder="SWG / AWG Ref"
                value={newDiaRef}
                onChange={(e) => setNewDiaRef(e.target.value)}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs text-slate-900"
              />
              <select
                value={newDiaVerify}
                onChange={(e) => setNewDiaVerify(e.target.value)}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs text-slate-900"
              >
                <option value="PENDING_CONFIRMATION">PENDING VERIFY</option>
                <option value="VERIFIED">VERIFIED</option>
              </select>
              <button
                type="submit"
                className="rounded bg-copper-600 hover:bg-copper-500 text-white text-xs font-bold px-3 py-1.5"
              >
                + Add Size
              </button>
            </form>

            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase">
                    <th className="py-2 pr-2">Ø (mm)</th>
                    <th className="py-2 px-2">Label & Gauge</th>
                    <th className="py-2 px-2">Verification Status</th>
                    <th className="py-2 pl-2 text-right">Toggle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {masters.diameters.map((d: any) => (
                    <tr key={d.id}>
                      <td className="py-2 pr-2 font-mono font-bold text-slate-900">
                        {Number(d.diameter_mm).toFixed(2)} mm
                      </td>
                      <td className="py-2 px-2">
                        <div className="text-slate-700">{d.label}</div>
                        <div className="text-[10px] text-slate-500">
                          {d.swg_awg_ref} • {d.notes}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            d.verification_status === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {d.verification_status}
                        </span>
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          onClick={() =>
                            postMasterAction(
                              {
                                action: 'TOGGLE_DIAMETER_VERIFICATION',
                                id: d.id,
                                verificationStatus:
                                  d.verification_status === 'VERIFIED'
                                    ? 'PENDING_CONFIRMATION'
                                    : 'VERIFIED',
                              },
                              `Updated verification status for ${d.diameter_mm} mm.`
                            )
                          }
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] text-slate-600"
                        >
                          Flip Status
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Allowed Input/Output Process Routes & Standard Wastage Master */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Allowed Process Routes & Standard Wastage % ({masters.routes.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Configurable manufacturing routes. Unconfirmed spoken combinations are marked PENDING_CONFIRMATION.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                postMasterAction(
                  {
                    action: 'ADD_ROUTE',
                    processTypeId: newRouteProcId,
                    inputDiameterId: newRouteInDiaId,
                    outputDiameterId: newRouteOutDiaId,
                    standardWastagePct: newRouteWastage,
                    standardProcessingCostPerKg: newRouteCost,
                    verificationStatus: 'PENDING_CONFIRMATION',
                  },
                  'Added new allowed process route combination.'
                );
              }}
              className="grid grid-cols-2 sm:grid-cols-6 gap-2 bg-white p-3 rounded-lg border border-slate-200"
            >
              <select
                value={newRouteProcId}
                onChange={(e) => setNewRouteProcId(Number(e.target.value))}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs text-slate-900"
              >
                {masters.processTypes.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </select>
              <select
                value={newRouteInDiaId}
                onChange={(e) => setNewRouteInDiaId(Number(e.target.value))}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs font-mono text-slate-900"
              >
                {masters.diameters.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    In: {Number(d.diameter_mm).toFixed(2)}
                  </option>
                ))}
              </select>
              <select
                value={newRouteOutDiaId}
                onChange={(e) => setNewRouteOutDiaId(Number(e.target.value))}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs font-mono text-slate-900"
              >
                {masters.diameters.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    Out: {Number(d.diameter_mm).toFixed(2)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.05"
                placeholder="Wastage %"
                value={newRouteWastage}
                onChange={(e) => setNewRouteWastage(e.target.value)}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs font-mono text-slate-900"
              />
              <input
                type="number"
                step="0.5"
                placeholder="Cost/kg"
                value={newRouteCost}
                onChange={(e) => setNewRouteCost(e.target.value)}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs font-mono text-slate-900"
              />
              <button
                type="submit"
                className="rounded bg-copper-600 hover:bg-copper-500 text-white text-xs font-bold px-2 py-1.5"
              >
                + Add Route
              </button>
            </form>

            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase">
                    <th className="py-2 pr-2">Process</th>
                    <th className="py-2 px-2">Input → Output</th>
                    <th className="py-2 px-2 text-right">Std Wastage %</th>
                    <th className="py-2 px-2 text-right">Std Cost/kg</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 pl-2 text-right">Toggle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {masters.routes.map((r: any) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-2 font-mono font-bold text-sky-700">
                        {r.process_code}
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-900">
                        {Number(r.input_mm).toFixed(2)} → {Number(r.output_mm).toFixed(2)} mm
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-amber-800">
                        {Number(r.standard_wastage_pct).toFixed(2)}%
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-700">
                        ₹{Number(r.standard_processing_cost_per_kg).toFixed(2)}
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            r.verification_status === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.verification_status}
                        </span>
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          onClick={() =>
                            postMasterAction(
                              {
                                action: 'TOGGLE_ROUTE_VERIFICATION',
                                id: r.id,
                                verificationStatus:
                                  r.verification_status === 'VERIFIED'
                                    ? 'PENDING_CONFIRMATION'
                                    : 'VERIFIED',
                              },
                              'Updated route verification status.'
                            )
                          }
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] text-slate-600"
                        >
                          Flip
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Bobbin Types & Tare Weights Master */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Bobbin Types & Standard Tare Weights ({masters.bobbins.length})
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                postMasterAction(
                  {
                    action: 'ADD_BOBBIN',
                    code: newBobCode,
                    name: newBobName,
                    standardTareWeightKg: newBobTare,
                    maxNetCapacityKg: newBobCap,
                  },
                  `Added bobbin type ${newBobCode}.`
                );
                setNewBobCode('');
                setNewBobName('');
              }}
              className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-white p-3 rounded-lg border border-slate-200"
            >
              <input
                type="text"
                required
                placeholder="Code (e.g. DIN-800)"
                value={newBobCode}
                onChange={(e) => setNewBobCode(e.target.value)}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs font-mono text-slate-900"
              />
              <input
                type="text"
                required
                placeholder="Bobbin Description"
                value={newBobName}
                onChange={(e) => setNewBobName(e.target.value)}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs text-slate-900"
              />
              <input
                type="number"
                step="0.1"
                required
                placeholder="Tare kg"
                value={newBobTare}
                onChange={(e) => setNewBobTare(e.target.value)}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs font-mono text-slate-900"
              />
              <input
                type="number"
                step="1"
                placeholder="Max Cap kg"
                value={newBobCap}
                onChange={(e) => setNewBobCap(e.target.value)}
                className="rounded bg-white border border-slate-300 px-2 py-1.5 text-xs font-mono text-slate-900"
              />
              <button
                type="submit"
                className="rounded bg-copper-600 hover:bg-copper-500 text-white text-xs font-bold px-2 py-1.5"
              >
                + Add Bobbin
              </button>
            </form>

            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase">
                  <th className="py-2 pr-2">Bobbin Code</th>
                  <th className="py-2 px-2">Name & Material</th>
                  <th className="py-2 px-2 text-right">Standard Tare (kg)</th>
                  <th className="py-2 pl-2 text-right">Max Net Capacity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {masters.bobbins.map((b: any) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-2 font-mono font-bold text-copper-700">
                      {b.code}
                    </td>
                    <td className="py-2 px-2 text-slate-900">
                      {b.name}{' '}
                      <span className="text-[10px] text-slate-500">({b.material})</span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700">
                      {Number(b.standard_tare_weight_kg).toFixed(2)} kg
                    </td>
                    <td className="py-2 pl-2 text-right font-mono text-slate-600">
                      {Number(b.max_net_capacity_kg).toFixed(0)} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. Machines, Storage Locations & Finished Cable Categories */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Machines, Storage Locations & Cable Categories
            </h3>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              <div>
                <div className="text-xs font-bold text-sky-700 mb-1">
                  Configured Machines ({masters.machines.length})
                </div>
                {masters.machines.map((m: any) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-slate-200"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900 mr-2">{m.code}</span>
                      <span className="text-slate-600">{m.name}</span>
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 text-copper-700">
                      {m.process_code} • {m.verification_status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <div className="text-xs font-bold text-emerald-700 mb-1">
                  Finished Cable Categories ({masters.cableCategories.length})
                </div>
                {masters.cableCategories.map((cc: any) => (
                  <div
                    key={cc.id}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-slate-200"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{cc.name}</div>
                      <div className="text-[10px] text-slate-500">
                        Typical Sizes: {cc.typical_conductor_sizes}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      {cc.verification_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MODE === 'SETTINGS'
  return (
    <div className="space-y-6">
      {feedback && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demo Data Isolation & Purge Controls */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
            <Database className="w-5 h-5 text-copper-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Demo Data vs. Live Production Data Isolation
              </h3>
              <p className="text-xs text-slate-500">
                Every demo transaction is tagged with `is_demo = TRUE` and badged in the UI so demo data is never confused with real plant production.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Display Labeled Demo Workflow Data
                </div>
                <div className="text-xs text-slate-500">
                  Toggle visibility of `is_demo = TRUE` records across all dashboards and registers.
                </div>
              </div>
              <button
                onClick={() =>
                  postMasterAction(
                    {
                      action: 'UPDATE_SETTING',
                      key: 'SHOW_DEMO_DATA',
                      value: data.includeDemo ? 'false' : 'true',
                    },
                    `Demo data visibility set to ${!data.includeDemo}.`
                  )
                }
                className={`px-4 py-2 rounded-lg text-xs font-bold ${
                  data.includeDemo
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                }`}
              >
                {data.includeDemo
                  ? 'Showing Demo + Live (Click to Hide Demo)'
                  : 'Live Production Only (Click to Show Demo)'}
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Purge All Demo Operational Records
                </div>
                <div className="text-xs text-slate-500">
                  Permanently deletes only `is_demo = TRUE` invoices, coils, batches, and movements while preserving masters and real production records.
                </div>
              </div>
              <button
                onClick={() =>
                  postMasterAction(
                    { action: 'PURGE_DEMO_DATA' },
                    'Purged all demo transactions cleanly. Real production data and masters preserved.'
                  )
                }
                className="px-4 py-2 rounded-lg bg-rose-100 hover:bg-rose-200 border border-rose-300 text-rose-700 text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" /> Purge Demo Data
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Re-Seed Demo Workflow
                </div>
                <div className="text-xs text-slate-500">
                  Restores the sample Hindalco/Sterlite/Kutch invoices, RBD batches, China Fine spools, and Cable issues if demo data was purged.
                </div>
              </div>
              <button
                onClick={() =>
                  postMasterAction(
                    { action: 'RESEED_DEMO_DATA' },
                    'Demo workflow re-seeded.'
                  )
                }
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-copper-700 text-xs font-bold shrink-0"
              >
                Re-Seed Demo Data
              </button>
            </div>
          </div>
        </div>

        {/* Decimal Precision & System Parameters */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
            <Sliders className="w-5 h-5 text-sky-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                System Precision & Invariant Configuration
              </h3>
              <p className="text-xs text-slate-500">
                Database storage uses exact PostgreSQL `NUMERIC(14,4)` and `decimal.js` arithmetic.
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {settings.map((st: any) => (
              <div
                key={st.key}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-xs"
              >
                <div>
                  <div className="font-mono font-bold text-copper-700">{st.key}</div>
                  <div className="text-slate-500 text-[11px]">{st.description}</div>
                </div>
                <span className="px-2.5 py-1 rounded bg-white border border-slate-300 font-mono text-slate-900 font-bold">
                  {st.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

