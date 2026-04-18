"""
Indian Railway data client for the Railway Cargo Decision Engine.

Lightweight scraping-first pipeline:
  Tier 1: RailYatri HTML scrape (primary)
  Tier 2: ConfirmTkt HTML scrape (fallback)

All session-based IRCTC scraping, RapidAPI key rotation, IRCTC Connect
signed API, and cookie-harvesting logic have been removed.

Features:
  - Redis cache (production) + in-memory cache (fallback for local dev)
  - Circuit-breaker resilience (trips after 5 failures → fast-fail 60s)
  - Strict timeouts on all scraping calls (3-5s)
  - Request-level caching via RequestContext
"""

import hashlib
import json
import os
import re
import time
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

# ── ConfirmTkt Configuration ─────────────────────────────────────────
CONFIRMTKT_WEB_BASE_URL = os.environ.get(
    "CONFIRMTKT_WEB_BASE_URL",
    "https://www.confirmtkt.com",
).rstrip("/")

# ConfirmTkt scraping guardrails (keep API responsive even if provider stalls).
_CONFIRMTKT_CONNECT_TIMEOUT_S = float(os.getenv("CONFIRMTKT_CONNECT_TIMEOUT_S", "3"))
_CONFIRMTKT_READ_TIMEOUT_S = float(os.getenv("CONFIRMTKT_READ_TIMEOUT_S", "4"))
_CONFIRMTKT_TOTAL_BUDGET_S = float(os.getenv("CONFIRMTKT_TOTAL_BUDGET_S", "6"))


# ══════════════════════════════════════════════════════════════════════
#  CACHE LAYER — Redis (production) + in-memory (fallback)
# ══════════════════════════════════════════════════════════════════════

# TTL configuration per endpoint category (in seconds)
_CACHE_TTL = {
    "searchStation":        30 * 24 * 3600,   # 30 days — stations never change
    "searchTrain":          7 * 24 * 3600,     # 7 days  — train metadata is stable
    "trainBetweenStations": 24 * 3600,         # 1 day   — schedule can change seasonally
    "getTrainSchedule":     7 * 24 * 3600,     # 7 days  — schedules are fairly stable
    "getFare":              3 * 24 * 3600,     # 3 days  — fares can be revised
    "liveTrainStatus":      300,               # 5 Min   — buffer to prevent 429 spikes on team-wide polls
    "getLiveStation":       600,               # 10 Min
    "getTrainDelay":        300,               # 5 Min
    "default":              24 * 3600,         # 1 day fallback
}

# Feature Flag: If True, cache never expires (ignoring TTL on read)
PERMANENT_CACHE = os.getenv("RAIL_PERMANENT_CACHE", "true").lower() == "true"

# Redis connection
_redis_client = None
_redis_available = False
_REDIS_PREFIX = "irctc:"


def _init_redis():
    """Try to connect to Redis. Falls back to in-memory cache if unavailable."""
    global _redis_client, _redis_available
    try:
        import redis
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            _redis_client = redis.from_url(redis_url, decode_responses=True)
            print(f"  [Cache] 📡 Connecting to Redis via URL...")
        else:
            _redis_client = redis.Redis(
                host=os.getenv("REDIS_HOST", "localhost"),
                port=int(os.getenv("REDIS_PORT", "6379")),
                db=int(os.getenv("REDIS_DB", "0")),
                decode_responses=True
            )
        _redis_client.ping()
        _redis_available = True
        print("  [Cache] ✅ Redis connected")

        # MIGRATION: If Permanent Cache is enabled, remove TTL from ALL existing keys
        if PERMANENT_CACHE:
            keys = _redis_client.keys(f"{_REDIS_PREFIX}*")
            if keys:
                p = _redis_client.pipeline()
                for k in keys:
                    p.persist(k)
                p.execute()
                print(f"  [Cache] 🔓 PERSISTED {len(keys)} existing Redis keys (Permanent Mode)")
    except Exception as e:
        _redis_available = False
        print(f"  [Cache] ⚠️ Redis unavailable ({e}) — using in-memory cache")


# In-memory fallback
_mem_cache = {}

def _cache_key(endpoint, params):
    """Generate a deterministic cache key from endpoint + params."""
    param_str = json.dumps(params or {}, sort_keys=True)
    raw = f"{endpoint}|{param_str}"
    return _REDIS_PREFIX + hashlib.md5(raw.encode()).hexdigest()

def _get_ttl_for_endpoint(endpoint):
    """Get the TTL for a given endpoint path."""
    for key, ttl in _CACHE_TTL.items():
        if key.lower() in endpoint.lower():
            return ttl
    return _CACHE_TTL["default"]

def _cache_get(key):
    """Read from cache. Tries Redis first, falls back to in-memory."""
    # Try Redis
    if _redis_available and _redis_client:
        try:
            cached = _redis_client.get(key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    # In-memory fallback
    entry = _mem_cache.get(key)
    if entry:
        # Check if expired, unless PERMANENT_CACHE is enabled
        if PERMANENT_CACHE or entry["expires_at"] > time.time():
            return entry["data"]
        else:
            del _mem_cache[key]  # expired

    return None

def _cache_set(key, data, ttl):
    """Write to cache. Writes to BOTH Redis and in-memory."""
    # If permanent cache is enabled, we use a very long TTL or 0 (forever)
    effective_ttl = 30 * 24 * 3600 * 12 if PERMANENT_CACHE else ttl # 1 Year if "permanent"

    if effective_ttl <= 0 and not PERMANENT_CACHE:
        return  # Don't cache real-time data unless permanent mode is on

    # Redis
    if _redis_available and _redis_client:
        try:
            if PERMANENT_CACHE:
                _redis_client.set(key, json.dumps(data)) # No expiration
            else:
                _redis_client.setex(key, effective_ttl, json.dumps(data))
        except Exception:
            pass

    # In-memory (always — serves as L1 / fallback)
    _mem_cache[key] = {
        "data": data,
        "expires_at": time.time() + effective_ttl,
    }

    # Bounded cache to avoid overflow (rudimentary LRU/FIFO eviction)
    if len(_mem_cache) > 1000:
        # Delete the oldest 100 entries to reclaim memory
        for k in list(_mem_cache.keys())[:100]:
            del _mem_cache[k]



def get_cache_stats():
    """Return cache statistics for monitoring."""
    stats = {
        "backend": "redis" if _redis_available else "in-memory",
        "in_memory_entries": len(_mem_cache),
    }
    if _redis_available and _redis_client:
        try:
            info = _redis_client.info("keyspace")
            db_info = info.get("db0", {})
            stats["redis_keys"] = db_info.get("keys", 0) if isinstance(db_info, dict) else 0
        except Exception:
            stats["redis_keys"] = "error"
    return stats


# Initialize Redis on module load (non-blocking)
_init_redis()


# ══════════════════════════════════════════════════════════════════════
#  CIRCUIT BREAKER
# ══════════════════════════════════════════════════════════════════════

_CB_FAILURE_THRESHOLD = 5       # Trip after N consecutive failures
_CB_RECOVERY_TIMEOUT = 60       # Seconds before half-open retry
_cb_consecutive_failures = 0
_cb_last_failure_time = 0
_cb_state = "closed"            # closed | open | half-open
_cb_total_trips = 0


def _cb_record_success():
    """Reset circuit breaker on a successful response."""
    global _cb_consecutive_failures, _cb_state
    _cb_consecutive_failures = 0
    if _cb_state != "closed":
        print("  [RAIL] ⚡ Circuit breaker CLOSED (scraper recovered)")
    _cb_state = "closed"


def _cb_record_failure():
    """Track failure; trip the breaker if threshold reached."""
    global _cb_consecutive_failures, _cb_last_failure_time, _cb_state, _cb_total_trips
    _cb_consecutive_failures += 1
    _cb_last_failure_time = time.time()
    if _cb_consecutive_failures >= _CB_FAILURE_THRESHOLD and _cb_state == "closed":
        _cb_state = "open"
        _cb_total_trips += 1
        print(f"  [RAIL] 🔴 Circuit breaker OPEN after {_cb_consecutive_failures} "
              f"consecutive failures. Fast-failing for {_CB_RECOVERY_TIMEOUT}s.")


def _cb_allow_request():
    """Check if the circuit breaker allows a request through."""
    global _cb_state
    if _cb_state == "closed":
        return True
    elapsed = time.time() - _cb_last_failure_time
    if elapsed >= _CB_RECOVERY_TIMEOUT:
        _cb_state = "half-open"
        print("  [RAIL] 🟡 Circuit breaker HALF-OPEN (attempting recovery probe)")
        return True
    return False


def get_circuit_status():
    """Return the current circuit breaker + cache health status."""
    return {
        "state": _cb_state,
        "consecutive_failures": _cb_consecutive_failures,
        "total_trips": _cb_total_trips,
        "failure_threshold": _CB_FAILURE_THRESHOLD,
        "recovery_timeout_s": _CB_RECOVERY_TIMEOUT,
        "seconds_since_last_failure": (
            round(time.time() - _cb_last_failure_time, 1)
            if _cb_last_failure_time > 0 else None
        ),
        "api_provider": "RailYatri + ConfirmTkt (lightweight scraping)",
        "cache": get_cache_stats(),
    }


# ══════════════════════════════════════════════════════════════════════
#  STATION ENDPOINTS (offline-only, no external API)
# ══════════════════════════════════════════════════════════════════════

from app.pipelines.rail.fallback_stations import search_offline_stations

def search_stations(query):
    """
    Search stations by name or code.
    Returns: [{code, name, state_name}]
    """
    q = (query or "").strip()
    if not q:
        return []

    key = _cache_key("station_search_offline_v1", {"q": q.lower()})
    cached = _cache_get(key)
    if cached is not None:
        return cached

    # Offline-only station search.
    offline_results = search_offline_stations(q)
    if offline_results:
        print(f"  [Offline Data] Found {len(offline_results)} stations for: {q}")
        _cache_set(key, offline_results, 12 * 3600)
        return offline_results

    return []


def get_station_info(station_code):
    """
    Get station details. Uses offline data + coordinate lookup.
    Returns: {name, code, lat, lng, state, zone} or None
    """
    data = search_offline_stations(station_code)
    from app.utils.coordinates import get_coords

    if not data or not isinstance(data, list):
        return None

    # Try to find exact code match
    target = None
    for s in data:
        if s.get("code", "").upper() == station_code.upper():
            target = s
            break

    if not target and data:
        target = data[0]

    if target:
        res = {
            "name": target.get("name", ""),
            "code": target.get("code", ""),
            "state": target.get("state_name", ""),
            "lat": None,
            "lng": None,
        }
        # ENHANCEMENT: Get real coordinates if the API is empty
        lat, lng = get_coords(res["name"] + " Railway Station")
        res["lat"], res["lng"] = lat, lng
        return res

    return None


# ══════════════════════════════════════════════════════════════════════
#  TRAIN SEARCH (offline stub — RapidAPI removed)
# ══════════════════════════════════════════════════════════════════════

def search_trains(query):
    """
    Search trains by number or name.
    Returns: [{trainNumber, trainName, ...}]
    NOTE: RapidAPI has been removed. This is a stub for backward compatibility.
    """
    return []


# ══════════════════════════════════════════════════════════════════════
#  CONFIRMTKT HTML SCRAPER (public page, no auth/session)
# ══════════════════════════════════════════════════════════════════════

_DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _time_str_to_minutes(time_str):
    """Convert 'HH:MM' to minutes from midnight."""
    if not time_str:
        return None
    try:
        parts = time_str.strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return None


def _looks_like_time(text):
    if not isinstance(text, str):
        return False
    return re.fullmatch(r"\d{1,2}:\d{2}", text.strip()) is not None


def _confirmtkt_running_days_list(running_days):
    """
    Convert ConfirmTkt runningDays string like '1110110' to ['Mon', ...].
    """
    s = str(running_days or "").strip()
    if not s:
        return []
    if len(s) >= 7 and set(s[:7]).issubset({"0", "1"}):
        return [_DAY_ABBR[i] for i, c in enumerate(s[:7]) if c == "1"]
    return []


def _connect_travel_minutes(travel_str, dep_minutes, arr_minutes, dep_day, arr_day):
    if travel_str:
        t = str(travel_str).replace("hrs", "").replace("hr", "").strip()
        parts = t.split(":")
        if len(parts) >= 2:
            try:
                return int(parts[0].strip()) * 60 + int(parts[1].strip())
            except ValueError:
                pass
    if dep_minutes is not None and arr_minutes is not None:
        d = arr_minutes - dep_minutes + (arr_day - dep_day) * 1440
        if d <= 0:
            d += 1440
        return d
    return 0


def _confirmtkt_fetch_trains_via_assets(page_url, from_code, to_code, doj_ddmmyyyy, timeout_cfg, deadline):
    """
    Fallback: try to pull train data from ConfirmTkt page assets.
    Uses simple GET requests with strict timeouts.
    """
    try:
        if time.monotonic() >= deadline:
            return []

        # Try the API endpoint that the ConfirmTkt SPA calls
        api_url = f"{CONFIRMTKT_WEB_BASE_URL}/api/platform/trainbtwstn"
        params = {
            "fromStation": from_code.upper().strip(),
            "toStation": to_code.upper().strip(),
            "journeyDate": doj_ddmmyyyy,
        }
        resp = requests.get(
            api_url,
            params=params,
            headers={
                "Accept": "application/json",
                "User-Agent": "LogiFlow/1.0 (cargo optimization)",
            },
            timeout=timeout_cfg,
        )
        if resp.ok:
            try:
                data = resp.json()
                if isinstance(data, dict):
                    return data.get("trainList", [])
                if isinstance(data, list):
                    return data
            except Exception:
                pass
    except Exception as e:
        print(f"  [ConfirmTkt Assets] ❌ {e}")
    return []


def _confirmtkt_trains_between(from_code, to_code, date_of_journey):
    """
    ConfirmTkt HTML page scrape for trains between stations.
    Returns normalized shape: {totalTrains, trains: [...]}
    Uses simple GET requests — no auth, no sessions, no cookies.
    """
    ttl = _get_ttl_for_endpoint("trainBetweenStations")
    ck = None
    if ttl > 0:
        ck = _cache_key(
            "confirmtkt_trainBetween",
            {
                "from": from_code.upper().strip(),
                "to": to_code.upper().strip(),
                "date": date_of_journey,
            },
        )
        cached = _cache_get(ck)
        if cached is not None:
            return cached

    try:
        yyyy, mm, dd = date_of_journey.split("-")
        doj_ddmmyyyy = f"{dd}-{mm}-{yyyy}"
    except Exception:
        doj_ddmmyyyy = date_of_journey

    from_slug = quote(str(from_code).strip(), safe="")
    to_slug = quote(str(to_code).strip(), safe="")
    url = (
        f"{CONFIRMTKT_WEB_BASE_URL}/rbooking/trains/from/"
        f"{from_slug}/to/{to_slug}/{doj_ddmmyyyy}"
    )
    headers = {
        "User-Agent": "LogiFlow/1.0 (cargo optimization)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    timeout_cfg = (_CONFIRMTKT_CONNECT_TIMEOUT_S, _CONFIRMTKT_READ_TIMEOUT_S)
    deadline = time.monotonic() + max(_CONFIRMTKT_TOTAL_BUDGET_S, _CONFIRMTKT_READ_TIMEOUT_S)

    try:
        print(f"  [RAIL] Scraping attempt: ConfirmTkt {from_code}→{to_code} ({doj_ddmmyyyy})")
        resp = requests.get(url, headers=headers, timeout=timeout_cfg)
        if not resp.ok:
            print(f"  [ConfirmTkt HTML] HTTP {resp.status_code}")
            return None

        html = resp.text or ""
        rows = []

        # Next.js payload (preferred): <script id="__NEXT_DATA__">...</script>
        next_data_match = re.search(
            r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
            html,
            flags=re.DOTALL | re.IGNORECASE,
        )
        if next_data_match:
            try:
                next_data = json.loads(next_data_match.group(1))
                page_props = (
                    next_data.get("props", {})
                    .get("pageProps", {})
                )
                rows = (
                    page_props.get("trainsData", {}).get("trainList")
                    or page_props.get("trains", {}).get("trainList")
                    or page_props.get("trainList")
                    or []
                )
            except Exception:
                rows = []

        # Fallback extraction: JSON snippet containing "trainList":[...]
        if not rows:
            tl_match = re.search(r'"trainList"\s*:\s*(\[[\s\S]*?\])\s*,\s*"(?:quotaList|errorMessage|sortBy)"', html)
            if tl_match:
                try:
                    rows = json.loads(tl_match.group(1))
                except Exception:
                    rows = []

        # HTML app-shell fallback: derive API call details from page assets.
        if not rows:
            if time.monotonic() >= deadline:
                print(
                    f"  [ConfirmTkt HTML] ⏱️ Timeout budget exceeded for {from_code}→{to_code} "
                    f"({doj_ddmmyyyy}); skipping asset fallback."
                )
                return None
            rows = _confirmtkt_fetch_trains_via_assets(
                url,
                from_code,
                to_code,
                doj_ddmmyyyy,
                timeout_cfg,
                deadline,
            )

        if not isinstance(rows, list) or not rows:
            print(
                f"  [ConfirmTkt HTML] ⚠️ No trainList parsed for {from_code}→{to_code} "
                f"on {doj_ddmmyyyy}."
            )
            return None

        fc = from_code.upper().strip()
        tc = to_code.upper().strip()

        trains = []
        for t in rows:
            train_no = str(t.get("trainNumber", "")).strip()
            if not train_no:
                continue

            actual_fs = str(t.get("fromStnCode", fc)).strip().upper()
            actual_ts = str(t.get("toStnCode", tc)).strip().upper()

            dep_minutes = _time_str_to_minutes(t.get("departureTime", ""))
            arr_minutes = _time_str_to_minutes(t.get("arrivalTime", ""))
            dep_day = 1
            arr_day = 1
            if dep_minutes is not None and arr_minutes is not None and arr_minutes <= dep_minutes:
                arr_day = 2

            try:
                duration_min = int(t.get("duration") or 0)
            except (ValueError, TypeError):
                duration_min = _connect_travel_minutes("", dep_minutes, arr_minutes, dep_day, arr_day)

            try:
                distance_km = int(float(str(t.get("distance") or 0)))
            except (ValueError, TypeError):
                distance_km = 0

            avg_speed = round(distance_km / (duration_min / 60), 1) if duration_min > 0 else 0
            run_days_list = _confirmtkt_running_days_list(t.get("runningDays", ""))
            all_days = len(run_days_list) == 7

            trains.append({
                "trainNumber": train_no,
                "trainName": str(t.get("trainName", "")).strip(),
                "type": str(t.get("trainType", "")).strip(),
                "provider": "confirmtkt_html",
                "distanceKm": distance_km,
                "travelTimeMinutes": duration_min,
                "avgSpeedKmph": avg_speed,
                "totalHalts": 0,
                "sourceStationName": t.get("fromStnName", actual_fs),
                "destinationStationName": t.get("toStnName", actual_ts),
                "fromStationCode": actual_fs,
                "toStationCode": actual_ts,
                "runningDays": {"days": run_days_list, "allDays": all_days},
                "fromStationSchedule": {
                    "departureMinutes": dep_minutes,
                    "day": dep_day,
                    "stationCode": actual_fs,
                },
                "toStationSchedule": {
                    "arrivalMinutes": arr_minutes,
                    "day": arr_day,
                    "distanceFromSourceKm": distance_km,
                    "stationCode": actual_ts,
                },
                "hasPantry": bool(t.get("hasPantry", False)),
                "classTypes": t.get("avlClasses", []),
                "specialTrain": False,
            })

        if not trains:
            print(
                f"  [ConfirmTkt HTML] ⚠️ Parsed payload but no valid trains "
                f"for {from_code}→{to_code}."
            )
            return None

        out = {
            "totalTrains": len(trains),
            "trains": trains,
        }
        print(f"  [RAIL] Scraping success: ConfirmTkt {out['totalTrains']} trains {from_code}→{to_code}")
        if ttl > 0 and ck:
            _cache_set(ck, out, ttl)
        return out
    except Exception as e:
        print(f"  [ConfirmTkt HTML] ❌ Scrape failed: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════
#  MAIN ENTRY POINT — get_trains_between
# ══════════════════════════════════════════════════════════════════════

def get_trains_between(from_code, to_code, date_of_journey=None, context=None):
    """
    Find all trains between two station codes.
    Returns same format for backward compatibility:
    {totalTrains, trains: [{trainNumber, trainName, type, distanceKm, ...}]}

    Flow: RequestContext cache → Redis/mem cache → RailYatri → ConfirmTkt → None
    """
    if not date_of_journey:
        from datetime import datetime, timedelta
        # Use tomorrow's date to get valid results
        date_of_journey = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    fc = str(from_code or "").strip().upper()
    tc = str(to_code or "").strip().upper()

    # ── Step 8: Request-level dedup via RequestContext ────────────────
    if context:
        ctx_key = f"rail_scrape:{fc}:{tc}"
        if context.has(ctx_key):
            print(f"  [RAIL CACHE HIT] {ctx_key}")
            return context.get(ctx_key)

    # ── Tier 0: Unified orchestration cache (cache-first) ───────────────
    ttl = _get_ttl_for_endpoint("trainBetweenStations")
    orchestrated_key = _cache_key(
        "trainBetween_orchestrated_v1",
        {
            "from": fc,
            "to": tc,
            "date": str(date_of_journey or "").strip(),
        },
    )
    if ttl > 0:
        cached = _cache_get(orchestrated_key)
        if cached is not None:
            print(f"  [Rail Cache] ✅ Cache hit {fc}→{tc} ({date_of_journey})")
            # Also store in request context for dedup
            if context:
                context.set(f"rail_scrape:{fc}:{tc}", cached)
            return cached

    # ── Circuit breaker gate ──────────────────────────────────────────
    if not _cb_allow_request():
        print(f"  [RAIL] Circuit breaker OPEN — skipping scrape for {fc}→{tc}")
        return None

    # ── Tier 1: RailYatri trains-between (primary) ──────────────────────
    print(f"  [RAIL] Scraping attempt: RailYatri {fc}→{tc}")
    try:
        from app.pipelines.rail.railyatri_client import fetch_trains_between as _ry_trains_between

        railyatri_data = _ry_trains_between(fc, tc, date_of_journey)
        if railyatri_data and railyatri_data.get("trains"):
            print(
                f"  [RAIL] Scraping success: RailYatri {railyatri_data.get('totalTrains', 0)} trains "
                f"{fc}→{tc} ({date_of_journey})"
            )
            _cb_record_success()
            if ttl > 0:
                _cache_set(orchestrated_key, railyatri_data, ttl)
            if context:
                context.set(f"rail_scrape:{fc}:{tc}", railyatri_data)
            return railyatri_data
        print(f"  [RailYatri] ⚠️ No trains parsed for {fc}→{tc} ({date_of_journey})")
    except Exception as e:
        print(f"  [RailYatri] ❌ Failed: {e}")
        _cb_record_failure()

    # ── Tier 2: ConfirmTkt HTML fallback ─────────────────────────────────
    print(f"  [RAIL] Falling back to CSV... (trying ConfirmTkt first)")
    confirmtkt_data = _confirmtkt_trains_between(fc, tc, date_of_journey)
    if confirmtkt_data and confirmtkt_data.get("trains"):
        _cb_record_success()
        if ttl > 0:
            _cache_set(orchestrated_key, confirmtkt_data, ttl)
        if context:
            context.set(f"rail_scrape:{fc}:{tc}", confirmtkt_data)
        return confirmtkt_data

    _cb_record_failure()
    # Flow: cache → RailYatri → ConfirmTkt HTML → None.
    print(f"  [RAIL] No routes found for {fc}→{tc}")
    return None


# ══════════════════════════════════════════════════════════════════════
#  TRAIN SCHEDULE / DATA (stubs — RapidAPI removed)
# ══════════════════════════════════════════════════════════════════════

def get_train_schedule(train_number):
    """
    Get full schedule for a train with per-station details.
    NOTE: RapidAPI/IRCTC Connect removed. Returns None.
    """
    return None


def get_train_data(train_number, data_type="static"):
    """
    Get train data (backward compatible with old API).
    data_type: 'static' → returns schedule-like data.
    """
    data = get_train_schedule(train_number)
    if not data:
        return None

    route = data.get("route", [])
    run_days = data.get("runDays", {})

    return {
        "train": {
            "trainNumber": data.get("trainNumber", str(train_number)),
            "trainName": data.get("trainName", ""),
            "trainType": data.get("trainType", ""),
            "sourceStationName": route[0].get("station_name", "") if route else "",
            "destinationStationName": route[-1].get("station_name", "") if route else "",
            "distanceKm": float(route[-1].get("distance_from_source", 0)) if route else 0,
            "avgSpeedKmph": 0,
            "runningDays": {
                "days": [d for d, v in run_days.items() if v],
            },
            "route": route,
        }
    }


# ══════════════════════════════════════════════════════════════════════
#  DELAY / LIVE ENDPOINTS (stubs — RapidAPI removed)
# ══════════════════════════════════════════════════════════════════════

def get_average_delay(train_number):
    """
    Get average delay data for a train.
    NOTE: RapidAPI removed. Returns None — downstream uses heuristics.
    """
    return None


def get_live_status(train_number, journey_date=None):
    """
    Get live tracking status for a train.
    NOTE: RapidAPI removed. Returns None.
    """
    return None


def get_live_station_board(station_code, hours=4):
    """
    Get live station board — trains arriving/departing at a station.
    NOTE: RapidAPI removed. Returns None.
    """
    return None


def get_fare(train_number, from_code, to_code):
    """
    Get passenger fare for a train between two stations.
    NOTE: RapidAPI removed. Returns None.
    """
    return None


@lru_cache(maxsize=2000)
def get_station_coords(station_code):
    """
    Helper to fetch and cache station coordinates to minimize API calls.
    """
    info = get_station_info(station_code)
    if info and info.get("lat") is not None and info.get("lng") is not None:
        return [info["lng"], info["lat"]]
    return None

@lru_cache(maxsize=100)
def get_train_geometry(train_no, from_station, to_station):
    """
    Helper to get the geometry coordinates for a train route from A to B.
    NOTE: Depends on get_train_data which now returns None. Returns None.
    """
    data = get_train_data(train_no, data_type="static")
    if not data or "train" not in data or "route" not in data["train"]:
        return None

    route = data["train"]["route"]

    start_idx, end_idx = -1, -1
    for i, stop in enumerate(route):
        code = stop.get("stationCode")
        if not code:
            continue
        code = code.upper()
        if code == from_station.upper():
            start_idx = i
        if code == to_station.upper():
            end_idx = i

    if start_idx == -1 or end_idx == -1 or start_idx > end_idx:
        return None

    # Limit to 10 intermediate points to avoid overloading
    route_leg = route[start_idx:end_idx + 1]

    if len(route_leg) > 10:
        indices = [0]
        step = (len(route_leg) - 1) / 9.0
        for i in range(1, 9):
            indices.append(int(i * step))
        indices.append(len(route_leg) - 1)
        sampled_route = [route_leg[i] for i in sorted(list(set(indices)))]
    else:
        sampled_route = route_leg

    coords = []
    for stop in sampled_route:
        code = stop.get("stationCode")
        if code:
            coord = get_station_coords(code.upper())
            if coord:
                coords.append(coord)

    return coords if coords else None
