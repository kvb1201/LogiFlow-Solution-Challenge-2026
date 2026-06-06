'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Bell, Plus, Radar } from 'lucide-react';
import { modeMeta } from '@/lib/mode-meta';
import type { LogisticsMode } from '@/lib/mode-meta';
import { ModeIcon } from '@/components/cockpit/ModeIcon';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/hybrid', label: 'Hybrid', mode: 'hybrid' as LogisticsMode },
  { href: '/comparator', label: 'Comparator', mode: 'comparator' as LogisticsMode },
  { href: '/railway', label: 'Rail', mode: 'rail' as LogisticsMode },
  { href: '/road', label: 'Road', mode: 'road' as LogisticsMode },
  { href: '/air', label: 'Air', mode: 'air' as LogisticsMode },
  { href: '/water', label: 'Water', mode: 'water' as LogisticsMode },
] as const;

export default function NavBar() {
  const pathname = usePathname();
  const liveTrains = useLogiFlowStore((s) => s.liveTrains);
  const resetSearch = useLogiFlowStore((s) => s.resetSearch);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border/70 bg-background/80 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 sm:h-16 sm:gap-4 sm:px-5">
        <Link
          href="/"
          onClick={resetSearch}
          className="group flex items-center gap-2.5"
          aria-label="LogiFlow home"
        >
          <div className="relative grid h-9 w-9 place-items-center rounded-lg border border-border-strong bg-surface-2 text-rail shadow-[0_0_30px_-18px_var(--rail)] transition-shadow duration-300 group-hover:shadow-[0_0_40px_-12px_var(--rail)]">
            <Radar className="h-4 w-4" strokeWidth={2.4} />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-background bg-live" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-bold sm:text-[14px]">LogiFlow</div>
            <div className="hidden text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground sm:block">
              Multimodal freight
            </div>
          </div>
        </Link>

        <nav className="hidden min-w-0 items-center gap-0.5 rounded-full border border-border bg-surface/60 p-1 md:flex">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const mode = 'mode' in item ? item.mode : null;
            const accent = mode ? modeMeta[mode].accent : 'var(--foreground)';
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={item.href === '/' ? resetSearch : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                  active
                    ? 'bg-surface-3 text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                style={active ? { color: accent } : undefined}
              >
                {mode ? <ModeIcon mode={mode} className="h-3.5 w-3.5" /> : null}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          {liveTrains.length > 0 && pathname.startsWith('/railway') && (
            <div className="hidden items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 lg:flex">
              <span className="live-dot" />
              <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                <span className="font-mono text-foreground">{liveTrains.length}</span> live trains
              </span>
            </div>
          )}
          <button
            type="button"
            className="hidden h-8 w-8 place-items-center rounded-md border border-border bg-surface/60 text-muted-foreground transition-colors hover:text-foreground sm:grid"
            aria-label="Alerts"
          >
            <Bell className="h-3.5 w-3.5" />
          </button>
          <Link
            href="/comparator"
            className="btn-app btn-app-primary flex h-8 items-center gap-2 rounded-md bg-foreground px-2.5 text-[12px] font-semibold text-background"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New scenario</span>
          </Link>
        </div>
      </div>

      <div className="border-t border-border/40 bg-surface/20 md:hidden">
        <nav className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const mode = 'mode' in item ? item.mode : null;
            return (
              <Link
                key={`mobile-${item.href}`}
                href={item.href}
                onClick={item.href === '/' ? resetSearch : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium ${
                  active
                    ? 'border-border-strong bg-surface-3 text-foreground'
                    : 'border-border bg-surface/50 text-muted-foreground'
                }`}
              >
                {mode ? (
                  <ModeIcon mode={mode} className="h-3.5 w-3.5" />
                ) : (
                  <Activity className="h-3.5 w-3.5" />
                )}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
