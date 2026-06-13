# Frontend Implementation Notes

> **Index:** See [docs/README.md](../README.md) for the documentation index.  
> **This file** documents invalid corridor UX (`InvalidCorridorCard`) across road, comparator, and hybrid.

---

# Frontend Invalid Corridor Handling — Implementation Notes

## Summary

The frontend now correctly surfaces backend `no_routes` / `valid: false` responses as
actionable, user-facing explanations rather than silent empty states or generic red error
banners. A reusable `<InvalidCorridorCard>` component is used consistently across Road,
Comparator, and Hybrid planners.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/InvalidCorridorCard.tsx` | **New** — reusable card + inline variant |
| `src/store/useLogiFlowStore.ts` | Added `roadNoRoutesReason` state; road handler detects `status: 'no_routes'` |
| `src/components/RouteResults.tsx` | Shows `InvalidCorridorCard` before the `return null` guard |
| `src/components/ComparatorPageClient.tsx` | Unavailable modes section upgraded; per-mode cards use `InvalidCorridorInline` |
| `src/components/HybridPageClient.tsx` | Tracks `roadUnavailableReason`; shows `InvalidCorridorCard` when road is rejected |
| `src/services/api.ts` | `HybridOptimizeResult.unavailable_modes` documented; `ComposeResult.unavailable_templates` typed |

---

## 1. `InvalidCorridorCard` Component

**Location:** `src/components/InvalidCorridorCard.tsx`

Two exports:

### `<InvalidCorridorCard>` (full-width)
Used on the Road planner page when the entire result is an invalid corridor rejection.

Props:
```ts
{
  mode: string;        // e.g. "road"
  source: string;      // origin city
  destination: string; // destination city
  reason: string;      // backend rejection reason
  compact?: boolean;   // renders InvalidCorridorInline when true
}
```

Visual:
- Red border (`border-red-500/25`) with `bg-red-500/5` tint
- Block icon + "Road Route Unavailable" header
- Corridor display (source → destination)
- Reason box with categorised explanation
- Suggested alternatives (Air, Hybrid, Comparator) as navigation links

### `<InvalidCorridorInline>` (compact)
Used inside Comparator mode cards and Hybrid mode notices.

- Minimal layout: block icon + bold mode label + body text
- Used directly inside the per-mode card grids

### Reason categorisation
`categoriseReason()` maps the raw backend string to a clean headline + body:

| Backend pattern | Headline shown |
|---|---|
| Contains "ocean", "Atlantic", continent names | "No drivable road route exists between these locations." |
| Contains "distance", "threshold", "limit" | "Road transport is not supported for this corridor." |
| Contains "not connected", "isolated" | "This destination is not connected by a continuous road network." |
| Everything else | "No drivable road route available." + raw reason as body |

---

## 2. Store Changes (`useLogiFlowStore.ts`)

### New field
```ts
roadNoRoutesReason: string | null;
```
Initialised to `null`. Reset to `null` on every new road search and in `resetSearch()`.

### Road handler update
When `fetchRoadRoutes()` returns `{ status: 'no_routes' }`:

```ts
if (rawAny?.status === 'no_routes') {
  const noRouteReason = rawAny?.message || rawAny?.reason || 'No drivable road route available.';
  set({
    searchMode: 'road',
    routes: [],
    selectedRoute: 0,
    roadNoRoutesReason: noRouteReason,
    // error is NOT set — this is a valid planning outcome, not a failure
  });
  return;
}
```

Key: `error` is deliberately **not** set. `PipelineModePage` would render a red error banner
for it. Instead, `roadNoRoutesReason` is the signal for `RouteResults` to render the card.

---

## 3. Road Planner (`RouteResults.tsx`)

Added `roadNoRoutesReason` from the store. Before the `if (!routes || routes.length === 0) return null` guard:

```tsx
if (roadNoRoutesReason) {
  return (
    <section className="p-4 sm:p-6">
      <InvalidCorridorCard
        mode="road"
        source={source}
        destination={destination}
        reason={roadNoRoutesReason}
      />
    </section>
  );
}
```

What is **not** shown when `roadNoRoutesReason` is set:
- No cost tiles
- No ETA
- No confidence score
- No route cards
- No route explanations
- No map (no geometry to render)

---

## 4. Comparator Mode (`ComparatorPageClient.tsx`)

### Unavailable modes section
Replaced the old `<p>No live route for: {modes.join(', ')}</p>` with a structured list:

```tsx
{result.unavailable_modes?.map((entry) => {
  // Entry may be "road" or "road: No drivable route..."
  const [modeRaw, reasonRaw] = parseEntry(entry);
  return <InvalidCorridorInline key={modeRaw} mode={modeRaw} reason={reasonRaw} />;
})}
```

### Per-mode cards grid
When `best_per_mode[mode]` is `null` and the mode has a known unavailable reason:

```tsx
{unavailableReason
  ? <InvalidCorridorInline mode={mode} reason={unavailableReason} />
  : <p>Unavailable for this corridor</p>
}
```

This means:
- Road card with a rejected corridor shows "`Road ❌ Unavailable`" + reason
- Air, Rail, Water cards with no data still show the generic text
- All other modes (air, rail, water) continue rendering normally when available

---

## 5. Hybrid Planner (`HybridPageClient.tsx`)

Added local state:
```ts
const [roadUnavailableReason, setRoadUnavailableReason] = useState<string | null>(null);
```

In `runCompose()`, after a successful compose response:
```ts
const roadUnavail = data.unavailable_templates?.road ?? null;
if (roadUnavail) setRoadUnavailableReason(roadUnavail);
```

In the result section, shown **above** `<ComposeResults>`:
```tsx
{roadUnavailableReason && !loading && (
  <InvalidCorridorCard
    mode="road"
    source={source}
    destination={destination}
    reason={roadUnavailableReason}
  />
)}
```

If hybrid alternatives (rail + air chains) still exist, they render normally below
the card. The road rejection doesn't block the rest of the itineraries.

---

## Validation Scenarios

| Scenario | Expected UI |
|---|---|
| London → New York, Road | `InvalidCorridorCard` with trans-Atlantic reason. No cost/ETA/route cards. |
| Mumbai → London, Road | `InvalidCorridorCard` with distance threshold reason. |
| Delhi → Mumbai, Road | Normal route cards (valid corridor). |
| Comparator, any trans-oceanic corridor | Road card in unavailable modes list + `InvalidCorridorInline` in road column. Air/Rail/Water render normally. |
| Hybrid, any trans-oceanic corridor | `InvalidCorridorCard` for road above compose results. Other itineraries (air chains, etc.) still shown. |

---

## Build & TypeScript

```
npx tsc --noEmit   → 0 errors
npm run build      → 16/16 pages, Exit 0
```
