import enum
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Enum, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class EscrowStatus(str, enum.Enum):
    AWAITING_AUTHORIZATION = "AWAITING_AUTHORIZATION"
    HELD_IN_ESCROW = "HELD_IN_ESCROW"
    PARTIALLY_RELEASED = "PARTIALLY_RELEASED"
    COMPLETED = "COMPLETED"
    DISPUTED = "DISPUTED"
    REFUNDED = "REFUNDED"


class Contract(Base):
    __tablename__ = "contracts"

    # Database-level financial integrity checks
    __table_args__ = (
        CheckConstraint("total_budget >= 0.00", name="check_contract_budget_non_negative"),
        CheckConstraint("held_in_escrow_amount >= 0.00", name="check_contract_held_non_negative"),
        CheckConstraint("released_amount >= 0.00", name="check_contract_released_non_negative"),
    )

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Foreign Keys linking to Project, Client, and Talent
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    talent_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Denormalized Cache for instant frontend rendering
    project_title = Column(String(255), nullable=False)
    client_name = Column(String(120), nullable=False)
    talent_name = Column(String(120), nullable=False)

    # Exact Financial Ledger using Numeric(12, 2)
    total_budget = Column(Numeric(12, 2), nullable=False)
    held_in_escrow_amount = Column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    released_amount = Column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    currency = Column(String(10), nullable=False, default="USD")
    escrow_status = Column(Enum(EscrowStatus), nullable=False, default=EscrowStatus.AWAITING_AUTHORIZATION)

    # Devansh's PayPal Hooks
    paypal_auth_id = Column(String(120), nullable=True, index=True)
    paypal_capture_id = Column(String(120), nullable=True)

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project = relationship("Project", backref="contracts")
    client = relationship("User", foreign_keys=[client_id], backref="client_contracts")
    talent = relationship("User", foreign_keys=[talent_id], backref="talent_contracts")
    milestones = relationship(
        "Milestone",
        back_populates="contract",
        order_by="Milestone.step_number"
    )

    def can_be_deleted(self) -> bool:
        """
        Fintech Safety Guard:
        Prevents deletion of any contract with locked escrow or payment history.
        """
        held = self.held_in_escrow_amount or Decimal("0.00")
        released = self.released_amount or Decimal("0.00")
        if self.paypal_auth_id or held > Decimal("0.00") or released > Decimal("0.00"):
            return False
        return self.escrow_status == EscrowStatus.AWAITING_AUTHORIZATION

    def validate_milestones_total(self) -> bool:
        """
        Application-Level Validator:
        Ensures all milestone percentages total exactly 100% and amounts match total_budget.
        """
        if not self.milestones:
            return False
        total_percentage = sum(m.percentage for m in self.milestones)
        total_amount = sum(m.amount for m in self.milestones)
        if total_percentage != 100:
            raise ValueError(f"Milestones must sum to 100%, got {total_percentage}%")
        if abs(total_amount - self.total_budget) > Decimal("0.01"):
            raise ValueError(f"Milestone amounts (${total_amount}) must equal total budget (${self.total_budget})")
        return True
