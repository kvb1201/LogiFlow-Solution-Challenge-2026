import Link from 'next/link';

const modes = [
  {
    href: '/railway',
    title: 'Railways',
    tagline: 'Parcel vans, live tracking & delay intelligence',
    icon: 'train',
    gradient: 'from-[#1e3a5f]/80 to-[#0a1628]/90',
    border: 'border-primary/25',
    iconBg: 'bg-primary/15 text-primary',
    glow: 'bg-primary/20',
  },
  {
    href: '/road',
    title: 'Roadways',
    tagline: 'Traffic-aware routing, tolls & ML risk scoring',
    icon: 'local_shipping',
    gradient: 'from-[#4a2c1a]/80 to-[#1a0f08]/90',
    border: 'border-secondary/30',
    iconBg: 'bg-secondary/15 text-secondary',
    glow: 'bg-secondary/20',
  },
  {
    href: '/air',
    title: 'Airways',
    tagline: 'Express air cargo pipeline & cut-off orchestration',
    icon: 'flight_takeoff',
    gradient: 'from-[#0c3449]/80 to-[#061018]/90',
    border: 'border-sky-400/25',
    iconBg: 'bg-sky-400/15 text-sky-300',
    glow: 'bg-sky-400/15',
  },
  {
    href: '/hybrid',
    title: 'Hybrid',
    tagline: 'Unified recommendation across road, rail, and air',
    icon: 'hub',
    gradient: 'from-[#32225a]/80 to-[#120b22]/90',
    border: 'border-tertiary/30',
    iconBg: 'bg-tertiary/15 text-tertiary',
    glow: 'bg-tertiary/20',
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden bg-[#06080d] text-on-surface">
      {/* Ambient */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute w-[min(100vw,900px)] h-[min(100vw,900px)] rounded-full opacity-[0.12] blur-[120px] bg-primary -top-[20%] -left-[15%] animate-mesh-1" />
        <div className="absolute w-[min(80vw,640px)] h-[min(80vw,640px)] rounded-full opacity-[0.1] blur-[100px] bg-tertiary bottom-[-15%] right-[-10%] animate-mesh-2" />
        <div className="absolute w-[min(60vw,480px)] h-[min(60vw,480px)] rounded-full opacity-[0.08] blur-[90px] bg-sky-500 top-[40%] left-[50%] animate-mesh-3" />
        <div
          className="absolute inset-0 opacity-[0.22] hero-dot-grid"
          style={{ maskImage: 'radial-gradient(ellipse 70% 60% at 50% 35%, black, transparent)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 55% at 50% -10%, rgba(172,199,255,0.08), transparent 55%)',
          }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Hero */}
        <section className="px-5 sm:px-8 pt-10 sm:pt-14 pb-12 max-w-6xl mx-auto w-full">
          <div className="flex flex-wrap items-center gap-3 mb-8 animate-slide-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-tertiary animate-pulse" />
              Multimodal logistics · India
            </span>
          </div>

          <h1 className="font-headline text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-black tracking-tight leading-[1.05] mb-5 animate-slide-up">
            <span className="bg-gradient-to-r from-primary via-[#c8d9ff] to-primary bg-clip-text text-transparent [background-size:200%_auto] animate-gradient-shift">
              LogiFlow
            </span>
            <br />
            <span className="text-on-surface">moves cargo smarter</span>
          </h1>

          <p className="text-base sm:text-lg text-on-surface-variant max-w-2xl leading-relaxed mb-10 animate-slide-up [animation-delay:80ms] opacity-0 [animation-fill-mode:forwards]">
            One platform to plan and compare{' '}
            <strong className="text-on-surface font-semibold">rail, road, air, and hybrid</strong> options
            with real data where it matters—schedules, traffic, risk, and live visibility—so teams ship
            with confidence across India.
          </p>
        </section>

        {/* About */}
        <section className="px-5 sm:px-8 pb-14 max-w-6xl mx-auto w-full">
          <div className="grid md:grid-cols-2 gap-5 lg:gap-6">
            <article className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/50 backdrop-blur-sm p-6 sm:p-8">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary mb-3">
                About us
              </h2>
              <p className="text-[15px] text-on-surface-variant leading-relaxed">
                LogiFlow is built for operators who juggle tight budgets, deadlines, and uncertain
                networks. We combine optimization engines with live feeds—like RailRadar for
                railways—so you see not just a route, but cost, time, risk, and what is happening on
                the ground right now.
              </p>
            </article>
            <article className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/50 backdrop-blur-sm p-6 sm:p-8">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-tertiary mb-3">
                What you can do
              </h2>
              <ul className="space-y-3 text-[15px] text-on-surface-variant leading-relaxed">
                <li className="flex gap-3">
                  <span
                    className="material-symbols-outlined text-primary shrink-0 mt-0.5"
                    style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                  <span>
                    <strong className="text-on-surface">Railways</strong> — optimize parcel-friendly
                    trains, compare cheapest / fastest / safest, and inspect delays &amp; live
                    position on the map.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span
                    className="material-symbols-outlined text-secondary shrink-0 mt-0.5"
                    style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                  <span>
                    <strong className="text-on-surface">Roadways</strong> — run road optimization with
                    traffic awareness, toll and vehicle preferences, and side-by-side route
                    comparison.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span
                    className="material-symbols-outlined text-sky-300 shrink-0 mt-0.5"
                    style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                  <span>
                    <strong className="text-on-surface">Airways</strong> — explore the air cargo
                    pipeline: cut-offs, capacity story, and how express fits next to surface modes.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span
                    className="material-symbols-outlined text-tertiary shrink-0 mt-0.5"
                    style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                  <span>
                    <strong className="text-on-surface">Hybrid</strong> — compare all modes together and
                    get a final recommendation with transparent tradeoffs.
                  </span>
                </li>
              </ul>
            </article>
          </div>
        </section>

        {/* Mode picker */}
        <section className="px-5 sm:px-8 pb-20 max-w-6xl mx-auto w-full">
          <h2 className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-outline mb-8">
            Choose a mode
          </h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
            {modes.map((m, i) => (
              <Link
                key={m.href}
                href={m.href}
                className={`group relative flex flex-col rounded-2xl border ${m.border} bg-gradient-to-br ${m.gradient} p-6 sm:p-7 min-h-[220px] overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <div
                  className={`pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full blur-3xl opacity-40 group-hover:opacity-70 transition-opacity ${m.glow}`}
                />
                <div
                  className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 ${m.iconBg}`}
                >
                  <span
                    className="material-symbols-outlined leading-none"
                    style={{
                      fontSize: '26px',
                      fontVariationSettings: "'FILL' 1, 'wght' 500",
                    }}
                  >
                    {m.icon}
                  </span>
                </div>
                <h3 className="font-headline text-xl font-bold text-on-surface mb-2">{m.title}</h3>
                <p className="text-sm text-on-surface-variant/90 leading-relaxed flex-1">{m.tagline}</p>
                <div className="mt-6 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-primary group-hover:text-primary-fixed-dim transition-colors">
                  Open
                  <span
                    className="material-symbols-outlined text-base transition-transform group-hover:translate-x-1"
                    style={{ fontVariationSettings: "'FILL' 0" }}
                  >
                    arrow_forward
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <footer className="mt-auto border-t border-outline-variant/10 py-6 px-5 text-center text-[10px] text-outline/60 uppercase tracking-widest">
          LogiFlow · Multimodal cargo intelligence
        </footer>
      </div>
    </div>
  );
}
