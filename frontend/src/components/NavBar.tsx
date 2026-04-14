'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLogiFlowStore } from '@/store/useLogiFlowStore';

const nav = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/railway', label: 'Railways', icon: 'train' },
  { href: '/road', label: 'Roadways', icon: 'local_shipping' },
  { href: '/air', label: 'Airways', icon: 'flight_takeoff' },
  { href: '/hybrid', label: 'Hybrid', icon: 'hub' },
] as const;

export default function NavBar() {
  const pathname = usePathname();
  const liveTrains = useLogiFlowStore((s) => s.liveTrains);
  const resetSearch = useLogiFlowStore((s) => s.resetSearch);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
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
          </div>
        )}
        <span className="text-[9px] text-outline/45 hidden lg:block font-mono tracking-widest uppercase">
          Multimodal · IN
        </span>
      </div>
    </header>
  );
}
