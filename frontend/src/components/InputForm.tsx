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
import {
  DEFAULT_RAIL_SIMULATION,
  RAIL_SEASON_OPTIONS,
  RAIL_SIMULATION_PRESETS,
  type RailSeason,
  type RailSimulationParams,
  type RailWeatherCondition,
} from '@/lib/railSimulation';

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
  const [simulationMode, setSimulationMode] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [simParams, setSimParams] = useState<RailSimulationParams>(DEFAULT_RAIL_SIMULATION);

  const updateSim = useCallback(
    (
      patch: Omit<Partial<RailSimulationParams>, 'weather'> & {
        weather?: Partial<RailSimulationParams['weather']>;
      }
    ) => {
      setSimParams((prev) => ({
        ...prev,
        ...patch,
        weather: patch.weather ? { ...prev.weather, ...patch.weather } : prev.weather,
      }));
      setActivePreset(null);
    },
    []
  );

  const runRailOptimize = useCallback(() => {
    if (!source.trim() || !destination.trim()) return;
    handleOptimize({
      mode: 'rail',
      simulation_mode: simulationMode,
      rail_simulation: simulationMode ? simParams : undefined,
    });
  }, [source, destination, handleOptimize, simulationMode, simParams]);

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
        subtitle="LogiFlow · real Indian Railways data"
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
            label={simulationMode ? 'Run simulation' : 'Optimize route'}
            loadingLabel={simulationMode ? 'Simulating…' : 'Finding routes…'}
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

          <div className="mt-2 border border-outline-variant/20 rounded-xl p-4 bg-surface-container-lowest/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-on-surface-variant uppercase">
                Simulation Mode
              </span>
              <input
                type="checkbox"
                checked={simulationMode}
                onChange={(e) => setSimulationMode(e.target.checked)}
              />
            </div>

            {simulationMode && (
              <>
                <div className="mb-4">
                  <label className="text-[11px] text-on-surface-variant mb-2 block">
                    Scenario Presets
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {RAIL_SIMULATION_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setSimulationMode(true);
                          setActivePreset(preset.name);
                          setSimParams(preset.params);
                        }}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                          activePreset === preset.name
                            ? 'bg-rail/20 border-rail text-rail'
                            : 'border-outline-variant/20 bg-surface-container hover:bg-rail/10'
                        }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                <FormField label="Season">
                  <ChoicePills
                    options={RAIL_SEASON_OPTIONS.map((s) => ({
                      value: s.value,
                      label: s.label,
                      icon: 'calendar_month',
                    }))}
                    value={simParams.season}
                    onChange={(v) => updateSim({ season: v as RailSeason })}
                    accentVar="--rail"
                  />
                </FormField>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label={`Yard congestion · ${Math.round(simParams.congestion_level * 100)}%`}
                  >
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={simParams.congestion_level}
                      onChange={(e) =>
                        updateSim({ congestion_level: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </FormField>
                  <FormField label={`Departure hour · ${simParams.departure_hour}:00`}>
                    <input
                      type="range"
                      min={0}
                      max={23}
                      step={1}
                      value={simParams.departure_hour}
                      onChange={(e) =>
                        updateSim({ departure_hour: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </FormField>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label={`Rain · ${simParams.weather.rain} mm`}>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={1}
                      value={simParams.weather.rain}
                      onChange={(e) =>
                        updateSim({
                          weather: { rain: Number(e.target.value) },
                        })
                      }
                      className="w-full"
                    />
                  </FormField>
                  <FormField label={`Temperature · ${simParams.weather.temp}°C`}>
                    <input
                      type="range"
                      min={5}
                      max={45}
                      step={1}
                      value={simParams.weather.temp}
                      onChange={(e) =>
                        updateSim({
                          weather: { temp: Number(e.target.value) },
                        })
                      }
                      className="w-full"
                    />
                  </FormField>
                  <FormField label="Weather condition">
                    <select
                      value={simParams.weather.condition}
                      onChange={(e) =>
                        updateSim({
                          weather: {
                            condition: e.target.value as RailWeatherCondition,
                          },
                        })
                      }
                      className={formInputClass}
                    >
                      <option value="Clear">Clear</option>
                      <option value="Clouds">Clouds</option>
                      <option value="Fog">Fog</option>
                      <option value="Rain">Rain</option>
                      <option value="Thunderstorm">Thunderstorm</option>
                    </select>
                  </FormField>
                </div>
              </>
            )}
          </div>
        </form>
      </FormShell>
    </div>
  );
}
