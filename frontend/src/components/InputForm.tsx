'use client';

import { useCallback, useRef, useState } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { useShipmentAutorun } from '@/hooks/useShipmentAutorun';
import { searchStations, type StationSearchResult } from '@/services/api';
import AiBriefPanel from '@/components/AiBriefPanel';
import { FormAutocomplete } from '@/components/forms/FormAutocomplete';
import {
  AdvancedToggle,
  ChoicePills,
  CorridorRow,
  FormField,
  FormShell,
  FormSubmit,
  LOGIFLOW_FORM_IDS,
  formInputClass,
} from '@/components/forms/pipeline-form-ui';

function useStationSearch(setGlobalSuggestions: (rows: StationSearchResult[]) => void) {
  const [results, setResults] = useState<StationSearchResult[]>([]);
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

const CARGO_TYPES = [
  { value: 'General' as const, label: 'General', icon: 'inventory_2' },
  { value: 'Fragile' as const, label: 'Fragile', icon: 'local_shipping' },
  { value: 'Perishable' as const, label: 'Perishable', icon: 'ac_unit' },
];

const PRIORITY_OPTIONS = [
  { value: 'cost' as const, label: 'Cheapest', icon: 'savings' },
  { value: 'time' as const, label: 'Fastest', icon: 'bolt' },
  { value: 'safe' as const, label: 'Safest', icon: 'verified_user' },
];

export default function InputForm() {
  const {
    source,
    setSource,
    destination,
    setDestination,
    priority,
    setPriority,
    cargoWeight,
    setCargoWeight,
    cargoType,
    setCargoType,
    departureDate,
    setDepartureDate,
    budgetMax,
    setBudgetMax,
    deadlineHours,
    setDeadlineHours,
    handleOptimize,
    loading,
  } = useLogiFlowStore();

  const setStationSuggestions = useLogiFlowStore((s) => s.setStationSuggestions);
  const originSearch = useStationSearch(setStationSuggestions);
  const destSearch = useStationSearch(setStationSuggestions);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const runRailOptimize = useCallback(() => {
    if (!source.trim() || !destination.trim()) return;
    handleOptimize();
  }, [source, destination, handleOptimize]);

  useShipmentAutorun('rail', runRailOptimize, Boolean(source.trim() && destination.trim()));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.trim() || !destination.trim()) return;
    runRailOptimize();
  };

  const swapCorridor = () => {
    const t = source;
    setSource(destination);
    setDestination(t);
  };

  return (
    <div className="w-full space-y-4">
      <AiBriefPanel contextMode="rail" />
      <FormShell
        mode="rail"
        title="Route search"
        subtitle="RailRadar · live Indian Railways data"
        advancedToggle={
          <AdvancedToggle
            open={showAdvanced}
            onToggle={() => setShowAdvanced((v) => !v)}
            accentVar="--rail"
          />
        }
        footer={
          <FormSubmit
            formId={LOGIFLOW_FORM_IDS.rail}
            loading={loading}
            disabled={!source.trim() || !destination.trim()}
            label="Optimize route"
            loadingLabel="Finding routes…"
            accentVar="--rail"
            icon="train"
          />
        }
      >
        <form id={LOGIFLOW_FORM_IDS.rail} onSubmit={handleSubmit} className="space-y-5">
          <CorridorRow onSwap={swapCorridor}>
            <FormAutocomplete
              label="Origin"
              value={source}
              onChange={setSource}
              placeholder="City or station"
              icon="trip_origin"
              accentVar="--rail"
              options={originSearch.results}
              loading={originSearch.loading}
              onSearch={originSearch.search}
              onClear={originSearch.clear}
              dropdownIcon={
                <span className="material-symbols-outlined text-rail" style={{ fontSize: '16px' }}>
                  train
                </span>
              }
            />
            <FormAutocomplete
              label="Destination"
              value={destination}
              onChange={setDestination}
              placeholder="City or station"
              icon="location_on"
              accentVar="--rail"
              options={destSearch.results}
              loading={destSearch.loading}
              onSearch={destSearch.search}
              onClear={destSearch.clear}
              dropdownIcon={
                <span className="material-symbols-outlined text-rail" style={{ fontSize: '16px' }}>
                  train
                </span>
              }
            />
          </CorridorRow>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Cargo weight">
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={cargoWeight}
                  onChange={(e) => setCargoWeight(Number(e.target.value))}
                  className={`${formInputClass} pr-12`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                  kg
                </span>
              </div>
            </FormField>
            <FormField label="Departure date">
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className={formInputClass}
              />
            </FormField>
          </div>

          <FormField label="Cargo type">
            <ChoicePills
              options={CARGO_TYPES}
              value={cargoType as (typeof CARGO_TYPES)[number]['value']}
              onChange={(v) => setCargoType(v)}
              accentVar="--rail"
            />
          </FormField>

          <FormField label="Priority">
            <ChoicePills
              options={PRIORITY_OPTIONS}
              value={priority as (typeof PRIORITY_OPTIONS)[number]['value']}
              onChange={(v) => setPriority(v)}
              accentVar="--rail"
            />
          </FormField>

          <div
            className={`grid gap-4 overflow-hidden transition-all duration-300 sm:grid-cols-2 ${
              showAdvanced ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
            }`}
          >
            <FormField label={`Budget cap · ₹${budgetMax.toLocaleString('en-IN')}`}>
              <input
                type="range"
                min={5000}
                max={100000}
                step={1000}
                value={budgetMax}
                onChange={(e) => setBudgetMax(Number(e.target.value))}
                className="w-full"
              />
            </FormField>
            <FormField label={`Deadline · ${deadlineHours}h`}>
              <input
                type="range"
                min={4}
                max={96}
                step={2}
                value={deadlineHours}
                onChange={(e) => setDeadlineHours(Number(e.target.value))}
                className="w-full"
              />
            </FormField>
          </div>
        </form>
      </FormShell>
    </div>
  );
}
