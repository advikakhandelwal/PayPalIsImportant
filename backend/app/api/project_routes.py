"""
TrustPay AI — Project Marketplace API Endpoints
=================================================
Implements:
- GET  /api/projects  (Browse all marketplace project listings)
- POST /api/projects  (Client posts a new project with proposed milestone blueprints)
"""

from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.project import Project, ProjectStatus, ListingType
from app.models.application import Application
from app.schemas.marketplace_schemas import (
    ProjectResponse,
    ProjectCreateRequest,
    MilestoneBlueprintResponse,
)
from app.utils.id_converter import resolve_entity_id
from app.utils.auth import require_client

router = APIRouter(prefix="/api/projects", tags=["Marketplace Projects"])


def _format_project_response(p: Project) -> ProjectResponse:
    """Helper to convert a SQLAlchemy Project model to a clean Pydantic ProjectResponse."""
    # Build milestones list from proposed_milestones JSON blueprint
    blueprint_list = []
    raw_blueprints = p.proposed_milestones or []
    for idx, bm in enumerate(raw_blueprints):
        pct = int(bm.get("percentage", 0))
        amt = float(bm.get("payment_amount") or bm.get("paymentAmount") or round((pct / 100.0) * float(p.total_budget), 2))
        step_num = int(bm.get("step_number") or bm.get("stepNumber") or (idx + 1))
        blueprint_list.append(
            MilestoneBlueprintResponse(
                id=f"ms-{p.id}-{step_num}",
                step_number=step_num,
                title=bm.get("title", f"Milestone {step_num}"),
                description=bm.get("description", ""),
                deliverable_requirements=bm.get("deliverable_requirements") or bm.get("deliverableRequirements") or [],
                percentage=pct,
                payment_amount=amt,
                currency=p.currency,
                deadline=str(bm.get("deadline")) if bm.get("deadline") else None,
                status="ACTIVE" if step_num == 1 else "LOCKED",
            )
        )

    # Compute applications count on the fly
    app_count = len(p.applications) if hasattr(p, "applications") and p.applications else 0

    return ProjectResponse(
        id=str(p.id),
        client_id=str(p.client_id),
        client_name=p.client_name,
        client_company=p.client_company,
        title=p.title,
        domain=p.domain,
        description=p.description,
        total_budget=float(p.total_budget),
        currency=p.currency,
        deadline=p.deadline.isoformat() if p.deadline else None,
        status=p.status,
        created_at=p.created_at.isoformat() if p.created_at else datetime.utcnow().isoformat(),
        applications_count=app_count,
        required_skills=p.required_skills or [],
        experience_level=p.experience_level or "Intermediate",
        additional_requirements=p.additional_requirements,
        milestones=blueprint_list,
    )


@router.get("", response_model=List[ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    """
    Fetch all marketplace project listings.
    Returns project scope, required skills, and proposed milestone blueprints.
    """
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [_format_project_response(p) for p in projects]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreateRequest,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
):
    """
    Post a new project listing with proposed milestone blueprints.
    Requires an authenticated CLIENT. Project ownership is always derived from current_user.id.
    Rejects mismatched client IDs supplied in the request body (SEC-02 IDOR prevention).
    """
    # 1. Ownership & IDOR Validation
    if payload.client_id:
        try:
            resolved_client_id = resolve_entity_id(payload.client_id, "users")
        except HTTPException:
            resolved_client_id = None

        if resolved_client_id is not None and resolved_client_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Mismatched clientId: Request body specified client ID '{payload.client_id}', "
                    f"but authenticated user is ID {current_user.id}. Project ownership must belong to authenticated client."
                ),
            )

    client_user = current_user

    # 2. Financial validation
    if payload.total_budget <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Total budget must be greater than 0.00."
        )

    # 3. Validate proposed milestone blueprints
    compiled_blueprints = []
    if payload.milestones:
        total_pct = sum(m.percentage for m in payload.milestones)
        if total_pct != 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Milestone percentages must sum to exactly 100%, got {total_pct}%."
            )
        for idx, m in enumerate(payload.milestones):
            calc_amt = m.payment_amount or round((m.percentage / 100.0) * payload.total_budget, 2)
            compiled_blueprints.append({
                "step_number": m.step_number or (idx + 1),
                "title": m.title,
                "description": m.description,
                "deliverable_requirements": m.deliverable_requirements,
                "percentage": m.percentage,
                "payment_amount": calc_amt,
                "currency": payload.currency,
                "deadline": m.deadline,
            })

    # 4. Parse optional deadline
    parsed_deadline = None
    if payload.deadline:
        try:
            parsed_deadline = datetime.fromisoformat(payload.deadline.replace("Z", "+00:00"))
        except Exception:
            parsed_deadline = None

    # 5. Persist Project
    new_project = Project(
        client_id=client_user.id,
        client_name=payload.client_name or client_user.name,
        client_company=payload.client_company or client_user.company_name or "Acme Corp",
        title=payload.title.strip(),
        domain=payload.domain,
        description=payload.description.strip(),
        listing_type=ListingType.GIG,
        total_budget=Decimal(str(payload.total_budget)),
        currency=payload.currency,
        deadline=parsed_deadline,
        status=ProjectStatus.OPEN,
        required_skills=payload.required_skills,
        experience_level=payload.experience_level,
        additional_requirements=payload.additional_requirements,
        proposed_milestones=compiled_blueprints,
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    return _format_project_response(new_project)

