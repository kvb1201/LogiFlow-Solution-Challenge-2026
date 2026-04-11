import Link from 'next/link';

const pipeline = [
  {
    step: '01',
    title: 'Booking & AWB',
    body: 'Capture shipment master data, dimensions, and dangerous-goods flags so the air leg stays compliant from the first mile.',
    icon: 'description',
  },
  {
    step: '02',
    title: 'Capacity & allotments',
    body: 'Align with airline allotments and seasonal capacity so proposals reflect what can actually lift—not just ideal schedules.',
    icon: 'inventory',
  },
  {
    step: '03',
    title: 'Cut-offs & SLA',
    body: 'Gate acceptance, screening, and ramp cut-offs drive whether cargo makes the flight; we surface those constraints next to rail and road.',
    icon: 'schedule',
  },
  {
    step: '04',
    title: 'First / last mile',
    body: 'Pair airport legs with surface modes: rail and road optimization in LogiFlow completes the door-to-door story.',
    icon: 'sync_alt',
  },
] as const;

export default function AirPage() {
  return (
    <div className="flex-1 flex flex-col overflow-x-hidden bg-[#06080d] min-h-0">
      <div className="relative border-b border-outline-variant/10 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute w-[520px] h-[520px] rounded-full opacity-[0.11] blur-[100px] bg-sky-500 -top-[40%] right-[-15%] animate-mesh-1" />
          <div className="absolute w-[420px] h-[420px] rounded-full opacity-[0.07] blur-[90px] bg-primary bottom-[-35%] left-[-10%] animate-mesh-2" />
        </div>
        <div className="relative max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 mb-4">
            <span
              className="material-symbols-outlined text-sky-300 leading-none"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
            >
              flight
            </span>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-sky-200/90">
              Airways pipeline
            </span>
          </div>
          <h1 className="font-headline text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-on-surface mb-3">
            Air cargo, orchestrated
          </h1>
          <p className="text-[15px] text-on-surface-variant max-w-2xl leading-relaxed">
            LogiFlow&apos;s airline pipeline is the express lane in a multimodal stack. Use this view
            to align stakeholders on how air fits with{' '}
            <Link href="/railway" className="text-primary hover:underline underline-offset-2">
              rail
            </Link>{' '}
            and{' '}
            <Link href="/road" className="text-secondary hover:underline underline-offset-2">
              road
            </Link>{' '}
            — same design language, one decision surface.
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-10 space-y-12">
        <section className="grid sm:grid-cols-3 gap-4">
          {[
            { k: 'Speed', v: 'Hours to metro pairs', icon: 'bolt', tone: 'text-sky-300' },
            { k: 'Fit', v: 'High value · time critical', icon: 'workspace_premium', tone: 'text-primary' },
            { k: 'Surface link', v: 'Feeder via road / rail', icon: 'hub', tone: 'text-tertiary' },
          ].map((x) => (
            <div
              key={x.k}
              className="rounded-xl border border-outline-variant/12 bg-surface-container-low/40 p-5 backdrop-blur-sm"
            >
              <span
                className={`material-symbols-outlined ${x.tone} mb-2 block`}
                style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1" }}
              >
                {x.icon}
              </span>
              <div className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">{x.k}</div>
              <div className="text-sm font-semibold text-on-surface">{x.v}</div>
            </div>
          ))}
        </section>

        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-outline mb-6">
            Pipeline stages
          </h2>
          <div className="space-y-4">
            {pipeline.map((p, i) => (
              <div
                key={p.step}
                className="group flex gap-4 sm:gap-6 rounded-2xl border border-outline-variant/12 bg-surface-container-low/30 p-5 sm:p-6 transition-colors hover:border-sky-400/20 hover:bg-surface-container-low/50"
              >
                <div className="shrink-0 flex flex-col items-center gap-2">
                  <span className="mono text-[10px] font-bold text-sky-400/80">{p.step}</span>
                  {i < pipeline.length - 1 && (
                    <div className="hidden sm:flex w-px flex-1 min-h-[2rem] bg-gradient-to-b from-sky-400/40 to-transparent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-3 mb-2">
                    <span
                      className="material-symbols-outlined text-sky-300/90 shrink-0"
                      style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1" }}
                    >
                      {p.icon}
                    </span>
                    <h3 className="font-headline text-lg font-bold text-on-surface pt-0.5">{p.title}</h3>
                  </div>
                  <p className="text-sm text-on-surface-variant leading-relaxed pl-0 sm:pl-9">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-transparent to-sky-500/5 p-6 sm:p-8">
          <h2 className="font-headline text-lg font-bold text-on-surface mb-2">Run a surface leg today</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed mb-6 max-w-xl">
            Live optimization APIs are wired for railways and roadways. Use them now; air-specific
            scoring and carrier feeds plug into this shell as your pipeline matures.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/railway"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-on-primary shadow-lg shadow-black/25 hover:opacity-95 transition-opacity"
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                train
              </span>
              Railways
            </Link>
            <Link
              href="/road"
              className="inline-flex items-center gap-2 rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-2.5 text-[13px] font-bold text-secondary hover:bg-secondary/15 transition-colors"
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                local_shipping
              </span>
              Roadways
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/25 px-4 py-2.5 text-[13px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Back to home
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
