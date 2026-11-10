"""
TrustPay AI — Application & Proposal API Endpoints
===================================================
Implements:
- GET /api/projects/{projectId}/applications  (Client inbox of candidate proposals & scorecards)
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.application import Application
from app.models.project import Project
from app.schemas.marketplace_schemas import (
    ApplicationResponse,
    TrustScorecardData,
)
from app.utils.id_converter import resolve_entity_id

router = APIRouter(prefix="/api/projects", tags=["Project Applications"])


def _format_application_response(app: Application) -> ApplicationResponse:
    """Format a SQLAlchemy Application into an ApplicationResponse with nested trustScorecard."""
    freelancer = app.freelancer

    scorecard = TrustScorecardData(
        rating=float(freelancer.rating) if freelancer and freelancer.rating is not None else 5.0,
        on_time_delivery_rate=int(freelancer.on_time_rate) if freelancer and freelancer.on_time_rate is not None else 100,
        compliance_score=int(freelancer.compliance_score) if freelancer and freelancer.compliance_score is not None else 100,
        completed_projects=int(freelancer.completed_projects) if freelancer and freelancer.completed_projects is not None else 0,
        total_earnings_or_spent=float(freelancer.total_earnings_or_spent) if freelancer and freelancer.total_earnings_or_spent is not None else 0.0,
        currency=app.currency or "USD",
        badges=freelancer.badges if freelancer and freelancer.badges else [],
    )

    return ApplicationResponse(
        id=str(app.id),
        project_id=str(app.project_id),
        freelancer_id=str(app.freelancer_id),
        freelancer_name=app.freelancer_name,
        freelancer_domain=app.freelancer_domain,
        cover_letter=app.cover_letter,
        bid_amount=float(app.bid_amount),
        currency=app.currency,
        status=app.status,
        created_at=app.created_at.isoformat() if app.created_at else datetime.utcnow().isoformat(),
        trust_scorecard=scorecard,
        ai_recommendation=app.ai_recommendation,
    )


@router.get("/{projectId}/applications", response_model=List[ApplicationResponse])
def get_project_applications(projectId: str, db: Session = Depends(get_db)):
    """
    Fetch applications for a project (Client Applicant Inbox).
    Supports:
    - Specific project query (e.g. 'proj-101' or '1')
    - 'all' query: Returns all applications across listings (for Client Overview Proposals tab)
    """
    cleaned = projectId.strip().lower()

    if cleaned == "all":
        # Multi-project inbox for client dashboard overview
        applications = db.query(Application).order_by(Application.created_at.desc()).all()
        return [_format_application_response(a) for a in applications]

    # Specific project lookup
    project_db_id = resolve_entity_id(projectId, "projects")
    project = db.query(Project).filter(Project.id == project_db_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID '{projectId}' not found."
        )

    applications = db.query(Application).filter(
        Application.project_id == project.id
    ).order_by(Application.created_at.desc()).all()

    return [_format_application_response(a) for a in applications]

