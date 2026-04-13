

import json
import os
from functools import lru_cache

# Path to stations data (expects a list of dicts with keys like: code, name, city)
STATION_DATA_PATH = os.path.join(os.path.dirname(__file__), "stations.json")

# Load once at import time
if os.path.exists(STATION_DATA_PATH):
    try:
        with open(STATION_DATA_PATH, "r", encoding="utf-8") as f:
            STATIONS = json.load(f)
    except Exception:
        # Fallback: try JSON lines format (one JSON per line)
        STATIONS = []
        with open(STATION_DATA_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    STATIONS.append(json.loads(line))
                except Exception:
                    continue
else:
    STATIONS = []


def _norm(s: str) -> str:
    if not s:
        return ""
    # take city part before comma and normalize
    return s.lower().strip().split(",")[0]


@lru_cache(maxsize=512)
def resolve_station(query: str) -> str | None:
    """
    Resolve a city/place string to a station code using local data.

    Priority:
    1) exact city match
    2) contains match on city
    3) contains match on station name
    4) fallback map for major cities
    """
    q = _norm(query)
    if not q:
        return None

    # --- 1) Exact city match ---
    for st in STATIONS:
        city = _norm(st.get("city", ""))
        if city == q and st.get("code"):
            return st.get("code")

    # --- 2) Contains match on city ---
    for st in STATIONS:
        city = _norm(st.get("city", ""))
        if q and city and q in city and st.get("code"):
            return st.get("code")

    # --- 3) Contains match on station name ---
    for st in STATIONS:
        name = _norm(st.get("name", ""))
        if q and name and q in name and st.get("code"):
            return st.get("code")

    # --- 4) Fallback for major cities ---
    fallback_map = {
        "delhi": "NDLS",
        "new delhi": "NDLS",
        "mumbai": "CSMT",
        "bombay": "CSMT",
        "surat": "STV",
        "ahmedabad": "ADI",
        "vadodara": "BRC",
        "baroda": "BRC",
        "kolkata": "HWH",
        "howrah": "HWH",
        "chennai": "MAS",
        "madras": "MAS",
        "bengaluru": "SBC",
        "bangalore": "SBC",
        "hyderabad": "HYB",
        "pune": "PUNE",
        "jaipur": "JP",
        "lucknow": "LKO",
        "kanpur": "CNB",
        "nagpur": "NGP",
        "bhopal": "BPL",
        "indore": "INDB",
    }

    return fallback_map.get(q)


# Optional helper for resolving both ends
@lru_cache(maxsize=256)
def resolve_pair(source: str, destination: str) -> tuple[str | None, str | None]:
    return resolve_station(source), resolve_station(destination)