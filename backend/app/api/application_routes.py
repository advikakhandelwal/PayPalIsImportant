"""
TrustPay AI — Application & Proposal API Endpoints
===================================================
Implements Phase 5C:
- GET  /api/projects/{projectId}/applications              (Client inbox of candidate proposals & scorecards)
- POST /api/projects/{projectId}/applications              (Freelancer proposal submission)
- POST /api/projects/{projectId}/applications/{aid}/accept (Client accepts proposal -> instantiates EscrowContract + Milestones)
- POST /api/projects/{projectId}/applications/{aid}/reject (Client rejects proposal)
- POST /api/applications/{aid}/accept                      (Direct alias for application acceptance)
- POST /api/applications/{aid}/reject                      (Direct alias for application rejection)
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from decimal import Decimal
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.database import get_db
from app.models.user import User, UserRole
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.models.project import Project, ProjectStatus
from app.models.application import Application, ApplicationStatus
from app.schemas.marketplace_schemas import (
    ApplicationResponse,
    ApplicationCreateRequest,
    TrustScorecardData,
    ContractResponse,
)
from app.utils.id_converter import resolve_entity_id
from app.utils.auth import get_current_user
from app.api.contract_routes import _format_contract_response

logger = logging.getLogger("trustpay.application_routes")
router = APIRouter(prefix="/api/projects", tags=["Project Applications"])
apps_router = APIRouter(prefix="/api/applications", tags=["Applications Direct"])


def _trigger_paypal_escrow_order(
    contract: Contract,
) -> Dict[str, Any]:
    """
    ===========================================================================
    INTEGRATION BOUNDARY: Devansh's PayPal Escrow Authorization Engine
    ===========================================================================
    Triggered when an application is accepted and a new Escrow Contract is created.

    RESPONSIBILITIES (Assigned to Devansh):
    1. Invoke PayPal Orders v2 API to create an order with intent: "AUTHORIZE".
    2. Obtain the authorization approval URL and return it to the client for funding.
    3. On authorization capture/approval, store the auth ID in `contract.paypal_auth_id`
       and transition escrow_status to `HELD_IN_ESCROW`.

    CURRENT STATUS:
    - Non-blocking integration boundary stub.
    - Contract and milestones are created in the database ledger.
    - No real PayPal API calls are executed here.
    ===========================================================================
    """
    logger.info(
        f"[PayPal Integration Hook] Contract {contract.id} created for Project {contract.project_id}. "
        f"Ready for Devansh's PayPal escrow order authorization."
    )
    return {
        "status": "AWAITING_PAYPAL_AUTHORIZATION",
        "contract_id": contract.id,
        "amount": float(contract.total_budget),
        "currency": contract.currency,
        "note": "Contract instantiated in database; external PayPal authorization awaiting Devansh's SDK integration.",
    }


def _format_application_response(app: Application) -> ApplicationResponse:
    """Format a SQLAlchemy Application into an ApplicationResponse with nested trustScorecard."""
    freelancer = app.freelancer

    has_ratings = bool(freelancer and freelancer.rating is not None and freelancer.rating > 0.0)
    scorecard = TrustScorecardData(
        rating=float(freelancer.rating) if has_ratings else None,
        on_time_delivery_rate=int(freelancer.on_time_rate) if freelancer and freelancer.on_time_rate is not None else None,
        compliance_score=int(freelancer.compliance_score) if freelancer and freelancer.compliance_score is not None else 100,
        completed_projects=int(freelancer.completed_projects) if freelancer and freelancer.completed_projects is not None else 0,
        total_earnings_or_spent=float(freelancer.total_earnings_or_spent) if freelancer and freelancer.total_earnings_or_spent is not None else 0.0,
        currency=app.currency or "USD",
        badges=freelancer.badges if freelancer and freelancer.badges else [],
        is_unrated=not has_ratings,
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
def get_project_applications(
    projectId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch applications for a project (Client Applicant Inbox).
    Security & Privacy (SEC-04):
    - Strictly requires authentication (401 for unauthenticated).
    - Clients see applications ONLY for projects they own. Cross-client access is rejected with 403.
    - Freelancers see ONLY their own submitted applications (never competing applicants).
    - Unauthorized roles receive 403 Forbidden.
    """
    cleaned = projectId.strip().lower()

    if cleaned == "all":
        if current_user.role == UserRole.CLIENT:
            # Client sees applications for projects they own
            client_project_ids = [p.id for p in db.query(Project.id).filter(Project.client_id == current_user.id).all()]
            applications = (
                db.query(Application)
                .filter(Application.project_id.in_(client_project_ids))
                .order_by(Application.created_at.desc())
                .all()
            )
            return [_format_application_response(a) for a in applications]
        elif current_user.role in (UserRole.FREELANCER, UserRole.INFLUENCER):
            # Freelancer sees only their own applications across all projects
            applications = (
                db.query(Application)
                .filter(Application.freelancer_id == current_user.id)
                .order_by(Application.created_at.desc())
                .all()
            )
            return [_format_application_response(a) for a in applications]
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized role for application inbox.",
            )

    project_db_id = resolve_entity_id(projectId, "projects")
    project = db.query(Project).filter(Project.id == project_db_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID '{projectId}' not found."
        )

    # Role privacy check
    if current_user.role == UserRole.CLIENT:
        if project.client_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You can only view applications for projects you own."
            )
        applications = (
            db.query(Application)
            .filter(Application.project_id == project.id)
            .order_by(Application.created_at.desc())
            .all()
        )
        return [_format_application_response(a) for a in applications]

    elif current_user.role in (UserRole.FREELANCER, UserRole.INFLUENCER):
        # Freelancers can only inspect their own application on a project
        applications = (
            db.query(Application)
            .filter(
                Application.project_id == project.id,
                Application.freelancer_id == current_user.id,
            )
            .order_by(Application.created_at.desc())
            .all()
        )
        return [_format_application_response(a) for a in applications]
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized role for project applications.",
        )


@router.post(
    "/{projectId}/applications",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_application(
    projectId: str,
    payload: ApplicationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit a proposal / application for an open project.
    Phase 5C Implementation.
    """
    project_db_id = resolve_entity_id(projectId, "projects")
    project = db.query(Project).filter(Project.id == project_db_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{projectId}' not found."
        )

    # 1. Project must be OPEN
    if project.status != ProjectStatus.OPEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot apply to project with status '{project.status.value}'. Applications are only accepted for OPEN projects."
        )

    # 2. Prevent client from applying to own project
    if project.client_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Clients cannot apply to their own project listings."
        )

    # 3. Role check: only FREELANCER or INFLUENCER can apply
    if current_user.role not in (UserRole.FREELANCER, UserRole.INFLUENCER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User '{current_user.name}' has role '{current_user.role.value}'. Only FREELANCERs can submit project proposals."
        )

    # 4. Duplicate proposal check
    existing = (
        db.query(Application)
        .filter(
            Application.project_id == project.id,
            Application.freelancer_id == current_user.id,
            Application.status.in_([ApplicationStatus.PENDING, ApplicationStatus.ACCEPTED]),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already submitted an active proposal for this project."
        )

    # 5. Financial & input validation
    if payload.bid_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bid amount must be greater than 0.00."
        )

    if not payload.cover_letter or not payload.cover_letter.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cover letter cannot be empty."
        )

    # 6. Advika AI Advisory Fit Score (Advisory Integration Hook)
    # ⚠️ PLACEHOLDER: This is a static demo scorecard. Advika's AI fit-score engine
    # will replace this with live candidate-project matching analysis.
    advisory_recommendation = {
        "fitScore": 92,
        "domainMatchRate": 95,
        "summaryExplanation": f"Candidate profile matches {project.domain}. Verified rating: {current_user.rating}/5.0.",
        "isTopPick": True,
        "isPlaceholder": True,
        "note": "Advisory demo placeholder — pending Advika's AI fit-score engine integration.",
    }

    new_app = Application(
        project_id=project.id,
        freelancer_id=current_user.id,
        freelancer_name=current_user.name,
        freelancer_domain=current_user.domain or "Full-Stack Development",
        cover_letter=payload.cover_letter.strip(),
        bid_amount=Decimal(str(payload.bid_amount)),
        currency=payload.currency or project.currency,
        status=ApplicationStatus.PENDING,
        ai_recommendation=advisory_recommendation,
    )
    db.add(new_app)
    db.commit()
    db.refresh(new_app)

    return _format_application_response(new_app)


def _execute_application_acceptance(
    project: Project,
    application: Application,
    current_user: User,
    db: Session,
) -> ContractResponse:
    """Internal helper to atomically execute application acceptance and contract instantiation."""
    # 1. Ownership check: Only project owner client can accept
    if project.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the client who posted the project can accept applications."
        )

    # 2. Hierarchy check
    if application.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Application '{application.id}' does not belong to Project '{project.id}'."
        )

    # 3. Status check
    if application.status != ApplicationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot accept application with status '{application.status.value}'. Only PENDING applications can be accepted."
        )

    # 4. Duplicate contract check
    existing_contract = (
        db.query(Contract)
        .filter(
            Contract.project_id == project.id,
            Contract.talent_id == application.freelancer_id,
        )
        .first()
    )
    if existing_contract:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An active contract already exists for this freelancer on Project '{project.id}'."
        )

    try:
        # A. Mark application as ACCEPTED
        application.status = ApplicationStatus.ACCEPTED

        # B. Reject all other PENDING applications for this project
        other_apps = (
            db.query(Application)
            .filter(
                Application.project_id == project.id,
                Application.id != application.id,
                Application.status == ApplicationStatus.PENDING,
            )
            .all()
        )
        for other in other_apps:
            other.status = ApplicationStatus.REJECTED

        # C. Transition project to IN_PROGRESS
        project.status = ProjectStatus.IN_PROGRESS

        # D. Instantiate Contract
        # ⚠️ Escrow starts as AWAITING_AUTHORIZATION with zero held funds.
        # Devansh's PayPal integration will transition to HELD_IN_ESCROW after
        # the client authorizes/funds the escrow via PayPal.
        agreed_budget = application.bid_amount
        new_contract = Contract(
            project_id=project.id,
            client_id=project.client_id,
            talent_id=application.freelancer_id,
            project_title=project.title,
            client_name=project.client_name,
            talent_name=application.freelancer_name,
            total_budget=agreed_budget,
            held_in_escrow_amount=Decimal("0.00"),
            released_amount=Decimal("0.00"),
            currency=application.currency or project.currency,
            escrow_status=EscrowStatus.AWAITING_AUTHORIZATION,
            paypal_auth_id=None,
        )
        db.add(new_contract)
        db.flush()

        # E. Instantiate Milestones from Project's proposed blueprints
        blueprints = project.proposed_milestones or []
        if blueprints:
            # E.1 Validate blueprints before creating milestones
            step_numbers = []
            total_pct = 0
            for idx, bp in enumerate(blueprints):
                step_num = bp.get("step_number") or (idx + 1)
                pct = bp.get("percentage") or (100 if len(blueprints) == 1 else 0)
                if step_num < 1:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid milestone step_number ({step_num}): must be >= 1.",
                    )
                if pct < 1:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid milestone percentage ({pct}%): must be >= 1.",
                    )
                if step_num in step_numbers:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Duplicate milestone step_number: {step_num}.",
                    )
                step_numbers.append(step_num)
                total_pct += pct

            if total_pct != 100:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Milestone percentages must sum to 100%, got {total_pct}%.",
                )

            # E.2 Calculate milestone amounts with rounding remainder correction
            milestone_specs = []
            running_total = Decimal("0.00")
            for idx, bp in enumerate(blueprints):
                step_num = bp.get("step_number") or (idx + 1)
                pct = bp.get("percentage") or (100 if len(blueprints) == 1 else 0)
                amt = round((Decimal(pct) / Decimal(100)) * agreed_budget, 2)
                running_total += amt
                milestone_specs.append((step_num, pct, amt, bp))

            # Apply rounding remainder to last milestone so sum matches budget exactly
            remainder = agreed_budget - running_total
            if remainder != Decimal("0.00") and milestone_specs:
                last = milestone_specs[-1]
                milestone_specs[-1] = (last[0], last[1], last[2] + remainder, last[3])

            # E.3 Create milestones — ALL start LOCKED while escrow is AWAITING_AUTHORIZATION.
            # When Devansh's PayPal auth succeeds and escrow transitions to HELD_IN_ESCROW,
            # step 1 should be activated externally.
            for step_num, pct, amt, bp in milestone_specs:
                m = Milestone(
                    contract_id=new_contract.id,
                    step_number=step_num,
                    title=bp.get("title", f"Milestone {step_num}"),
                    description=bp.get("description", "Deliverable milestone requirements."),
                    deliverable_requirements=bp.get("deliverable_requirements") or [],
                    percentage=pct,
                    amount=amt,
                    currency=new_contract.currency,
                    status=MilestoneStatus.LOCKED,
                    revision_count=0,
                    max_revisions_reached=False,
                )
                db.add(m)
        else:
            # Single-milestone fallback — also LOCKED pending escrow authorization
            m = Milestone(
                contract_id=new_contract.id,
                step_number=1,
                title="Full Project Deliverable",
                description="Complete deliverables for project scope.",
                deliverable_requirements=[],
                percentage=100,
                amount=agreed_budget,
                currency=new_contract.currency,
                status=MilestoneStatus.LOCKED,
                revision_count=0,
                max_revisions_reached=False,
            )
            db.add(m)

        # F. PayPal Integration Hook (Devansh's Scope)
        _trigger_paypal_escrow_order(new_contract)

        db.commit()
        db.refresh(new_contract)
    except SQLAlchemyError as db_err:
        db.rollback()
        logger.error(f"Failed to instantiate contract on application accept: {db_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to instantiate contract and milestones. Transaction rolled back."
        )

    return _format_contract_response(new_contract)


def _execute_application_rejection(
    project: Project,
    application: Application,
    current_user: User,
    db: Session,
) -> ApplicationResponse:
    """Internal helper to atomically execute application rejection."""
    if project.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the client who posted the project can reject applications."
        )

    if application.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Application '{application.id}' does not belong to Project '{project.id}'."
        )

    if application.status != ApplicationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject application with status '{application.status.value}'. Only PENDING applications can be rejected."
        )

    application.status = ApplicationStatus.REJECTED
    db.commit()
    db.refresh(application)

    return _format_application_response(application)


@router.post(
    "/{projectId}/applications/{applicationId}/accept",
    response_model=ContractResponse,
)
def accept_application_project_route(
    projectId: str,
    applicationId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Client accepts an applicant proposal via /api/projects/{projectId}/applications/{aid}/accept."""
    project_db_id = resolve_entity_id(projectId, "projects")
    app_db_id = resolve_entity_id(applicationId, "applications")

    project = db.query(Project).filter(Project.id == project_db_id).with_for_update().first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{projectId}' not found.")

    application = db.query(Application).filter(Application.id == app_db_id).with_for_update().first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Application '{applicationId}' not found.")

    return _execute_application_acceptance(project, application, current_user, db)


@router.post(
    "/{projectId}/applications/{applicationId}/reject",
    response_model=ApplicationResponse,
)
def reject_application_project_route(
    projectId: str,
    applicationId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Client rejects an applicant proposal via /api/projects/{projectId}/applications/{aid}/reject."""
    project_db_id = resolve_entity_id(projectId, "projects")
    app_db_id = resolve_entity_id(applicationId, "applications")

    project = db.query(Project).filter(Project.id == project_db_id).with_for_update().first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{projectId}' not found.")

    application = db.query(Application).filter(Application.id == app_db_id).with_for_update().first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Application '{applicationId}' not found.")

    return _execute_application_rejection(project, application, current_user, db)


@apps_router.post(
    "/{applicationId}/accept",
    response_model=ContractResponse,
)
def accept_application_direct_route(
    applicationId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Direct alias: Client accepts an applicant proposal via /api/applications/{aid}/accept."""
    app_db_id = resolve_entity_id(applicationId, "applications")

    application = db.query(Application).filter(Application.id == app_db_id).with_for_update().first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Application '{applicationId}' not found.")

    project = db.query(Project).filter(Project.id == application.project_id).with_for_update().first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found.")

    return _execute_application_acceptance(project, application, current_user, db)


@apps_router.post(
    "/{applicationId}/reject",
    response_model=ApplicationResponse,
)
def reject_application_direct_route(
    applicationId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Direct alias: Client rejects an applicant proposal via /api/applications/{aid}/reject."""
    app_db_id = resolve_entity_id(applicationId, "applications")

    application = db.query(Application).filter(Application.id == app_db_id).with_for_update().first()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Application '{applicationId}' not found.")

    project = db.query(Project).filter(Project.id == application.project_id).with_for_update().first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found.")

    return _execute_application_rejection(project, application, current_user, db)


