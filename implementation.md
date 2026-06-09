# Fix Shipment Location Update Workflow

## Root Cause

The workflow broke at one specific point: `canUpdateShipment` compared `previewCity` against `resolvedLocation`, but `resolvedLocation` comes from `routeHealth.current_location` — which the backend already resolves to the preview city after `fetchRouteHealth(id, city)` is called.

**Before (broken):**
```
User selects "Ankleshwar"
handleCitySelect("Ankleshwar")
  → fetchRouteHealth(id, "Ankleshwar")        ← backend returns current_location = "ankleshwar"
  
resolvedLocation = routeHealth.current_location = "ankleshwar"
previewCity      = activeLocation()            = "ankleshwar"  (from selectedCity)

hasPreviewCity = previewCity !== resolvedLocation = "ankleshwar" !== "ankleshwar" = FALSE
canUpdateShipment = FALSE
→ Update Shipment panel never appears
```

**After (fixed):**
```
User selects "Ankleshwar"
handleCitySelect("Ankleshwar")
  → setSelectedCity("Ankleshwar")             ← NO auto-fetch
  → setEvaluatedPreviewCity("")               ← reset

User clicks "Evaluate"
runCheck()
  → setEvaluatedPreviewCity("Ankleshwar")     ← record what was evaluated
  → fetchRouteHealth(id, "Ankleshwar")

canUpdateShipment = !!evaluatedPreviewCity     = "Ankleshwar" ≠ "" = TRUE
→ Update Shipment panel appears
```

---

## What Changed

### New state: `evaluatedPreviewCity`

Tracks the city that was explicitly submitted via the **Evaluate** button. Separate from `activeLocation()` (selector value) and `routeHealth.current_location` (backend response). This is the authoritative "what the user wants to commit".

```ts
const [evaluatedPreviewCity, setEvaluatedPreviewCity] = useState<string>('');
```

### `handleCitySelect` — no longer auto-evaluates

Previously called `fetchRouteHealth(id, city)` immediately on dropdown selection, which put the card in a state where `previewCity === resolvedLocation`. Now it only updates local selector state. The user must explicitly click **Evaluate**.

```ts
const handleCitySelect = (city: string) => {
  setSelectedCity(city);
  setLocationMode('dropdown');
  setShipmentUpdated(false);
  setEvaluatedPreviewCity('');  // not yet evaluated
  // No fetchRouteHealth here
};
```

### `runCheck` — sets `evaluatedPreviewCity`

```ts
const runCheck = () => {
  const loc = activeLocation();
  if (!loc) { fetchRouteHealth(report.id); return; }
  setEvaluatedPreviewCity(loc);          // record what was evaluated
  fetchRouteHealth(report.id, loc);      // backend returns preview metrics
};
```

### `canUpdateShipment` — uses `evaluatedPreviewCity`

```ts
const canUpdateShipment =
  !!evaluatedPreviewCity &&
  evaluatedPreviewCity.toLowerCase() !== (routeHealth?.confirmed_current_location || '').toLowerCase() &&
  !shipmentUpdated;
```

Compares against `confirmed_current_location` (the last stored location), not against the backend-resolved preview. Backtracking to Bharuch from Karjan works correctly because Bharuch ≠ the stored Karjan.

### `commitLocation` — prefers `evaluatedPreviewCity`

```ts
const commitLocation = (): string =>
  evaluatedPreviewCity || activeLocation() || routeHealth?.current_location || report.source;
```

### `handleUpdateShipment` — clears `evaluatedPreviewCity` after commit

```ts
setShipmentUpdated(true);
setEvaluatedPreviewCity('');   // ← new
setLocationMode('estimated');
setSelectedCity('');
setManualLocation('');
fetchRouteHealth(report.id);
onShipmentUpdated?.(updated);
```

### `handleModeChange` — clears `evaluatedPreviewCity` on tab switch

```ts
const handleModeChange = (mode) => {
  setLocationMode(mode);
  setShipmentUpdated(false);
  setEvaluatedPreviewCity('');   // ← reset preview when user switches tabs
  if (mode === 'estimated') { setSelectedCity(''); setManualLocation(''); }
};
```

### Preview panel — shows `evaluatedPreviewCity` + Cancel button

The panel now shows the evaluated city name (not `previewCity` which was the same as `resolvedLocation`). A **Cancel** button dismisses the panel without committing.

---

## Scenario Walkthrough

### Scenario A — Select → Evaluate → Update

```
1. User opens dropdown, selects "Ankleshwar"
   → selectedCity = "Ankleshwar", evaluatedPreviewCity = ""
   → canUpdateShipment = false (not yet evaluated)

2. User clicks "Evaluate"
   → evaluatedPreviewCity = "Ankleshwar"
   → fetchRouteHealth(id, "Ankleshwar") called
   → backend returns preview metrics for Ankleshwar
   → canUpdateShipment = true → panel appears

3. User clicks "Update Shipment"
   → updateShipmentLocation({current_location: "Ankleshwar"})
   → evaluatedPreviewCity = "", locationMode = "estimated"
   → fetchRouteHealth(id) called → shows Ankleshwar as confirmed
   → onShipmentUpdated(updated) called
```

### Scenario B — Select → Evaluate → Do NOT update

```
1. User selects "Ankleshwar" + clicks Evaluate
   → Preview panel appears

2. User closes the panel via Cancel (or navigates away)
   → evaluatedPreviewCity = ""
   → Backend current_location unchanged
   → shipment persists with original location
```

### Scenario C — Persist after refresh

```
1. User updates to Ankleshwar
   → backend writes current_location = "Ankleshwar" + rebase metadata

2. Page refresh
   → report.optimization_result.current_location = "Ankleshwar" (persisted)
   → fetchRouteHealth(id) → resolve_current_location finds rebase anchor
   → confirmed_current_location = "Ankleshwar" shown correctly
```

### Scenario D — Backtrack Karjan → Bharuch

```
1. Current: Karjan (confirmed)
   → confirmed_current_location = "Karjan"

2. User selects "Bharuch" + Evaluate
   → evaluatedPreviewCity = "Bharuch"
   → canUpdateShipment: "Bharuch" !== "Karjan" = true → panel appears
   → metrics show higher ETA, longer remaining distance

3. Update Shipment
   → current_location = "Bharuch", rebase at Bharuch
   → progression continues forward from Bharuch
```

---

## Files Modified

| File | Change |
|---|---|
| `frontend/src/components/planner/RouteHealthCard.tsx` | Added `evaluatedPreviewCity` state; `handleCitySelect` no longer auto-evaluates; `runCheck` sets evaluated city; `canUpdateShipment` uses `evaluatedPreviewCity`; preview panel shows evaluated city + Cancel button |

---

## Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ 16/16 pages |
| Scenario A — Select + Evaluate + Update → location changes | ✅ |
| Scenario B — Select + Evaluate + no click → unchanged | ✅ evaluatedPreviewCity not committed |
| Scenario C — Update + refresh → persists | ✅ backend stores current_location |
| Scenario D — Backtrack Karjan → Bharuch → works | ✅ confirmed_current_location comparison |
| Cancel button dismisses panel without commit | ✅ |
| Switching location tabs resets preview | ✅ handleModeChange clears evaluatedPreviewCity |
