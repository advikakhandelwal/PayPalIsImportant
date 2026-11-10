import enum
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Enum, Text, JSON, ForeignKey, CheckConstraint, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class MilestoneStatus(str, enum.Enum):
    LOCKED = "LOCKED"
    ACTIVE = "ACTIVE"
    SUBMITTED = "SUBMITTED"
    IN_REVIEW = "IN_REVIEW"
    REVISION_REQUESTED = "REVISION_REQUESTED"
    DISPUTED = "DISPUTED"
    RELEASED = "RELEASED"

    # Alias for compatibility with AI blueprint
    VERIFYING = "IN_REVIEW"


class Milestone(Base):
    __tablename__ = "milestones"

    # Database-level integrity constraints
    __table_args__ = (
        CheckConstraint("step_number >= 1", name="check_milestone_step_number_positive"),
        CheckConstraint("percentage >= 1 AND percentage <= 100", name="check_milestone_percentage_range"),
        CheckConstraint("amount >= 0.00", name="check_milestone_amount_non_negative"),
    )

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Foreign Key linking to Parent Contract
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False, index=True)

    # Milestone Sequence & Scope
    step_number = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    deliverable_requirements = Column(JSON, nullable=False, default=list)

    # Financial Weight & Exact Amount
    percentage = Column(Integer, nullable=False)              # e.g. 30 (for 30%)
    amount = Column(Numeric(12, 2), nullable=False)          # e.g. Decimal("1200.00")
    currency = Column(String(10), nullable=False, default="USD")

    # Timeline & Sequential State Machine
    deadline = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(MilestoneStatus), nullable=False, default=MilestoneStatus.LOCKED)

    # Revision Limit & Feedback Tracking (Phase 5B)
    revision_count = Column(Integer, nullable=False, default=0)
    max_revisions_reached = Column(Boolean, nullable=False, default=False)
    latest_revision_request = Column(JSON, nullable=True)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship back to Parent Contract
    contract = relationship("Contract", back_populates="milestones")

    @classmethod
    def create_step(
        cls,
        contract_id: int,
        step_number: int,
        title: str,
        description: str,
        percentage: int,
        total_budget: Decimal,
        deliverable_requirements: list = None,
        currency: str = "USD",
        deadline=None,
    ):
        """
        Factory helper that enforces initial activation:
        - Step 1 initializes to ACTIVE.
        - Step 2+ initializes to LOCKED.
        """
        initial_status = MilestoneStatus.ACTIVE if step_number == 1 else MilestoneStatus.LOCKED
        calc_amount = round((Decimal(percentage) / Decimal(100)) * total_budget, 2)

        return cls(
            contract_id=contract_id,
            step_number=step_number,
            title=title,
            description=description,
            deliverable_requirements=deliverable_requirements or [],
            percentage=percentage,
            amount=calc_amount,
            currency=currency,
            deadline=deadline,
            status=initial_status,
        )
