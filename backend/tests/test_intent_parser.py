"""Intent parser — Hinglish and heuristic confidence."""
from app.services.intent_parser import (
    _heuristic_needs_llm,
    _parse_heuristic,
    parse_shipment_intent,
)

HINGLISH_BRIEF = (
    "bhaiya hamare pass 1000 Kilo Ka Sona Hai Humka Eka pathanva se suratiya le Jaega "
    "hi kaise Le Jaaye bhaiya Humko batao"
)


def test_hinglish_brief_triggers_llm_escalation():
    heuristic = _parse_heuristic(HINGLISH_BRIEF, "home")
    assert _heuristic_needs_llm(HINGLISH_BRIEF, heuristic) is True


def test_hinglish_heuristic_no_long_garbage_source():
    heuristic = _parse_heuristic(HINGLISH_BRIEF, "home")
    source = (heuristic.get("source") or "").split(",")[0]
    assert "sona" not in source.lower()
    assert "humka" not in source.lower()


def test_clean_english_skips_llm_when_complete():
    brief = "Ship 50 kg general cargo from Delhi to Mumbai by train, budget ₹5000"
    heuristic = _parse_heuristic(brief, "rail")
    assert heuristic["applied"] is True
    assert _heuristic_needs_llm(brief, heuristic) is False


def test_parse_shipment_intent_returns_without_crash():
    result = parse_shipment_intent(HINGLISH_BRIEF, "home")
    assert "source" in result
    assert "destination" in result
    assert result.get("cargo_weight_kg") == 1000
