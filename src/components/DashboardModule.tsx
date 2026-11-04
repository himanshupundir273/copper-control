'use client';

import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Coins,
  Factory,
  Flame,
  GitBranch,
  Layers,
  Recycle,
  Scale,
  ShieldAlert,
} from 'lucide-react';

interface DashboardProps {
  data: any;
  onNavigate: (tab: string, contextCoilOrBatch?: string) => void;
}

export function DashboardModule({ data, onNavigate }: DashboardProps) {
  const { dashboard } = data;
  const s = dashboard.summary;

  const fmtKg = (val: string | number) =>
    `${Number(val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} kg`;

  const fmtInr = (val: string | number) =>
    `₹${Number(val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const kpiCards = [
    {
      title: 'Total Available Copper Stock',
      value: fmtKg(s.total_available_kg),
      sub: `${s.active_coils_count} active coils/bobbins (${fmtKg(s.total_reserved_kg)} reserved)`,
      icon: Scale,
      accent: 'border-copper-300 bg-copper-50/70',
      iconColor: 'text-copper-600',
    },
    {
      title: 'Copper Inventory Value',
      value: fmtInr(s.total_inventory_value),
      sub: 'Valued at preserved source + stage cost/kg',
      icon: Coins,
      accent: 'border-emerald-300 bg-emerald-50/70',
      iconColor: 'text-emerald-700',
    },
    {
      title: 'Recent RBD Production',
      value: fmtKg(s.today_rbd_output_kg),
      sub: `Cumulative RBD Drawn: ${fmtKg(s.rbd_output_kg)}`,
      icon: Flame,
      accent: 'border-sky-300 bg-sky-50/70',
      iconColor: 'text-sky-600',
    },
    {
      title: 'Production Yield %',
      value: `${s.overall_yield_pct}%`,
      sub: `Output ${fmtKg(s.total_usable_output_kg)} / Input ${fmtKg(s.total_input_kg)}`,
      icon: CheckCircle2,
      accent: 'border-indigo-300 bg-indigo-50/70',
      iconColor: 'text-indigo-600',
    },
    {
      title: 'Scrap & Recoverable Stock',
      value: fmtKg(s.in_stock_scrap_kg),
      sub: `Recovery Value: ${fmtInr(s.in_stock_scrap_value)}`,
      icon: Recycle,
      accent: 'border-amber-300 bg-amber-50/70',
      iconColor: 'text-amber-700',
    },
    {
      title: 'Awaiting Further Processing',
      value: fmtKg(s.awaiting_further_processing_kg),
      sub: '8mm Rod + RBD WIP ready for drawing',
      icon: Layers,
      accent: 'border-purple-300 bg-purple-50/70',
      iconColor: 'text-purple-600',
    },
    {
      title: 'Unreconciled Batches',
      value: `${s.unreconciled_batches_count} Batches`,
      sub: `Unexplained variance: ${fmtKg(s.total_unexplained_kg)}`,
      icon: AlertTriangle,
      accent:
        Number(s.unreconciled_batches_count) > 0
          ? 'border-rose-300 bg-rose-50'
          : 'border-slate-300 bg-white',
      iconColor:
        Number(s.unreconciled_batches_count) > 0 ? 'text-rose-600' : 'text-slate-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {kpiCards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={i}
              className={`rounded-xl border p-4 shadow-sm transition-all ${c.accent}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {c.title}
                </span>
                <Icon className={`w-4 h-4 ${c.iconColor}`} />
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                {c.value}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 leading-snug">{c.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Unreconciled Batches Alert Banner */}
      {dashboard.unreconciledBatches.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-rose-800">
                  Material Reconciliation Exceptions — Unexplained Weight Variance Detected
                </h3>
                <p className="text-xs text-rose-700">
                  Per plant accounting rules, unexplained differences are never auto-classified as scrap or process loss.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('rbd')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 flex items-center gap-1.5 self-start"
            >
              Inspect Production Register <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-rose-300 text-rose-700 uppercase">
                  <th className="py-2 pr-3">Batch No</th>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Machine</th>
                  <th className="py-2 px-3">Owner Company</th>
                  <th className="py-2 px-3 text-right">Input Weight</th>
                  <th className="py-2 px-3 text-right">Usable Output</th>
                  <th className="py-2 px-3 text-right">Unexplained Diff</th>
                  <th className="py-2 pl-3">Operator / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-200">
                {dashboard.unreconciledBatches.map((b: any) => (
                  <tr key={b.id} className="hover:bg-rose-100/50">
                    <td className="py-2 pr-3 font-mono font-bold text-rose-800">
                      <button
                        onClick={() => onNavigate('traceability', b.batch_number)}
                        className="underline decoration-dotted hover:text-slate-900"
                      >
                        {b.batch_number}
                      </button>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600">{b.production_date}</td>
                    <td className="py-2 px-3 font-mono text-slate-600">{b.machine_code}</td>
                    <td className="py-2 px-3 text-slate-700">{b.company_name}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmtKg(b.total_input_weight_kg)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmtKg(b.total_usable_output_kg)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-rose-600">
                      {fmtKg(b.unexplained_diff_kg)}
                    </td>
                    <td className="py-2 pl-3 text-slate-600">
                      {b.operator_name} — <span className="text-slate-500">{b.remarks}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Three-Column Breakdown: By Company, By Diameter, By Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Stock by Legal Company */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Factory className="w-4 h-4 text-copper-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Stock by Legal Company
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">Ownership Separated</span>
          </div>
          <div className="space-y-3">
            {dashboard.byCompany.map((comp: any) => (
              <div
                key={comp.company_id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3.5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{comp.company_name}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      Code: {comp.company_code} • {comp.coil_count} Active Coils
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono text-copper-700">
                      {fmtKg(comp.available_kg)}
                    </div>
                    <div className="text-xs font-mono text-emerald-700">
                      {fmtInr(comp.inventory_value)}
                    </div>
                  </div>
                </div>
                {Number(comp.reserved_kg) > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between text-xs text-amber-800 font-mono">
                    <span>Reserved for Production/Cable:</span>
                    <span>{fmtKg(comp.reserved_kg)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 2. Stock by Copper Diameter */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Stock by Copper Diameter
              </h3>
            </div>
            <button
              onClick={() => onNavigate('masters')}
              className="text-xs text-copper-600 hover:underline"
            >
              Configure Sizes
            </button>
          </div>
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {dashboard.byDiameter.map((d: any) => {
              const avail = Number(d.available_kg);
              return (
                <div
                  key={d.diameter_id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono text-slate-900">
                        {Number(d.diameter_mm).toFixed(2)} mm
                      </span>
                      {d.verification_status === 'PENDING_CONFIRMATION' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                          Pending Verify
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">{d.label}</div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-sm font-mono font-bold ${
                        avail > 0 ? 'text-sky-700' : 'text-slate-500'
                      }`}
                    >
                      {fmtKg(d.available_kg)}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {d.coil_count} coils
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Stock by Processing Stage */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Stock by Processing Stage
              </h3>
            </div>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-xs text-copper-600 hover:underline"
            >
              Full Stock →
            </button>
          </div>
          <div className="space-y-3">
            {dashboard.byStage.map((st: any) => (
              <div
                key={st.processing_stage}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3.5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-copper-700">
                      {st.processing_stage.replace(/_/g, ' ')}
                    </span>
                    <div className="text-xs text-slate-500 mt-1">
                      {st.coil_count} active coils/spools
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono text-slate-900">
                      {fmtKg(st.available_kg)}
                    </div>
                    <div className="text-xs font-mono text-emerald-700">
                      {fmtInr(st.inventory_value)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Immutable Inventory Movement Ledger Live Feed */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Live Immutable Inventory Movement Ledger (Source of Truth)
            </h3>
            <p className="text-xs text-slate-500">
              Every receipt, production consumption, output bobbin, scrap lot, intercompany transfer, and cable issue is recorded atomically.
            </p>
          </div>
          <button
            onClick={() => onNavigate('inventory')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-copper-700 border border-slate-300 self-start"
          >
            Explore All Movements →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase">
                <th className="py-2.5 pr-3">ID / Date</th>
                <th className="py-2.5 px-3">Movement Type</th>
                <th className="py-2.5 px-3">Coil ID</th>
                <th className="py-2.5 px-3">Legal Owner</th>
                <th className="py-2.5 px-3 text-right">Weight Delta</th>
                <th className="py-2.5 px-3 text-right">Balance After</th>
                <th className="py-2.5 px-3 text-right">Rate / Cost per kg</th>
                <th className="py-2.5 pl-3">Reference & Audit Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {dashboard.recentMovements.map((m: any) => {
                const delta = Number(m.weight_delta_kg);
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3 font-mono text-slate-500">
                      #{m.id} • {m.movement_date}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          m.movement_type === 'INWARD_RECEIPT'
                            ? 'bg-emerald-100 text-emerald-700'
                            : m.movement_type === 'PRODUCTION_OUTPUT'
                            ? 'bg-sky-100 text-sky-700'
                            : m.movement_type === 'PRODUCTION_CONSUMPTION'
                            ? 'bg-amber-100 text-amber-800'
                            : m.movement_type === 'INTERCOMPANY_OWNERSHIP_TRANSFER'
                            ? 'bg-purple-100 text-purple-700'
                            : m.movement_type === 'CABLE_PRODUCTION_ISSUE'
                            ? 'bg-copper-100/80 text-copper-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {m.movement_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      {m.coil_code ? (
                        <button
                          onClick={() => onNavigate('traceability', m.coil_code)}
                          className="text-copper-700 hover:underline"
                        >
                          {m.coil_code}
                        </button>
                      ) : (
                        <span className="text-slate-500">SCRAP LOT</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{m.company_name}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-bold ${
                        delta > 0
                          ? 'text-emerald-700'
                          : delta < 0
                          ? 'text-rose-600'
                          : 'text-purple-700'
                      }`}
                    >
                      {delta > 0 ? `+${fmtKg(delta)}` : fmtKg(delta)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {fmtKg(m.balance_after_kg)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {fmtInr(m.unit_rate_per_kg)}
                    </td>
                    <td className="py-2.5 pl-3 text-slate-600">
                      <span className="font-mono text-copper-700 mr-2">{m.reference_number}</span>
                      <span className="text-slate-500">{m.notes}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

