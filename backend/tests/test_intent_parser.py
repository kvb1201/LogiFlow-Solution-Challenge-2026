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


def test_heuristic_extracts_weight_and_departure_date():
    brief = "Ship 250 kg medicines from Delhi to Mumbai on 15 June 2026 by train"
    heuristic = _parse_heuristic(brief, "rail")
    assert heuristic["cargo_weight_kg"] == 250
    assert heuristic["departure_date"] == "2026-06-15"
    assert heuristic["applied"] is True


USER_SILVER_BRIEF = (
    "I want to take 100000 kilograms of silver from Delhi to Prayagraj "
    "how do I do it on 15th of June 2026 via a train"
)


def test_silver_delhi_prayagraj_june_15_2026():
    result = parse_shipment_intent(USER_SILVER_BRIEF, "rail")
    assert result["applied"] is True
    assert "Delhi" in (result.get("source") or "")
    assert "Prayagraj" in (result.get("destination") or "")
    assert result.get("cargo_weight_kg") == 100000
    assert result.get("departure_date") == "2026-06-15"
    assert result.get("suggested_mode") == "rail"
