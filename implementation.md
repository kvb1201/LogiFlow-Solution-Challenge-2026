
# Smart Trip Monitoring MVP Implementation

## Architecture Implemented

LogiFlow now extends the existing flow from:

Plan -> Execute

to:

Plan -> Execute -> Monitor -> Reassess

The implementation reuses the current authenticated planner architecture:

- `ShipmentReport` remains the source of truth for saved plans and trip lifecycle state.
- `ShipmentNotification` remains the notification system.
- `planner_routes.py` remains the backend planner API boundary.
- `plannerApi.ts` and `usePlannerStore` remain the frontend API/store integration.
- Report detail pages and the dashboard remain the primary monitoring surfaces.

No duplicate report, trip, route-health, or notification systems were introduced.

## Files Modified

- `backend/app/routes/planner_routes.py`
- `backend/app/services/trip_progress.py`
- `frontend/src/services/plannerApi.ts`
- `frontend/src/store/usePlannerStore.ts`
- `frontend/src/components/auth/Dashboard.tsx`
- `frontend/src/components/planner/ReportDetailPage.tsx`
- `frontend/src/components/planner/RouteHealthCard.tsx`
- `implementation.md`

Local validation also touched `backend/logiflow.db`; temporary validation rows were removed after the API workflow completed.

## Backend Changes

- Replaced the previous route-health placeholder with Smart Trip Monitoring logic.
- Added optional `actual_location` and `current_location` query support to:
  - `GET /planner/reports/{id}/route-health`
- Added notification generation for moderate and at-risk route-health checks.
- Kept trip lifecycle endpoints unchanged and reused:
  - `POST /planner/reports/{id}/execute`
  - `POST /planner/reports/{id}/stop`
  - `POST /planner/reports/{id}/cancel`
  - `POST /planner/reports/{id}/restart`

## Frontend Changes

- Updated `RouteHealthResponse` to match the Smart Trip Monitoring API shape.
- Updated planner store route-health fetching to accept optional actual driver location input.
- Rebuilt `RouteHealthCard` to show:
  - health level
  - progress percentage
  - ETA variance
  - delay risk
  - estimated location
  - actual location
  - deviation level
  - recommended action
- Added route-health controls:
  - Use Estimated Location
  - Enter Current Location
- Added Active Trips section to Dashboard with:
  - shipment name
  - source -> destination
  - mode badge
  - started time
  - ETA
  - progress percentage
  - health badge
  - View Trip action
  - Check Route Health action

## Progress Engine

Added `backend/app/services/trip_progress.py`.

`calculate_trip_progress(started_at, expected_end_time, current_time)` returns:

- `progress_percentage`
- `elapsed_minutes`
- `remaining_minutes`

Rules implemented:

- before start -> `0%`
- after ETA -> `100%`
- progress is always clamped from `0` to `100`
- calculations are reusable and centralized

## Route Health API

`GET /planner/reports/{id}/route-health`

Returns:

- `status`
- `health_level`
- `progress_percentage`
- `eta_variance_minutes`
- `delay_risk`
- `recommended_action`
- `estimated_location`
- `actual_location`
- `deviation_level`
- `deviation_km`
- `checked_at`

Supported values:

- `health_level`: `healthy`, `moderate`, `at_risk`
- `deviation_level`: `none`, `minor`, `major`
- `recommended_action`: `continue`, `monitor`, `reoptimize`

## Estimated Location Logic

Estimated location is computed from:

- report source
- report stops
- report destination
- trip progress percentage

The engine selects the current route segment from the progress percentage and interpolates between waypoint coordinates using the existing offline geocoder/coordinate utilities. If coordinates are unavailable, it still returns a segment label such as `Between Ahmedabad and Jaipur` with low confidence.

## Deviation Detection Logic

Actual driver location is optional and only affects the current route-health evaluation. It does not overwrite the shipment route.

When `actual_location` is provided:

- the city is geocoded through the existing coordinate utility
- distance from estimated location is calculated with haversine distance
- deviation is classified as:
  - `none`: under 50 km
  - `minor`: 50 km to under 150 km
  - `major`: 150 km or more

## Health Scoring Logic

Health is scored from:

- saved report `risk_score`
- deviation level
- overdue minutes past ETA

Output mapping:

- `healthy` + `low` delay risk -> `continue`
- `moderate` + `medium` delay risk -> `monitor`
- `at_risk` + `high` delay risk -> `reoptimize`

Major deviation or significant overdue time forces an at-risk result.

## Notification Integration

Route-health checks reuse `ShipmentNotification`.

When a check returns `moderate` or `at_risk`, the backend creates a notification with:

- report id
- user id
- route-health notification type
- deviation level
- ETA variance

Duplicate unread notifications of the same route-health level are not repeatedly created for the same report.

## Validation Results

Passed:

- `npx tsc --noEmit`
- `npm run build`
- backend startup with FastAPI/Uvicorn
- backend `/health`
- frontend startup with Next dev server
- frontend `/login` HTTP 200

Validated authenticated API flow:

- Login/session validation via JWT session path: `200`
- Save Report: `201`, report created as `planned`
- Execute Trip: `200`, report became `active`
- Active Trips Dashboard data: active report returned by planner listing
- Route Health using estimated location: `healthy`, `continue`
- Estimated Location: returned `Between Ahmedabad and Jaipur`
- Actual Location Input with `Mumbai`: accepted and evaluated
- Deviation Detection with `Mumbai`/`Kolkata`: `major`
- Health Scoring: major deviation produced `at_risk`, `high`, `reoptimize`
- Notification Generation: route-health notification created

Note: Real Google OAuth token exchange was not exercised locally because no live Google credential was available. The protected app session path was validated with the same JWT format produced after OAuth login.

## Known Limitations

- Estimated location is time-progress based, not GPS based.
- Deviation detection depends on city-level geocoding accuracy.
- ETA variance is heuristic and does not yet include live traffic/weather feeds.
- Dashboard health badges use saved risk as an immediate summary; detailed route health is evaluated on the report detail route-health API.
- Notifications are poll/read based; no WebSocket or SSE real-time delivery is implemented.
- Production database migrations are still not introduced; the app continues using existing startup metadata creation.
