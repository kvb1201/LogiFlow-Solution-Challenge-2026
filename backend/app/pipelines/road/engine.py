def _normalize(values):
    min_v, max_v = min(values), max(values)
    # handle near-constant values to avoid noise-based ranking
    if max_v - min_v < 1e-6:
        return [0.5 for _ in values]
    eps = 1e-9
    return [(v - min_v) / (max_v - min_v + eps) for v in values]


def decide(routes, payload):
    if not routes:
        return {}

    priority = payload.get("priority", "cost")
    simulation_mode = payload.get("mode") == "simulation"

    # sanitize inputs
    for r in routes:
        r["parcel_cost_inr"] = int(r.get("parcel_cost_inr", 0))
        r["effective_hours"] = round(float(r.get("effective_hours", 0.0)), 2)
        r["risk_score"] = round(float(r.get("risk_score", 0.0)), 3)
        be = float(r.get("booking_ease", 0.0))
        # clamp booking_ease to [0,1]
        r["booking_ease"] = max(0.0, min(1.0, be))

    # --- CONSTRAINT FILTERING ---
    budget = payload.get("budget")
    deadline = payload.get("deadline_hours")

    filtered = []
    for r in routes:
        if budget is not None and r["parcel_cost_inr"] > budget:
            continue
        if deadline is not None and r["effective_hours"] > deadline:
            continue
        filtered.append(r)

    if not filtered:
        print("[DECIDE] No routes satisfy constraints → relaxing constraints")
        filtered = routes

    routes = filtered

    costs = [r["parcel_cost_inr"] for r in routes]
    times = [r["effective_hours"] for r in routes]
    risks = [r["risk_score"] for r in routes]
    ease_penalty = [1 - r["booking_ease"] for r in routes]

    norm_costs = _normalize(costs)
    norm_times = _normalize(times)
    norm_risks = _normalize(risks)
    norm_eases = _normalize(ease_penalty)

    # weights
    if priority == "cost":
        weights = [0.5, 0.2, 0.2, 0.1]
    elif priority == "time":
        weights = [0.2, 0.5, 0.2, 0.1]
    elif priority == "risk":
        weights = [0.2, 0.2, 0.5, 0.1]
    else:  # balanced
        weights = [0.35, 0.25, 0.25, 0.15]

    # Simulation-aware adjustment
    if simulation_mode:
        weights[0] -= 0.15  # cost less important
        weights[1] += 0.1   # time more important
        weights[2] += 0.1   # risk more important

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

    # confidence based on score gap
    if len(scored) > 1:
        gap = scored[1]["total_score"] - scored[0]["total_score"]
        confidence = min(100, round((1 - gap) * 100))
    else:
        confidence = 80

    if priority == "cost":
        best = min(scored, key=lambda x: x["parcel_cost_inr"])
    elif priority == "time":
        best = min(scored, key=lambda x: x["effective_hours"])
    elif priority == "risk":
        best = min(scored, key=lambda x: x["risk_score"])
    else:
        best = scored[0]
    return {
        "best": best,
        "cheapest": min(scored, key=lambda x: x["parcel_cost_inr"]),
        "fastest": min(scored, key=lambda x: x["effective_hours"]),
        "safest": min(scored, key=lambda x: x["risk_score"]),
        "all_options": scored,
        "confidence": confidence,
    }