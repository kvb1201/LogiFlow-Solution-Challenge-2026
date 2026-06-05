from __future__ import annotations

from datetime import datetime

from app.pipelines.water.config import (
    PORT_HANDLING_HOURS,
    ROAD_COST_PER_KM_PER_TON_INR,
    ROAD_HANDLING_BASE_INR,
    SEA_COST_BASE_PER_KG_INR,
    SEA_COST_PER_KG_PER_NM_INR,
    TRANSSHIPMENT_EXTRA_HOURS,
    TRANSSHIPMENT_FEE_INR,
    TRUCK_SPEED_KMPH,
    VESSEL_SPEED_KNOTS,
    PORT_FEE_BASE_INR,
    RISK_WEIGHTS,
    PORTS,
)
from app.pipelines.water.ml_models import predict_eta_adjustment, predict_port_congestion
from app.pipelines.water.ports import haversine_km
from app.pipelines.water.route_generator import port_coords, port_name, sea_distance_km
from app.utils.coordinates import get_coords


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _km_to_nm(km: float) -> float:
    return float(km) / 1.852


def _port_meta(port_id: str) -> dict:
    for p in PORTS:
        if str(p.get("id")) == str(port_id):
            return p
    return {}


def _road_leg(city: str, port_display_name: str, port_lat: float, port_lng: float) -> tuple[float, float, float]:
    """
    Returns (distance_km, time_hours, cost_inr).
    """
    c_lat, c_lng = get_coords(city)
    d_km = haversine_km(c_lat, c_lng, port_lat, port_lng)
    t_hr = d_km / max(TRUCK_SPEED_KMPH, 1e-6)
    return float(d_km), float(t_hr), 0.0


def engineer_routes(port_paths: list[list[str]], source: str, destination: str, payload: dict | None = None) -> list[dict]:
    payload = payload or {}

    weight_kg = float(payload.get("cargo_weight_kg", 100) or 100)
    constraints = payload.get("constraints") or {}
    risk_threshold = constraints.get("risk_threshold")
    delay_tol = constraints.get("delay_tolerance_hours")
    max_trans = constraints.get("max_transshipments")
    budget_max = constraints.get("budget_max_inr")

    out: list[dict] = []

    for path in port_paths:
        if not path:
            continue

        origin_port = path[0]
        dest_port = path[-1]

        o_lat, o_lng = port_coords(origin_port)
        d_lat, d_lng = port_coords(dest_port)

        origin_name = port_name(origin_port)
        dest_name = port_name(dest_port)

        origin_meta = _port_meta(origin_port)
        dest_meta = _port_meta(dest_port)

        # Road legs
        pre_km, pre_hr, _ = _road_leg(source, origin_name, o_lat, o_lng)
        post_km, post_hr, _ = _road_leg(destination, dest_name, d_lat, d_lng)

        # Sea leg distance/time
        sea_km = sea_distance_km(path)
        sea_nm = _km_to_nm(sea_km)
        sea_hr = sea_nm / max(VESSEL_SPEED_KNOTS, 1e-6)

        # Transshipments (intermediate port calls)
        transshipments = max(len(path) - 2, 0)
        port_calls = 2 if len(path) >= 2 else 1

        # 1. Infrastructure-adjusted efficiency multipliers
        avg_infra = sum(float(_port_meta(pid).get("infrastructure_quality", 0.8)) for pid in path) / len(path)
        
        # Time efficiency multiplier maps quality [0.70, 0.98] to [1.0, 0.80]
        time_efficiency_mult = max(0.8, min(1.0, 1.0 - 0.2 * (avg_infra - 0.7) / (0.98 - 0.7)))
        
        # Cost discount maps quality [0.70, 0.98] to [1.015, 0.973]
        infra_cost_discount = 1.0 - 0.15 * (avg_infra - 0.8)

        # 2. Customs clearance times as a distinct component
        customs_hr = float(origin_meta.get("customs_hours", 8.0)) + (float(dest_meta.get("customs_hours", 8.0)) if len(path) >= 2 else 0.0)

        # Port handling time (infrastructure quality adjusted)
        handling_hr = (PORT_HANDLING_HOURS * port_calls + TRANSSHIPMENT_EXTRA_HOURS * transshipments) * time_efficiency_mult

        # ETA adjustment hook (modern ports experience fewer delays)
        eta_mult, expected_delay_hr = predict_eta_adjustment(
            sea_distance_nm=sea_nm,
            transshipments=transshipments,
            coast=None,
            departure_dt=datetime.now(),
        )
        expected_delay_hr = expected_delay_hr * time_efficiency_mult

        time_hours = (pre_hr + post_hr) + (sea_hr * eta_mult) + handling_hr + customs_hr + expected_delay_hr

        # 3. Enhanced Cost Calculations with Regional intelligence & Surcharges
        regional_multipliers = [1.2 if _port_meta(pid).get("region") == "europe" else 1.1 if _port_meta(pid).get("region") == "middle_east" else 1.0 for pid in path]
        regional_cost_mult = max(regional_multipliers) if regional_multipliers else 1.0
        
        cross_region = len(set(_port_meta(pid).get("region", "india") for pid in path)) > 1
        surcharge = 1.05 if cross_region else 1.0

        tons = max(weight_kg, 0.0) / 1000.0
        road_cost = (pre_km + post_km) * ROAD_COST_PER_KM_PER_TON_INR * tons + ROAD_HANDLING_BASE_INR

        sea_cost = (SEA_COST_BASE_PER_KG_INR + SEA_COST_PER_KG_PER_NM_INR * sea_nm) * max(weight_kg, 0.0) * regional_cost_mult * surcharge * infra_cost_discount

        # Custom port fees adjusted by region and quality
        def get_port_fee(meta):
            if not meta:
                return PORT_FEE_BASE_INR
            region = meta.get("region", "india")
            quality = meta.get("infrastructure_quality", 0.8)
            reg_mult = 1.2 if region == "europe" else 1.1 if region == "middle_east" else 1.0
            qual_mult = 1.0 - 0.1 * (quality - 0.8)
            return PORT_FEE_BASE_INR * reg_mult * qual_mult

        port_fees = get_port_fee(origin_meta) + (get_port_fee(dest_meta) if len(path) >= 2 else 0.0)
        trans_fee = TRANSSHIPMENT_FEE_INR * transshipments

        cost_inr = road_cost + sea_cost + port_fees + trans_fee

        # 4. Regional weather risks (seasonal risks by location)
        weather_risks = []
        month = datetime.now().month
        for pid in path:
            meta = _port_meta(pid)
            region = meta.get("region", "india")
            if region == "india":
                monsoon = month in {6, 7, 8, 9}
                base_w = 0.35 if monsoon else 0.15
            elif region in {"southeast_asia", "east_asia"}:
                typhoon = month in {7, 8, 9, 10}
                base_w = 0.38 if typhoon else 0.12
            elif region == "europe":
                winter = month in {11, 12, 1, 2}
                base_w = 0.30 if winter else 0.10
            elif region == "middle_east":
                summer = month in {5, 6, 7, 8}
                base_w = 0.20 if summer else 0.08
            else:
                base_w = 0.15
            weather_risks.append(base_w)
        
        weather_risk = max(weather_risks) + min(0.25, sea_nm / 4000.0)
        weather_risk = _clamp01(weather_risk)

        congestion_risk = _clamp01(sum(predict_port_congestion(pid) for pid in set(path)) / max(len(path), 1))

        # Security risk (infrastructure quality reduces risk; piracy integrated)
        sec_vals = []
        for pid in set(path):
            meta = _port_meta(pid)
            base_sec = float(meta.get("base_security_risk", 0.2))
            piracy = float(meta.get("piracy_risk", 0.02))
            infra = float(meta.get("infrastructure_quality", 0.8))
            # Infrastructure quality reduces security risk by up to 15%
            infra_discount = 0.15 * (infra - 0.70) / (0.98 - 0.70)
            sec_val = base_sec + piracy - infra_discount
            sec_vals.append(max(0.0, sec_val))
            
        security_risk = _clamp01((sum(sec_vals) / max(len(sec_vals), 1)) + 0.05 * (transshipments > 0))
        trans_risk = _clamp01(0.10 * transshipments)

        risk_breakdown = {
            "weather": weather_risk,
            "congestion": congestion_risk,
            "security": security_risk,
            "transshipment": trans_risk,
        }
        risk = _clamp01(
            RISK_WEIGHTS["weather"] * weather_risk
            + RISK_WEIGHTS["congestion"] * congestion_risk
            + RISK_WEIGHTS["security"] * security_risk
            + RISK_WEIGHTS["transshipment"] * trans_risk
        )

        delay_prob = _clamp01(min(1.0, expected_delay_hr / max(sea_hr, 1.0)))
        reliability = _clamp01(1.0 - (0.65 * risk + 0.35 * delay_prob))

        # Build segments: Road -> Water legs -> Road
        segments: list[dict] = []
        segments.append({"mode": "Road", "from": source, "to": origin_name})

        if len(path) >= 2:
            for a, b in zip(path, path[1:]):
                segments.append({"mode": "Water", "from": port_name(a), "to": port_name(b)})
        else:
            segments.append({"mode": "Water", "from": origin_name, "to": dest_name})

        segments.append({"mode": "Road", "from": dest_name, "to": destination})

        # Item #3: Generate route insight text
        regions_in_path = sorted(set(_port_meta(pid).get("region", "india") for pid in path))
        key_factors: list[str] = []
        if cross_region:
            region_labels = [r.replace("_", " ").title() for r in regions_in_path]
            key_factors.append(f"Multi-region route spanning {', '.join(region_labels)}")
        if transshipments == 0:
            key_factors.append("Direct port-to-port — no transshipment delay")
        elif transshipments == 1:
            key_factors.append("Single transshipment at intermediate port")
        elif transshipments >= 3:
            key_factors.append(f"{transshipments} transshipments — expect handling overhead")
        if avg_infra >= 0.90:
            key_factors.append("High-quality port infrastructure along full route")
        elif avg_infra < 0.78:
            key_factors.append("Some ports on this route have limited infrastructure")
        if weather_risk > 0.35:
            key_factors.append("Elevated seasonal weather risk on this corridor")
        elif weather_risk < 0.15:
            key_factors.append("Low weather risk — favorable seasonal window")
        if reliability > 0.80:
            key_factors.append(f"Strong reliability score ({reliability:.0%})")
        elif reliability < 0.55:
            key_factors.append(f"Below-average reliability ({reliability:.0%}) — consider alternatives")
        if sea_nm > 3000:
            key_factors.append(f"Long-haul route ({sea_nm:.0f} nm) — expect extended transit")
        if surcharge > 1.0:
            key_factors.append("International surcharge applied for cross-region transit")

        # Build a concise reason sentence
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
        reason = f"{origin_name} → {dest_name}: {', '.join(reason_parts)}."

        route = {
            "type": "Water",
            "mode": "water",
            "time": round(float(time_hours), 2),
            "cost": int(round(float(cost_inr))),
            "risk": round(float(risk), 3),
            "segments": segments,
            "origin_port": origin_name,
            "destination_port": dest_name,
            "distance_nm": round(float(sea_nm), 1),
            "transshipments": int(transshipments),
            "risk_breakdown": {k: round(float(v), 3) for k, v in risk_breakdown.items()},
            "expected_delay_hours": round(float(expected_delay_hr), 2),
            "delay_prob": round(float(delay_prob), 3),
            "reliability_score": round(float(reliability), 3),
            # Item #2: Cost breakdown
            "cost_breakdown": {
                "sea_freight": round(float(sea_cost)),
                "road_drayage": round(float(road_cost)),
                "port_fees": round(float(port_fees)),
                "transshipment_fees": round(float(trans_fee)),
                "regional_surcharge": round(float(sea_cost * (surcharge - 1.0))),
            },
            # Item #3: Route insight
            "reason": reason,
            "key_factors": key_factors,
        }

        # Constraints filtering
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
