import enum
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Enum, Text, JSON, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ApplicationStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class Application(Base):
    __tablename__ = "applications"

    __table_args__ = (
        CheckConstraint("bid_amount >= 0.00", name="check_application_bid_non_negative"),
    )

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Foreign Keys linking to Project and Freelancer
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    freelancer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Denormalized Cache for instant frontend rendering
    freelancer_name = Column(String(120), nullable=False)
    freelancer_domain = Column(String(120), nullable=False)

    # Proposal & Bid Details with Exact Decimal Precision
    cover_letter = Column(Text, nullable=False)
    bid_amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(10), nullable=False, default="USD")
    status = Column(Enum(ApplicationStatus), nullable=False, default=ApplicationStatus.PENDING)

    # Advika's AI Talent Matchmaker Advisory Recommendation
    ai_recommendation = Column(JSON, nullable=True)  # fitScore, domainMatchRate, summaryExplanation

    # Freelancer-submitted profile & CV snapshot (skills, experience, education, cvFile)
    freelancer_profile = Column(JSON, nullable=True)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project = relationship("Project", backref="applications")
    freelancer = relationship("User", backref="applications")

