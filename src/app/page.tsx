'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Boxes,
  Cable,
  Cog,
  Coins,
  FileSpreadsheet,
  Flame,
  GitBranch,
  LayoutDashboard,
  RefreshCw,
  Settings,
  ShieldAlert,
  Truck,
  Wrench,
} from 'lucide-react';
import { DashboardModule } from '@/components/DashboardModule';
import { InwardModule } from '@/components/InwardModule';
import { ProductionModule } from '@/components/ProductionModule';
import { InventoryAndIssuesModule } from '@/components/InventoryAndIssuesModule';
import { TraceabilityAndCostingModule } from '@/components/TraceabilityAndCostingModule';
import { ReportsMastersSettingsModule } from '@/components/ReportsMastersSettingsModule';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'inward', label: 'Copper Inward', icon: Truck },
  { id: 'rbd', label: 'RBD Production', icon: Flame },
  { id: 'further_processing', label: 'Further Processing', icon: Cog },
  { id: 'inventory', label: 'Copper Inventory', icon: Boxes },
  { id: 'material_issues', label: 'Material Issues', icon: Cable },
  { id: 'traceability', label: 'Traceability', icon: GitBranch },
  { id: 'costing', label: 'Costing', icon: Coins },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { id: 'masters', label: 'Masters', icon: Wrench },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function CopperControlTowerApp() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [traceContext, setTraceContext] = useState<string>('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async (overrideIncludeDemo?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        overrideIncludeDemo !== undefined ? `?includeDemo=${overrideIncludeDemo}` : '';
      const res = await fetch(`/api/overview${qs}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to load Copper Control Tower data');
      }
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleNavigate = (tab: string, contextCoilOrBatch?: string) => {
    if (contextCoilOrBatch) {
      setTraceContext(contextCoilOrBatch);
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 text-slate-900">
      {/* Industrial Left Navigation Sidebar (Light Mode) */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0 shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-copper-500 to-copper-700 flex items-center justify-center shadow-sm font-mono font-black text-white text-sm">
              Cu
            </div>
            <div>
              <div className="text-sm font-black tracking-tight text-slate-900">
                COPPER CONTROL
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-copper-700 font-semibold">
                RBD & Traceability Tower
              </div>
            </div>
          </div>
        </div>

        {/* Multi-Company Indicator Pill */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
          <div className="font-semibold text-slate-700 mb-1">Active Legal Entities:</div>
          <div className="flex flex-wrap gap-1">
            <span className="px-1.5 py-0.5 rounded bg-copper-50 border border-copper-200 text-copper-800 font-mono text-[10px] font-semibold">
              Atlanta Tele
            </span>
            <span className="px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800 font-mono text-[10px] font-semibold">
              Notofire
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-semibold">
              Valuecon
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-2.5 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible flex-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-copper-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom System Status Footer */}
        <div className="hidden lg:block p-4 border-t border-slate-200 text-[11px] text-slate-500 space-y-1.5 bg-slate-50/60">
          <div className="flex items-center gap-2 text-emerald-700 font-mono font-semibold">
            <Activity className="w-3.5 h-3.5" />
            <span>PostgreSQL Ledger Active</span>
          </div>
          <div>Decimal-Safe (`NUMERIC(14,4)`)</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Industrial Telemetry Bar */}
        <header className="bg-white/95 border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20 backdrop-blur shadow-sm">
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Copper Control Tower'}
            </h1>
            <p className="text-xs text-slate-500">
              End-to-end kilogram & purchase-rate traceability from 8 mm copper rod through RBD, China Fine & Finished Cable batches
            </p>
          </div>

          <div className="flex items-center gap-3">
            {data && (
              <button
                onClick={async () => {
                  await fetch('/api/masters', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'UPDATE_SETTING',
                      key: 'SHOW_DEMO_DATA',
                      value: data.includeDemo ? 'false' : 'true',
                    }),
                  });
                  await fetchOverview(!data.includeDemo);
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all ${
                  data.includeDemo
                    ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                {data.includeDemo ? 'MODE: DEMO + LIVE' : 'MODE: LIVE ONLY'}
              </button>
            )}

            <button
              onClick={() => fetchOverview()}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700"
              title="Refresh Live Ledger"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-copper-600' : ''}`} />
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="p-6 flex-1 overflow-y-auto">
          {error && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800 flex items-center gap-2 mb-6">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!data ? (
            <div className="py-24 text-center space-y-2">
              <div className="inline-block w-8 h-8 border-2 border-copper-600 border-t-transparent rounded-full animate-spin" />
              <div className="text-sm text-slate-600 font-mono">
                Loading Copper Control Tower Ledger & Operations...
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardModule data={data} onNavigate={handleNavigate} />
              )}
              {activeTab === 'inward' && (
                <InwardModule
                  data={data}
                  onRefresh={() => fetchOverview()}
                  onNavigateTraceability={(code) => handleNavigate('traceability', code)}
                />
              )}
              {activeTab === 'rbd' && (
                <ProductionModule
                  mode="RBD"
                  data={data}
                  onRefresh={() => fetchOverview()}
                  onNavigateTraceability={(code) => handleNavigate('traceability', code)}
                />
              )}
              {activeTab === 'further_processing' && (
                <ProductionModule
                  mode="DOWNSTREAM"
                  data={data}
                  onRefresh={() => fetchOverview()}
                  onNavigateTraceability={(code) => handleNavigate('traceability', code)}
                />
              )}
              {activeTab === 'inventory' && (
                <InventoryAndIssuesModule
                  mode="INVENTORY"
                  data={data}
                  onRefresh={() => fetchOverview()}
                  onNavigateTraceability={(code) => handleNavigate('traceability', code)}
                />
              )}
              {activeTab === 'material_issues' && (
                <InventoryAndIssuesModule
                  mode="ISSUES"
                  data={data}
                  onRefresh={() => fetchOverview()}
                  onNavigateTraceability={(code) => handleNavigate('traceability', code)}
                />
              )}
              {activeTab === 'traceability' && (
                <TraceabilityAndCostingModule
                  mode="TRACEABILITY"
                  data={data}
                  initialQuery={traceContext}
                  onSelectQuery={(q) => setTraceContext(q)}
                />
              )}
              {activeTab === 'costing' && (
                <TraceabilityAndCostingModule
                  mode="COSTING"
                  data={data}
                  onSelectQuery={(q) => handleNavigate('traceability', q)}
                />
              )}
              {activeTab === 'reports' && (
                <ReportsMastersSettingsModule
                  mode="REPORTS"
                  data={data}
                  onRefresh={() => fetchOverview()}
                />
              )}
              {activeTab === 'masters' && (
                <ReportsMastersSettingsModule
                  mode="MASTERS"
                  data={data}
                  onRefresh={() => fetchOverview()}
                />
              )}
              {activeTab === 'settings' && (
                <ReportsMastersSettingsModule
                  mode="SETTINGS"
                  data={data}
                  onRefresh={() => fetchOverview()}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
