-- Public read-only snapshot of rail delay ML metrics for Vercel (no Render cold start).
CREATE TABLE IF NOT EXISTS public.rail_ml_metrics (
  id text PRIMARY KEY DEFAULT 'current',
  payload jsonb NOT NULL,
  trained_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rail_ml_metrics IS
  'Latest rail delay ML model-info payload (quantifiers, CV metrics, backtests).';
