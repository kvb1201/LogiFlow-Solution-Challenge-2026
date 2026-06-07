# LogiFlow Implementation — Shipment Reports, Trip Lifecycle, Route Health & Notifications

## Architecture Implemented

The implementation extends LogiFlow's existing multimodal freight optimization platform with a complete shipment planning lifecycle:

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐ │
│  │ Dashboard │  │ Reports  │  │  Detail   │  │  NavBar    │ │
│  │  Section  │  │   Page   │  │   Page    │  │  Notif.    │ │
│  └──────────┘  └──────────┘  └───────────┘  └────────────┘ │
│       │              │             │               │         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              usePlannerStore (Zustand)                  │ │
│  │  reports · trip lifecycle · route health · notifications│ │
│  └────────────────────────────────────────────────────────┘ │
│       │              │             │               │         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           plannerApi.ts (apiClient + JWT)               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                    /api/* → rewrite
                           │
┌─────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              planner_routes.py                          │ │
│  │  CRUD · execute · stop · cancel · restart               │ │
│  │  route-health · notifications                           │ │
│  └────────────────────────────────────────────────────────┘ │
│       │                                                      │
│  ┌────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ShipmentReport│ │ShipmentNotification│ │ User (extended)│  │
│  └────────────┘  └──────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Files Modified

### Backend

| File | Change |
|------|--------|
| `backend/app/models/domain.py` | Added `started_at`, `completed_at`, `expected_end_time`, `buffer_minutes` to `ShipmentReport`. Added `ShipmentNotification` model. Added `notifications` relationship to `User`. |
| `backend/app/models/report.py` | Extended `ReportResponse` with trip lifecycle fields. Added `NotificationResponse` schema. |
| `backend/app/routes/planner_routes.py` | Added trip lifecycle endpoints (execute, stop, cancel, restart), route-health placeholder, notification CRUD endpoints. Auto-generates notifications on trip state changes. |

### Frontend

| File | Change |
|------|--------|
| `frontend/src/services/api.ts` | Added `HybridPayload` interface. Added `water` to `best_per_mode` type. Extended `HybridModeRoute` with `time`, `cost`, `geometry` fields. |
| `frontend/src/components/ComparatorPageClient.tsx` | Removed unsafe `as` type assertions — now uses typed field access. |
| `frontend/src/services/plannerApi.ts` | Added `executeTrip`, `stopTrip`, `cancelTrip`, `restartTrip`, `getRouteHealth`, notification API functions. Extended `ShipmentReport` type with lifecycle fields. |
| `frontend/src/store/usePlannerStore.ts` | Added trip lifecycle actions, route health state, notification state management. |
| `frontend/src/components/planner/ReportDetailPage.tsx` | Added trip lifecycle buttons (Execute, Stop, Cancel, Restart), route health card, trip timing display. |
| `frontend/src/components/planner/RouteHealthCard.tsx` | **[NEW]** Route health display card with healthy/moderate/at-risk states. |
| `frontend/src/components/planner/NotificationBell.tsx` | **[NEW]** Notification bell with unread badge, dropdown panel, mark-read functionality. |
| `frontend/src/components/NavBar.tsx` | Added "My Plans" link for authenticated users. Replaced placeholder Bell with `NotificationBell`. |

## Backend APIs Added

### Trip Lifecycle

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/planner/reports/{id}/execute` | POST | Start a planned trip → status becomes `active`, records `started_at`, calculates `expected_end_time` with buffer |
| `/planner/reports/{id}/stop` | POST | Complete an active trip → status becomes `completed`, records `completed_at` |
| `/planner/reports/{id}/cancel` | POST | Cancel a trip → status becomes `cancelled` |
| `/planner/reports/{id}/restart` | POST | Restart a completed/cancelled trip → status becomes `active` again |

### Route Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/planner/reports/{id}/route-health` | GET | Returns placeholder route health data (score, delay estimate, health level, recommended action) |

### Notifications

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/planner/notifications` | GET | List user's notifications (newest first, limit 50) |
| `/planner/notifications/unread-count` | GET | Get count of unread notifications |
| `/planner/notifications/{id}/read` | POST | Mark a single notification as read |
| `/planner/notifications/read-all` | POST | Mark all notifications as read |

## Database Models Added

### ShipmentReport (extended)

New columns:
- `started_at` (DateTime, nullable) — when trip was started
- `completed_at` (DateTime, nullable) — when trip was completed
- `expected_end_time` (DateTime, nullable) — calculated ETA with buffer
- `buffer_minutes` (Integer, nullable, default=30) — buffer time in minutes

### ShipmentNotification (new)

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (PK) | UUID |
| `user_id` | String (FK → users) | Owner |
| `report_id` | String (FK → shipment_reports, nullable) | Related report |
| `type` | String | Event type: `trip_started`, `trip_stopped`, `trip_cancelled`, `trip_restarted` |
| `message` | String | Human-readable notification message |
| `created_at` | DateTime | Creation timestamp |
| `read` | Boolean | Whether the user has read this notification |

## Frontend Pages/Components Added

### RouteHealthCard
- Fetches route health from the API on mount
- Displays health level with appropriate visual treatment:
  - **Healthy** (≥75% score): Green, check_circle icon
  - **Moderate** (50-74% score): Amber, warning icon
  - **At Risk** (<50% score): Red, error icon
- Shows estimated delay, recommended action, last check time

### NotificationBell
- Unread badge with count (9+ overflow)
- Dropdown panel with notification list
- Trip lifecycle notifications with appropriate icons and colors
- Click-to-navigate to related report
- Mark individual or all notifications as read

## Shipment Report Flow

1. User optimizes a route on any pipeline page (road, rail, air, water, hybrid)
2. Clicks **Save Report** → `SaveReportModal` opens with pre-filled data
3. Report saves via `POST /planner/reports` → appears in Dashboard and My Plans
4. User can view, rename, delete, or regenerate reports
5. Expiration badges show when plans are >24h old

## Execute Trip Flow

1. From report detail page, user clicks **Execute Trip** (available for `planned`/`draft`)
2. Backend sets status to `active`, records `started_at`, calculates `expected_end_time`
3. Notification auto-generated: "Trip X has been started"
4. Report detail shows trip timing info and **Route Health** card
5. User can click **Check Route Health** to refresh health data
6. User clicks **Stop Trip** to mark as `completed`
7. User can **Restart Trip** from completed/cancelled state

## Route Health Framework

- Placeholder implementation using report risk score with deterministic jitter
- Returns: `status`, `current_route_score`, `recommended_action`, `estimated_delay`, `health_level`
- Frontend displays as a themed card with healthy/moderate/at-risk states
- Ready for integration with live weather, traffic, and delay APIs

## Notification Framework

- Notifications auto-generated on trip lifecycle events
- Stored in `shipment_notifications` table
- Frontend polls unread count on page load
- Bell icon in NavBar shows unread badge
- Dropdown panel lists notifications with mark-read
- No real-time WebSocket yet — poll-based refresh

## Build Verification Results

```
$ npx tsc --noEmit
# Clean — no errors

$ npm run build
✓ Compiled successfully in 2.1s
✓ TypeScript clean in 2.7s
✓ 16/16 static pages generated
```

All routes render correctly:
- `/` — Home
- `/dashboard` — Dashboard with reports section
- `/reports` — My Plans page with filters
- `/reports/[id]` — Report detail with trip lifecycle
- All pipeline pages (road, rail, air, water, hybrid, comparator)

## Remaining Limitations

1. **Route Health**: Uses placeholder calculations. Needs integration with live weather, traffic, and delay APIs for production accuracy.
2. **Notifications**: Poll-based only. WebSocket/SSE real-time notifications not yet implemented.
3. **Trip restart**: Currently resets the trip entirely. A true "resume from current location" would need GPS/location integration.
4. **Database migrations**: Uses `create_all` on startup. For production, use Alembic migrations for schema changes.
5. **Notification cleanup**: No auto-expiry for old notifications. Could add a cleanup job.
