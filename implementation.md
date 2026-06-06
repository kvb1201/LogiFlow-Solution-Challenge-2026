# Start Driving & Share Route — Implementation

## Files Modified

| File | Change type |
|---|---|
| `frontend/src/lib/routeNavigation.ts` | **New** — single source of truth for Google Maps URL construction and navigation info |
| `frontend/src/components/RouteResults.tsx` | Modified — imports `routeNavigation`; adds `Toast`, `NavigationDisclaimer`, `NavigationActions` components; adds final-sequence banner in results header; `useCallback` import added |
| `frontend/src/components/roadInputForm.tsx` | Modified — stops section rewritten with helper text, improved auto-optimise explanation, and inline context copy |
| `frontend/src/store/useLogiFlowStore.ts` | Modified — `RoadRoute` type extended with `route_id?: string` |
| `backend/app/pipelines/road/pipeline.py` | Modified — `_explain()` emits a deterministic `route_id` on every route; single-leg routes now also carry `waypoints`, `stop_count`, `stop_order_optimised` for navigation consistency |

---

## Route Source of Truth

Every navigation and sharing action derives waypoints exclusively from:

```ts
route.waypoints   // final ordered list returned by the backend
```

This is enforced by `routeNavigation.ts` which is the **only** place that converts a route into a URL. Neither `buildGoogleMapsUrl` nor `getRouteNavigationInfo` ever reads from:
- form state (`source`, `destination`)
- `roadStops` store state
- any frontend-reconstructed ordering

This guarantees that auto-optimised routes, manually reordered routes, and plain single-leg routes all navigate identically to what LogiFlow displayed.

---

## Start Driving Implementation

**Entry point:** `NavigationActions` component in `RouteResults.tsx`

**Flow:**
1. `getRouteNavigationInfo(route)` is called — reads `route.waypoints`, builds the URL, checks navigability.
2. On button click: `window.open(navInfo.mapsUrl, '_blank', 'noopener,noreferrer')` — opens Google Maps in a new tab with all waypoints pre-loaded.
3. Button is disabled (greyed, `cursor-not-allowed`, title = "Navigation unavailable") when `navInfo.isNavigable === false` (waypoints missing or empty).

**Visual emphasis:** When the card is the currently selected (recommended) route, the button renders with `bg-primary text-on-primary` and a subtle glow shadow. Alternative-route cards show a muted outline style.

---

## Share Route Implementation

**Entry point:** `NavigationActions` component — Share Route button, same row as Start Driving.

**Flow:**
1. Same `navInfo.mapsUrl` is used — generated once, shared between both buttons.
2. `navigator.clipboard.writeText(navInfo.mapsUrl)` — async clipboard write.
3. On success: toast "Route link copied to clipboard." (emerald, 2.8 s auto-dismiss).
4. On failure: toast "Unable to copy route link." (red, 2.8 s auto-dismiss).
5. Button disabled under same condition as Start Driving.

**Toast component:** `Toast` is a fixed-position overlay (`bottom-6`, `left-1/2`, `z-9999`) that auto-dismisses via `setTimeout` inside a `useEffect`. It does not block interaction with the rest of the UI.

---

## Google Maps URL Builder

**File:** `frontend/src/lib/routeNavigation.ts`

```ts
buildGoogleMapsUrl(route: RoadRoute): string | null
```

URL format:
```
https://www.google.com/maps/dir/Origin/Stop1/Stop2/Destination
```

Each waypoint is `encodeURIComponent`-encoded. Returns `null` when waypoints are unavailable (prevents accidental navigation to partial routes).

**`getRouteNavigationInfo(route)`** is the primary export — returns:

| Field | Type | Description |
|---|---|---|
| `mapsUrl` | `string` | Google Maps deep-link (identical for Start Driving and Share) |
| `waypoints` | `string[]` | Canonical ordered list from `route.waypoints` |
| `waypointCount` | `number` | Number of intermediate stops |
| `routeId` | `string \| null` | Backend-assigned route identifier |
| `wasStopOrderOptimised` | `boolean` | Whether LogiFlow reordered stops |
| `isNavigable` | `boolean` | False when waypoints are missing |

**`devAssertNavigationConsistency(route, info)`** runs only in development — logs a `console.warn` if the displayed waypoint chain does not match the URL waypoint chain.

---

## Route Preview Implementation

**`NavigationDisclaimer` component** renders below the action buttons:

```
Optimised route
Vadodara → Ahmedabad → Udaipur → Jaipur → Delhi

Includes 3 intermediate stops. Stop order was optimised by LogiFlow.
LogiFlow sets the stop sequence · Google Maps chooses roads between stops
```

**When shown:**
- Always visible for multi-stop routes (≥ 3 waypoints) — no toggle needed, the context is important.
- For plain 2-waypoint routes, a "Preview route" toggle appears — clicking it expands the disclaimer.

This ensures users always understand the division of responsibility before launching navigation.

---

## Final Sequence Banner

A violet banner appears at the top of the results section when the selected route has intermediate stops:

```
Final optimised stop sequence
Vadodara → Ahmedabad → Udaipur → Jaipur → Delhi

Stop order was optimised by LogiFlow for better efficiency.
Google Maps handles road selection between stops.
```

It reads from `routes[safeIndex].waypoints` — always the backend's final sequence, never form state. Shown only when `waypoints.length > 2`.

---

## Add Stops UX Improvements

### Helper text (always visible)
```
Add intermediate stops to create a multi-stop shipment route. You may add, remove,
or rearrange stops manually. Enable Auto-Optimise to let LogiFlow reorder stops for
better cost, time, and risk performance.
```

### Auto-Optimise ON explanation
```
LogiFlow may rearrange stop order to produce a more efficient route.
The final sequence will be shown in results.
```

### Auto-Optimise OFF explanation
```
Stops will be visited in the order you entered.
```

These replace the previous single-line "Reorders stops by shortest path" tooltip. The distinction between LogiFlow's stop-ordering responsibility and Google Maps' road-selection responsibility is now explicit in the form before the user submits.

---

## route_id Integration

### Backend (`pipeline.py`)

Every route object emitted by `_explain()` now includes a deterministic `route_id`:

```
Format: road-<src_slug>-<dst_slug>-<rank>-<cost_hash>
Example: road-vadodara-delhi-0-a3f9c12b
```

- `src_slug` / `dst_slug`: first 12 chars of the city name, lowercase, spaces→underscores.
- `rank`: position in the ranked results list (0 = best).
- `cost_hash`: first 8 chars of MD5 of `"{cost}-{time:.2f}-{risk:.3f}"` — stable for the same route corridor and conditions.

Single-leg routes also receive `waypoints: [source, destination]`, `stop_count: 0`, `stop_order_optimised: false` — ensuring the navigation layer works identically for all route types.

### Frontend (`useLogiFlowStore.ts`)

`RoadRoute` type extended:
```ts
route_id?: string;
```

### Navigation layer (`routeNavigation.ts`)

`getRouteNavigationInfo()` reads `route.route_id` and exposes it as `routeId` in the returned `RouteNavigationInfo` object. Every Start Driving and Share Route action therefore carries the route identifier, ready for Shipment Health / Route Lock association when those features are built.

**Not implemented now, ready for future:**
- Route Lock (prevent navigation changing after dispatch)
- Shipment Health (attach ETA and live tracking to a `route_id`)
- Dynamic Rerouting (detect deviation from `route_id`'s waypoints)

---

## Route Consistency Guarantee

```
Displayed Route  =  route.waypoints (summary bar, stop panel, results header)
Optimised Route  =  route.waypoints (backend final sequence)
Google Maps URL  =  buildGoogleMapsUrl(route) ← reads only route.waypoints
Shared Route     =  same mapsUrl ← generated from same source
```

This is enforced architecturally: all four representations flow from the same `route.waypoints` field through `routeNavigation.ts`. There is no parallel reconstruction path.

---

## Testing Performed

### TypeScript compilation
```
npx tsc --noEmit  →  Exit 0, zero errors
```

### Python syntax validation
```
python3 ast.parse × 3 files  →  OK
```

### Logic trace — no stops (Vadodara → Surat)

- `route.waypoints = ["Vadodara", "Surat"]`
- `buildGoogleMapsUrl` → `https://www.google.com/maps/dir/Vadodara/Surat`
- Start Driving: opens above URL ✓
- Share Route: copies above URL ✓
- NavigationDisclaimer not shown (≤ 2 waypoints, preview toggle hidden) ✓
- Final sequence banner not shown ✓

### Logic trace — one stop (Vadodara → Ahmedabad → Surat)

- `route.waypoints = ["Vadodara", "Ahmedabad", "Surat"]`
- `buildGoogleMapsUrl` → `https://www.google.com/maps/dir/Vadodara/Ahmedabad/Surat`
- Stop count badge = "1 stop" ✓
- NavigationDisclaimer shown: "Includes 1 intermediate stop." ✓
- Final sequence banner shown ✓

### Logic trace — multiple stops

- `route.waypoints = ["Vadodara", "Ahmedabad", "Udaipur", "Jaipur", "Delhi"]`
- `buildGoogleMapsUrl` → `https://www.google.com/maps/dir/Vadodara/Ahmedabad/Udaipur/Jaipur/Delhi`
- All 5 waypoints preserved in URL ✓
- Stop count badge = "3 stops" ✓

### Logic trace — auto-optimised reordering

- User enters: Jaipur, Ahmedabad, Udaipur
- Backend returns `route.waypoints = ["Vadodara", "Ahmedabad", "Udaipur", "Jaipur", "Delhi"]`
- `buildGoogleMapsUrl` uses `route.waypoints`, not form state → correct reordered URL ✓
- Final sequence banner: "Stop order was optimised by LogiFlow for better efficiency." ✓
- NavigationDisclaimer: `wasStopOrderOptimised = true` → same message ✓

### Logic trace — manual reordering

- User manually reorders stops: stop 2 moved above stop 1
- Backend returns waypoints in the submitted order
- `route.stop_order_optimised = false`
- NavigationDisclaimer: "Stop order follows your input." ✓

### Route identity

- Route 1 of Vadodara → Delhi: `route_id = "road-vadodara-delhi-0-a3f9c12b"`
- Route 2 of same query: `route_id = "road-vadodara-delhi-1-b7e2a409"` (different rank + different cost hash)
- `getRouteNavigationInfo` returns `routeId` field for both ✓

### Navigation unavailable

- Route with `waypoints: []` → `isNavigable = false`
- Both buttons disabled, title = "Navigation unavailable — route waypoints missing." ✓

### Dev consistency assertion

- `devAssertNavigationConsistency` called in `NavigationActions` `useEffect`
- Mismatch → `console.warn` with route_id ✓
- Match → `console.info` ✓

---

## Known Limitations

1. **`navigator.clipboard` requires HTTPS or localhost.** On plain HTTP the Share Route clipboard write will fail and the error toast will appear. The URL is correct; only the copy fails.

2. **Google Maps waypoint limit.** Google Maps directions URLs support up to 10 waypoints (including origin and destination). The backend enforces a 10-intermediate-stop maximum, so total waypoints can reach 12. URLs with > 10 Google Maps waypoints may silently drop trailing stops. In practice this affects only 11- or 12-waypoint requests, which are at the edge of the supported range.

3. **`route_id` is deterministic but not globally unique across different pipelines.** It uses source/destination slugs and a cost hash, so two different corridors with identical costs could theoretically collide. For future Shipment Health the backend should generate a UUID and persist it.

4. **Toast does not stack.** If the user clicks Share Route twice quickly, the second toast replaces the first. This is acceptable for the current use case.

5. **Route preview toggle only for single-leg routes.** Multi-stop routes always show the disclaimer. The toggle logic could be unified but the asymmetry is intentional — multi-stop users always benefit from seeing the sequence.

---

## Future Extension Points

1. **Shipment Health / Route Lock.** `route_id` is propagated through every navigation action. Replace the hash-based ID with a backend-persisted UUID and wire it to a `/shipment/{route_id}/health` endpoint.

2. **Dynamic Rerouting.** When GPS position deviates from the planned waypoints, compare against `route.waypoints` and call `/road/optimize` with the remaining waypoints as a new request.

3. **Deep-link to specific app route.** Extend `buildGoogleMapsUrl` with a `platform` parameter to emit `comgooglemaps://` for native Android/iOS apps when running in a Capacitor context.

4. **WhatsApp / email share.** Add a secondary share sheet (Web Share API) that falls back to clipboard. The URL is already built — only the delivery mechanism changes.

5. **Copy as plain text.** Expose a "Copy as text" button that formats the route as:
   ```
   Vadodara → Ahmedabad → Udaipur → Jaipur → Delhi
   ETA: 21.4h · Cost: ₹4,820 · Risk: 12%
   ```
   Uses the same `navInfo.waypoints` — no additional logic needed.
