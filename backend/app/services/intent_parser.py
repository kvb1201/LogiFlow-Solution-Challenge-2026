"""
Parse free-text shipment briefs into structured LogiFlow form fields.

Heuristics handle clean English; Gemini then Groq run for Hinglish/Hindi, informal
phrasing, or when regex output looks unreliable.
"""
from __future__ import annotations

import json
import re
from datetime import date, timedelta
from typing import Any

import requests

from app.services.gemini_service import gemini_generate_content
from app.services.groq_service import _groq_config

# Common Indian freight corridors for heuristic extraction
_CITY_ALIASES: dict[str, str] = {
    "delhi": "Delhi, India",
    "new delhi": "Delhi, India",
    "mumbai": "Mumbai, India",
    "bombay": "Mumbai, India",
    "chennai": "Chennai, India",
    "madras": "Chennai, India",
    "kolkata": "Kolkata, India",
    "calcutta": "Kolkata, India",
    "bengaluru": "Bengaluru, India",
    "bangalore": "Bengaluru, India",
    "hyderabad": "Hyderabad, India",
    "pune": "Pune, India",
    "ahmedabad": "Ahmedabad, India",
    "jaipur": "Jaipur, India",
    "lucknow": "Lucknow, India",
    "chandigarh": "Chandigarh, India",
    "kochi": "Kochi, India",
    "cochin": "Kochi, India",
    "surat": "Surat, India",
    "suratiya": "Surat, India",
    "suratia": "Surat, India",
    "nagpur": "Nagpur, India",
    "indore": "Indore, India",
    "patna": "Patna, India",
    "bhopal": "Bhopal, India",
    "visakhapatnam": "Visakhapatnam, India",
    "vizag": "Visakhapatnam, India",
    "pathankot": "Pathankot, India",
    "pathanva": "Pathankot, India",
    "pathan": "Pathankot, India",
    "tundla": "Tundla, India",
    "kota": "Kota, India",
    "prayagraj": "Prayagraj, India",
    "allahabad": "Prayagraj, India",
}

_MODE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(train|rail|railway|indian railways|railgaadi|train se)\b", re.I), "rail"),
    (re.compile(r"\b(road|truck|highway|lorry|gaadi|truck se)\b", re.I), "road"),
    (re.compile(r"\b(flight|air|airway|air cargo|hawai jahaz)\b", re.I), "air"),
    (re.compile(r"\b(ship|boat|maritime|water|port|sea|jahaj)\b", re.I), "water"),
    (re.compile(r"\b(compare all|all modes|comparator|which mode|best mode)\b", re.I), "comparator"),
    (
        re.compile(
            r"\b(hybrid|multimodal|mixture|mix of|multiple modes|intermodal|"
            r"train.*(?:then|and).*flight|rail.*(?:then|and).*air|don't know which medium)\b",
            re.I,
        ),
        "hybrid",
    ),
]

_PRIORITY_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(cheapest|lowest cost|budget|sabse\s+sasta|sabse\s+saste|sasta\s+tarika|saste\s+tarike)\b", re.I), "cost"),
    (
        re.compile(
            r"\b(fastest|urgent|asap|quickly|jaldi|time\s+constraints?|time\s+priority|"
            r"time\s+sensitive|minimize\s+time|as\s+fast\s+as\s+possible|within \d+ (?:day|hour))\b",
            re.I,
        ),
        "time",
    ),
    (re.compile(r"\b(safest|low risk|reliable)\b", re.I), "safe"),
]

_NO_BUDGET_PATTERNS = re.compile(
    r"\b(no\s+cost\s+constraints?|cost\s+doesn'?t\s+matter|cost\s+is\s+not\s+(?:a\s+)?(?:issue|constraint)|"
    r"unlimited\s+budget|money\s+is\s+no\s+object)\b",
    re.I,
)

_HINGLISH_MARKERS = re.compile(
    r"[\u0900-\u097F]|"
    r"\b(bhaiya|bhai|behen|didi|yaar|humko|humka|hamko|hamare|hamara|humein|"
    r"kaise|kya|kab|kahan|kaha|le\s+jana|le\s+jaaye|bhejna|bhej|chahiye|hai|hain|"
    r"pass|paas|sona|sone|maal|samaan|kitna|kitne)\b",
    re.I,
)

_PLACE_FILLER_WORDS = re.compile(
    r"\b(sona|sone|hai|humka|hamare|hamko|humko|eka|ek|ka|ki|ke|ko|se|le|jaaye|"
    r"jaega|batao|pass|paas|kilo|kilogram|gold)\b",
    re.I,
)

_LLM_INTENT_FIELDS = (
    "source",
    "destination",
    "suggested_mode",
    "priority",
    "cargo_weight_kg",
    "cargo_type",
    "departure_date",
    "budget_max_inr",
    "deadline_hours",
    "scenario_summary",
    "avoid_tolls",
    "avoid_highways",
    "traffic_aware",
    "max_transshipments",
)

_MONTH_NAME_TO_NUM = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def _find_cities(text: str) -> list[str]:
    lower = text.lower()
    found: list[str] = []
    for key, label in sorted(_CITY_ALIASES.items(), key=lambda x: -len(x[0])):
        if re.search(rf"\b{re.escape(key)}\b", lower):
            if label not in found:
                found.append(label)
    return found[:4]


def _extract_from_to(text: str) -> tuple[str | None, str | None]:
    patterns = [
        r"(?:from|pickup|origin)\s+([A-Za-z][A-Za-z\s]{1,40}?)\s+(?:to|→|->|destination|deliver)\s+([A-Za-z][A-Za-z\s]{1,40}?)(?:\s|,|\.|$)",
        r"(?:^|\s)(\w+(?:\s+\w+){0,2})\s+se\s+(\w+(?:\s+\w+){0,2})(?:\s|,|\.|$)",
        r"(?:^|\s)([A-Za-z][A-Za-z\s]{1,24}?)\s+(?:to|→|->)\s+([A-Za-z][A-Za-z\s]{1,24}?)(?:\s|,|\.|$)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            a, b = m.group(1).strip(), m.group(2).strip()
            if len(a) > 2 and len(b) > 2:
                return _normalize_place(a), _normalize_place(b)
    cities = _find_cities(text)
    if len(cities) >= 2:
        return cities[0], cities[1]
    if len(cities) == 1:
        return cities[0], None
    return None, None


def _normalize_place(name: str) -> str:
    key = name.strip().lower()
    if key in _CITY_ALIASES:
        return _CITY_ALIASES[key]

    words = re.findall(r"[a-z]+", key)
    for word in reversed(words[-3:]):
        if word in _CITY_ALIASES:
            return _CITY_ALIASES[word]

    cleaned = _PLACE_FILLER_WORDS.sub(" ", key)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if cleaned in _CITY_ALIASES:
        return _CITY_ALIASES[cleaned]
    for word in re.findall(r"[a-z]+", cleaned)[-3:]:
        if word in _CITY_ALIASES:
            return _CITY_ALIASES[word]

    label = (cleaned or key).strip().title()
    if not label:
        label = name.strip().title()
    if "india" not in label.lower():
        return f"{label}, India"
    return label


def _scale_inr_amount(value: float, suffix: str | None) -> float:
    if not suffix:
        return value
    s = suffix.lower()
    if s == "k":
        return value * 1_000
    if s in ("lakh", "lakhs", "lac", "lacs"):
        return value * 100_000
    if s in ("cr", "crore", "crores"):
        return value * 10_000_000
    return value


def _safe_iso_date(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _month_num(name: str) -> int | None:
    return _MONTH_NAME_TO_NUM.get(name.strip().lower())


def _parse_named_day_month_year(day_s: str, month_s: str, year_s: str | None) -> str | None:
    month = _month_num(month_s)
    if not month:
        return None
    year = int(year_s) if year_s else date.today().year
    return _safe_iso_date(year, month, int(day_s))


_DATE_HINT = re.compile(
    r"\b(?:on|by|for|travel(?:ing)?\s+on)\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?"
    r"(?:\s+of)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b"
    r"|\b\d{1,2}(?:st|nd|rd|th)?\s+of\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)",
    re.I,
)


def _text_mentions_travel_date(text: str) -> bool:
    return bool(_DATE_HINT.search(text) or re.search(r"\b20\d{2}-\d{2}-\d{2}\b", text))


def _parse_departure_date(text: str) -> str | None:
    iso = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text)
    if iso:
        return iso.group(1)

    dmy = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b", text)
    if dmy:
        return _safe_iso_date(int(dmy.group(3)), int(dmy.group(2)), int(dmy.group(1)))

    # "on 15th of June 2026", "15th of June 2026", "on the 15th of June"
    of_month = re.search(
        r"\b(?:on|by|for|travel(?:ing)?\s+on)?\s*(?:the\s+)?"
        r"(\d{1,2})(?:st|nd|rd|th)?\s+of\s+([A-Za-z]{3,9})(?:\s+(20\d{2}))?\b",
        text,
        re.I,
    )
    if of_month:
        parsed = _parse_named_day_month_year(of_month.group(1), of_month.group(2), of_month.group(3))
        if parsed:
            return parsed

    named = re.search(
        r"\b(?:on|by|for)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})(?:\s+(20\d{2}))?\b",
        text,
        re.I,
    )
    if named:
        parsed = _parse_named_day_month_year(named.group(1), named.group(2), named.group(3))
        if parsed:
            return parsed

    # "15 June 2026" without "on"
    bare = re.search(
        r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})(?:\s+(20\d{2}))\b",
        text,
        re.I,
    )
    if bare:
        parsed = _parse_named_day_month_year(bare.group(1), bare.group(2), bare.group(3))
        if parsed:
            return parsed

    named_rev = re.search(
        r"\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b",
        text,
        re.I,
    )
    if named_rev:
        parsed = _parse_named_day_month_year(named_rev.group(2), named_rev.group(1), named_rev.group(3))
        if parsed:
            return parsed

    if re.search(r"\btomorrow\b", text, re.I):
        return (date.today() + timedelta(days=1)).isoformat()
    if re.search(r"\btoday\b", text, re.I):
        return date.today().isoformat()
    return None


def _parse_budget_inr(text: str) -> float | None:
    patterns = (
        r"(?:max|under|budget|≤|<=|less than|upto|up to)\s*₹?\s*(\d[\d,]*(?:\.\d+)?)\s*([kK]|lakh|lakhs|lac|lacs|cr|crore)?\b",
        r"₹\s*(\d[\d,]*(?:\.\d+)?)\s*([kK]|lakh|lakhs)?\b",
        r"(\d[\d,]*(?:\.\d+)?)\s*([kK])\b",
        r"(?:max|under|budget|₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d+)?)",
        r"(\d[\d,]*(?:\.\d+)?)\s*(?:inr|rupees?|₹)",
    )
    for pat in patterns:
        bm = re.search(pat, text, re.I)
        if bm:
            raw = float(bm.group(1).replace(",", ""))
            suffix = bm.group(2) if bm.lastindex and bm.lastindex >= 2 else None
            return _scale_inr_amount(raw, suffix)
    return None


def _normalize_llm_intent(parsed: dict[str, Any], user_brief: str, engine: str) -> dict[str, Any]:
    parsed["applied"] = bool(parsed.get("source") and parsed.get("destination"))
    parsed["scenario_brief"] = user_brief.strip()
    parsed["source_engine"] = engine
    if not parsed.get("scenario_summary"):
        parsed["scenario_summary"] = user_brief[:120]
    return parsed


_INTENT_JSON_SCHEMA = (
    "source, destination, suggested_mode (rail|road|air|water|hybrid|comparator), priority (cost|time|safe|balanced),\n"
    "cargo_weight_kg, cargo_type (General|Fragile|Perishable), departure_date (ISO yyyy-mm-dd), budget_max_inr,\n"
    "deadline_hours, scenario_summary (one line), avoid_tolls, avoid_highways, traffic_aware, max_transshipments.\n"
    "Use null for unknown fields. suggested_mode should reflect explicit user preference when stated."
)

_LLM_INTENT_INSTRUCTIONS = (
    "Users may write in English, Hindi, Hinglish, or informal regional phrasing.\n"
    "Resolve colloquial place names to standard Indian cities (e.g. pathanva → Pathankot, suratiya → Surat).\n"
    "Understand weights like '1000 kilo' as kg unless clearly grams.\n"
    "Map sona/gold to cargo_type General unless clearly fragile/perishable.\n"
)


def _parse_heuristic(user_brief: str, context_mode: str) -> dict[str, Any]:
    text = user_brief.strip()
    source, destination = _extract_from_to(text)

    departure_date = _parse_departure_date(text)

    weight_kg: float | None = None
    for wpat, is_grams in (
        (r"(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilograms?|kilogram|kilo)\b", False),
        (r"(\d+(?:\.\d+)?)\s*kilo\b", False),
        (r"(\d+(?:\.\d+)?)\s*(?:gram|grams|g)\b", True),
        (r"(\d+(?:\.\d+)?)kg\b", False),
    ):
        wm = re.search(wpat, text, re.I)
        if wm:
            weight_kg = float(wm.group(1))
            if is_grams:
                weight_kg /= 1000
            break

    budget = None if _NO_BUDGET_PATTERNS.search(text) else _parse_budget_inr(text)

    deadline_hours: float | None = None
    dm = re.search(r"within\s+(\d+(?:\.\d+)?)\s*(day|days|hour|hours|hr|hrs)\b", text, re.I)
    if dm:
        n = float(dm.group(1))
        unit = dm.group(2).lower()
        deadline_hours = n * 24 if unit.startswith("day") else n

    suggested_mode = context_mode if context_mode not in ("home",) else "hybrid"
    for pat, mode in _MODE_PATTERNS:
        if pat.search(text):
            suggested_mode = mode
            break

    priority = "balanced"
    for pat, pri in _PRIORITY_PATTERNS:
        if pat.search(text):
            priority = pri
            break

    cargo_type = None
    for ct in ("Perishable", "Fragile", "General"):
        if re.search(rf"\b{ct.lower()}\b", text, re.I):
            cargo_type = ct
            break
    if cargo_type is None and re.search(r"\b(medicine|medical|pharma|anar|pomegranate|fruit|fruits|perishable)\b", text, re.I):
        cargo_type = "Perishable"
    if cargo_type is None and re.search(
        r"\b(wood|timber|lumber|sona|sone|gold|silver|copper|steel|metal|maal|samaan)\b",
        text,
        re.I,
    ):
        cargo_type = "General"

    applied = bool(source and destination)
    summary_parts = []
    if source and destination:
        summary_parts.append(f"{source} → {destination}")
    if weight_kg:
        summary_parts.append(f"{int(weight_kg)} kg")
    if departure_date:
        summary_parts.append(f"depart {departure_date}")
    if cargo_type:
        summary_parts.append(cargo_type)
    if priority != "balanced":
        summary_parts.append(f"priority: {priority}")
    if budget:
        summary_parts.append(f"budget ₹{int(budget):,}")
    elif _NO_BUDGET_PATTERNS.search(text):
        summary_parts.append("no cost limit")
    if suggested_mode:
        summary_parts.append(f"mode: {suggested_mode}")

    return {
        "applied": applied,
        "source": source,
        "destination": destination,
        "suggested_mode": suggested_mode,
        "priority": priority,
        "cargo_weight_kg": weight_kg,
        "cargo_type": cargo_type,
        "departure_date": departure_date,
        "budget_max_inr": budget,
        "deadline_hours": deadline_hours,
        "scenario_brief": text,
        "scenario_summary": " · ".join(summary_parts) if summary_parts else text[:120],
        "source_engine": "heuristic",
        "parse_warning": None if applied else "Could not detect both origin and destination — trying AI parse.",
    }


def _intent_is_complete(result: dict[str, Any]) -> bool:
    return bool(result.get("source") and result.get("destination"))


def _place_label_tokens(place: str | None) -> list[str]:
    if not place:
        return []
    head = place.split(",")[0].strip().lower()
    return [w for w in re.findall(r"[a-z]+", head) if len(w) > 1]


def _heuristic_needs_llm(text: str, result: dict[str, Any]) -> bool:
    """True when regex output is untrusted — call Gemini/Groq even if fields exist."""
    if not _intent_is_complete(result):
        return True
    if _text_mentions_travel_date(text) and not result.get("departure_date"):
        return True
    if _HINGLISH_MARKERS.search(text):
        return True

    source_tokens = _place_label_tokens(str(result.get("source")))
    if len(source_tokens) > 3:
        return True
    if any(_PLACE_FILLER_WORDS.search(tok) for tok in source_tokens):
        return True

    # Heuristic got weight/cargo but places look like sentence fragments
    if result.get("cargo_weight_kg") and _PLACE_FILLER_WORDS.search(str(result.get("source") or "")):
        return True

    return False


def _merge_llm_into_heuristic(
    base: dict[str, Any],
    llm: dict[str, Any],
    engine_label: str,
    *,
    prefer_llm: bool = False,
) -> dict[str, Any]:
    for key in _LLM_INTENT_FIELDS:
        val = llm.get(key)
        if val is None:
            continue
        if prefer_llm or base.get(key) in (None, "", []):
            base[key] = val

    if _intent_is_complete(base):
        base["applied"] = True
        base["parse_warning"] = None
    if llm.get("scenario_summary") and (
        prefer_llm or base.get("scenario_summary") in (None, "", base.get("scenario_brief", "")[:120])
    ):
        base["scenario_summary"] = llm["scenario_summary"]
    base["source_engine"] = engine_label
    return base


def _compose_engine_label(*parts: str) -> str:
    return "+".join(p for p in parts if p)


def _parse_gemini(user_brief: str, context_mode: str, timeout_s: int = 12) -> tuple[dict[str, Any] | None, str | None]:
    prompt = (
        "You are LogiFlow's shipment intent parser for Indian multimodal freight.\n"
        f"{_LLM_INTENT_INSTRUCTIONS}\n"
        "Extract structured fields from the user brief. Return ONLY valid JSON with these keys:\n"
        f"{_INTENT_JSON_SCHEMA}\n"
        f"UI context mode: {context_mode}\n"
        f"User brief: {user_brief}\n"
    )

    raw, err = gemini_generate_content(
        prompt,
        response_mime_type="application/json",
        temperature=0.2,
        max_output_tokens=600,
        timeout_s=timeout_s,
    )
    if not raw:
        return None, f"Gemini unavailable ({err or 'no response'})"

    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None, "Gemini returned non-object JSON"
        return _normalize_llm_intent(parsed, user_brief, "gemini"), None
    except Exception as exc:
        return None, f"Gemini JSON error ({exc})"


def _parse_groq(user_brief: str, context_mode: str, timeout_s: int = 12) -> tuple[dict[str, Any] | None, str | None]:
    api_key, model = _groq_config()
    if not api_key:
        return None, "Groq API key not configured"

    prompt = (
        "You are LogiFlow's shipment intent parser for Indian multimodal freight.\n"
        f"{_LLM_INTENT_INSTRUCTIONS}\n"
        "Extract structured fields from the user brief. Return ONLY valid JSON with these keys:\n"
        f"{_INTENT_JSON_SCHEMA}\n"
        f"UI context mode: {context_mode}\n"
        f"User brief: {user_brief}\n"
    )

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.15,
                "max_tokens": 600,
                "response_format": {"type": "json_object"},
            },
            timeout=timeout_s,
        )
        if not resp.ok:
            detail = resp.text[:200] if resp.text else f"HTTP {resp.status_code}"
            return None, f"Groq unavailable ({detail})"
        data = resp.json() if resp.content else {}
        choices = data.get("choices") or []
        if not choices:
            return None, "Groq returned no choices"
        raw = ((choices[0] or {}).get("message") or {}).get("content") or ""
        raw = raw.strip()
        if not raw:
            return None, "Groq returned empty content"
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None, "Groq returned non-object JSON"
        return _normalize_llm_intent(parsed, user_brief, "groq"), None
    except Exception as exc:
        return None, f"Groq error ({exc})"


def parse_shipment_intent(user_brief: str, context_mode: str = "home") -> dict[str, Any]:
    brief = (user_brief or "").strip()
    if len(brief) < 3:
        return {
            "applied": False,
            "error": "Brief too short",
            "scenario_brief": brief,
        }

    result = _parse_heuristic(brief, context_mode)
    needs_llm = _heuristic_needs_llm(brief, result)

    if _intent_is_complete(result) and not needs_llm:
        return result

    llm_warnings: list[str] = []
    engines_used = ["heuristic"]
    prefer_llm = needs_llm

    gemini, gemini_err = _parse_gemini(brief, context_mode)
    if gemini_err:
        llm_warnings.append(gemini_err)
    if gemini:
        engines_used.append("gemini")
        result = _merge_llm_into_heuristic(
            result,
            gemini,
            _compose_engine_label(*engines_used),
            prefer_llm=prefer_llm,
        )
        if _intent_is_complete(result) and not _heuristic_needs_llm(brief, result):
            return result
        prefer_llm = True

    groq, groq_err = _parse_groq(brief, context_mode)
    if groq_err:
        llm_warnings.append(groq_err)
    if groq:
        engines_used.append("groq")
        result = _merge_llm_into_heuristic(
            result,
            groq,
            _compose_engine_label(*engines_used),
            prefer_llm=True,
        )

    if not result.get("applied") and llm_warnings:
        warning = result.get("parse_warning") or ""
        llm_note = "AI parse incomplete: " + "; ".join(llm_warnings[:2])
        result["parse_warning"] = f"{warning} {llm_note}".strip() if warning else llm_note
    elif needs_llm and result.get("applied") and "gemini" not in engines_used and "groq" not in engines_used:
        result["parse_warning"] = (
            "Understood via basic rules only — for Hindi or Hinglish, try adding city names in English as well."
        )

    return result
