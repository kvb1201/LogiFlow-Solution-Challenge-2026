"""
Index of Indian Railway stations from backend/data/station_name.pdf.

Primary mapping goldmine: station code, name, district, state, division, zone.
Used by the location funnel to expand a single code/name to every station in
the same district (e.g. PRYJ → all PRAYAGRAJ district codes).
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_PDF_PATH = Path(__file__).resolve().parents[2] / "data" / "station_name.pdf"
_CACHE_PATH = Path(__file__).resolve().parents[1] / "pipelines" / "rail" / "stations_from_pdf_cache.json"

# Longest first so "UTTAR PRADESH" wins over "PRADESH".
_STATES = sorted(
    {
        "ANDAMAN AND NICOBAR ISLANDS",
        "ANDHRA PRADESH",
        "ARUNACHAL PRADESH",
        "ASSAM",
        "BIHAR",
        "CHANDIGARH",
        "CHHATTISGARH",
        "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
        "DELHI",
        "GOA",
        "GUJARAT",
        "HARYANA",
        "HIMACHAL PRADESH",
        "JAMMU AND KASHMIR",
        "JHARKHAND",
        "KARNATAKA",
        "KERALA",
        "LADAKH",
        "LAKSHADWEEP",
        "MADHYA PRADESH",
        "MAHARASHTRA",
        "MANIPUR",
        "MEGHALAYA",
        "MIZORAM",
        "NAGALAND",
        "ODISHA",
        "PUDUCHERRY",
        "PUNJAB",
        "RAJASTHAN",
        "SIKKIM",
        "TAMIL NADU",
        "TELANGANA",
        "TRIPURA",
        "UTTAR PRADESH",
        "UTTARAKHAND",
        "WEST BENGAL",
    },
    key=len,
    reverse=True,
)

_CODE_RE = re.compile(r"^[A-Z][A-Z0-9]{1,4}$")


@dataclass(frozen=True)
class StationRecord:
    code: str
    name: str
    district: str
    state: str
    division: str
    zone: str

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "name": self.name,
            "city": self.district,
            "district": self.district,
            "state_name": self.state,
            "division": self.division,
            "zone": self.zone,
        }


def _norm_key(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _peel_state(tokens: list[str]) -> tuple[str, list[str]]:
    if len(tokens) >= 2 and tokens[-1].upper() == "DELHI":
        # e.g. ... CENTRAL DELHI  →  district CENTRAL, state DELHI
        return "DELHI", tokens[:-1]

    upper = " ".join(tokens).upper()
    for state in _STATES:
        if upper.endswith(state):
            n = len(state.split())
            return state, tokens[:-n]
    if tokens:
        return tokens[-1].upper(), tokens[:-1]
    return "", tokens


def _parse_row_line(line: str) -> StationRecord | None:
    line = re.sub(r"\s+", " ", (line or "").strip())
    if not re.match(r"^\d+\s+\S", line):
        return None
    parts = line.split()
    if len(parts) < 8:
        return None

    state, rest = _peel_state(parts)
    if len(rest) < 7:
        return None

    district = rest[-1]
    zone = rest[-2]
    division = rest[-3]
    # rest[-4] new category, rest[-5] old category, rest[-6] code
    code = rest[-6].upper()
    name_tokens = rest[1:-6]
    name = " ".join(name_tokens).strip()

    if not _CODE_RE.fullmatch(code) or not name:
        return None
    return StationRecord(
        code=code,
        name=name,
        district=district.upper(),
        state=state,
        division=division.upper(),
        zone=zone.upper(),
    )


def _extract_pdf_lines() -> list[str]:
    if not _PDF_PATH.exists():
        return []
    try:
        from pypdf import PdfReader
    except ImportError:
        return []

    reader = PdfReader(str(_PDF_PATH))
    raw = "\n".join((page.extract_text() or "") for page in reader.pages)
    # Drop header blocks and page markers.
    lines: list[str] = []
    for ln in raw.splitlines():
        ln = ln.strip()
        if not ln:
            continue
        if ln.lower().startswith("s no station name"):
            continue
        if re.search(r"--\s*\d+\s*of\s*\d+\s*--", ln, re.I):
            continue
        lines.append(ln)
    return lines


def _merge_wrapped_rows(lines: list[str]) -> list[str]:
    """Join continuation lines (e.g. 'Not open for passenger traffic')."""
    merged: list[str] = []
    buf = ""
    for ln in lines:
        if re.match(r"^\d+\s", ln):
            if buf:
                merged.append(buf)
            buf = ln
        elif buf:
            buf = f"{buf} {ln}"
        else:
            buf = ln
    if buf:
        merged.append(buf)
    return merged


def build_pdf_index(*, force: bool = False) -> list[StationRecord]:
    if not force and _CACHE_PATH.exists():
        try:
            rows = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
            if isinstance(rows, list) and len(rows) > 500:
                return [
                    StationRecord(
                        code=str(r["code"]).upper(),
                        name=str(r.get("name") or ""),
                        district=str(r.get("district") or r.get("city") or "").upper(),
                        state=str(r.get("state_name") or r.get("state") or ""),
                        division=str(r.get("division") or ""),
                        zone=str(r.get("zone") or ""),
                    )
                    for r in rows
                    if r.get("code")
                ]
        except Exception:
            pass

    records: list[StationRecord] = []
    seen: set[str] = set()
    for line in _merge_wrapped_rows(_extract_pdf_lines()):
        rec = _parse_row_line(line)
        if not rec or rec.code in seen:
            continue
        seen.add(rec.code)
        records.append(rec)

    try:
        _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _CACHE_PATH.write_text(
            json.dumps([r.to_dict() for r in records], ensure_ascii=False, indent=0),
            encoding="utf-8",
        )
    except Exception:
        pass
    return records


class StationPdfIndex:
    def __init__(self, records: list[StationRecord]):
        self.records = records
        self.by_code: dict[str, StationRecord] = {r.code: r for r in records}
        self.by_district: dict[str, list[str]] = {}
        self.by_name: dict[str, list[str]] = {}
        for r in records:
            dkey = _norm_key(r.district)
            self.by_district.setdefault(dkey, [])
            if r.code not in self.by_district[dkey]:
                self.by_district[dkey].append(r.code)
            nkey = _norm_key(r.name)
            self.by_name.setdefault(nkey, []).append(r.code)
            # Also index without punctuation (JN., etc.)
            short = _norm_key(re.sub(r"\s+JN\.?$", "", r.name, flags=re.I))
            if short and short != nkey:
                self.by_name.setdefault(short, []).append(r.code)

    def lookup_code(self, code: str) -> StationRecord | None:
        return self.by_code.get((code or "").strip().upper())

    def codes_in_district(self, district: str) -> list[str]:
        return list(self.by_district.get(_norm_key(district), []))

    def search_text(self, query: str) -> list[StationRecord]:
        q = _norm_key(query)
        if not q:
            return []

        hits: list[StationRecord] = []
        seen: set[str] = set()

        def _add(code: str):
            if code in seen:
                return
            rec = self.by_code.get(code)
            if rec:
                seen.add(code)
                hits.append(rec)

        if q.upper() in self.by_code:
            _add(q.upper())

        for code, rec in self.by_code.items():
            if q == _norm_key(rec.name) or q == _norm_key(rec.district):
                _add(code)

        for name_key, codes in self.by_name.items():
            if name_key == q:
                for c in codes:
                    _add(c)
            elif len(name_key) >= 4 and (q.startswith(name_key) or name_key.startswith(q)):
                for c in codes:
                    _add(c)

        for dkey, codes in self.by_district.items():
            if dkey == q or (len(dkey) >= 4 and (q.startswith(dkey) or dkey.startswith(q))):
                for c in codes:
                    _add(c)

        return hits


@lru_cache(maxsize=1)
def get_pdf_index() -> StationPdfIndex:
    return StationPdfIndex(build_pdf_index())


def _edit_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def fuzzy_pdf_code(token: str) -> str | None:
    idx = get_pdf_index()
    t = token.upper()
    if t in idx.by_code:
        return t

    # Common typo: adjacent transposition (CSTM ↔ CSMT).
    chars = list(t)
    for i in range(len(chars) - 1):
        swapped = chars.copy()
        swapped[i], swapped[i + 1] = swapped[i + 1], swapped[i]
        candidate = "".join(swapped)
        if candidate in idx.by_code:
            return candidate

    best: str | None = None
    best_dist = 2
    for code in idx.by_code:
        if abs(len(code) - len(t)) > 1:
            continue
        dist = _edit_distance(t, code)
        if dist < best_dist:
            best_dist = dist
            best = code
    return best if best_dist == 1 else None


def pdf_station_codes_for_place(query: str) -> tuple[str | None, str | None, list[str], str]:
    """
    Resolve query via PDF index.

    Returns (canonical_district, primary_code, all_district_codes, resolution).
    """
    idx = get_pdf_index()
    raw = (query or "").strip()
    token = raw.upper()

    if _CODE_RE.fullmatch(token):
        rec = idx.lookup_code(token)
        if rec:
            codes = idx.codes_in_district(rec.district)
            return rec.district.title(), rec.code, codes or [rec.code], "pdf_station_code"
        fuzzy = fuzzy_pdf_code(token)
        if fuzzy:
            rec = idx.lookup_code(fuzzy)
            if rec:
                codes = idx.codes_in_district(rec.district)
                return rec.district.title(), rec.code, codes or [rec.code], "pdf_fuzzy_code"

    hits = idx.search_text(raw)
    if hits:
        qn = _norm_key(raw)

        def _rank(rec: StationRecord) -> tuple:
            name_n = _norm_key(rec.name)
            dist_n = _norm_key(rec.district)
            exact_name = name_n == qn
            prefix_name = name_n.startswith(qn) or qn.startswith(name_n)
            exact_dist = dist_n == qn
            has_jn = " JN" in rec.name.upper()
            return (
                0 if exact_name else 1,
                0 if exact_dist else 1,
                0 if prefix_name else 1,
                0 if has_jn else 1,
                len(rec.code),
                rec.code,
            )

        hits.sort(key=_rank)
        rec = hits[0]
        codes = idx.codes_in_district(rec.district)
        return rec.district.title(), rec.code, codes or [rec.code], "pdf_name_or_district"

    return None, None, [], "pdf_miss"
