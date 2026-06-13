# TODO - Air optimize 500 fix

## Plan (implementation steps)
1. Patch `backend/app/services/air_timezone_service.py` / time-parsing to avoid invalid schedule timestamps.
2. Patch `backend/app/pipelines/air/pipeline.py` to harden `_engineer_features` and `otp_prediction` field access (KeyError/TypeError → route-level fallback).
3. Patch `backend/app/routes/air_routes.py` to return the pipeline `error` payload text in `detail` for easier debugging.
4. Run backend unit tests / a minimal smoke run for the `/air/optimize` endpoint.

Progress: Not started

