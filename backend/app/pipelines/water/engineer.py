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

        # Road legs
        pre_km, pre_hr, _ = _road_leg(source, origin_name, o_lat, o_lng)
        post_km, post_hr, _ = _road_leg(destination, dest_name, d_lat, d_lng)

        # Sea leg distance/time
        sea_km = sea_distance_km(path)
        sea_nm = _km_to_nm(sea_km)
        sea_hr = sea_nm / max(VESSEL_SPEED_KNOTS, 1e-6)

        # Transshipments (intermediate port calls)
        transshipments = max(len(path) - 2, 0)

        # Port handling time:
        # - origin + destination always
        # - intermediate ports: extra transshipment handling
        port_calls = 2 if len(path) >= 2 else 1
        handling_hr = PORT_HANDLING_HOURS * port_calls + TRANSSHIPMENT_EXTRA_HOURS * transshipments

        # ETA adjustment hook
        eta_mult, expected_delay_hr = predict_eta_adjustment(
            sea_distance_nm=sea_nm,
            transshipments=transshipments,
            coast=None,
            departure_dt=datetime.now(),
        )

        time_hours = (pre_hr + post_hr) + (sea_hr * eta_mult) + handling_hr + expected_delay_hr

        # Cost model
        tons = max(weight_kg, 0.0) / 1000.0
        road_cost = (pre_km + post_km) * ROAD_COST_PER_KM_PER_TON_INR * tons + ROAD_HANDLING_BASE_INR

        sea_cost = (SEA_COST_BASE_PER_KG_INR + SEA_COST_PER_KG_PER_NM_INR * sea_nm) * max(weight_kg, 0.0)
        port_fees = PORT_FEE_BASE_INR * port_calls
        trans_fee = TRANSSHIPMENT_FEE_INR * transshipments

        cost_inr = road_cost + sea_cost + port_fees + trans_fee

        # Risk components (0..1)
        # Weather: seasonal + longer distance
        month = datetime.now().month
        monsoon = month in {6, 7, 8, 9}
        weather_risk = 0.15 + (0.18 if monsoon else 0.05) + min(0.25, sea_nm / 4000.0)
        weather_risk = _clamp01(weather_risk)

        # Congestion: average of involved ports (ML hook returns base for now)
        cong_vals = [predict_port_congestion(pid) for pid in set(path)]
        congestion_risk = _clamp01(sum(cong_vals) / max(len(cong_vals), 1))

        # Security: base per port + a small penalty for transshipments
        sec_vals = []
        for pid in set(path):
            meta = _port_meta(pid)
            sec_vals.append(float(meta.get("base_security_risk", 0.2)))
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

        # Delay probability proxy
        delay_prob = _clamp01(min(1.0, expected_delay_hr / max(sea_hr, 1.0)))
        reliability = _clamp01(1.0 - (0.65 * risk + 0.35 * delay_prob))

        # Build segments: Road -> Water legs -> Road
        segments: list[dict] = []
        segments.append({"mode": "Road", "from": source, "to": origin_name})

        if len(path) >= 2:
            for a, b in zip(path, path[1:]):
                segments.append({"mode": "Water", "from": port_name(a), "to": port_name(b)})
        else:
            # Degenerate case: same port mapped on both ends
            segments.append({"mode": "Water", "from": origin_name, "to": dest_name})

        segments.append({"mode": "Road", "from": dest_name, "to": destination})

        route = {
            "type": "Water",
            "mode": "water",
            "time": round(float(time_hours), 2),
            "cost": int(round(float(cost_inr))),
            "risk": round(float(risk), 3),
            "segments": segments,
            # Extra metadata (ignored by validator, useful for UI/debugging)
            "origin_port": origin_name,
            "destination_port": dest_name,
            "distance_nm": round(float(sea_nm), 1),
            "transshipments": int(transshipments),
            "risk_breakdown": {k: round(float(v), 3) for k, v in risk_breakdown.items()},
            "expected_delay_hours": round(float(expected_delay_hr), 2),
            "delay_prob": round(float(delay_prob), 3),
            "reliability_score": round(float(reliability), 3),
        }

        # Constraints filtering (soft-fallback behavior handled in pipeline)
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
