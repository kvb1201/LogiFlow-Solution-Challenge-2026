"""
Compose multimodal itineraries by chaining black-box pipeline outputs.

Optimised for new corridors: per-leg timeouts tied to remaining budget,
cross-request leg cache, cold-corridor fast path, and corridor-aware hubs.
"""
from __future__ import annotations

import math
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed
from typing import Any, Callable, Optional

from app.services.compose_leg_cache import get_cached_leg, set_cached_leg
from app.services.geo_hub_finder import HubPair, discover_rural_hub_pairs, is_remote_location
from app.services.hub_access import FeederAccess, get_feeder_access, _strip_station_suffix
from app.services.hub_catalog import Hub, canonical_city, get_hubs, is_known_corridor
from app.services.itinerary_scorer import build_explanation, score_itineraries
from app.services.leg_extractor import extract_best_route, leg_to_dict, route_to_leg
from app.services.transfer_detail import build_transfer_detail, enrich_leg
from app.services.pipeline_registry import get_pipeline
from app.utils.request_context import RequestContext

_COMPOSE_BUDGET_S = 75
_SHORT_CORRIDOR_KM = 200
_HANDLING_FEE_INR = 250
_MODE_FAIL_SKIP_AFTER = 2
_MAX_LEG_CALLS_WARM = 16
_MAX_LEG_CALLS_COLD = 12
_MAX_LEG_CALLS_RURAL = 18
_FEEDER_RESERVED_SLOTS = 4

_MODE_TIMEOUT_CAP: dict[str, float] = {
    "rail": 18,
    "road": 10,
    "air": 12,
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

_PARALLEL_WORKERS = max(4, int(os.getenv("COMPOSE_PARALLEL_WORKERS", "8")))
_executor = ThreadPoolExecutor(max_workers=_PARALLEL_WORKERS, thread_name_prefix="compose-leg")



def _build_compose_snapshot(
    itineraries: list[dict[str, Any]],
    priority: str,
    *,
    hubs: list[Hub],
    hub_pairs: list[HubPair],
    unavailable: dict[str, str],
    rural_corridor: bool,
    has_feeder: bool,
    warm_corridor: bool,
    short_corridor: bool,
    corridor_km: float | None,
    src_r: Any,
    dst_r: Any,
    src_feeder: FeederAccess | None,
    dst_feeder: FeederAccess | None,
    access_in_leg: Any | None,
    access_out_leg: Any | None,
    partial: bool,
    streaming: bool = False,
) -> dict[str, Any]:
    """Rank current itineraries for SSE progress or final response."""
    work = list(itineraries)
    if short_corridor:
        work = [
            it
            for it in work
            if it.get("type") == "direct"
            or str(it.get("template_id") or "").startswith("feeder+")
        ]
    if not work:
        return {
            "partial": partial,
            "streaming": streaming,
            "rural_corridor": rural_corridor,
            "feeder_corridor": has_feeder,
            "unavailable_templates": unavailable,
            "hubs_considered": [h.to_dict() for h in hubs],
            "hub_pairs_considered": [p.to_dict() for p in hub_pairs],
            "short_corridor": short_corridor,
            "corridor_distance_km": corridor_km,
            "cold_corridor": not warm_corridor,
            "resolved_source": {
                **src_r.to_dict(),
                **({"feeder_access": src_feeder.to_dict()} if src_feeder else {}),
            },
            "resolved_destination": {
                **dst_r.to_dict(),
                **({"feeder_access": dst_feeder.to_dict()} if dst_feeder else {}),
            },
        }

    ranked = score_itineraries(work, priority)
    for it in ranked:
        it["explanation"] = build_explanation(it)
    best = ranked[0]

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

    out: dict[str, Any] = {
        "priority": priority,
        "recommended": best,
        "alternatives": ranked[1:8],
        "baselines": baselines,
        "beats_single_mode": beats,
        "hubs_considered": [h.to_dict() for h in hubs],
        "hub_pairs_considered": [p.to_dict() for p in hub_pairs],
        "rural_corridor": rural_corridor,
        "feeder_corridor": has_feeder,
        "unavailable_templates": unavailable,
        "total_candidates": len(ranked),
        "multimodal_count": len(multimodal),
        "partial": partial,
        "streaming": streaming,
        "cold_corridor": not warm_corridor,
        "short_corridor": short_corridor,
        "corridor_distance_km": corridor_km,
        "resolved_source": {
            **src_r.to_dict(),
            **({"feeder_access": src_feeder.to_dict()} if src_feeder else {}),
        },
        "resolved_destination": {
            **dst_r.to_dict(),
            **({"feeder_access": dst_feeder.to_dict()} if dst_feeder else {}),
        },
    }
    feeder_note = _feeder_compose_note(
        src_feeder, dst_feeder, access_in_leg, access_out_leg
    )
    if short_corridor and corridor_km is not None:
        out["compose_note"] = _short_corridor_note(corridor_km)
    elif feeder_note:
        out["compose_note"] = feeder_note
    elif rural_corridor:
        out["compose_note"] = (
            "Rural or unmapped place detected — showing direct routes plus "
            "options via nearest major hub cities (road + train/air)."
        )
    return out


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


def _endpoint_coords(
    loc: Any,
    feeder: FeederAccess | None,
    context: RequestContext,
) -> tuple[float, float] | None:
    """User-facing endpoint coords — station pin for feeder stops, not collapsed metro centre."""
    if feeder and feeder.local_station_code:
        try:
            from app.pipelines.rail.station_coordinates import get_station_latlng

            pt = get_station_latlng(feeder.local_station_code)
            if pt:
                return (float(pt[0]), float(pt[1]))
        except Exception:
            pass
    if loc.lat is not None and loc.lng is not None:
        return (float(loc.lat), float(loc.lng))
    from app.services.geocoder import geocode_latlng

    raw = (loc.raw or loc.canonical_city or "").strip()
    if not raw:
        return None
    hit = geocode_latlng(raw, context=context)
    return (float(hit[0]), float(hit[1])) if hit else None


def _corridor_distance_for_resolution(
    src_r: Any,
    dst_r: Any,
    src_feeder: FeederAccess | None,
    dst_feeder: FeederAccess | None,
    context: RequestContext,
) -> Optional[float]:
    """End-to-end corridor km using local station pins when feeder access applies."""
    src_pt = _endpoint_coords(src_r, src_feeder, context)
    dst_pt = _endpoint_coords(dst_r, dst_feeder, context)
    if not src_pt or not dst_pt:
        return _corridor_distance_km(
            src_r.canonical_city,
            dst_r.canonical_city,
            context,
        )
    return round(_haversine_km(src_pt[0], src_pt[1], dst_pt[0], dst_pt[1]), 1)


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


def _feeder_compose_note(
    src_feeder: FeederAccess | None,
    dst_feeder: FeederAccess | None,
    access_in_leg: Any | None,
    access_out_leg: Any | None,
) -> str | None:
    """Only claim a feeder leg is included when that leg was actually scheduled."""
    positive = _feeder_access_note(
        src_feeder if access_in_leg else None,
        dst_feeder if access_out_leg else None,
    )
    if positive:
        return positive
    failures: list[str] = []
    if src_feeder and not access_in_leg:
        failures.append(f"No local connection {src_feeder.local_place}→{src_feeder.hub_city}")
    if dst_feeder and not access_out_leg:
        failures.append(f"No local connection {dst_feeder.hub_city}→{dst_feeder.local_place}")
    if failures:
        return (
            " · ".join(failures)
            + " — try naming the nearest city (e.g. Prayagraj) or retry with more time."
        )
    return None


def _feeder_access_note(access_in: FeederAccess | None, access_out: FeederAccess | None) -> str | None:
    parts: list[str] = []
    if access_in:
        parts.append(
            f"{access_in.local_place} → {access_in.hub_city} hub"
            + (f" ({access_in.local_station})" if access_in.local_station else "")
        )
    if access_out:
        parts.append(
            f"{access_out.hub_city} hub → {access_out.local_place}"
            + (f" ({access_out.local_station})" if access_out.local_station else "")
        )
    if not parts:
        return None
    return (
        "Local connection included: "
        + " · ".join(parts)
        + " — train or truck leg to the interchange before the main corridor."
    )


class RouteComposer:
    def compose(
        self,
        source: str,
        destination: str,
        payload: dict[str, Any] | None = None,
        context: RequestContext | None = None,
        *,
        on_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        payload = {**(payload or {}), "compose_lite": True}
        context = context or RequestContext()
        from app.services.location_funnel import normalize_corridor

        src_r, dst_r = normalize_corridor(source, destination, context=context)
        origin = src_r.canonical_city
        dest = dst_r.canonical_city
        src_feeder = get_feeder_access(src_r)
        dst_feeder = get_feeder_access(dst_r)
        origin_effective = src_feeder.hub_city if src_feeder else origin
        dest_effective = dst_feeder.hub_city if dst_feeder else dest
        priority = (payload.get("priority") or "balanced").lower().strip()
        opts = payload.get("compose_options") or {}
        max_hubs = min(3, int(opts.get("max_hubs", 2)))
        include_heavy = bool(opts.get("include_road_water", False))
        budget_s = min(180, int(opts.get("budget_seconds", _COMPOSE_BUDGET_S)))
        deadline = time.monotonic() + budget_s

        excluded = set(
            m.lower()
            for m in (payload.get("constraints") or {}).get("excluded_modes", [])
        )

        corridor_km = _corridor_distance_for_resolution(
            src_r, dst_r, src_feeder, dst_feeder, context
        )
        has_feeder = bool(src_feeder or dst_feeder)
        if has_feeder:
            budget_s = min(180, max(budget_s, 120))
            deadline = time.monotonic() + budget_s

        warm_corridor = _corridor_is_warm(origin_effective, dest_effective, priority)
        known = is_known_corridor(origin_effective, dest_effective)

        src_remote = is_remote_location(
            canonical_city=src_r.canonical_city,
            station_codes=src_r.station_codes or [],
            lat=src_r.lat,
            lng=src_r.lng,
            raw=src_r.raw,
            resolution=src_r.resolution,
        )
        dst_remote = is_remote_location(
            canonical_city=dst_r.canonical_city,
            station_codes=dst_r.station_codes or [],
            lat=dst_r.lat,
            lng=dst_r.lng,
            raw=dst_r.raw,
            resolution=dst_r.resolution,
        )
        rural_corridor = src_remote or dst_remote
        if rural_corridor:
            budget_s = min(180, max(budget_s, 100))
            deadline = time.monotonic() + budget_s
        hub_pairs: list[HubPair] = (
            discover_rural_hub_pairs(src_r, dst_r, max_pairs=6) if rural_corridor else []
        )

        # Feeder / rural corridors need local access legs — never collapse to direct-only.
        short_corridor = (
            corridor_km is not None
            and corridor_km < _SHORT_CORRIDOR_KM
            and not has_feeder
            and not rural_corridor
        )

        if short_corridor:
            hubs = []
            templates: list[tuple[str, str, str]] = []
            max_leg_calls = 4
            try_road = True
        else:
            # Always try at least one on-path hub — emit hub routes before slow direct rail.
            if warm_corridor or known:
                hub_cap = max_hubs if known else min(max_hubs, 1)
            else:
                hub_cap = min(max_hubs, 1)
            hubs = get_hubs(origin_effective, dest_effective, max_hubs=hub_cap)

            templates = _HUB_TEMPLATES if warm_corridor else _COLD_HUB_TEMPLATES
            max_leg_calls = _MAX_LEG_CALLS_WARM if warm_corridor else _MAX_LEG_CALLS_COLD
            if rural_corridor:
                max_leg_calls = _MAX_LEG_CALLS_RURAL
            if src_feeder or dst_feeder:
                max_leg_calls += _FEEDER_RESERVED_SLOTS
            # Rural / village corridors always need road access legs to nearest metros.
            try_road = warm_corridor or known or bool(hubs) or rural_corridor

        leg_cache: dict[tuple[str, str, str], Any] = {}
        mode_fail_counts: dict[str, int] = {}
        itineraries: list[dict[str, Any]] = []
        unavailable: dict[str, str] = {}
        leg_calls = 0
        access_in_leg = None
        access_out_leg = None

        def _snapshot_context() -> dict[str, Any]:
            return dict(
                hubs=hubs,
                hub_pairs=hub_pairs,
                unavailable=unavailable,
                rural_corridor=rural_corridor,
                has_feeder=has_feeder,
                warm_corridor=warm_corridor,
                short_corridor=short_corridor,
                corridor_km=corridor_km,
                src_r=src_r,
                dst_r=dst_r,
                src_feeder=src_feeder,
                dst_feeder=dst_feeder,
                access_in_leg=access_in_leg,
                access_out_leg=access_out_leg,
            )

        def _emit_progress(*, force: bool = False) -> None:
            if not on_progress or not itineraries:
                return
            snap = _build_compose_snapshot(
                itineraries,
                priority,
                partial=not force,
                streaming=not force,
                **_snapshot_context(),
            )
            if snap.get("recommended"):
                snap["just_found_id"] = itineraries[-1].get("id")
                on_progress(snap)

        def _note_itinerary(it: dict[str, Any]) -> None:
            if src_feeder or dst_feeder:
                wrapped = self._wrap_feeder_access(
                    it, src_feeder, dst_feeder, access_in_leg, access_out_leg
                )
                if wrapped:
                    it = wrapped
            itineraries.append(it)
            _emit_progress(force=True)

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

        def _resolve_leg_endpoints(
            mode: str,
            frm: str,
            to: str,
            *,
            use_raw_endpoints: bool = False,
        ) -> tuple[str, str, tuple[str, str, str]] | None:
            if _should_skip_mode(mode) or _past_deadline():
                return None
            if use_raw_endpoints:
                frm_c, to_c = frm.strip(), to.strip()
            else:
                frm_c, to_c = canonical_city(frm), canonical_city(to)
            if frm_c.lower() == to_c.lower():
                return None
            return frm_c, to_c, (mode, frm_c, to_c)

        def _leg_from_cache(key: tuple[str, str, str]) -> Any | None:
            if key in leg_cache:
                return leg_cache[key]
            cached = get_cached_leg(key[0], key[1], key[2], priority)
            if not cached:
                return None
            status, data = cached
            if status == "fail":
                leg_cache[key] = None
                _record_fail(key[0])
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
            return None

        def _store_leg_result(key: tuple[str, str, str], leg: Any | None) -> Any | None:
            leg_cache[key] = leg
            set_cached_leg(key[0], key[1], key[2], priority, leg_to_dict(leg) if leg else None)
            if not leg:
                _record_fail(key[0])
            return leg

        def fetch_legs_parallel(
            specs: list[tuple[str, str, str, dict[str, Any]]],
        ) -> dict[tuple[str, str, str], Any | None]:
            """Run independent leg pipelines concurrently (GCP thread pool)."""
            nonlocal leg_calls
            out: dict[tuple[str, str, str], Any | None] = {}
            pending: list[tuple[tuple[str, str, str], str, str, str, dict[str, Any]]] = []

            for mode, frm, to, kw in specs:
                resolved = _resolve_leg_endpoints(
                    mode, frm, to, use_raw_endpoints=bool(kw.get("use_raw_endpoints"))
                )
                if not resolved:
                    continue
                frm_c, to_c, key = resolved
                hit = _leg_from_cache(key)
                if hit is not None or key in leg_cache:
                    out[key] = leg_cache.get(key)
                    continue
                pending.append((key, mode, frm_c, to_c, kw))

            if not pending or _past_deadline():
                return out

            slot_cost = sum(1 for *_, kw in pending if not kw.get("reserve_slot"))
            if leg_calls + slot_cost > max_leg_calls:
                allowed = max(0, max_leg_calls - leg_calls)
                trim: list = []
                used = 0
                for item in pending:
                    if item[4].get("reserve_slot") or used < allowed:
                        trim.append(item)
                        if not item[4].get("reserve_slot"):
                            used += 1
                pending = trim
                if not pending:
                    unavailable["_leg_cap"] = "Leg call limit reached — partial results returned"
                    return out

            leg_calls += sum(1 for *_, kw in pending if not kw.get("reserve_slot"))
            wait_s = min(
                max(_leg_wait_s(item[1]) for item in pending),
                max(1.0, _remaining_s() - 0.25),
            )
            if wait_s <= 0:
                return out

            futures = {
                _executor.submit(_do_pipeline, mode, frm_c, to_c): key
                for key, mode, frm_c, to_c, _kw in pending
            }
            try:
                for future in as_completed(futures, timeout=wait_s):
                    key = futures[future]
                    try:
                        leg = future.result()
                    except Exception as e:
                        mode, frm_c, to_c = key
                        print(f"[COMPOSE] {mode} {frm_c}→{to_c} failed: {e}")
                        leg = None
                    out[key] = _store_leg_result(key, leg)
            except FuturesTimeoutError:
                for future, key in futures.items():
                    if future.done():
                        try:
                            out[key] = _store_leg_result(key, future.result())
                        except Exception:
                            out[key] = _store_leg_result(key, None)
                    elif key not in out:
                        mode, frm_c, to_c = key
                        print(f"[COMPOSE] {mode} {frm_c}→{to_c} timed out ({wait_s:.0f}s)")
                        out[key] = _store_leg_result(key, None)
            return out

        def fetch_leg(
            mode: str,
            frm: str,
            to: str,
            *,
            use_raw_endpoints: bool = False,
            reserve_slot: bool = False,
        ) -> Any | None:
            nonlocal leg_calls

            if _should_skip_mode(mode) or _past_deadline():
                return None

            if use_raw_endpoints:
                frm_c, to_c = frm.strip(), to.strip()
            else:
                frm_c, to_c = canonical_city(frm), canonical_city(to)

            if frm_c.lower() == to_c.lower():
                return None

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
            if wait_s <= 0:
                return None
            if not reserve_slot and leg_calls >= max_leg_calls:
                unavailable["_leg_cap"] = "Leg call limit reached — partial results returned"
                return None

            if not reserve_slot:
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

        # ── Phase 0: feeder legs in parallel (reserved slots + synthetic fallback) ──
        if src_feeder and dst_feeder and not _past_deadline():
            fin = _executor.submit(self._fetch_access_leg, fetch_leg, src_feeder)
            fout = _executor.submit(
                self._fetch_access_leg,
                fetch_leg,
                dst_feeder,
                frm=dst_feeder.hub_city,
                to=dst_feeder.local_place,
            )
            try:
                access_in_leg = fin.result(timeout=max(1.0, min(20.0, _remaining_s())))
                access_out_leg = fout.result(timeout=max(1.0, min(20.0, _remaining_s())))
            except FuturesTimeoutError:
                access_in_leg = fin.result() if fin.done() else None
                access_out_leg = fout.result() if fout.done() else None
        else:
            if src_feeder and not _past_deadline():
                access_in_leg = self._fetch_access_leg(fetch_leg, src_feeder)
            elif src_feeder:
                access_in_leg = self._synthetic_feeder_leg(src_feeder, outbound=False)
                unavailable["feeder:in:estimate"] = (
                    f"Estimated local leg {src_feeder.local_place}→{src_feeder.hub_city}"
                )
            if dst_feeder and not _past_deadline():
                access_out_leg = self._fetch_access_leg(
                    fetch_leg, dst_feeder, frm=dst_feeder.hub_city, to=dst_feeder.local_place
                )
            elif dst_feeder:
                access_out_leg = self._synthetic_feeder_leg(dst_feeder, outbound=True)
                unavailable["feeder:out:estimate"] = (
                    f"Estimated local leg {dst_feeder.hub_city}→{dst_feeder.local_place}"
                )

        if src_feeder and access_in_leg and self._leg_is_synthetic(access_in_leg):
            unavailable["feeder:in:estimate"] = (
                f"Estimated local leg {src_feeder.local_place}→{src_feeder.hub_city}"
            )
        if dst_feeder and access_out_leg and self._leg_is_synthetic(access_out_leg):
            unavailable["feeder:out:estimate"] = (
                f"Estimated local leg {dst_feeder.hub_city}→{dst_feeder.local_place}"
            )

        # ── Phase 1: direct road + air in parallel ──
        if not _past_deadline() and leg_calls < max_leg_calls:
            direct_specs: list[tuple[str, str, str, dict[str, Any]]] = []
            if "road" not in excluded and not _should_skip_mode("road") and try_road:
                direct_specs.append(("road", origin_effective, dest_effective, {}))
            if (
                not short_corridor
                and "air" not in excluded
                and not _should_skip_mode("air")
            ):
                direct_specs.append(("air", origin_effective, dest_effective, {}))
            direct_hits = fetch_legs_parallel(direct_specs)
            road_key = ("road", canonical_city(origin_effective), canonical_city(dest_effective))
            air_key = ("air", canonical_city(origin_effective), canonical_city(dest_effective))
            road_leg = direct_hits.get(road_key)
            air_leg = direct_hits.get(air_key)
            if road_leg:
                _note_itinerary(self._single_leg_itinerary(road_leg, "direct_road"))
            elif try_road and "road" not in excluded and not itineraries:
                unavailable["direct_road"] = "No direct road route"
            if air_leg:
                _note_itinerary(self._single_leg_itinerary(air_leg, "direct_air"))
            elif not short_corridor and "air" not in excluded:
                unavailable["direct_air"] = "No direct air route"

        # ── Phase 2: hub-by-hub — emit rail+rail first, then other templates if budget left ──
        if not short_corridor:
            for hub in hubs:
                if _past_deadline() or leg_calls >= max_leg_calls:
                    unavailable["_budget"] = "Time budget reached — partial results returned"
                    break

                if "rail" not in excluded and not _past_deadline():
                    rr = fetch_legs_parallel(
                        [
                            ("rail", origin_effective, hub.city, {}),
                            ("rail", hub.city, dest_effective, {}),
                        ]
                    )
                    o_city = canonical_city(origin_effective)
                    d_city = canonical_city(dest_effective)
                    leg_in = rr.get(("rail", o_city, hub.city))
                    leg_out = rr.get(("rail", hub.city, d_city))
                    if leg_in and leg_out:
                        _note_itinerary(
                            self._compose_two_leg("rail+rail", hub, leg_in, leg_out)
                        )

                for template_id, mode1, mode2 in templates:
                    if template_id == "rail+rail":
                        continue
                    if mode1 in excluded or mode2 in excluded or _past_deadline():
                        continue
                    if leg_calls >= max_leg_calls:
                        break
                    if not try_road and (mode1 == "road" or mode2 == "road"):
                        continue

                    pair = fetch_legs_parallel(
                        [
                            (mode1, origin_effective, hub.city, {}),
                            (mode2, hub.city, dest_effective, {}),
                        ]
                    )
                    h_city = hub.city
                    o_city = canonical_city(origin_effective)
                    d_city = canonical_city(dest_effective)
                    leg_in = pair.get((mode1, o_city, h_city))
                    leg_out = pair.get((mode2, h_city, d_city))
                    if not leg_in:
                        unavailable[f"{template_id}:{hub.city}:in"] = (
                            f"no {mode1} {origin}→{hub.city}"
                        )
                        continue
                    if not leg_out:
                        unavailable[f"{template_id}:{hub.city}"] = (
                            f"{mode2} {hub.city}→{dest} failed"
                        )
                        continue

                    _note_itinerary(
                        self._compose_two_leg(template_id, hub, leg_in, leg_out)
                    )

        # ── Phase 3: rural geo-hub chains (village → nearest metro → metro → village) ──
        if not short_corridor and hub_pairs:
            for pair in hub_pairs:
                if _past_deadline() or leg_calls >= max_leg_calls:
                    break
                h_o, h_d = pair.origin_hub, pair.dest_hub
                inter_modes = ["rail"]
                if h_o.airport_code and h_d.airport_code:
                    inter_modes.append("air")

                for inter_mode in inter_modes:
                    if inter_mode in excluded or _past_deadline() or leg_calls >= max_leg_calls:
                        continue

                    legs: list[Any] = []
                    template_parts: list[str] = []

                    if src_remote:
                        if "road" in excluded:
                            continue
                        leg_a = fetch_leg("road", origin, h_o.city)
                        if not leg_a:
                            unavailable[f"rural:road:{h_o.city}"] = f"no road {origin}→{h_o.city}"
                            continue
                        legs.append(leg_a)
                        template_parts.append("road")

                    leg_mid = fetch_leg(inter_mode, h_o.city, h_d.city)
                    if not leg_mid:
                        unavailable[f"rural:{inter_mode}:{h_o.city}-{h_d.city}"] = (
                            f"no {inter_mode} {h_o.city}→{h_d.city}"
                        )
                        continue
                    legs.append(leg_mid)
                    template_parts.append(inter_mode)

                    if dst_remote:
                        if "road" in excluded:
                            continue
                        leg_c = fetch_leg("road", h_d.city, dest)
                        if not leg_c:
                            unavailable[f"rural:road:{h_d.city}"] = f"no road {h_d.city}→{dest}"
                            continue
                        legs.append(leg_c)
                        template_parts.append("road")

                    if len(legs) < 2:
                        continue

                    template_id = "rural_" + "+".join(template_parts)
                    if len(legs) == 2:
                        hub = h_o if src_remote else h_d
                        _note_itinerary(
                            self._compose_two_leg(template_id, hub, legs[0], legs[1])
                        )
                    else:
                        _note_itinerary(
                            self._compose_three_leg(template_id, h_o, h_d, legs[0], legs[1], legs[2])
                        )

        # ── Phase 4: direct rail (slow scraper — after hub options are already streamed) ──
        if not _past_deadline() and leg_calls < max_leg_calls and "rail" not in excluded:
            leg = fetch_leg("rail", origin_effective, dest_effective)
            if leg:
                _note_itinerary(self._single_leg_itinerary(leg, "direct_rail"))
            else:
                unavailable["direct_rail"] = "No direct rail route"

        if include_heavy and not _past_deadline() and "water" not in excluded:
            leg = fetch_leg("water", origin_effective, dest_effective)
            if leg:
                _note_itinerary(self._single_leg_itinerary(leg, "direct_water"))

        if not itineraries:
            out: dict[str, Any] = {
                "error": "No multimodal or direct routes could be composed for this corridor",
                "hubs_considered": [h.to_dict() for h in hubs],
                "hub_pairs_considered": [p.to_dict() for p in hub_pairs],
                "rural_corridor": rural_corridor,
                "feeder_corridor": has_feeder,
                "unavailable_templates": unavailable,
                "baselines": {},
                "partial": False,
                "short_corridor": short_corridor,
                "corridor_distance_km": corridor_km,
                "resolved_source": {
                    **src_r.to_dict(),
                    **({"feeder_access": src_feeder.to_dict()} if src_feeder else {}),
                },
                "resolved_destination": {
                    **dst_r.to_dict(),
                    **({"feeder_access": dst_feeder.to_dict()} if dst_feeder else {}),
                },
            }
            feeder_note = _feeder_compose_note(
                src_feeder, dst_feeder, access_in_leg, access_out_leg
            )
            if short_corridor and corridor_km is not None:
                out["compose_note"] = _short_corridor_note(corridor_km)
            elif feeder_note:
                out["compose_note"] = feeder_note
            elif rural_corridor:
                out["compose_note"] = (
                    "Rural or unmapped place detected — showing direct routes plus "
                    "options via nearest major hub cities (road + train/air)."
                )
            return out

        if short_corridor:
            itineraries = [
                it
                for it in itineraries
                if it.get("type") == "direct"
                or str(it.get("template_id") or "").startswith("feeder+")
            ]

        if not itineraries:
            out = {
                "error": (
                    "No direct routes could be composed for this short corridor. "
                    "Try naming the nearest major city or station as origin/destination."
                ),
                "hubs_considered": [],
                "hub_pairs_considered": [p.to_dict() for p in hub_pairs],
                "rural_corridor": rural_corridor,
                "feeder_corridor": has_feeder,
                "unavailable_templates": unavailable,
                "baselines": {},
                "partial": False,
                "short_corridor": True,
                "corridor_distance_km": corridor_km,
                "resolved_source": {
                    **src_r.to_dict(),
                    **({"feeder_access": src_feeder.to_dict()} if src_feeder else {}),
                },
                "resolved_destination": {
                    **dst_r.to_dict(),
                    **({"feeder_access": dst_feeder.to_dict()} if dst_feeder else {}),
                },
            }
            feeder_note = _feeder_access_note(src_feeder, dst_feeder)
            if corridor_km is not None:
                out["compose_note"] = _short_corridor_note(corridor_km)
            elif feeder_note:
                out["compose_note"] = feeder_note
            return out

        partial = "_budget" in unavailable or "_leg_cap" in unavailable
        out = _build_compose_snapshot(
            itineraries,
            priority,
            partial=partial,
            streaming=False,
            **_snapshot_context(),
        )
        return out

    @staticmethod
    def _leg_is_synthetic(leg: Any) -> bool:
        segs = getattr(leg, "segments", None) or []
        if segs and isinstance(segs[0], dict):
            return bool(segs[0].get("estimated"))
        if isinstance(leg, dict):
            segs = leg.get("segments") or []
            return bool(segs and segs[0].get("estimated"))
        return False

    def _synthetic_feeder_leg(
        self,
        feeder: FeederAccess,
        *,
        outbound: bool = False,
    ) -> Any:
        from app.services.leg_extractor import Leg

        dist_km: float | None = None
        if feeder.local_station_code and feeder.hub_station_code:
            try:
                from app.pipelines.rail.station_coordinates import get_station_latlng

                p1 = get_station_latlng(feeder.local_station_code)
                p2 = get_station_latlng(feeder.hub_station_code)
                if p1 and p2:
                    dist_km = _haversine_km(p1[0], p1[1], p2[0], p2[1])
            except Exception:
                pass
        if dist_km is None or dist_km < 1:
            dist_km = 32.0

        mode = "rail" if dist_km < 90 else "road"
        speed = 38.0 if mode == "rail" else 45.0
        time_hr = max(dist_km / speed, 0.25)
        cost_inr = max(int(dist_km * 2.0 + 45), 55)

        if outbound:
            src, dst = feeder.hub_city, feeder.local_place
        else:
            src, dst = feeder.local_place, feeder.hub_city

        return Leg(
            mode=mode,
            source=src,
            destination=dst,
            time_hr=round(time_hr, 2),
            cost_inr=cost_inr,
            risk=0.12,
            segments=[
                {
                    "mode": mode.title(),
                    "from": src,
                    "to": dst,
                    "distance_km": round(dist_km, 1),
                    "estimated": True,
                    "note": "Estimated feeder connection from station coordinates",
                }
            ],
            status="ok",
        )

    def _fetch_access_leg(
        self,
        fetch_leg,
        feeder: FeederAccess,
        *,
        frm: str | None = None,
        to: str | None = None,
    ) -> Any | None:
        outbound = bool(frm and to)
        inbound_default = frm is None and to is None
        reserve = {"reserve_slot": True}

        if outbound and feeder.hub_station_code and feeder.local_station_code:
            for mode in ("rail", "road"):
                leg = fetch_leg(
                    mode,
                    feeder.hub_station_code,
                    feeder.local_station_code,
                    use_raw_endpoints=True,
                    **reserve,
                )
                if leg:
                    return leg
        elif inbound_default and feeder.local_station_code and feeder.hub_station_code:
            for mode in ("rail", "road"):
                leg = fetch_leg(
                    mode,
                    feeder.local_station_code,
                    feeder.hub_station_code,
                    use_raw_endpoints=True,
                    **reserve,
                )
                if leg:
                    return leg

        leg = fetch_leg(
            "road",
            frm or feeder.local_place,
            to or feeder.hub_city,
            use_raw_endpoints=True,
            **reserve,
        )
        if leg:
            return leg

        return self._synthetic_feeder_leg(feeder, outbound=outbound)

    def _wrap_feeder_access(
        self,
        itin: dict[str, Any],
        src_feeder: FeederAccess | None,
        dst_feeder: FeederAccess | None,
        access_in_leg: Any | None,
        access_out_leg: Any | None,
    ) -> dict[str, Any] | None:
        legs = [enrich_leg(dict(l)) for l in (itin.get("legs") or [])]
        transfers = list(itin.get("transfers") or [])
        hub_cities = list(itin.get("hub_cities") or [])
        extra_handling = 0
        extra_time = 0.0
        template_id = str(itin.get("template_id") or "direct")

        if src_feeder and access_in_leg:
            d0 = enrich_leg(leg_to_dict(access_in_leg))
            d0["source"] = src_feeder.local_place
            d0["destination"] = src_feeder.hub_city
            buf = self._transfer_buffer(d0["mode"], legs[0]["mode"])
            transfer = build_transfer_detail(
                d0,
                legs[0],
                src_feeder.hub_city,
                src_feeder.hub_city,
                buf,
                _HANDLING_FEE_INR,
            )
            local_hint = src_feeder.local_station or src_feeder.local_place
            hub_hint = src_feeder.hub_station or src_feeder.hub_city
            transfer["warnings"] = [
                f"Local pickup at {local_hint}",
                f"Connect at {hub_hint} for the main corridor",
                *transfer.get("warnings", []),
            ]
            legs = [d0] + legs
            transfers = [transfer] + transfers
            if src_feeder.hub_city not in hub_cities:
                hub_cities = [src_feeder.hub_city, *hub_cities]
            extra_handling += _HANDLING_FEE_INR
            extra_time += d0["time_hr"] + buf
        elif src_feeder and not access_in_leg:
            return {
                **itin,
                "partial_feeder": True,
                "feeder_warnings": [
                    *list(itin.get("feeder_warnings") or []),
                    (
                        f"Local pickup not scheduled: {src_feeder.local_place} → "
                        f"{src_feeder.hub_city} — route starts at the hub."
                    ),
                ],
            }

        if dst_feeder and access_out_leg:
            d_last = enrich_leg(leg_to_dict(access_out_leg))
            d_last["source"] = dst_feeder.hub_city
            d_last["destination"] = dst_feeder.local_place
            buf = self._transfer_buffer(legs[-1]["mode"], d_last["mode"])
            transfer = build_transfer_detail(
                legs[-1],
                d_last,
                dst_feeder.hub_city,
                dst_feeder.hub_city,
                buf,
                _HANDLING_FEE_INR,
            )
            local_hint = dst_feeder.local_station or dst_feeder.local_place
            hub_hint = dst_feeder.hub_station or dst_feeder.hub_city
            transfer["warnings"] = [
                f"Main corridor ends at {hub_hint}",
                f"Last mile from {hub_hint} to {local_hint} "
                f"by {'train' if d_last['mode'] == 'rail' else 'truck'}",
                *transfer.get("warnings", []),
            ]
            legs = legs + [d_last]
            transfers = transfers + [transfer]
            if dst_feeder.hub_city not in hub_cities:
                hub_cities = [*hub_cities, dst_feeder.hub_city]
            extra_handling += _HANDLING_FEE_INR
            extra_time += d_last["time_hr"] + buf
        elif dst_feeder and not access_out_leg:
            if src_feeder and not access_in_leg:
                return None
            itin = {
                **itin,
                "partial_feeder": True,
                "feeder_warnings": [
                    *list(itin.get("feeder_warnings") or []),
                    (
                        f"Last mile not scheduled: {dst_feeder.hub_city} → "
                        f"{dst_feeder.local_place} — route ends at the hub."
                    ),
                ],
            }

        if (src_feeder and access_in_leg) or (dst_feeder and access_out_leg):
            template_id = f"feeder+{template_id}"

        segments: list[Any] = []
        for leg in legs:
            segments.extend(leg.get("segments") or [])

        trip_type = itin.get("type")
        if len(legs) > 1:
            trip_type = "multimodal"

        return {
            **itin,
            "id": f"{template_id}:{itin.get('id', 'trip')}",
            "template_id": template_id,
            "type": trip_type,
            "hub_cities": hub_cities,
            "legs": legs,
            "transfers": transfers,
            "total_time_hr": round(float(itin["total_time_hr"]) + extra_time, 2),
            "total_cost_inr": int(itin["total_cost_inr"]) + extra_handling,
            "transshipments": int(itin.get("transshipments") or 0) + (
                (1 if src_feeder and access_in_leg else 0)
                + (1 if dst_feeder and access_out_leg else 0)
            ),
            "segments": segments,
        }

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

    def _compose_three_leg(
        self,
        template_id: str,
        hub_origin: Hub,
        hub_dest: Hub,
        leg1: Any,
        leg2: Any,
        leg3: Any,
    ) -> dict[str, Any]:
        d1 = leg_to_dict(leg1)
        d2 = leg_to_dict(leg2)
        d3 = leg_to_dict(leg3)
        buf1 = self._transfer_buffer(d1["mode"], d2["mode"])
        buf2 = self._transfer_buffer(d2["mode"], d3["mode"])
        handling = _HANDLING_FEE_INR * 2

        total_time = d1["time_hr"] + buf1 + d2["time_hr"] + buf2 + d3["time_hr"]
        total_cost = d1["cost_inr"] + d2["cost_inr"] + d3["cost_inr"] + handling
        total_risk = 1 - (1 - d1["risk"]) * (1 - d2["risk"]) * (1 - d3["risk"]) + 0.12

        t1 = build_transfer_detail(
            d1, d2, hub_origin.city, hub_origin.display_name, buf1, _HANDLING_FEE_INR
        )
        t2 = build_transfer_detail(
            d2, d3, hub_dest.city, hub_dest.display_name, buf2, _HANDLING_FEE_INR
        )

        return {
            "id": f"{template_id}:{hub_origin.city}:{hub_dest.city}",
            "template_id": template_id,
            "type": "multimodal",
            "hub_cities": [hub_origin.city, hub_dest.city],
            "legs": [d1, d2, d3],
            "transfers": [t1, t2],
            "total_time_hr": round(total_time, 2),
            "total_cost_inr": int(total_cost),
            "total_risk": round(min(1.0, total_risk), 3),
            "transshipments": 2,
            "segments": list(d1["segments"]) + list(d2["segments"]) + list(d3["segments"]),
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
