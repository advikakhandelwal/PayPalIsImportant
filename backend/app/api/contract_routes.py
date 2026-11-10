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

from typing import Optional, Dict, Any, List
from datetime import datetime
from decimal import Decimal
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.database import get_db
from app.models.user import User
from app.models.project import Project, ProjectStatus
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.models.submission import Submission, SubmissionType, VerificationStatus
from app.schemas.marketplace_schemas import (
    ContractResponse,
    ContractMilestoneResponse,
    DeliverableSubmissionCreate,
    DeliverableSubmissionResponse,
    RevisionRequestCreate,
    RevisionRequestResponse,
)
from app.utils.id_converter import resolve_entity_id
from app.utils.auth import get_current_user
from app.services.ai_service import TrustPayAIService
from app.schemas.ai_schemas import CodeInspectionRequest

logger = logging.getLogger("trustpay.contract_routes")
router = APIRouter(prefix="/api/contracts", tags=["Escrow Contracts"])


def _format_revision_request(rev_dict: Optional[Dict[str, Any]], fallback_id: str) -> Optional[RevisionRequestResponse]:
    """Format stored revision request dictionary into Pydantic model."""
    if not rev_dict or not isinstance(rev_dict, dict):
        return None
    return RevisionRequestResponse(
        id=rev_dict.get("id", fallback_id),
        feedback=rev_dict.get("feedback", ""),
        specific_corrections=rev_dict.get("specificCorrections"),
        additional_instructions=rev_dict.get("additionalInstructions"),
        requested_at=rev_dict.get("requestedAt", datetime.utcnow().isoformat()),
        requested_by=rev_dict.get("requestedBy", "Client"),
    )


def _format_submission_response(sub: Submission) -> DeliverableSubmissionResponse:
    """Format a SQLAlchemy Submission into a DeliverableSubmissionResponse."""
    rev_req = _format_revision_request(getattr(sub, "revision_request", None), f"rev-{sub.id}")

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
        revision_number=getattr(sub, "revision_number", 1) or 1,
        review_status=getattr(sub, "review_status", "IN_REVIEW") or "IN_REVIEW",
        revision_request=rev_req,
    )


def _format_milestone_response(m: Milestone) -> ContractMilestoneResponse:
    """Format a live Contract Milestone with its latest submission and revision history."""
    sorted_subs = sorted(m.submissions, key=lambda s: s.id) if m.submissions else []
    sub_responses = [_format_submission_response(s) for s in sorted_subs]
    latest_sub = sub_responses[-1] if sub_responses else None

    latest_rev = _format_revision_request(getattr(m, "latest_revision_request", None), f"rev-{m.id}")

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
        submission_history=sub_responses,
        latest_revision_request=latest_rev,
        revision_count=getattr(m, "revision_count", 0) or 0,
        max_revisions_reached=getattr(m, "max_revisions_reached", False) or False,
    )


def _format_contract_response(contract: Contract) -> ContractResponse:
    """Format a live SQLAlchemy Contract into ContractResponse with all milestones."""
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


def _trigger_paypal_milestone_capture(
    contract: Contract,
    milestone: Milestone,
) -> Dict[str, Any]:
    """
    ===========================================================================
    INTEGRATION BOUNDARY: Devansh's PayPal Escrow Capture Engine
    ===========================================================================
    Triggered when a milestone transitions to RELEASED and its payment is approved
    by the client.

    RESPONSIBILITIES (Assigned to Devansh):
    1. Retrieve the PayPal authorization ID associated with this contract (`contract.paypal_auth_id`).
    2. Invoke PayPal Orders v2 / Payments v2 API to execute a partial capture
       matching `milestone.amount` and `milestone.currency`.
    3. External capture must be confirmed and verified before treating payment as completed.
    4. Support idempotency keys to safely prevent duplicate capture on network retries.
    5. Handle external payment provider errors (e.g. expired authorization, gateway decline)
       without corrupting internal ledger state; capture failures must not leave the ledger falsely marked.
    6. Record the external capture ID (`paypal_capture_id`) and capture status.

    CURRENT STATUS:
    - Non-blocking integration boundary stub.
    - Database ledger and escrow balances are updated independently within the database transaction.
    - No real PayPal API calls are made here.
    - Does NOT claim or record external payment capture as completed.
    - Production deployment requires Devansh's confirmed PayPal webhook / sync capture implementation.
    ===========================================================================
    """
    logger.info(
        f"[PayPal Integration Hook] Milestone {milestone.id} (Amount: {milestone.amount} {milestone.currency}) "
        f"approved on Contract {contract.id}. Ready for Devansh's PayPal capture implementation."
    )
    return {
        "status": "PENDING_CAPTURE",
        "external_capture_id": None,
        "contract_paypal_auth_id": contract.paypal_auth_id,
        "amount": float(milestone.amount),
        "currency": milestone.currency,
        "note": "Database ledger updated; external PayPal capture hook awaiting Devansh's SDK integration.",
    }


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

    return _format_contract_response(contract)


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

    # Escrow Status Guard: Cannot submit deliverables if escrow is awaiting authorization
    if contract.escrow_status == EscrowStatus.AWAITING_AUTHORIZATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot submit deliverables while contract escrow is awaiting authorization."
        )

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
    # Reject duplicate submission if already IN_REVIEW, as well as LOCKED or RELEASED
    if milestone.status not in (MilestoneStatus.ACTIVE, MilestoneStatus.REVISION_REQUESTED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot submit deliverable for milestone in '{milestone.status.value}' status. "
                "Submissions are only permitted for ACTIVE or REVISION_REQUESTED milestones."
            ),
        )

    # 6. STEP 1: Persist Submission immediately (Zero Data Loss)
    try:
        # Determine revision number based on existing submission history
        existing_subs_count = db.query(Submission).filter(Submission.milestone_id == milestone.id).count()
        rev_number = existing_subs_count + 1

        new_submission = Submission(
            milestone_id=milestone.id,
            submission_type=payload.submission_type,
            submission_url=payload.submission_url.strip(),
            file_name=payload.file_name,
            notes=payload.notes or "Deliverable submitted for milestone review.",
            verification_status=VerificationStatus.PENDING,
            revision_number=rev_number,
            review_status="IN_REVIEW",
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


@router.post("/{contractId}/milestones/{milestoneId}/approve", response_model=ContractResponse)
def approve_milestone(
    contractId: str,
    milestoneId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Approve a completed milestone and release escrow funds.
    Phase 5A Implementation:

    Security & Governance:
    1. Authorization: Only the assigned client can approve milestones and release funds.
       (⚠️ Note: Uses get_current_user dev resolver pending genuine authentication integration).
    2. Hierarchy: Verifies that the milestone strictly belongs to the specified contract.
    3. Status Validation: Only milestones in 'IN_REVIEW' or 'REVISION_REQUESTED' can be approved.
       Already RELEASED milestones are rejected with HTTP 400.
       Invalid state transitions (e.g. LOCKED or ACTIVE without submission) are rejected with HTTP 400.
    4. Financial Integrity & Concurrency Safeguards:
       - Milestone amount is atomically credited to contract.released_amount.
       - Milestone amount is atomically debited from contract.held_in_escrow_amount.
       - Invariants enforced: released_amount <= total_budget, held_in_escrow_amount >= 0.00.
       - Row-level locking via with_for_update() prevents race conditions and double releases in PostgreSQL/MySQL.
         ⚠️ CONCURRENCY LIMITATION NOTE: In local development on SQLite, with_for_update() is a syntax no-op;
         SQLite utilizes database-level write locks rather than row-level locking. True row-level serialization
         relies on a production DBMS (e.g. PostgreSQL).
    5. Sequential State Machine:
       - Immediate next milestone by step_number transitions from LOCKED to ACTIVE.
    6. Contract Completion:
       - If all contract milestones are RELEASED, contract escrow_status -> COMPLETED,
         and associated project status -> COMPLETED.
       - Otherwise, contract escrow_status -> PARTIALLY_RELEASED.
    7. PayPal Integration Boundary:
       - Calls non-blocking hook for Devansh's future PayPal capture engine.
    """
    contract_db_id = resolve_entity_id(contractId, "contracts")
    milestone_db_id = resolve_entity_id(milestoneId, "milestones")

    # 1. Fetch contract with row-level lock
    contract = (
        db.query(Contract)
        .filter(Contract.id == contract_db_id)
        .with_for_update()
        .first()
    )
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contract '{contractId}' not found."
        )

    # 2. Authorization Check: Caller MUST be the assigned client
    if current_user.id != contract.client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the assigned client can approve milestones and release escrow funds."
        )

    # 3. Fetch milestone with row-level lock
    milestone = (
        db.query(Milestone)
        .filter(Milestone.id == milestone_db_id)
        .with_for_update()
        .first()
    )
    if not milestone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Milestone '{milestoneId}' not found."
        )

    # 4. Strict Hierarchy Check
    if milestone.contract_id != contract.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Milestone '{milestoneId}' does not belong to Contract '{contractId}'."
        )

    # 5. Status Validations
    if milestone.status == MilestoneStatus.RELEASED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Milestone '{milestoneId}' has already been RELEASED and paid."
        )

    if milestone.status not in (MilestoneStatus.IN_REVIEW, MilestoneStatus.REVISION_REQUESTED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot approve milestone with status '{milestone.status.value}'. "
                "Approval is only permitted for milestones in 'IN_REVIEW' or 'REVISION_REQUESTED' status."
            )
        )

    # 6. Financial Ledger Invariants
    held = contract.held_in_escrow_amount or Decimal("0.00")
    released = contract.released_amount or Decimal("0.00")
    milestone_amount = Decimal(str(milestone.amount))

    if held < milestone_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient escrow funds: held amount ({held}) is less than milestone amount ({milestone_amount})."
        )

    new_released = released + milestone_amount
    if new_released > contract.total_budget:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Financial integrity violation: releasing {milestone_amount} would cause total released ({new_released}) to exceed contract budget ({contract.total_budget})."
        )

    # 7. Atomic State Transitions & Financial Ledger Update
    try:
        # A. Transition approved milestone to RELEASED
        milestone.status = MilestoneStatus.RELEASED

        # Update latest submission review_status to APPROVED
        if milestone.submissions:
            latest_sub = sorted(milestone.submissions, key=lambda s: s.id)[-1]
            latest_sub.review_status = "APPROVED"

        # B. Financial balances
        contract.released_amount = new_released
        contract.held_in_escrow_amount = held - milestone_amount

        # C. Sequential Unlocking: Find immediate next milestone by step_number
        next_milestone = (
            db.query(Milestone)
            .filter(
                Milestone.contract_id == contract.id,
                Milestone.step_number > milestone.step_number,
            )
            .order_by(Milestone.step_number.asc())
            .with_for_update()
            .first()
        )
        if next_milestone and next_milestone.status == MilestoneStatus.LOCKED:
            next_milestone.status = MilestoneStatus.ACTIVE

        # D. Contract & Project Completion Check
        all_milestones = (
            db.query(Milestone)
            .filter(Milestone.contract_id == contract.id)
            .all()
        )
        all_released = all(m.status == MilestoneStatus.RELEASED for m in all_milestones)

        if all_released:
            contract.escrow_status = EscrowStatus.COMPLETED
            project = db.query(Project).filter(Project.id == contract.project_id).first()
            if project:
                project.status = ProjectStatus.COMPLETED
        else:
            contract.escrow_status = EscrowStatus.PARTIALLY_RELEASED

        # E. PayPal Integration Boundary Hook (Devansh's Scope)
        _trigger_paypal_milestone_capture(contract=contract, milestone=milestone)

        db.commit()
        db.refresh(contract)
        db.refresh(milestone)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as db_exc:
        db.rollback()
        logger.error(f"Failed to execute milestone approval transaction: {db_exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database transaction failed during milestone approval. Changes were safely rolled back."
        )

    return _format_contract_response(contract)


@router.post(
    "/{contractId}/milestones/{milestoneId}/request-revision",
    response_model=ContractMilestoneResponse,
)
def request_milestone_revision(
    contractId: str,
    milestoneId: str,
    payload: RevisionRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Request a revision on a submitted milestone deliverable.
    Phase 5B Implementation:

    Security & Governance:
    1. Authorization: Only the assigned client can request revisions.
    2. Hierarchy: Milestone must strictly belong to the specified contract.
    3. Status Validation: Milestone status must be 'IN_REVIEW'.
       Cannot request revision if milestone is LOCKED, ACTIVE (not yet submitted),
       RELEASED, or already REVISION_REQUESTED.
    4. Revision Limit: Max 3 revisions per milestone.
       If revision_count >= 3 or max_revisions_reached is True, request is rejected with HTTP 400.
    5. State Transition & Record Keeping:
       - Increments revision_count.
       - Sets max_revisions_reached = True if revision_count reaches 3.
       - Milestone status -> REVISION_REQUESTED.
       - Attaches structured RevisionRequest to milestone and latest submission.
       - Sets latest submission review_status -> REVISION_REQUESTED.
    """
    contract_db_id = resolve_entity_id(contractId, "contracts")
    milestone_db_id = resolve_entity_id(milestoneId, "milestones")

    contract = (
        db.query(Contract)
        .filter(Contract.id == contract_db_id)
        .with_for_update()
        .first()
    )
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contract '{contractId}' not found."
        )

    # 1. Authorization: Only assigned client can request revisions
    if current_user.id != contract.client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the assigned client can request revisions on this milestone."
        )

    # 2. Fetch milestone with lock
    milestone = (
        db.query(Milestone)
        .filter(Milestone.id == milestone_db_id)
        .with_for_update()
        .first()
    )
    if not milestone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Milestone '{milestoneId}' not found."
        )

    # 3. Hierarchy check
    if milestone.contract_id != contract.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Milestone '{milestoneId}' does not belong to Contract '{contractId}'."
        )

    # 4. Validate non-empty feedback
    if not payload.feedback or not payload.feedback.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Revision feedback cannot be empty."
        )

    # 5. Status Validations
    if milestone.status == MilestoneStatus.RELEASED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot request revision on milestone '{milestoneId}' because it has already been RELEASED."
        )

    if milestone.status != MilestoneStatus.IN_REVIEW:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot request revision on milestone with status '{milestone.status.value}'. "
                "Revisions can only be requested for milestones in 'IN_REVIEW' status."
            )
        )

    # Submission Existence Guard: Milestone must have an existing deliverable submission to review
    if not milestone.submissions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot request revision: no deliverable has been submitted for this milestone."
        )

    # 6. Revision Limit Enforcement (Max 3)
    current_revs = getattr(milestone, "revision_count", 0) or 0
    if current_revs >= 3 or getattr(milestone, "max_revisions_reached", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum revision limit of 3 has already been reached for this milestone."
        )

    # 7. Record Revision & State Transition
    new_rev_count = current_revs + 1
    rev_id = f"rev-{int(datetime.utcnow().timestamp() * 1000)}"
    rev_record = {
        "id": rev_id,
        "feedback": payload.feedback.strip(),
        "specificCorrections": payload.specific_corrections.strip() if payload.specific_corrections else "",
        "additionalInstructions": payload.additional_instructions.strip() if payload.additional_instructions else "",
        "requestedAt": datetime.utcnow().isoformat(),
        "requestedBy": current_user.name or "Client",
    }

    try:
        milestone.revision_count = new_rev_count
        milestone.max_revisions_reached = (new_rev_count >= 3)
        milestone.latest_revision_request = rev_record
        milestone.status = MilestoneStatus.REVISION_REQUESTED

        # Update latest submission review_status and revision_request
        if milestone.submissions:
            latest_sub = sorted(milestone.submissions, key=lambda s: s.id)[-1]
            latest_sub.review_status = "REVISION_REQUESTED"
            latest_sub.revision_request = rev_record

        db.commit()
        db.refresh(milestone)
    except SQLAlchemyError as db_exc:
        db.rollback()
        logger.error(f"Failed to record revision request: {db_exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database transaction failed during revision request. Changes were safely rolled back."
        )

    return _format_milestone_response(milestone)
