-- International cargo route edges for the air optimization graph.
-- Merged at runtime with the checked-in OpenFlights snapshot.

CREATE TABLE IF NOT EXISTS air_routes (
    id BIGSERIAL PRIMARY KEY,
    source_iata TEXT NOT NULL,
    destination_iata TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    duration_hours DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT air_routes_source_len CHECK (char_length(source_iata) = 3),
    CONSTRAINT air_routes_dest_len CHECK (char_length(destination_iata) = 3),
    CONSTRAINT air_routes_source_upper CHECK (source_iata = upper(source_iata)),
    CONSTRAINT air_routes_dest_upper CHECK (destination_iata = upper(destination_iata)),
    CONSTRAINT air_routes_no_self_loop CHECK (source_iata <> destination_iata)
);

CREATE UNIQUE INDEX IF NOT EXISTS air_routes_pair_unique
    ON air_routes (source_iata, destination_iata);
CREATE INDEX IF NOT EXISTS air_routes_source_idx ON air_routes (source_iata);
CREATE INDEX IF NOT EXISTS air_routes_dest_idx ON air_routes (destination_iata);

COMMENT ON TABLE air_routes IS 'Directed cargo hub edges; distance/duration derived via Haversine + cruise heuristic.';
