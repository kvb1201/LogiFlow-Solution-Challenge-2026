'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchRoadModelInfo, type RoadMlQuantifier, type RoadModelInfo } from '@/services/api';

const ROAD_DOC_PDF = '/docs/road-ml-pipeline.pdf';

function formatValue(q: RoadMlQuantifier): string {
  if (q.value == null || Number.isNaN(q.value)) return '—';
  return `${q.value}${q.unit === '%' ? '%' : ` ${q.unit}`}`;
}

export function RoadMlQuantifiers({
  variant = 'panel',
  className = '',
}: {
  variant?: 'panel' | 'compact' | 'inline';
  className?: string;
}) {
  const [info, setInfo] = useState<RoadModelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchRoadModelInfo()
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
  const docUrl = info?.documentation_url || ROAD_DOC_PDF;

  /* ── Inline variant (compact badge strip) ────────────────────────── */
  if (variant === 'inline') {
    return (
      <div
        className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
        aria-label="Road delay model validation metrics"
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
                <span className="font-semibold uppercase tracking-wide text-road/90">
                  {q.short_label}
                </span>
                <span className="font-mono font-bold text-road">{formatValue(q)}</span>
              </span>
            ))}
        <DocLink href={docUrl} compact />
      </div>
    );
  }

  const isCompact = variant === 'compact';

  /* ── Panel / compact variant ─────────────────────────────────────── */
  return (
    <section
      className={`rounded-xl border border-road/20 bg-road/5 ${isCompact ? 'p-4' : 'p-5 sm:p-6'} ${className}`}
      aria-label="Road delay model validation metrics"
    >
      {/* Header */}
      <div className={`flex flex-wrap items-start justify-between gap-3 ${isCompact ? 'mb-3' : 'mb-4'}`}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-road/90">
            Delay prediction model
          </p>
          <h3 className={`font-semibold text-foreground ${isCompact ? 'text-sm' : 'text-base'}`}>
            {loading ? 'Loading metrics…' : (info?.delay_model ?? 'Road Delay Prediction ML')}
          </h3>
          {!loading && info?.training_rows ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Trained on {info.training_rows.toLocaleString()} logistics events ·{' '}
              {info.model_kind || 'HistGradientBoostingClassifier'} · 5-Fold Cross Validation
            </p>
          ) : null}
        </div>
        <DocLink href={docUrl} />
      </div>

      {/* Three quantifier cards */}
      <div className={`grid gap-3 ${isCompact ? 'grid-cols-1 min-[360px]:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
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
                  className={`mt-1 font-mono font-bold text-road ${isCompact ? 'text-xl' : 'text-2xl'}`}
                >
                  {formatValue(q)}
                </p>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground line-clamp-2">
                  {q.summary}
                </p>
              </div>
            ))}
      </div>

      {/* Model Info panel (expandable) */}
      {!loading && info && (
        <div className="mt-4">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-surface/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-road/30 hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                info
              </span>
              Model details &amp; technical metrics
            </span>
            <span
              className="material-symbols-outlined transition-transform duration-200"
              style={{ fontSize: 16, transform: expanded ? 'rotate(180deg)' : 'none' }}
            >
              expand_more
            </span>
          </button>

          {expanded && (
            <div className="mt-2 space-y-3 rounded-xl border border-border/40 bg-surface/30 p-4 text-xs text-muted-foreground">
              {/* Model info */}
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-road/80">
                  Model Information
                </p>
                <div className="grid gap-1">
                  <InfoRow label="Model" value={info.delay_model ?? 'Road Delay Prediction ML'} />
                  <InfoRow label="Training" value={`${info.training_rows?.toLocaleString()} logistics events`} />
                  <InfoRow label="Algorithm" value={info.model_kind ?? 'HistGradientBoostingClassifier'} />
                  <InfoRow label="Validation" value={info.validation ?? '5-Fold Cross Validation'} />
                  <InfoRow label="Target" value="Shipment Delay Risk" />
                </div>
              </div>

              {/* Features */}
              {info.features && info.features.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-road/80">
                    Primary Features
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {info.features.map((f) => (
                      <span
                        key={f}
                        className="rounded-md border border-road/15 bg-road/8 px-2 py-0.5 text-[10px] font-medium text-foreground/80"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Technical metrics */}
              {info.cv_metrics && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-road/80">
                    Technical Metrics
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                    <MetricRow
                      label="Accuracy"
                      value={info.cv_metrics.accuracy}
                      hint="How often the model is correct overall"
                    />
                    <MetricRow
                      label="Precision"
                      value={info.cv_metrics.precision}
                      hint="When model flags a delay, how often it's right"
                    />
                    <MetricRow
                      label="Recall"
                      value={info.cv_metrics.recall}
                      hint="Percentage of actual delays the model catches"
                    />
                    <MetricRow
                      label="F1 Score"
                      value={info.cv_metrics.f1_score}
                      hint="Balance between precision and recall"
                    />
                    <MetricRow
                      label="ROC-AUC"
                      value={info.cv_metrics.roc_auc}
                      hint="Model's ability to distinguish delayed vs on-time"
                    />
                    <MetricRow
                      label="CV ROC-AUC"
                      value={info.cv_metrics.cv_roc_auc}
                      hint="Reliability across five independent test folds"
                    />
                  </div>
                </div>
              )}

              {/* Derivation details */}
              {quantifiers.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-road/80">
                    Derivation Details
                  </p>
                  <div className="space-y-2">
                    {quantifiers.map((q) => (
                      <div key={q.id} className="rounded-lg border border-border/30 bg-surface/40 p-2.5">
                        <p className="mb-0.5 text-[10px] font-semibold text-foreground/90">{q.label}</p>
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          {q.derivation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function DocLink({ href, compact = false }: { href: string; compact?: boolean }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-surface/60 text-muted-foreground transition-colors hover:border-road/40 hover:text-road ${
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[10px] text-muted-foreground/80">{label}</span>
      <span className="text-[11px] font-medium text-foreground/90 text-right">{value}</span>
    </div>
  );
}

function MetricRow({
  label,
  value,
  hint,
}: {
  label: string;
  value?: number;
  hint: string;
}) {
  if (value == null) return null;
  return (
    <div className="py-0.5" title={hint}>
      <span className="text-[10px] text-muted-foreground/80">{label}</span>
      <span className="ml-1.5 font-mono text-[11px] font-bold text-road">{value}%</span>
    </div>
  );
}
