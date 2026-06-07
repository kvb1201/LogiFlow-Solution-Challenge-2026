#!/usr/bin/env node
/**
 * Seed international cargo hub routes and OTP baselines into Supabase.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_KEY=... node seedRoutes.js
 *
 * Reads backend/data/international_routes.csv and otp-regions.json when present.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ROUTES_CSV = path.join(REPO_ROOT, "backend", "data", "international_routes.csv");
const OTP_REGIONS_JSON = path.join(REPO_ROOT, "backend", "data", "otp-regions.json");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_KEY = (
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ""
).trim();

const HUB_AIRPORTS = [
  "BLR", "BOM", "DEL", "DXB", "SIN", "FRA", "LHR", "JFK", "AMS", "CDG",
  "HKG", "NRT", "ICN", "ORD", "LAX", "DOH", "IST", "SYD", "YYZ",
];

function loadRoutes() {
  if (!fs.existsSync(ROUTES_CSV)) {
    throw new Error(`Missing routes CSV: ${ROUTES_CSV}`);
  }
  const text = fs.readFileSync(ROUTES_CSV, "utf8");
  const rows = parse(text, { columns: true, skip_empty_lines: true });
  const seen = new Set();
  const routes = [];

  for (const row of rows) {
    const source = (row.source_iata || "").trim().toUpperCase();
    const dest = (row.destination_iata || "").trim().toUpperCase();
    const key = `${source}->${dest}`;
    if (source.length !== 3 || dest.length !== 3 || source === dest || seen.has(key)) {
      continue;
    }
    seen.add(key);
    routes.push({
      source_iata: source,
      destination_iata: dest,
      distance_km: Number(row.distance_km),
      duration_hours: Number(row.duration_hours),
    });
  }
  return routes;
}

function loadOtpBaselines() {
  const baselines = [];
  if (fs.existsSync(OTP_REGIONS_JSON)) {
    const data = JSON.parse(fs.readFileSync(OTP_REGIONS_JSON, "utf8"));
    for (const [region, score] of Object.entries(data.regions || {})) {
      baselines.push({ airport_iata: null, region, otp_score: Number(score) });
    }
    for (const [iata, score] of Object.entries(data.airports || {})) {
      const region = (data.airportRegions || {})[iata] || null;
      baselines.push({ airport_iata: iata, region, otp_score: Number(score) });
    }
  } else {
    for (const iata of HUB_AIRPORTS) {
      baselines.push({ airport_iata: iata, region: null, otp_score: 0.8 });
    }
    baselines.push({ airport_iata: null, region: "GLOBAL", otp_score: 0.76 });
  }
  return baselines;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY (or SUPABASE_ANON_KEY) are required");
  }

  const routes = loadRoutes();
  const otpBaselines = loadOtpBaselines();
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`Upserting ${routes.length} air routes ...`);
  const { error: routeError } = await supabase
    .from("air_routes")
    .upsert(routes, { onConflict: "source_iata,destination_iata" });
  if (routeError) {
    throw new Error(`Route upsert failed: ${routeError.message}`);
  }

  console.log(`Upserting ${otpBaselines.length} OTP baselines ...`);
  for (const row of otpBaselines) {
    if (row.airport_iata) {
      const { error } = await supabase
        .from("otp_baselines")
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "airport_iata" });
      if (error) {
        throw new Error(`OTP airport upsert failed for ${row.airport_iata}: ${error.message}`);
      }
    } else if (row.region) {
      const { data: existing } = await supabase
        .from("otp_baselines")
        .select("id")
        .is("airport_iata", null)
        .eq("region", row.region)
        .limit(1);
      if (existing && existing.length) {
        await supabase.from("otp_baselines").update({ otp_score: row.otp_score }).eq("id", existing[0].id);
      } else {
        await supabase.from("otp_baselines").insert({ ...row, updated_at: new Date().toISOString() });
      }
    }
  }

  const corridors = [
    ["BLR", "DXB"],
    ["DXB", "FRA"],
    ["FRA", "JFK"],
    ["DEL", "SIN"],
    ["SIN", "SYD"],
    ["BOM", "LHR"],
    ["LHR", "YYZ"],
  ];
  for (const [src, dst] of corridors) {
    const hit = routes.find((r) => r.source_iata === src && r.destination_iata === dst);
    console.log(`  ${src} → ${dst}: ${hit ? "OK" : "MISSING"}`);
  }

  console.log("Route and OTP baseline seed complete.");
}

main().catch((err) => {
  console.error("seedRoutes failed:", err.message);
  process.exit(1);
});
