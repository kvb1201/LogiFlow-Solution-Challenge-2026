'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchRailModelInfo, type RailMlQuantifier, type RailModelInfo } from '@/services/api';

const RAIL_DOC_PDF = '/docs/rail-ml-pipeline.pdf';

function formatValue(q: RailMlQuantifier): string {
  if (q.value == null || Number.isNaN(q.value)) return '—';
  return `${q.value}${q.unit === '%' ? '%' : ` ${q.unit}`}`;
}

export function RailMlQuantifiers({
  variant = 'panel',
  className = '',
}: {
  variant?: 'panel' | 'compact' | 'inline';
  className?: string;
}) {
  const [info, setInfo] = useState<RailModelInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchRailModelInfo()
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const quantifiers = info?.quantifiers?.slice(0, 3) ?? [];
  const docUrl = info?.documentation_url || RAIL_DOC_PDF;
  const modelLabel = info?.delay_model?.includes('scraped')
    ? 'Scraped delay ML'
    : info?.delay_model && info.delay_model !== 'None'
      ? 'Rail delay ML'
      : 'Delay model';

  if (variant === 'inline') {
    return (
      <div
        className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
        aria-label="Rail delay model validation metrics"
      >
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className="h-7 w-20 animate-pulse rounded-lg bg-surface-container/50"
              />
            ))
          : quantifiers.map((q) => (
              <span
                key={q.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/10 bg-surface-container/50 px-3 py-1.5 text-[11px] text-on-surface-variant backdrop-blur-sm"
                title={q.summary}
              >
                <span className="font-semibold uppercase tracking-wide text-rail/90">
                  {q.short_label}
                </span>
                <span className="font-mono font-bold text-rail">{formatValue(q)}</span>
              </span>
            ))}
        <DocLink href={docUrl} compact />
      </div>
    );
  }

  const isCompact = variant === 'compact';

  return (
    <section
      className={`rounded-xl border border-rail/20 bg-rail/5 ${isCompact ? 'p-4' : 'p-5 sm:p-6'} ${className}`}
      aria-label="Rail delay model validation metrics"
    >
      <div className={`flex flex-wrap items-start justify-between gap-3 ${isCompact ? 'mb-3' : 'mb-4'}`}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rail/90">
            Delay prediction model
          </p>
          <h3 className={`font-semibold text-foreground ${isCompact ? 'text-sm' : 'text-base'}`}>
            {loading ? 'Loading metrics…' : modelLabel}
          </h3>
          {!loading && info?.training_rows ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Trained on {info.training_rows.toLocaleString()} train-day samples ·{' '}
              {info.model_kind?.toUpperCase() || 'GBM'} · 5-fold GroupKFold
              {info.cv_metrics?.mae != null
                ? ` · CV MAE ${info.cv_metrics.mae.toFixed(1)} min`
                : ''}
            </p>
          ) : null}
        </div>
        <DocLink href={docUrl} />
      </div>

      <div className={`grid gap-3 ${isCompact ? 'grid-cols-3' : 'sm:grid-cols-3'}`}>
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-surface/60" />
            ))
          : quantifiers.map((q) => (
              <div
                key={q.id}
                className="rounded-xl border border-border/60 bg-surface/50 px-3 py-3 text-center backdrop-blur-sm"
                title={`${q.summary}\n\n${q.derivation}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {q.label}
                </p>
                <p
                  className={`mt-1 font-mono font-bold text-rail ${isCompact ? 'text-xl' : 'text-2xl'}`}
                >
                  {formatValue(q)}
                </p>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground line-clamp-2">
                  {q.summary}
                </p>
              </div>
            ))}
      </div>
    </section>
  );
}

function DocLink({ href, compact = false }: { href: string; compact?: boolean }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-surface/60 text-muted-foreground transition-colors hover:border-rail/40 hover:text-rail ${
        compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: compact ? 14 : 16 }}>
        picture_as_pdf
      </span>
      {compact ? 'PDF' : 'Full pipeline & ML doc'}
    </Link>
  );
}
