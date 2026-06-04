'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FormField } from './pipeline-form-ui';
import { formInputClass } from './pipeline-form-ui';

export type AutocompleteOption = { code: string; name: string };

export function FormAutocomplete({
  label,
  value,
  onChange,
  placeholder,
  icon,
  accentVar = '--rail',
  options,
  loading,
  onSearch,
  onClear,
  dropdownIcon,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  icon: string;
  accentVar?: string;
  options: AutocompleteOption[];
  loading?: boolean;
  onSearch: (query: string) => void;
  onClear: () => void;
  dropdownIcon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = (opt: AutocompleteOption) => {
    onChange(opt.name);
    onClear();
    setOpen(false);
  };

  return (
    <FormField label={label} className="relative z-[50]">
      <div ref={ref} className="relative">
        <div className="relative flex items-center">
          <span
            className="pointer-events-none absolute left-3 material-symbols-outlined text-muted-foreground"
            style={{ fontSize: '18px' }}
          >
            {icon}
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              onSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (options.length) setOpen(true);
            }}
            placeholder={placeholder}
            className={`${formInputClass} pl-10 pr-9`}
            style={
              {
                ['--accent' as string]: `var(${accentVar})`,
              } as React.CSSProperties
            }
          />
          {loading ? (
            <span className="absolute right-3 h-2 w-2 animate-pulse rounded-full bg-live" />
          ) : null}
          {value ? (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange('');
                onClear();
                setOpen(false);
              }}
              className="absolute right-2 rounded-md p-1 text-muted-foreground hover:bg-surface/80 hover:text-foreground"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          ) : null}
        </div>

        {open && options.length > 0 ? (
          <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-[200] max-h-56 overflow-y-auto rounded-xl border border-border bg-surface/95 p-1 shadow-2xl backdrop-blur-xl animate-slide-up">
            {options.map((opt, i) => (
              <li key={`${opt.code}-${i}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-background/60"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(opt);
                  }}
                >
                  {dropdownIcon ?? (
                    <span
                      className="material-symbols-outlined shrink-0 text-muted-foreground"
                      style={{ fontSize: '16px' }}
                    >
                      location_on
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{opt.name}</span>
                    {opt.code ? (
                      <span className="font-mono text-[10px] text-muted-foreground">{opt.code}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </FormField>
  );
}
