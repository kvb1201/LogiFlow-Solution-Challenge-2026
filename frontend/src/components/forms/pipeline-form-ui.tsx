'use client';

import type { LogisticsMode } from '@/lib/mode-meta';
import { modeMeta } from '@/lib/mode-meta';
import { ModeIcon } from '@/components/cockpit/ModeIcon';
import { AmbientMesh } from '@/components/cockpit/AmbientMesh';
import { accentMix, accentVar } from '@/lib/pipeline-theme';
import { Children, useRef, type ReactNode } from 'react';

export const formInputClass =
  'h-11 w-full rounded-lg border border-border bg-background/60 px-3 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/50 focus:border-ring focus:bg-surface/80 focus:ring-2 focus:ring-ring/15';

/** Date fields — room for the calendar trigger on the right. */
export const formDateInputClass = `${formInputClass} pr-11`;

export function FormDateInput({
  value,
  onChange,
  min,
  max,
  className = formDateInputClass,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  className?: string;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // fall through to focus
      }
    }
    input.focus();
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={`form-date-input relative ${className}`}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Open calendar"
        className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface/50 hover:text-foreground"
      >
        <span className="material-symbols-outlined text-[18px] leading-none">calendar_today</span>
      </button>
    </div>
  );
}

export const formLabelClass =
  'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';

export function FormField({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className={formLabelClass}>{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function FormShell({
  mode,
  title,
  subtitle,
  children,
  footer,
  advancedToggle,
}: {
  mode: LogisticsMode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  advancedToggle?: ReactNode;
}) {
  const accent = modeMeta[mode].accent;

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-border/40 bg-surface/15 backdrop-blur-md"
      style={{
        boxShadow: `inset 0 1px 0 0 ${accentMix(mode, 12, 'transparent')}, 0 20px 56px -40px ${accentVar(mode)}`,
      }}
    >
      <AmbientMesh variant="card" tone={mode} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="relative z-10 p-4 sm:p-5">
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/45 bg-background/50 backdrop-blur-sm transition-all duration-300 group-hover:scale-105"
              style={{
                color: accent,
                boxShadow: `0 0 28px -6px ${accentVar(mode)}`,
              }}
            >
              <ModeIcon mode={mode} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h2>
              {subtitle ? (
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
          </div>
          {advancedToggle}
        </div>
        {children}
        {footer ? (
          <div className="pointer-events-auto relative z-20 mt-6 border-t border-border/60 pt-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdvancedToggle({
  open,
  onToggle,
  accentVar = '--rail',
}: {
  open: boolean;
  onToggle: () => void;
  accentVar?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="shrink-0 rounded-lg border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-border-strong hover:text-foreground"
      style={
        open
          ? {
              borderColor: `color-mix(in oklab, var(${accentVar}) 35%, transparent)`,
              color: `var(${accentVar})`,
            }
          : undefined
      }
    >
      {open ? 'Less options' : 'More options'}
    </button>
  );
}

export function ChoicePills<T extends string>({
  options,
  value,
  onChange,
  accentVar = '--rail',
}: {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  accentVar?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
              active
                ? 'text-foreground shadow-[0_0_24px_-10px_var(--accent)]'
                : 'border-border bg-background/35 text-muted-foreground hover:border-border-strong hover:bg-surface/50 hover:text-foreground'
            }`}
            style={
              active
                ? ({
                    ['--accent' as string]: `var(${accentVar})`,
                    borderColor: `color-mix(in oklab, var(${accentVar}) 42%, transparent)`,
                    background: `color-mix(in oklab, var(${accentVar}) 12%, transparent)`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {opt.icon ? (
              <span
                className="material-symbols-outlined text-base leading-none"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {opt.icon}
              </span>
            ) : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Stable ids for mode forms — footer submit buttons use the HTML `form` attribute. */
export const LOGIFLOW_FORM_IDS = {
  rail: 'logiflow-form-rail',
  road: 'logiflow-form-road',
  air: 'logiflow-form-air',
  water: 'logiflow-form-water',
} as const;

export function FormSubmit({
  loading,
  disabled,
  label,
  loadingLabel,
  accentVar = '--rail',
  icon = 'bolt',
  formId,
  onAction,
}: {
  loading: boolean;
  disabled: boolean;
  label: string;
  loadingLabel: string;
  accentVar?: string;
  icon?: string;
  /** Associates this button with a <form id="..."> rendered elsewhere in FormShell */
  formId?: string;
  /** Fallback when association fails (optional; form onSubmit still preferred) */
  onAction?: () => void;
}) {
  return (
    <button
      type="submit"
      form={formId}
      disabled={disabled || loading}
      onClick={(e) => {
        if (disabled || loading) return;
        if (!formId && onAction) {
          e.preventDefault();
          onAction();
        }
      }}
      className="flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-background transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40 hover:brightness-110 pointer-events-auto"
      style={{
        background: `linear-gradient(135deg, var(${accentVar}), color-mix(in oklab, var(${accentVar}) 55%, var(--foreground)))`,
        boxShadow: `0 8px 32px -10px var(${accentVar})`,
      }}
    >
      <span
        className={`material-symbols-outlined text-lg leading-none ${loading ? 'animate-spin' : ''}`}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {loading ? 'progress_activity' : icon}
      </span>
      {loading ? loadingLabel : label}
    </button>
  );
}

export function CorridorSwapButton({
  onClick,
  disabled,
  accentVar,
  className = '',
}: {
  onClick: () => void;
  disabled?: boolean;
  accentVar?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Swap origin and destination"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-md transition-all duration-200 hover:scale-105 hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <span
        className="material-symbols-outlined text-base leading-none"
        style={accentVar ? { color: `var(${accentVar})` } : undefined}
      >
        swap_horiz
      </span>
    </button>
  );
}

export function CorridorRow({
  children,
  onSwap,
  swapDisabled,
  accentVar,
}: {
  children: ReactNode;
  onSwap?: () => void;
  swapDisabled?: boolean;
  accentVar?: string;
}) {
  const childList = Children.toArray(children);
  const origin = childList[0];
  const destination = childList[1] ?? null;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end md:gap-3">
      <div className="min-w-0">{origin}</div>
      {onSwap ? (
        <div className="flex justify-center py-0.5 md:px-0.5 md:py-0">
          <CorridorSwapButton onClick={onSwap} disabled={swapDisabled} accentVar={accentVar} />
        </div>
      ) : null}
      {destination ? <div className="min-w-0">{destination}</div> : null}
    </div>
  );
}
