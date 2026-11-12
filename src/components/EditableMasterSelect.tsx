'use client';

import React, { useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';

export interface MasterOptionItem {
  id: number;
  label: string;
}

interface EditableMasterSelectProps {
  label: string;
  required?: boolean;
  entityType: 'COMPANY' | 'SUPPLIER' | 'LOCATION' | 'DIAMETER' | 'MATERIAL_CATEGORY' | 'MACHINE';
  addAction:
    | 'ADD_COMPANY'
    | 'ADD_SUPPLIER'
    | 'ADD_LOCATION'
    | 'ADD_DIAMETER'
    | 'ADD_MATERIAL_CATEGORY'
    | 'ADD_MACHINE';
  value: number;
  options: MasterOptionItem[];
  onChange: (newId: number) => void;
  onRefresh: () => Promise<void>;
  placeholderPrimary?: string;
  placeholderSecondary?: string;
  isNumericPrimary?: boolean;
  className?: string;
}

export function EditableMasterSelect({
  label,
  required = false,
  entityType,
  addAction,
  value,
  options,
  onChange,
  onRefresh,
  placeholderPrimary = 'Enter new name...',
  placeholderSecondary,
  isNumericPrimary = false,
  className = '',
}: EditableMasterSelectProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [primaryInput, setPrimaryInput] = useState('');
  const [secondaryInput, setSecondaryInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__OTHER_ADD_NEW__') {
      setIsAdding(true);
      setIsManaging(false);
      setInlineError(null);
      return;
    }
    onChange(Number(val));
  };

  const handleAddConfirm = async () => {
    const trimmed = primaryInput.trim();
    if (!trimmed) {
      setInlineError('Please enter a value.');
      return;
    }

    setBusy(true);
    setInlineError(null);
    try {
      const payload: Record<string, any> = { action: addAction };
      if (addAction === 'ADD_DIAMETER') {
        payload.diameterMm = Number(trimmed);
        payload.label =
          secondaryInput.trim() || `${Number(trimmed).toFixed(2)} mm Wire / Rod`;
      } else if (addAction === 'ADD_SUPPLIER') {
        payload.name = trimmed;
        payload.city = secondaryInput.trim() || 'India';
      } else if (addAction === 'ADD_LOCATION') {
        payload.name = trimmed;
        payload.code = secondaryInput.trim() || undefined;
      } else if (addAction === 'ADD_COMPANY') {
        payload.name = trimmed;
        payload.code = secondaryInput.trim() || undefined;
      } else if (addAction === 'ADD_MATERIAL_CATEGORY') {
        payload.name = trimmed;
        payload.gradeSpec = secondaryInput.trim() || trimmed;
      }

      const res = await fetch('/api/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to add option');
      }

      setPrimaryInput('');
      setSecondaryInput('');
      setIsAdding(false);
      await onRefresh();
      if (json.createdId) {
        onChange(Number(json.createdId));
      }
    } catch (err: any) {
      setInlineError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveItem = async (idToRemove: number) => {
    if (!idToRemove) return;
    setBusy(true);
    setInlineError(null);
    try {
      const res = await fetch('/api/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REMOVE_MASTER_ITEM',
          entityType,
          id: idToRemove,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to remove option');
      }

      const remaining = options.filter((o) => o.id !== idToRemove);
      await onRefresh();
      if (value === idToRemove && remaining.length > 0) {
        onChange(remaining[0].id);
      }
    } catch (err: any) {
      setInlineError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      {/* Single-line aligned label + icon-only controls */}
      <div className="h-5 mb-1.5 flex items-center justify-between gap-1">
        <label
          title={`${label}${required ? ' *' : ''}`}
          className="text-xs font-semibold text-slate-600 truncate"
        >
          {label} {required && '*'}
        </label>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsAdding((prev) => !prev);
              setIsManaging(false);
              setInlineError(null);
            }}
            title={`Add new ${label}`}
            className={`p-1 rounded transition-colors ${
              isAdding
                ? 'bg-copper-100 text-copper-700'
                : 'text-copper-600 hover:bg-copper-50 hover:text-copper-700'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsManaging((prev) => !prev);
              setIsAdding(false);
              setInlineError(null);
            }}
            title={`Remove options from ${label}`}
            className={`p-1 rounded transition-colors ${
              isManaging
                ? 'bg-rose-100 text-rose-600'
                : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <select
        value={options.some((o) => o.id === Number(value)) ? value : options[0]?.id || ''}
        onChange={handleSelectChange}
        disabled={busy}
        className={`w-full h-[38px] rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-copper-500 outline-none ${className}`}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
        <option value="__OTHER_ADD_NEW__" className="font-bold text-copper-700">
          + Other (Add New...)
        </option>
      </select>

      {/* Floating Add Popover (never distorts grid row alignment) */}
      {isAdding && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 min-w-[230px] rounded-xl border border-copper-300 bg-white p-3 space-y-2 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-copper-800 uppercase truncate">
              New {label.replace(/\*/g, '').trim()}
            </span>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            <input
              type={isNumericPrimary ? 'number' : 'text'}
              step={isNumericPrimary ? '0.001' : undefined}
              placeholder={placeholderPrimary}
              value={primaryInput}
              onChange={(e) => setPrimaryInput(e.target.value)}
              className="w-full rounded-lg bg-slate-50 border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:bg-white focus:border-copper-500 outline-none"
            />
            {placeholderSecondary && (
              <input
                type="text"
                placeholder={placeholderSecondary}
                value={secondaryInput}
                onChange={(e) => setSecondaryInput(e.target.value)}
                className="w-full rounded-lg bg-slate-50 border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:bg-white focus:border-copper-500 outline-none"
              />
            )}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={handleAddConfirm}
                title="Save"
                className="p-1.5 rounded-lg bg-copper-600 hover:bg-copper-500 disabled:opacity-50 text-white shadow-sm"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
          {inlineError && <div className="text-[11px] text-rose-600">{inlineError}</div>}
        </div>
      )}

      {/* Floating Remove Popover (icon-only delete buttons, never distorts grid row alignment) */}
      {isManaging && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 min-w-[230px] rounded-xl border border-slate-300 bg-white p-2.5 space-y-1.5 shadow-xl">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-slate-700 uppercase truncate">
              {label.replace(/\*/g, '').trim()} ({options.length})
            </span>
            <button
              type="button"
              onClick={() => setIsManaging(false)}
              className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50">
            {options.map((opt) => (
              <div
                key={opt.id}
                className="flex items-center justify-between px-2.5 py-1.5 text-xs hover:bg-white"
              >
                <span className="truncate pr-2 text-slate-800" title={opt.label}>
                  {opt.label}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRemoveItem(opt.id)}
                  title="Delete option"
                  className="p-1 rounded text-rose-600 hover:bg-rose-100 shrink-0 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {inlineError && <div className="text-[11px] text-rose-600">{inlineError}</div>}
        </div>
      )}
    </div>
  );
}
