"""Cross-mode interchange hub catalog — route-aware (on-path rail stations only)."""
from __future__ import annotations

import importlib.util
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def _load_rail_config():
    """Load rail/config.py without importing rail package (py3.9-safe)."""
    path = Path(__file__).resolve().parents[1] / "pipelines" / "rail" / "config.py"
    spec = importlib.util.spec_from_file_location("rail_config_isolated", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


_rail_cfg = _load_rail_config()
CITY_TO_STATION = _rail_cfg.CITY_TO_STATION
MAJOR_JUNCTIONS = _rail_cfg.MAJOR_JUNCTIONS
STATION_TO_CITY = _rail_cfg.STATION_TO_CITY

_rail_data_mod = None


def _load_rail_data():
    """Load data_loader.py without importing rail package (py3.9-safe)."""
    global _rail_data_mod
    if _rail_data_mod is not None:
        return _rail_data_mod
    path = Path(__file__).resolve().parents[1] / "pipelines" / "rail" / "data_loader.py"
    spec = importlib.util.spec_from_file_location("rail_data_loader_isolated", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    _rail_data_mod = mod
    return mod

# Cities large enough to justify air/road interchange (subset of mapped cities).
_HUB_WORTHY_CITIES = {
    "Kanpur", "Bareilly", "Agra", "Nagpur", "Bhopal", "Vadodara", "Surat",
    "Varanasi", "Patna", "Jhansi", "Moradabad", "Mathura", "Itarsi", "Ratlam",
    "Kota", "Bilaspur", "Raipur", "Durg", "Gwalior", "Ambala", "Kalyan",
    "Nasik", "Aurangabad", "Wardha", "Katni", "Bhusaval",
}


@dataclass
class Hub:
    city: str
    display_name: str
    rail_stations: list[str]
    airport_code: str | None
    tier: int = 2
    on_route: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "city": self.city,
            "display_name": self.display_name,
            "rail_stations": self.rail_stations,
            "airport_code": self.airport_code,
            "tier": self.tier,
            "on_route": self.on_route,
        }


def _city_key(place: str) -> str:
    raw = re.sub(r",\s*india\s*$", "", place or "", flags=re.I).strip().lower()
    aliases = {
        "new delhi": "delhi",
        "bombay": "mumbai",
        "bangalore": "bengaluru",
        "calcutta": "kolkata",
        "madras": "chennai",
        "prayagraj": "allahabad",
    }
    return aliases.get(raw, raw)


def _match_city_key(place: str) -> str | None:
    key = _city_key(place)
    for city in CITY_TO_STATION:
        if city.lower() == key or key in city.lower() or city.lower() in key:
            return city
    return None


def canonical_city(place: str) -> str:
    """Single canonical label for pipeline calls — avoids duplicate geocode/scrape."""
    from app.services.location_funnel import resolve_location

    resolved = resolve_location(place)
    if resolved.canonical_city:
        return resolved.canonical_city
    matched = _match_city_key(place)
    if matched:
        return matched
    return re.sub(r",\s*india\s*$", "", (place or "").strip(), flags=re.I)


def _build_hub(city: str, *, on_route: bool = True) -> Hub:
    stations = CITY_TO_STATION.get(city, [])
    tier = 1 if city in _HUB_WORTHY_CITIES or any(s in MAJOR_JUNCTIONS for s in stations) else 2
    return Hub(
        city=city,
        display_name=f"{city}, India",
        rail_stations=list(stations),
        airport_code=None,
        tier=tier,
        on_route=on_route,
    )


def _score_intermediate(
    city: str,
    station_code: str,
    frac_along_route: float,
) -> float:
    """Higher = better hub candidate."""
    score = 0.0
    if station_code in MAJOR_JUNCTIONS:
        score += 2.5
    if city in _HUB_WORTHY_CITIES:
        score += 1.5
    # Prefer true en-route hubs (not near origin/destination).
    if 0.18 <= frac_along_route <= 0.82:
        score += 2.0
    elif 0.10 <= frac_along_route <= 0.90:
        score += 0.8
    return score


def discover_route_hub_cities(source: str, destination: str, max_hubs: int = 4) -> list[str]:
    """
    Find hub cities that lie ON the direct rail path between source and destination.
    Uses the IR schedule CSV — no geocoding, no off-route tier-1 guesses.
    """
    src_city = _match_city_key(source)
    dst_city = _match_city_key(destination)
    if not src_city or not dst_city or src_city == dst_city:
        return []

    from_stations = CITY_TO_STATION.get(src_city, [])
    to_stations = CITY_TO_STATION.get(dst_city, [])
    if not from_stations or not to_stations:
        return []

    rail_data = _load_rail_data()
    get_trains_for_route = rail_data.get_trains_for_route
    get_train_route = rail_data.get_train_route
    get_direct_trains = rail_data.get_direct_trains

    exclude = {src_city, dst_city}
    scores: dict[str, float] = {}

    trains = get_trains_for_route(from_stations, to_stations, max_results=10)
    for train in trains[:6]:
        train_no = train["train_no"]
        fs = train["from_station"]
        ts = train["to_station"]
        stops = get_train_route(train_no)
        if len(stops) < 3:
            continue

        codes = [s["station_code"] for s in stops]
        try:
            i_from = codes.index(fs)
            i_to = codes.index(ts)
        except ValueError:
            continue
        if i_from >= i_to:
            continue

        seg_start = stops[i_from]["distance"]
        seg_end = stops[i_to]["distance"]
        seg_dist = seg_end - seg_start
        if seg_dist < 60:
            continue

        for i in range(i_from + 1, i_to):
            code = stops[i]["station_code"]
            city = STATION_TO_CITY.get(code)
            if not city or city in exclude:
                continue
            if city not in CITY_TO_STATION:
                continue
            if code not in MAJOR_JUNCTIONS and city not in _HUB_WORTHY_CITIES:
                continue

            frac = (stops[i]["distance"] - seg_start) / seg_dist
            if frac < 0.12 or frac > 0.88:
                continue

            bonus = _score_intermediate(city, code, frac)
            scores[city] = scores.get(city, 0.0) + bonus

    # Fallback only when CSV has no direct train — pick junctions with both A→hub and hub→B.
    if not scores and not trains:
        for fs in from_stations:
            for mid_code in MAJOR_JUNCTIONS:
                if not get_direct_trains(fs, mid_code):
                    continue
                city = STATION_TO_CITY.get(mid_code)
                if not city or city in exclude or city not in CITY_TO_STATION:
                    continue
                for ts in to_stations:
                    if get_direct_trains(mid_code, ts):
                        scores[city] = scores.get(city, 0.0) + 3.0
                        break

    ranked = sorted(scores.items(), key=lambda x: (-x[1], x[0]))
    return [city for city, _ in ranked[:max_hubs]]


def is_known_corridor(source: str, destination: str) -> bool:
    """True when we can name at least one on-path hub or direct rail exists in CSV."""
    if discover_route_hub_cities(source, destination, max_hubs=1):
        return True
    src = _match_city_key(source)
    dst = _match_city_key(destination)
    if not src or not dst:
        return False
    rail_data = _load_rail_data()
    get_trains_for_route = rail_data.get_trains_for_route

    fs = CITY_TO_STATION.get(src, [])
    ts = CITY_TO_STATION.get(dst, [])
    return bool(get_trains_for_route(fs, ts, max_results=1))


def get_hubs(source: str, destination: str, max_hubs: int = 4) -> list[Hub]:
    """Return on-path interchange cities between source and destination."""
    cities = discover_route_hub_cities(source, destination, max_hubs=max_hubs)
    hubs = [_build_hub(city, on_route=True) for city in cities]
    hubs.sort(key=lambda h: (h.tier, h.city))
    return hubs
