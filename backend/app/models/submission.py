import enum
from sqlalchemy import Column, Integer, String, DateTime, Enum, Text, JSON, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class SubmissionType(str, enum.Enum):
    URL = "URL"
    FILE = "FILE"


class Submission(Base):
    __tablename__ = "submissions"

    __table_args__ = (
        CheckConstraint("ai_score >= 0 AND ai_score <= 100", name="check_submission_ai_score_range"),
    )

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Foreign Key linking to Parent Milestone
    milestone_id = Column(Integer, ForeignKey("milestones.id"), nullable=False, index=True)

    # Deliverable Data (Matches Frontend DeliverableSubmission)
    submission_type = Column(Enum(SubmissionType), nullable=False, default=SubmissionType.URL)
    submission_url = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=True)
    notes = Column(Text, nullable=False, default="Deliverable submitted for milestone review.")

    # Advika's AI Inspection & Security Verification Cache
    ai_score = Column(Integer, nullable=True)                  # 0 to 100
    quality_grade = Column(String(20), nullable=True)          # 'Grade A', 'Grade B', etc.
    ai_verification_report = Column(JSON, nullable=True)        # Checklist, findings, feedback

    # Timestamp
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship back to Milestone
    milestone = relationship("Milestone", backref="submissions")

