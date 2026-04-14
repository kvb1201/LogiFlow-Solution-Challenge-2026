'use client';

import React, { useState } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

const CARGO_TYPES = [
  { value: 'General', label: 'General' },
  { value: 'Fragile', label: 'Fragile' },
  { value: 'Perishable', label: 'Perishable' },
];

const PRIORITIES = [
  { value: 'cost', label: 'Cheapest' },
  { value: 'time', label: 'Fastest' },
  { value: 'safe', label: 'Safest' },
];

export default function WaterInputForm() {
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
    budgetMax,
    setBudgetMax,
    handleOptimize,
    loading,
  } = useLogiFlowStore();

  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
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
    <form
      onSubmit={onSubmit}
      className="bg-surface-container-low/70 border border-outline-variant/20 rounded-2xl p-6 shadow-xl"
    >
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-bold">Water (Maritime) Routing</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Generates port-based routes with transshipment options.
          </p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold disabled:opacity-60"
        >
          {loading ? 'Optimizing…' : 'Optimize'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
            Source City
          </label>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g., Surat"
            className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-outline-variant/30 focus:outline-none focus:border-primary/60"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
            Destination City
          </label>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g., Mumbai"
            className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-outline-variant/30 focus:outline-none focus:border-primary/60"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-outline-variant/30 focus:outline-none focus:border-primary/60"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
            Cargo Type
          </label>
          <select
            value={cargoType}
            onChange={(e) => setCargoType(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-outline-variant/30 focus:outline-none focus:border-primary/60"
          >
            {CARGO_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
            Cargo Weight (kg)
          </label>
          <input
            type="number"
            min={1}
            value={cargoWeight}
            onChange={(e) => setCargoWeight(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-outline-variant/30 focus:outline-none focus:border-primary/60"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
            Budget (INR)
          </label>
          <input
            type="number"
            min={0}
            value={budgetMax}
            onChange={(e) => setBudgetMax(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-outline-variant/30 focus:outline-none focus:border-primary/60"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-error/10 border border-error/20 px-4 py-3 rounded-xl text-sm text-error flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
        </div>
      )}
    </form>
  );
}

