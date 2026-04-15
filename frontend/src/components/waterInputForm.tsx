'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { searchCities, type StationSearchResult } from '@/services/api';

// ── Debounced city search ─────────────────────────────────────────────

function useCitySearch(setGlobalSuggestions: (rows: StationSearchResult[]) => void) {
  const [results, setResults] = useState<{ name: string; lat?: number; lng?: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(
    (query: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (!query || query.length < 2) {
        setResults([]);
        setGlobalSuggestions([]);
        return;
      }
      setLoading(true);
      timeoutRef.current = setTimeout(async () => {
        const data = await searchCities(query);
        setResults(data);
        setGlobalSuggestions(data.map((r) => ({ code: r.name.slice(0, 5).toUpperCase(), name: r.name })));
        setLoading(false);
      }, 300);
    },
    [setGlobalSuggestions]
  );

  const clear = useCallback(() => {
    setResults([]);
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
  const [focused, setFocused] = useState(false);
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

  const selectLocation = (location: { name: string }) => {
    onChange(location.name);
    clear();
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative z-[9999]">
      <label className="flex items-center gap-1.5 text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2 ml-0.5">
        {label}
        {loading && <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />}
      </label>

      <div className="relative">
        <div
          className={`absolute -inset-0.5 rounded-xl transition-all duration-400 ${
            focused
              ? 'opacity-100 bg-gradient-to-r from-teal-400/25 via-cyan-400/20 to-teal-400/25 blur-sm'
              : 'opacity-0'
          }`}
        />
        <div
          className={`relative flex items-center bg-surface-container-lowest/80 border rounded-xl overflow-hidden transition-all duration-200 ${
            hasError
              ? 'border-error/50'
              : focused
              ? 'border-teal-400/40 shadow-[0_0_12px_rgba(45,212,191,0.10)]'
              : 'border-outline-variant/20 hover:border-outline-variant/40'
          }`}
        >
          <div className="pl-3.5 pr-2.5 flex items-center justify-center shrink-0">
            <span
              className={`material-symbols-outlined transition-all duration-300 leading-none ${
                focused ? `${iconColor} scale-110` : 'text-outline scale-100'
              }`}
              style={{
                fontSize: '18px',
                fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20",
              }}
            >
              {icon}
            </span>
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
              setFocused(true);
              if (results.length) setShowDropdown(true);
            }}
            onBlur={() => setFocused(false)}
            className="w-full py-3.5 pr-3 bg-transparent text-on-surface placeholder:text-outline/40 focus:outline-none text-sm font-medium"
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
              className="absolute right-2.5 p-1 rounded-full text-outline/50 hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                close
              </span>
            </button>
          )}
        </div>
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-[99999] top-full left-0 right-0 mt-1.5 bg-surface-container-low/95 backdrop-blur-xl border border-outline-variant/20 rounded-2xl shadow-[0_16px_48px_-8px_rgba(0,0,0,0.7)] overflow-hidden animate-slide-up origin-top">
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

  const [formStep, setFormStep] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxTransshipments, setMaxTransshipments] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timers = [
      setTimeout(() => setFormStep(1), 80),
      setTimeout(() => setFormStep(2), 220),
      setTimeout(() => setFormStep(3), 360),
      setTimeout(() => setFormStep(4), 500),
      setTimeout(() => setFormStep(5), 640),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

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
    handleOptimize({ mode: 'water' });
  };

  return (
    <div className="form-container-glow relative">
      {/* Ambient glow */}
      <div className="absolute -inset-1 bg-gradient-to-r from-teal-500/12 via-cyan-400/6 to-teal-500/12 rounded-3xl blur-2xl opacity-40 animate-pulse-slow pointer-events-none" />

      <div className="relative bg-surface-container-low/75 backdrop-blur-2xl border border-outline-variant/12 rounded-2xl shadow-2xl overflow-hidden">
        {/* Top shimmer */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-teal-400/40 to-transparent animate-shimmer shrink-0" />

        <div className="p-5 sm:p-7">
          {/* Header */}
          <div
            className={`flex items-center justify-between mb-6 transition-all duration-600 ${
              formStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-400/15 flex items-center justify-center border border-teal-400/20">
                  <span
                    className="material-symbols-outlined text-teal-400 leading-none"
                    style={{
                      fontSize: '18px',
                      fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                    }}
                  >
                    directions_boat
                  </span>
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-teal-400 rounded-full animate-ping opacity-60" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-teal-400 rounded-full" />
              </div>
              <div>
                <h2 className="text-[15px] font-headline font-bold text-on-surface tracking-tight">
                  Water (Maritime) Routing
                </h2>
                <p className="text-[10px] text-outline mt-0.5">
                  Port-based routes with transshipment options
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-[11px] text-on-surface-variant hover:text-teal-400 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-surface-container border border-transparent hover:border-outline-variant/15"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                {showAdvanced ? 'unfold_less' : 'tune'}
              </span>
              {showAdvanced ? 'Less' : 'Advanced'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Origin / Destination */}
            <div
              className={`relative z-[100] transition-all duration-600 ${
                formStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
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
                formStep >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
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

            {/* Cargo type */}
            <div
              className={`transition-all duration-600 delay-100 ${
                formStep >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
            >
              <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2.5 ml-0.5">
                Cargo Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CARGO_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => setCargoType(ct.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200 ${
                      cargoType === ct.value
                        ? 'bg-teal-500/10 border-teal-400/30 shadow-sm'
                        : 'bg-surface-container-lowest/20 border-outline-variant/8 hover:border-outline-variant/20 hover:bg-surface-container/30'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined leading-none transition-colors ${
                        cargoType === ct.value ? 'text-teal-400' : 'text-outline'
                      }`}
                      style={{
                        fontSize: '18px',
                        fontVariationSettings: `'FILL' ${cargoType === ct.value ? 1 : 0}, 'wght' 400`,
                      }}
                    >
                      {ct.icon}
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        cargoType === ct.value ? 'text-on-surface' : 'text-on-surface-variant'
                      }`}
                    >
                      {ct.value}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div
              className={`transition-all duration-600 delay-150 ${
                formStep >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
            >
              <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2.5 ml-0.5">
                Optimization Priority
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`flex flex-col items-center gap-2 py-3.5 px-3 rounded-xl border transition-all duration-200 ${
                      priority === opt.value
                        ? `${opt.activeClass} shadow-sm scale-[1.02]`
                        : 'bg-surface-container-lowest/20 border-outline-variant/8 hover:border-outline-variant/20 text-on-surface-variant'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined leading-none ${
                        priority === opt.value ? opt.iconColor : 'text-outline'
                      }`}
                      style={{
                        fontSize: '22px',
                        fontVariationSettings: `'FILL' ${priority === opt.value ? 1 : 0}, 'wght' 400`,
                      }}
                    >
                      {opt.icon}
                    </span>
                    <span className="text-[12px] font-semibold">{opt.label}</span>
                  </button>
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

            {/* Submit */}
            <div
              className={`transition-all duration-600 delay-200 ${
                formStep >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
            >
              <button
                type="submit"
                disabled={loading || !source.trim() || !destination.trim() || cargoWeight <= 0}
                className="relative w-full py-3.5 font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden group"
              >
                <div
                  className={`absolute inset-0 transition-all duration-300 ${
                    loading
                      ? 'bg-surface-container'
                      : 'bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500 group-hover:opacity-90'
                  }`}
                />
                {!loading && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                )}
                <div className="relative flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined leading-none ${
                      loading ? 'animate-spin text-outline' : 'text-white'
                    }`}
                    style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}
                  >
                    {loading ? 'progress_activity' : 'directions_boat'}
                  </span>
                  <span
                    className={`text-sm tracking-wide font-semibold ${
                      loading ? 'text-outline' : 'text-white'
                    }`}
                  >
                    {loading ? 'Charting Routes…' : 'Find Maritime Routes'}
                  </span>
                </div>
              </button>
              {source.trim() && destination.trim() && !loading && (
                <p className="text-center text-[10px] text-outline/50 mt-2.5 flex items-center justify-center gap-1.5 animate-fade-in">
                  <span
                    className="material-symbols-outlined text-teal-400"
                    style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                  <span className="mono text-teal-400">{source}</span>
                  {' → '}
                  <span className="mono text-cyan-400">{destination}</span>
                  {' · '}
                  {cargoWeight}kg {cargoType}
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
