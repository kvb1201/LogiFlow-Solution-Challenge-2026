'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, LogOut, Menu, Plus, X } from 'lucide-react';
import { modeFromPathname, modeMeta } from '@/lib/mode-meta';
import type { LogisticsMode } from '@/lib/mode-meta';
import { accentMix } from '@/lib/pipeline-theme';
import { LogiFlowMark } from '@/components/brand/LogiFlowMark';
import { ModeIcon } from '@/components/cockpit/ModeIcon';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';
import { useAuthStore } from '@/store/useAuthStore';
import { NotificationBell } from '@/components/planner/NotificationBell';

const publicNavItems = [
  { href: '/', label: 'Home' },
  { href: '/hybrid', label: 'Hybrid', mode: 'hybrid' as LogisticsMode },
  { href: '/comparator', label: 'Comparator', mode: 'comparator' as LogisticsMode },
  { href: '/railway', label: 'Rail', mode: 'rail' as LogisticsMode },
  { href: '/road', label: 'Road', mode: 'road' as LogisticsMode },
  { href: '/air', label: 'Air', mode: 'air' as LogisticsMode },
  { href: '/water', label: 'Water', mode: 'water' as LogisticsMode },
] as const;

const pipelineNavItems = publicNavItems.filter((item) => item.href !== '/');

const authNavItems = [
  { href: '/dashboard', label: 'Dashboard' },
  ...pipelineNavItems,
  { href: '/reports', label: 'My Plans' },
] as const;

type NavItem = (typeof publicNavItems)[number] | (typeof authNavItems)[number];

function NavLinks({
  items,
  isActive,
  onNavigate,
  compact,
}: {
  items: readonly NavItem[];
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  return (
    <>
      {items.map((item) => {
        const active = isActive(item.href);
        const mode = 'mode' in item ? item.mode : null;
        const accent = mode ? modeMeta[mode].accent : 'var(--foreground)';
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={
              compact
                ? `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? 'bg-surface-3 text-foreground'
                      : 'text-muted-foreground hover:bg-surface/60 hover:text-foreground'
                  }`
                : `flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-all lg:px-3 lg:text-[12px] ${
                    active
                      ? 'bg-surface-3 text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`
            }
            style={active && mode && !compact ? { color: accent } : undefined}
          >
            {mode ? <ModeIcon mode={mode} className={compact ? 'h-4 w-4' : 'h-3.5 w-3.5'} /> : null}
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const liveTrains = useLogiFlowStore((s) => s.liveTrains);
  const resetSearch = useLogiFlowStore((s) => s.resetSearch);
  const { user, token, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAuthed = Boolean(token && user);
  const navItems = isAuthed ? authNavItems : publicNavItems;

  const isActive = (href: string) =>
    pathname === null
      ? false
      : href === '/'
        ? pathname === '/'
        : pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    logout();
    setMobileOpen(false);
    router.push('/');
  };

  const activeMode = modeFromPathname(pathname);
  const logoAccent = activeMode ? modeMeta[activeMode].accent : 'var(--hybrid)';

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border/70 bg-background/80 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--hybrid), var(--comparator), var(--rail), var(--road), var(--air), transparent)',
        }}
      />
      <div className="relative mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 sm:h-16 sm:gap-4 sm:px-5">
        <Link
          href="/"
          onClick={resetSearch}
          className="group flex items-center gap-2.5"
          aria-label="LogiFlow home"
        >
          <div
            className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border shadow-[0_0_28px_-18px_var(--logo-accent)] transition-all duration-300 group-hover:shadow-[0_0_32px_-14px_var(--logo-accent)]"
            style={{
              ['--logo-accent' as string]: logoAccent,
              borderColor: activeMode
                ? accentMix(activeMode, 40, 'var(--border-strong)')
                : 'var(--border-strong)',
              color: logoAccent,
              background: activeMode
                ? `color-mix(in oklab, ${logoAccent} 14%, var(--surface-2))`
                : 'var(--surface-2)',
            }}
          >
            <LogiFlowMark className="absolute inset-[2px] h-[calc(100%-4px)] w-[calc(100%-4px)]" />
            <span
              className="absolute right-0.5 top-0.5 z-10 h-2 w-2 rounded-full border border-background shadow-sm"
              style={{ background: activeMode ? logoAccent : 'var(--live)' }}
            />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-bold sm:text-[14px]">LogiFlow</div>
            <div className="hidden text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground sm:block">
              Multimodal freight
            </div>
          </div>
        </Link>

        <nav className="relative hidden min-w-0 max-w-[min(100%,52rem)] items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-surface/60 p-1 md:flex [&::-webkit-scrollbar]:hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full opacity-40"
            style={{
              background:
                'radial-gradient(ellipse 80% 120% at 50% 100%, color-mix(in oklab, var(--hybrid) 8%, transparent), transparent 70%)',
            }}
          />
          <NavLinks items={navItems} isActive={isActive} />
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          {liveTrains.length > 0 && pathname?.startsWith('/railway') && (
            <div className="hidden items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 lg:flex">
              <span className="live-dot" />
              <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                <span className="font-mono text-foreground">{liveTrains.length}</span> live trains
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="grid h-8 w-8 place-items-center rounded-md border border-border bg-surface/60 text-muted-foreground transition-colors hover:text-foreground md:hidden"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          {isAuthed ? (
            <NotificationBell />
          ) : (
            <button
              type="button"
              className="hidden h-8 w-8 place-items-center rounded-md border border-border bg-surface/60 text-muted-foreground transition-colors hover:text-foreground sm:grid"
              aria-label="Alerts"
            >
              <Bell className="h-3.5 w-3.5" />
            </button>
          )}

          {isAuthed ? (
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 sm:flex">
                {user?.avatar && (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-7 w-7 rounded-full border border-border"
                  />
                )}
                <span className="text-[12px] font-medium text-muted-foreground hidden lg:inline">
                  {user?.name}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface/60 px-2.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:border-border-strong transition-all"
                title="Logout"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                aria-label="Smart Shipment Planner — sign in"
                className="btn-app btn-app-primary flex h-8 items-center gap-2 rounded-md bg-foreground px-2.5 text-[12px] font-semibold text-background"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="xs:hidden">Plan</span>
                <span className="hidden xs:inline sm:hidden">Planner</span>
                <span className="hidden sm:inline">Smart Shipment Planner</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/60 bg-background/95 px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            <NavLinks
              items={navItems}
              isActive={isActive}
              onNavigate={() => setMobileOpen(false)}
              compact
            />
          </nav>
        </div>
      )}
    </header>
  );
}
