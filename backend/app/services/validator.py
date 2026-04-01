def validate_route(route):
    required_keys = ["type", "mode", "time", "cost", "risk", "segments"]

    # Check required keys
    for key in required_keys:
        if key not in route:
            raise ValueError(f"Missing key: {key}")

    # Type checks
    if not isinstance(route["type"], str):
        raise ValueError("type must be a string")

    if not isinstance(route["mode"], str):
        raise ValueError("mode must be a string")

    if not isinstance(route["time"], (int, float)):
        raise ValueError("time must be a number")

    if not isinstance(route["cost"], (int, float)):
        raise ValueError("cost must be a number")

    if not isinstance(route["risk"], (int, float)):
        raise ValueError("risk must be a number")

    # Segments validation
    if not isinstance(route["segments"], list):
        raise ValueError("segments must be a list")

    for seg in route["segments"]:
        if not isinstance(seg, dict):
            raise ValueError("each segment must be a dict")

        if "from" not in seg or "to" not in seg:
            raise ValueError("segment must contain 'from' and 'to'")

        if "mode" not in seg:
            raise ValueError("segment must contain 'mode'")

    return True
