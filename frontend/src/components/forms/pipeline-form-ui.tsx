'use client';

import type { LogisticsMode } from '@/lib/mode-meta';
import { modeMeta } from '@/lib/mode-meta';
import { ModeIcon } from '@/components/cockpit/ModeIcon';
import type { ReactNode } from 'react';

export const formInputClass =
  'h-10 w-full rounded-xl border border-border bg-surface/60 px-3 text-[13px] text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/40 focus:border-border-strong focus:bg-surface focus:ring-2 focus:ring-ring/12';

export const formLabelClass =
  'text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground';

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
      className="relative overflow-hidden rounded-2xl border border-border bg-surface/70 backdrop-blur-sm"
      style={{
        boxShadow: `inset 0 1px 0 0 color-mix(in oklab, ${accent} 14%, transparent), 0 4px 32px -12px color-mix(in oklab, black 60%, transparent)`,
      }}
    >
      {/* Top accent line */}
      <div
        aria-hidden
        className="h-px w-full shrink-0"
        style={{
          background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${accent} 70%, transparent), transparent)`,
        }}
      />

      <div className="p-4 sm:p-5 md:p-6">
        {/* Form header */}
        <div className="mb-5 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background/50"
              style={{ color: accent }}
            >
              <ModeIcon mode={mode} className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold tracking-tight text-foreground sm:text-[17px]">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
          </div>
          {advancedToggle}
        </div>

        {children}

        {footer ? (
          <div className="pointer-events-auto relative z-20 mt-5 border-t border-border/50 pt-5">
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
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12.5px] font-medium transition-all duration-200 ${
              active
                ? 'text-foreground'
                : 'border-border bg-surface/40 text-muted-foreground hover:border-border-strong hover:bg-surface/70 hover:text-foreground'
            }`}
            style={
              active
                ? ({
                    ['--accent' as string]: `var(${accentVar})`,
                    borderColor: `color-mix(in oklab, var(${accentVar}) 40%, transparent)`,
                    background: `color-mix(in oklab, var(${accentVar}) 10%, var(--surface))`,
                    boxShadow: `0 0 18px -8px var(${accentVar})`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {opt.icon ? (
              <span
                className="material-symbols-outlined text-[15px] leading-none"
                style={{
                  fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                  color: active ? `var(${accentVar})` : undefined,
                }}
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
      className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-background transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 hover:brightness-105 hover:-translate-y-px pointer-events-auto"
      style={{
        background: `linear-gradient(135deg, var(${accentVar}), color-mix(in oklab, var(${accentVar}) 60%, var(--foreground)))`,
        boxShadow: `0 6px 28px -10px color-mix(in oklab, var(${accentVar}) 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.08)`,
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
      className={`absolute left-1/2 top-1/2 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-md transition-all duration-200 hover:scale-105 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
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
  return (
    <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2">
      {children}
      {onSwap ? (
        <CorridorSwapButton onClick={onSwap} disabled={swapDisabled} accentVar={accentVar} />
      ) : null}
    </div>
  );
}
