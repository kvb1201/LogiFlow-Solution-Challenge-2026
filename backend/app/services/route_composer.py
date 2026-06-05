"""
Compose multimodal itineraries by chaining black-box pipeline outputs.

Optimised for new corridors: per-leg timeouts tied to remaining budget,
cross-request leg cache, cold-corridor fast path, and corridor-aware hubs.
"""
from __future__ import annotations

import math
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, Optional

from app.services.compose_leg_cache import get_cached_leg, set_cached_leg
from app.services.hub_catalog import Hub, canonical_city, get_hubs, is_known_corridor
from app.services.itinerary_scorer import build_explanation, score_itineraries
from app.services.leg_extractor import extract_best_route, leg_to_dict, route_to_leg
from app.services.transfer_detail import build_transfer_detail
from app.services.pipeline_registry import get_pipeline
from app.utils.request_context import RequestContext

_COMPOSE_BUDGET_S = 42
_SHORT_CORRIDOR_KM = 200
_HANDLING_FEE_INR = 250
_MODE_FAIL_SKIP_AFTER = 2
_MAX_LEG_CALLS_WARM = 12
_MAX_LEG_CALLS_COLD = 6

_MODE_TIMEOUT_CAP: dict[str, float] = {
    "rail": 24,
    "road": 8,
    "air": 10,
    "water": 10,
}

# Multimodal templates: (id, leg1_mode, leg2_mode) — priority order
_HUB_TEMPLATES: list[tuple[str, str, str]] = [
    ("rail+rail", "rail", "rail"),
    ("rail+air", "rail", "air"),
    ("rail+road", "rail", "road"),
    ("road+rail", "road", "rail"),
]

# First-time corridors: still try rail+road (road geocoder is fast with static/Google).
_COLD_HUB_TEMPLATES: list[tuple[str, str, str]] = [
    ("rail+rail", "rail", "rail"),
    ("rail+road", "rail", "road"),
    ("rail+air", "rail", "air"),
]

_TRANSFER_BUFFER_HR: dict[tuple[str, str], float] = {
    ("rail", "air"): 3.5,
    ("rail", "road"): 1.5,
    ("road", "rail"): 1.5,
    ("road", "air"): 2.0,
    ("air", "rail"): 2.5,
    ("air", "road"): 2.0,
    ("rail", "rail"): 2.0,
}

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="compose-leg")


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _corridor_distance_km(origin: str, dest: str, context: RequestContext) -> Optional[float]:
    """Great-circle distance between corridor endpoints (offline geocoder)."""
    from app.services.geocoder import geocode_latlng

    src = geocode_latlng(origin, context=context)
    dst = geocode_latlng(dest, context=context)
    if not src or not dst:
        return None
    return round(_haversine_km(src[0], src[1], dst[0], dst[1]), 1)


def _short_corridor_note(distance_km: float) -> str:
    return (
        f"This corridor is about {distance_km:.0f} km — under {_SHORT_CORRIDOR_KM} km, "
        "so a hub changeover would add handling time and cost without a real benefit. "
        "Showing direct train, flight, and road options only."
    )


def _corridor_is_warm(origin: str, dest: str, priority: str) -> bool:
    """Any cached leg for this OD means we've composed this corridor before."""
    for mode in ("rail", "air", "road"):
        cached = get_cached_leg(mode, origin, dest, priority)
        if cached and cached[0] in ("hit", "fail"):
            return True
    return False


class RouteComposer:
    def compose(
        self,
        source: str,
        destination: str,
        payload: dict[str, Any] | None = None,
        context: RequestContext | None = None,
    ) -> dict[str, Any]:
        payload = payload or {}
        context = context or RequestContext()
        priority = (payload.get("priority") or "balanced").lower().strip()
        opts = payload.get("compose_options") or {}
        max_hubs = min(3, int(opts.get("max_hubs", 2)))
        include_heavy = bool(opts.get("include_road_water", False))
        budget_s = min(60, int(opts.get("budget_seconds", _COMPOSE_BUDGET_S)))
        deadline = time.monotonic() + budget_s

        excluded = set(
            m.lower()
            for m in (payload.get("constraints") or {}).get("excluded_modes", [])
        )

        origin = canonical_city(source)
        dest = canonical_city(destination)
        corridor_km = _corridor_distance_km(origin, dest, context)
        short_corridor = corridor_km is not None and corridor_km < _SHORT_CORRIDOR_KM

        warm_corridor = _corridor_is_warm(origin, dest, priority)
        known = is_known_corridor(origin, dest)

        if short_corridor:
            hubs = []
            templates: list[tuple[str, str, str]] = []
            max_leg_calls = 4
            try_road = True
        else:
            # Cold + unknown OD: skip hub probes entirely on first request.
            if warm_corridor or known:
                hub_cap = max_hubs if known else min(max_hubs, 1)
            else:
                hub_cap = 0
            hubs = get_hubs(origin, dest, max_hubs=hub_cap)

            templates = _HUB_TEMPLATES if warm_corridor else _COLD_HUB_TEMPLATES
            max_leg_calls = _MAX_LEG_CALLS_WARM if warm_corridor else _MAX_LEG_CALLS_COLD
            # Try road legs whenever corridor has on-path hubs (not only on cache warm-up).
            try_road = warm_corridor or known or bool(hubs)

        leg_cache: dict[tuple[str, str, str], Any] = {}
        mode_fail_counts: dict[str, int] = {}
        itineraries: list[dict[str, Any]] = []
        unavailable: dict[str, str] = {}
        leg_calls = 0

        def _remaining_s() -> float:
            return deadline - time.monotonic()

        def _past_deadline() -> bool:
            return _remaining_s() <= 0

        def _leg_wait_s(mode: str) -> float:
            remaining = _remaining_s()
            if remaining <= 0.5:
                return 0.0
            cap = _MODE_TIMEOUT_CAP.get(mode, 12)
            return min(cap, max(1.0, remaining - 0.25))

        def _should_skip_mode(mode: str) -> bool:
            return (
                mode in excluded
                or mode_fail_counts.get(mode, 0) >= _MODE_FAIL_SKIP_AFTER
            )

        def _record_fail(mode: str) -> None:
            mode_fail_counts[mode] = mode_fail_counts.get(mode, 0) + 1

        def _do_pipeline(mode: str, frm_c: str, to_c: str) -> Any | None:
            pipeline = get_pipeline(mode)
            res = pipeline.generate(frm_c, to_c, payload, context=context)
            route = extract_best_route(res, mode, priority)
            return route_to_leg(route, mode, frm_c, to_c)

        def fetch_leg(mode: str, frm: str, to: str) -> Any | None:
            nonlocal leg_calls

            if _should_skip_mode(mode) or _past_deadline():
                return None

            frm_c, to_c = canonical_city(frm), canonical_city(to)
            key = (mode, frm_c, to_c)
            if key in leg_cache:
                return leg_cache[key]

            cached = get_cached_leg(mode, frm_c, to_c, priority)
            if cached:
                status, data = cached
                if status == "fail":
                    leg_cache[key] = None
                    _record_fail(mode)
                    return None
                if status == "hit" and data:
                    from app.services.leg_extractor import Leg

                    leg = Leg(
                        mode=data["mode"],
                        source=data["source"],
                        destination=data["destination"],
                        time_hr=data["time_hr"],
                        cost_inr=data["cost_inr"],
                        risk=data["risk"],
                        segments=data.get("segments") or [],
                        status="ok",
                    )
                    leg_cache[key] = leg
                    return leg

            wait_s = _leg_wait_s(mode)
            if wait_s <= 0 or leg_calls >= max_leg_calls:
                if leg_calls >= max_leg_calls:
                    unavailable["_leg_cap"] = "Leg call limit reached — partial results returned"
                return None

            leg_calls += 1
            try:
                future = _executor.submit(_do_pipeline, mode, frm_c, to_c)
                leg = future.result(timeout=wait_s)
            except FuturesTimeoutError:
                print(f"[COMPOSE] {mode} {frm_c}→{to_c} timed out ({wait_s:.0f}s)")
                leg = None
            except Exception as e:
                print(f"[COMPOSE] {mode} {frm_c}→{to_c} failed: {e}")
                leg = None

            leg_cache[key] = leg
            set_cached_leg(mode, frm_c, to_c, priority, leg_to_dict(leg) if leg else None)
            if not leg:
                _record_fail(mode)
            return leg

        # ── Phase 1: direct rail (highest hit-rate, answer fast) ──────────
        direct_rail_leg = None
        if "rail" not in excluded:
            leg = fetch_leg("rail", origin, dest)
            if leg:
                direct_rail_leg = leg
                itineraries.append(self._single_leg_itinerary(leg, "direct_rail"))
            else:
                unavailable["direct_rail"] = "No direct rail route"

        # Short OD (e.g. Vadodara→Surat): skip hub/multimodal entirely.
        fast_compose = False
        if not short_corridor and direct_rail_leg is not None and not warm_corridor:
            dr = leg_to_dict(direct_rail_leg)
            if dr["time_hr"] < 8:
                fast_compose = True
                hubs = hubs[:1]
                templates = [("rail+rail", "rail", "rail")]
                max_leg_calls = min(max_leg_calls, 4)

        # ── Phase 2: hub chains (skipped when corridor < 200 km) ──
        if not short_corridor:
            for hub in hubs:
                if _past_deadline() or leg_calls >= max_leg_calls:
                    unavailable["_budget"] = "Time budget reached — partial results returned"
                    break

                for template_id, mode1, mode2 in templates:
                    if mode1 in excluded or mode2 in excluded or _past_deadline():
                        continue
                    if not try_road and (mode1 == "road" or mode2 == "road"):
                        continue

                    leg_in = fetch_leg(mode1, origin, hub.city)
                    if not leg_in:
                        unavailable[f"{template_id}:{hub.city}:in"] = (
                            f"no {mode1} {origin}→{hub.city}"
                        )
                        continue

                    leg_out = fetch_leg(mode2, hub.city, dest)
                    if not leg_out:
                        unavailable[f"{template_id}:{hub.city}"] = (
                            f"{mode2} {hub.city}→{dest} failed"
                        )
                        continue

                    itineraries.append(
                        self._compose_two_leg(template_id, hub, leg_in, leg_out)
                    )

                    if fast_compose:
                        break

                if fast_compose and len(
                    [it for it in itineraries if it.get("type") == "multimodal"]
                ):
                    break

        # ── Phase 3: direct air + road ──
        if short_corridor:
            if not _past_deadline() and leg_calls < max_leg_calls:
                if "air" not in excluded and not _should_skip_mode("air"):
                    leg = fetch_leg("air", origin, dest)
                    if leg:
                        itineraries.append(self._single_leg_itinerary(leg, "direct_air"))
                    else:
                        unavailable["direct_air"] = "No direct air route"
            if (
                not _past_deadline()
                and leg_calls < max_leg_calls
                and "road" not in excluded
                and not _should_skip_mode("road")
            ):
                leg = fetch_leg("road", origin, dest)
                if leg:
                    itineraries.append(self._single_leg_itinerary(leg, "direct_road"))
                else:
                    unavailable["direct_road"] = "No direct road route"
        else:
            if not fast_compose and not _past_deadline() and leg_calls < max_leg_calls:
                if "air" not in excluded and not _should_skip_mode("air"):
                    leg = fetch_leg("air", origin, dest)
                    if leg:
                        itineraries.append(self._single_leg_itinerary(leg, "direct_air"))
                    else:
                        unavailable["direct_air"] = "No direct air route"

            if (
                warm_corridor
                and try_road
                and not _past_deadline()
                and leg_calls < max_leg_calls
            ):
                if "road" not in excluded and not _should_skip_mode("road"):
                    leg = fetch_leg("road", origin, dest)
                    if leg:
                        itineraries.append(self._single_leg_itinerary(leg, "direct_road"))
                    else:
                        unavailable["direct_road"] = "No direct road route"
            elif fast_compose:
                unavailable["direct_road"] = (
                    "Retry for truck route — first run optimises train options"
                )

        if include_heavy and not _past_deadline() and "water" not in excluded:
            leg = fetch_leg("water", origin, dest)
            if leg:
                itineraries.append(self._single_leg_itinerary(leg, "direct_water"))

        if not itineraries:
            out: dict[str, Any] = {
                "error": "No multimodal or direct routes could be composed for this corridor",
                "hubs_considered": [h.to_dict() for h in hubs],
                "unavailable_templates": unavailable,
                "baselines": {},
                "partial": False,
                "short_corridor": short_corridor,
                "corridor_distance_km": corridor_km,
            }
            if short_corridor and corridor_km is not None:
                out["compose_note"] = _short_corridor_note(corridor_km)
            return out

        if short_corridor:
            itineraries = [it for it in itineraries if it.get("type") == "direct"]

        if not itineraries:
            out = {
                "error": "No direct routes could be composed for this short corridor",
                "hubs_considered": [],
                "unavailable_templates": unavailable,
                "baselines": {},
                "partial": False,
                "short_corridor": True,
                "corridor_distance_km": corridor_km,
            }
            if corridor_km is not None:
                out["compose_note"] = _short_corridor_note(corridor_km)
            return out

        ranked = score_itineraries(itineraries, priority)
        best = ranked[0]
        best["explanation"] = build_explanation(best)

        baselines = {
            it["template_id"].replace("direct_", ""): {
                "time_hr": it["total_time_hr"],
                "cost_inr": it["total_cost_inr"],
                "risk": it["total_risk"],
                "type": "direct",
            }
            for it in ranked
            if it.get("type") == "direct"
        }

        multimodal = [it for it in ranked if it.get("type") == "multimodal"]
        beats = None
        if best.get("type") == "multimodal" and baselines:
            direct_best = min(
                baselines.values(),
                key=lambda b: b["time_hr"] if priority in ("time", "fast") else b["cost_inr"],
            )
            beats = {
                "baseline_mode": min(baselines, key=lambda k: baselines[k]["time_hr"]),
                "time_delta_hr": round(direct_best["time_hr"] - best["total_time_hr"], 2),
                "cost_delta_inr": int(direct_best["cost_inr"] - best["total_cost_inr"]),
            }

        for it in ranked:
            it["explanation"] = build_explanation(it)

        partial = "_budget" in unavailable or "_leg_cap" in unavailable

        out = {
            "priority": priority,
            "recommended": best,
            "alternatives": ranked[1:8],
            "baselines": baselines,
            "beats_single_mode": beats,
            "hubs_considered": [h.to_dict() for h in hubs],
            "unavailable_templates": unavailable,
            "total_candidates": len(ranked),
            "multimodal_count": len(multimodal),
            "partial": partial,
            "cold_corridor": not warm_corridor,
            "short_corridor": short_corridor,
            "corridor_distance_km": corridor_km,
        }
        if short_corridor and corridor_km is not None:
            out["compose_note"] = _short_corridor_note(corridor_km)
        return out

    def _transfer_buffer(self, mode_a: str, mode_b: str) -> float:
        return _TRANSFER_BUFFER_HR.get((mode_a, mode_b), 2.0)

    def _single_leg_itinerary(self, leg: Any, template_id: str) -> dict[str, Any]:
        d = leg_to_dict(leg)
        return {
            "id": template_id,
            "template_id": template_id,
            "type": "direct",
            "hub_cities": [],
            "legs": [d],
            "transfers": [],
            "total_time_hr": round(d["time_hr"], 2),
            "total_cost_inr": int(d["cost_inr"]),
            "total_risk": round(d["risk"], 3),
            "transshipments": 0,
            "segments": d["segments"],
        }

    def _compose_two_leg(
        self,
        template_id: str,
        hub: Hub,
        leg1: Any,
        leg2: Any,
    ) -> dict[str, Any]:
        d1 = leg_to_dict(leg1)
        d2 = leg_to_dict(leg2)
        buffer = self._transfer_buffer(d1["mode"], d2["mode"])
        handling = _HANDLING_FEE_INR

        total_time = d1["time_hr"] + buffer + d2["time_hr"]
        total_cost = d1["cost_inr"] + d2["cost_inr"] + handling
        total_risk = 1 - (1 - d1["risk"]) * (1 - d2["risk"]) + 0.08

        transfer = build_transfer_detail(
            d1, d2, hub.city, hub.display_name, buffer, handling
        )

        return {
            "id": f"{template_id}:{hub.city}",
            "template_id": template_id,
            "type": "multimodal",
            "hub_cities": [hub.city],
            "legs": [d1, d2],
            "transfers": [transfer],
            "total_time_hr": round(total_time, 2),
            "total_cost_inr": int(total_cost),
            "total_risk": round(min(1.0, total_risk), 3),
            "transshipments": 1,
            "segments": list(d1["segments"]) + list(d2["segments"]),
        }
