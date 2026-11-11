"""
TrustPay AI — User & Reputation Endpoints (Phase 6)
==================================================
Implements:
- GET /api/users/{userId}/scorecard (Fetch ledger-derived trust scorecard and badges)
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.marketplace_schemas import TrustScorecardData
from app.utils.id_converter import resolve_entity_id
from app.services.reputation_service import calculate_user_reputation

logger = logging.getLogger("trustpay.user_routes")
router = APIRouter(prefix="/api/users", tags=["Users & Reputation"])


@router.get("/{userId}/scorecard", response_model=TrustScorecardData)
def get_user_scorecard(userId: str, db: Session = Depends(get_db)):
    """
    Fetch live, ledger-calculated Trust Scorecard for a user.
    Pure projection: accurately reflects completed projects, earnings, punctuality, compliance, and badges.
    """
    user_db_id = resolve_entity_id(userId, "users")
    user = db.query(User).filter(User.id == user_db_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{userId}' not found."
        )

    rep = calculate_user_reputation(user, db)

    return TrustScorecardData(
        rating=rep["rating"],
        on_time_delivery_rate=rep["on_time_delivery_rate"],
        compliance_score=rep["compliance_score"],
        completed_projects=rep["completed_projects"],
        total_earnings_or_spent=rep["total_earnings_or_spent"],
        currency="USD",
        badges=rep["badges"],
        is_unrated=rep["is_unrated"],
    )

