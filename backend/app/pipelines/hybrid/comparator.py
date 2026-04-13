
EPS = 1e-9

def normalize_values(routes, key):
    if not routes:
        return []
    values = [float(r.get(key, 0.0)) for r in routes]
    max_v = max(values) if values else 1.0
    max_v = max(max_v, EPS)
    return [v / max_v for v in values]


def score_routes(routes, priority="balanced"):
    if not routes:
        return []

    norm_time = normalize_values(routes, "time_hr")
    norm_cost = normalize_values(routes, "cost_inr")
    norm_risk = normalize_values(routes, "risk")

    if priority == "cost":
        w = {"cost": 0.5, "time": 0.2, "risk": 0.2, "confidence": 0.1}
    elif priority == "time":
        w = {"cost": 0.2, "time": 0.5, "risk": 0.2, "confidence": 0.1}
    elif priority == "safe":
        w = {"cost": 0.2, "time": 0.2, "risk": 0.5, "confidence": 0.1}
    else:
        w = {"cost": 0.3, "time": 0.3, "risk": 0.3, "confidence": 0.1}

    scored = []
    for i, r in enumerate(routes):
        score = (
            norm_cost[i] * w["cost"] +
            norm_time[i] * w["time"] +
            norm_risk[i] * w["risk"] +
            (1 - float(r.get("confidence", 0.5))) * w["confidence"]
        )
        scored.append((score, r))

    scored.sort(key=lambda x: x[0])
    return [r for _, r in scored]