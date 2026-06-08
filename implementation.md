# Shipment Tracking Architecture Refactor + Auth + Route Intelligence Fixes

## Shipment Tracking Architecture

### Single Source of Truth
`ShipmentReport` is the sole source of truth for all shipment state. It stores:
- `source`, `destination`, `stops` — declared route
- `estimated_cost`, `estimated_time`, `risk_score` — original plan metrics
- `optimization_result` — full pipeline result, including `route_intelligence`
- `status`, `started_at`, `expected_end_time` — trip lifecycle

Route Health is a **decision engine only**. It reads `ShipmentReport` and returns a health assessment. It does not own or persist any state. Every route-health response is computed fresh and discarded after display.

When a user updates their current location, the health endpoint re-evaluates the remaining journey using the existing optimization pipeline (ephemeral, not stored). The `ShipmentReport` itself is only mutated by explicit user actions (Execute Trip, Stop Trip, Save Revision).

### Route Health Flow
```
ShipmentReport (source of truth)
    ↓
evaluate_route_health(report, current_location)
    ↓
  Phase 1: route_intelligence lookup
  Phase 2: estimated city from progress
  Phase 3: corridor status (ON/NEAR/OFF_ROUTE)
  Phase 4: remaining journey pipeline re-evaluation
  Phase 5: health scoring (0–100 + level)
  Phase 6: reoptimization threshold check
    ↓
RouteHealthResponse (ephemeral — display only)
```

---

## Issue 1 — Login Page Branding

**Problem:** LogiFlow logo appeared in both NavBar and LoginPage content area.

**Fix:** Removed the `Link href="/"` logo block from `LoginPage.tsx`. The NavBar (rendered globally via `app/layout.tsx`) already shows the LogiFlow branding on every page including `/login`. The login card now shows only "Smart Shipment Planner" heading and the Google Sign-In button.

**File:** `frontend/src/components/auth/LoginPage.tsx`

---

## Issue 2 — OAuth Freeze / Redirect Loop

**Root cause:** Three competing mechanisms ran simultaneously:
1. `AuthInitializer` called `restore()` on app mount
2. `PublicRoute` had a `useEffect` that redirected to `/dashboard` when `token && user` were set
3. `restore()` could clear a freshly-set token if the `/api/auth/me` call failed or ran concurrently with `setToken()`

The result: after Google credential → `setToken()` → `restore()` sees token → makes `/api/auth/me` → if token not yet propagated to `apiClient` → 401 → clears token → user stuck on `/login`.

**Fixes:**

### `useAuthStore.ts`
- `restore()` now reads `sessionStorage.getItem('auth_token')` first (written immediately on login, before any network call)
- If `user + token` already match in state, skips the `/api/auth/me` call entirely
- Single `_restoreInFlight` guard prevents concurrent invocations
- `logout()` resets `_restoreInFlight`

### `LoginPage.tsx`
- Shows `Authenticating…` spinner **immediately** after Google credential is received (before any fetch)
- Writes token to `sessionStorage` synchronously before calling `setToken()` / `setUser()`
- Uses `router.replace('/dashboard')` (not `push`) so back button doesn't return to login
- Catches errors and hides spinner only on failure

### `ProtectedRoute.tsx`
- `PublicRoute` now respects `loading` state — shows nothing while restore is running, preventing premature redirects
- `PublicRoute` uses a `hasRedirected` ref to fire redirect only once per mount
- Both components use `router.replace()` instead of `router.push()` to prevent history loops

---

## Issue 3 — Estimated Location Still Incorrect

**Problem:** `Vadodara → Surat` at 20.4% returned `"Between Vadodara and Surat"`.

**Two root causes:**

### 1. Missing corridor entry
The corridor table had `surat → vadodara = [bharuch, ankleshwar]` but not `vadodara → surat`. The partial-match fallback was inserting wrong cities.

**Fix:** Replaced all corridor entries with explicit bidirectional pairs. Each entry is now `((ep_a, ep_b), [ordered_cities])`. Reversed when matched in b→a direction. No partial matching — exact endpoint match only.

New `vadodara → surat` entry: `['karjan', 'ankleshwar', 'bharuch']`

### 2. `int()` truncation in progress mapping
`_estimate_city_from_progress` used `int((pct/100) * (n-1))`. For 5 cities at 20.4%: `int(0.204 * 4) = int(0.816) = 0` → returned `route_cities[0]` (Vadodara).

**Fix:** Changed to `int(round(raw_idx))`. Same example: `round(0.816) = 1` → returns `route_cities[1]` (karjan). ✅

**Validation:** `Vadodara → Surat` at 20.4% now returns `karjan`.

---

## Route Corridor Detection Fixes

Updated `_NEAR_CITY_MAP` with more Gujarat corridor entries:
- `kosamba → surat`, `olpad → surat`, `kamrej → surat`, `bardoli → surat`
- `dabhoi → vadodara`, `borsad → anand`
- Removed duplicate `khopoli/panvel` entries that caused dict overwrite

---

## Issue 4 — Route Corridor Visibility

Added `route_cities` to the route-health API response (`evaluate_route_health`). The backend now includes `route_intelligence.route_cities` in the response.

**Frontend additions:**

### `RouteHealthCard.tsx` — inline corridor display
- Collapsible "Route Corridor" section at the bottom of the health card
- Vertical list with connector dots: source (blue) → intermediate cities (grey) → destination (green)
- Current location city is highlighted in amber with a "here" badge
- Shows city count in the toggle button

### `ReportDetailPage.tsx` — persistent corridor section
- New "Route Corridor" section always visible on the report detail page (not just for active trips)
- Reads from `report.optimization_result?.route_intelligence?.route_cities`
- Uses same connector-dot vertical layout
- Shown for all report statuses (planned, active, completed, cancelled)

---

## Issue 5 — Current Location Selection

**Before:** Single text input for manual location entry.

**After:** Three-mode selector:

| Mode | Behavior |
|---|---|
| Use Estimated | Uses estimated location from route intelligence |
| Route City | Dropdown populated from `routeHealth.route_cities` |
| Enter Manually | Free text input |

**Route City dropdown behavior:**
- Cities come from `route_cities` in the health response
- Selecting a city **immediately triggers re-evaluation** via `fetchRouteHealth(report.id, city)` — no separate "Evaluate" click needed
- This implements the "single source of truth" update: current_location selection immediately feeds into remaining journey evaluation

---

## Shipment Health Score (0–100)

**Formula:**

| Component | Weight | Calculation |
|---|---|---|
| Route Adherence | 40% | ON_ROUTE=1.0, NEAR_ROUTE=0.6, OFF_ROUTE=0.1 |
| ETA Impact | 25% | 1 - clamp(eta_gap / original_remaining, 0, 1) |
| Risk | 20% | 1 - updated_risk |
| Cost Impact | 15% | 1 - clamp((updated_cost - original_cost) / original_cost, 0, 1) |

**Health levels:**
- 80–100 = Healthy
- 60–79 = Moderate  
- 0–59 = At Risk

Score is returned in `RouteHealthResponse.shipment_health_score` and displayed next to the health level in `RouteHealthCard`.

---

## Issue 11 — Navbar CTA Label

Changed "New scenario" → "Smart Shipment Planner" in `NavBar.tsx`. The button still links to `/comparator`. Only the visible label changed.

---

## Files Modified

| File | Changes |
|---|---|
| `backend/app/services/trip_progress.py` | Fixed corridor table (exact bidirectional match), fixed `round()` in progress mapping, added health score computation, added `route_cities` and `shipment_health_score` to response, expanded `_NEAR_CITY_MAP` |
| `frontend/src/components/auth/LoginPage.tsx` | Removed duplicate branding, added immediate Authenticating… state, fixed token persistence order, uses `router.replace` |
| `frontend/src/store/useAuthStore.ts` | Fixed restore() to read sessionStorage first, skip network call if user+token already valid, reset in-flight guard on logout |
| `frontend/src/components/auth/ProtectedRoute.tsx` | PublicRoute respects loading state, uses `hasRedirected` ref, uses `router.replace` |
| `frontend/src/services/plannerApi.ts` | Added `shipment_health_score` and `route_cities` to `RouteHealthResponse` |
| `frontend/src/components/planner/RouteHealthCard.tsx` | Added health score display, three-mode location selector (dropdown/manual/estimated), route corridor collapsible section, immediate re-eval on city select |
| `frontend/src/components/planner/ReportDetailPage.tsx` | Added persistent Route Corridor section for all report statuses |
| `frontend/src/components/NavBar.tsx` | Changed CTA label to "Smart Shipment Planner" |

---

## Validation Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ 16/16 pages |
| Backend `py_compile` | ✅ All files OK |
| Issue 1 — branding once | ✅ Only in NavBar |
| Issue 2 — no freeze | ✅ Authenticating… shown immediately, token persisted before network call |
| Issue 3 — `Vadodara→Surat` 20.4% → `karjan` | ✅ |
| Issue 3 — no "Between A and B" | ✅ Confirmed for all test cases |
| Issue 4 — route corridor visible | ✅ In RouteHealthCard + ReportDetailPage |
| Issue 5 — dropdown from route cities | ✅ Populated from route_intelligence |
| Issue 5 — immediate re-eval on select | ✅ Calls fetchRouteHealth immediately |
| Health score 80–100 for healthy trip | ✅ Score 96 |
| Health score 0–59 for at_risk trip | ✅ Score 36 |
| Issue 11 — Navbar CTA updated | ✅ "Smart Shipment Planner" |
| Existing reports backward compatible | ✅ Falls back gracefully when route_intelligence absent |
| Corridor detection — ON/NEAR/OFF | ✅ All test cases pass |

---

## Known Limitations

1. **sessionStorage auth persistence** — tokens survive page refresh but not browser close. This is intentional for security. Long-lived sessions require a refresh token flow (not implemented).
2. **Route cities are lowercase** from corridor table — displayed with CSS `capitalize`. Source/destination cities retain original casing from the report.
3. **Health score re-runs the pipeline** on every route-health check (Phase 4), which adds ~1–3s latency on road mode. For air/hybrid it may be longer. This is acceptable for an on-demand check but would not scale to polling.
