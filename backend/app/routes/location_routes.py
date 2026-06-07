from fastapi import APIRouter, Query

from app.services.location_funnel import resolve_location

location_router = APIRouter(prefix="/locations", tags=["locations"])


@location_router.get("/resolve")
def resolve_place(place: str = Query(..., min_length=1, max_length=80)):
    """Resolve a city name or station code to canonical pipeline inputs."""
    return resolve_location(place).to_dict()


@location_router.get("/resolve-pair")
def resolve_pair(
    source: str = Query(..., min_length=1, max_length=80),
    destination: str = Query(..., min_length=1, max_length=80),
):
    src = resolve_location(source)
    dst = resolve_location(destination)
    return {"source": src.to_dict(), "destination": dst.to_dict()}
