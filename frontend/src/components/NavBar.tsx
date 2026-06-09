'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Bell, LogOut, Plus, Radar } from 'lucide-react';
import { modeMeta } from '@/lib/mode-meta';
import type { LogisticsMode } from '@/lib/mode-meta';
import { ModeIcon } from '@/components/cockpit/ModeIcon';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { useAuthStore } from '@/store/useAuthStore';
import { NotificationBell } from '@/components/planner/NotificationBell';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/hybrid', label: 'Hybrid', mode: 'hybrid' as LogisticsMode },
  { href: '/comparator', label: 'Compare', mode: 'comparator' as LogisticsMode },
  { href: '/railway', label: 'Rail', mode: 'rail' as LogisticsMode },
  { href: '/road', label: 'Road', mode: 'road' as LogisticsMode },
  { href: '/air', label: 'Air', mode: 'air' as LogisticsMode },
  { href: '/water', label: 'Water', mode: 'water' as LogisticsMode },
] as const;

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const liveTrains = useLogiFlowStore((s) => s.liveTrains);
  const resetSearch = useLogiFlowStore((s) => s.resetSearch);
  const { user, token, logout } = useAuthStore();

  const isActive = (href: string) =>
    pathname === null
      ? false
      : href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-40 shrink-0">
      {/* Backdrop blur layer */}
      <div className="absolute inset-0 bg-background/75 backdrop-blur-2xl" />
      <div
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 10%, transparent) 30%, color-mix(in oklab, var(--foreground) 10%, transparent) 70%, transparent)',
        }}
      />

      <div className="relative mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:h-16 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          onClick={resetSearch}
          className="group flex shrink-0 items-center gap-2.5"
          aria-label="LogiFlow home"
        >
          <div className="relative grid h-8 w-8 place-items-center rounded-lg border border-border-strong bg-surface-2 transition-all duration-300 group-hover:border-rail/40 group-hover:shadow-[0_0_28px_-10px_var(--rail)]">
            <Radar
              className="h-3.5 w-3.5 text-rail"
              strokeWidth={2.2}
            />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-background bg-live" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-bold tracking-tight sm:text-sm">
              LogiFlow
            </div>
            <div className="hidden text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:block">
              Multimodal freight
            </div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const mode = 'mode' in item ? item.mode : null;
            const accent = mode ? modeMeta[mode].accent : 'var(--foreground)';

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={item.href === '/' ? resetSearch : undefined}
                className={`group relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200 ${
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {active && (
                  <span
                    className="absolute inset-0 rounded-md opacity-100"
                    style={{
                      background: `color-mix(in oklab, ${accent} 9%, var(--surface))`,
                      border: `1px solid color-mix(in oklab, ${accent} 22%, var(--border))`,
                    }}
                  />
                )}
                {mode ? (
                  <ModeIcon
                    mode={mode}
                    className="relative h-3.5 w-3.5 shrink-0 transition-colors"
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                ) : (
                  <Activity className="relative h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                )}
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right side actions */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {liveTrains.length > 0 && pathname?.startsWith('/railway') && (
            <div className="hidden items-center gap-1.5 rounded-full border border-border bg-surface/60 px-2.5 py-1 lg:flex">
              <span className="live-dot" />
              <span className="font-mono text-[11px] font-semibold text-foreground">
                {liveTrains.length}
              </span>
              <span className="text-[11px] text-muted-foreground">live</span>
            </div>
          )}

          {/* Notification bell */}
          {token && user ? (
            <NotificationBell />
          ) : (
            <button
              type="button"
              className="hidden h-8 w-8 place-items-center rounded-lg border border-border bg-surface/50 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground sm:grid"
              aria-label="Alerts"
            >
              <Bell className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Auth buttons */}
          {token && user ? (
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 sm:flex">
                {user.avatar && (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-7 w-7 rounded-full border border-border"
                  />
                )}
                <span className="hidden text-[12px] font-medium text-muted-foreground lg:inline">
                  {user.name}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-2.5 text-[12px] font-semibold text-muted-foreground transition-all hover:border-border-strong hover:text-foreground"
                title="Logout"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/comparator"
                className="btn-app btn-app-primary flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-semibold text-background"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span className="hidden sm:inline">New route</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile nav strip */}
      <div className="relative md:hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-border/50" />
        <nav className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const mode = 'mode' in item ? item.mode : null;
            const accent = mode ? modeMeta[mode].accent : 'var(--foreground)';
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={item.href === '/' ? resetSearch : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all duration-200 ${
                  active ? 'text-foreground' : 'text-muted-foreground'
                }`}
                style={
                  active
                    ? {
                        background: `color-mix(in oklab, ${accent} 10%, var(--surface))`,
                        border: `1px solid color-mix(in oklab, ${accent} 24%, var(--border))`,
                      }
                    : {
                        background: 'color-mix(in oklab, var(--surface) 60%, transparent)',
                        border: '1px solid var(--border)',
                      }
                }
              >
                {mode ? (
                  <ModeIcon mode={mode} className="h-3 w-3" strokeWidth={active ? 2.2 : 1.8} />
                ) : (
                  <Activity className="h-3 w-3" strokeWidth={1.8} />
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
