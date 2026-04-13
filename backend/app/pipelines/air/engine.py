from copy import deepcopy


def _priority_key(priority):
	value = (priority or "balanced").strip().lower()
	aliases = {
		"time": "fast",
		"fastest": "fast",
		"cost": "cheap",
		"cheapest": "cheap",
		"safest": "safe",
	}
	return aliases.get(value, value)


def score_routes(routes, priority="balanced"):
	"""Rank air routes by requested priority while preserving route payload shape."""
	normalized = _priority_key(priority)
	ranked = [deepcopy(route) for route in (routes or [])]

	if normalized == "fast":
		ranked.sort(key=lambda r: (float(r.get("time", 0)), float(r.get("risk", 0)), float(r.get("cost", 0))))
	elif normalized == "cheap":
		ranked.sort(key=lambda r: (float(r.get("cost", 0)), float(r.get("time", 0)), float(r.get("risk", 0))))
	elif normalized == "safe":
		ranked.sort(key=lambda r: (float(r.get("risk", 0)), float(r.get("time", 0)), float(r.get("cost", 0))))
	else:
		ranked.sort(
			key=lambda r: (
				float(r.get("time", 0)) * 0.35
				+ float(r.get("cost", 0)) * 0.35
				+ float(r.get("risk", 0)) * 0.30
			)
		)

	return ranked
