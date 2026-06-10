'use client';

import { useCallback, useState } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { useShipmentAutorun } from '@/hooks/useShipmentAutorun';
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
} from '@/components/forms/pipeline-form-ui';

const CARGO_TYPES = [
  { value: 'General' as const, label: 'General', icon: 'inventory_2' },
  { value: 'Fragile' as const, label: 'Fragile', icon: 'package_2' },
  { value: 'Perishable' as const, label: 'Perishable', icon: 'ac_unit' },
];

const PRIORITY_OPTIONS = [
  { value: 'cost' as const, label: 'Lower cost', icon: 'savings' },
  { value: 'time' as const, label: 'Faster', icon: 'bolt' },
  { value: 'safe' as const, label: 'Lower risk', icon: 'shield' },
];

export default function AirInputForm() {
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

  const [showAdvanced, setShowAdvanced] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const runAirOptimize = useCallback(() => {
    if (!source.trim() || !destination.trim()) return;
    handleOptimize({ mode: 'air' });
  }, [source, destination, handleOptimize]);

  useShipmentAutorun('air', runAirOptimize, Boolean(source.trim() && destination.trim()));

  const onIntentApplied = useIntentFormReset(() => {});

  return (
    <div id="logiflow-pipeline-form" className="w-full space-y-4 scroll-mt-24 rounded-2xl transition-shadow">
      <AiBriefPanel contextMode="air" onIntentApplied={onIntentApplied} />
      <FormShell
        mode="air"
        title="Air cargo search"
        subtitle="Airport pairs · cargo rules · cut-offs and confidence scoring"
        advancedToggle={
          <AdvancedToggle
            open={showAdvanced}
            onToggle={() => setShowAdvanced((v) => !v)}
            accentVar="--air"
          />
        }
        footer={
          <FormSubmit
            formId={LOGIFLOW_FORM_IDS.air}
            loading={loading}
            disabled={!source.trim() || !destination.trim()}
            label="Optimize air route"
            loadingLabel="Evaluating corridors…"
            accentVar="--air"
            icon="flight_takeoff"
          />
        }
      >
        <form
          id={LOGIFLOW_FORM_IDS.air}
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            runAirOptimize();
          }}
        >
          <CorridorRow
            accentVar="--air"
            swapDisabled={!source.trim() && !destination.trim()}
            onSwap={() => {
              const t = source;
              setSource(destination);
              setDestination(t);
            }}
          >
            <FormField label="Origin city">
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Delhi"
                className={formInputClass}
              />
            </FormField>
            <FormField label="Destination city">
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Mumbai"
                className={formInputClass}
              />
            </FormField>
          </CorridorRow>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Weight">
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={cargoWeight}
                  onChange={(e) => setCargoWeight(Number(e.target.value))}
                  className={`${formInputClass} pr-10`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  kg
                </span>
              </div>
            </FormField>
            <FormField label="Departure">
              <input
                type="date"
                min={today}
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className={formInputClass}
              />
            </FormField>
            <FormField label={`Window · ${deadlineHours}h`}>
              <input
                type="range"
                min={4}
                max={72}
                step={2}
                value={deadlineHours}
                onChange={(e) => setDeadlineHours(Number(e.target.value))}
                className="mt-4 w-full"
              />
            </FormField>
          </div>

          <FormField label="Cargo type">
            <ChoicePills
              options={CARGO_TYPES}
              value={cargoType as (typeof CARGO_TYPES)[number]['value']}
              onChange={setCargoType}
              accentVar="--air"
            />
          </FormField>

          <FormField label="Priority">
            <ChoicePills
              options={PRIORITY_OPTIONS}
              value={priority as (typeof PRIORITY_OPTIONS)[number]['value']}
              onChange={setPriority}
              accentVar="--air"
            />
          </FormField>

          <div
            className={`overflow-hidden transition-all duration-300 ${
              showAdvanced ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
            }`}
          >
            <FormField label={`Budget · ₹${budgetMax.toLocaleString('en-IN')}`}>
              <input
                type="range"
                min={5000}
                max={150000}
                step={1000}
                value={budgetMax}
                onChange={(e) => setBudgetMax(Number(e.target.value))}
                className="w-full"
              />
            </FormField>
          </div>
        </form>
      </FormShell>
    </div>
  );
}
