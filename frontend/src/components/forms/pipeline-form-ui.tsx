'use client';

import type { LogisticsMode } from '@/lib/mode-meta';
import { modeMeta } from '@/lib/mode-meta';
import { ModeIcon } from '@/components/cockpit/ModeIcon';
import type { ReactNode } from 'react';

export const formInputClass =
  'h-11 w-full rounded-lg border border-border bg-background/60 px-3 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/50 focus:border-ring focus:bg-surface/80 focus:ring-2 focus:ring-ring/15';

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
      className="panel-hard scanline overflow-hidden rounded-2xl"
      style={{ boxShadow: `inset 0 1px 0 0 color-mix(in oklab, ${accent} 18%, transparent)` }}
    >
      <div
        aria-hidden
        className="h-px w-full"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="p-5 sm:p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background/50"
              style={{ color: accent }}
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
        {footer ? <div className="mt-6 border-t border-border/60 pt-5">{footer}</div> : null}
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

export function FormSubmit({
  loading,
  disabled,
  label,
  loadingLabel,
  accentVar = '--rail',
  icon = 'bolt',
}: {
  loading: boolean;
  disabled: boolean;
  label: string;
  loadingLabel: string;
  accentVar?: string;
  icon?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className="flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-background transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40 hover:brightness-110"
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

export function CorridorRow({ children, onSwap }: { children: ReactNode; onSwap?: () => void }) {
  return (
    <div className="relative grid gap-4 md:grid-cols-2">
      {children}
      {onSwap ? (
        <button
          type="button"
          onClick={onSwap}
          className="absolute bottom-3 left-1/2 z-10 hidden h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-all duration-200 hover:scale-105 hover:text-foreground md:bottom-[18px] md:flex"
          aria-label="Swap origin and destination"
        >
          <span className="material-symbols-outlined text-base">swap_horiz</span>
        </button>
      ) : null}
    </div>
  );
}
