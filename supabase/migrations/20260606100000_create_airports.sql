-- Global airport reference table (OurAirports-compatible).
-- Safe to re-run: uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS airports (
    id BIGSERIAL PRIMARY KEY,
    iata TEXT NOT NULL,
    icao TEXT,
    airport_name TEXT NOT NULL,
    city TEXT,
    country TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    timezone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT airports_iata_len CHECK (char_length(iata) = 3),
    CONSTRAINT airports_iata_upper CHECK (iata = upper(iata))
);

CREATE UNIQUE INDEX IF NOT EXISTS airports_iata_unique ON airports (iata);
CREATE INDEX IF NOT EXISTS airports_city_idx ON airports (city);
CREATE INDEX IF NOT EXISTS airports_country_idx ON airports (country);

COMMENT ON TABLE airports IS 'Global scheduled airports with valid IATA codes (OurAirports source).';
