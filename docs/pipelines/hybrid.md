# Hybrid Pipeline

## Overview

The Hybrid pipeline is the central orchestrator that executes all transport mode pipelines in parallel, normalizes their outputs into a common schema, scores and ranks them using priority-weighted multi-objective optimization, and generates human-readable explanations.

## Flow

```
Input: source, destination, priority, explanation_mode
  │
  ├─ 1. Parallel Execution
  │     ├─ Road Pipeline ──┐
  │     ├─ Rail Pipeline ──┼── ThreadPoolExecutor (timeout=30s)
  │     └─ Air Pipeline  ──┘
  │
  ├─ 2. Mode Availability Detection
  │     ├─ status: "no_routes" → skip mode
  │     └─ timeout / error → skip mode
  │
  ├─ 3. Normalization
  │     └─ {time_hr, cost_inr, risk, confidence, meta}
  │
  ├─ 4. Scoring
  │     ├─ Relative normalization (vs best-in-class)
  │     ├─ Pareto dominance check
  │     ├─ Non-linear penalty (outlier time/cost)
  │     └─ Priority-weighted sum → rank
  │
  ├─ 5. Explanation Generation
  │     ├─ "template" (default) → rule-based, ~0ms
  │     └─ "detailed" → Gemini AI with cache, ~2-5s
  │
  ▼
Output: {recommended_mode, comparison, tradeoffs, available_modes}
```

## Key Features

### Parallel Execution with Timeout
- Uses `ThreadPoolExecutor(max_workers=3)` to run pipelines concurrently
- Each pipeline has a **30-second timeout** via `future.result(timeout=30)`
- Timed-out pipelines are treated as unavailable — remaining modes proceed

### Handling Missing Modes
When a pipeline returns `{status: "no_routes"}` or times out:
- That mode is excluded from normalization, scoring, and comparison
- Added to `unavailable_modes` in the response
- Tradeoff text only references available modes

### Normalization
Each mode's raw output is converted to a common schema:

```json
{
  "mode": "rail",
  "time_hr": 12.5,
  "cost_inr": 850,
  "risk": 0.15,
  "delay_hr": 0.5,
  "confidence": 0.78,
  "meta": {
    "reliability": 0.85,
    "weather_risk": 0.1,
    "congestion_risk": 0.2,
    "stops": 0
  }
}
```

### Scoring Logic

**Step 1 — Relative normalization:**
```
norm_time = time / min(all_times)
norm_cost = cost / min(all_costs)
norm_risk = risk / min(all_risks)
```

**Step 2 — Pareto dominance:**
If one mode beats all others on *every* metric, it wins immediately.

**Step 3 — Non-linear penalty:**
Outliers are penalized (e.g., 3× the cheapest cost gets +0.3 penalty).

**Step 4 — Priority-weighted sum:**

| Priority | Time Weight | Cost Weight | Risk Weight |
|----------|------------|------------|------------|
| `fast` | 0.6 | 0.2 | 0.2 |
| `cheap` | 0.2 | 0.6 | 0.2 |
| `safe` | 0.2 | 0.2 | 0.6 |
| `balanced` | 0.4 | 0.3 | 0.3 |

### Priority Standardization
All incoming priority values are canonicalized:

| Input | Maps To |
|-------|---------|
| `"time"`, `"fast"`, `"fastest"`, `"speed"` | `"fast"` |
| `"cost"`, `"cheap"`, `"cheapest"` | `"cheap"` |
| `"safety"`, `"safe"`, `"safest"`, `"reliable"` | `"safe"` |
| `"balanced"` (default) | `"balanced"` |

### Explanation Engine

**Template mode** (default): Rule-based text generation with zero latency. Uses priority-aware reason templates, tradeoff diffs, and mode-specific insights.

**Detailed mode** (opt-in via `explanation_mode: "detailed"`): Calls Gemini 1.5 Flash API to generate natural language explanations. Features:
- In-memory cache (TTL 1 hour, 200 entries)
- 5-second timeout with template fallback
- Gemini output merged over template (fills gaps)

## Output Structure

```json
{
  "priority": "cheap",
  "recommended_mode": "rail",
  "reason": "RAIL is the most cost-efficient option at about Rs.850.",
  "available_modes": ["road", "rail"],
  "unavailable_modes": {
    "air": "Air transport not available for this route"
  },
  "comparison": [
    {
      "mode": "rail",
      "time_hr": 12.5,
      "cost_inr": 850,
      "risk": 0.15,
      "confidence": 0.78,
      "explanation": "RAIL ranks first because it has the lowest cost at about Rs.850."
    },
    {
      "mode": "road",
      "time_hr": 8.2,
      "cost_inr": 3200,
      "risk": 0.25,
      "confidence": 0.72,
      "explanation": "ROAD is an alternative to RAIL, with 4.3 hours faster, Rs.2350 more expensive."
    }
  ],
  "tradeoffs": [
    "ROAD is 4.3 hrs lower time compared to RAIL",
    "ROAD is 2350 Rs. higher cost compared to RAIL"
  ],
  "mode_insights": {
    "road": ["Flexible door-to-door delivery", "Relatively smooth traffic conditions"],
    "rail": ["Cost-effective for bulk transport", "Stable schedules with predictable transit times"]
  },
  "best_per_mode": {
    "road": { ... },
    "rail": { ... },
    "air": null
  }
}
```
