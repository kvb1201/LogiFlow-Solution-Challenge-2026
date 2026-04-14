'use client';

import React, { useState } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

const CARGO_TYPES = [
  { value: 'General', icon: 'inventory_2', note: 'Standard airport cargo handling' },
  { value: 'Fragile', icon: 'package_2', note: 'Prefers fewer transfers and reinforced handling' },
  { value: 'Perishable', icon: 'ac_unit', note: 'Cold-chain bias toward direct uplift' },
];

const PRIORITY_OPTIONS = [
  { value: 'cost', label: 'Lower Cost', icon: 'savings' },
  { value: 'time', label: 'Faster ETA', icon: 'bolt' },
  { value: 'safe', label: 'Lower Risk', icon: 'shield' },
];

const MAX_STOPS_HINT: Record<string, string> = {
  General: 'Up to 2 stops are acceptable for general cargo.',
  Fragile: 'Fragile cargo is capped to 1 stop for safer handling.',
  Perishable: 'Perishable cargo is forced to direct-first routing.',
};

export default function AirInputForm() {
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

  const [showAdvanced, setShowAdvanced] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="w-full overflow-x-hidden min-h-fit">
      <div className="form-container-glow relative w-full">
        <div className="absolute -inset-1 bg-gradient-to-r from-secondary/20 via-primary/10 to-tertiary/20 rounded-3xl blur-xl opacity-50 pointer-events-none" />
        <div className="relative flex flex-col bg-surface-container-low/85 backdrop-blur-2xl border border-outline-variant/15 rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1 w-full shrink-0 bg-gradient-to-r from-transparent via-secondary to-transparent animate-shimmer" />
          <div className="p-5 sm:p-7 md:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-700 opacity-100 translate-y-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-secondary/15 border border-secondary/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-secondary text-xl">flight</span>
                </div>
                <div>
                  <h2 className="text-xl font-headline font-bold text-on-surface tracking-tight">Air Cargo</h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">Flight-based optimization with cargo business rules, route support confidence, and cost breakdowns</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvanced((value) => !value)}
                className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-secondary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-container border border-transparent hover:border-outline-variant/20"
              >
                <span className="material-symbols-outlined text-sm">{showAdvanced ? 'unfold_less' : 'tune'}</span>
                {showAdvanced ? 'Less' : 'Advanced'}
              </button>
            </div>

            <form
              className="mt-6 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!source.trim() || !destination.trim()) return;
                handleOptimize({ mode: 'air' });
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Origin City</span>
                  <input
                    type="text"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="Delhi"
                    className="w-full px-4 py-3.5 border border-outline-variant/20 rounded-xl bg-surface-container-lowest/50 focus:border-secondary/50 focus:ring-2 focus:ring-secondary/20 text-on-surface transition-all outline-none text-sm"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Destination City</span>
                  <input
                    type="text"
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder="Mumbai"
                    className="w-full px-4 py-3.5 border border-outline-variant/20 rounded-xl bg-surface-container-lowest/50 focus:border-secondary/50 focus:ring-2 focus:ring-secondary/20 text-on-surface transition-all outline-none text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="block">
                  <span className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Cargo Weight</span>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      value={cargoWeight}
                      onChange={(event) => setCargoWeight(Number(event.target.value))}
                      className="w-full pl-4 pr-12 py-3.5 border border-outline-variant/20 rounded-xl bg-surface-container-lowest/50 focus:border-secondary/50 focus:ring-2 focus:ring-secondary/20 text-on-surface transition-all outline-none text-sm"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-outline mono">kg</span>
                  </div>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Departure Date</span>
                  <input
                    type="date"
                    min={today}
                    value={departureDate}
                    onChange={(event) => setDepartureDate(event.target.value)}
                    className="w-full px-4 py-3.5 border border-outline-variant/20 rounded-xl bg-surface-container-lowest/50 focus:border-secondary/50 focus:ring-2 focus:ring-secondary/20 text-on-surface transition-all outline-none text-sm"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">Delivery Window</span>
                  <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest/50 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <input
                        type="range"
                        min={4}
                        max={72}
                        step={2}
                        value={deadlineHours}
                        onChange={(event) => setDeadlineHours(Number(event.target.value))}
                        className="w-full"
                      />
                      <span className="mono text-sm text-secondary shrink-0">{deadlineHours}h</span>
                    </div>
                  </div>
                </label>
              </div>

              <div>
                <div className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">Cargo Type</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {CARGO_TYPES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCargoType(option.value)}
                      className={`text-left p-4 rounded-xl border transition-all duration-300 ${cargoType === option.value ? 'bg-secondary/10 border-secondary/40 shadow-md shadow-secondary/10' : 'bg-surface-container-lowest/30 border-outline-variant/10 hover:border-outline-variant/30 hover:bg-surface-container/50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-lg ${cargoType === option.value ? 'text-secondary' : 'text-outline'}`}>{option.icon}</span>
                        <span className="text-sm font-semibold text-on-surface">{option.value}</span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant mt-2 leading-relaxed">{option.note}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-secondary/90 mt-3">{MAX_STOPS_HINT[cargoType] ?? MAX_STOPS_HINT.General}</p>
              </div>

              <div>
                <div className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">Optimization Priority</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {PRIORITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPriority(option.value)}
                      className={`flex items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-300 ${priority === option.value ? 'bg-gradient-to-b from-secondary/20 to-secondary/5 border-secondary/40 shadow-lg' : 'bg-surface-container-lowest/30 border-outline-variant/10 hover:border-outline-variant/30'}`}
                    >
                      <span className={`material-symbols-outlined text-lg ${priority === option.value ? 'text-secondary' : 'text-outline'}`}>{option.icon}</span>
                      <span className="text-sm font-semibold text-on-surface">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out ${showAdvanced ? 'max-h-[220px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-label font-semibold uppercase tracking-widest text-on-surface-variant">Budget Cap</span>
                      <span className="mono text-secondary text-sm">INR {budgetMax.toLocaleString()}</span>
                    </div>
                    <input
                      type="range"
                      min={5000}
                      max={150000}
                      step={1000}
                      value={budgetMax}
                      onChange={(event) => setBudgetMax(Number(event.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest/30 p-4">
                    <div className="text-[11px] font-label font-semibold uppercase tracking-widest text-on-surface-variant mb-2">Rule Preview</div>
                    <p className="text-sm text-on-surface leading-relaxed">
                      {cargoType} cargo at {cargoWeight}kg will use airport handling surcharges, transfer-based risk penalties, and a support-confidence score before ranking routes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-outline-variant/15 pt-4">
                <button
                  type="submit"
                  disabled={loading || !source.trim() || !destination.trim()}
                  className="w-full py-3.5 rounded-xl transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed bg-secondary text-on-secondary-container font-semibold hover:opacity-95 shadow-lg shadow-secondary/10"
                >
                  <span className={`material-symbols-outlined text-xl ${loading ? 'animate-spin' : ''}`}>{loading ? 'progress_activity' : 'flight_takeoff'}</span>
                  <span className="text-sm tracking-wide">{loading ? 'Evaluating Air Routes...' : 'Optimize Air Cargo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
