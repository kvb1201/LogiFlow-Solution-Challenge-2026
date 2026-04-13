"""
Indian Railway API client for the Railway Cargo Decision Engine.

MIGRATED from RailRadar → ConfirmTkt + IRCTC providers.
Trains-between-stations now tries ConfirmTkt first, then IRCTC Connect
(irctc-connect SDK-compatible API), then RapidAPI and scraper fallbacks.
Much better coverage: 13+ endpoints including SearchStation, SearchTrain,
TrainsBetweenStations, GetTrainSchedule, GetFare, GetLiveStation.

All function signatures are preserved for backward compatibility.

Features:
  - Redis cache (production) + in-memory cache (fallback for local dev)
  - Circuit-breaker resilience (trips after 5 failures → fast-fail 60s)
  - Exponential backoff with jitter on transient errors
  - Rate limiting (2s interval for free tier)
"""

import uuid

import hashlib
import hmac
import json
import os
import random
import re
import requests
import time
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote, urljoin

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

# ── API Configuration ─────────────────────────────────────────────────
# RapidAPI Keys (Standard pool)
_keys_raw = os.environ.get(
    "IRCTC_RAPIDAPI_KEYS",
    os.environ.get("IRCTC_RAPIDAPI_KEY", os.environ.get("RAPIDAPI_KEY", "7db7242689msh94197c4edda6574p13c158jsn5cfbe0926100")),
)
# Deduplicate and shuffle to ensure fairness across restarts
IRCTC_API_KEYS = list(dict.fromkeys([k.strip() for k in _keys_raw.split(",") if k.strip()]))
random.shuffle(IRCTC_API_KEYS)
_current_key_idx = -1  # Start at -1 so first call uses index 0

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
# IRCTC Connect Keys (Signed pool)
_connect_keys_raw = os.environ.get("IRCTC_CONNECT_API_KEYS", "")
# Deduplicate and shuffle to ensure fairness across restarts
IRCTC_CONNECT_KEYS = list(dict.fromkeys([k.strip() for k in _connect_keys_raw.split(",") if k.strip()]))
random.shuffle(IRCTC_CONNECT_KEYS)
_connect_key_idx = -1  # Start at -1 so first call uses index 0
_connect_last_times = {}
# Legacy providers deprecated in RailYatri/ConfirmTkt-first pipeline.
ENABLE_IRCTC_CONNECT = False
ENABLE_IRCTC_RAPIDAPI = False

# ConfirmTkt Web (Primary HTML scrape source for trains-between-stations)
CONFIRMTKT_WEB_BASE_URL = os.environ.get(
    "CONFIRMTKT_WEB_BASE_URL",
    "https://www.confirmtkt.com",
).rstrip("/")

RAILRADAR_API_KEY = os.environ.get("RAILRADAR_API_KEY", "")
RAILRADAR_BASE_URL = os.environ.get("RAILRADAR_BASE_URL", "https://api.railradar.org")
RAIL_WEB_SCRAPE_ENABLED = os.getenv("RAIL_WEB_SCRAPE_ENABLED", "false").lower() == "true"
RAIL_WEB_SCRAPE_URL_TEMPLATE = os.getenv("RAIL_WEB_SCRAPE_URL_TEMPLATE", "").strip()

_session = requests.Session()
_session.headers.update({
    "x-rapidapi-host": IRCTC_RAPIDAPI_HOST,
    "Content-Type": "application/json",
})

# Rate limiting (RapidAPI free tier is strict — ~1 req/sec)
_last_request_times = {k: 0 for k in IRCTC_API_KEYS}
_api_calls_made = {k: 0 for k in IRCTC_API_KEYS}
_key_rate_limit_until = {k: 0 for k in IRCTC_API_KEYS}
_connect_key_rate_limit_until = {k: 0 for k in IRCTC_CONNECT_KEYS}
_MIN_INTERVAL = 1.1  # 1.1s per-key limits so we can multiplex keys
_BAN_DURATION = 300  # 5 minutes ban on 429

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
            _save_mem_cache()
            
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
    Flow: Cache → Circuit Breaker → Rate Limit → Multi-Key Retry → Cache Write.
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
        return None

    # ── 3. Attempt across available keys with Retry Loop ──────────────
    n = len(IRCTC_API_KEYS)
    url = f"{IRCTC_BASE_URL}{endpoint}"
    
    for attempt in range(n):
        # Rotate key on every attempt to balance load & bypass 1s limits
        _current_key_idx = (_current_key_idx + 1) % n
        current_key = IRCTC_API_KEYS[_current_key_idx]

        # Skip banned keys
        if _key_rate_limit_until.get(current_key, 0) > time.time():
            continue

        # ── 4. Per-key rate limiting (interval) ──────────────────────────
        now = time.time()
        elapsed = now - _last_request_times.get(current_key, 0)
        if elapsed < _MIN_INTERVAL:
            time.sleep(_MIN_INTERVAL - elapsed)
        
        _last_request_times[current_key] = time.time()
        _api_calls_made[current_key] += 1
        total_calls = sum(_api_calls_made.values())
        print(f"  [IRCTC] 📡 Live API Call #{total_calls} via Key {_current_key_idx}: {endpoint}")

        # ── 5. Actual HTTP request ────────────────────────────────────────
        headers = {
            "x-rapidapi-key": current_key,
            "x-rapidapi-host": IRCTC_RAPIDAPI_HOST,
            "Content-Type": "application/json",
        }

        try:
            resp = _session.get(url, headers=headers, params=params, timeout=timeout)
            
            # 429 means we hit limits (rate limit or hard monthly quota)
            # 403 usually means unauthorized/not subscribed
            if resp.status_code in (429, 403):
                print(f"  [IRCTC] 🔴 Key index {_current_key_idx} {resp.status_code}. Banning for {_BAN_DURATION}s.")
                _key_rate_limit_until[current_key] = time.time() + _BAN_DURATION
                if attempt < n - 1:
                    continue
                else:
                    _cb_record_failure()
                    return None

            if resp.status_code >= 500:
                if attempt < n - 1:
                    backoff = (2 ** attempt) + random.uniform(0.5, 1.5)
                    print(f"  [IRCTC] 5xx error on key {_current_key_idx}, retrying in {backoff:.1f}s")
                    time.sleep(backoff)
                    continue
                _cb_record_failure()
                return None

            if not resp.ok:
                print(f"  [IRCTC] HTTP {resp.status_code} on key {_current_key_idx}.")
                _cb_record_failure()
                return None

            # Success!
            _cb_record_success()
            data = resp.json()

            # Handle response structure differences
            if isinstance(data, dict):
                # If RapidAPI returns status: false with message
                if data.get("status") is False:
                    msg = str(data.get("message", ""))
                    if "Too many requests" in msg or "quota" in msg.lower() or "subscribed" in msg.lower():
                        _key_rate_limit_until[current_key] = time.time() + _BAN_DURATION
                        if attempt < n - 1:
                            continue
                    else:
                        print(f"  [IRCTC] API error: {msg}")
                    _cb_record_failure()
                    return None

                # RapidAPI sometimes wraps success data in a 'data' or 'body' field
                if "data" in data and len(data) == 1:
                    data = data["data"]
                elif "data" in data and isinstance(data["data"], (list, dict)):
                    data = data["data"]

            # Cache it
            if ttl > 0:
                key = _cache_key(endpoint, params)
                _cache_set(key, data, ttl)

            return data

        except requests.exceptions.Timeout:
            print(f"  [IRCTC] Timeout on key {_current_key_idx}")
            if attempt < n - 1:
                time.sleep(1)
                continue
            _cb_record_failure()
            return None
        except Exception as e:
            print(f"  [IRCTC] Unexpected error on key {_current_key_idx}: {e}")
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
    Get station details. Uses searchStation + getTrainSchedule for lat/lng.
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
#  TRAIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════

def search_trains(query):
    """
    Search trains by number or name.
    Returns: [{trainNumber, trainName, ...}]
    """
    data = _get("/api/v1/searchTrain", {"query": query}) if ENABLE_IRCTC_RAPIDAPI else None
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
    # Use a separate counter for attempts to ensure we try ALL keys
    # even if some are already banned.
    for attempt in range(n):
        _connect_key_idx = (_connect_key_idx + 1) % n
        key = IRCTC_CONNECT_KEYS[_connect_key_idx]

        # Skip banned keys
        if _connect_key_rate_limit_until.get(key, 0) > time.time():
            continue

        now = time.time()
        elapsed = now - _connect_last_times.get(key, 0)
        if elapsed < _MIN_INTERVAL:
            time.sleep(_MIN_INTERVAL - elapsed)
        _connect_last_times[key] = time.time()
        
        url = f"{_connect_base}{path}"
        print(f"  [IRCTC Connect] 📡 Attempting via key index {_connect_key_idx}: {path}")
        
        try:
            resp = requests.get(url, headers=_connect_headers("GET", path, key), timeout=timeout)
            
            if resp.status_code == 429:
                print(f"  [IRCTC Connect] 🔴 Key index {_connect_key_idx} rate limited (429). Banning for {_BAN_DURATION}s.")
                _connect_key_rate_limit_until[key] = time.time() + _BAN_DURATION
                if attempt < n - 1:
                    continue
                return None
                
            if resp.status_code in (401, 403):
                # Potentially invalid key or signature issue — ban for shorter duration
                print(f"  [IRCTC Connect] ⚠️ {resp.status_code} (Unauthorized) on key index {_connect_key_idx}. Rotating…")
                _connect_key_rate_limit_until[key] = time.time() + 60 # 1 minute
                if attempt < n - 1:
                    continue
                return None
                
            resp.raise_for_status()
            body = resp.json()
            if isinstance(body, dict) and body.get("success") and "data" in body:
                return body["data"]
                
            # Handle case where success is True but data is empty or structured differently
            if isinstance(body, dict) and body.get("success") is False:
                print(f"  [IRCTC Connect] ❌ API returned success=false: {body.get('message', 'No message')}")
                return None
                
            return None
        except Exception as e:
            print(f"  [IRCTC Connect] ❌ Request failed on key {_connect_key_idx}: {e}")
            if attempt < n - 1:
                time.sleep(0.5)
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
    fc, tc = from_code.upper().strip(), to_code.upper().strip()
    
    from app.pipelines.rail.config import STATION_TO_CITY

    for t in rows:
        # Extract actual station codes from the API response
        actual_fs = str(t.get("from_stn_code") or t.get("source_stn_code") or fc).strip().upper()
        actual_ts = str(t.get("to_stn_code") or t.get("dstn_stn_code") or tc).strip().upper()

        # CLUSTER FILTERING (Generic): 
        # The IRCTC API sometimes returns trains for nearby stations (e.g. Bhestan for Surat).
        # We enforce that the returned station must map to the same City as the requested station 
        # in our official CITY_TO_STATION config, or match exactly.
        
        fc_city = STATION_TO_CITY.get(fc)
        if fc_city and actual_fs != fc:
            if STATION_TO_CITY.get(actual_fs) != fc_city:
                continue
                
        tc_city = STATION_TO_CITY.get(tc)
        if tc_city and actual_ts != tc:
            if STATION_TO_CITY.get(actual_ts) != tc_city:
                continue

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
        
        # Extract actual station codes (if available) to prevent cluster mismatches
        actual_fs = str(t.get("from_stn_code") or t.get("source_stn_code") or fc).strip().upper()
        actual_ts = str(t.get("to_stn_code") or t.get("dstn_stn_code") or tc).strip().upper()

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
            "hasPantry": bool(t.get("has_pantry", False)),
            "classTypes": t.get("class_type") or t.get("class_types") or [],
            "specialTrain": bool(t.get("special_train", False)),
        })
    return {"totalTrains": len(trains), "trains": trains}


# ══════════════════════════════════════════════════════════════════════
#  IRCTC DIRECT SCRAPER — Session-based fallback via irctc.co.in
# ══════════════════════════════════════════════════════════════════════

_irctc_direct_session = None
_irctc_direct_session_ts = 0
_IRCTC_SESSION_MAX_AGE = 600  # Re-create session every 10 minutes

_IRCTC_SEARCH_URL = "https://www.irctc.co.in/nget/train-search"
_IRCTC_API_URL = "https://www.irctc.co.in/eticketing/protected/mapps1/altAvlEnq/TC"

_IRCTC_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}


def _get_irctc_direct_session():
    """
    Get or create an IRCTC direct session.
    Visits the train search page to acquire necessary cookies and tokens.
    """
    global _irctc_direct_session, _irctc_direct_session_ts

    now = time.time()
    if (
        _irctc_direct_session is not None
        and (now - _irctc_direct_session_ts) < _IRCTC_SESSION_MAX_AGE
    ):
        return _irctc_direct_session

    print("  [IRCTC Direct] 🌐 Establishing new session...")
    sess = requests.Session()
    sess.headers.update(_IRCTC_BROWSER_HEADERS)

    try:
        # Step 1: Visit the main search page to get session cookies
        resp = sess.get(_IRCTC_SEARCH_URL, timeout=20)
        if resp.ok:
            print(f"  [IRCTC Direct] ✅ Session established ({len(sess.cookies)} cookies acquired)")
            _irctc_direct_session = sess
            _irctc_direct_session_ts = now
            return sess
        else:
            print(f"  [IRCTC Direct] ⚠️ Session page returned HTTP {resp.status_code}")
            return None
    except Exception as e:
        print(f"  [IRCTC Direct] ❌ Failed to establish session: {e}")
        return None


def _irctc_direct_trains_between(from_code, to_code, date_of_journey):
    """
    Fetch trains between stations directly from IRCTC's protected API.
    This mimics how the browser sends the request after loading the search page.

    Args:
        from_code: Origin station code (e.g. 'NDLS')
        to_code: Destination station code (e.g. 'MMCT')
        date_of_journey: Date in 'YYYY-MM-DD' format

    Returns:
        Standard format: {totalTrains, trains: [...]} or None on failure.
    """
    # ── 1. Cache check ─────────────────────────────────────────────────
    ttl = _get_ttl_for_endpoint("trainBetweenStations")
    ck = _cache_key(
        "irctc_direct_trainBetween",
        {"from": from_code.upper(), "to": to_code.upper()},
    )
    cached = _cache_get(ck)
    if cached is not None:
        return cached

    # ── 2. Get/create browser-like session ─────────────────────────────
    sess = _get_irctc_direct_session()
    if sess is None:
        return None

    # ── 3. Build the POST request ──────────────────────────────────────
    # The IRCTC API expects date as YYYYMMDD
    try:
        yyyy, mm, dd = date_of_journey.split("-")
        irctc_date = f"{yyyy}{mm}{dd}"
    except Exception:
        irctc_date = date_of_journey.replace("-", "")

    payload = {
        "concessionBooking": False,
        "srcStn": from_code.upper().strip(),
        "destStn": to_code.upper().strip(),
        "jrnyClass": "",
        "jrnyDate": irctc_date,
        "quotaCode": "GN",
        "currentBooking": "false",
        "flexiFlag": False,
        "handicapFlag": False,
        "ticketType": "E",
        "loyaltyRedemptionBooking": False,
        "ftBooking": False,
    }

    # Dynamic greq header: timestamp_ms:uuid-v4
    greq_value = f"{int(time.time() * 1000)}:{uuid.uuid4()}"

    api_headers = {
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.irctc.co.in/nget/train-search",
        "Origin": "https://www.irctc.co.in",
        "greq": greq_value,
        "bmirak": "webbm",
    }

    print(f"  [IRCTC Direct] 📡 POST altAvlEnq/TC: {from_code}→{to_code} on {irctc_date}")

    try:
        resp = sess.post(
            _IRCTC_API_URL,
            json=payload,
            headers=api_headers,
            timeout=25,
        )

        if resp.status_code == 403:
            # Akamai bot detection triggered — invalidate session
            print("  [IRCTC Direct] 🔴 403 Forbidden (bot detection). Resetting session.")
            global _irctc_direct_session, _irctc_direct_session_ts
            _irctc_direct_session = None
            _irctc_direct_session_ts = 0
            return None

        if not resp.ok:
            print(f"  [IRCTC Direct] ⚠️ HTTP {resp.status_code}")
            return None

        data = resp.json()
    except requests.exceptions.JSONDecodeError:
        print("  [IRCTC Direct] ⚠️ Non-JSON response (possibly HTML captcha page)")
        return None
    except Exception as e:
        print(f"  [IRCTC Direct] ❌ Request failed: {e}")
        return None

    # ── 4. Parse trainBtwnStnsList ─────────────────────────────────────
    raw_trains = data.get("trainBtwnStnsList")
    if not raw_trains or not isinstance(raw_trains, list):
        print(f"  [IRCTC Direct] ⚠️ No trains in response (keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'})")
        return None

    from app.pipelines.rail.config import STATION_TO_CITY

    trains = []
    fc, tc = from_code.upper().strip(), to_code.upper().strip()

    for t in raw_trains:
        train_no = str(t.get("trainNumber", "")).strip()
        train_name = str(t.get("trainName", "")).strip()
        if not train_no:
            continue

        actual_fs = str(t.get("fromStnCode", fc)).strip().upper()
        actual_ts = str(t.get("toStnCode", tc)).strip().upper()

        # Cluster filtering (same logic as Connect rows)
        fc_city = STATION_TO_CITY.get(fc)
        if fc_city and actual_fs != fc:
            if STATION_TO_CITY.get(actual_fs) != fc_city:
                continue
        tc_city = STATION_TO_CITY.get(tc)
        if tc_city and actual_ts != tc:
            if STATION_TO_CITY.get(actual_ts) != tc_city:
                continue

        # Parse duration "HH:MM"
        dur_str = str(t.get("duration", "0:0"))
        try:
            parts = dur_str.split(":")
            dur_minutes = int(parts[0]) * 60 + int(parts[1])
        except (ValueError, IndexError):
            dur_minutes = 0

        dep_str = str(t.get("departureTime", ""))
        arr_str = str(t.get("arrivalTime", ""))
        dep_minutes = _time_str_to_minutes(dep_str)
        arr_minutes = _time_str_to_minutes(arr_str)

        dep_day = 1
        arr_day = 1
        if dep_minutes is not None and arr_minutes is not None and arr_minutes <= dep_minutes:
            arr_day = 2

        try:
            distance_km = int(float(str(t.get("distance", 0))))
        except (ValueError, TypeError):
            distance_km = 0

        avg_speed = round(distance_km / (dur_minutes / 60), 1) if dur_minutes > 0 else 0

        # Running days from individual fields
        day_map = [
            ("runningMon", "Mon"), ("runningTue", "Tue"), ("runningWed", "Wed"),
            ("runningThu", "Thu"), ("runningFri", "Fri"), ("runningSat", "Sat"),
            ("runningSun", "Sun"),
        ]
        run_days_list = [abbr for field, abbr in day_map if str(t.get(field, "N")).upper() == "Y"]
        all_days = len(run_days_list) == 7

        # Available classes
        class_types = t.get("avlClasses", []) or t.get("classTypes", [])
        if isinstance(class_types, str):
            class_types = [c.strip() for c in class_types.split(",") if c.strip()]

        trains.append({
            "trainNumber": train_no,
            "trainName": train_name,
            "type": t.get("trainType", "") or "",
            "distanceKm": distance_km,
            "travelTimeMinutes": dur_minutes,
            "avgSpeedKmph": avg_speed,
            "totalHalts": 0,
            "sourceStationName": t.get("fromStnName", "") or actual_fs,
            "destinationStationName": t.get("toStnName", "") or actual_ts,
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
            "hasPantry": False,
            "classTypes": class_types,
            "specialTrain": False,
        })

    if not trains:
        print("  [IRCTC Direct] ⚠️ No valid trains after filtering")
        return None

    result = {"totalTrains": len(trains), "trains": trains}
    print(f"  [IRCTC Direct] ✅ Parsed {len(trains)} trains {from_code}→{to_code}")

    # Cache it
    if ttl > 0:
        _cache_set(ck, result, ttl)

    return result


def _confirmtkt_running_days_list(running_days):
    """
    Convert ConfirmTkt runningDays string like '1110110' to ['Mon', ...].
    """
    s = str(running_days or "").strip()
    if not s:
        return []
    out = []
    for i, ch in enumerate(s[:7]):
        if ch == "1" and i < len(_DAY_ABBR):
            out.append(_DAY_ABBR[i])
    return out


def _remaining_timeout(deadline, connect_timeout_s, read_timeout_s):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return None
    bounded = min(read_timeout_s, max(0.5, remaining))
    return (connect_timeout_s, bounded)


def _confirmtkt_fetch_trains_via_assets(page_url, from_code, to_code, doj_ddmmyyyy, timeout_cfg, deadline):
    """
    HTML-derived fallback:
      1) parse bundled JS URL from ConfirmTkt HTML
      2) fetch bundle and infer search endpoint/config hints
      3) request train JSON and return trainList rows
    """
    try:
        req_timeout = _remaining_timeout(deadline, timeout_cfg[0], timeout_cfg[1])
        if req_timeout is None:
            return []
        page_resp = requests.get(
            page_url,
            timeout=req_timeout,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        if not page_resp.ok:
            return []

        html = page_resp.text or ""
        script_match = re.search(
            r'<script[^>]*type="module"[^>]*src="([^"]+)"',
            html,
            flags=re.IGNORECASE,
        )
        if not script_match:
            return []

        bundle_url = urljoin(page_url, script_match.group(1))
        req_timeout = _remaining_timeout(deadline, timeout_cfg[0], timeout_cfg[1])
        if req_timeout is None:
            return []
        js_resp = requests.get(bundle_url, timeout=req_timeout, headers={"User-Agent": "Mozilla/5.0"})
        if not js_resp.ok:
            return []

        bundle = js_resp.text or ""
        endpoint = "https://cttrainsapi.confirmtkt.com/api/v1/trains/search"

        endpoint_match = re.search(
            r'https?://[^"\\\']*cttrainsapi[^"\\\']*/api/v1/trains/search',
            bundle,
            flags=re.IGNORECASE,
        )
        if endpoint_match:
            endpoint = endpoint_match.group(0)

        apikey = "ct-web!2$"
        clientid = "ct-web"
        key_match = re.search(r'apikey["\']?\s*[:=]\s*["\']([^"\']+)["\']', bundle, flags=re.IGNORECASE)
        client_match = re.search(r'clientid["\']?\s*[:=]\s*["\']([^"\']+)["\']', bundle, flags=re.IGNORECASE)
        if key_match:
            apikey = key_match.group(1)
        if client_match:
            clientid = client_match.group(1)

        req_timeout = _remaining_timeout(deadline, timeout_cfg[0], timeout_cfg[1])
        if req_timeout is None:
            return []
        api_resp = requests.get(
            endpoint,
            params={
                "sourceStationCode": from_code.upper().strip(),
                "destinationStationCode": to_code.upper().strip(),
                "dateOfJourney": doj_ddmmyyyy,
                "addAvailabilityCache": "true",
                "enableNearby": "true",
            },
            headers={
                "apikey": apikey,
                "clientid": clientid,
                "deviceid": str(uuid.uuid4()),
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0",
            },
            timeout=req_timeout,
        )
        if not api_resp.ok:
            print(f"  [ConfirmTkt HTML] Asset-derived API HTTP {api_resp.status_code}")
            return []

        body = api_resp.json()
        payload = body.get("data", {}) if isinstance(body, dict) else {}
        rows = payload.get("trainList", []) if isinstance(payload, dict) else []
        if isinstance(rows, list) and rows:
            print(f"  [ConfirmTkt HTML] ✅ Asset-derived trainList size={len(rows)}")
            return rows
        return []
    except Exception as e:
        print(f"  [ConfirmTkt HTML] Asset-derived fetch failed: {e}")
        return []


def _confirmtkt_trains_between(from_code, to_code, date_of_journey):
    """
    ConfirmTkt HTML page scrape for trains between stations.
    Returns normalized shape: {totalTrains, trains: [...]}
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
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    timeout_cfg = (_CONFIRMTKT_CONNECT_TIMEOUT_S, _CONFIRMTKT_READ_TIMEOUT_S)
    deadline = time.monotonic() + max(_CONFIRMTKT_TOTAL_BUDGET_S, _CONFIRMTKT_READ_TIMEOUT_S)

    try:
        print(f"  [ConfirmTkt HTML] 🌐 Scraping trains: {from_code}→{to_code} ({doj_ddmmyyyy})")
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
                f"on {doj_ddmmyyyy}; falling back to IRCTC providers."
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
                # Keep rich ConfirmTkt payload so downstream/UI can use it directly.
                "confirmtkt_raw": t,
                "confirmtkt_availability_cache": t.get("availabilityCache", {}),
                "confirmtkt_availability_cache_tatkal": t.get("availabilityCacheTatkal", {}),
                "confirmtkt_avl_classes": t.get("avlClasses", []),
                "confirmtkt_train_rating": t.get("trainRating"),
                "confirmtkt_running_days_raw": t.get("runningDays"),
            })

        if not trains:
            print(
                f"  [ConfirmTkt HTML] ⚠️ Parsed payload but no valid normalized trains "
                f"for {from_code}→{to_code}; falling back."
            )
            return None

        out = {
            "totalTrains": len(trains),
            "trains": trains,
            "confirmtkt_raw_count": len(rows),
            "confirmtkt_raw_train_list": rows,
        }
        print(f"  [ConfirmTkt HTML] ✅ {out['totalTrains']} trains {from_code}→{to_code}")
        if ttl > 0 and ck:
            _cache_set(ck, out, ttl)
        return out
    except Exception as e:
        print(f"  [ConfirmTkt HTML] ❌ Scrape failed: {e}")
        return None


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

    # ── Tier 0: Unified orchestration cache (cache-first) ───────────────
    ttl = _get_ttl_for_endpoint("trainBetweenStations")
    orchestrated_key = _cache_key(
        "trainBetween_orchestrated_v1",
        {
            "from": str(from_code or "").strip().upper(),
            "to": str(to_code or "").strip().upper(),
            "date": str(date_of_journey or "").strip(),
        },
    )
    if ttl > 0:
        cached = _cache_get(orchestrated_key)
        if cached is not None:
            print(f"  [Rail Cache] ✅ Cache hit {from_code}→{to_code} ({date_of_journey})")
            return cached

    # ── Tier 1: RailYatri trains-between (primary) ──────────────────────
    try:
        from app.pipelines.rail.railyatri_client import fetch_trains_between as _ry_trains_between

        railyatri_data = _ry_trains_between(from_code, to_code, date_of_journey)
        if railyatri_data and railyatri_data.get("trains"):
            print(
                f"  [RailYatri] ✅ {railyatri_data.get('totalTrains', 0)} trains "
                f"{from_code}→{to_code} ({date_of_journey})"
            )
            if ttl > 0:
                _cache_set(orchestrated_key, railyatri_data, ttl)
            return railyatri_data
        print(f"  [RailYatri] ⚠️ No trains parsed for {from_code}→{to_code} ({date_of_journey})")
    except Exception as e:
        print(f"  [RailYatri] ❌ Fallback failed: {e}")

    # ── Tier 2: ConfirmTkt HTML fallback ─────────────────────────────────
    confirmtkt_data = _confirmtkt_trains_between(from_code, to_code, date_of_journey)
    if confirmtkt_data and confirmtkt_data.get("trains"):
        if ttl > 0:
            _cache_set(orchestrated_key, confirmtkt_data, ttl)
        return confirmtkt_data

    # Required order: cache -> RailYatri -> ConfirmTkt HTML.
    return None


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


def _scrape_trains_between_html(from_code, to_code, date_of_journey):
    """
    Last-resort scraper fallback.
    Requires:
      - RAIL_WEB_SCRAPE_ENABLED=true
      - RAIL_WEB_SCRAPE_URL_TEMPLATE with placeholders {from}, {to}, {date}
    Example:
      https://example.com/trains?from={from}&to={to}&date={date}
    """
    if not RAIL_WEB_SCRAPE_ENABLED:
        return None
    if not RAIL_WEB_SCRAPE_URL_TEMPLATE:
        print("  [WebScrape] Disabled: missing RAIL_WEB_SCRAPE_URL_TEMPLATE")
        return None

    # date_of_journey expected YYYY-MM-DD; many sites use DD-MM-YYYY
    date_for_site = date_of_journey
    try:
        yyyy, mm, dd = date_of_journey.split("-")
        date_for_site = f"{dd}-{mm}-{yyyy}"
    except Exception:
        pass

    url = (
        RAIL_WEB_SCRAPE_URL_TEMPLATE
        .replace("{from}", from_code.upper().strip())
        .replace("{to}", to_code.upper().strip())
        .replace("{date}", date_for_site)
    )
    print(f"  [WebScrape] Attempting HTML scrape: {url}")

    try:
        resp = _session.get(
            url,
            timeout=20,
            headers={
                "User-Agent": "Mozilla/5.0 (LogiFlow bot; +https://localhost)",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        if not resp.ok:
            print(f"  [WebScrape] HTTP {resp.status_code}")
            return None

        # Use pandas parser (already a dependency in this project)
        import pandas as pd
        tables = pd.read_html(resp.text)
        if not tables:
            return None

        trains = []
        for df in tables:
            cols = [str(c).strip().lower() for c in df.columns]
            has_train_col = any(("train" in c and ("no" in c or "number" in c or "name" in c)) for c in cols)
            if not has_train_col:
                continue

            for _, row in df.iterrows():
                raw = {str(k).strip().lower(): row[k] for k in df.columns}
                train_no = ""
                train_name = ""
                dep = None
                arr = None

                for k, v in raw.items():
                    s = str(v).strip()
                    if not train_no and ("train no" in k or "train number" in k):
                        train_no = s
                    if not train_name and ("train name" in k or k == "train"):
                        train_name = s
                    if dep is None and ("dep" in k or "departure" in k) and _looks_like_time(s):
                        dep = _time_str_to_minutes(s)
                    if arr is None and ("arr" in k or "arrival" in k) and _looks_like_time(s):
                        arr = _time_str_to_minutes(s)

                if not train_no and not train_name:
                    continue
                if not train_no:
                    m = re.search(r"\b\d{5}\b", train_name)
                    if m:
                        train_no = m.group(0)
                if not train_no:
                    continue

                dur = 0
                if dep is not None and arr is not None:
                    dur = arr - dep
                    if dur <= 0:
                        dur += 1440

                trains.append({
                    "trainNumber": train_no,
                    "trainName": train_name or train_no,
                    "type": "",
                    "distanceKm": 0,
                    "travelTimeMinutes": dur,
                    "avgSpeedKmph": 0,
                    "totalHalts": 0,
                    "sourceStationName": from_code.upper(),
                    "destinationStationName": to_code.upper(),
                    "fromStationCode": from_code.upper(),
                    "toStationCode": to_code.upper(),
                    "runningDays": {"days": [], "allDays": False},
                    "fromStationSchedule": {"departureMinutes": dep, "day": 1},
                    "toStationSchedule": {"arrivalMinutes": arr, "day": 1, "distanceFromSourceKm": 0},
                    "hasPantry": False,
                    "classTypes": [],
                    "specialTrain": False,
                })

        if not trains:
            return None
        print(f"  [WebScrape] Parsed {len(trains)} trains from HTML")
        return {"totalTrains": len(trains), "trains": trains}
    except Exception as e:
        print(f"  [WebScrape] Failed: {e}")
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
    # IRCTC Connect / RapidAPI schedule APIs are deprecated in this flow.
    return None


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

    data = _get("/api/v1/liveTrainStatus", params) if ENABLE_IRCTC_RAPIDAPI else None
    return data


def get_live_station_board(station_code, hours=4):
    """
    Get live station board — trains arriving/departing at a station.
    NOTE: NOT cached — real-time data.
    """
    data = None
    if ENABLE_IRCTC_RAPIDAPI:
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
    data = None
    if ENABLE_IRCTC_RAPIDAPI:
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
