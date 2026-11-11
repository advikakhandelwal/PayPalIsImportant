from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ContractMessage(Base):
    """
    Persistent direct messaging thread scoped to an active Escrow Contract
    between the assigned Client and Freelancer/Influencer.
    """
    __tablename__ = "contract_messages"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sender_name = Column(String(120), nullable=False)
    sender_role = Column(String(30), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contract = relationship("Contract", backref="messages")
    sender = relationship("User")
