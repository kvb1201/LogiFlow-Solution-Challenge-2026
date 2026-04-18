# System Design

## Design Principles

### 1. Modular Pipeline Architecture
Each transport mode is a self-contained pipeline implementing a common `BasePipeline` interface:

```python
class BasePipeline:
    mode: str
    name: str
    def generate(self, source, destination, payload=None, context=None) -> dict
```

Pipelines can be developed, tested, and deployed independently. Adding a new transport mode requires only implementing this interface and registering it.

### 2. Separation of Concerns

| Layer | Responsibility |
|-------|---------------|
| **Routes** (`app/routes/`) | HTTP handling, request validation, response formatting |
| **Pipelines** (`app/pipelines/`) | Business logic, data fetching, scoring |
| **Services** (`app/services/`) | External API integrations (weather, Gemini, ML) |
| **Utils** (`app/utils/`) | Cross-cutting concerns (caching, coordinates) |

### 3. Data Integrity Over Convenience
- Pipelines return `{status: "no_routes"}` rather than fabricating data
- Mock/fallback routes are never injected as real results
- Every route is tagged with `data_source` for transparency

---

## Performance Optimizations

### RequestContext (Per-Request Cache)
A lightweight key-value store shared across all pipelines within a single HTTP request. Eliminates redundant API calls:

| Without RequestContext | With RequestContext |
|----------------------|-------------------|
| Road fetches weather for Mumbai | Road fetches weather for Mumbai |
| Rail fetches weather for Mumbai (duplicate) | Rail reads from cache (0ms) |
| Air fetches weather for Mumbai (duplicate) | Air reads from cache (0ms) |
| **3 API calls** | **1 API call** |

### Tiered Caching
```
L1: RequestContext     → per-request (ms lifetime)
L2: In-memory dict     → application lifetime (TTL-based)
L3: Redis              → persistent across restarts (production)
```

### Reduced Gemini Usage
- Default mode: template-based explanations (0ms latency)
- Gemini only called when `explanation_mode: "detailed"`
- Results cached in-memory (1-hour TTL, 200-entry cap)
- Timeout reduced from 12s to 5s

### Parallel Pipeline Execution
All pipelines run in `ThreadPoolExecutor(max_workers=3)` — total latency ≈ slowest pipeline, not sum of all.

---

## Scalability

### Stateless Backend
- No server-side sessions
- All state lives in RequestContext (per-request) or Redis (shared)
- Can horizontally scale by adding more Render/Gunicorn workers

### Independent Pipelines
- Each pipeline can be scaled, rate-limited, or disabled independently
- Circuit breaker per pipeline prevents cascade failures
- Pipelines can be feature-flagged via environment variables

### Cache-First Architecture
- Station data cached for 30 days (never changes)
- Train schedules cached for 24 hours
- Gemini explanations cached for 1 hour
- Redis shared across all workers in production

---

## Fault Tolerance

### `safe_call` Wrapper
Every pipeline execution is wrapped in a try/except:
```python
def safe_call(pipeline, name):
    try:
        return pipeline.generate(source, destination, payload, context=context)
    except Exception as e:
        print(f"[HYBRID ERROR] {name} pipeline failed: {e}")
        return {}
```

### Timeout Protection
Each pipeline has a 30-second timeout. If exceeded:
- Pipeline is marked as unavailable
- Remaining modes proceed normally
- Response includes `unavailable_modes` explanation

### Graceful Degradation

| Failure | Behavior |
|---------|----------|
| 1 pipeline fails | Other 2 modes compared normally |
| 2 pipelines fail | Single mode returned as recommendation |
| All pipelines fail | Error response with `available_modes: []` |
| Gemini API fails | Template-based explanation used |
| Redis unavailable | In-memory cache used |
| Weather API fails | Default weather factor (1.0) applied |

### Circuit Breaker (Rail)
- Trips after 5 consecutive scraping failures
- Fast-fails for 60 seconds (avoids hammering broken endpoints)
- Half-open recovery probe after timeout
