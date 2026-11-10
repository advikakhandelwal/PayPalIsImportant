import enum
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Enum, Text, JSON, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ProjectStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ListingType(str, enum.Enum):
    GIG = "GIG"              # Software, design, writing
    CAMPAIGN = "CAMPAIGN"    # Sponsored creator / influencer campaign


class Project(Base):
    __tablename__ = "projects"

    __table_args__ = (
        CheckConstraint("total_budget >= 0.00", name="check_project_budget_non_negative"),
    )

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Foreign Key linking to the Client (User) who posted the project
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Client metadata cache for quick frontend rendering
    client_name = Column(String(120), nullable=False)
    client_company = Column(String(120), nullable=True)

    # Core Project Details (Matches Frontend Project type)
    title = Column(String(255), nullable=False)
    domain = Column(String(120), nullable=False, default="Full-Stack Development")
    description = Column(Text, nullable=False)
    listing_type = Column(Enum(ListingType), nullable=False, default=ListingType.GIG)

    # Budget & Financials using Numeric(12, 2)
    total_budget = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(10), nullable=False, default="USD")

    # Timeline & Status
    deadline = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(ProjectStatus), nullable=False, default=ProjectStatus.OPEN)

    # Frontend Marketplace Metadata
    required_skills = Column(JSON, nullable=False, default=list)
    experience_level = Column(String(50), nullable=False, default="Intermediate")
    additional_requirements = Column(Text, nullable=True)

    # Milestone Blueprint Roadmap (Proposed milestone scope before contract creation)
    proposed_milestones = Column(JSON, nullable=False, default=list)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship back to the User model
    client = relationship("User", backref="projects")


# Alias for compatibility with blueprint prompt
Listing = Project
