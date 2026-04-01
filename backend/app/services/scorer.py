

def score_route(route, priority, preferred_mode=None):
    """
    Compute a score for a route.
    Lower score = better.

    Inputs:
    - route: dict with keys {time, cost, risk, mode}
    - priority: "Fast" | "Cheap" | "Safe"
    - preferred_mode: optional string (e.g., "road", "rail", "water", "hybrid")
    """

    time = route.get("time", 0)
    cost = route.get("cost", 0)
    risk = route.get("risk", 0)
    mode = route.get("mode")

    # Base scoring by priority
    if priority == "Fast":
        score = time + 10 * risk
    elif priority == "Cheap":
        score = cost + 10 * risk
    elif priority == "Safe":
        score = 100 * risk + time
    else:
        # Fallback: balanced
        score = time + cost + 10 * risk

    # Preference boost (lower is better)
    if preferred_mode and mode == preferred_mode:
        score *= 0.8

    return score