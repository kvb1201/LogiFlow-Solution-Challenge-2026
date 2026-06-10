"""
Water pipeline engineer — Phase 3.

Changes from Phase 2:
  - disruption_risk: 6th risk component from DISRUPTIONS_BY_PORT
    weighted by severity (RED/ORANGE/GREEN) and recency (< 1 year × 1.5)
    across all ports on the path
  - risk_breakdown: now all 6 components (matches config.py RISK_WEIGHTS)
  - active_disruptions: populated from DISRUPTIONS_BY_PORT (no longer a stub)
  - New helper: _disruption_risk_score(port_ids) → float
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.pipelines.water.config import (
    CHOKEPOINTS,
    PORT_HANDLING_HOURS,
    RISK_WEIGHTS,
    ROAD_COST_PER_KM_PER_TON_INR,
    ROAD_HANDLING_BASE_INR,
    SEA_COST_BASE_PER_KG_INR,
    SEA_COST_PER_KG_PER_NM_INR,
    TRANSSHIPMENT_EXTRA_HOURS,
    TRANSSHIPMENT_FEE_INR,
    TRUCK_SPEED_KMPH,
    VESSEL_SPEED_KNOTS,
    PORT_FEE_BASE_INR,
    PORTS,
)
from app.pipelines.water.marine_weather_service import get_route_weather_risk
from app.pipelines.water.ml_models import (
    get_route_chokepoints,
    predict_chokepoint_stress,
    predict_eta_adjustment,
    predict_port_congestion,
    get_chokepoint_names,
)
from app.pipelines.water.ports import haversine_km
from app.pipelines.water.route_generator import port_coords, port_name, sea_distance_km
from app.utils.coordinates import get_coords
from app.services.geocoder import geocode_latlng_global

log = logging.getLogger(__name__)


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _km_to_nm(km: float) -> float:
    return float(km) / 1.852


def _port_meta(port_id: str) -> dict:
    """Look up port metadata from the config PORTS list."""
    for p in PORTS:
        if str(p.get("id")) == str(port_id):
            return p
    return {}


# Known international city → (lat, lng) for water pipeline road legs.
# Avoids the India-biased geocoder returning "Dubai, Uttar Pradesh" etc.
_INTL_CITY_COORDS: dict[str, tuple[float, float]] = {
    "dubai":        (25.2048,  55.2708),
    "abu dhabi":    (24.4539,  54.3773),
    "jeddah":       (21.4858,  39.1925),
    "riyadh":       (24.7136,  46.6753),
    "muscat":       (23.5880,  58.3829),
    "doha":         (25.2854,  51.5310),
    "kuwait city":  (29.3759,  47.9774),
    "rotterdam":    (51.9244,   4.4777),
    "amsterdam":    (52.3676,   4.9041),
    "antwerp":      (51.2194,   4.4025),
    "hamburg":      (53.5753,   9.9954),
    "london":       (51.5074,  -0.1278),
    "paris":        (48.8566,   2.3522),
    "barcelona":    (41.3851,   2.1734),
    "marseille":    (43.2965,   5.3698),
    "singapore":    ( 1.3521, 103.8198),
    "kuala lumpur": ( 3.1390, 101.6869),
    "jakarta":      (-6.2088, 106.8456),
    "bangkok":      (13.7563, 100.5018),
    "ho chi minh":  (10.7769, 106.7009),
    "manila":       (14.5995, 120.9842),
    "hong kong":    (22.3193, 114.1694),
    "shanghai":     (31.2304, 121.4737),
    "beijing":      (39.9042, 116.4074),
    "shenzhen":     (22.5431, 114.0579),
    "guangzhou":    (23.1291, 113.2644),
    "tokyo":        (35.6762, 139.6503),
    "osaka":        (34.6937, 135.5023),
    "busan":        (35.1796, 129.0756),
    "seoul":        (37.5665, 126.9780),
    "sydney":       (-33.8688, 151.2093),
    "melbourne":    (-37.8136, 144.9631),
    "new york":     (40.7128, -74.0060),
    "los angeles":  (34.0522, -118.2437),
    "houston":      (29.7604, -95.3698),
    "miami":        (25.7617, -80.1918),
    "santos":       (-23.9619, -46.3342),
    "rio de janeiro": (-22.9068, -43.1729),
    "cape town":    (-33.9249,  18.4241),
    "durban":       (-29.8587,  31.0218),
    "nairobi":      (-1.2921,  36.8219),
    "lagos":        ( 6.5244,   3.3792),
    "casablanca":   (33.5731,  -7.5898),
    "colombo":      ( 6.9271,  79.8612),
    "karachi":      (24.8607,  67.0011),
    "istanbul":     (41.0082,  28.9784),
    "cairo":        (30.0444,  31.2357),
    "alexandria":   (31.2001,  29.9187),
}


def _get_city_coords(city: str) -> tuple[float, float] | None:
    """
    Resolve city coordinates for road leg calculation.
    Priority:
      1. Known international city table (fast, no API)
      2. India-biased static lookup (for Indian cities)
      3. Global geocoder (API call)
    Returns None if the city can't be resolved.
    """
    key = city.strip().lower()
    # Strip country suffix for lookup
    for suffix in [", india", ", uae", ", uk", ", usa", ", netherlands", ", germany", ", singapore", ", china"]:
        key = key.removesuffix(suffix)

    # 1. International table
    if key in _INTL_CITY_COORDS:
        return _INTL_CITY_COORDS[key]
    # partial match
    for k, v in _INTL_CITY_COORDS.items():
        if k in key or key in k:
            return v

    # 2. Indian static table (handles Indian cities correctly)
    coords = get_coords(city)
    if coords:
        return coords

    # 3. Global geocoder as last resort
    coords = geocode_latlng_global(city)
    return coords


def _parse_departure_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        log.warning("[engineer] Invalid departure_date '%s' — using current date", value)
        return datetime.now()


def _disruption_risk_score(port_ids: list[str]) -> tuple[float, list[dict]]:
    """
    Compute a disruption risk score across all ports on the path.

    Severity weights:
      RED    → 0.15 per event
      ORANGE → 0.08 per event
      GREEN  → 0.03 per event

    Recency multiplier: events within the last 12 months get × 1.5.
    Lookback window: 5 years.

    Returns (score 0.0–1.0, list of active disruption summary dicts).
    """
    try:
        from app.pipelines.water.data_loader import DISRUPTIONS_BY_PORT
    except Exception:
        return 0.0, []

    severity_weights = {"RED": 0.15, "ORANGE": 0.08, "GREEN": 0.03}
    recency_mult  = 1.5
    lookback_years = 5
    current_year  = datetime.now(timezone.utc).year

    score = 0.0
    active: list[dict] = []
    seen_event_ids: set[str] = set()

    for port_id in port_ids:
        events = DISRUPTIONS_BY_PORT.get(port_id, [])
        for ev in events:
            if ev.year < current_year - lookback_years:
                continue
            w = severity_weights.get(ev.alertlevel, 0.03)
            if ev.year >= current_year - 1:
                w = w * recency_mult
            score += w

            # Collect unique active events for the route output
            if ev.eventid not in seen_event_ids and ev.alertlevel in {"RED", "ORANGE"}:
                seen_event_ids.add(ev.eventid)
                active.append({
                    "event_id":   ev.eventid,
                    "event_type": ev.eventtype,
                    "event_name": ev.eventname,
                    "alert":      ev.alertlevel,
                    "country":    ev.country,
                    "year":       ev.year,
                })

    n = max(len(port_ids), 1)
    normalised = round(min(1.0, score / n), 3)
    return normalised, active


def _road_leg(
    city: str,
    port_lat: float,
    port_lng: float,
) -> tuple[float, float]:
    """
    Returns (distance_km, time_hours) for the road leg from city to port.
    Uses the international-aware coord lookup so Dubai/Rotterdam/Singapore
    don't resolve to Indian villages.
    If the city cannot be geocoded, returns a 0 km / 0 hr leg (data gap).
    """
    coords = _get_city_coords(city)
    if not coords:
        log.warning("[engineer] Could not geocode city '%s' for road leg — using 0 km", city)
        return 0.0, 0.0
    c_lat, c_lng = coords
    d_km = haversine_km(c_lat, c_lng, port_lat, port_lng)
    t_hr = d_km / max(TRUCK_SPEED_KMPH, 1e-6)
    return float(d_km), float(t_hr)


def engineer_routes(
    port_paths: list[list[str]],
    source: str,
    destination: str,
    payload: dict | None = None,
) -> list[dict]:
    payload = payload or {}

    weight_kg    = float(payload.get("cargo_weight_kg", 100) or 100)
    departure_dt = payload.get("departure_date")   # "2025-06-01" or None
    constraints  = payload.get("constraints") or {}
    risk_threshold = constraints.get("risk_threshold")
    delay_tol      = constraints.get("delay_tolerance_hours")
    max_trans      = constraints.get("max_transshipments")
    budget_max     = constraints.get("budget_max_inr")

    out: list[dict] = []

    for path in port_paths:
        if not path:
            continue

        origin_port = path[0]
        dest_port   = path[-1]

        o_lat, o_lng = port_coords(origin_port)
        d_lat, d_lng = port_coords(dest_port)

        origin_name = port_name(origin_port)
        dest_name   = port_name(dest_port)
        origin_meta = _port_meta(origin_port)
        dest_meta   = _port_meta(dest_port)

        # ── Road legs ─────────────────────────────────────────────────────
        source_port_id = str(payload.get("source_port_id") or "").strip()
        destination_port_id = str(payload.get("destination_port_id") or "").strip()
        if source_port_id == origin_port:
            pre_km, pre_hr = 0.0, 0.0
        else:
            pre_km, pre_hr = _road_leg(source, o_lat, o_lng)
        if destination_port_id == dest_port:
            post_km, post_hr = 0.0, 0.0
        else:
            post_km, post_hr = _road_leg(destination, d_lat, d_lng)

        # ── Sea distance ──────────────────────────────────────────────────
        sea_km = sea_distance_km(path)
        sea_nm = _km_to_nm(sea_km)

        # ── Transshipment counts ──────────────────────────────────────────
        transshipments = max(len(path) - 2, 0)
        port_calls     = max(len(path), 1)

        # ── Infrastructure quality ────────────────────────────────────────
        avg_infra = (
            sum(float(_port_meta(pid).get("infrastructure_quality", 0.80))
                for pid in path) / len(path)
        )
        # Better infra → slightly faster (0.80–1.00 maps to mult 1.0–0.85)
        time_efficiency_mult = max(0.85, min(1.0, 1.0 - 0.15 * (avg_infra - 0.70) / 0.28))
        infra_cost_discount  = 1.0 - 0.12 * (avg_infra - 0.80)

        # ── Customs clearance ─────────────────────────────────────────────
        customs_hr = float(origin_meta.get("customs_hours", 8.0))
        if len(path) >= 2:
            customs_hr += float(dest_meta.get("customs_hours", 8.0))

        # ── Port handling ─────────────────────────────────────────────────
        handling_hr = (
            PORT_HANDLING_HOURS * port_calls
            + TRANSSHIPMENT_EXTRA_HOURS * transshipments
        ) * time_efficiency_mult

        # ── Chokepoints on this path ──────────────────────────────────────
        chokepoint_ids  = get_route_chokepoints(path)
        chokepoint_names = get_chokepoint_names(chokepoint_ids)

        # ── Phase 2: Real weather from Marine + Forecast APIs ────────────
        port_coords_list = [port_coords(pid) for pid in path]
        weather_data = get_route_weather_risk(
            port_lats_lons=port_coords_list,
            departure_date=departure_dt,
        )
        weather_risk = _clamp01(weather_data.get("combined_weather_risk", 0.20))
        wave_height_m = weather_data.get("wave_height_max_m")
        wind_speed_kn = weather_data.get("wind_speed_mean_kn")
        storm_flag    = weather_data.get("storm_flag", False)

        # ── Phase 2: ETA adjustment using observed transit days ───────────
        eta_mult, expected_delay_hr, transit_source = predict_eta_adjustment(
            sea_distance_nm=sea_nm,
            transshipments=transshipments,
            departure_dt=_parse_departure_datetime(departure_dt),
            from_portid=origin_port,
            to_portid=dest_port,
            chokepoint_ids=chokepoint_ids,
            wave_height_m=wave_height_m,
            wind_speed_kn=wind_speed_kn,
            storm_flag=storm_flag,
        )
        expected_delay_hr = expected_delay_hr * time_efficiency_mult

        # ── Sea hours: use observed data when available ───────────────────
        # When transit_source=="observed", eta_mult already incorporates
        # chokepoint + weather extras relative to observed baseline.
        # So: actual_sea_hr = observed_baseline × eta_mult
        # When heuristic, apply eta_mult to haversine estimate as before.
        from app.pipelines.water.data_loader import SPILLOVER_TRANSIT_DAYS
        observed_days = SPILLOVER_TRANSIT_DAYS.get((origin_port, dest_port))
        if observed_days and observed_days > 0 and transit_source == "observed":
            sea_hr = observed_days * 24.0    # eta_mult applied below
        else:
            sea_hr = sea_nm / max(VESSEL_SPEED_KNOTS, 1e-6)

        time_hours = (
            pre_hr + post_hr
            + sea_hr * eta_mult
            + handling_hr
            + customs_hr
            + expected_delay_hr
        )

        # ── Cost model ────────────────────────────────────────────────────
        regional_mults = [
            1.20 if _port_meta(pid).get("region") == "europe" else
            1.10 if _port_meta(pid).get("region") in {"middle_east", "south_asia"} else
            1.0 for pid in path
        ]
        regional_cost_mult = max(regional_mults) if regional_mults else 1.0
        cross_region = len(set(_port_meta(pid).get("region", "india") for pid in path)) > 1
        surcharge    = 1.05 if cross_region else 1.0

        tons = max(weight_kg, 0.0) / 1000.0
        road_distance_km = pre_km + post_km
        road_cost = road_distance_km * ROAD_COST_PER_KM_PER_TON_INR * tons
        if road_distance_km > 0:
            road_cost += ROAD_HANDLING_BASE_INR
        sea_cost = (
            (SEA_COST_BASE_PER_KG_INR + SEA_COST_PER_KG_PER_NM_INR * sea_nm)
            * max(weight_kg, 0.0)
            * regional_cost_mult
            * surcharge
            * infra_cost_discount
        )

        def _port_fee(meta: dict) -> float:
            if not meta:
                return PORT_FEE_BASE_INR
            region  = meta.get("region", "india")
            quality = meta.get("infrastructure_quality", 0.80)
            rm = 1.20 if region == "europe" else 1.10 if region == "middle_east" else 1.0
            qm = 1.0 - 0.10 * (quality - 0.80)
            return PORT_FEE_BASE_INR * rm * qm

        port_fees = _port_fee(origin_meta) + (_port_fee(dest_meta) if len(path) >= 2 else 0.0)
        trans_fee = TRANSSHIPMENT_FEE_INR * transshipments
        cost_inr  = road_cost + sea_cost + port_fees + trans_fee

        # ── Phase 2: Congestion risk from real portcall data ──────────────
        congestion_risk = _clamp01(
            sum(predict_port_congestion(pid) for pid in set(path)) / max(len(path), 1)
        )

        # ── Security risk ─────────────────────────────────────────────────
        sec_vals = []
        for pid in set(path):
            meta     = _port_meta(pid)
            base_sec = float(meta.get("base_security_risk", 0.20))
            piracy   = float(meta.get("piracy_risk", 0.02))
            infra    = float(meta.get("infrastructure_quality", 0.80))
            discount = 0.12 * (infra - 0.70) / 0.28
            sec_vals.append(max(0.0, base_sec + piracy - discount))

        security_risk = _clamp01(
            (sum(sec_vals) / max(len(sec_vals), 1))
            + 0.04 * (transshipments > 0)
        )

        # ── Transshipment risk ────────────────────────────────────────────
        trans_risk = _clamp01(0.10 * transshipments)

        # ── Phase 2: Chokepoint risk ──────────────────────────────────────
        chokepoint_risk = _clamp01(predict_chokepoint_stress(chokepoint_ids))

        # ── Phase 3: Disruption risk ──────────────────────────────────────
        disruption_risk, active_disruptions = _disruption_risk_score(list(set(path)))

        # ── Composite risk (6 components) ─────────────────────────────────
        risk_breakdown = {
            "weather":       round(weather_risk, 3),
            "congestion":    round(congestion_risk, 3),
            "security":      round(security_risk, 3),
            "transshipment": round(trans_risk, 3),
            "chokepoint":    round(chokepoint_risk, 3),
            "disruption":    round(disruption_risk, 3),
        }
        risk = _clamp01(
            RISK_WEIGHTS.get("weather",       0.25) * weather_risk
            + RISK_WEIGHTS.get("congestion",  0.20) * congestion_risk
            + RISK_WEIGHTS.get("security",    0.20) * security_risk
            + RISK_WEIGHTS.get("transshipment", 0.10) * trans_risk
            + RISK_WEIGHTS.get("chokepoint",  0.15) * chokepoint_risk
            + RISK_WEIGHTS.get("disruption",  0.10) * disruption_risk
        )

        # ── Derived stats ─────────────────────────────────────────────────
        delay_prob  = _clamp01(min(1.0, expected_delay_hr / max(sea_hr, 1.0)))
        reliability = _clamp01(1.0 - (0.65 * risk + 0.35 * delay_prob))

        # ── Segments ──────────────────────────────────────────────────────
        segments: list[dict] = []
        if pre_km > 0:
            segments.append({"mode": "Road", "from": source, "to": origin_name})
        if len(path) >= 2:
            for a, b in zip(path, path[1:]):
                segments.append({"mode": "Water", "from": port_name(a), "to": port_name(b)})
        else:
            segments.append({"mode": "Water", "from": origin_name, "to": dest_name})
        if post_km > 0:
            segments.append({"mode": "Road", "from": dest_name, "to": destination})

        # ── Key factors / insight ─────────────────────────────────────────
        regions_in_path = sorted(set(_port_meta(pid).get("region", "india") for pid in path))
        key_factors: list[str] = []

        if cross_region:
            labels = [r.replace("_", " ").title() for r in regions_in_path]
            key_factors.append(f"Multi-region route spanning {', '.join(labels)}")
        if transshipments == 0:
            key_factors.append("Direct port-to-port — no transshipment delay")
        elif transshipments == 1:
            key_factors.append("Single transshipment at intermediate port")
        elif transshipments >= 3:
            key_factors.append(f"{transshipments} transshipments — expect handling overhead")
        if chokepoint_names:
            if chokepoint_risk > 0.5:
                key_factors.append(
                    f"High chokepoint disruption on {', '.join(chokepoint_names[:2])}"
                )
            elif chokepoint_risk > 0.2:
                key_factors.append(
                    f"Moderate chokepoint stress: {', '.join(chokepoint_names[:2])}"
                )
            else:
                key_factors.append(f"Passes through {', '.join(chokepoint_names[:2])}")
        if avg_infra >= 0.90:
            key_factors.append("High-quality port infrastructure along full route")
        elif avg_infra < 0.78:
            key_factors.append("Some ports on this route have limited infrastructure")
        if weather_data.get("storm_flag"):
            key_factors.append("Storm conditions forecast on departure window")
        elif weather_risk > 0.40:
            key_factors.append(
                f"Elevated sea conditions — wave height up to {wave_height_m or 0:.1f}m"
            )
        elif weather_risk < 0.15:
            key_factors.append("Calm sea conditions expected")
        if transit_source == "observed":
            key_factors.append(
                f"Transit time based on real satellite-observed shipping data"
            )
        elif transit_source == "ml_model":
            key_factors.append(
                "Transit delay estimated by trained GradientBoosting ML model"
            )
        if active_disruptions:
            red_count    = sum(1 for d in active_disruptions if d["alert"] == "RED")
            orange_count = sum(1 for d in active_disruptions if d["alert"] == "ORANGE")
            if red_count:
                key_factors.append(
                    f"{red_count} RED-alert disruption event(s) affecting ports on this route"
                )
            elif orange_count:
                key_factors.append(
                    f"{orange_count} ORANGE-alert disruption event(s) on route ports"
                )
        if reliability > 0.80:
            key_factors.append(f"Strong reliability score ({reliability:.0%})")
        elif reliability < 0.55:
            key_factors.append(
                f"Below-average reliability ({reliability:.0%}) — consider alternatives"
            )
        if sea_nm > 3000:
            key_factors.append(f"Long-haul route ({sea_nm:.0f} nm) — extended transit")
        if surcharge > 1.0:
            key_factors.append("International surcharge applied for cross-region transit")

        # Reason sentence
        reason_parts: list[str] = []
        if transshipments == 0:
            reason_parts.append("direct connection")
        else:
            reason_parts.append(f"{transshipments}-stop route")
        if reliability >= 0.75:
            reason_parts.append("strong reliability")
        if risk < 0.3:
            reason_parts.append("low risk profile")
        elif risk > 0.5:
            reason_parts.append("elevated risk")
        if chokepoint_risk > 0.3:
            reason_parts.append("chokepoint disruption active")
        reason = f"{origin_name} → {dest_name}: {', '.join(reason_parts)}."

        # ── Assemble route ────────────────────────────────────────────────
        route = {
            "type":               "Water",
            "mode":               "water",
            "time":               round(float(time_hours), 2),
            "cost":               int(round(float(cost_inr))),
            "risk":               round(float(risk), 3),
            "segments":           segments,
            "origin_port":        origin_name,
            "destination_port":   dest_name,
            "distance_nm":        round(float(sea_nm), 1),
            "transshipments":     int(transshipments),
            "risk_breakdown":     risk_breakdown,
            "expected_delay_hours": round(float(expected_delay_hr), 2),
            "delay_prob":         round(float(delay_prob), 3),
            "reliability_score":  round(float(reliability), 3),
            # Phase 2: new fields
            "transit_days_source":   transit_source,
            "chokepoints_transited": chokepoint_names,
            "active_disruptions":    active_disruptions,   # Phase 3: real data
            "marine_conditions": {
                "wave_height_max_m":   weather_data.get("wave_height_max_m"),
                "wind_speed_mean_kn":  weather_data.get("wind_speed_mean_kn"),
                "storm_flag":          weather_data.get("storm_flag", False),
                "ocean_current_max_kmh": weather_data.get("ocean_current_max_kmh"),
                "weather_source":      weather_data.get("source"),
            },
            # Cost breakdown
            "cost_breakdown": {
                "sea_freight":        round(float(sea_cost)),
                "road_drayage":       round(float(road_cost)),
                "port_fees":          round(float(port_fees)),
                "transshipment_fees": round(float(trans_fee)),
                "regional_surcharge": round(float(sea_cost * (surcharge - 1.0))),
            },
            "reason":      reason,
            "key_factors": key_factors,
        }

        # ── Constraint filtering ──────────────────────────────────────────
        if risk_threshold is not None and float(route["risk"]) > float(risk_threshold):
            route["_filtered_out"] = True
        if delay_tol is not None and float(route.get("expected_delay_hours", 0.0)) > float(delay_tol):
            route["_filtered_out"] = True
        if max_trans is not None and int(route.get("transshipments", 0)) > int(max_trans):
            route["_filtered_out"] = True
        if budget_max is not None and float(route["cost"]) > float(budget_max):
            route["_filtered_out"] = True

        out.append(route)

    return out
