# Google OAuth Audience Mismatch — Fix Implementation

## Root Cause

`backend/app/services/auth_service.py` previously resolved `GOOGLE_CLIENT_ID` at
**module import time** using a module-level constant:

```python
# OLD — resolved once at import, before load_dotenv() could fire in some paths
GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID", dev_default="local-dev.apps.googleusercontent.com")
```

When anything (tests, hot-reload, direct module import) caused `auth_service` to be
imported before `main.py` had called `load_dotenv()`, `os.getenv("GOOGLE_CLIENT_ID")`
returned `None` and the placeholder `local-dev.apps.googleusercontent.com` was baked
in permanently for the lifetime of that Python process.

Google was issuing tokens for the **real** client ID
`1007508154155-vveq29qevc09gn2haneo1bosoakq9eu1.apps.googleusercontent.com`, so every
verification call failed with:

```
Token has wrong audience 1007508154155-... expected one of ['local-dev.apps.googleusercontent.com']
```

---

## Configuration Source (before fix)

| Location | Key | Value |
|---|---|---|
| `backend/.env` | `GOOGLE_CLIENT_ID` | `1007508154155-...` (correct) |
| `frontend/.env.local` | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `1007508154155-...` (correct) |
| `auth_service.py` module-level | `GOOGLE_CLIENT_ID` | `local-dev.apps.googleusercontent.com` (wrong — placeholder fallback) |

The `.env` value was correct all along. The bug was in when the env var was read.

---

## Audience Validation Flow (after fix)

```
POST /auth/login  {credential: "<google JWT>"}
        │
        ▼
verify_google_token(credential)
        │
        ├─ _get_allowed_audiences()          ← called at request time, not import time
        │     1. GOOGLE_ALLOWED_CLIENT_IDS   (comma-separated list, takes priority)
        │     2. GOOGLE_CLIENT_ID            (single ID, backward compat)
        │     3. [] + actionable error       (dev: fails fast with helpful message)
        │
        ├─ for each audience in list:
        │     google.oauth2.id_token.verify_oauth2_token(credential, Request(), audience)
        │     → success: return id_info
        │     → ValueError: log mismatch, try next
        │
        └─ all failed:
              _extract_token_audience(credential)  ← decode without verifying signature
              logger.warning(received_audience, allowed_count)
              raise ValueError with actionable message
```

---

## Environment Handling

### Local development
```
backend/.env          → GOOGLE_CLIENT_ID=1007508154155-...
frontend/.env.local   → NEXT_PUBLIC_GOOGLE_CLIENT_ID=1007508154155-...
```
Both sides use the same real client ID. No placeholder.

### Multi-environment (optional)
If separate OAuth clients are needed per environment:
```
# backend/.env or Render env vars
GOOGLE_ALLOWED_CLIENT_IDS=<local-client-id>,<prod-client-id>
```
`_get_allowed_audiences()` splits by comma and tries each in order.

### Production (Render)
`RENDER=true` is set automatically by Render. If neither `GOOGLE_ALLOWED_CLIENT_IDS`
nor `GOOGLE_CLIENT_ID` is set, the app raises `RuntimeError` at startup to prevent a
silently broken OAuth flow from reaching users.

---

## Changes Made

### `backend/app/services/auth_service.py`

1. **Removed module-level `GOOGLE_CLIENT_ID` constant** — audience is now resolved
   inside `verify_google_token()` on every request via `_get_allowed_audiences()`.

2. **Added `_get_allowed_audiences() -> list[str]`** — reads env vars at call time,
   supports comma-separated `GOOGLE_ALLOWED_CLIENT_IDS` as the primary source and
   falls back to `GOOGLE_CLIENT_ID` for backward compatibility.

3. **Multi-audience loop** — iterates over all allowed audiences and returns on first
   successful verification. This prevents future mismatch issues when running multiple
   OAuth clients.

4. **Structured logging** — `logger.warning` on rejection includes `received_audience`
   (extracted without trusting the unverified payload for auth) and `allowed_count`.
   Audience values are truncated to 20 chars in debug logs to avoid secret leakage.

5. **`_extract_token_audience(credential)`** — safely decodes the JWT payload without
   signature verification, used only for diagnostic logging on failure.

6. **Actionable error messages** — `ValueError` now names both env files to check, so
   any future mismatch can be resolved without reading source code.

---

## Validation Results

| Check | Result |
|---|---|
| `backend/.env` `GOOGLE_CLIENT_ID` | ✅ matches frontend client ID |
| `frontend/.env.local` `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | ✅ matches backend client ID |
| Python syntax check | ✅ `Syntax OK` |
| `npx tsc --noEmit` | ✅ No errors |
| No hardcoded client IDs in business logic | ✅ All env-driven |
| Email/password auth unchanged | ✅ `create_access_token` / `decode_access_token` untouched |
| Production guard | ✅ `RuntimeError` raised if no client ID in production |
