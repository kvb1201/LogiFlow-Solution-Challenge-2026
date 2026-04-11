"""
Indian Railway API client for the Railway Cargo Decision Engine.

MIGRATED from RailRadar → IRCTC RapidAPI (irctc1.p.rapidapi.com).
Trains-between-stations tries IRCTC Connect (irctc-connect SDK-compatible API)
first when IRCTC_CONNECT_API_KEYS + IRCTC_CONNECT_SDK_SECRET are set, then RapidAPI.
Much better coverage: 13+ endpoints including SearchStation, SearchTrain,
TrainsBetweenStations, GetTrainSchedule, GetFare, GetLiveStation.

All function signatures are preserved for backward compatibility.

Features:
  - Redis cache (production) + in-memory cache (fallback for local dev)
  - Circuit-breaker resilience (trips after 5 failures → fast-fail 60s)
  - Exponential backoff with jitter on transient errors
  - Rate limiting (2s interval for free tier)
"""

import hashlib
import hmac
import json
import os
import random
import requests
import time
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

# ── API Configuration ─────────────────────────────────────────────────
_keys_str = os.environ.get(
    "IRCTC_RAPIDAPI_KEYS",
    os.environ.get("IRCTC_RAPIDAPI_KEY", os.environ.get("RAPIDAPI_KEY", "7db7242689msh94197c4edda6574p13c158jsn5cfbe0926100")),
)
IRCTC_API_KEYS = [k.strip() for k in _keys_str.split(",") if k.strip()]
_current_key_idx = 0

IRCTC_RAPIDAPI_HOST = "irctc1.p.rapidapi.com"
IRCTC_BASE_URL = f"https://{IRCTC_RAPIDAPI_HOST}"

# IRCTC Connect — signed GET, same host as irctc-connect npm package
_connect_base = os.environ.get(
    "IRCTC_CONNECT_BASE_URL",
    "https://irctc-connect-api.rajivdubey.tech",
).rstrip("/")
_connect_secret = os.environ.get(
    "IRCTC_CONNECT_SDK_SECRET",
    "97c56e08b27b161124f88acd4f24d1bd50f48075f11dc23b9ea6c0bc9b2f8794",
)
_connect_keys_raw = os.environ.get("IRCTC_CONNECT_API_KEYS", "")
IRCTC_CONNECT_KEYS = [k.strip() for k in _connect_keys_raw.split(",") if k.strip()]
_connect_key_idx = 0
_connect_last_times = {}

RAILRADAR_API_KEY = os.environ.get("RAILRADAR_API_KEY", "")
RAILRADAR_BASE_URL = os.environ.get("RAILRADAR_BASE_URL", "https://api.railradar.org")

_session = requests.Session()
_session.headers.update({
    "x-rapidapi-host": IRCTC_RAPIDAPI_HOST,
    "Content-Type": "application/json",
})

# Rate limiting (RapidAPI free tier is strict — ~1 req/sec)
_last_request_times = {k: 0 for k in IRCTC_API_KEYS}
_api_calls_made = {k: 0 for k in IRCTC_API_KEYS}
_MIN_INTERVAL = 1.1  # 1.1s per-key limits so we can multiplex keys


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
    "liveTrainStatus":      0,                 # NEVER cache — real-time data
    "getLiveStation":       0,                 # NEVER cache — real-time data
    "default":              24 * 3600,         # 1 day fallback
}

# Redis connection
_redis_client = None
_redis_available = False
_REDIS_PREFIX = "irctc:"


def _init_redis():
    """Try to connect to Redis. Falls back to in-memory cache if unavailable."""
    global _redis_client, _redis_available
    try:
        import redis
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        _redis_client = redis.from_url(redis_url, decode_responses=True)
        _redis_client.ping()
        _redis_available = True
        print("  [Cache] ✅ Redis connected")
    except Exception:
        _redis_available = False
        print("  [Cache] ⚠️ Redis unavailable — using in-memory cache")


# Persistent Local fallback cache (mirrors Redis for standalone python scripts)
_CACHE_FILE = os.path.join(os.path.dirname(__file__), "api_cache.json")
_mem_cache = {}

def _load_mem_cache():
    global _mem_cache
    if os.path.exists(_CACHE_FILE):
        try:
            with open(_CACHE_FILE, "r") as f:
                _mem_cache = json.load(f)
        except Exception:
            _mem_cache = {}

def _save_mem_cache():
    try:
        with open(_CACHE_FILE, "w") as f:
            json.dump(_mem_cache, f)
    except Exception:
        pass

_load_mem_cache()

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
                print(f"  [Cache] ⚡ HIT (Redis): {key}")
                return json.loads(cached)
        except Exception:
            pass

    # In-memory fallback
    entry = _mem_cache.get(key)
    if entry and entry["expires_at"] > time.time():
        print(f"  [Cache] ⚡ HIT (Disk/Mem): {key}")
        return entry["data"]
    elif entry:
        del _mem_cache[key]  # expired
        _save_mem_cache()
        
    return None

def _cache_set(key, data, ttl):
    """Write to cache. Writes to BOTH Redis and in-memory."""
    if ttl <= 0:
        return  # Don't cache real-time data

    # Redis
    if _redis_available and _redis_client:
        try:
            _redis_client.setex(key, ttl, json.dumps(data))
        except Exception:
            pass

    # In-memory (always — serves as L1 / fallback)
    _mem_cache[key] = {
        "data": data,
        "expires_at": time.time() + ttl,
    }

    # Bounded cache to avoid overflow (rudimentary LRU/FIFO eviction)
    if len(_mem_cache) > 1000:
        # Delete the oldest 100 entries to reclaim memory
        for k in list(_mem_cache.keys())[:100]:
            del _mem_cache[k]

    _save_mem_cache()


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
        print("  [IRCTC] ⚡ Circuit breaker CLOSED (API recovered)")
    _cb_state = "closed"


def _cb_record_failure():
    """Track failure; trip the breaker if threshold reached."""
    global _cb_consecutive_failures, _cb_last_failure_time, _cb_state, _cb_total_trips
    _cb_consecutive_failures += 1
    _cb_last_failure_time = time.time()
    if _cb_consecutive_failures >= _CB_FAILURE_THRESHOLD and _cb_state == "closed":
        _cb_state = "open"
        _cb_total_trips += 1
        print(f"  [IRCTC] 🔴 Circuit breaker OPEN after {_cb_consecutive_failures} "
              f"consecutive failures. Fast-failing for {_CB_RECOVERY_TIMEOUT}s.")


def _cb_allow_request():
    """Check if the circuit breaker allows a request through."""
    global _cb_state
    if _cb_state == "closed":
        return True
    elapsed = time.time() - _cb_last_failure_time
    if elapsed >= _CB_RECOVERY_TIMEOUT:
        _cb_state = "half-open"
        print("  [IRCTC] 🟡 Circuit breaker HALF-OPEN (attempting recovery probe)")
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
        "api_provider": "IRCTC RapidAPI (irctc1.p.rapidapi.com) + IRCTC Connect (optional)",
        "cache": get_cache_stats(),
        "key_pool_size": len(IRCTC_API_KEYS),
        "irctc_connect_key_pool_size": len(IRCTC_CONNECT_KEYS),
        "current_key_index": _current_key_idx,
    }


# ══════════════════════════════════════════════════════════════════════
#  CORE HTTP — with cache-first, circuit breaker, backoff
# ══════════════════════════════════════════════════════════════════════

def _get(endpoint, params=None, timeout=15):
    """
    Make a GET request to the IRCTC RapidAPI.
    Flow: Cache → Circuit Breaker → Rate Limit → API → Cache Write.
    """
    global _current_key_idx

    # ── 1. Cache check (fast path — no API call) ──────────────────────
    ttl = _get_ttl_for_endpoint(endpoint)
    if ttl > 0:
        key = _cache_key(endpoint, params)
        cached = _cache_get(key)
        if cached is not None:
            return cached

    # ── 2. Circuit breaker gate ───────────────────────────────────────
    if not _cb_allow_request():
        return None  # fast-fail → triggers CSV fallback upstream

    # Loop attempts begin below (rate limiting is now handled per-key)

    url = f"{IRCTC_BASE_URL}{endpoint}"

    # ── 4. Attempt across available keys ──────────────────────────────
    max_retries = len(IRCTC_API_KEYS)
    
    for attempt in range(max_retries):
        try:
            # Rotate key on every attempt to balance load & bypass 1s limits
            _current_key_idx = (_current_key_idx + 1) % max_retries
            current_key = IRCTC_API_KEYS[_current_key_idx]

            # Enforce 1.1s interval PER KEY
            now = time.time()
            elapsed = now - _last_request_times[current_key]
            if elapsed < _MIN_INTERVAL:
                time.sleep(_MIN_INTERVAL - elapsed)
            _last_request_times[current_key] = time.time()

            # Record API call execution
            _api_calls_made[current_key] += 1
            total_calls = sum(_api_calls_made.values())
            print(f"  [IRCTC] 📡 Live API Call #{total_calls} via Key {_current_key_idx}: {endpoint}")

            req_headers = {"x-rapidapi-key": current_key}
            
            resp = _session.get(url, params=params, headers=req_headers, timeout=timeout)

            # 429 means we hit limits (rate limit or hard monthly quota)
            # 403 usually means unauthorized/not subscribed
            if resp.status_code in (429, 403):
                if attempt < max_retries - 1:
                    print(f"  [IRCTC] {resp.status_code} on key {_current_key_idx}. Rotating key...")
                    _current_key_idx = (_current_key_idx + 1) % len(IRCTC_API_KEYS)
                    time.sleep(1)  # small delay before next key
                    continue
                else:
                    _cb_record_failure()
                    print(f"  [IRCTC] All keys exhausted/rate limited for {endpoint}.")
                    return None

            if resp.status_code >= 500:
                if attempt < max_retries - 1:
                    backoff = (2 ** attempt) + random.uniform(0.5, 1.5)
                    print(f"  [IRCTC] 5xx error, retrying in {backoff:.1f}s")
                    time.sleep(backoff)
                    continue
                _cb_record_failure()
                return None

            resp.raise_for_status()
            body = resp.json()

            if body.get("status") is True:
                _cb_record_success()
                data = body.get("data", {})
                if ttl > 0:
                    _cache_set(key, data, ttl)
                return data

            # Some endpoints return 200 with error messages inside `message`
            msg = str(body.get("message", ""))
            
            if "Too many requests" in msg or "quota" in msg.lower() or "subscribed" in msg.lower():
                if attempt < max_retries - 1:
                    print(f"  [IRCTC] Quota/Limit reached on key {_current_key_idx}. Rotating key...")
                    _current_key_idx = (_current_key_idx + 1) % len(IRCTC_API_KEYS)
                    time.sleep(1)
                    continue
                _cb_record_failure()
                return None
            else:
                print(f"  [IRCTC] API error: {msg}")
                _cb_record_failure()
                return None

        except requests.exceptions.Timeout:
            if attempt < max_retries - 1:
                backoff = (2 ** attempt) + random.uniform(0.5, 1.5)
                print(f"  [IRCTC] Timeout, retrying in {backoff:.1f}s")
                time.sleep(backoff)
                continue
            _cb_record_failure()
            return None
        except requests.exceptions.RequestException as e:
            print(f"  [IRCTC] Request failed: {e}")
            _cb_record_failure()
            return None
        except Exception as e:
            print(f"  [IRCTC] Unexpected error: {e}")
            _cb_record_failure()
            return None

    _cb_record_failure()
    return None


# ══════════════════════════════════════════════════════════════════════
#  STATION ENDPOINTS
# ══════════════════════════════════════════════════════════════════════

from app.pipelines.rail.fallback_stations import search_offline_stations

def search_stations(query):
    """
    Search stations by name or code.
    Returns: [{code, name, state_name}]
    """
    # 1. Try Cache First for Station Searches (they almost never change)
    key = _cache_key("rapidapi_search_station", {"q": query.lower()})
    cached = _cache_get(key)
    if cached is not None:
        return cached

    # 2. Try Offline Fallback Dataset First (Saves 100% of RapidAPI Quota)
    offline_results = search_offline_stations(query)
    if offline_results:
        print(f"  [Offline Data] Found {len(offline_results)} stations for: {query}")
        _cache_set(key, offline_results, 30 * 24 * 3600)
        return offline_results

    # 3. Key-Rotated RapidAPI Call (Absolute Last Resort)
    data = _get("/api/v1/searchStation", {"query": query})
    if not data or not isinstance(data, list):
        return []
    
    result = [{"code": s.get("code", ""), "name": s.get("name", "")} for s in data]
    
    # Cache for 30 Days if successful
    if result:
        _cache_set(key, result, 30 * 24 * 3600)

    return result


def get_station_info(station_code):
    """
    Get station details. Uses searchStation + getTrainSchedule for lat/lng.
    Returns: {name, code, lat, lng, state, zone} or None
    """
    data = _get("/api/v1/searchStation", {"query": station_code})
    if not data or not isinstance(data, list):
        return None
    for s in data:
        if s.get("code", "").upper() == station_code.upper():
            return {
                "name": s.get("name", ""),
                "code": s.get("code", ""),
                "state": s.get("state_name", ""),
                "lat": None,
                "lng": None,
            }
    if data:
        s = data[0]
        return {
            "name": s.get("name", ""),
            "code": s.get("code", ""),
            "state": s.get("state_name", ""),
            "lat": None,
            "lng": None,
        }
    return None


# ══════════════════════════════════════════════════════════════════════
#  TRAIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════

def search_trains(query):
    """
    Search trains by number or name.
    Returns: [{trainNumber, trainName, ...}]
    """
    data = _get("/api/v1/searchTrain", {"query": query})
    if not data or not isinstance(data, list):
        return []
    return [
        {
            "trainNumber": t.get("train_number", ""),
            "trainName": t.get("train_name", ""),
            "sourceStationCode": t.get("src_stn_code", ""),
            "sourceStationName": t.get("src_stn_name", ""),
            "destinationStationCode": t.get("dstn_stn_code", ""),
            "destinationStationName": t.get("dstn_stn_name", ""),
        }
        for t in data
    ]


def _connect_sign(method, path, ts, nonce, payload_hash, api_key):
    msg = f"{method.upper()}\n{path}\n{ts}\n{nonce}\n{payload_hash}\n{api_key}"
    return hmac.new(_connect_secret.encode(), msg.encode(), hashlib.sha256).hexdigest()


def _connect_headers(method, path, api_key):
    ts = str(int(time.time() * 1000))
    nonce = os.urandom(32).hex()
    ph = hashlib.sha256(b"").hexdigest()
    return {
        "x-api-key": api_key,
        "x-irctc-sdk-ts": ts,
        "x-irctc-sdk-nonce": nonce,
        "x-irctc-sdk-payload-sha256": ph,
        "x-irctc-sdk-signature": _connect_sign(method, path, ts, nonce, ph, api_key),
        "x-irctc-sdk-version": "1",
        "Accept": "application/json",
    }


def _irctc_connect_get(path, timeout=20):
    """Signed GET to IRCTC Connect; rotates keys on 401/403/429."""
    global _connect_key_idx
    if not IRCTC_CONNECT_KEYS or not _connect_secret:
        return None
    n = len(IRCTC_CONNECT_KEYS)
    for attempt in range(n):
        _connect_key_idx = (_connect_key_idx + 1) % n
        key = IRCTC_CONNECT_KEYS[_connect_key_idx]
        now = time.time()
        elapsed = now - _connect_last_times.get(key, 0)
        if elapsed < _MIN_INTERVAL:
            time.sleep(_MIN_INTERVAL - elapsed)
        _connect_last_times[key] = time.time()
        url = f"{_connect_base}{path}"
        try:
            resp = requests.get(url, headers=_connect_headers("GET", path, key), timeout=timeout)
            if resp.status_code in (401, 403, 429):
                if attempt < n - 1:
                    print(f"  [IRCTC Connect] {resp.status_code} on key index {_connect_key_idx}, rotating…")
                    time.sleep(0.4)
                    continue
                return None
            resp.raise_for_status()
            body = resp.json()
            if isinstance(body, dict) and body.get("success") and isinstance(body.get("data"), (list, dict)):
                return body["data"]
            return None
        except Exception as e:
            print(f"  [IRCTC Connect] Request failed: {e}")
            if attempt < n - 1:
                time.sleep(0.4)
                continue
            return None
    return None


_DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _connect_running_days_list(s):
    if not s or not isinstance(s, str):
        return []
    return [_DAY_ABBR[i] for i, c in enumerate(s[:7]) if c == "1" and i < len(_DAY_ABBR)]


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


def _trains_between_from_connect_rows(rows, from_code, to_code):
    """Normalize IRCTC Connect searchTrainBetweenStations → same shape as RapidAPI path."""
    trains = []
    fc, tc = from_code.upper(), to_code.upper()
    for t in rows:
        train_no = str(t.get("train_no") or t.get("train_number") or "").strip()
        train_name = str(t.get("train_name") or t.get("trainname") or "")
        from_time = t.get("from_time") or ""
        to_time = t.get("to_time") or ""
        dep_minutes = _time_str_to_minutes(from_time)
        arr_minutes = _time_str_to_minutes(to_time)
        dep_day = 1
        arr_day = 1
        if dep_minutes is not None and arr_minutes is not None and arr_minutes <= dep_minutes:
            arr_day = 2
        dur_minutes = _connect_travel_minutes(
            t.get("travel_time") or "", dep_minutes, arr_minutes, dep_day, arr_day
        )
        try:
            distance_km = int(float(str(t.get("distance") or 0)))
        except (ValueError, TypeError):
            distance_km = 0
        try:
            halts = int(t.get("halts") if t.get("halts") is not None else 0)
        except (ValueError, TypeError):
            halts = 0
        run_days_list = _connect_running_days_list(t.get("running_days") or "")
        all_days = len(run_days_list) == 7
        avg_speed = round(distance_km / (dur_minutes / 60), 1) if dur_minutes > 0 else 0
        fs_name = t.get("source_stn_name") or t.get("from_stn_name") or fc
        ts_name = t.get("dstn_stn_name") or t.get("to_stn_name") or tc
        trains.append({
            "trainNumber": train_no,
            "trainName": train_name,
            "type": t.get("train_type") or "",
            "distanceKm": distance_km,
            "travelTimeMinutes": dur_minutes,
            "avgSpeedKmph": avg_speed,
            "totalHalts": halts,
            "sourceStationName": fs_name,
            "destinationStationName": ts_name,
            "runningDays": {"days": run_days_list, "allDays": all_days},
            "fromStationSchedule": {
                "departureMinutes": dep_minutes,
                "day": dep_day,
            },
            "toStationSchedule": {
                "arrivalMinutes": arr_minutes,
                "day": arr_day,
                "distanceFromSourceKm": distance_km,
            },
            "hasPantry": bool(t.get("has_pantry", False)),
            "classTypes": t.get("class_type") or t.get("class_types") or [],
            "specialTrain": bool(t.get("special_train", False)),
        })
    return {"totalTrains": len(trains), "trains": trains}


def get_trains_between(from_code, to_code, date_of_journey=None):
    """
    Find all trains between two station codes.
    Returns same format as old RailRadar client for backward compatibility:
    {totalTrains, trains: [{trainNumber, trainName, type, distanceKm, ...}]}
    """
    if not date_of_journey:
        from datetime import datetime, timedelta
        # Use tomorrow's date to get valid results
        date_of_journey = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    # ── IRCTC Connect first (key pool), then RapidAPI ──────────────────
    if IRCTC_CONNECT_KEYS and _connect_secret:
        ttl_c = _get_ttl_for_endpoint("trainBetweenStations")
        ck = None
        if ttl_c > 0:
            ck = _cache_key(
                "irctc_connect_trainBetween",
                {"from": from_code.upper(), "to": to_code.upper()},
            )
            cached = _cache_get(ck)
            if cached is not None:
                return cached
        path = f"/api/searchTrainBetweenStations/{from_code.upper().strip()}/{to_code.upper().strip()}"
        connect_rows = _irctc_connect_get(path)
        if connect_rows:
            out = _trains_between_from_connect_rows(connect_rows, from_code, to_code)
            if out.get("trains"):
                print(f"  [IRCTC Connect] {out['totalTrains']} trains {from_code}→{to_code}")
                if ttl_c > 0 and ck:
                    _cache_set(ck, out, ttl_c)
                return out

    data = _get("/api/v3/trainBetweenStations", {
        "fromStationCode": from_code.upper(),
        "toStationCode": to_code.upper(),
        "dateOfJourney": date_of_journey,
    })

    if not data or not isinstance(data, list):
        return None

    trains = []
    for t in data:
        # Parse duration string "HH:MM" → minutes
        dur_str = t.get("duration", "0:0")
        try:
            parts = dur_str.split(":")
            dur_minutes = int(parts[0]) * 60 + int(parts[1])
        except (ValueError, IndexError):
            dur_minutes = 0

        # Parse departure/arrival times → minutes from midnight
        dep_str = t.get("from_std", "") or t.get("from_sta", "")
        arr_str = t.get("to_sta", "") or t.get("to_std", "")

        dep_minutes = _time_str_to_minutes(dep_str)
        arr_minutes = _time_str_to_minutes(arr_str)

        # Running days
        run_days_list = t.get("run_days", [])
        all_days = len(run_days_list) == 7

        distance_km = t.get("distance", 0) or 0
        avg_speed = round(distance_km / (dur_minutes / 60), 1) if dur_minutes > 0 else 0

        trains.append({
            "trainNumber": t.get("train_number", ""),
            "trainName": t.get("train_name", ""),
            "type": t.get("train_type", ""),
            "distanceKm": distance_km,
            "travelTimeMinutes": dur_minutes,
            "avgSpeedKmph": avg_speed,
            "totalHalts": t.get("halt_stn", 0) or 0,
            "sourceStationName": t.get("from_station_name", from_code),
            "destinationStationName": t.get("to_station_name", to_code),
            "runningDays": {
                "days": run_days_list,
                "allDays": all_days,
            },
            "fromStationSchedule": {
                "departureMinutes": dep_minutes,
                "day": (t.get("from_day") or 0) + 1,  # 0-indexed → 1-indexed
            },
            "toStationSchedule": {
                "arrivalMinutes": arr_minutes,
                "day": (t.get("to_day") or 0) + 1,
                "distanceFromSourceKm": distance_km,
            },
            "hasPantry": t.get("has_pantry", False),
            "classTypes": t.get("class_type", []),
            "specialTrain": t.get("special_train", False),
        })

    return {
        "totalTrains": len(trains),
        "trains": trains,
    }


def _time_str_to_minutes(time_str):
    """Convert 'HH:MM' to minutes from midnight."""
    if not time_str:
        return None
    try:
        parts = time_str.strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return None


def _format_connect_schedule_to_rapidapi(data):
    """Reformats irctc-connect getTrainInfo JSON to standard structure."""
    if not isinstance(data, dict):
        return None
    train_info = data.get("trainInfo", {})
    route_in = data.get("route", [])
    
    route_out = []
    for r in route_in:
        s_code = r.get("station_code") or r.get("stationCode", "")
        # Normalizing names
        arr_min = _time_str_to_minutes(r.get("sta", r.get("arrival_time", "")))
        dep_min = _time_str_to_minutes(r.get("std", r.get("departure_time", "")))
        try: dist = int(float(r.get("distance_from_source") or r.get("distance", 0)))
        except: dist = 0
        try: day = int(r.get("day", 1))
        except: day = 1
        
        route_out.append({
            "station_code": s_code,
            "station_name": r.get("station_name", s_code),
            "arrival_time": r.get("sta", ""),
            "departure_time": r.get("std", ""),
            "arrival_minutes": arr_min,
            "departure_minutes": dep_min,
            "distance_from_source": dist,
            "day": day,
            "halt_minutes": r.get("halt_minutes", 0),
        })
        
    runs_dict = {}
    for d in _DAY_ABBR: runs_dict[d] = False
    for d in (train_info.get("days") or train_info.get("running_days") or []):
        if d in runs_dict: runs_dict[d] = True

    return {
        "trainNumber": train_info.get("train_no", train_info.get("trainNo", "")),
        "trainName": train_info.get("name", train_info.get("train_name", "")),
        "trainType": train_info.get("type", ""),
        "runDays": runs_dict,
        "route": route_out
    }


def get_train_schedule(train_number):
    """
    Get full schedule for a train with per-station details.
    Returns: {trainType, trainName, route: [{station_code, station_name, ...}]}
    """
    # ── IRCTC Connect first (key pool), then RapidAPI ──────────────────
    if IRCTC_CONNECT_KEYS and _connect_secret:
        ttl = _get_ttl_for_endpoint("getTrainSchedule")
        ck = None
        if ttl > 0:
            ck = _cache_key("irctc_connect_schedule", {"tn": str(train_number)})
            cached = _cache_get(ck)
            if cached is not None: return cached
            
        path = f"/api/getTrainInfo/{train_number}"
        connect_data = _irctc_connect_get(path)
        if connect_data:
            formatted = _format_connect_schedule_to_rapidapi(connect_data)
            if formatted and formatted.get("route"):
                print(f"  [IRCTC Connect] Schedule fetched for {train_number}")
                if ttl > 0 and ck: _cache_set(ck, formatted, ttl)
                return formatted

    data = _get("/api/v1/getTrainSchedule", {"trainNo": str(train_number)})
    if not data or not isinstance(data, dict):
        return None
    return data


def get_train_data(train_number, data_type="static"):
    """
    Get train data (backward compatible with old RailRadar API).
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
#  DELAY / LIVE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════

def get_average_delay(train_number):
    """
    Get average delay data for a train.
    Uses GetTrainSchedule on_time_rating as a proxy since IRCTC doesn't
    have a dedicated delay endpoint like RailRadar did.

    Returns: {route: [{stationCode, arrivalDelayMinutes, departureDelayMinutes}]}
    """
    data = get_train_schedule(str(train_number))
    if not data or not isinstance(data, dict):
        return None

    route = data.get("route", [])
    if not route:
        return None

    delay_route = []
    for stop in route:
        if not stop.get("stop", True):
            continue

        # on_time_rating: 10 = perfect, 0 = always late
        # Convert to estimated delay: rating 10 → 0min, rating 0 → 30min
        rating = stop.get("on_time_rating", 5)
        if rating is None:
            rating = 5
        estimated_delay = max(0, round((10 - rating) * 3, 1))

        delay_route.append({
            "stationCode": stop.get("station_code", ""),
            "stationName": stop.get("station_name", ""),
            "arrivalDelayMinutes": estimated_delay,
            "departureDelayMinutes": estimated_delay,
            "onTimeRating": rating,
        })

    return {"route": delay_route}


def get_live_status(train_number, journey_date=None):
    """
    Get live tracking status for a train.
    NOTE: NOT cached — real-time data.
    """
    params = {"trainNo": str(train_number)}
    if journey_date:
        params["startDate"] = journey_date

    data = _get("/api/v1/liveTrainStatus", params)
    return data


def get_live_station_board(station_code, hours=4):
    """
    Get live station board — trains arriving/departing at a station.
    NOTE: NOT cached — real-time data.
    """
    data = _get("/api/v3/getLiveStation", {
        "fromStationCode": station_code.upper(),
        "hours": hours,
    })
    return data


def get_fare(train_number, from_code, to_code):
    """
    Get passenger fare for a train between two stations.
    Returns: [{class_type, class_name, fare}]
    """
    data = _get("/api/v1/getFare", {
        "trainNo": str(train_number),
        "fromStationCode": from_code.upper(),
        "toStationCode": to_code.upper(),
    })
    return data


@lru_cache(maxsize=2000)
def get_station_coords(station_code):
    """
    Helper to fetch and cache station coordinates to minimize API calls.
    """
    info = get_station_info(station_code)
    if info and "latitude" in info and "longitude" in info:
        return [info["longitude"], info["latitude"]]
    return None

@lru_cache(maxsize=100)
def get_train_geometry(train_no, from_station, to_station):
    """
    Helper to get the geometry coordinates for a train route from A to B.
    Extracts intermediate stations using the static schedule, then 
    fetches their coordinates utilizing the cache.
    """
    data = get_train_data(train_no, data_type="static")
    if not data or "route" not in data:
        return None
        
    route = data["route"]
    
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

    # Limit to 10 intermediate points to avoid overloading API / rate limits
    route_leg = route[start_idx:end_idx + 1]
    
    if len(route_leg) > 10:
        # Sample evenly
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
