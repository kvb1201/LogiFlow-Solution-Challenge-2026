'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { CreateReportPayload, ReportMode } from '@/services/plannerApi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-filled from current optimization state */
  prefill: {
    source: string;
    destination: string;
    stops?: string[];
    mode: ReportMode;
    cargoType?: string;
    optimizationInput?: Record<string, unknown>;
    optimizationResult?: Record<string, unknown>;
    estimatedCost?: number;
    estimatedTime?: number;
    riskScore?: number;
  };
}

export function SaveReportModal({ isOpen, onClose, prefill }: Props) {
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pathname = usePathname();
  const { saveReport, saving, error, clearError } = usePlannerStore();
  const user = useAuthStore(s => s.user);
  const loginHref = `/login?returnUrl=${encodeURIComponent(pathname || '/hybrid')}`;

  // Auto-focus and generate default name when modal opens
  useEffect(() => {
    if (isOpen) {
      const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      setName(`${prefill.source} → ${prefill.destination} · ${date}`);
      setSubmitted(false);
      setSuccess(false);
      clearError();
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [isOpen, prefill.source, prefill.destination, clearError]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim()) return;

    const payload: CreateReportPayload = {
      name: name.trim(),
      source: prefill.source,
      destination: prefill.destination,
      stops: prefill.stops ?? [],
      mode: prefill.mode,
      cargo_type: prefill.cargoType,
      optimization_input: prefill.optimizationInput,
      optimization_result: prefill.optimizationResult,
      estimated_cost: prefill.estimatedCost,
      estimated_time: prefill.estimatedTime,
      risk_score: prefill.riskScore,
      status: 'planned',
    };

    try {
      await saveReport(payload);
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch {
      // error is shown from store
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save shipment report"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border/50 bg-surface/95 backdrop-blur-xl p-6 shadow-2xl">
        {success ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="text-4xl">✅</span>
            <p className="text-sm font-semibold text-foreground">Report saved!</p>
            <p className="text-xs text-muted-foreground">View it in My Plans</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-foreground">Save Shipment Report</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {prefill.source} → {prefill.destination}
                  {(prefill.stops?.length ?? 0) > 0 && ` · ${prefill.stops!.length} stop${prefill.stops!.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-container transition-all"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
              </button>
            </div>

            {!user && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <Link href={loginHref} className="font-semibold underline hover:text-amber-100">
                  Sign in
                </Link>{' '}
                to save reports to your account.
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg border border-risk/30 bg-risk/10 p-3 text-xs text-foreground">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-label font-bold text-muted-foreground uppercase tracking-[0.14em] mb-1.5">
                  Report Name <span className="text-risk">*</span>
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Mumbai → Delhi · Q3 Shipment"
                  className={[
                    'w-full rounded-xl border px-3.5 py-2.5 text-sm bg-surface-container-lowest/50',
                    'focus:outline-none focus:ring-1 transition-all',
                    submitted && !name.trim()
                      ? 'border-risk/50 focus:ring-risk/30 focus:border-risk/50'
                      : 'border-border/40 focus:ring-primary/20 focus:border-primary/40',
                  ].join(' ')}
                />
                {submitted && !name.trim() && (
                  <p className="mt-1 text-[10px] text-risk">Report name is required</p>
                )}
              </div>

              {/* Metrics summary */}
              <div className="rounded-xl bg-surface-container/30 border border-border/20 px-3.5 py-3 grid grid-cols-3 gap-3">
                {[
                  { label: 'Cost', value: prefill.estimatedCost != null ? `₹${Math.round(prefill.estimatedCost).toLocaleString('en-IN')}` : '—' },
                  { label: 'Time', value: prefill.estimatedTime != null ? `${prefill.estimatedTime.toFixed(1)}h` : '—' },
                  { label: 'Risk', value: prefill.riskScore != null ? `${Math.round(prefill.riskScore * 100)}%` : '—' },
                ].map(m => (
                  <div key={m.label} className="text-center">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
                    <div className="text-sm font-bold text-foreground mono">{m.value}</div>
                  </div>
                ))}
              </div>

              <p className="text-[9px] text-muted-foreground leading-relaxed">
                Plans are valid for 24 hours. Regenerate to get fresh estimates.
              </p>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-border/40 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !user}
                  className="flex-1 rounded-xl bg-primary text-on-primary py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-all"
                >
                  {saving ? 'Saving…' : 'Save Report'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
