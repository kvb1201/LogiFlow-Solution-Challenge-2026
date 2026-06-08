#!/usr/bin/env node
/**
 * Download OurAirports dataset, filter valid IATA airports, and upsert into Supabase.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_KEY=... node seedAirports.js
 *
 * Optional:
 *   OURAIRPORTS_URL — override dataset URL
 *   BATCH_SIZE — rows per upsert batch (default 500)
 */
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { find } from "geo-tz";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OURAIRPORTS_URL =
  process.env.OURAIRPORTS_URL || "https://ourairports.com/data/airports.csv";
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 500);
const VALID_TYPES = new Set(["large_airport", "medium_airport", "small_airport"]);
const SCHEDULED = new Set(["yes", "1", "true", "True"]);

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_KEY = (
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ""
).trim();

async function downloadCsv(url) {
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url, { headers: { "User-Agent": "LogiFlow-seedAirports/1.0" } });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function mapCountry(isoCountry, municipality) {
  const map = {
    US: "United States",
    GB: "United Kingdom",
    AE: "United Arab Emirates",
    IN: "India",
    SG: "Singapore",
    HK: "Hong Kong",
    KR: "South Korea",
    JP: "Japan",
    QA: "Qatar",
    TR: "Turkey",
    AU: "Australia",
    CA: "Canada",
    DE: "Germany",
    FR: "France",
    NL: "Netherlands",
  };
  return map[isoCountry] || isoCountry;
}

function cleanAirports(csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true });
  const seen = new Set();
  const airports = [];
  let skipped = 0;

  for (const row of rows) {
    const iata = (row.iata_code || "").trim().toUpperCase();
    if (iata.length !== 3 || seen.has(iata)) {
      skipped += 1;
      continue;
    }
    if (!VALID_TYPES.has(row.type)) {
      skipped += 1;
      continue;
    }
    if (!SCHEDULED.has(String(row.scheduled_service || ""))) {
      skipped += 1;
      continue;
    }

    const lat = Number(row.latitude_deg);
    const lng = Number(row.longitude_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped += 1;
      continue;
    }

    let timezone = null;
    try {
      timezone = find(lat, lng)[0] || null;
    } catch {
      timezone = null;
    }

    seen.add(iata);
    airports.push({
      iata,
      icao: (row.ident || row.gps_code || "").trim().toUpperCase() || null,
      airport_name: row.name || iata,
      city: row.municipality || null,
      country: mapCountry(row.iso_country, row.municipality),
      latitude: lat,
      longitude: lng,
      timezone,
    });
  }

  return { airports, skipped };
}

async function upsertBatches(supabase, airports) {
  let inserted = 0;
  for (let i = 0; i < airports.length; i += BATCH_SIZE) {
    const batch = airports.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("airports").upsert(batch, { onConflict: "iata" });
    if (error) {
      throw new Error(`Upsert failed at batch ${i}: ${error.message}`);
    }
    inserted += batch.length;
    console.log(`Upserted ${inserted}/${airports.length} airports ...`);
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY (or SUPABASE_ANON_KEY) are required");
  }

  const csvText = await downloadCsv(OURAIRPORTS_URL);
  const { airports, skipped } = cleanAirports(csvText);

  console.log(`Prepared ${airports.length} airports (skipped ${skipped} invalid rows)`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  await upsertBatches(supabase, airports);

  const sample = ["BLR", "DXB", "FRA", "JFK", "LHR", "SIN"];
  for (const code of sample) {
    const row = airports.find((a) => a.iata === code);
    if (row) {
      console.log(`  ${code}: ${row.city}, ${row.country} (${row.timezone})`);
    }
  }

  console.log("Airport seed complete.");
}

main().catch((err) => {
  console.error("seedAirports failed:", err.message);
  process.exit(1);
});
