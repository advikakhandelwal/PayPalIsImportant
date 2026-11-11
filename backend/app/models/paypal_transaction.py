import enum
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Enum, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class PayPalOperationType(str, enum.Enum):
    CREATE_ORDER = "CREATE_ORDER"
    AUTHORIZE_ORDER = "AUTHORIZE_ORDER"
    CAPTURE_MILESTONE = "CAPTURE_MILESTONE"
    PAYOUT = "PAYOUT"
    REFUND = "REFUND"
    VOID_AUTH = "VOID_AUTH"
    WEBHOOK = "WEBHOOK"


class PayPalTxStatus(str, enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class PayPalTransaction(Base):
    """
    Persistent PayPal audit ledger & idempotency registry.
    Records every PayPal Orders v2, Authorizations/Captures, Payouts, Refunds,
    and Webhook event associated with an escrow contract or milestone.
    """
    __tablename__ = "paypal_transactions"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False, index=True)
    milestone_id = Column(Integer, ForeignKey("milestones.id"), nullable=True, index=True)

    operation = Column(Enum(PayPalOperationType), nullable=False, index=True)
    status = Column(Enum(PayPalTxStatus), nullable=False, default=PayPalTxStatus.PENDING)
    idempotency_key = Column(String(140), unique=True, nullable=False, index=True)

    # PayPal Identifiers
    paypal_order_id = Column(String(120), nullable=True, index=True)
    paypal_auth_id = Column(String(120), nullable=True, index=True)
    paypal_capture_id = Column(String(120), nullable=True, index=True)
    paypal_refund_id = Column(String(120), nullable=True, index=True)
    paypal_payout_batch_id = Column(String(120), nullable=True, index=True)
    paypal_debug_id = Column(String(120), nullable=True)

    # Monetary Value
    amount = Column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    currency = Column(String(10), nullable=False, default="USD")

    # Provider mode ("sandbox", "live", "mock") & diagnostics
    mode = Column(String(20), nullable=False, default="sandbox")
    raw_response = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    contract = relationship("Contract", backref="paypal_transactions")
    milestone = relationship("Milestone", backref="paypal_transactions")
