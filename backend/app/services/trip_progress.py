from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from typing import Optional

from app.models.domain import ShipmentReport
from app.utils.coordinates import get_coords


@dataclass(frozen=True)
class TripProgress:
    progress_percentage: float
    elapsed_minutes: int
    remaining_minutes: int


@dataclass(frozen=True)
class LocationEstimate:
    label: str
    latitude: Optional[float]
    longitude: Optional[float]
    segment_start: str
    segment_end: str
    confidence: str


def calculate_trip_progress(
    started_at: Optional[datetime],
    expected_end_time: Optional[datetime],
    current_time: Optional[datetime] = None,
) -> TripProgress:
    now = current_time or datetime.utcnow()
    if not started_at or not expected_end_time:
        return TripProgress(progress_percentage=0.0, elapsed_minutes=0, remaining_minutes=0)

    total_seconds = max((expected_end_time - started_at).total_seconds(), 1)
    elapsed_seconds = (now - started_at).total_seconds()

    if elapsed_seconds <= 0:
        progress = 0.0
    elif now >= expected_end_time:
        progress = 100.0
    else:
        progress = (elapsed_seconds / total_seconds) * 100

    return TripProgress(
        progress_percentage=round(min(100.0, max(0.0, progress)), 1),
        elapsed_minutes=max(0, int(elapsed_seconds // 60)),
        remaining_minutes=max(0, int((expected_end_time - now).total_seconds() // 60)),
    )


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    radius_km = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    x = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return 2 * radius_km * asin(sqrt(x))


def estimate_trip_location(report: ShipmentReport, progress_percentage: float) -> LocationEstimate:
    waypoints = [report.source, *(report.stops or []), report.destination]
    if len(waypoints) < 2:
        return LocationEstimate(
            label=report.source or report.destination or "Unknown",
            latitude=None,
            longitude=None,
            segment_start=report.source or "Unknown",
            segment_end=report.destination or "Unknown",
            confidence="low",
        )

    clamped = min(100.0, max(0.0, progress_percentage))
    segment_count = len(waypoints) - 1
    scaled = (clamped / 100.0) * segment_count
    segment_index = min(segment_count - 1, int(scaled))
    segment_ratio = 1.0 if clamped >= 100 else scaled - segment_index

    start_name = waypoints[segment_index]
    end_name = waypoints[segment_index + 1]
    start_coords = get_coords(start_name)
    end_coords = get_coords(end_name)

    label = end_name if clamped >= 100 else f"Between {start_name} and {end_name}"
    if start_coords and end_coords:
        lat = start_coords[0] + (end_coords[0] - start_coords[0]) * segment_ratio
        lng = start_coords[1] + (end_coords[1] - start_coords[1]) * segment_ratio
        return LocationEstimate(
            label=label,
            latitude=round(lat, 5),
            longitude=round(lng, 5),
            segment_start=start_name,
            segment_end=end_name,
            confidence="medium",
        )

    return LocationEstimate(
        label=label,
        latitude=None,
        longitude=None,
        segment_start=start_name,
        segment_end=end_name,
        confidence="low",
    )


def evaluate_route_health(
    report: ShipmentReport,
    actual_location_name: Optional[str] = None,
    current_time: Optional[datetime] = None,
) -> dict:
    now = current_time or datetime.utcnow()
    progress = calculate_trip_progress(report.started_at, report.expected_end_time, now)
    estimated = estimate_trip_location(report, progress.progress_percentage)

    actual_location = None
    deviation_km: Optional[float] = None
    deviation_level = "none"
    if actual_location_name and actual_location_name.strip():
        actual_coords = get_coords(actual_location_name.strip())
        actual_location = {
            "label": actual_location_name.strip(),
            "latitude": round(actual_coords[0], 5) if actual_coords else None,
            "longitude": round(actual_coords[1], 5) if actual_coords else None,
            "confidence": "medium" if actual_coords else "low",
        }
        if actual_coords and estimated.latitude is not None and estimated.longitude is not None:
            deviation_km = round(
                _haversine_km(actual_coords, (estimated.latitude, estimated.longitude)),
                1,
            )
            if deviation_km >= 150:
                deviation_level = "major"
            elif deviation_km >= 50:
                deviation_level = "minor"

    overdue_minutes = 0
    if report.expected_end_time and now > report.expected_end_time:
        overdue_minutes = int((now - report.expected_end_time).total_seconds() // 60)

    base_risk = min(1.0, max(0.0, float(report.risk_score or 0.15)))
    total_minutes = 0
    if report.started_at and report.expected_end_time:
        total_minutes = max(1, int((report.expected_end_time - report.started_at).total_seconds() // 60))

    eta_variance_minutes = overdue_minutes
    if deviation_level == "minor":
        eta_variance_minutes += max(15, int(total_minutes * 0.05))
    elif deviation_level == "major":
        eta_variance_minutes += max(60, int(total_minutes * 0.15))

    risk_points = base_risk
    if deviation_level == "minor":
        risk_points += 0.2
    elif deviation_level == "major":
        risk_points += 0.45
    if overdue_minutes > 0:
        risk_points += min(0.35, overdue_minutes / 240)

    if risk_points >= 0.65 or deviation_level == "major" or overdue_minutes >= 60:
        health_level = "at_risk"
        delay_risk = "high"
        recommended_action = "reoptimize"
    elif risk_points >= 0.35 or deviation_level == "minor" or overdue_minutes >= 15:
        health_level = "moderate"
        delay_risk = "medium"
        recommended_action = "monitor"
    else:
        health_level = "healthy"
        delay_risk = "low"
        recommended_action = "continue"

    return {
        "status": report.status,
        "health_level": health_level,
        "progress_percentage": progress.progress_percentage,
        "elapsed_minutes": progress.elapsed_minutes,
        "remaining_minutes": progress.remaining_minutes,
        "eta_variance_minutes": eta_variance_minutes,
        "delay_risk": delay_risk,
        "recommended_action": recommended_action,
        "estimated_location": {
            "label": estimated.label,
            "latitude": estimated.latitude,
            "longitude": estimated.longitude,
            "segment_start": estimated.segment_start,
            "segment_end": estimated.segment_end,
            "confidence": estimated.confidence,
        },
        "actual_location": actual_location,
        "deviation_level": deviation_level,
        "deviation_km": deviation_km,
        "checked_at": now.isoformat(),
    }
