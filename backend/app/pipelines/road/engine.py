def _normalize(values):
    min_v, max_v = min(values), max(values)
    if max_v == min_v:
        # return neutral value instead of all zeros to avoid bias
        return [0.5 for _ in values]
    eps = 1e-9
    return [(v - min_v) / (max_v - min_v + eps) for v in values]


def decide(routes, payload):
    if not routes:
        return {}

    priority = payload.get("priority", "cost")

    # sanitize inputs
    for r in routes:
        r["parcel_cost_inr"] = int(r.get("parcel_cost_inr", 0))
        r["effective_hours"] = round(float(r.get("effective_hours", 0.0)), 2)
        r["risk_score"] = round(float(r.get("risk_score", 0.0)), 3)
        be = float(r.get("booking_ease", 0.0))
        # clamp booking_ease to [0,1]
        r["booking_ease"] = max(0.0, min(1.0, be))

    costs = [r["parcel_cost_inr"] for r in routes]
    times = [r["effective_hours"] for r in routes]
    risks = [r["risk_score"] for r in routes]
    eases = [1 - r["booking_ease"] for r in routes]

    norm_costs = _normalize(costs)
    norm_times = _normalize(times)
    norm_risks = _normalize(risks)
    norm_eases = _normalize(eases)

    # weights
    if priority == "cost":
        weights = (0.5, 0.2, 0.2, 0.1)
    elif priority == "time":
        weights = (0.2, 0.5, 0.2, 0.1)
    elif priority == "risk":
        weights = (0.2, 0.2, 0.5, 0.1)
    else:  # balanced
        weights = (0.35, 0.25, 0.25, 0.15)

    scored = []

    for i, r in enumerate(routes):
        score = (
            weights[0] * norm_costs[i] +
            weights[1] * norm_times[i] +
            weights[2] * norm_risks[i] +
            weights[3] * norm_eases[i]
        )
        # tiny deterministic tie-breaker to avoid identical scores
        score += (i * 1e-6)
        r["total_score"] = round(score, 4)
        scored.append(r)

    scored.sort(key=lambda x: x["total_score"])

    best = scored[0]
    return {
        "best": best,
        "cheapest": min(scored, key=lambda x: x["parcel_cost_inr"]),
        "fastest": min(scored, key=lambda x: x["effective_hours"]),
        "safest": min(scored, key=lambda x: x["risk_score"]),
        "all_options": scored
    }