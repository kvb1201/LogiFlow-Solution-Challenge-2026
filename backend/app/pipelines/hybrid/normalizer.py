EPS = 1e-9

def clamp(x, low=0.0, high=1.0):
    return max(low, min(high, x))


def normalize_road(route):
    time = max(float(route.get("time", 0)), 0.0)
    cost = float(route.get("cost", 0))
    risk = float(route.get("risk", 0.3))
    delay = float(route.get("predicted_delay", 0))
    highway_ratio = float(route.get("highway_ratio", 0.7))
    traffic_level = float(route.get("traffic_level", 0.3))
    weather_factor = float(route.get("weather_factor", 1.0))

    highway_ratio = clamp(highway_ratio)
    traffic_level = clamp(traffic_level)

    delay_ratio = delay / max(time, EPS)
    delay_ratio = clamp(delay_ratio)

    weather_penalty = max(0, weather_factor - 1)
    confidence = (
        0.4 * (1 - risk) +
        0.3 * (1 - delay_ratio) +
        0.2 * highway_ratio +
        0.1 * (1 - weather_penalty)
    )

    return {
        "mode": "road",
        "time_hr": time,
        "cost_inr": cost,
        "risk": clamp(risk),
        "delay_hr": delay,
        "confidence": clamp(confidence),
        "meta": {
            "reliability": 1 - risk,
            "weather_risk": max(0, weather_factor - 1),
            "congestion_risk": traffic_level,
            "stops": 0
        },
        "raw": route
    }


def normalize_rail(route):
    time = max(float(route.get("time", route.get("duration_hours", 0))), 0.0)
    cost = float(route.get("cost", route.get("parcel_cost_inr", 0)))
    risk = float(route.get("risk", route.get("risk_score", 0.3)))
    delay = float(route.get("predicted_delay", route.get("predicted_delay_min", 0)))
    # ensure delay is in hours
    if delay > 10:  # likely in minutes
        delay = delay / 60.0

    delay_ratio = delay / max(time, EPS)
    delay_ratio = clamp(delay_ratio)
    delay_minutes = delay * 60
    punctuality = clamp(1 - (delay_minutes / 120.0))  # degrade if delays high

    confidence = (
        0.4 * (1 - risk) +
        0.3 * punctuality +
        0.2 * (1 - delay_ratio) +
        0.1 * (1 - float(route.get("weather_risk", 0)))
    )

    return {
        "mode": "rail",
        "time_hr": time,
        "cost_inr": cost,
        "risk": clamp(risk),
        "delay_hr": delay,
        "confidence": clamp(confidence),
        "meta": {
            "reliability": 1 - risk,
            "weather_risk": float(route.get("weather_risk", 0)),
            "congestion_risk": 0.2,
            "stops": 1 if route.get("has_transfer") else 0
        },
        "raw": route
    }


def normalize_air(route):
    time = max(float(route.get("time", 0)), 0.0)
    cost = float(route.get("cost", 0))

    delay_prob = float(route.get("delay_prob", 0))
    weather_risk = float(route.get("weather_risk", 0))
    congestion_risk = float(route.get("congestion_risk", 0))
    reliability = float(route.get("reliability", 0.8))
    stops = int(route.get("stops", 0))

    # FIX: compute real risk
    risk = (
        0.4 * delay_prob +
        0.3 * weather_risk +
        0.2 * congestion_risk +
        0.1 * (1 - reliability)
    )
    risk = clamp(risk)

    # more realistic delay estimate (fixed + proportional)
    delay = max(0.5 * delay_prob + delay_prob * time, 0.0)

    # route support
    support = route.get("route_support_type", "direct")
    support_score = 1.0 if support == "direct" else 0.8 if support == "one_stop" else 0.6

    delay_ratio = delay / max(time, EPS)
    delay_ratio = clamp(delay_ratio)

    confidence = (
        0.4 * reliability +
        0.3 * (1 - delay_ratio) +
        0.2 * (1 - risk) +
        0.1 * support_score
    )
    confidence = clamp(confidence)

    return {
        "mode": "air",
        "time_hr": time,
        "cost_inr": cost,
        "risk": clamp(risk),
        "delay_hr": delay,
        "confidence": clamp(confidence),
        "meta": {
            "reliability": reliability,
            "weather_risk": weather_risk,
            "congestion_risk": congestion_risk,
            "stops": stops
        },
        "raw": route
    }