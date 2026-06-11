-- Compressed compose leg cache (L3) + rural hub-pair discovery cache.

CREATE TABLE IF NOT EXISTS public.compose_leg_cache (
  leg_key text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('hit', 'fail')),
  payload_gz_b64 text,
  corridor_tags text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  hit_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compose_leg_cache_expires_idx
  ON public.compose_leg_cache (expires_at);

COMMENT ON TABLE public.compose_leg_cache IS
  'Gzip-compressed minimal pipeline legs for hybrid/rural compose; survives Render restarts.';

CREATE TABLE IF NOT EXISTS public.rural_hub_cache (
  cache_key text PRIMARY KEY,
  payload_gz_b64 text NOT NULL,
  expires_at timestamptz NOT NULL,
  hit_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rural_hub_cache_expires_idx
  ON public.rural_hub_cache (expires_at);

COMMENT ON TABLE public.rural_hub_cache IS
  'Cached rural hub-pair lists keyed by geohash grid cells (~20 km).';
