

# Hybrid Explainability Module
# Generates human-readable reasoning, tradeoffs, and per-mode insights


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
    """
    Compare best route with others and produce readable tradeoffs.
    Expects normalized routes with keys: mode, time_hr, cost_inr, delay_hr
    """
    if not ranked_routes or len(ranked_routes) < 2:
        return []

    best = ranked_routes[0]
    others = ranked_routes[1:]

    tradeoffs = []

    for r in others:
        t = _fmt_diff(r.get("time_hr", 0), best.get("time_hr", 0), "time", " hrs")
        c = _fmt_diff(r.get("cost_inr", 0), best.get("cost_inr", 0), "cost", "₹")
        d = _fmt_diff(r.get("delay_hr", 0), best.get("delay_hr", 0), "delay", " hrs")

        if t:
            tradeoffs.append(f"{r['mode'].upper()} is {t} compared to {best['mode'].upper()}")
        if c:
            tradeoffs.append(f"{r['mode'].upper()} is {c} compared to {best['mode'].upper()}")
        if d:
            tradeoffs.append(f"{r['mode'].upper()} has {d} compared to {best['mode'].upper()}")

    return tradeoffs


def generate_mode_insights(route):
    """
    Produce qualitative insights per mode using normalized route + optional meta.
    Expected keys: mode, delay_hr, meta (optional dict)
    """
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
            insights.append("Moderate delay probability due to congestion/weather")
        else:
            insights.append("Low expected delay")

    else:
        insights.append("General-purpose transport option")

    return insights


def generate_reason(best_route, priority):
    """
    Single-line recommendation reason based on user priority.
    Expects keys: mode, time_hr, cost_inr, risk
    """
    mode = (best_route.get("mode") or "").upper()

    if priority == "time":
        t = round(best_route.get("time_hr", 0), 1)
        return f"{mode} is the fastest option with ~{t} hrs travel time"

    if priority == "cost":
        c = int(best_route.get("cost_inr", 0))
        return f"{mode} is the most cost-efficient option at ₹{c}"

    if priority == "safety":
        r = int((best_route.get("risk", 0) or 0) * 100)
        return f"{mode} has the lowest risk (~{r}%) among available modes"

    # balanced
    t = round(best_route.get("time_hr", 0), 1)
    c = int(best_route.get("cost_inr", 0))
    return f"{mode} provides the best balance of time (~{t} hrs), cost (₹{c}), and risk"