'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { searchCities, type StationSearchResult } from '@/services/api';

// ── Debounced city search ─────────────────────────────────────────────

function citiesToStationRows(
  rows: { name: string; lat?: number; lng?: number }[]
): StationSearchResult[] {
  return rows.map((r) => ({
    code: r.name.split(',')[0]?.trim().slice(0, 5).toUpperCase() || 'CITY',
    name: r.name,
  }));
}

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
        setGlobalSuggestions(citiesToStationRows(data));
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
  { value: 'General', icon: 'inventory_2' },
  { value: 'Fragile', icon: 'local_shipping' },
  { value: 'Perishable', icon: 'ac_unit' },
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

const SIMULATION_PRESETS = [
  { name: "Peak Hour", traffic: 0.85, weather: 0.2, incidents: 1 },
  { name: "Heavy Rain", traffic: 0.6, weather: 0.9, incidents: 2 },
  { name: "Festival Rush", traffic: 0.95, weather: 0.3, incidents: 3 },
  { name: "Highway Accident", traffic: 0.7, weather: 0.2, incidents: 5 },
  { name: "Clear Conditions", traffic: 0.2, weather: 0.1, incidents: 0 },
];

// ── Autocomplete Input ───────────────────────────────────────────────

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

  const selectLocation = (location: { name: string }) => {
    onChange(location.name);
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
        <div
          className={`absolute -inset-0.5 rounded-xl transition-all duration-400 ${
            focused
              ? 'opacity-100 bg-gradient-to-r from-primary/30 via-tertiary/25 to-primary/30 blur-sm'
              : 'opacity-0'
          }`}
        />
        <div
          className={`relative flex items-center bg-surface-container-lowest/80 border rounded-xl overflow-hidden transition-all duration-200 ${
            hasError
              ? 'border-error/50'
              : focused
              ? 'border-primary/40 shadow-[0_0_12px_rgba(172,199,255,0.10)]'
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

      {showDropdown && results.length > 0 && (
        <div className="absolute z-[99999] top-full left-0 right-0 mt-1.5 bg-surface-container-low/95 backdrop-blur-xl border border-outline-variant/20 rounded-2xl shadow-[0_16px_48px_-8px_rgba(0,0,0,0.7)] overflow-hidden animate-slide-up origin-top">
          <div className="max-h-[240px] overflow-y-auto p-1.5">
            {results.map((s, i) => (
              <button
                key={`${s.name}-${i}`}
                type="button"
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container/80 transition-all duration-150 text-left group"
                onMouseDown={e => {
                  e.preventDefault();
                  selectLocation(s);
                }}
              >
                <div className="w-8 h-8 rounded-full bg-surface-container/60 border border-outline-variant/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 group-hover:border-primary/25 transition-all">
                  <span
                    className="material-symbols-outlined text-outline group-hover:text-primary transition-colors"
                    style={{ fontSize: '15px', fontVariationSettings: "'FILL' 1" }}
                  >
                    local_shipping
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-on-surface truncate">{s.name}</div>
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

export default function RoadInputForm() {
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
    vehicleType, setVehicleType,
    fuelPrice, setFuelPrice,
    handleOptimize,
    loading,
  } = useLogiFlowStore();

  const [formStep, setFormStep] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().split('T')[0];
  // Simulation mode state
  const [simulationMode, setSimulationMode] = useState(false);
  const [simTraffic, setSimTraffic] = useState(0.5);
  const [simWeather, setSimWeather] = useState(0.5);
  const [simIncidents, setSimIncidents] = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>(null);

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
    console.log("[FORM SUBMIT]", {
      mode: 'road',
      simulationMode,
      simTraffic,
      simWeather,
      simIncidents,
      source,
      destination,
      priority,
    });
    handleOptimize({
      mode: 'road',
      simulation_mode: simulationMode,
      simulation: simulationMode
        ? {
            traffic_level: simTraffic,
            weather_level: simWeather,
            incident_count: simIncidents,
          }
        : undefined,
    });
  };

  return (
    <div className="form-container-glow relative">
      <div className="absolute -inset-1 bg-gradient-to-r from-primary/15 via-secondary/8 to-primary/15 rounded-3xl blur-2xl opacity-35 animate-pulse-slow pointer-events-none" />

      <div className="relative bg-surface-container-low/75 backdrop-blur-2xl border border-outline-variant/12 rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-secondary/40 to-transparent animate-shimmer" />

        <div className="p-5 sm:p-7">
          {/* Header */}
          <div
            className={`flex items-center justify-between mb-6 transition-all duration-600 ${
              formStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-secondary/20 to-primary/15 flex items-center justify-center border border-secondary/20">
                  <span
                    className="material-symbols-outlined text-secondary leading-none"
                    style={{
                      fontSize: '18px',
                      fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                    }}
                  >
                    local_shipping
                  </span>
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-tertiary rounded-full animate-ping opacity-60" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-tertiary rounded-full" />
              </div>
              <div>
                <h2 className="text-[15px] font-headline font-bold text-on-surface tracking-tight">
                  Road Logistics
                </h2>
                <p className="text-[10px] text-outline mt-0.5">Powered by LogiFlow · Smart Road Routing</p>
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
                      className="material-symbols-outlined text-primary"
                      style={{ fontSize: '15px' }}
                    >
                      swap_horiz
                    </span>
                  </button>
                </div>
                <LocationInput
                  label="Pickup Location"
                  value={source}
                  onChange={setSource}
                  icon="my_location"
                  iconColor="text-primary"
                  placeholder="Search city..."
                  hasError={!!error && !source.trim()}
                />
                <LocationInput
                  label="Delivery Location"
                  value={destination}
                  onChange={setDestination}
                  icon="flag"
                  iconColor="text-tertiary"
                  placeholder="Search city..."
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

            {/* Weight + Date */}
            <div
              className={`grid grid-cols-2 gap-4 transition-all duration-600 delay-75 ${
                formStep >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
            >
              <div>
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
              <div>
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
                    min={today}
                    value={departureDate}
                    onChange={e => setDepartureDate(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 border border-outline-variant/15 rounded-xl bg-surface-container-lowest/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 text-on-surface transition-all outline-none text-sm"
                  />
                </div>
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
              className={`transition-all duration-600 delay-150 ${
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

            {/* Route preferences */}
            <div
              className={`transition-all duration-600 delay-150 ${
                formStep >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
            >
              <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2.5 ml-0.5">
                Route Preferences
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { key: 'tolls', label: 'Avoid Tolls', icon: 'toll', value: avoidTolls, set: setAvoidTolls },
                  { key: 'highways', label: 'Avoid Highways', icon: 'alt_route', value: avoidHighways, set: setAvoidHighways },
                  { key: 'traffic', label: 'Traffic Aware', icon: 'traffic', value: trafficAware, set: setTrafficAware },
                ].map(pref => (
                  <button
                    key={pref.key}
                    type="button"
                    onClick={() => pref.set(!pref.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200 ${
                      pref.value
                        ? 'bg-primary/10 border-primary/30 shadow-sm'
                        : 'bg-surface-container-lowest/20 border-outline-variant/8 hover:border-outline-variant/20 hover:bg-surface-container/30'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined leading-none ${
                        pref.value ? 'text-primary' : 'text-outline'
                      }`}
                      style={{
                        fontSize: '18px',
                        fontVariationSettings: `'FILL' ${pref.value ? 1 : 0}, 'wght' 400`,
                      }}
                    >
                      {pref.icon}
                    </span>
                    <span
                      className={`text-[11px] font-medium text-center leading-tight ${
                        pref.value ? 'text-on-surface' : 'text-on-surface-variant'
                      }`}
                    >
                      {pref.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced */}
            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out ${
                showAdvanced ? 'max-h-[280px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
              }`}
            >
              <div className="pt-1 space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                      max={72}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2 ml-0.5">
                      Vehicle Type
                    </label>
                    <select
                      value={vehicleType}
                      onChange={e => setVehicleType(e.target.value as 'mini_truck' | 'truck' | 'heavy_truck')}
                      className="w-full px-3.5 py-3 border border-outline-variant/15 rounded-xl bg-surface-container-lowest/50 focus:border-primary/40 text-on-surface outline-none text-sm"
                    >
                      <option value="mini_truck">Mini Truck</option>
                      <option value="truck">Truck</option>
                      <option value="heavy_truck">Heavy Truck</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2 ml-0.5">
                      Fuel Price (₹/L)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={fuelPrice}
                      onChange={e => setFuelPrice(Number(e.target.value))}
                      className="w-full px-3.5 py-3 border border-outline-variant/15 rounded-xl bg-surface-container-lowest/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 text-on-surface outline-none text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Simulation Mode */}
            <div className="mt-6 border border-outline-variant/20 rounded-xl p-4 bg-surface-container-lowest/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-on-surface-variant uppercase">Simulation Mode</span>
                <input
                  type="checkbox"
                  checked={simulationMode}
                  onChange={(e) => setSimulationMode(e.target.checked)}
                />
              </div>

              {simulationMode && (
                <>
                  {/* Presets */}
                  <div className="mb-4">
                    <label className="text-[11px] text-on-surface-variant mb-2 block">
                      Scenario Presets
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {SIMULATION_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            setSimulationMode(true);
                            setActivePreset(preset.name);
                            setSimTraffic(preset.traffic);
                            setSimWeather(preset.weather);
                            setSimIncidents(preset.incidents);
                          }}
                          className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                            activePreset === preset.name
                              ? "bg-primary/20 border-primary text-primary"
                              : "border-outline-variant/20 bg-surface-container hover:bg-primary/10"
                          }`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[11px] text-on-surface-variant">Traffic Level</label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={simTraffic}
                        onChange={(e) => {
                          setSimTraffic(Number(e.target.value));
                          setActivePreset(null);
                        }}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-on-surface-variant">Weather Severity</label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={simWeather}
                        onChange={(e) => {
                          setSimWeather(Number(e.target.value));
                          setActivePreset(null);
                        }}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-on-surface-variant">Incidents</label>
                      <input
                        type="number"
                        min={0}
                        value={simIncidents}
                        onChange={(e) => {
                          setSimIncidents(Number(e.target.value));
                          setActivePreset(null);
                        }}
                        className="w-full px-2 py-1 rounded bg-surface-container border border-outline-variant/20 text-sm"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Submit */}
            <div
              className={`transition-all duration-600 delay-200 ${
                formStep >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
            >
              <div className="text-[11px] text-outline mb-2.5 mono">
                Budget: <span className="text-primary">₹{budgetMax.toLocaleString()}</span>
                {' · '}
                Deadline: <span className="text-primary">{deadlineHours}h</span>
              </div>
              <button
                type="submit"
                disabled={loading || !source.trim() || !destination.trim() || cargoWeight <= 0}
                className="relative w-full py-3.5 font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden group"
              >
                <div
                  className={`absolute inset-0 transition-all duration-300 ${
                    loading
                      ? 'bg-surface-container'
                      : 'bg-gradient-to-r from-primary via-primary-container to-primary group-hover:opacity-90'
                  }`}
                />
                {!loading && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                )}
                <div className="relative flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined leading-none ${
                      loading ? 'animate-spin text-outline' : 'text-on-primary'
                    }`}
                    style={{
                      fontSize: '18px',
                      fontVariationSettings: "'FILL' 1",
                    }}
                  >
                    {loading ? 'progress_activity' : 'local_shipping'}
                  </span>
                  <span
                    className={`text-sm tracking-wide font-semibold ${
                      loading ? 'text-outline' : 'text-on-primary'
                    }`}
                  >
                    {loading ? 'Finding Routes...' : 'Find Optimal Routes'}
                  </span>
                </div>
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
  );
}
