from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class Dispute(Base):
    __tablename__ = "disputes"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String(100), unique=True, index=True, nullable=False)
    contract_id = Column(Integer, ForeignKey("contracts.id"), unique=True, index=True, nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    freelancer_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    status = Column(String(60), nullable=False, default="OPEN")
    data = Column(JSON, nullable=False)  # Full DisputeCase payload for shared client/freelancer state
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
