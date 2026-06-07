import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, JSON, Float, Text, Integer
from sqlalchemy.orm import relationship
from app.config.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    google_id = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    avatar_url = Column(String, nullable=True)
    provider = Column(String, default="google")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    preferences = relationship("UserPreferences", back_populates="user", uselist=False, cascade="all, delete-orphan")
    shipment_reports = relationship("ShipmentReport", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("ShipmentNotification", back_populates="user", cascade="all, delete-orphan")

class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    settings = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="preferences")


class ShipmentReport(Base):
    __tablename__ = "shipment_reports"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String, nullable=False)
    source = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    stops = Column(JSON, default=list)          # list[str] intermediate waypoints
    mode = Column(String, nullable=False)       # road | rail | air | water | hybrid
    cargo_type = Column(String, nullable=True)

    optimization_input = Column(JSON, nullable=True)   # full request payload
    optimization_result = Column(JSON, nullable=True)  # full backend response

    estimated_cost = Column(Float, nullable=True)
    estimated_time = Column(Float, nullable=True)
    risk_score = Column(Float, nullable=True)

    status = Column(String, default="planned")  # draft | planned | active | completed | cancelled

    # Trip lifecycle timestamps
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    expected_end_time = Column(DateTime, nullable=True)
    buffer_minutes = Column(Integer, nullable=True, default=30)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)  # default: 24 h after creation

    user = relationship("User", back_populates="shipment_reports")
    notifications = relationship("ShipmentNotification", back_populates="report", cascade="all, delete-orphan")


class ShipmentNotification(Base):
    __tablename__ = "shipment_notifications"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    report_id = Column(String, ForeignKey("shipment_reports.id", ondelete="CASCADE"), nullable=True)
    type = Column(String, nullable=False)         # trip_started | trip_stopped | trip_cancelled | trip_restarted
    message = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    read = Column(Boolean, default=False)

    user = relationship("User", back_populates="notifications")
    report = relationship("ShipmentReport", back_populates="notifications")

