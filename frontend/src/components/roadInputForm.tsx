'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { useShipmentAutorun } from '@/hooks/useShipmentAutorun';
import { searchCities, type StationSearchResult } from '@/services/api';
import AiBriefPanel from '@/components/AiBriefPanel';
import { useIntentFormReset } from '@/hooks/useIntentFormReset';
import {
  AdvancedToggle,
  ChoicePills,
  CorridorRow,
  FormField,
  FormShell,
  FormSubmit,
  LOGIFLOW_FORM_IDS,
  formInputClass,
  formLabelClass,
} from '@/components/forms/pipeline-form-ui';

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <div ref={wrapperRef} className="relative z-[50]">
      <span className={`mb-1.5 block ${formLabelClass}`}>
        {label}
        {loading && <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-live" />}
      </span>

      <div className="relative">
        <div className="relative flex items-center">
          <span
            className="pointer-events-none absolute left-3 material-symbols-outlined text-muted-foreground"
            style={{ fontSize: '18px' }}
          >
            {icon}
          </span>
          <input
            type="text"
            value={value}
            onChange={e => handleChange(e.target.value)}
            onFocus={() => {
              setFocused(true);
              if (results.length) setShowDropdown(true);
            }}
            onBlur={() => setFocused(false)}
            className={`${formInputClass} pl-10 pr-9 ${hasError ? 'border-risk/50' : ''}`}
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

// ── Stop Input ────────────────────────────────────────────────────────

function StopInput({
  index,
  value,
  totalStops,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  value: string;
  totalStops: number;
  onChange: (val: string) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
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

  return (
    <div ref={wrapperRef} className="relative flex items-center gap-1.5">
      {/* Reorder buttons */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!onMoveUp}
          className="w-5 h-5 rounded flex items-center justify-center text-outline hover:text-on-surface disabled:opacity-20 transition-colors"
          aria-label="Move stop up"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>keyboard_arrow_up</span>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!onMoveDown}
          className="w-5 h-5 rounded flex items-center justify-center text-outline hover:text-on-surface disabled:opacity-20 transition-colors"
          aria-label="Move stop down"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>keyboard_arrow_down</span>
        </button>
      </div>

      {/* Stop badge */}
      <span className="shrink-0 w-5 h-5 rounded-full bg-surface-container text-outline text-[9px] font-bold mono flex items-center justify-center border border-outline-variant/20">
        {index + 1}
      </span>

      {/* Input */}
      <div className="flex-1 relative">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline"
          style={{ fontSize: '14px' }}
        >
          place
        </span>
        <input
          type="text"
          value={value}
          onChange={e => {
            onChange(e.target.value);
            search(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => { if (results.length) setShowDropdown(true); }}
          onBlur={() => setShowDropdown(false)}
          placeholder={`Stop ${index + 1}`}
          className={`${formInputClass} pl-8 pr-7 py-2.5 text-[12px]`}
        />
        {loading && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
        )}
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-error/10 transition-all"
        aria-label={`Remove stop ${index + 1}`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
      </button>

      {/* Autocomplete dropdown */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-[99999] top-full left-7 right-7 mt-1 overflow-hidden rounded-xl border border-border bg-surface/95 shadow-xl backdrop-blur-xl">
          <div className="max-h-[160px] overflow-y-auto p-1">
            {results.map((s, i) => (
              <button
                key={`${s.name}-${i}`}
                type="button"
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface-container/80 text-left text-[12px]"
                onMouseDown={e => {
                  e.preventDefault();
                  onChange(s.name);
                  clear();
                  setShowDropdown(false);
                }}
              >
                <span className="material-symbols-outlined text-outline" style={{ fontSize: '13px' }}>
                  place
                </span>
                <span className="truncate text-on-surface">{s.name}</span>
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
    roadStops, addRoadStop, removeRoadStop, updateRoadStop, reorderRoadStops,
    optimizeStopOrder, setOptimizeStopOrder,
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
  const sameCityRouteError = 'Source and destination cannot be the same city.';
  const isSameCityRoute =
    source.trim() && destination.trim() && source.trim().toLowerCase() === destination.trim().toLowerCase();

  const runRoadOptimize = useCallback(() => {
    if (!source.trim() || !destination.trim()) return;
    if (isSameCityRoute) {
      setError(sameCityRouteError);
      return;
    }
    setError(null);
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
  }, [
    source,
    destination,
    handleOptimize,
    simulationMode,
    simTraffic,
    simWeather,
    simIncidents,
    isSameCityRoute,
  ]);

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

  useShipmentAutorun('road', runRoadOptimize, Boolean(source.trim() && destination.trim()));

  const onIntentApplied = useIntentFormReset(() => {});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.trim() || !destination.trim()) {
      setError('Source and destination are required');
      return;
    }
    if (isSameCityRoute) {
      setError(sameCityRouteError);
      return;
    }
    if (cargoWeight <= 0) {
      setError('Cargo weight must be greater than 0');
      return;
    }
    setError(null);
    runRoadOptimize();
  };

  return (
    <div id="logiflow-pipeline-form" className="w-full space-y-4 scroll-mt-24">
      <AiBriefPanel contextMode="road" onIntentApplied={onIntentApplied} />
      <FormShell
        mode="road"
        title="Road route search"
        subtitle="Traffic-aware routing · tolls · ML risk scoring"
        advancedToggle={
          <AdvancedToggle
            open={showAdvanced}
            onToggle={() => setShowAdvanced((v) => !v)}
            accentVar="--road"
          />
        }
        footer={
          <FormSubmit
            formId={LOGIFLOW_FORM_IDS.road}
            loading={loading}
            disabled={!source.trim() || !destination.trim()}
            label="Find optimal routes"
            loadingLabel="Finding routes…"
            accentVar="--road"
            icon="local_shipping"
          />
        }
      >
        <form id={LOGIFLOW_FORM_IDS.road} onSubmit={handleSubmit} className="space-y-5">
            {/* Origin / Destination */}
            <div
              className={`relative z-[100] transition-all duration-600 ${
                formStep >= 1
                  ? 'pointer-events-auto opacity-100 translate-y-0'
                  : 'pointer-events-none opacity-0 translate-y-3'
              }`}
            >
              <CorridorRow
                accentVar="--road"
                swapDisabled={!source.trim() && !destination.trim()}
                onSwap={() => {
                  const t = source;
                  setSource(destination);
                  setDestination(t);
                }}
              >
                <LocationInput
                  label="Pickup Location"
                  value={source}
                  onChange={setSource}
                  icon="my_location"
                  iconColor="text-primary"
                  placeholder="Search city..."
                  hasError={!!error && (isSameCityRoute || !source.trim())}
                />
                <LocationInput
                  label="Delivery Location"
                  value={destination}
                  onChange={setDestination}
                  icon="flag"
                  iconColor="text-tertiary"
                  placeholder="Search city..."
                  hasError={!!error && (isSameCityRoute || !destination.trim())}
                />
              </CorridorRow>
              {error && (
                <p className="text-[11px] text-error mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                    error
                  </span>
                  {error}
                </p>
              )}
            </div>

            {/* ── Intermediate Stops ─────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] ml-0.5">
                  Intermediate Stops
                  {roadStops.length > 0 && (
                    <span className="ml-1.5 text-primary normal-case font-normal">
                      ({roadStops.length})
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => addRoadStop('')}
                  disabled={roadStops.length >= 10}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add_circle</span>
                  Add stop
                </button>
              </div>

              {/* Helper text — always visible */}
              <p className="text-[10px] text-outline leading-relaxed">
                Add intermediate stops to create a multi-stop shipment route. You may add, remove,
                or rearrange stops manually. Enable Auto-Optimise to let LogiFlow reorder stops for
                better cost, time, and risk performance.
              </p>

              {roadStops.length > 0 && (
                <div className="space-y-1.5">
                  {roadStops.map((stop, idx) => (
                    <StopInput
                      key={idx}
                      index={idx}
                      value={stop}
                      totalStops={roadStops.length}
                      onChange={(val) => updateRoadStop(idx, val)}
                      onRemove={() => removeRoadStop(idx)}
                      onMoveUp={idx > 0 ? () => {
                        const next = [...roadStops];
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        reorderRoadStops(next);
                      } : undefined}
                      onMoveDown={idx < roadStops.length - 1 ? () => {
                        const next = [...roadStops];
                        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                        reorderRoadStops(next);
                      } : undefined}
                    />
                  ))}
                </div>
              )}

              {roadStops.length > 1 && (
                <div className="space-y-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setOptimizeStopOrder(!optimizeStopOrder)}
                    className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg border transition-all duration-200 ${
                      optimizeStopOrder
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-surface-container-lowest/20 border-outline-variant/15 text-on-surface-variant hover:border-outline-variant/30'
                    }`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                      route
                    </span>
                    Auto-Optimise stop order
                  </button>
                  {optimizeStopOrder ? (
                    <p className="text-[9px] text-primary/70 leading-relaxed pl-0.5">
                      LogiFlow may rearrange stop order to produce a more efficient route.
                      The final sequence will be shown in results.
                    </p>
                  ) : (
                    <p className="text-[9px] text-outline/60 leading-relaxed pl-0.5">
                      Stops will be visited in the order you entered.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Weight + Date */}
            <div
              className={`grid grid-cols-2 gap-4 transition-all duration-600 delay-75 ${
                formStep >= 2
                  ? 'pointer-events-auto opacity-100 translate-y-0'
                  : 'pointer-events-none opacity-0 translate-y-3'
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

            <FormField label="Cargo type">
              <ChoicePills
                options={CARGO_TYPES.map((ct) => ({
                  value: ct.value,
                  label: ct.value,
                  icon: ct.icon,
                }))}
                value={cargoType}
                onChange={setCargoType}
                accentVar="--road"
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
                accentVar="--road"
              />
            </FormField>

            {/* Route preferences */}
            <div
              className={`transition-all duration-600 delay-150 ${
                formStep >= 4
                  ? 'pointer-events-auto opacity-100 translate-y-0'
                  : 'pointer-events-none opacity-0 translate-y-3'
              }`}
            >
              <label className="block text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-[0.14em] mb-2.5 ml-0.5">
                Route Preferences
              </label>
              <div className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-3">
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          </form>
      </FormShell>
    </div>
  );
}
