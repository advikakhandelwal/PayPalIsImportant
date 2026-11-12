from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    user_role = Column(String(40), nullable=False)
    event = Column(String(80), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    link_href = Column(String(300), nullable=False, default="/")
    entity_id = Column(String(160), nullable=True, index=True)
    is_read = Column(Boolean, nullable=False, default=False)
    is_dismissed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
