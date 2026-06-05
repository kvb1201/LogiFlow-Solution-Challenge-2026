"""Score and rank composed multimodal itineraries."""
from __future__ import annotations

from typing import Any

_PRIORITY_ALIASES = {
    "cost": "cheap",
    "cheap": "cheap",
    "time": "fast",
    "fast": "fast",
    "safe": "safe",
    "balanced": "balanced",
}


def _weights(priority: str) -> dict[str, float]:
    p = _PRIORITY_ALIASES.get((priority or "balanced").lower().strip(), "balanced")
    if p == "cheap":
        return {"time": 0.2, "cost": 0.6, "risk": 0.2}
    if p == "fast":
        return {"time": 0.6, "cost": 0.2, "risk": 0.2}
    if p == "safe":
        return {"time": 0.2, "cost": 0.2, "risk": 0.6}
    return {"time": 0.4, "cost": 0.3, "risk": 0.3}


def score_itineraries(
    itineraries: list[dict[str, Any]],
    priority: str = "balanced",
) -> list[dict[str, Any]]:
    if not itineraries:
        return []

    w = _weights(priority)
    best_time = min(i["total_time_hr"] for i in itineraries)
    best_cost = min(i["total_cost_inr"] for i in itineraries)
    best_risk = min(i["total_risk"] for i in itineraries)

    for it in itineraries:
        norm_time = it["total_time_hr"] / max(best_time, 1e-6)
        norm_cost = it["total_cost_inr"] / max(best_cost, 1e-6)
        norm_risk = it["total_risk"] / max(best_risk, 1e-6)

        transship_penalty = 0.15 * max(0, len(it.get("legs", [])) - 1)
        score = (
            w["time"] * norm_time
            + w["cost"] * norm_cost
            + w["risk"] * norm_risk
            + transship_penalty
        )
        it["score"] = round(score, 4)

    return sorted(itineraries, key=lambda x: x["score"])


def build_explanation(itinerary: dict[str, Any]) -> str:
    legs = itinerary.get("legs") or []
    if not legs:
        return "No route available."

    if itinerary.get("type") == "direct":
        leg = legs[0]
        return (
            f"Direct {leg['mode'].upper()} from {leg['source']} to {leg['destination']} "
            f"in about {leg['time_hr']:.1f} hours (₹{leg['cost_inr']:,})."
        )

    parts = []
    for i, leg in enumerate(legs):
        parts.append(
            f"{leg['mode'].upper()}: {leg['source']} → {leg['destination']} "
            f"({leg['time_hr']:.1f}h, ₹{leg['cost_inr']:,})"
        )
    hubs = ", ".join(itinerary.get("hub_cities") or [])
    transfer_note = ""
    transfers = itinerary.get("transfers") or []
    if transfers:
        buf = sum(t.get("buffer_hr", 0) for t in transfers)
        transfer_note = f" including {buf:.1f}h transfer time at {hubs}"

    return (
        f"Multimodal route via {hubs}: "
        + " then ".join(parts)
        + transfer_note
        + f". Total ~{itinerary['total_time_hr']:.1f}h, ₹{itinerary['total_cost_inr']:,}."
    )
