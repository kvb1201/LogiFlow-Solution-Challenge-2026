PRIORITY_WEIGHTS = {
    "fast": {"time": 0.5, "cost": 0.2, "risk": 0.2, "delay": 0.1},
    "cheap": {"time": 0.2, "cost": 0.5, "risk": 0.2, "delay": 0.1},
    "balanced": {"time": 0.3, "cost": 0.3, "risk": 0.2, "delay": 0.2},
    "safe": {"time": 0.2, "cost": 0.2, "risk": 0.4, "delay": 0.2},
}


def score_routes(routes, priority):
    if not routes:
        return []

    weights = PRIORITY_WEIGHTS.get(priority, PRIORITY_WEIGHTS["balanced"])

    max_time = max(route["time"] for route in routes) or 1
    max_cost = max(route["cost"] for route in routes) or 1
    max_risk = max(route["risk"] for route in routes) or 1
    max_delay = max(route["delay_prob"] for route in routes) or 1

    for route in routes:
        route["score"] = (
            weights["time"] * (route["time"] / max_time)
            + weights["cost"] * (route["cost"] / max_cost)
            + weights["risk"] * (route["risk"] / max_risk)
            + weights["delay"] * (route["delay_prob"] / max_delay)
        )

    return sorted(routes, key=lambda route: route["score"])
