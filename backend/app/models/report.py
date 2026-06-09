from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Any, Optional


VALID_STATUSES = {"draft", "planned", "active", "completed", "cancelled"}
VALID_MODES = {"road", "rail", "air", "water", "hybrid"}
MAX_REPORTS_PER_USER = 50


class ReportCreateRequest(BaseModel):
    name: str
    parent_report_id: Optional[str] = None
    source: str
    destination: str
    stops: list[str] = []
    mode: str
    cargo_type: Optional[str] = None
    optimization_input: Optional[dict[str, Any]] = None
    optimization_result: Optional[dict[str, Any]] = None
    estimated_cost: Optional[float] = None
    estimated_time: Optional[float] = None
    risk_score: Optional[float] = None
    status: str = "planned"

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Report name is required")
        if len(v) > 120:
            raise ValueError("Report name must be 120 characters or fewer")
        return v

    @field_validator("source")
    @classmethod
    def source_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Source is required")
        return v.strip()

    @field_validator("destination")
    @classmethod
    def destination_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Destination is required")
        return v.strip()

    @field_validator("mode")
    @classmethod
    def mode_valid(cls, v: str) -> str:
        if v not in VALID_MODES:
            raise ValueError(f"mode must be one of {VALID_MODES}")
        return v

    @field_validator("status")
    @classmethod
    def status_valid(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")
        return v


class ReportUpdateRequest(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    # Allow replacing optimization output on regeneration
    optimization_result: Optional[dict[str, Any]] = None
    estimated_cost: Optional[float] = None
    estimated_time: Optional[float] = None
    risk_score: Optional[float] = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Report name cannot be empty")
            if len(v) > 120:
                raise ValueError("Report name must be 120 characters or fewer")
        return v

    @field_validator("status")
    @classmethod
    def status_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")
        return v


class ReportResponse(BaseModel):
    id: str
    user_id: str
    parent_report_id: Optional[str] = None
    name: str
    source: str
    destination: str
    stops: list[str]
    mode: str
    cargo_type: Optional[str]
    optimization_input: Optional[dict[str, Any]]
    optimization_result: Optional[dict[str, Any]]
    estimated_cost: Optional[float]
    estimated_time: Optional[float]
    risk_score: Optional[float]
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    expected_end_time: Optional[datetime] = None
    buffer_minutes: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    expires_at: Optional[datetime]

    class Config:
        from_attributes = True


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    report_id: Optional[str]
    type: str
    message: str
    created_at: datetime
    read: bool

    class Config:
        from_attributes = True


class ReoptimizeRequest(BaseModel):
    current_location: str
    remaining_stops: list[str] = []
    destination: str

    @field_validator("current_location")
    @classmethod
    def current_location_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Current location is required")
        return v.strip()

    @field_validator("destination")
    @classmethod
    def reopt_destination_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Destination is required")
        return v.strip()


class ReoptimizationSaveRequest(BaseModel):
    name: Optional[str] = None
    current_location: str
    remaining_stops: list[str] = []
    destination: str
    recommendation: dict[str, Any]

    @field_validator("name")
    @classmethod
    def revision_name_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Revision name cannot be empty")
        if len(v) > 120:
            raise ValueError("Revision name must be 120 characters or fewer")
        return v

    @field_validator("current_location")
    @classmethod
    def revision_current_location_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Current location is required")
        return v.strip()

    @field_validator("destination")
    @classmethod
    def revision_destination_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Destination is required")
        return v.strip()


class ShipmentLocationUpdateRequest(BaseModel):
    """
    Update Shipment: only the current_location is accepted from the client.
    The backend recomputes all metrics (ETA, cost, risk) itself using the
    existing optimization pipeline. Client-submitted metric values are
    intentionally not accepted to enforce the Single Source of Truth.
    """
    current_location: str

    @field_validator("current_location")
    @classmethod
    def location_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("current_location is required")
        return v.strip()


class AcceptReoptimizationRequest(BaseModel):
    """
    Accept a reoptimization result — replaces the remaining route
    in optimization_result with the alternative route, while preserving
    current_location, progression_base_*, and completed route history.
    """
    optimization_result: dict[str, Any]
    estimated_cost: Optional[float] = None
    estimated_time: Optional[float] = None
    risk_score: Optional[float] = None
