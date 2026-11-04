'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Coins,
  GitBranch,
  Info,
  Layers,
  Search,
  ShieldCheck,
} from 'lucide-react';

interface TraceabilityAndCostingProps {
  mode: 'TRACEABILITY' | 'COSTING';
  data: any;
  initialQuery?: string;
  onSelectQuery: (q: string) => void;
}

const STAGE_COLUMNS = [
  { col: 0, title: '1. Original Receipt', sub: 'Purchase Invoice' },
  { col: 1, title: '2. 8mm Input Coils', sub: 'Unique Internal Rod IDs' },
  { col: 2, title: '3. RBD Batch', sub: 'Rod Breakdown Process' },
  { col: 3, title: '4. RBD Bobbins & Scrap', sub: 'Intermediate Wire + Scrap' },
  { col: 4, title: '5. Further Processing', sub: 'China Fine / Hard Draw' },
  { col: 5, title: '6. Drawn Wire Spools', sub: 'Fine / Hard Output Coils' },
  { col: 6, title: '7. Cable Batch Issue', sub: 'Finished Cable Linkage' },
];

export function TraceabilityAndCostingModule({
  mode,
  data,
  initialQuery,
  onSelectQuery,
}: TraceabilityAndCostingProps) {
  const { coils, batches, invoices, cableIssues } = data;

  const [queryInput, setQueryInput] = useState(initialQuery || '');
  const [graph, setGraph] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchGraph = async (qStr?: string) => {
    setLoading(true);
    try {
      const url = `/api/traceability?includeDemo=${data.includeDemo}${
        qStr ? `&q=${encodeURIComponent(qStr)}` : ''
      }`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) {
        setGraph(json.graph);
        if (!qStr && json.graph?.focalQuery) {
          setQueryInput(json.graph.focalQuery);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'TRACEABILITY') {
      fetchGraph(initialQuery);
    }
  }, [mode, initialQuery, data.includeDemo]);

  if (mode === 'TRACEABILITY') {
    const quickSamples = [
      ...(cableIssues.slice(0, 2).map((ci: any) => ({
        label: `Cable: ${ci.cable_batch_number}`,
        val: ci.cable_batch_number,
      })) || []),
      ...(batches.slice(0, 3).map((b: any) => ({
        label: `Batch: ${b.batch_number}`,
        val: b.batch_number,
      })) || []),
      ...(coils.slice(0, 3).map((c: any) => ({
        label: `Coil: ${c.coil_code}`,
        val: c.coil_code,
      })) || []),
      ...(invoices.slice(0, 1).map((i: any) => ({
        label: `Invoice: ${i.invoice_number}`,
        val: i.invoice_number,
      })) || []),
    ];

    return (
      <div className="space-y-6">
        {/* Search & Quick Lineage Selector Header */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-copper-100/80 border border-copper-300 text-copper-600">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Module 6: Multi-Stage Copper Traceability & Visual Genealogy Explorer
                </h2>
                <p className="text-xs text-slate-500">
                  Forward & backward traceability across Original Receipt → 8mm Rod Coils → RBD Batch → Output Bobbins → Further Processing → Finished Cable Batch.
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSelectQuery(queryInput);
                fetchGraph(queryInput);
              }}
              className="flex gap-2 w-full lg:w-96"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Enter Coil ID, Batch #, Invoice #, or Cable Batch..."
                  className="w-full rounded-lg bg-white border border-slate-300 pl-9 pr-3 py-2 text-xs font-mono text-slate-900 focus:border-copper-500 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-copper-600 hover:bg-copper-500 text-white text-xs font-bold shrink-0"
              >
                {loading ? 'Tracing...' : 'Trace Lineage'}
              </button>
            </form>
          </div>

          {/* Quick Jump Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-500 font-semibold mr-1">
              Quick Trace Examples:
            </span>
            {quickSamples.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQueryInput(s.val);
                  onSelectQuery(s.val);
                  fetchGraph(s.val);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-all ${
                  queryInput === s.val
                    ? 'bg-copper-100 border-copper-400 text-slate-900 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Visual 7-Stage Genealogy Pipeline Board */}
        {graph && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  End-to-End Material Genealogy Graph — Focal Target:{' '}
                  <span className="font-mono text-copper-700">{graph.focalQuery}</span> (
                  {graph.focalType})
                </h3>
                <p className="text-xs text-slate-500">
                  Click any node in the pipeline to pivot traceability around that specific invoice, coil, batch, or cable order.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {graph.nodes.length} Connected Lineage Nodes • {graph.edges.length} Material Transformations
              </span>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="grid grid-cols-7 gap-3 min-w-[1280px]">
                {STAGE_COLUMNS.map((colDef) => {
                  const colNodes = graph.nodes.filter(
                    (n: any) => n.stageColumn === colDef.col
                  );
                  return (
                    <div
                      key={colDef.col}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col min-h-[340px]"
                    >
                      <div className="border-b border-slate-200 pb-2 mb-3">
                        <div className="text-xs font-bold text-copper-700">
                          {colDef.title}
                        </div>
                        <div className="text-[10px] text-slate-500">{colDef.sub}</div>
                      </div>

                      <div className="space-y-2.5 flex-1">
                        {colNodes.length === 0 ? (
                          <div className="text-[11px] text-slate-600 italic py-8 text-center">
                            No stage records in this chain
                          </div>
                        ) : (
                          colNodes.map((node: any) => {
                            const incomingEdges = graph.edges.filter(
                              (e: any) => e.to === node.id
                            );
                            return (
                              <div
                                key={node.id}
                                onClick={() => {
                                  setQueryInput(node.title);
                                  onSelectQuery(node.title);
                                  fetchGraph(node.title);
                                }}
                                className={`cursor-pointer rounded-lg border p-2.5 transition-all text-xs space-y-1.5 ${
                                  node.isFocal
                                    ? 'border-copper-400 bg-copper-50 ring-1 ring-copper-400/50'
                                    : node.nodeType === 'SCRAP_LOT'
                                    ? 'border-amber-300 bg-amber-50/70 hover:border-amber-400'
                                    : node.nodeType === 'PRODUCTION_BATCH'
                                    ? 'border-sky-300 bg-sky-50 hover:border-sky-400'
                                    : node.nodeType === 'CABLE_ISSUE'
                                    ? 'border-purple-300 bg-purple-50 hover:border-purple-400'
                                    : 'border-slate-300 bg-white hover:border-slate-400'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-mono font-bold text-slate-900 break-all">
                                    {node.title}
                                  </span>
                                  {node.precisionBadge && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-100 text-copper-700 shrink-0">
                                      {node.precisionBadge}
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] text-slate-600 font-medium">
                                  {node.subtitle}
                                </div>

                                <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-slate-200">
                                  <span className="text-emerald-700 font-bold">
                                    {Number(node.weightKg).toLocaleString('en-IN', {
                                      maximumFractionDigits: 1,
                                    })}{' '}
                                    kg
                                  </span>
                                  <span className="text-copper-700">
                                    ₹{Number(node.rateOrCostPerKg).toFixed(2)}/kg
                                  </span>
                                </div>

                                {node.availableWeightKg !== undefined && (
                                  <div className="text-[10px] font-mono text-slate-500 flex justify-between">
                                    <span>Avail Now:</span>
                                    <span className="text-slate-900">
                                      {Number(node.availableWeightKg).toFixed(1)} kg
                                    </span>
                                  </div>
                                )}

                                {node.metadata?.supplierCoilNumber && (
                                  <div className="text-[10px] font-mono text-slate-500">
                                    Sup Coil: {node.metadata.supplierCoilNumber}
                                  </div>
                                )}

                                {node.metadata?.bobbinNumber && (
                                  <div className="text-[10px] font-mono text-slate-500">
                                    Bobbin: {node.metadata.bobbinNumber}
                                  </div>
                                )}

                                {incomingEdges.length > 0 && (
                                  <div className="pt-1 space-y-0.5">
                                    {incomingEdges.map((edge: any, eIdx: number) => (
                                      <div
                                        key={eIdx}
                                        className="text-[10px] font-mono text-sky-700 bg-slate-50 px-1.5 py-0.5 rounded flex items-center gap-1"
                                      >
                                        <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                                        <span className="truncate">{edge.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transitive Original Purchase Invoice Attribution Table */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Preserved Original 8mm Copper Purchase Attribution (Multi-Source & Multi-Stage)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    When multiple source rods are mixed in RBD or downstream drawing, all contributing original purchase invoices and their exact rates are preserved.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase">
                      <th className="py-2 pr-3">Original Purchase Invoice</th>
                      <th className="py-2 px-3">Supplier & Invoice Date</th>
                      <th className="py-2 px-3">Source 8mm Internal Coil ID</th>
                      <th className="py-2 px-3">Supplier Coil / Heat #</th>
                      <th className="py-2 px-3 text-right">Contribution Share %</th>
                      <th className="py-2 px-3 text-right">Attributed Weight (kg)</th>
                      <th className="py-2 px-3 text-right">Original Purchase Rate/kg</th>
                      <th className="py-2 pl-3">Allocation Precision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {graph.rootContributions.map((rc: any, i: number) => (
                      <tr key={i} className="hover:bg-white">
                        <td className="py-2 pr-3 font-mono font-bold text-copper-700">
                          {rc.invoiceNumber}
                        </td>
                        <td className="py-2 px-3">
                          <div className="text-slate-900 font-semibold">{rc.supplierName}</div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {rc.invoiceDate} • {rc.companyName}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-sky-700">
                          {rc.rootCoilCode}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {rc.supplierCoilNumber || '-'} / {rc.supplierLotHeatNumber || '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {Number(rc.contributionPct).toFixed(2)}%
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700">
                          {Number(rc.attributedWeightKg).toFixed(2)} kg
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-copper-700">
                          ₹{Number(rc.originalRatePerKg).toFixed(2)}/kg
                        </td>
                        <td className="py-2 pl-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              rc.allocationPrecision === 'EXACT'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-sky-100 text-sky-700'
                            }`}
                          >
                            {rc.allocationPrecision} (Stage Depth: {rc.stageDepth})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // MODE === 'COSTING' (Module 8: Copper Costing Engine)
  const postedBatches = batches.filter((b: any) => b.status === 'POSTED');

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-700">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Module 8: Copper Costing Engine — Source Rate Preservation, Scrap Credit & Yield Costing
              </h2>
              <p className="text-xs text-slate-500">
                Tracks original input copper value, mixed-batch weighted averages, separate stage processing costs, scrap recovery credits, and usable output cost/kg.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 flex items-center gap-2 max-w-md">
            <Info className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Costing Scope Note:</strong> Reflects actual copper & drawing conversion cost. Full cable ROI will additionally incorporate insulation polymers, armor, labor, energy & selling price.
            </span>
          </div>
        </div>

        {/* Costing Formula Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono bg-white p-4 rounded-xl border border-slate-200">
          <div>
            <div className="text-[10px] uppercase text-slate-500">1. Input Copper Cost</div>
            <div className="text-slate-900 font-bold mt-0.5">
              Σ (Consumed kg × Source Cost/kg)
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">2. + Stage Conversion Cost</div>
            <div className="text-sky-700 font-bold mt-0.5">
              + (Input kg × Stage Processing Rate/kg)
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">3. − Scrap Recovery Credit</div>
            <div className="text-emerald-700 font-bold mt-0.5">
              − (Recoverable Scrap kg × Recovery Rate)
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500">4. = Usable Output Cost/kg</div>
            <div className="text-copper-700 font-bold mt-0.5">
              Net Batch Cost ÷ Usable Output kg
            </div>
          </div>
        </div>

        {/* Batch-wise Costing Breakdown Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase">
                <th className="py-2.5 pr-2">Batch No</th>
                <th className="py-2.5 px-2">Process & Route</th>
                <th className="py-2.5 px-2 text-right">Input / Usable Out</th>
                <th className="py-2.5 px-2 text-right">Blended Orig Rate</th>
                <th className="py-2.5 px-2 text-right">Input Copper Value</th>
                <th className="py-2.5 px-2 text-right">+ Processing Cost</th>
                <th className="py-2.5 px-2 text-right">− Scrap Credit</th>
                <th className="py-2.5 px-2 text-right">= Net Batch Cost</th>
                <th className="py-2.5 px-2 text-right">Usable Output Cost/kg</th>
                <th className="py-2.5 pl-2 text-right">Actual vs Std Wastage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {postedBatches.map((b: any) => {
                const actualWastage = Number(b.actual_wastage_pct);
                const stdWastage = Number(b.standard_wastage_pct);
                const excessWastage = actualWastage - stdWastage;

                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-2 font-mono font-bold text-copper-700">
                      {b.batch_number}
                      {b.is_mixed_source && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[9px] rounded bg-sky-100 text-sky-700">
                          MIXED RATES
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <div className="font-semibold text-slate-900">{b.process_code}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {Number(b.input_mm).toFixed(2)} → {Number(b.output_mm).toFixed(2)} mm
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right font-mono">
                      <div className="text-slate-600">
                        In: {Number(b.total_input_weight_kg).toFixed(1)} kg
                      </div>
                      <div className="text-emerald-700 font-bold">
                        Out: {Number(b.total_usable_output_kg).toFixed(1)} kg
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-slate-900 font-bold">
                      ₹{Number(b.weighted_avg_input_rate_per_kg).toFixed(2)}/kg
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-slate-700">
                      ₹{Number(b.input_copper_cost_total).toLocaleString('en-IN', {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-sky-700">
                      +₹{Number(b.processing_cost_total).toLocaleString('en-IN', {
                        maximumFractionDigits: 0,
                      })}
                      <div className="text-[10px] text-slate-500">
                        (@ ₹{Number(b.processing_cost_per_kg).toFixed(1)}/kg)
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-emerald-700">
                      -₹{Number(b.scrap_recovery_credit_total).toLocaleString('en-IN', {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-3 px-2 text-right font-mono font-bold text-slate-900">
                      ₹{Number(b.net_batch_cost_total).toLocaleString('en-IN', {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-3 px-2 text-right font-mono font-bold text-copper-700 text-sm">
                      ₹{Number(b.usable_output_cost_per_kg).toFixed(2)}/kg
                    </td>
                    <td className="py-3 pl-2 text-right font-mono">
                      <div
                        className={`font-bold ${
                          excessWastage > 0.15 ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {actualWastage.toFixed(2)}% vs {stdWastage.toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Yield: {Number(b.yield_pct).toFixed(2)}%
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Finished Cable Batch Cost Attribution Summary */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-copper-600" />
          Finished Cable Batch Copper Cost Attribution ({cableIssues.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase">
                <th className="py-2 pr-3">Cable Batch No</th>
                <th className="py-2 px-3">Product & Category</th>
                <th className="py-2 px-3">Company</th>
                <th className="py-2 px-3">Issuance Method & Precision</th>
                <th className="py-2 px-3 text-right">Copper Consumed (kg)</th>
                <th className="py-2 px-3 text-right">Attributed Copper Rate/kg</th>
                <th className="py-2 pl-3 text-right">Total Copper Material Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cableIssues.map((ci: any) => (
                <tr key={ci.id}>
                  <td className="py-2.5 pr-3 font-mono font-bold text-copper-700">
                    {ci.cable_batch_number}
                  </td>
                  <td className="py-2.5 px-3 text-slate-900">
                    {ci.cable_product_description}
                    <div className="text-[10px] text-slate-500">{ci.cable_category_name}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">{ci.owner_company_name}</td>
                  <td className="py-2.5 px-3 font-mono">
                    <span className="text-sky-700">{ci.issue_mode}</span> •{' '}
                    <span className="text-amber-800">{ci.traceability_precision}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                    {Number(ci.total_issued_weight_kg).toFixed(2)} kg
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-copper-700 font-bold">
                    ₹{Number(ci.weighted_avg_copper_cost_per_kg).toFixed(2)}/kg
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono font-bold text-emerald-700">
                    ₹{Number(ci.total_attributed_copper_cost).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
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

