'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Bell, Plus, Radar } from 'lucide-react';
import { modeMeta } from '@/lib/mode-meta';
import type { LogisticsMode } from '@/lib/mode-meta';
import { ModeIcon } from '@/components/cockpit/ModeIcon';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

<<<<<<< Updated upstream
const nav = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/railway', label: 'Railways', icon: 'train' },
  { href: '/road', label: 'Roadways', icon: 'local_shipping' },
  { href: '/air', label: 'Airways', icon: 'flight_takeoff' },
  { href: '/hybrid', label: 'Hybrid', icon: 'hub' },
=======
const navItems = [
  { href: '/', label: 'Home' },
  { href: '/hybrid', label: 'Hybrid', mode: 'hybrid' as LogisticsMode },
  { href: '/railway', label: 'Rail', mode: 'rail' as LogisticsMode },
  { href: '/road', label: 'Road', mode: 'road' as LogisticsMode },
  { href: '/air', label: 'Air', mode: 'air' as LogisticsMode },
  { href: '/water', label: 'Water', mode: 'water' as LogisticsMode },
>>>>>>> Stashed changes
] as const;

export default function NavBar() {
  const pathname = usePathname();
  const liveTrains = useLogiFlowStore((s) => s.liveTrains);
  const resetSearch = useLogiFlowStore((s) => s.resetSearch);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
<<<<<<< Updated upstream
    <header className="h-14 shrink-0 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 relative z-[60] border-b border-outline-variant/15 bg-[linear-gradient(110deg,rgba(10,14,20,0.94),rgba(18,23,33,0.92),rgba(10,14,20,0.94))] backdrop-blur-2xl shadow-[0_10px_40px_-30px_rgba(172,199,255,0.7)]">
      <Link
        href="/"
        onClick={resetSearch}
        className="flex items-center gap-2 shrink-0 group"
        aria-label="LogiFlow home"
      >
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/40 via-primary/15 to-sky-500/20 border border-primary/25 flex items-center justify-center group-hover:border-primary/55 transition-colors shadow-[0_0_20px_-10px_rgba(172,199,255,0.8)]">
          <span
            className="material-symbols-outlined text-primary leading-none"
            style={{
              fontSize: '17px',
              fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20",
            }}
          >
            hub
          </span>
        </div>
        <span className="text-[13px] font-bold tracking-tight">
          <span className="text-primary">Logi</span>
          <span className="text-on-surface">Flow</span>
        </span>
      </Link>

      <div className="w-px h-5 bg-outline-variant/20 shrink-0 hidden sm:block" />

      <nav className="flex items-center gap-0.5 sm:gap-1 flex-1 min-w-0 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-0.5 bg-surface-container/65 rounded-full p-0.5 border border-outline-variant/20 shrink-0">
          {nav.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={href === '/' ? resetSearch : undefined}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-semibold transition-all duration-200 whitespace-nowrap ${
                isActive(href)
                  ? href === '/air'
                    ? 'bg-sky-500/25 text-sky-100 border border-sky-400/30 shadow-sm'
                    : href === '/hybrid'
                    ? 'bg-tertiary/20 text-tertiary border border-tertiary/30 shadow-sm'
                    : 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span
                className="material-symbols-outlined leading-none shrink-0"
                style={{
                  fontSize: '14px',
                  fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20",
                }}
              >
                {icon}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
        {liveTrains.length > 0 && pathname.startsWith('/railway') && (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-tertiary bg-tertiary/10 px-2.5 py-1 rounded-full border border-tertiary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse shrink-0" />
            <span className="mono">{liveTrains.length} live</span>
=======
    <header className="sticky top-0 z-40 shrink-0 border-b border-border/70 bg-background/80 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-5">
        <Link
          href="/"
          onClick={resetSearch}
          className="group flex items-center gap-2.5"
          aria-label="LogiFlow home"
        >
          <div className="relative grid h-9 w-9 place-items-center rounded-lg border border-border-strong bg-surface-2 text-rail shadow-[0_0_30px_-18px_var(--rail)] transition-shadow duration-300 group-hover:shadow-[0_0_40px_-12px_var(--rail)]">
            <Radar className="h-4 w-4" strokeWidth={2.4} />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-background bg-live" />
>>>>>>> Stashed changes
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-bold">LogiFlow</div>
            <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
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
            href="/hybrid"
            className="btn-app btn-app-primary flex h-8 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[12px] font-semibold text-background"
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
