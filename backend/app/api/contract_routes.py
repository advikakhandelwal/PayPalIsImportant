"""
TrustPay AI — Escrow Contract & Deliverable Submission Endpoints
=================================================================
Implements:
- GET  /api/contracts/{id}                                        (Fetch active contract with milestones & submissions)
- POST /api/contracts/{cid}/milestones/{mid}/submit                (Freelancer deliverable submission with decoupled AI audit)
- POST /api/contracts/{cid}/milestones/{mid}/submissions/{sid}/reverify (Idempotent retry for failed AI inspection)

Security & Governance:
- Authorization & Role Separation: Only assigned client or freelancer can view a contract;
  only the assigned freelancer can submit deliverables.
- ⚠️ KNOWN SECURITY LIMITATION & AUTHENTICATION BLOCKER:
  These ownership checks currently rely on caller identity provided by `get_current_user()`,
  which functions as a development placeholder. Until genuine authentication infrastructure
  (cryptographic JWT tokens, secure sessions, or OAuth2) is implemented by the authentication
  owner, these guards enforce business logic and role rules but do not prevent intentional
  header spoofing. Production readiness requires genuine authentication integration.
- Parent-child hierarchy is strictly validated: contract -> milestone -> submission.
- Re-verification is restricted strictly to FAILED submissions.
- AI inspection is explicitly labeled as advisory URL/metadata analysis.
"""

from typing import Optional, Dict, Any
from datetime import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.database import get_db
from app.models.user import User
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.models.submission import Submission, SubmissionType, VerificationStatus
from app.schemas.marketplace_schemas import (
    ContractResponse,
    ContractMilestoneResponse,
    DeliverableSubmissionCreate,
    DeliverableSubmissionResponse,
)
from app.utils.id_converter import resolve_entity_id
from app.utils.auth import get_current_user
from app.services.ai_service import TrustPayAIService
from app.schemas.ai_schemas import CodeInspectionRequest

logger = logging.getLogger("trustpay.contract_routes")
router = APIRouter(prefix="/api/contracts", tags=["Escrow Contracts"])


def _format_submission_response(sub: Submission) -> DeliverableSubmissionResponse:
    """Format a SQLAlchemy Submission into a DeliverableSubmissionResponse."""
    return DeliverableSubmissionResponse(
        id=str(sub.id),
        milestone_id=str(sub.milestone_id),
        submission_type=sub.submission_type,
        submission_url=sub.submission_url,
        file_name=sub.file_name,
        notes=sub.notes,
        verification_status=sub.verification_status,
        ai_score=sub.ai_score,
        quality_grade=sub.quality_grade,
        ai_verification_report=sub.ai_verification_report,
        submitted_at=sub.submitted_at.isoformat() if sub.submitted_at else datetime.utcnow().isoformat(),
    )


def _format_milestone_response(m: Milestone) -> ContractMilestoneResponse:
    """Format a live Contract Milestone with its latest submission."""
    latest_sub = None
    if m.submissions:
        # Latest submission by submitted_at or id
        sorted_subs = sorted(m.submissions, key=lambda s: s.id)
        latest_sub = _format_submission_response(sorted_subs[-1])

    return ContractMilestoneResponse(
        id=str(m.id),
        step_number=m.step_number,
        title=m.title,
        description=m.description,
        deliverable_requirements=m.deliverable_requirements or [],
        payment_amount=float(m.amount),
        percentage=m.percentage,
        currency=m.currency,
        deadline=m.deadline.isoformat() if m.deadline else None,
        status=m.status,
        submission=latest_sub,
    )


def _execute_advisory_inspection(
    submission_url: str,
    submission_type: SubmissionType,
    file_name: Optional[str],
    notes: str,
    milestone_title: str,
    milestone_description: str,
    deliverable_requirements: list,
) -> Dict[str, Any]:
    """
    Executes an advisory AI review of the submitted deliverable metadata.
    Accurately labels the inspection as URL/metadata review, explicitly noting
    that remote source code was not compiled or downloaded into AST.
    """
    ai_service = TrustPayAIService()
    req = CodeInspectionRequest(
        file_name=file_name or "submission_metadata.txt",
        code_content=f"Submission URL: {submission_url}\nNotes: {notes}",
        milestone_spec=f"Title: {milestone_title}\nDescription: {milestone_description}\nRequirements: {deliverable_requirements}",
    )
    res = ai_service.inspect_code_deliverable(req)

    # Truthful, transparent checklist reflecting metadata analysis
    checklist = [
        {
            "criterion": "Deliverable reference URL provided and non-empty",
            "passed": bool(submission_url.strip()),
            "evidenceNotes": f"Target: {submission_url}",
        },
        {
            "criterion": "Submission documentation notes provided",
            "passed": bool(notes and len(notes.strip()) >= 5),
            "evidenceNotes": f"{len(notes.strip()) if notes else 0} characters recorded",
        },
        {
            "criterion": "Deliverable alignment with milestone specifications",
            "passed": res.is_approved,
            "evidenceNotes": f"Advisory evaluation score: {res.score}/100",
        },
        {
            "criterion": "Automated remote repository code compilation / AST inspection",
            "passed": False,
            "evidenceNotes": "Advisory limitation: Remote target files were not fetched or compiled. Full verification requires client review.",
        },
    ]

    return {
        "overallScore": res.score,
        "qualityGrade": res.security_grade.replace("Grade ", "") if res.security_grade else "B",
        "checklist": checklist,
        "missingRequirements": res.failed_checks,
        "feedbackNotes": (
            f"[Advisory URL & Metadata Review] {res.feedback} "
            "Note: This advisory score reflects metadata completeness and criteria alignment. "
            "Remote code was not fetched or compiled."
        ),
        "evaluatedAt": datetime.utcnow().isoformat(),
        "isAdvisoryOnly": True,
    }


@router.get("/{id}", response_model=ContractResponse)
def get_contract(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch active escrow contract by ID.
    Authorization: Caller must be either the assigned Client or assigned Freelancer.
    """
    contract_db_id = resolve_entity_id(id, "contracts")
    contract = db.query(Contract).filter(Contract.id == contract_db_id).first()
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contract with identifier '{id}' not found."
        )

    # Ownership & Authorization Check
    # (Note: Enforces contract ownership logic; relies on get_current_user pending genuine auth from auth owner)
    if current_user.id != contract.client_id and current_user.id != contract.talent_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not authorized to view this contract."
        )

    milestone_responses = [_format_milestone_response(m) for m in contract.milestones]

    return ContractResponse(
        id=str(contract.id),
        project_id=str(contract.project_id),
        project_title=contract.project_title,
        client_id=str(contract.client_id),
        client_name=contract.client_name,
        freelancer_id=str(contract.talent_id),
        freelancer_name=contract.talent_name,
        total_budget=float(contract.total_budget),
        held_in_escrow_amount=float(contract.held_in_escrow_amount or 0.0),
        released_amount=float(contract.released_amount or 0.0),
        currency=contract.currency,
        escrow_status=contract.escrow_status,
        created_at=contract.created_at.isoformat() if contract.created_at else datetime.utcnow().isoformat(),
        milestones=milestone_responses,
    )


@router.post("/{cid}/milestones/{mid}/submit", response_model=DeliverableSubmissionResponse, status_code=status.HTTP_201_CREATED)
def submit_deliverable(
    cid: str,
    mid: str,
    payload: DeliverableSubmissionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit a deliverable for a contract milestone.
    Guarantees:
    1. Authorization: Only the assigned freelancer may submit deliverables.
    2. Deliverable persistence commits immediately to database.
    3. Milestone status transitions safely to IN_REVIEW.
    4. AI evaluation executes in an isolated, fault-tolerant block.
    5. AI findings are purely advisory; no escrow payout or release occurs here.
    """
    contract_db_id = resolve_entity_id(cid, "contracts")
    milestone_db_id = resolve_entity_id(mid, "milestones")

    # 1. Fetch and validate contract
    contract = db.query(Contract).filter(Contract.id == contract_db_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{cid}' not found.")

    # 2. Authorization Check: ONLY assigned freelancer may submit
    # (Note: Enforces talent-only submission guard; relies on get_current_user pending genuine auth from auth owner)
    if current_user.id != contract.talent_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the assigned freelancer can submit deliverables for this contract."
        )

    # 3. Fetch and validate milestone
    milestone = db.query(Milestone).filter(Milestone.id == milestone_db_id).first()
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Milestone '{mid}' not found.")

    # 4. Ownership cross-check: milestone must belong to this contract
    if milestone.contract_id != contract.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Milestone '{mid}' does not belong to Contract '{cid}'."
        )

    # 5. State check: Milestone must be in an actionable state (ACTIVE or REVISION_REQUESTED)
    if milestone.status in [MilestoneStatus.LOCKED, MilestoneStatus.RELEASED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit deliverable for milestone in '{milestone.status}' status."
        )

    # 6. STEP 1: Persist Submission immediately (Zero Data Loss)
    try:
        new_submission = Submission(
            milestone_id=milestone.id,
            submission_type=payload.submission_type,
            submission_url=payload.submission_url.strip(),
            file_name=payload.file_name,
            notes=payload.notes or "Deliverable submitted for milestone review.",
            verification_status=VerificationStatus.PENDING,
        )
        milestone.status = MilestoneStatus.IN_REVIEW
        db.add(new_submission)
        db.commit()
        db.refresh(new_submission)
    except SQLAlchemyError as db_err:
        db.rollback()
        logger.error(f"Database error while saving submission: {db_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save submission due to a database error."
        )

    # 7. STEP 2: Isolated Advisory AI Inspection
    try:
        report = _execute_advisory_inspection(
            submission_url=payload.submission_url,
            submission_type=payload.submission_type,
            file_name=payload.file_name,
            notes=payload.notes or "",
            milestone_title=milestone.title,
            milestone_description=milestone.description,
            deliverable_requirements=milestone.deliverable_requirements or [],
        )
        new_submission.ai_score = report["overallScore"]
        new_submission.quality_grade = f"Grade {report['qualityGrade']}"
        new_submission.ai_verification_report = report
        new_submission.verification_status = VerificationStatus.COMPLETED
        db.commit()
        db.refresh(new_submission)
    except Exception as exc:
        logger.exception(f"AI advisory inspection failed for submission {new_submission.id}")
        try:
            new_submission.verification_status = VerificationStatus.FAILED
            new_submission.ai_verification_report = {
                "error": "AI advisory verification service is temporarily unavailable. Deliverable is saved and eligible for re-verification.",
                "retry_eligible": True,
                "isAdvisoryOnly": True,
                "evaluatedAt": datetime.utcnow().isoformat(),
            }
            db.commit()
            db.refresh(new_submission)
        except SQLAlchemyError as db_exc:
            db.rollback()
            logger.error(f"Failed to record AI failure status on submission: {db_exc}")

    return _format_submission_response(new_submission)


@router.post("/{cid}/milestones/{mid}/submissions/{sid}/reverify", response_model=DeliverableSubmissionResponse)
def reverify_submission(
    cid: str,
    mid: str,
    sid: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Idempotent retry for failed AI inspection without creating duplicate submission records.
    Validation:
    1. Contract must exist and user must be authorized (client or talent).
    2. Milestone must belong to the specified contract.
    3. Submission must belong to the specified milestone.
    4. Only submissions with status FAILED may be re-verified.
    """
    contract_db_id = resolve_entity_id(cid, "contracts")
    milestone_db_id = resolve_entity_id(mid, "milestones")
    sub_db_id = int(sid) if sid.isdigit() else None

    if not sub_db_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid submission ID format.")

    # 1. Fetch and validate contract
    contract = db.query(Contract).filter(Contract.id == contract_db_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{cid}' not found.")

    # Authorization Check: Must be assigned client or freelancer
    # (Note: Enforces participant-only reverify guard; relies on get_current_user pending genuine auth from auth owner)
    if current_user.id != contract.client_id and current_user.id != contract.talent_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not authorized to re-verify deliverables for this contract."
        )

    # 2. Fetch and validate milestone
    milestone = db.query(Milestone).filter(Milestone.id == milestone_db_id).first()
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Milestone '{mid}' not found.")

    # 3. Verify milestone belongs to contract
    if milestone.contract_id != contract.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Milestone '{mid}' does not belong to Contract '{cid}'."
        )

    # 4. Fetch and validate submission
    submission = db.query(Submission).filter(Submission.id == sub_db_id).first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Submission '{sid}' not found.")

    # 5. Verify submission belongs to milestone
    if submission.milestone_id != milestone.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Submission '{sid}' does not belong to Milestone '{mid}'."
        )

    # 6. Re-verification status validation: ONLY FAILED submissions can be reverified
    if submission.verification_status != VerificationStatus.FAILED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot re-verify submission with status '{submission.verification_status.value}'. Re-verification is only allowed for FAILED submissions."
        )

    # 7. Execute Re-verification
    try:
        report = _execute_advisory_inspection(
            submission_url=submission.submission_url,
            submission_type=submission.submission_type,
            file_name=submission.file_name,
            notes=submission.notes or "",
            milestone_title=milestone.title,
            milestone_description=milestone.description,
            deliverable_requirements=milestone.deliverable_requirements or [],
        )
        submission.ai_score = report["overallScore"]
        submission.quality_grade = f"Grade {report['qualityGrade']}"
        submission.ai_verification_report = report
        submission.verification_status = VerificationStatus.COMPLETED
        db.commit()
        db.refresh(submission)
    except Exception as exc:
        logger.exception(f"Re-verification attempt failed for submission {submission.id}")
        try:
            submission.verification_status = VerificationStatus.FAILED
            submission.ai_verification_report = {
                "error": "AI advisory re-verification service is temporarily unavailable. Please retry later.",
                "retry_eligible": True,
                "isAdvisoryOnly": True,
                "evaluatedAt": datetime.utcnow().isoformat(),
            }
            db.commit()
            db.refresh(submission)
        except SQLAlchemyError as db_exc:
            db.rollback()
            logger.error(f"Failed to record re-verification error: {db_exc}")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI advisory re-verification service is temporarily unavailable. Please retry later."
        )

    return _format_submission_response(submission)
