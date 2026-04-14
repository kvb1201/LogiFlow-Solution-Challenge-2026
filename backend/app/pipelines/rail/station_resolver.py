

import json
import os
import re
from functools import lru_cache
from app.pipelines.rail.fallback_stations import STATIONS as FALLBACK_STATIONS
from app.pipelines.rail.config import CITY_TO_STATION

# Path to stations data (expects a list of dicts with keys like: code, name, city)
STATION_DATA_PATH = os.path.join(os.path.dirname(__file__), "stations.json")

# PDF-backed station corpus (generated once, cached as JSON).
_STATION_PDF_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "station_name.pdf")
)
_STATION_PDF_CACHE_PATH = os.path.join(os.path.dirname(__file__), "stations_from_pdf_cache.json")


def _load_pdf_station_cache() -> list[dict]:
    if not os.path.exists(_STATION_PDF_CACHE_PATH):
        return []
    try:
        with open(_STATION_PDF_CACHE_PATH, "r", encoding="utf-8") as f:
            rows = json.load(f)
        return rows if isinstance(rows, list) else []
    except Exception:
        return []


def _build_pdf_station_cache() -> list[dict]:
    """
    Build stations list from `backend/data/station_name.pdf` and persist cache.

    Output rows include:
      - code (station code)
      - name (station name)
      - city (district)  [used as "city" in resolver]
      - state
    """
    if not os.path.exists(_STATION_PDF_PATH):
        return []

    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:
        return []

    def _split_fields(s: str) -> list[str]:
        # Prefer tab splits; fallback to runs of 2+ spaces.
        if "\t" in s:
            return [p.strip() for p in s.split("\t") if p.strip()]
        return [p.strip() for p in re.split(r"\s{2,}", s) if p.strip()]

    stations: list[dict] = []
    seen: set[str] = set()

    try:
        reader = PdfReader(_STATION_PDF_PATH)
    except Exception:
        return []

    for page in getattr(reader, "pages", []) or []:
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        if not text:
            continue

        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        cur: list[str] = []

        def _flush(block_lines: list[str]):
            if not block_lines:
                return
            block = " ".join(block_lines).strip()
            if not block:
                return
            if re.search(r"--\s*\d+\s*of\s*\d+\s*--", block, flags=re.IGNORECASE):
                return
            if block.lower().startswith("s no station name"):
                return

            fields = _split_fields(block)
            if len(fields) < 3:
                return

            # Common case from the PDF text extraction:
            # [SNo, Station Name, Stn Code, ..., District, State]
            if not re.fullmatch(r"\d+", fields[0] or ""):
                return
            name = (fields[1] or "").strip()
            code = (fields[2] or "").strip().upper()
            if not name or not re.fullmatch(r"[A-Z0-9]{2,5}", code):
                # Some entries wrap; try to find code later in the row.
                code_idx = None
                for i in range(2, min(len(fields), 8)):
                    if re.fullmatch(r"[A-Z0-9]{2,5}", (fields[i] or "").strip().upper()):
                        code_idx = i
                        break
                if code_idx is None:
                    return
                name = " ".join([fields[1]] + fields[2:code_idx]).strip()
                code = fields[code_idx].strip().upper()

            # District and state tend to be the last 2 columns in this PDF.
            district = (fields[-2] if len(fields) >= 2 else "").strip()
            state = (fields[-1] if len(fields) >= 1 else "").strip()

            if code in seen:
                return
            seen.add(code)
            stations.append(
                {
                    "code": code,
                    "name": name,
                    "city": district,
                    "state_name": state,
                }
            )

        for ln in lines:
            if re.match(r"^\d+\s+", ln) and cur:
                _flush(cur)
                cur = [ln]
            else:
                cur.append(ln)
        _flush(cur)

    # Persist cache best-effort.
    try:
        with open(_STATION_PDF_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(stations, f, ensure_ascii=False)
    except Exception:
        pass

    return stations

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

# If local stations.json is empty, hydrate from PDF-derived cache (or build it).
_PDF_STATIONS = _load_pdf_station_cache()
if not _PDF_STATIONS:
    _PDF_STATIONS = _build_pdf_station_cache()

# Merge local stations.json, PDF station corpus, with comprehensive fallback list (no city hardcoding).
_ALL_STATIONS = []
_seen_codes = set()
for row in (STATIONS or []) + (_PDF_STATIONS or []) + (FALLBACK_STATIONS or []):
    code = (row.get("code") or "").strip().upper()
    if not code or code in _seen_codes:
        continue
    _seen_codes.add(code)
    _ALL_STATIONS.append(row)

# Include explicit city→station config codes as hardcoded corpus too.
for city, codes in CITY_TO_STATION.items():
    for code in (codes or []):
        c = (code or "").strip().upper()
        if not c or c in _seen_codes:
            continue
        _seen_codes.add(c)
        _ALL_STATIONS.append({"code": c, "name": city.upper(), "city": city})

# Comprehensive station list is now offline-first via stations.json + PDF cache.



def _norm(s: str) -> str:
    if not s:
        return ""
    # take city part before comma and normalize
    s = s.lower().strip().split(",")[0]
    s = re.sub(r"\s+", " ", s)
    return s


@lru_cache(maxsize=512)
def resolve_station(query: str) -> str | None:
    """
    Resolve a city/place string to a station code using local data.

    Priority:
    1) exact city match
    2) contains match on city
    3) contains match on station name
    """
    q = _norm(query)
    if not q:
        return None

    # If user already typed a station code (e.g. NDLS/MMCT), keep it.
    # Do not treat full city words like "SURAT" as station codes unless present in corpus.
    raw = (query or "").strip().upper()
    if re.fullmatch(r"[A-Z0-9]{2,5}", raw) and (raw in _seen_codes or len(raw) <= 4):
        return raw

    def _pick_best(codes):
        if not codes:
            return None
        ranked = sorted(
            list(dict.fromkeys([str(c).strip().upper() for c in codes if c])),
            key=lambda c: (
                0 if re.fullmatch(r"[A-Z0-9]{2,5}", c) else 1,
                len(c),
                c,
            ),
        )
        return ranked[0] if ranked else None

    # --- 1) Exact city match ---
    exact_city_codes = []
    for st in _ALL_STATIONS:
        city = _norm(st.get("city", ""))
        if not city:
            city = _norm(st.get("state_name", ""))
        if city == q and st.get("code"):
            exact_city_codes.append(st.get("code"))
    picked = _pick_best(exact_city_codes)
    suspicious_literal = re.sub(r"[^A-Z0-9]", "", q.upper())
    if picked and picked != suspicious_literal:
        return picked

    # --- 2) Contains match on city ---
    city_codes = []
    for st in _ALL_STATIONS:
        city = _norm(st.get("city", ""))
        if not city:
            city = _norm(st.get("state_name", ""))
        if q and city and q in city and st.get("code"):
            city_codes.append(st.get("code"))
    picked = _pick_best(city_codes)
    if picked and picked != suspicious_literal:
        return picked

    # --- 3) Contains match on station name ---
    name_matches = []
    for st in _ALL_STATIONS:
        name = _norm(st.get("name", ""))
        if q and name and q in name and st.get("code"):
            name_matches.append(st.get("code"))

    picked = _pick_best(name_matches)
    if picked:
        return picked

    return None


# Optional helper for resolving both ends
@lru_cache(maxsize=256)
def resolve_pair(source: str, destination: str) -> tuple[str | None, str | None]:
    return resolve_station(source), resolve_station(destination)