from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from app.models.domain import ShipmentReport, ShipmentNotification, User
from app.models.report import (
    ReportCreateRequest,
    ReportUpdateRequest,
    ReportResponse,
    NotificationResponse,
    MAX_REPORTS_PER_USER,
)
from app.config.database import get_db
from app.dependencies import get_current_user
from app.services.trip_progress import evaluate_route_health

router = APIRouter(prefix="/planner", tags=["planner"])

REPORT_TTL_HOURS = 24


def _report_to_response(r: ShipmentReport) -> ReportResponse:
    return ReportResponse(
        id=r.id,
        user_id=r.user_id,
        name=r.name,
        source=r.source,
        destination=r.destination,
        stops=r.stops or [],
        mode=r.mode,
        cargo_type=r.cargo_type,
        optimization_input=r.optimization_input,
        optimization_result=r.optimization_result,
        estimated_cost=r.estimated_cost,
        estimated_time=r.estimated_time,
        risk_score=r.risk_score,
        status=r.status,
        started_at=r.started_at,
        completed_at=r.completed_at,
        expected_end_time=r.expected_end_time,
        buffer_minutes=r.buffer_minutes,
        created_at=r.created_at,
        updated_at=r.updated_at,
        expires_at=r.expires_at,
    )


async def _create_notification(
    db: AsyncSession,
    user_id: str,
    report_id: str,
    ntype: str,
    message: str,
) -> ShipmentNotification:
    """Create a notification record for trip lifecycle events."""
    notif = ShipmentNotification(
        user_id=user_id,
        report_id=report_id,
        type=ntype,
        message=message,
        created_at=datetime.utcnow(),
        read=False,
    )
    db.add(notif)
    return notif


# ── POST /planner/reports ─────────────────────────────────────────────

@router.post("/reports", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    body: ReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new shipment report for the authenticated user."""

    # Enforce per-user report limit
    count_result = await db.execute(
        select(func.count()).select_from(ShipmentReport).where(
            ShipmentReport.user_id == current_user.id
        )
    )
    count = count_result.scalar_one()
    if count >= MAX_REPORTS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Report limit reached ({MAX_REPORTS_PER_USER}). Delete older reports to save new ones.",
        )

    now = datetime.utcnow()
    report = ShipmentReport(
        user_id=current_user.id,
        name=body.name,
        source=body.source,
        destination=body.destination,
        stops=body.stops,
        mode=body.mode,
        cargo_type=body.cargo_type,
        optimization_input=body.optimization_input,
        optimization_result=body.optimization_result,
        estimated_cost=body.estimated_cost,
        estimated_time=body.estimated_time,
        risk_score=body.risk_score,
        status=body.status,
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(hours=REPORT_TTL_HOURS),
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return _report_to_response(report)


# ── GET /planner/reports ──────────────────────────────────────────────

@router.get("/reports", response_model=list[ReportResponse])
async def list_reports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all reports owned by the authenticated user, newest first."""
    result = await db.execute(
        select(ShipmentReport)
        .where(ShipmentReport.user_id == current_user.id)
        .order_by(ShipmentReport.created_at.desc())
    )
    reports = result.scalars().all()
    return [_report_to_response(r) for r in reports]


# ── GET /planner/reports/{id} ─────────────────────────────────────────

@router.get("/reports/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a single report. 404 if not found, 403 if owned by another user."""
    result = await db.execute(
        select(ShipmentReport).where(ShipmentReport.id == report_id)
    )
    report = result.scalars().first()

    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return _report_to_response(report)


# ── PUT /planner/reports/{id} ─────────────────────────────────────────

@router.put("/reports/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: str,
    body: ReportUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update report metadata (name, status) or replace optimization output
    when the user regenerates a plan.
    """
    result = await db.execute(
        select(ShipmentReport).where(ShipmentReport.id == report_id)
    )
    report = result.scalars().first()

    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    now = datetime.utcnow()

    if body.name is not None:
        report.name = body.name
    if body.status is not None:
        report.status = body.status
    if body.optimization_result is not None:
        # Regeneration — replace result and reset expiry
        report.optimization_result = body.optimization_result
        report.expires_at = now + timedelta(hours=REPORT_TTL_HOURS)
    if body.estimated_cost is not None:
        report.estimated_cost = body.estimated_cost
    if body.estimated_time is not None:
        report.estimated_time = body.estimated_time
    if body.risk_score is not None:
        report.risk_score = body.risk_score

    report.updated_at = now

    await db.commit()
    await db.refresh(report)
    return _report_to_response(report)


# ── DELETE /planner/reports/{id} ──────────────────────────────────────

@router.delete("/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently delete a report."""
    result = await db.execute(
        select(ShipmentReport).where(ShipmentReport.id == report_id)
    )
    report = result.scalars().first()

    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await db.delete(report)
    await db.commit()


# ── Trip Lifecycle Endpoints ──────────────────────────────────────────

async def _get_owned_report(
    report_id: str,
    db: AsyncSession,
    current_user: User,
) -> ShipmentReport:
    """Helper: fetch a report and verify ownership."""
    result = await db.execute(
        select(ShipmentReport).where(ShipmentReport.id == report_id)
    )
    report = result.scalars().first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return report


@router.post("/reports/{report_id}/execute", response_model=ReportResponse)
async def execute_trip(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a planned trip — sets status to 'active', records started_at, calculates expected end."""
    report = await _get_owned_report(report_id, db, current_user)

    if report.status not in ("planned", "draft"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot execute a trip with status '{report.status}'. Must be 'planned' or 'draft'.",
        )

    now = datetime.utcnow()
    report.status = "active"
    report.started_at = now
    report.completed_at = None

    # Calculate expected end time from estimated_time (hours) + buffer
    buffer = report.buffer_minutes or 30
    estimated_hours = report.estimated_time or 24
    report.expected_end_time = now + timedelta(hours=estimated_hours, minutes=buffer)
    report.updated_at = now

    # Create notification
    await _create_notification(
        db, current_user.id, report.id,
        "trip_started",
        f"Trip '{report.name}' ({report.source} → {report.destination}) has been started.",
    )

    await db.commit()
    await db.refresh(report)
    return _report_to_response(report)


@router.post("/reports/{report_id}/stop", response_model=ReportResponse)
async def stop_trip(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an active trip as completed."""
    report = await _get_owned_report(report_id, db, current_user)

    if report.status != "active":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot stop a trip with status '{report.status}'. Must be 'active'.",
        )

    now = datetime.utcnow()
    report.status = "completed"
    report.completed_at = now
    report.updated_at = now

    await _create_notification(
        db, current_user.id, report.id,
        "trip_stopped",
        f"Trip '{report.name}' has been completed successfully.",
    )

    await db.commit()
    await db.refresh(report)
    return _report_to_response(report)


@router.post("/reports/{report_id}/cancel", response_model=ReportResponse)
async def cancel_trip(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel a trip (from any non-completed state)."""
    report = await _get_owned_report(report_id, db, current_user)

    if report.status in ("completed",):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot cancel a completed trip.",
        )

    now = datetime.utcnow()
    report.status = "cancelled"
    report.updated_at = now

    await _create_notification(
        db, current_user.id, report.id,
        "trip_cancelled",
        f"Trip '{report.name}' has been cancelled.",
    )

    await db.commit()
    await db.refresh(report)
    return _report_to_response(report)


@router.post("/reports/{report_id}/restart", response_model=ReportResponse)
async def restart_trip(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restart a completed or cancelled trip — re-activates it."""
    report = await _get_owned_report(report_id, db, current_user)

    if report.status not in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot restart a trip with status '{report.status}'. Must be 'completed' or 'cancelled'.",
        )

    now = datetime.utcnow()
    report.status = "active"
    report.started_at = now
    report.completed_at = None

    buffer = report.buffer_minutes or 30
    estimated_hours = report.estimated_time or 24
    report.expected_end_time = now + timedelta(hours=estimated_hours, minutes=buffer)
    report.updated_at = now

    await _create_notification(
        db, current_user.id, report.id,
        "trip_restarted",
        f"Trip '{report.name}' has been restarted.",
    )

    await db.commit()
    await db.refresh(report)
    return _report_to_response(report)


# ── Smart Route Health ────────────────────────────────────────────────

@router.get("/reports/{report_id}/route-health")
async def get_route_health(
    report_id: str,
    actual_location: str | None = Query(default=None),
    current_location: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluate trip progress and route health.

    actual_location/current_location is used only for this health check and is
    not persisted to the shipment report.
    """
    report = await _get_owned_report(report_id, db, current_user)

    driver_location = actual_location or current_location
    health = evaluate_route_health(report, driver_location)

    if health["health_level"] in {"moderate", "at_risk"}:
        existing_result = await db.execute(
            select(ShipmentNotification).where(
                ShipmentNotification.user_id == current_user.id,
                ShipmentNotification.report_id == report.id,
                ShipmentNotification.type == f"route_health_{health['health_level']}",
                ShipmentNotification.read == False,
            )
        )
        existing = existing_result.scalars().first()
        if not existing:
            detail = (
                f"Deviation: {health['deviation_level']}; "
                f"ETA variance: {health['eta_variance_minutes']} min."
            )
            await _create_notification(
                db,
                current_user.id,
                report.id,
                f"route_health_{health['health_level']}",
                f"Route health for '{report.name}' is {health['health_level'].replace('_', ' ')}. {detail}",
            )
            await db.commit()

    return {
        "report_id": report.id,
        "mode": report.mode,
        "source": report.source,
        "destination": report.destination,
        **health,
    }


# ── Notifications ────────────────────────────────────────────────────

@router.get("/notifications", response_model=list[NotificationResponse])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all notifications for the authenticated user, newest first."""
    result = await db.execute(
        select(ShipmentNotification)
        .where(ShipmentNotification.user_id == current_user.id)
        .order_by(ShipmentNotification.created_at.desc())
        .limit(50)
    )
    notifs = result.scalars().all()
    return notifs


@router.get("/notifications/unread-count")
async def unread_notification_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the count of unread notifications."""
    result = await db.execute(
        select(func.count()).select_from(ShipmentNotification).where(
            ShipmentNotification.user_id == current_user.id,
            ShipmentNotification.read == False,
        )
    )
    count = result.scalar_one()
    return {"unread_count": count}


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a single notification as read."""
    result = await db.execute(
        select(ShipmentNotification).where(ShipmentNotification.id == notification_id)
    )
    notif = result.scalars().first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    if notif.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    notif.read = True
    await db.commit()
    return {"status": "ok"}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all notifications as read for the authenticated user."""
    result = await db.execute(
        select(ShipmentNotification).where(
            ShipmentNotification.user_id == current_user.id,
            ShipmentNotification.read == False,
        )
    )
    notifs = result.scalars().all()
    for n in notifs:
        n.read = True
    await db.commit()
    return {"status": "ok", "marked": len(notifs)}
