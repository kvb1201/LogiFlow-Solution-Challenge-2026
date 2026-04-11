'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { searchStations, type StationSearchResult } from '@/services/api';

// ── Debounced station search ──────────────────────────────────────────

function useStationSearch(setGlobalSuggestions: (rows: StationSearchResult[]) => void) {
  const [results, setResults] = useState<StationSearchResult[]>([]);
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
        const data = await searchStations(query);
        setResults(data);
        setGlobalSuggestions(data);
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

// ── Station Input ─────────────────────────────────────────────────────

function StationInput({
  label,
  value,
  onChange,
  icon,
  iconColor,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  icon: string;
  iconColor: string;
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const setStationSuggestions = useLogiFlowStore(s => s.setStationSuggestions);
  const { results, loading, search, clear } = useStationSearch(setStationSuggestions);
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

  const selectStation = (station: StationSearchResult) => {
    onChange(station.name);
    clear();
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative z-[9999]">
      <label className="flex items-center gap-1.5 text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2 ml-0.5">
        {label}
        {loading && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
      </label>

      <div className="relative">
        {/* Focus glow */}
        <div
          className={`absolute -inset-0.5 rounded-xl transition-all duration-400 ${
            focused
              ? 'opacity-100 bg-gradient-to-r from-primary/30 via-tertiary/25 to-primary/30 blur-sm'
              : 'opacity-0'
          }`}
        />
        <div
          className={`relative flex items-center bg-surface-container-lowest/80 border rounded-xl overflow-hidden transition-all duration-200 ${
            focused
              ? 'border-primary/40 shadow-[0_0_12px_rgba(172,199,255,0.12)]'
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
            onChange={e => handleChange(e.target.value)}
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
              onMouseDown={e => {
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

      {/* Dropdown */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-[99999] top-full left-0 right-0 mt-1.5 bg-surface-container-low/95 backdrop-blur-xl border border-outline-variant/20 rounded-2xl shadow-[0_16px_48px_-8px_rgba(0,0,0,0.7)] overflow-hidden animate-slide-up origin-top">
          <div className="max-h-[240px] overflow-y-auto p-1.5">
            {results.map((s, i) => (
              <button
                key={`${s.code}-${i}`}
                type="button"
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container/80 transition-all duration-150 text-left group"
                onMouseDown={e => {
                  e.preventDefault();
                  selectStation(s);
                }}
              >
                <div className="w-8 h-8 rounded-full bg-surface-container/60 border border-outline-variant/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 group-hover:border-primary/25 transition-all">
                  <span
                    className="material-symbols-outlined text-outline group-hover:text-primary transition-colors"
                    style={{ fontSize: '15px', fontVariationSettings: "'FILL' 1" }}
                  >
                    train
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-on-surface group-hover:text-on-surface truncate">
                    {s.name}
                  </div>
                  <div className="text-[10px] text-outline mono mt-0.5 tracking-wider">{s.code}</div>
                </div>
                <span
                  className="material-symbols-outlined text-outline/0 group-hover:text-primary/60 transition-all -translate-x-1 group-hover:translate-x-0"
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

export default function InputForm() {
  const {
    source, setSource,
    destination, setDestination,
    priority, setPriority,
    cargoWeight, setCargoWeight,
    cargoType, setCargoType,
    departureDate, setDepartureDate,
    budgetMax, setBudgetMax,
    deadlineHours, setDeadlineHours,
    handleOptimize,
    loading,
  } = useLogiFlowStore();

  const [formStep, setFormStep] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    if (!source.trim() || !destination.trim()) return;
    handleOptimize();
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4">
      <div className="form-container-glow relative">
        {/* Ambient glow */}
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/15 via-tertiary/8 to-primary/15 rounded-3xl blur-2xl opacity-40 animate-pulse-slow pointer-events-none" />

        <div className="relative flex flex-col bg-surface-container-low/75 backdrop-blur-2xl border border-outline-variant/12 rounded-2xl shadow-2xl overflow-hidden">
          {/* Top shimmer bar */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-shimmer shrink-0" />

          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-col flex-1 min-h-0 p-5 sm:p-7 pb-0 pt-5 sm:pt-7">
              {/* Header */}
              <div
                className={`shrink-0 flex items-center justify-between gap-3 mb-5 transition-all duration-600 ${
                  formStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/25 to-primary-container/15 flex items-center justify-center border border-primary/20">
                      <span
                        className="material-symbols-outlined text-primary leading-none"
                        style={{
                          fontSize: '18px',
                          fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                        }}
                      >
                        train
                      </span>
                    </div>
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-tertiary rounded-full animate-ping opacity-60" />
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-tertiary rounded-full" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-headline font-bold text-on-surface tracking-tight">
                      Railway Cargo
                    </h2>
                    <p className="text-[10px] text-outline mt-0.5">
                      Powered by RailRadar · Live Indian Railways Data
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-[11px] text-on-surface-variant hover:text-primary transition-colors px-2.5 py-1.5 rounded-lg hover:bg-surface-container border border-transparent hover:border-outline-variant/15"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                    {showAdvanced ? 'unfold_less' : 'tune'}
                  </span>
                  {showAdvanced ? 'Less' : 'Advanced'}
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 mt-1">
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-24 scroll-smooth">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Origin & Destination */}
                    <div
                      className={`relative z-[100] md:col-span-2 lg:col-span-3 transition-all duration-600 ${
                        formStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                      }`}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                        {/* Swap icon */}
                        <div className="hidden md:flex absolute bottom-[18px] left-1/2 -translate-x-1/2 translate-y-1/2 z-10 pointer-events-none items-center justify-center">
                          <div className="w-9 h-9 rounded-full bg-surface-container border border-outline-variant/15 flex items-center justify-center shadow-md">
                            <span
                              className="material-symbols-outlined text-primary"
                              style={{ fontSize: '15px' }}
                            >
                              swap_horiz
                            </span>
                          </div>
                        </div>
                        <StationInput
                          label="Origin"
                          value={source}
                          onChange={setSource}
                          icon="my_location"
                          iconColor="text-primary"
                          placeholder="Search city or station..."
                        />
                        <StationInput
                          label="Destination"
                          value={destination}
                          onChange={setDestination}
                          icon="flag"
                          iconColor="text-tertiary"
                          placeholder="Search city or station..."
                        />
                      </div>
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
                          max={5000}
                          value={cargoWeight}
                          onChange={e => setCargoWeight(Number(e.target.value))}
                          className="w-full pl-12 pr-10 py-3.5 border border-outline-variant/15 rounded-xl bg-surface-container-lowest/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 text-on-surface transition-all outline-none text-sm"
                        />
                        <span className="absolute right-3.5 text-[11px] text-outline mono">kg</span>
                      </div>
                    </div>

                    {/* Date */}
                    <div
                      className={`transition-all duration-600 delay-75 ${
                        formStep >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                      }`}
                    >
                      <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2 ml-0.5">
                        Departure Date
                      </label>
                      <div className="relative flex items-center">
                        <div className="absolute left-3 w-7 h-7 rounded-lg bg-surface-container/60 flex items-center justify-center shrink-0">
                          <span
                            className="material-symbols-outlined text-outline"
                            style={{ fontSize: '14px' }}
                          >
                            calendar_today
                          </span>
                        </div>
                        <input
                          type="date"
                          value={departureDate}
                          onChange={e => setDepartureDate(e.target.value)}
                          className="w-full pl-12 pr-4 py-3.5 border border-outline-variant/15 rounded-xl bg-surface-container-lowest/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 text-on-surface transition-all outline-none text-sm"
                        />
                      </div>
                    </div>

                    {/* Cargo type */}
                    <div
                      className={`md:col-span-2 lg:col-span-3 transition-all duration-600 delay-100 ${
                        formStep >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                      }`}
                    >
                      <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2.5 ml-0.5">
                        Cargo Type
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {CARGO_TYPES.map(ct => (
                          <button
                            key={ct.value}
                            type="button"
                            onClick={() => setCargoType(ct.value)}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200 ${
                              cargoType === ct.value
                                ? 'bg-primary/10 border-primary/30 shadow-sm'
                                : 'bg-surface-container-lowest/20 border-outline-variant/8 hover:border-outline-variant/20 hover:bg-surface-container/30'
                            }`}
                          >
                            <span
                              className={`material-symbols-outlined leading-none transition-colors ${
                                cargoType === ct.value ? 'text-primary' : 'text-outline'
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
                      className={`md:col-span-2 lg:col-span-3 transition-all duration-600 delay-150 ${
                        formStep >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                      }`}
                    >
                      <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2.5 ml-0.5">
                        Optimization Priority
                      </label>
                      <div className="grid grid-cols-3 gap-2.5">
                        {PRIORITY_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPriority(opt.value)}
                            className={`relative flex flex-col items-center gap-2 py-3.5 px-3 rounded-xl border transition-all duration-200 ${
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
                      className={`md:col-span-2 lg:col-span-3 overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out ${
                        showAdvanced ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
                      }`}
                    >
                      <div className="grid grid-cols-2 gap-4 pt-1">
                        <div>
                          <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2 ml-0.5">
                            Budget Cap
                          </label>
                          <input
                            type="range"
                            min={5000}
                            max={100000}
                            step={1000}
                            value={budgetMax}
                            onChange={e => setBudgetMax(Number(e.target.value))}
                            className="w-full"
                          />
                          <div className="text-right text-[11px] mono text-primary mt-1">
                            ₹{budgetMax.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2 ml-0.5">
                            Deadline
                          </label>
                          <input
                            type="range"
                            min={4}
                            max={96}
                            step={2}
                            value={deadlineHours}
                            onChange={e => setDeadlineHours(Number(e.target.value))}
                            className="w-full"
                          />
                          <div className="text-right text-[11px] mono text-primary mt-1">
                            {deadlineHours}h
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit footer */}
                <div
                  className={`shrink-0 border-t border-outline-variant/10 bg-surface-container-lowest/90 backdrop-blur-md p-4 -mx-5 sm:-mx-7 mt-0 pb-[max(env(safe-area-inset-bottom),1rem)] transition-all duration-600 ${
                    formStep >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                  }`}
                >
                  <button
                    type="submit"
                    disabled={loading || !source.trim() || !destination.trim()}
                    className="w-full py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed bg-primary hover:bg-primary/90 active:scale-[0.99] text-on-primary font-semibold shadow-lg shadow-primary/15"
                  >
                    <span
                      className={`material-symbols-outlined leading-none ${loading ? 'animate-spin' : ''}`}
                      style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}
                    >
                      {loading ? 'progress_activity' : 'train'}
                    </span>
                    <span className="text-sm tracking-wide">
                      {loading ? 'Finding Routes...' : 'Optimize Route'}
                    </span>
                  </button>
                  {source.trim() && destination.trim() && !loading && (
                    <p className="text-center text-[10px] text-outline/50 mt-2.5 flex items-center justify-center gap-1.5 animate-fade-in">
                      <span
                        className="material-symbols-outlined text-tertiary"
                        style={{ fontSize: '12px', fontVariationSettings: "'FILL' 1" }}
                      >
                        check_circle
                      </span>
                      <span className="mono text-primary">{source}</span>
                      {' → '}
                      <span className="mono text-tertiary">{destination}</span>
                      {' · '}
                      {cargoWeight}kg {cargoType}
                    </p>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
