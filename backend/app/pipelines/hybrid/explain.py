# This module builds hybrid-route explanations, using Gemini when available and deterministic fallback text otherwise.
from app.services.gemini_explainer import generate_hybrid_explanations


def _fmt_diff(a, b, label, unit=""):
    try:
        diff = a - b
    except Exception:
        return None

    if abs(diff) < 1e-6:
        return None

    direction = "higher" if diff > 0 else "lower"
    val = abs(round(diff, 2))
    return f"{val}{unit} {direction} {label}"


def generate_tradeoffs(ranked_routes):
    if not ranked_routes or len(ranked_routes) < 2:
        return []

    best = ranked_routes[0]
    others = ranked_routes[1:]
    tradeoffs = []

    for route in others:
        time_diff = _fmt_diff(route.get("time_hr", 0), best.get("time_hr", 0), "time", " hrs")
        cost_diff = _fmt_diff(route.get("cost_inr", 0), best.get("cost_inr", 0), "cost", " Rs.")
        delay_diff = _fmt_diff(route.get("delay_hr", 0), best.get("delay_hr", 0), "delay", " hrs")

        if time_diff:
            tradeoffs.append(f"{route['mode'].upper()} is {time_diff} compared to {best['mode'].upper()}")
        if cost_diff:
            tradeoffs.append(f"{route['mode'].upper()} is {cost_diff} compared to {best['mode'].upper()}")
        if delay_diff:
            tradeoffs.append(f"{route['mode'].upper()} has {delay_diff} compared to {best['mode'].upper()}")

    return tradeoffs


def generate_mode_insights(route):
    insights = []

    mode = route.get("mode")
    delay = route.get("delay_hr", 0)
    meta = route.get("meta") or {}

    if mode == "road":
        insights.append("Flexible door-to-door delivery")
        congestion = meta.get("congestion_risk") or meta.get("traffic_level")
        if congestion is not None and congestion > 0.5:
            insights.append("High traffic congestion expected")
        else:
            insights.append("Relatively smooth traffic conditions")

    elif mode == "rail":
        insights.append("Cost-effective for bulk transport")
        insights.append("Stable schedules with predictable transit times")

    elif mode == "air":
        insights.append("Fastest mode of transport")
        if delay and delay > 1:
            insights.append("Moderate delay probability due to congestion or weather")
        else:
            insights.append("Low expected delay")

    else:
        insights.append("General-purpose transport option")

    return insights


def generate_reason(best_route, priority):
    mode = (best_route.get("mode") or "").upper()

    if priority == "time":
        time_hr = round(best_route.get("time_hr", 0), 1)
        return f"{mode} is the fastest option with about {time_hr} hours of travel time."

    if priority == "cost":
        cost_inr = int(best_route.get("cost_inr", 0))
        return f"{mode} is the most cost-efficient option at about Rs.{cost_inr}."

    if priority == "safety":
        risk_pct = int((best_route.get("risk", 0) or 0) * 100)
        return f"{mode} has the lowest modeled risk at about {risk_pct}% among the available modes."

    time_hr = round(best_route.get("time_hr", 0), 1)
    cost_inr = int(best_route.get("cost_inr", 0))
    risk_pct = int((best_route.get("risk", 0) or 0) * 100)
    return (
        f"{mode} provides the best balance of time ({time_hr} hours), "
        f"cost (Rs.{cost_inr}), and risk ({risk_pct}%)."
    )


def generate_route_explanation(route, best_route, priority):
    mode = (route.get("mode") or "").upper()
    best_mode = (best_route.get("mode") or "").upper()
    time_hr = round(route.get("time_hr", 0), 1)
    cost_inr = int(route.get("cost_inr", 0))
    risk_pct = int(round((route.get("risk", 0) or 0) * 100))

    if route is best_route:
        if priority == "time":
            return f"{mode} ranks first because it has the shortest travel time at about {time_hr} hours."
        if priority == "cost":
            return f"{mode} ranks first because it has the lowest cost at about Rs.{cost_inr}."
        if priority == "safety":
            return f"{mode} ranks first because it has the lowest modeled risk at about {risk_pct}%."
        return (
            f"{mode} ranks first because it best balances time ({time_hr} hours), "
            f"cost (Rs.{cost_inr}), and risk ({risk_pct}%)."
        )

    deltas = []
    time_diff = route.get("time_hr", 0) - best_route.get("time_hr", 0)
    cost_diff = route.get("cost_inr", 0) - best_route.get("cost_inr", 0)
    risk_diff = route.get("risk", 0) - best_route.get("risk", 0)

    if abs(time_diff) > 1e-6:
        deltas.append(
            f"{abs(round(time_diff, 1))} hours {'slower' if time_diff > 0 else 'faster'}"
        )
    if abs(cost_diff) > 1e-6:
        deltas.append(
            f"Rs.{abs(int(round(cost_diff)))} {'more expensive' if cost_diff > 0 else 'cheaper'}"
        )
    if abs(risk_diff) > 1e-6:
        deltas.append(
            f"{abs(round(risk_diff * 100, 1))}% {'higher' if risk_diff > 0 else 'lower'} risk"
        )

    if deltas:
        return f"{mode} is an alternative to {best_mode}, with " + ", ".join(deltas[:3]) + "."

    return f"{mode} is a viable alternative, but it does not outperform {best_mode} on the selected priority."


def _build_gemini_route_payload(ranked_routes):
    return [
        {
            "mode": route.get("mode"),
            "time_hr": round(route.get("time_hr", 2), 2),
            "cost_inr": int(route.get("cost_inr", 0)),
            "risk_pct": round((route.get("risk", 0) or 0) * 100, 1),
            "delay_hr": round(route.get("delay_hr", 0), 2),
            "confidence_pct": round((route.get("confidence", 0) or 0) * 100, 1),
            "meta": route.get("meta") or {},
        }
        for route in ranked_routes
    ]


def build_hybrid_explanations(priority, ranked_routes):
    best_route = ranked_routes[0]
    fallback = {
        "reason": generate_reason(best_route, priority),
        "tradeoffs": generate_tradeoffs(ranked_routes),
        "mode_insights": {route["mode"]: generate_mode_insights(route) for route in ranked_routes},
        "route_explanations": {
            route["mode"]: generate_route_explanation(route, best_route, priority)
            for route in ranked_routes
        },
    }

    gemini_result = generate_hybrid_explanations(
        priority=priority,
        ranked_routes=_build_gemini_route_payload(ranked_routes),
        recommended_mode=best_route.get("mode", ""),
    )

    if not gemini_result:
        return fallback

    route_explanations = fallback["route_explanations"].copy()
    for mode, text in (gemini_result.get("route_explanations") or {}).items():
        if isinstance(text, str) and text.strip():
            route_explanations[mode] = text.strip()

    mode_insights = fallback["mode_insights"].copy()
    for mode, items in (gemini_result.get("mode_insights") or {}).items():
        if isinstance(items, list) and items:
            cleaned = [str(item).strip() for item in items if str(item).strip()]
            if cleaned:
                mode_insights[mode] = cleaned

    tradeoffs = gemini_result.get("tradeoffs")
    if not isinstance(tradeoffs, list) or not tradeoffs:
        tradeoffs = fallback["tradeoffs"]
    else:
        tradeoffs = [str(item).strip() for item in tradeoffs if str(item).strip()]

    reason = gemini_result.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        reason = fallback["reason"]

    return {
        "reason": reason.strip(),
        "tradeoffs": tradeoffs,
        "mode_insights": mode_insights,
        "route_explanations": route_explanations,
    }
