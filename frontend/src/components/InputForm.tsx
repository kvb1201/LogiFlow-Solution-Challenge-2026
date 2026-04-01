'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

/**
 * Animated counter component for visual number transitions.
 */
function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const diff = value - display;
    if (diff === 0) return;
    const step = diff > 0 ? Math.max(1, Math.floor(diff / 10)) : Math.min(-1, Math.ceil(diff / 10));
    const timer = setTimeout(() => setDisplay(prev => {
      const next = prev + step;
      return diff > 0 ? Math.min(next, value) : Math.max(next, value);
    }), 20);
    return () => clearTimeout(timer);
  }, [value, display]);
  return <span className="mono tabular-nums">{display.toLocaleString()}{suffix}</span>;
}

const MODE_OPTIONS = [
  { value: 'Any', label: 'Any Mode', icon: 'hub', desc: 'All transport types' },
  { value: 'Road', label: 'Road', icon: 'local_shipping', desc: 'Truck & ground' },
  { value: 'Rail', label: 'Rail', icon: 'train', desc: 'Freight trains' },
  { value: 'Water', label: 'Water', icon: 'sailing', desc: 'Maritime freight' },
  { value: 'Hybrid', label: 'Hybrid', icon: 'swap_calls', desc: 'Multi-modal mix' },
];

const PRIORITY_OPTIONS = [
  { value: 'Fast', label: 'Fastest', icon: 'bolt', color: 'from-amber-500/20 to-amber-600/5 border-amber-500/30', iconColor: 'text-amber-400' },
  { value: 'Cheap', label: 'Cheapest', icon: 'savings', color: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30', iconColor: 'text-emerald-400' },
  { value: 'Safe', label: 'Safest', icon: 'verified_user', color: 'from-blue-500/20 to-blue-600/5 border-blue-500/30', iconColor: 'text-blue-400' },
];

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

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formStep, setFormStep] = useState(0); // for staggered reveal
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const timers = [
      setTimeout(() => setFormStep(1), 100),
      setTimeout(() => setFormStep(2), 250),
      setTimeout(() => setFormStep(3), 400),
      setTimeout(() => setFormStep(4), 550),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

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

  const handleStrictMode = (val: string) => {
    if (val === 'Any') {
      setExcludedModes([]);
      setPreferredMode('Any');
    } else {
      const all = ['road', 'rail', 'water', 'hybrid'];
      const keep = val.toLowerCase();
      setExcludedModes(all.filter((m) => m !== keep));
      setPreferredMode(val);
    }
  };

  const showConstraintWarning = preferredMode !== 'Any' && excludedModes.includes(preferredMode.toLowerCase());

  return (
    <div className="form-container-glow relative">
      {/* Ambient glow behind the form */}
      <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-tertiary/10 to-primary/20 rounded-3xl blur-xl opacity-50 animate-pulse-slow pointer-events-none" />
      
      <div className="relative bg-surface-container-low/80 backdrop-blur-2xl border border-outline-variant/15 rounded-2xl shadow-2xl overflow-hidden">
        {/* Animated top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer" />
        
        <div className="p-8">
          {/* Header */}
          <div className={`flex items-center justify-between mb-8 transition-all duration-700 ${formStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border border-primary/20">
                  <span className="material-symbols-outlined text-primary text-xl">route</span>
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-tertiary rounded-full animate-ping opacity-75" />
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-tertiary rounded-full" />
              </div>
              <div>
                <h2 className="text-xl font-headline font-bold text-on-surface tracking-tight">Route Parameters</h2>
                <p className="text-xs text-on-surface-variant font-body mt-0.5">Configure your logistics optimization</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-container border border-transparent hover:border-outline-variant/20"
            >
              <span className="material-symbols-outlined text-sm">{showAdvanced ? 'unfold_less' : 'tune'}</span>
              {showAdvanced ? 'Less options' : 'Advanced'}
            </button>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-7">
            {/* ── Source & Destination ── */}
            <div className={`transition-all duration-700 delay-75 ${formStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                {/* Connection line between fields */}
                <div className="hidden md:block absolute bottom-[18px] left-1/2 -translate-x-1/2 translate-y-1/2 z-10">
                  <div className="w-10 h-10 rounded-full bg-surface-container border border-outline-variant/20 flex items-center justify-center shadow-lg">
                    <span className="material-symbols-outlined text-primary text-sm">swap_horiz</span>
                  </div>
                </div>

                {/* Source Field */}
                <div className="relative group">
                  <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">
                    Origin
                  </label>
                  <div className={`relative transition-all duration-300 ${focusedField === 'source' ? 'scale-[1.02]' : ''}`}>
                    <div className={`absolute -inset-0.5 rounded-xl transition-opacity duration-300 ${focusedField === 'source' ? 'opacity-100 bg-gradient-to-r from-primary/30 to-tertiary/30 blur-sm' : 'opacity-0'}`} />
                    <div className="relative flex items-center">
                      <div className={`absolute left-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${focusedField === 'source' ? 'bg-primary/20' : 'bg-surface-container'}`}>
                        <span className={`material-symbols-outlined text-sm transition-colors duration-300 ${focusedField === 'source' ? 'text-primary' : 'text-outline'}`}>my_location</span>
                      </div>
                      <input
                        type="text"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        onFocus={() => setFocusedField('source')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full pl-14 pr-4 py-3.5 border border-outline-variant/20 rounded-xl bg-surface-container-lowest/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 text-on-surface transition-all outline-none placeholder:text-outline/50 text-sm"
                        placeholder="Enter origin city..."
                      />
                    </div>
                  </div>
                </div>

                {/* Destination Field */}
                <div className="relative group">
                  <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-2 ml-1">
                    Destination
                  </label>
                  <div className={`relative transition-all duration-300 ${focusedField === 'destination' ? 'scale-[1.02]' : ''}`}>
                    <div className={`absolute -inset-0.5 rounded-xl transition-opacity duration-300 ${focusedField === 'destination' ? 'opacity-100 bg-gradient-to-r from-tertiary/30 to-primary/30 blur-sm' : 'opacity-0'}`} />
                    <div className="relative flex items-center">
                      <div className={`absolute left-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${focusedField === 'destination' ? 'bg-tertiary/20' : 'bg-surface-container'}`}>
                        <span className={`material-symbols-outlined text-sm transition-colors duration-300 ${focusedField === 'destination' ? 'text-tertiary' : 'text-outline'}`}>flag</span>
                      </div>
                      <input
                        type="text"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        onFocus={() => setFocusedField('destination')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full pl-14 pr-4 py-3.5 border border-outline-variant/20 rounded-xl bg-surface-container-lowest/50 focus:border-tertiary/50 focus:ring-2 focus:ring-tertiary/20 text-on-surface transition-all outline-none placeholder:text-outline/50 text-sm"
                        placeholder="Enter destination city..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Optimization Priority ── */}
            <div className={`transition-all duration-700 delay-150 ${formStep >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">
                Optimization Priority
              </label>
              <div className="grid grid-cols-3 gap-3">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`relative group/prio flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                      priority === opt.value
                        ? `bg-gradient-to-b ${opt.color} border-current shadow-lg scale-[1.02]`
                        : 'bg-surface-container-lowest/30 border-outline-variant/10 hover:border-outline-variant/30 hover:bg-surface-container/50'
                    }`}
                  >
                    {priority === opt.value && (
                      <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/5 pointer-events-none" />
                    )}
                    <span className={`material-symbols-outlined text-2xl transition-all duration-300 ${
                      priority === opt.value ? opt.iconColor : 'text-outline group-hover/prio:text-on-surface-variant'
                    } ${priority === opt.value ? 'scale-110' : 'group-hover/prio:scale-105'}`}>
                      {opt.icon}
                    </span>
                    <span className={`text-sm font-semibold transition-colors duration-300 ${
                      priority === opt.value ? 'text-on-surface' : 'text-on-surface-variant'
                    }`}>
                      {opt.label}
                    </span>
                    {priority === opt.value && (
                      <div className="absolute top-2 right-2">
                        <span className="material-symbols-outlined text-xs text-primary">check_circle</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Transport Mode Selector ── */}
            <div className={`transition-all duration-700 delay-200 ${formStep >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">
                Preferred Transport Mode
              </label>
              <div className="flex flex-wrap gap-2">
                {MODE_OPTIONS.map((mode) => {
                  const isSelected = preferredMode === mode.value;
                  const isExcluded = excludedModes.includes(mode.value.toLowerCase());
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => handleStrictMode(mode.value)}
                      className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all duration-300 cursor-pointer group/mode ${
                        isSelected
                          ? 'bg-primary/15 border-primary/40 shadow-md shadow-primary/10 text-on-surface'
                          : isExcluded
                          ? 'bg-surface-container-lowest/20 border-outline-variant/5 text-outline/50 opacity-50'
                          : 'bg-surface-container-lowest/30 border-outline-variant/10 hover:border-primary/20 hover:bg-surface-container/40 text-on-surface-variant'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-lg transition-all duration-300 ${
                        isSelected ? 'text-primary' : 'text-outline group-hover/mode:text-on-surface-variant'
                      }`}>
                        {mode.icon}
                      </span>
                      <div className="text-left">
                        <span className="text-sm font-semibold block leading-tight">{mode.label}</span>
                        <span className="text-[10px] text-on-surface-variant/70 font-body">{mode.desc}</span>
                      </div>
                      {isSelected && (
                        <span className="material-symbols-outlined text-primary text-xs ml-1 animate-fade-in">check</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Advanced Options (Collapsible) ── */}
            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${showAdvanced ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="pt-2 space-y-5">
                {/* Excluded Modes */}
                <div>
                  <label className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">
                    Exclude Transport Modes
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['Road', 'Rail', 'Water', 'Hybrid'].map((mode) => {
                      const isExcluded = excludedModes.includes(mode.toLowerCase());
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => handleExcludeToggle(mode.toLowerCase())}
                          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-all duration-300 ${
                            isExcluded
                              ? 'bg-error/10 border-error/30 text-error line-through'
                              : 'bg-surface-container-lowest/30 border-outline-variant/10 text-on-surface-variant hover:border-outline-variant/30'
                          }`}
                        >
                          <span className={`material-symbols-outlined text-sm transition-transform duration-300 ${isExcluded ? 'rotate-45' : ''}`}>
                            {isExcluded ? 'close' : 'add'}
                          </span>
                          {mode}
                        </button>
                      );
                    })}
                  </div>
                  {showConstraintWarning && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-secondary bg-secondary/10 px-3 py-2 rounded-lg border border-secondary/20 animate-fade-in">
                      <span className="material-symbols-outlined text-sm">warning</span>
                      Your preferred mode is excluded. Preference will be ignored.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Submit Button ── */}
            <div className={`transition-all duration-700 delay-300 ${formStep >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !source.trim() || !destination.trim()}
                  className="group/btn relative w-full py-4 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden"
                >
                  {/* Button background layers */}
                  <div className={`absolute inset-0 transition-all duration-500 ${
                    loading 
                      ? 'bg-surface-container' 
                      : 'bg-gradient-to-r from-primary via-primary-container to-primary group-hover/btn:shadow-[0_0_30px_rgba(47,129,247,0.4)]'
                  }`} />
                  
                  {/* Animated shine effect */}
                  {!loading && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700" />
                  )}
                  
                  {/* Pulse ring on hover */}
                  {!loading && source.trim() && destination.trim() && (
                    <div className="absolute inset-0 rounded-xl border-2 border-primary/0 group-hover/btn:border-primary/30 transition-all duration-300" />
                  )}

                  <div className="relative flex items-center gap-2">
                    <span className={`material-symbols-outlined text-xl ${loading ? 'animate-spin text-outline' : 'text-on-primary-container group-hover/btn:rotate-12 transition-transform duration-300'}`}>
                      {loading ? 'progress_activity' : 'rocket_launch'}
                    </span>
                    <span className={`text-sm tracking-wider uppercase ${loading ? 'text-outline' : 'text-on-primary-container'}`}>
                      {loading ? 'Optimizing Routes...' : 'Find Optimal Routes'}
                    </span>
                  </div>
                </button>

                {/* Helper text */}
                {!source.trim() || !destination.trim() ? (
                  <p className="text-center text-[11px] text-outline mt-3 animate-fade-in">
                    Enter origin and destination to begin optimization
                  </p>
                ) : (
                  <p className="text-center text-[11px] text-on-surface-variant/60 mt-3 flex items-center justify-center gap-1.5 animate-fade-in">
                    <span className="material-symbols-outlined text-tertiary text-xs">check_circle</span>
                    Ready to optimize <span className="mono text-primary">{source}</span> → <span className="mono text-tertiary">{destination}</span>
                  </p>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
