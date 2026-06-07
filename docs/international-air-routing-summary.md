# International Air Routing — Implementation Summary

## Modified Files

| File | Why |
|------|-----|
| `backend/app/services/weather_service.py` | Added coordinate-based OpenWeather lookup; kept city query for backward compatibility |
| `backend/app/services/air_weather_service.py` | Resolves airports first; fetches weather by lat/lng |
| `backend/app/services/otp_scoring_service.py` | Extended baseline lookup with airport/region/global fallback chain |
| `backend/app/services/airport_locator_service.py` | IATA input, international city map, Supabase/CSV lookup, global nearest-airport |
| `backend/app/services/air_data_service.py` | Merged international route graph; expanded airline codes; intl edge distances |
| `backend/app/services/geocoding_service.py` | Exposed global geocoding wrapper for air pipeline |
| `backend/app/services/geocoder.py` | Added `geocode_latlng_global` without India-only suffix |
| `backend/app/pipelines/air/ml_models.py` | OTP scoring uses departure airport local time |
| `backend/app/pipelines/air/pipeline.py` | Additive schedule/timezone fields on `air_details` |
| `backend/app/pipelines/air/config.py` | International airline reliability scores |

## New Files

| File | Why |
|------|-----|
| `supabase/migrations/20260606100000_create_airports.sql` | Global airports table |
| `supabase/migrations/20260606100001_create_air_routes.sql` | International route edges |
| `supabase/migrations/20260606100002_create_otp_baselines.sql` | OTP baselines + regional defaults |
| `backend/app/services/air_store.py` | Supabase REST access with CSV fallbacks |
| `backend/app/services/air_timezone_service.py` | UTC/local schedule computation |
| `backend/data/international_airports.csv` | Offline hub airports with timezone |
| `backend/data/international_routes.csv` | Offline international hub edges |
| `backend/data/otp-regions.json` | Regional + international OTP baselines |
| `scripts/package.json` | Node dependencies for seed scripts |
| `scripts/seedAirports.js` | Download OurAirports → Supabase |
| `scripts/seedRoutes.js` | Seed routes + OTP baselines |
| `backend/tests/test_international_air.py` | International + regression tests |
| `docs/international-air-routing.md` | Full architecture documentation |
| `docs/international-air-routing-summary.md` | This file |

## Unchanged (Backward Compatibility)

| Asset | Status |
|-------|--------|
| `backend/data/airports.csv` | India snapshot unchanged |
| `backend/data/routes.dat` | India OpenFlights routes unchanged |
| `backend/data/otp-baselines.json` | Indian month-level OTP unchanged |
| `POST /air/optimize` contract | Same request/response; additive fields only |
| `backend/scripts/fetch_air_data.py` | Still produces India-only snapshots |
| Congestion scoring formula | Unchanged |
| Optimizer ranking engine | Unchanged |

## Assumptions

1. **Supabase is optional** — system works offline using checked-in CSV/JSON fallbacks (same pattern as rail geometry cache).
2. **Indian airports default to `Asia/Kolkata`** when timezone is absent from the India CSV.
3. **International route edges** use precomputed Haversine distance + 720 km/h cruise heuristic (same as domestic).
4. **`INT` pseudo-airline code** marks international hub edges without OpenFlights airline data.
5. **OTP baselines for international hubs** are approximate until live ETL is wired.
6. **Cost currency remains INR** — pricing model not internationalized (display only).

## Manual Steps Required

1. Apply Supabase migrations (`supabase db push` or manual SQL).
2. Run seed scripts with credentials:

   ```bash
   cd scripts
   npm install
   SUPABASE_URL=... SUPABASE_KEY=... npm run seed:all
   ```

3. Ensure `OPENWEATHER_API_KEY` is set for live weather (fallback values used otherwise).
4. Restart backend after env changes.

## Limitations

- Full worldwide airport coverage requires Supabase seed; offline CSV covers major hubs only.
- International routes are hub-edge subset, not full OpenFlights global graph.
- One-stop OTP does not yet propagate hub inbound delay.
- Geocoding for unknown international cities depends on Nominatim rate limits.
- `seedRoutes.js` region OTP upsert uses select-then-insert for regional rows (no native partial unique upsert via REST).
- BOM→JFK may return one-stop routes (DXB/FRA/LHR hubs) rather than direct.

## Recommended Future Improvements

1. Replace approximate OTP with DGCA / EUROCONTROL / FAA feeds.
2. Download full global OpenFlights routes in `fetch_air_data.py` (optional mode).
3. Wire Supabase airport lookup cache invalidation on seed.
4. Add `/air/airports?q=` lookup endpoint for frontend autocomplete.
5. Multi-currency cost breakdown for international corridors.
6. Train ML delay model on international hub data when available.

## Test Results

All tests passing at implementation time:

```
test_otp*.py          — 22 tests OK
test_*air*.py         — 15 tests OK
verify_air_data.py    — 115 airports, 1051 routes OK
```

Validated corridors: BLR→DXB, DEL→FRA, JFK→LHR, SIN→HKG, LAX→NRT, SIN→SYD, BOM→JFK (one-stop), DEL→BOM (regression).
