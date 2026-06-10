'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { useShipmentAutorun } from '@/hooks/useShipmentAutorun';
import { useWaterPortCatalog } from '@/hooks/useWaterPortCatalog';
import AiBriefPanel from '@/components/AiBriefPanel';
import { useIntentFormReset } from '@/hooks/useIntentFormReset';
import { hasShipmentAutorunPending } from '@/lib/shipmentAutorun';
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
import {
  filterWaterPorts,
  resolveWaterPort,
  validateWaterPortSelection,
  type WaterPortOption,
} from '@/lib/water-port-catalog';

const DROPDOWN_LIMIT = 25;

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
  portId,
  ports,
  catalogLoading,
  onChange,
  onPortIdChange,
  icon,
  iconColor,
  placeholder,
  hasError,
}: {
  label: string;
  value: string;
  portId: string | null;
  ports: WaterPortOption[];
  catalogLoading: boolean;
  onChange: (val: string) => void;
  onPortIdChange: (id: string | null) => void;
  icon: string;
  iconColor: string;
  placeholder: string;
  hasError?: boolean;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const setStationSuggestions = useLogiFlowStore((s) => s.setStationSuggestions);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => filterWaterPorts(ports, query || value, DROPDOWN_LIMIT),
    [ports, query, value],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!showDropdown) return;
    setStationSuggestions(
      results.map((r) => ({ code: r.id.toUpperCase(), name: r.name })),
    );
  }, [results, setStationSuggestions, showDropdown]);

  const handleChange = (val: string) => {
    onChange(val);
    onPortIdChange(null);
    setQuery(val);
    setShowDropdown(true);
  };

  const selectLocation = (location: WaterPortOption) => {
    onChange(location.name);
    onPortIdChange(location.id);
    setQuery('');
    setStationSuggestions([]);
    setShowDropdown(false);
  };

  const clearInput = () => {
    onChange('');
    onPortIdChange(null);
    setQuery('');
    setStationSuggestions([]);
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative z-[50]">
      <span className={`mb-1.5 block ${formLabelClass}`}>
        {label}
        {catalogLoading && (
          <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
        )}
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
              if (ports.length) setShowDropdown(true);
            }}
            disabled={catalogLoading}
            className={`${formInputClass} pl-10 pr-9 ${hasError ? 'border-risk/50' : ''}`}
            placeholder={catalogLoading ? 'Loading ports…' : placeholder}
          />
          {value && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                clearInput();
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
          <div className="max-h-[280px] overflow-y-auto p-1.5">
            {results.map((s) => (
              <button
                key={s.id}
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
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-outline">
                    <span>{s.region}</span>
                    {!s.routable && (
                      <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300 normal-case tracking-normal">
                        Not routed yet
                      </span>
                    )}
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

      {portId && resolveWaterPort(ports, value, portId)?.routable && (
        <p className="mt-1 text-[10px] text-teal-400/80 mono">{portId}</p>
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
    departureDate, setDepartureDate,
    handleOptimize,
    loading,
  } = useLogiFlowStore();

  const { ports, total, routable, regions, loading: catalogLoading, error: catalogError } =
    useWaterPortCatalog();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxTransshipments, setMaxTransshipments] = useState<number | null>(null);
  const [sourcePortId, setSourcePortId] = useState<string | null>(null);
  const [destinationPortId, setDestinationPortId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolvedSourcePort = useMemo(
    () => resolveWaterPort(ports, source, sourcePortId),
    [ports, source, sourcePortId],
  );
  const resolvedDestinationPort = useMemo(
    () => resolveWaterPort(ports, destination, destinationPortId),
    [ports, destination, destinationPortId],
  );
  const effectiveSourcePortId = resolvedSourcePort?.id ?? sourcePortId;
  const effectiveDestinationPortId = resolvedDestinationPort?.id ?? destinationPortId;

  const portsReady = Boolean(
    effectiveSourcePortId &&
      effectiveDestinationPortId &&
      resolvedSourcePort?.routable &&
      resolvedDestinationPort?.routable,
  );

  const validatePorts = useCallback((): string | null => {
    const originError = validateWaterPortSelection(ports, source, sourcePortId, 'Origin port');
    if (originError) return originError;
    const destError = validateWaterPortSelection(
      ports,
      destination,
      destinationPortId,
      'Destination port',
    );
    if (destError) return destError;
    return null;
  }, [ports, source, destination, sourcePortId, destinationPortId]);

  const runWaterOptimize = useCallback(() => {
    const portError = validatePorts();
    if (portError) {
      setError(portError);
      return;
    }
    if (!source.trim() || !destination.trim()) return;
    setError(null);
    handleOptimize({
      mode: 'water',
      water: {
        max_transshipments: maxTransshipments,
        source_port_id: effectiveSourcePortId,
        destination_port_id: effectiveDestinationPortId,
      },
    });
  }, [
    source,
    destination,
    handleOptimize,
    maxTransshipments,
    effectiveSourcePortId,
    effectiveDestinationPortId,
    validatePorts,
  ]);

  useShipmentAutorun('water', runWaterOptimize, portsReady);

  const onIntentApplied = useIntentFormReset(() => {});
  const autorunWaitingForPorts =
    hasShipmentAutorunPending('water') && !portsReady && Boolean(source.trim() && destination.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.trim() || !destination.trim()) {
      setError('Source and destination are required');
      return;
    }
    if (source.trim().toLowerCase() === destination.trim().toLowerCase()) {
      setError('Source and destination cannot be the same city.');
      return;
    }
    if (cargoWeight <= 0) {
      setError('Cargo weight must be greater than 0');
      return;
    }
    const portError = validatePorts();
    if (portError) {
      setError(portError);
      return;
    }
    setError(null);
    runWaterOptimize();
  };

  const regionTags = useMemo(() => {
    const unique = Array.from(new Set(ports.map((p) => p.region).filter(Boolean))).sort();
    return unique.slice(0, 8);
  }, [ports]);

  return (
    <div id="logiflow-pipeline-form" className="w-full space-y-4 scroll-mt-24">
      <AiBriefPanel contextMode="water" onIntentApplied={onIntentApplied} />
      {autorunWaitingForPorts && (
        <p className="text-xs text-amber-200/90 border border-amber-400/25 bg-amber-500/10 rounded-lg px-3 py-2">
          Resolving ports for your corridor — pick a matching port from the dropdown if autocomplete
          does not match, then run optimize.
        </p>
      )}
      <FormShell
        mode="water"
        title="Maritime route search"
        subtitle={`${total || '…'} ports · ${routable || '…'} routable · ${regions || '…'} regions`}
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
            disabled={!source.trim() || !destination.trim() || cargoWeight <= 0 || catalogLoading || !portsReady}
            label="Find maritime routes"
            loadingLabel="Charting routes…"
            accentVar="--water"
            icon="directions_boat"
          />
        }
      >
        <form id={LOGIFLOW_FORM_IDS.water} onSubmit={handleSubmit} className="space-y-5">
            <div className="relative z-[100] transition-all duration-600 opacity-100 translate-y-0">
              <CorridorRow
                accentVar="--water"
                swapDisabled={!source.trim() && !destination.trim()}
                onSwap={() => {
                  setSource(destination);
                  setDestination(source);
                  setSourcePortId(destinationPortId);
                  setDestinationPortId(sourcePortId);
                }}
              >
                <LocationInput
                  label="Origin port"
                  value={source}
                  portId={effectiveSourcePortId}
                  ports={ports}
                  catalogLoading={catalogLoading}
                  onChange={setSource}
                  onPortIdChange={setSourcePortId}
                  icon="my_location"
                  iconColor="text-teal-400"
                  placeholder="Search port name or code…"
                  hasError={!!error}
                />
                <LocationInput
                  label="Destination port"
                  value={destination}
                  portId={effectiveDestinationPortId}
                  ports={ports}
                  catalogLoading={catalogLoading}
                  onChange={setDestination}
                  onPortIdChange={setDestinationPortId}
                  icon="flag"
                  iconColor="text-cyan-400"
                  placeholder="Search port name or code…"
                  hasError={!!error}
                />
              </CorridorRow>
              {(error || catalogError) && (
                <p className="text-[11px] text-error mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                    error
                  </span>
                  {error || catalogError}
                </p>
              )}
            </div>

            <div className="transition-all duration-600 delay-75 opacity-100 translate-y-0">
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

            <FormField
              label="Departure date"
              hint="Used for real-time marine weather and wave forecasts along the route."
            >
              <div className="relative flex items-center">
                <div className="absolute left-3 w-7 h-7 rounded-lg bg-surface-container/60 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-outline" style={{ fontSize: '14px' }}>
                    calendar_today
                  </span>
                </div>
                <input
                  type="date"
                  value={departureDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 border border-outline-variant/15 rounded-xl bg-surface-container-lowest/50 focus:border-teal-400/40 focus:ring-1 focus:ring-teal-400/20 text-on-surface transition-all outline-none text-sm"
                />
              </div>
            </FormField>

            <div className="rounded-xl border border-teal-400/20 bg-teal-500/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[10px] font-label font-bold uppercase tracking-[0.14em] text-teal-300">
                  Global coverage
                </span>
                <span className="mono text-[10px] text-on-surface-variant">
                  {total || '…'} ports / {routable || '…'} routable
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(regionTags.length ? regionTags : ['Loading…']).map((region) => (
                  <span
                    key={region}
                    className="rounded-full border border-outline-variant/15 bg-surface-container-lowest/35 px-2.5 py-1 text-[10px] font-medium text-on-surface-variant"
                  >
                    {region}
                  </span>
                ))}
              </div>
            </div>

            <FormField
              label="Max transshipments"
              hint="Higher values allow more global lanes, but can increase transit time and route risk."
            >
              <div className="flex items-center gap-2">
                {[null, 0, 1, 2, 3].map((n) => (
                  <button
                    key={n ?? 'auto'}
                    type="button"
                    onClick={() => setMaxTransshipments(n)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold mono transition-all ${
                      maxTransshipments === n
                        ? 'bg-teal-500/15 border-teal-400/40 text-teal-300'
                        : 'bg-surface-container-lowest/30 border-outline-variant/15 text-on-surface-variant hover:border-outline-variant/30'
                    }`}
                  >
                    {n ?? 'Auto'}
                  </button>
                ))}
              </div>
            </FormField>

            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out ${
                showAdvanced ? 'max-h-[160px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
              }`}
            >
              <div className="pt-1 space-y-4">
                <FormField label="Budget cap">
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
                </FormField>
              </div>
            </div>

          </form>
      </FormShell>
    </div>
  );
}
