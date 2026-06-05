'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { useShipmentAutorun } from '@/hooks/useShipmentAutorun';
import AiBriefPanel from '@/components/AiBriefPanel';
import {
  AdvancedToggle,
  ChoicePills,
  FormField,
  FormShell,
  FormSubmit,
  LOGIFLOW_FORM_IDS,
  formInputClass,
  formLabelClass,
} from '@/components/forms/pipeline-form-ui';
import { WATER_PORTS, WATER_PORT_REGION_COUNT, type WaterPortOption } from '@/lib/water-ports';

function useCitySearch(setGlobalSuggestions: (rows: { code: string; name: string }[]) => void) {
  const [results, setResults] = useState<WaterPortOption[]>(WATER_PORTS);
  const loading = false;

  const search = useCallback((query: string) => {
    if (!query) {
      setResults(WATER_PORTS);
      setGlobalSuggestions([]);
      return;
    }
    const normalized = query.toLowerCase();
    const filtered = WATER_PORTS.filter((p) =>
      `${p.name} ${p.region}`.toLowerCase().includes(normalized)
    );
    setResults(filtered);
    setGlobalSuggestions(filtered.map((r) => ({ code: r.id.toUpperCase(), name: r.name })));
  }, [setGlobalSuggestions]);

  const clear = useCallback(() => {
    setResults(WATER_PORTS);
    setGlobalSuggestions([]);
  }, [setGlobalSuggestions]);

  return { results, loading, search, clear };
}

// ── Constants ─────────────────────────────────────────────────────────

const CARGO_TYPES = [
  { value: 'General', icon: 'inventory_2', desc: 'Standard goods' },
  { value: 'Fragile', icon: 'local_shipping', desc: 'Handle with care' },
  { value: 'Perishable', icon: 'ac_unit', desc: 'Cold chain' },
];

const PRIORITY_OPTIONS = [
  {
    value: 'cost',
    label: 'Cheapest',
    icon: 'savings',
    activeClass: 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300',
    iconColor: 'text-emerald-400',
  },
  {
    value: 'time',
    label: 'Fastest',
    icon: 'bolt',
    activeClass: 'bg-amber-500/10 border-amber-500/35 text-amber-300',
    iconColor: 'text-amber-400',
  },
  {
    value: 'safe',
    label: 'Safest',
    icon: 'verified_user',
    activeClass: 'bg-blue-500/10 border-blue-500/35 text-blue-300',
    iconColor: 'text-blue-400',
  },
];

// ── Location Autocomplete Input ───────────────────────────────────────

function LocationInput({
  label,
  value,
  onChange,
  icon,
  iconColor,
  placeholder,
  hasError,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  icon: string;
  iconColor: string;
  placeholder: string;
  hasError?: boolean;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const setStationSuggestions = useLogiFlowStore((s) => s.setStationSuggestions);
  const { results, loading, search, clear } = useCitySearch(setStationSuggestions);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (val: string) => {
    onChange(val);
    search(val);
    setShowDropdown(true);
  };

  const selectLocation = (location: WaterPortOption) => {
    onChange(location.name);
    clear();
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative z-[50]">
      <span className={`mb-1.5 block ${formLabelClass}`}>
        {label}
        {loading && <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-live" />}
      </span>

      <div className="relative">
        <div className="relative flex items-center">
          <span
            className={`pointer-events-none absolute left-3 material-symbols-outlined ${iconColor}`}
            style={{ fontSize: '18px' }}
          >
            {icon}
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
              if (results.length) setShowDropdown(true);
            }}
            className={`${formInputClass} pl-10 pr-9 ${hasError ? 'border-risk/50' : ''}`}
            placeholder={placeholder}
          />
          {value && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange('');
                clear();
                setShowDropdown(false);
              }}
              className="absolute right-2 rounded-md p-1 text-muted-foreground hover:bg-surface/80 hover:text-foreground"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          )}
        </div>
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-[99999] top-full left-0 right-0 mt-1.5 overflow-hidden rounded-xl border border-border bg-surface/95 p-1 shadow-2xl backdrop-blur-xl animate-slide-up origin-top">
          <div className="max-h-[240px] overflow-y-auto p-1.5">
            {results.map((s, i) => (
              <button
                key={`${s.name}-${i}`}
                type="button"
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container/80 transition-all duration-150 text-left group"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectLocation(s);
                }}
              >
                <div className="w-8 h-8 rounded-full bg-surface-container/60 border border-outline-variant/10 flex items-center justify-center shrink-0 group-hover:bg-teal-500/15 group-hover:border-teal-400/25 transition-all">
                  <span
                    className="material-symbols-outlined text-outline group-hover:text-teal-400 transition-colors"
                    style={{ fontSize: '15px', fontVariationSettings: "'FILL' 1" }}
                  >
                    directions_boat
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-on-surface truncate">{s.name}</div>
                  <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-outline">
                    {s.region}
                  </div>
                </div>
                <span
                  className="material-symbols-outlined text-outline/0 group-hover:text-teal-400/60 transition-all -translate-x-1 group-hover:translate-x-0"
                  style={{ fontSize: '14px' }}
                >
                  subdirectory_arrow_left
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Form ─────────────────────────────────────────────────────────

export default function WaterInputForm() {
  const {
    source, setSource,
    destination, setDestination,
    priority, setPriority,
    cargoWeight, setCargoWeight,
    cargoType, setCargoType,
    budgetMax, setBudgetMax,
    handleOptimize,
    loading,
  } = useLogiFlowStore();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxTransshipments, setMaxTransshipments] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const runWaterOptimize = useCallback(() => {
    if (!source.trim() || !destination.trim()) return;
    handleOptimize({ mode: 'water', water: { max_transshipments: maxTransshipments } });
  }, [source, destination, handleOptimize, maxTransshipments]);

  useShipmentAutorun(
    'water',
    runWaterOptimize,
    Boolean(source.trim() && destination.trim())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.trim() || !destination.trim()) {
      setError('Source and destination are required');
      return;
    }
    if (source.trim().toLowerCase() === destination.trim().toLowerCase()) {
      setError('Source and destination cannot be the same');
      return;
    }
    if (cargoWeight <= 0) {
      setError('Cargo weight must be greater than 0');
      return;
    }
    setError(null);
    runWaterOptimize();
  };

  return (
    <div className="w-full space-y-4">
      <AiBriefPanel contextMode="water" />
      <FormShell
        mode="water"
        title="Maritime route search"
        subtitle={`${WATER_PORTS.length} ports · ${WATER_PORT_REGION_COUNT} regions · transshipment-aware`}
        advancedToggle={
          <AdvancedToggle
            open={showAdvanced}
            onToggle={() => setShowAdvanced((v) => !v)}
            accentVar="--water"
          />
        }
        footer={
          <FormSubmit
            formId={LOGIFLOW_FORM_IDS.water}
            loading={loading}
            disabled={!source.trim() || !destination.trim() || cargoWeight <= 0}
            label="Find maritime routes"
            loadingLabel="Charting routes…"
            accentVar="--water"
            icon="directions_boat"
          />
        }
      >
        <form id={LOGIFLOW_FORM_IDS.water} onSubmit={handleSubmit} className="space-y-5">
            {/* Origin / Destination */}
            <div
              className={`relative z-[100] transition-all duration-600 ${
                'opacity-100 translate-y-0'
              }`}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                <div className="hidden md:flex absolute bottom-[18px] left-1/2 -translate-x-1/2 translate-y-1/2 z-10 items-center justify-center">
                  <button
                    type="button"
                    disabled={!source.trim() && !destination.trim()}
                    onClick={() => {
                      const t = source;
                      setSource(destination);
                      setDestination(t);
                    }}
                    className="w-9 h-9 rounded-full bg-surface-container border border-outline-variant/15 flex items-center justify-center shadow-md hover:scale-105 transition-transform disabled:opacity-40"
                  >
                    <span
                      className="material-symbols-outlined text-teal-400"
                      style={{ fontSize: '15px' }}
                    >
                      swap_horiz
                    </span>
                  </button>
                </div>
                <LocationInput
                  label="Origin Port / City"
                  value={source}
                  onChange={setSource}
                  icon="my_location"
                  iconColor="text-teal-400"
                  placeholder="Search city or port..."
                  hasError={!!error && !source.trim()}
                />
                <LocationInput
                  label="Destination Port / City"
                  value={destination}
                  onChange={setDestination}
                  icon="flag"
                  iconColor="text-cyan-400"
                  placeholder="Search city or port..."
                  hasError={!!error && !destination.trim()}
                />
              </div>
              {error && (
                <p className="text-[11px] text-error mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                    error
                  </span>
                  {error}
                </p>
              )}
            </div>

            {/* Weight */}
            <div
              className={`transition-all duration-600 delay-75 ${
                'opacity-100 translate-y-0'
              }`}
            >
              <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2 ml-0.5">
                Cargo Weight
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3 w-7 h-7 rounded-lg bg-surface-container/60 flex items-center justify-center shrink-0">
                  <span
                    className="material-symbols-outlined text-outline"
                    style={{ fontSize: '14px' }}
                  >
                    scale
                  </span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={cargoWeight}
                  onChange={(e) => setCargoWeight(Number(e.target.value))}
                  className="w-full pl-12 pr-10 py-3.5 border border-outline-variant/15 rounded-xl bg-surface-container-lowest/50 focus:border-teal-400/40 focus:ring-1 focus:ring-teal-400/20 text-on-surface transition-all outline-none text-sm"
                />
                <span className="absolute right-3.5 text-[11px] text-outline mono">kg</span>
              </div>
            </div>

            <FormField label="Cargo type">
              <ChoicePills
                options={CARGO_TYPES.map((ct) => ({
                  value: ct.value,
                  label: ct.value,
                  icon: ct.icon,
                }))}
                value={cargoType}
                onChange={setCargoType}
                accentVar="--water"
              />
            </FormField>

            <FormField label="Priority">
              <ChoicePills
                options={PRIORITY_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                  icon: opt.icon,
                }))}
                value={priority}
                onChange={setPriority}
                accentVar="--water"
              />
            </FormField>

            <div className="rounded-xl border border-teal-400/20 bg-teal-500/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-teal-300">
                  Global coverage
                </span>
                <span className="mono text-[10px] text-on-surface-variant">
                  {WATER_PORTS.length} ports / {WATER_PORT_REGION_COUNT} regions
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['India', 'Middle East', 'Southeast Asia', 'East Asia', 'Europe'].map((region) => (
                  <span
                    key={region}
                    className="rounded-full border border-outline-variant/15 bg-surface-container-lowest/35 px-2.5 py-1 text-[10px] font-medium text-on-surface-variant"
                  >
                    {region}
                  </span>
                ))}
              </div>
            </div>

            {/* Advanced */}
            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out ${
                showAdvanced ? 'max-h-[260px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
              }`}
            >
              <div className="pt-1 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2 ml-0.5">
                      Budget Cap
                    </label>
                    <input
                      type="range"
                      min={5000}
                      max={500000}
                      step={5000}
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-right text-[11px] mono text-teal-400 mt-1">
                      ₹{budgetMax.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2 ml-0.5">
                      Max Transshipments
                    </label>
                    <div className="flex items-center gap-3">
                      {[0, 1, 2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setMaxTransshipments(n)}
                          className={`flex-1 py-2 rounded-xl border text-sm font-bold mono transition-all ${
                            maxTransshipments === n
                              ? 'bg-teal-500/15 border-teal-400/40 text-teal-300'
                              : 'bg-surface-container-lowest/30 border-outline-variant/15 text-on-surface-variant hover:border-outline-variant/30'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-outline/60 mt-1.5 text-center">
                      stops between origin and destination
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </form>
      </FormShell>
    </div>
  );
}
