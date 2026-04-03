'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { searchCities } from '@/services/api';

// ── Debounced city search ─────────────────────────────────────────

function useCitySearch(setGlobalSuggestions: (rows: any[]) => void) {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback((query: string) => {
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
      setGlobalSuggestions(data);
      setLoading(false);
    }, 300);
  }, [setGlobalSuggestions]);

  const clear = useCallback(() => {
    setResults([]);
    setGlobalSuggestions([]);
  }, [setGlobalSuggestions]);

  return { results, loading, search, clear };
}

// ── Constants ────────────────────────────────────────────────────────

const CARGO_TYPES = [
  { value: 'General', icon: 'inventory_2', desc: 'Standard goods' },
  { value: 'Fragile', icon: 'local_shipping', desc: 'Handle with care' },
  { value: 'Perishable', icon: 'ac_unit', desc: 'Cold chain' },
];

const PRIORITY_OPTIONS = [
  { value: 'cost', label: 'Cheapest', icon: 'savings', color: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30', iconColor: 'text-emerald-400' },
  { value: 'time', label: 'Fastest', icon: 'bolt', color: 'from-amber-500/20 to-amber-600/5 border-amber-500/30', iconColor: 'text-amber-400' },
  { value: 'safe', label: 'Safest', icon: 'verified_user', color: 'from-blue-500/20 to-blue-600/5 border-blue-500/30', iconColor: 'text-blue-400' },
];

// ── Autocomplete Input ───────────────────────────────────────────────

function LocationInput({
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

  const selectLocation = (location: any) => {
    onChange(`${location.name}`);
    clear();
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative z-[9999]">
      <label className="block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-widest mb-2 ml-1 flex items-center gap-2">
        {label}
        {loading && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
      </label>
      
      <div className="relative group">
        <div className={`absolute -inset-0.5 rounded-xl transition-all duration-500 ease-out ${
          focused 
            ? 'opacity-100 bg-gradient-to-r from-primary/40 via-tertiary/40 to-primary/40 blur-md' 
            : 'opacity-0 bg-transparent blur-none'
        }`} />
        
        <div className={`relative flex items-center bg-[#0d1117] border rounded-xl overflow-hidden transition-all duration-300 ${
          focused ? 'border-primary/50 shadow-[0_0_15px_rgba(47,129,247,0.15)]' : 'border-outline-variant/30 hover:border-outline-variant/60'
        }`}>
          <div className="pl-4 pr-3 flex items-center justify-center">
             <span className={`material-symbols-outlined text-xl transition-all duration-500 ${
               focused ? `${iconColor} scale-110 drop-shadow-md` : 'text-outline scale-100'
             }`}>
               {icon}
             </span>
          </div>

          <input
            type="text"
            value={value}
            onChange={e => handleChange(e.target.value)}
            onFocus={() => { setFocused(true); if (results.length) setShowDropdown(true); }}
            onBlur={() => setFocused(false)}
            className="w-full py-4 pr-3 bg-transparent text-white placeholder:text-outline/40 focus:outline-none text-sm font-medium tracking-wide"
            placeholder={placeholder}
          />
          
          {value && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(''); clear(); setShowDropdown(false); focus(); }}
              className="absolute right-3 p-1 rounded-full text-outline-variant hover:text-white hover:bg-white/10 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-[99999] top-full left-0 right-0 mt-2 bg-[#12161d]/95 backdrop-blur-xl border border-white/10 border-b-white/5 rounded-2xl shadow-[0_15px_50px_-12px_rgba(0,0,0,0.8)] overflow-hidden animate-slide-up origin-top">
          <div className="max-h-[260px] overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {results.map((s, i) => (
              <button
                key={`${s.code}-${i}`}
                type="button"
                className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all duration-200 text-left group"
                onMouseDown={(e) => {
                  e.preventDefault(); 
                  selectLocation(s);
                }}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-primary/20 group-hover:border-primary/30 transition-all">
                  <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-lg">local_shipping</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-white/90 group-hover:text-white transition-colors truncate">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-white/40 font-mono mt-0.5 tracking-wider">
                    {s.code}
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 pr-2 text-primary">
                  <span className="material-symbols-outlined text-sm">subdirectory_arrow_left</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Form ────────────────────────────────────────────────────────

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
    avoidTolls, setAvoidTolls,
    avoidHighways, setAvoidHighways,
    trafficAware, setTrafficAware,
    handleOptimize,
    loading,
  } = useLogiFlowStore();

  const [formStep, setFormStep] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setFormStep(1), 100),
      setTimeout(() => setFormStep(2), 250),
      setTimeout(() => setFormStep(3), 400),
      setTimeout(() => setFormStep(4), 550),
      setTimeout(() => setFormStep(5), 700),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.trim() || !destination.trim()) return;
    handleOptimize({
      mode: 'road',
      avoid_tolls: avoidTolls,
      avoid_highways: avoidHighways,
      traffic_aware: trafficAware,
    });
  };

  return (
    <div className="form-container-glow relative">
      <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-tertiary/10 to-primary/20 rounded-3xl blur-xl opacity-50 animate-pulse-slow pointer-events-none" />

      <div className="relative bg-surface-container-low/80 backdrop-blur-2xl border border-outline-variant/15 rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer" />

        <div className="p-8">
          {/* Header */}
          <div className={`flex items-center justify-between mb-8 transition-all duration-700 ${formStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border border-primary/20">
                  <span className="material-symbols-outlined text-primary text-xl">local_shipping</span>
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-tertiary rounded-full animate-ping opacity-75" />
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-tertiary rounded-full" />
              </div>
              <div>
                <h2 className="text-xl font-headline font-bold text-on-surface tracking-tight">Road Logistics</h2>
                <p className="text-xs text-on-surface-variant font-body mt-0.5">Powered by LogiFlow · Smart Road Routing</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-container border border-transparent hover:border-outline-variant/20"
            >
              <span className="material-symbols-outlined text-sm">{showAdvanced ? 'unfold_less' : 'tune'}</span>
              {showAdvanced ? 'Less' : 'Advanced'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Source & Destination with autocomplete */}
            <div className={`relative z-[100] transition-all duration-700 delay-75 ${formStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-[100]">
                <div className="hidden md:block absolute bottom-[18px] left-1/2 -translate-x-1/2 translate-y-1/2 z-10">
                  <div className="w-10 h-10 rounded-full bg-surface-container border border-outline-variant/20 flex items-center justify-center shadow-lg">
                    <span className="material-symbols-outlined text-primary text-sm">swap_horiz</span>
                  </div>
                </div>

                <LocationInput
                  label="Pickup Location"
                  value={source}
                  onChange={setSource}
                  icon="my_location"
                  iconColor="text-primary"
                  placeholder="Search city..."
                />
                <LocationInput
                  label="Delivery Location"
                  value={destination}
                  onChange={setDestination}
                  icon="flag"
                  iconColor="text-tertiary"
                  placeholder="Search city..."
                />
              </div>
            </div>

            {/* Cargo Weight & Type */}
            <div className={`transition-all duration-700 delay-100 ${formStep >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">
                    Cargo Weight
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3 w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center">
                      <span className="material-symbols-outlined text-sm text-outline">scale</span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={cargoWeight}
                      onChange={e => setCargoWeight(Number(e.target.value))}
                      className="w-full pl-14 pr-12 py-3.5 border border-outline-variant/20 rounded-xl bg-surface-container-lowest/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-on-surface transition-all outline-none text-sm"
                    />
                    <span className="absolute right-4 text-xs text-outline mono">kg</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">
                    Departure Date
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3 w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center">
                      <span className="material-symbols-outlined text-sm text-outline">calendar_today</span>
                    </div>
                    <input
                      type="date"
                      value={departureDate}
                      onChange={e => setDepartureDate(e.target.value)}
                      className="w-full pl-14 pr-4 py-3.5 border border-outline-variant/20 rounded-xl bg-surface-container-lowest/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-on-surface transition-all outline-none text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Cargo Type */}
            <div className={`transition-all duration-700 delay-150 ${formStep >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">
                Cargo Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CARGO_TYPES.map(ct => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => setCargoType(ct.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-300 cursor-pointer ${
                      cargoType === ct.value
                        ? 'bg-primary/15 border-primary/40 shadow-md shadow-primary/10'
                        : 'bg-surface-container-lowest/30 border-outline-variant/10 hover:border-outline-variant/30 hover:bg-surface-container/50'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-lg ${cargoType === ct.value ? 'text-primary' : 'text-outline'}`}>
                      {ct.icon}
                    </span>
                    <span className={`text-xs font-medium ${cargoType === ct.value ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                      {ct.value}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className={`transition-all duration-700 delay-200 ${formStep >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">
                Optimization Priority
              </label>
              <div className="grid grid-cols-3 gap-3">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                      priority === opt.value
                        ? `bg-gradient-to-b ${opt.color} border-current shadow-lg scale-[1.02]`
                        : 'bg-surface-container-lowest/30 border-outline-variant/10 hover:border-outline-variant/30'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-2xl ${priority === opt.value ? opt.iconColor : 'text-outline'}`}>
                      {opt.icon}
                    </span>
                    <span className={`text-sm font-semibold ${priority === opt.value ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Route Preferences */}
            <div className={`transition-all duration-700 delay-250 ${formStep >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">
                Route Preferences
              </label>

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setAvoidTolls(!avoidTolls)}
                  className={`p-3 rounded-xl border transition-all ${avoidTolls ? 'bg-primary/15 border-primary/40' : 'bg-surface-container-lowest/30 border-outline-variant/10'}`}
                >
                  <span className="material-symbols-outlined text-lg">toll</span>
                  <div className="text-xs mt-1">Avoid Tolls</div>
                </button>

                <button
                  type="button"
                  onClick={() => setAvoidHighways(!avoidHighways)}
                  className={`p-3 rounded-xl border transition-all ${avoidHighways ? 'bg-primary/15 border-primary/40' : 'bg-surface-container-lowest/30 border-outline-variant/10'}`}
                >
                  <span className="material-symbols-outlined text-lg">alt_route</span>
                  <div className="text-xs mt-1">Avoid Highways</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTrafficAware(!trafficAware)}
                  className={`p-3 rounded-xl border transition-all ${trafficAware ? 'bg-primary/15 border-primary/40' : 'bg-surface-container-lowest/30 border-outline-variant/10'}`}
                >
                  <span className="material-symbols-outlined text-lg">traffic</span>
                  <div className="text-xs mt-1">Traffic Aware</div>
                </button>
              </div>
            </div>

            {/* Advanced — Budget & Deadline */}
            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${showAdvanced ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">
                    Budget Cap
                  </label>
                  <div className="space-y-2">
                    <input
                      type="range" min={5000} max={100000} step={1000}
                      value={budgetMax}
                      onChange={e => setBudgetMax(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-right text-xs mono text-primary">₹{budgetMax.toLocaleString()}</div>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">
                    Deadline
                  </label>
                  <div className="space-y-2">
                    <input
                      type="range" min={4} max={96} step={2}
                      value={deadlineHours}
                      onChange={e => setDeadlineHours(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-right text-xs mono text-primary">{deadlineHours}h</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className={`transition-all duration-700 delay-300 ${formStep >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <button
                type="submit"
                disabled={loading || !source.trim() || !destination.trim()}
                className="group/btn relative w-full py-4 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden"
              >
                <div className={`absolute inset-0 transition-all duration-500 ${
                  loading
                    ? 'bg-surface-container'
                    : 'bg-gradient-to-r from-primary via-primary-container to-primary group-hover/btn:shadow-[0_0_30px_rgba(47,129,247,0.4)]'
                }`} />
                {!loading && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700" />
                )}
                <div className="relative flex items-center gap-2">
                  <span className={`material-symbols-outlined text-xl ${loading ? 'animate-spin text-outline' : 'text-on-primary-container'}`}>
                    {loading ? 'progress_activity' : 'local_shipping'}
                  </span>
                  <span className={`text-sm tracking-wider uppercase ${loading ? 'text-outline' : 'text-on-primary-container'}`}>
                    {loading ? 'Finding Routes...' : 'Find Optimal Routes'}
                  </span>
                </div>
              </button>

              {source.trim() && destination.trim() && !loading && (
                <p className="text-center text-[11px] text-on-surface-variant/60 mt-3 flex items-center justify-center gap-1.5 animate-fade-in">
                  <span className="material-symbols-outlined text-tertiary text-xs">check_circle</span>
                  Ready: <span className="mono text-primary">{source}</span> → <span className="mono text-tertiary">{destination}</span>
                  · {cargoWeight}kg {cargoType}
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
