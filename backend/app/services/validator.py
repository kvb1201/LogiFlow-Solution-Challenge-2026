def validate_route(route):
    required_keys = ["type", "mode", "time", "cost", "risk", "segments"]

    for key in required_keys:
        if key not in route:
            raise ValueError(f"Missing key: {key}")

    return True
