-- OTP baselines for international airports and regional fallbacks.

CREATE TABLE IF NOT EXISTS otp_baselines (
    id BIGSERIAL PRIMARY KEY,
    airport_iata TEXT,
    otp_score DOUBLE PRECISION NOT NULL,
    region TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT otp_baselines_score_range CHECK (otp_score >= 0 AND otp_score <= 1),
    CONSTRAINT otp_baselines_airport_len CHECK (
        airport_iata IS NULL OR char_length(airport_iata) = 3
    ),
    CONSTRAINT otp_baselines_airport_upper CHECK (
        airport_iata IS NULL OR airport_iata = upper(airport_iata)
    ),
    CONSTRAINT otp_baselines_region_upper CHECK (
        region IS NULL OR region = upper(region)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS otp_baselines_airport_unique
    ON otp_baselines (airport_iata)
    WHERE airport_iata IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS otp_baselines_region_unique
    ON otp_baselines (region)
    WHERE airport_iata IS NULL AND region IS NOT NULL;

CREATE INDEX IF NOT EXISTS otp_baselines_region_idx ON otp_baselines (region);

COMMENT ON TABLE otp_baselines IS 'Airport-specific OTP scores and regional/global defaults for congestion scoring.';
