import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, JSON, Text
from sqlalchemy.sql import func
from app.database import Base


class UserRole(str, enum.Enum):
    CLIENT = "CLIENT"
    FREELANCER = "FREELANCER"
    INFLUENCER = "INFLUENCER"


class User(Base):
    __tablename__ = "users"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Authentication & Basic Profile
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.FREELANCER)

    # Extended Profile (Matches Frontend UserProfile)
    domain = Column(String(120), nullable=True, default="General")
    bio = Column(Text, nullable=True)
    company_name = Column(String(120), nullable=True)

    # Trust & Performance Scorecard Metrics
    trust_score = Column(Float, nullable=False, default=100.0)
    rating = Column(Float, nullable=False, default=5.0)
    on_time_rate = Column(Integer, nullable=False, default=100)
    compliance_score = Column(Integer, nullable=False, default=100)
    completed_projects = Column(Integer, nullable=False, default=0)
    total_earnings_or_spent = Column(Float, nullable=False, default=0.0)
    badges = Column(JSON, nullable=False, default=list)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())

