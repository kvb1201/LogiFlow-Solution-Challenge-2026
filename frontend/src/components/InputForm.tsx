import React, { useEffect } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

export default function InputForm() {
  const {
    source, setSource,
    destination, setDestination,
    priority, setPriority,
    preferredMode, setPreferredMode,
    excludedModes, setExcludedModes,
    handleRecalculate,
    loading
  } = useLogiFlowStore();

  const handleExcludeToggle = (mode: string) => {
    if (excludedModes.includes(mode)) {
      setExcludedModes(excludedModes.filter((m: string) => m !== mode));
    } else {
      setExcludedModes([...excludedModes, mode]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.trim() || !destination.trim()) {
      alert('Please enter both source and destination locations');
      return;
    }
    handleRecalculate();
  };

  const showConstraintWarning = preferredMode !== 'Any' && excludedModes.includes(preferredMode.toLowerCase());

  return (
    <div className="bg-surface-container-low border border-outline-variant/10 rounded-2xl shadow-xl p-6 mb-8 w-full">
      <h2 className="text-xl font-headline font-semibold text-on-surface flex items-center gap-2 mb-5">
        <span className="material-symbols-outlined text-primary">map</span>
        Route Parameters
      </h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-label text-on-surface-variant mb-1.5">Source</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">location_on</span>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-outline-variant/20 rounded-xl bg-surface focus:border-primary focus:ring-1 focus:ring-primary text-on-surface transition-all outline-none"
                placeholder="e.g., Surat, Chennai, Delhi"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-label text-on-surface-variant mb-1.5">Destination</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">flag</span>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-outline-variant/20 rounded-xl bg-surface focus:border-primary focus:ring-1 focus:ring-primary text-on-surface transition-all outline-none"
                placeholder="e.g., Mumbai, Bangalore, Kolkata"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block text-sm font-label text-on-surface-variant mb-1.5">Optimization Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-4 py-2.5 border border-outline-variant/20 rounded-xl bg-surface text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
            >
              <option value="Fast">⚡ Fastest</option>
              <option value="Cheap">💰 Cheapest</option>
              <option value="Safe">🛡️ Safest</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-label text-on-surface-variant mb-1.5">Strict Mode</label>
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'Any') {
                  setExcludedModes([]);
                } else {
                  const all = ['road', 'rail', 'water', 'hybrid'];
                  const keep = val.toLowerCase();
                  setExcludedModes(all.filter((m) => m !== keep));
                  setPreferredMode(val);
                }
              }}
              defaultValue="Any"
              className="w-full px-4 py-2.5 border border-outline-variant/20 rounded-xl bg-surface text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
            >
              <option value="Any">Any</option>
              <option value="Road">Road</option>
              <option value="Rail">Rail</option>
              <option value="Water">Water</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-label text-on-surface-variant mb-1.5">Preferred Mode</label>
            <select
              value={preferredMode}
              onChange={(e) => setPreferredMode(e.target.value)}
              className="w-full px-4 py-2.5 border border-outline-variant/20 rounded-xl bg-surface text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
            >
              <option value="Any">Any</option>
              <option value="Road">Road</option>
              <option value="Rail">Rail</option>
              <option value="Water">Water</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </div>
        </div>

        <div className="pt-2">
          <label className="block text-sm font-label text-on-surface-variant mb-2">Exclude Modes (Constraints)</label>
          <div className="flex flex-wrap gap-4">
            {['Road', 'Rail', 'Water', 'Hybrid'].map((mode) => (
              <label key={mode} className="inline-flex items-center gap-2 text-sm text-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludedModes.includes(mode.toLowerCase())}
                  onChange={() => handleExcludeToggle(mode.toLowerCase())}
                  className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary accent-primary"
                />
                {mode}
              </label>
            ))}
          </div>
          {showConstraintWarning && (
            <p className="text-xs text-secondary mt-2">
              ⚠️ Your preferred mode is excluded. Preference will be ignored.
            </p>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-outline-variant/10">
          <button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto px-8 py-3 bg-primary text-on-primary font-bold rounded-xl shadow-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <><span className="material-symbols-outlined text-lg animate-spin">refresh</span> Optimizing...</>
            ) : (
              <><span className="material-symbols-outlined text-lg">route</span> Optimize Route</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
