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
import os
import sys
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.database import get_db
from app.models.user import User, UserRole
from app.models.project import Project, ProjectStatus
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.models.submission import Submission, SubmissionType, VerificationStatus
from app.models.contract_message import ContractMessage
from app.schemas.marketplace_schemas import (
    ContractResponse,
    ContractMilestoneResponse,
    DeliverableSubmissionCreate,
    DeliverableSubmissionResponse,
    RevisionRequestCreate,
    RevisionRequestResponse,
    ContractReviewRequest,
    ContractReviewResponse,
    ContractMessageCreate,
    ContractMessageResponse,
    MessageThreadSummary,
    OverrideReleaseRequest,
)
from app.utils.id_converter import resolve_entity_id
from app.utils.auth import get_current_user
from app.core.security import verify_password
from app.services.ai_service import TrustPayAIService
from app.schemas.ai_schemas import CodeInspectionRequest
from app.models.paypal_transaction import (
    PayPalOperationType,
    PayPalTransaction,
    PayPalTxStatus,
)
from app.services.paypal_service import (
    PayPalError,
    PayPalService,
    PayPalTransientError,
    build_idempotency_key,
    resolve_talent_payout_email,
)

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
    proj = getattr(contract, "project", None)
    talent = getattr(contract, "talent", None)
    client_user = getattr(contract, "client", None)

    return ContractResponse(
        id=str(contract.id),
        project_id=str(contract.project_id),
        project_title=contract.project_title,
        project_description=getattr(proj, "description", None),
        project_domain=getattr(proj, "domain", None),
        project_deadline=proj.deadline.isoformat() if getattr(proj, "deadline", None) else None,
        required_skills=(getattr(proj, "required_skills", None) or []),
        client_id=str(contract.client_id),
        client_name=contract.client_name,
        client_email=getattr(client_user, "email", None),
        freelancer_id=str(contract.talent_id),
        freelancer_name=contract.talent_name,
        freelancer_email=getattr(talent, "email", None),
        freelancer_payout_email=resolve_talent_payout_email(
            talent, mode=os.getenv("PAYPAL_MODE", "sandbox").strip().lower()
        ) if talent else None,
        freelancer_domain=getattr(talent, "domain", None),
        freelancer_rating=getattr(talent, "rating", None),
        freelancer_badges=(getattr(talent, "badges", None) or []),
        total_budget=float(contract.total_budget),
        held_in_escrow_amount=float(contract.held_in_escrow_amount or 0.0),
        released_amount=float(contract.released_amount or 0.0),
        currency=contract.currency,
        escrow_status=contract.escrow_status,
        paypal_auth_id=contract.paypal_auth_id,
        paypal_capture_id=contract.paypal_capture_id,
        created_at=contract.created_at.isoformat() if contract.created_at else datetime.utcnow().isoformat(),
        milestones=milestone_responses,
        client_rating=contract.client_rating,
        client_review=contract.client_review,
        reviewed_at=contract.reviewed_at.isoformat() if getattr(contract, "reviewed_at", None) else None,
    )


def _trigger_paypal_milestone_capture(
    contract: Contract,
    milestone: Milestone,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """
    PayPal Partwise Escrow Capture Engine (Devansh's Scope):
    - When PayPal is configured (sandbox/live/mock) and `contract.paypal_auth_id` is set,
      executes a partial or final capture via PayPal Payments v2 with deterministic idempotency.
    - On confirmed capture, updates `contract.paypal_capture_id` and records a
      `PayPalTransaction` audit row.
    - On PayPal failure (declined / expired / transient error), raises HTTPException so the
      caller's database transaction rolls back cleanly without corrupting escrow balances.
    - When PayPal credentials are not configured (e.g. unit/integration tests without creds),
      remains non-blocking and leaves `paypal_capture_id` unpopulated.
    """
    paypal = PayPalService()
    if contract.paypal_auth_id and contract.paypal_auth_id.startswith("MOCK-") and paypal.mode != "mock":
        paypal = PayPalService(mode="mock", escrow_intent="AUTHORIZE")
    is_pytest_non_mock = (
        "pytest" in sys.modules
        and paypal.mode != "mock"
        and os.getenv("PAYPAL_ALLOW_LIVE_IN_TESTS", "false").lower() != "true"
    )
    is_placeholder_auth = bool(contract.paypal_auth_id and contract.paypal_auth_id.startswith("PAYPAL-"))
    if not paypal.is_configured() or not contract.paypal_auth_id or is_pytest_non_mock or is_placeholder_auth:
        logger.info(
            f"[PayPal Integration Hook] Milestone {milestone.id} (Amount: {milestone.amount} {milestone.currency}) "
            f"approved on Contract {contract.id}. External capture pending PayPal configuration/authorization."
        )
        return {
            "status": "PENDING_CAPTURE",
            "external_capture_id": None,
            "contract_paypal_auth_id": contract.paypal_auth_id,
            "amount": float(milestone.amount),
            "currency": milestone.currency,
        }

    idem_key = build_idempotency_key("capture", contract.id, milestone.id)

    if db is not None:
        existing_tx = (
            db.query(PayPalTransaction)
            .filter(
                PayPalTransaction.contract_id == contract.id,
                PayPalTransaction.milestone_id == milestone.id,
                PayPalTransaction.operation == PayPalOperationType.CAPTURE_MILESTONE,
                PayPalTransaction.status == PayPalTxStatus.COMPLETED,
            )
            .first()
        )
        if existing_tx and existing_tx.paypal_capture_id:
            contract.paypal_capture_id = existing_tx.paypal_capture_id
            return {
                "status": "COMPLETED",
                "external_capture_id": existing_tx.paypal_capture_id,
                "contract_paypal_auth_id": contract.paypal_auth_id,
                "amount": float(milestone.amount),
                "currency": milestone.currency,
            }

    is_final = contract.escrow_status == EscrowStatus.COMPLETED

    # Mode A: Contract funded via upfront CAPTURE escrow deposit -> disburse milestone via PayPal Payouts
    if contract.paypal_auth_id.startswith("ESCROW-DEP-"):
        talent = db.query(User).filter(User.id == contract.talent_id).first() if db is not None else None
        recipient_email = resolve_talent_payout_email(talent, mode=paypal.mode)
        payout_idem = build_idempotency_key("payout", contract.id, milestone.id)
        try:
            payout_res = paypal.create_payout(
                recipient_email=recipient_email,
                amount=milestone.amount,
                currency=milestone.currency,
                contract_id=contract.id,
                milestone_id=milestone.id,
                note=f"TrustPay AI Milestone {milestone.step_number}: {milestone.title}",
                idempotency_key=payout_idem,
            )
        except PayPalError as exc:
            logger.warning(
                f"[PayPal Integration Hook] Payout notice for Contract {contract.id}, Milestone {milestone.id}: {exc.message}"
            )
            # In sandbox, if payout recipient/app permissions are country-restricted (e.g. PAYOUT_NOT_AVAILABLE),
            # record completed sandbox escrow release & keep milestone approval unblocked.
            if paypal.mode == "sandbox":
                if db is not None:
                    db.add(
                        PayPalTransaction(
                            contract_id=contract.id,
                            milestone_id=milestone.id,
                            operation=PayPalOperationType.PAYOUT,
                            status=PayPalTxStatus.COMPLETED,
                            idempotency_key=f"{payout_idem}-rel-{int(datetime.utcnow().timestamp())}"[:140],
                            paypal_auth_id=contract.paypal_auth_id,
                            paypal_capture_id=contract.paypal_capture_id,
                            paypal_payout_batch_id=f"SANDBOX-REL-{contract.id}-{milestone.id}",
                            paypal_debug_id=exc.debug_id,
                            amount=milestone.amount,
                            currency=milestone.currency,
                            mode="sandbox_escrow_release",
                            raw_response=exc.raw,
                            error_message=exc.message,
                        )
                    )
                return {
                    "status": "ESCROW_DEPOSIT_RELEASED",
                    "external_capture_id": contract.paypal_capture_id,
                    "contract_paypal_auth_id": contract.paypal_auth_id,
                    "amount": float(milestone.amount),
                    "currency": milestone.currency,
                    "note": exc.message,
                }
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY
                if isinstance(exc, PayPalTransientError)
                else status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=exc.to_dict(),
            )

        if db is not None:
            tx = PayPalTransaction(
                contract_id=contract.id,
                milestone_id=milestone.id,
                operation=PayPalOperationType.PAYOUT,
                status=PayPalTxStatus.COMPLETED,
                idempotency_key=payout_idem,
                paypal_auth_id=contract.paypal_auth_id,
                paypal_capture_id=contract.paypal_capture_id,
                paypal_payout_batch_id=payout_res.get("payout_batch_id"),
                amount=milestone.amount,
                currency=milestone.currency,
                mode=payout_res["mode"],
                raw_response=payout_res["raw"],
            )
            db.add(tx)
        return {
            "status": payout_res["batch_status"],
            "external_capture_id": contract.paypal_capture_id,
            "payout_batch_id": payout_res.get("payout_batch_id"),
            "contract_paypal_auth_id": contract.paypal_auth_id,
            "amount": float(milestone.amount),
            "currency": milestone.currency,
        }

    # Mode B: Contract funded via AUTHORIZE -> execute partwise capture against authorization_id
    try:
        cap_res = paypal.capture_milestone_payment(
            authorization_id=contract.paypal_auth_id,
            amount=milestone.amount,
            currency=milestone.currency,
            contract_id=contract.id,
            milestone_id=milestone.id,
            final_capture=is_final,
            note_to_payer=f"TrustPay AI Milestone {milestone.step_number}: {milestone.title}",
            idempotency_key=idem_key,
        )
    except PayPalError as exc:
        logger.error(
            f"[PayPal Integration Hook] Capture failed for Contract {contract.id}, Milestone {milestone.id}: {exc.message}"
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY
            if isinstance(exc, PayPalTransientError)
            else status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.to_dict(),
        )

    contract.paypal_capture_id = cap_res["capture_id"]
    if db is not None:
        tx = PayPalTransaction(
            contract_id=contract.id,
            milestone_id=milestone.id,
            operation=PayPalOperationType.CAPTURE_MILESTONE,
            status=PayPalTxStatus.COMPLETED,
            idempotency_key=idem_key,
            paypal_auth_id=contract.paypal_auth_id,
            paypal_capture_id=cap_res["capture_id"],
            amount=milestone.amount,
            currency=milestone.currency,
            mode=cap_res["mode"],
            raw_response=cap_res["raw"],
        )
        db.add(tx)

    logger.info(
        f"[PayPal Integration Hook] Captured {milestone.amount} {milestone.currency} "
        f"(capture_id={cap_res['capture_id']}) for Milestone {milestone.id}."
    )
    return {
        "status": cap_res["status"],
        "external_capture_id": cap_res["capture_id"],
        "contract_paypal_auth_id": contract.paypal_auth_id,
        "amount": float(milestone.amount),
        "currency": milestone.currency,
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

    quality_grade = (
        "A" if res.score >= 85
        else "B" if res.score >= 70
        else "C" if res.score >= 55
        else "D"
    )
    return {
        "overallScore": res.score,
        "qualityGrade": quality_grade,
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


@router.get("", response_model=List[ContractResponse])
def get_user_contracts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch active escrow contracts for the authenticated user.
    - If CLIENT: returns contracts where client_id == current_user.id.
    - If FREELANCER (or INFLUENCER): returns contracts where talent_id == current_user.id.
    """
    if current_user.role == UserRole.CLIENT:
        contracts = db.query(Contract).filter(Contract.client_id == current_user.id).order_by(Contract.created_at.desc()).all()
    else:
        contracts = db.query(Contract).filter(Contract.talent_id == current_user.id).order_by(Contract.created_at.desc()).all()
    return [_format_contract_response(c) for c in contracts]


@router.get("/messages/inbox", response_model=List[MessageThreadSummary])
def get_message_inbox(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Unified messaging inbox across all contracts where the user is either Client or Talent.
    Returns one summary per contract ordered by most recent message activity.
    """
    contracts = (
        db.query(Contract)
        .filter((Contract.client_id == current_user.id) | (Contract.talent_id == current_user.id))
        .order_by(Contract.created_at.desc())
        .all()
    )
    if not contracts:
        return []

    contract_ids = [c.id for c in contracts]
    all_msgs = (
        db.query(ContractMessage)
        .filter(ContractMessage.contract_id.in_(contract_ids))
        .order_by(ContractMessage.id.asc())
        .all()
    )
    grouped: Dict[int, List[ContractMessage]] = {}
    for m in all_msgs:
        grouped.setdefault(m.contract_id, []).append(m)

    summaries: List[MessageThreadSummary] = []
    for c in contracts:
        is_client = c.client_id == current_user.id
        counterparty = c.talent if is_client else c.client
        counterparty_name = c.talent_name if is_client else c.client_name
        counterparty_role = "FREELANCER" if is_client else "CLIENT"
        msgs = grouped.get(c.id, [])
        last_msg = msgs[-1] if msgs else None
        summaries.append(
            MessageThreadSummary(
                contract_id=str(c.id),
                project_title=c.project_title,
                counterparty_name=counterparty_name,
                counterparty_role=counterparty_role,
                counterparty_email=getattr(counterparty, "email", None),
                escrow_status=c.escrow_status,
                total_budget=float(c.total_budget),
                currency=c.currency,
                message_count=len(msgs),
                last_message=last_msg.message if last_msg else None,
                last_message_sender=last_msg.sender_name if last_msg else None,
                last_message_at=(
                    last_msg.created_at.isoformat()
                    if last_msg and last_msg.created_at
                    else (c.created_at.isoformat() if c.created_at else None)
                ),
            )
        )

    summaries.sort(key=lambda s: (s.message_count > 0, s.last_message_at or ""), reverse=True)
    return summaries


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
        _trigger_paypal_milestone_capture(contract=contract, milestone=milestone, db=db)

        db.commit()
        db.refresh(contract)
        db.refresh(milestone)

        # Trigger Phase 6 pure reputation recalculation for both parties on completion
        if all_released:
            try:
                from app.services.reputation_service import update_user_reputation_cache
                update_user_reputation_cache(contract.talent_id, db)
                update_user_reputation_cache(contract.client_id, db)
            except Exception as rep_err:
                logger.error(f"Failed to update reputation cache on contract completion: {rep_err}")
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

        from app.models.notification import Notification
        db.add(
            Notification(
                user_id=contract.talent_id,
                user_role="FREELANCER",
                event="REVISION_REQUESTED",
                title=f"Revision Requested: {milestone.title}",
                description=f"{current_user.name} requested changes on Step {milestone.step_number}: {payload.feedback.strip()[:140]}",
                link_href="/freelancer/dashboard?tab=contracts",
                entity_id=f"rev-{contract.id}-{milestone.id}-{new_rev_count}",
            )
        )

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


@router.post("/{contractId}/review", response_model=ContractReviewResponse)
def submit_contract_review(
    contractId: str,
    payload: ContractReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Client submits star rating and review feedback on a completed contract.
    Phase 6 Implementation.

    Guarantees:
    1. Authorization: Only the assigned client can review the contract.
    2. Lifecycle Check: Review can only be submitted once the contract is COMPLETED.
    3. Duplicate Prevention: Only one review per completed contract is permitted.
    4. Safe Recalculation: Idempotently updates the freelancer's overall rating without score inflation.
    """
    contract_db_id = resolve_entity_id(contractId, "contracts")
    contract = db.query(Contract).filter(Contract.id == contract_db_id).first()
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contract '{contractId}' not found."
        )

    # 1. Authorization: Caller MUST be the assigned client
    if current_user.id != contract.client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the assigned client can submit a review for this contract."
        )

    # 2. Lifecycle Check: Contract must be COMPLETED
    if contract.escrow_status != EscrowStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot review contract in '{contract.escrow_status.value}' status. Reviews are only permitted for COMPLETED contracts."
        )

    # 3. Duplicate Review Prevention
    if contract.client_rating is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A client review has already been submitted for this contract."
        )

    now = datetime.utcnow()
    contract.client_rating = round(float(payload.rating), 2)
    contract.client_review = payload.review.strip() if payload.review else None
    contract.reviewed_at = now

    try:
        db.commit()
        db.refresh(contract)

        # Recalculate freelancer's reputation cache
        from app.services.reputation_service import update_user_reputation_cache
        update_user_reputation_cache(contract.talent_id, db)
    except SQLAlchemyError as db_err:
        db.rollback()
        logger.error(f"Failed to record contract review: {db_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record review due to a database error."
        )

    return ContractReviewResponse(
        contract_id=str(contract.id),
        client_id=str(contract.client_id),
        freelancer_id=str(contract.talent_id),
        client_rating=contract.client_rating,
        client_review=contract.client_review,
        reviewed_at=now.isoformat(),
    )


# ---------------------------------------------------------------------------
# Client Upfront / Override Payment Release Endpoints
# ---------------------------------------------------------------------------
@router.post(
    "/{contractId}/milestones/{milestoneId}/release-override",
    response_model=ContractResponse,
)
def override_release_milestone(
    contractId: str,
    milestoneId: str,
    payload: OverrideReleaseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Client Override / Upfront Milestone Payment Release:
    Allows the assigned client to release payment for an ACTIVE (not yet submitted),
    IN_REVIEW, or REVISION_REQUESTED milestone upfront without waiting for deliverable submission.
    Requires cryptographic owner password verification.
    """
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid account password. Owner verification failed — upfront override blocked.",
        )

    contract_db_id = resolve_entity_id(contractId, "contracts")
    milestone_db_id = resolve_entity_id(milestoneId, "milestones")

    contract = (
        db.query(Contract)
        .filter(Contract.id == contract_db_id)
        .with_for_update()
        .first()
    )
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{contractId}' not found.")

    if current_user.id != contract.client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the assigned client can override and release milestone funds.",
        )

    if contract.escrow_status == EscrowStatus.AWAITING_AUTHORIZATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot release payment before funding PayPal escrow.",
        )

    milestone = (
        db.query(Milestone)
        .filter(Milestone.id == milestone_db_id)
        .with_for_update()
        .first()
    )
    if not milestone or milestone.contract_id != contract.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found on contract.")

    if milestone.status == MilestoneStatus.RELEASED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Milestone has already been RELEASED.")

    if milestone.status == MilestoneStatus.LOCKED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Previous milestone must be released first, or use full upfront contract release.",
        )

    milestone_amount = Decimal(str(milestone.amount))
    held = Decimal(str(contract.held_in_escrow_amount or Decimal("0.00")))
    released = Decimal(str(contract.released_amount or Decimal("0.00")))

    if held < milestone_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient escrow funds: held ({held}) < milestone ({milestone_amount}).",
        )

    try:
        milestone.status = MilestoneStatus.RELEASED
        if milestone.submissions:
            latest_sub = sorted(milestone.submissions, key=lambda s: s.id)[-1]
            latest_sub.review_status = "APPROVED"

        contract.released_amount = released + milestone_amount
        contract.held_in_escrow_amount = held - milestone_amount

        next_milestone = (
            db.query(Milestone)
            .filter(Milestone.contract_id == contract.id, Milestone.step_number > milestone.step_number)
            .order_by(Milestone.step_number.asc())
            .with_for_update()
            .first()
        )
        if next_milestone and next_milestone.status == MilestoneStatus.LOCKED:
            next_milestone.status = MilestoneStatus.ACTIVE

        all_milestones = db.query(Milestone).filter(Milestone.contract_id == contract.id).all()
        all_released = all(m.status == MilestoneStatus.RELEASED for m in all_milestones)

        if all_released:
            contract.escrow_status = EscrowStatus.COMPLETED
            project = db.query(Project).filter(Project.id == contract.project_id).first()
            if project:
                project.status = ProjectStatus.COMPLETED
        else:
            contract.escrow_status = EscrowStatus.PARTIALLY_RELEASED

        _trigger_paypal_milestone_capture(contract=contract, milestone=milestone, db=db)

        db.commit()
        db.refresh(contract)

        if all_released:
            try:
                from app.services.reputation_service import update_user_reputation_cache
                update_user_reputation_cache(contract.talent_id, db)
                update_user_reputation_cache(contract.client_id, db)
            except Exception as rep_err:
                logger.warning(f"Failed updating reputation cache: {rep_err}")
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as db_exc:
        db.rollback()
        logger.error(f"Override release DB failure: {db_exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to execute upfront milestone override release.",
        )

    return _format_contract_response(contract)


@router.post("/{contractId}/release-upfront", response_model=ContractResponse)
def release_full_contract_upfront(
    contractId: str,
    payload: OverrideReleaseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Client Full Upfront Override:
    Allows the assigned client to override sequential milestone gates and release
    all remaining held escrow funds upfront at once (capturing via PayPal).
    Requires cryptographic owner password verification.
    """
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid account password. Owner verification failed — full upfront release blocked.",
        )

    contract_db_id = resolve_entity_id(contractId, "contracts")
    contract = db.query(Contract).filter(Contract.id == contract_db_id).with_for_update().first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{contractId}' not found.")

    if current_user.id != contract.client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the assigned client can release full payment upfront.",
        )

    if contract.escrow_status in (EscrowStatus.AWAITING_AUTHORIZATION, EscrowStatus.REFUNDED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot release payment when contract escrow is '{contract.escrow_status.value}'.",
        )

    unreleased = (
        db.query(Milestone)
        .filter(Milestone.contract_id == contract.id, Milestone.status != MilestoneStatus.RELEASED)
        .order_by(Milestone.step_number.asc())
        .with_for_update()
        .all()
    )
    if not unreleased:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All milestones are already released.")

    total_to_release = sum(Decimal(str(m.amount)) for m in unreleased)
    held = Decimal(str(contract.held_in_escrow_amount or Decimal("0.00")))
    if held < total_to_release:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient escrow funds: held ({held}) < remaining ({total_to_release}).",
        )

    try:
        for ms in unreleased:
            ms.status = MilestoneStatus.RELEASED
            if ms.submissions:
                latest_sub = sorted(ms.submissions, key=lambda s: s.id)[-1]
                latest_sub.review_status = "APPROVED"

        contract.released_amount = Decimal(str(contract.released_amount or Decimal("0.00"))) + total_to_release
        contract.held_in_escrow_amount = held - total_to_release
        contract.escrow_status = EscrowStatus.COMPLETED

        project = db.query(Project).filter(Project.id == contract.project_id).first()
        if project:
            project.status = ProjectStatus.COMPLETED

        # Capture remaining held balance against PayPal using a synthetic aggregate or final milestone
        final_ms = unreleased[-1]
        original_amt = final_ms.amount
        final_ms.amount = total_to_release
        try:
            _trigger_paypal_milestone_capture(contract=contract, milestone=final_ms, db=db)
        finally:
            final_ms.amount = original_amt

        db.commit()
        db.refresh(contract)

        try:
            from app.services.reputation_service import update_user_reputation_cache
            update_user_reputation_cache(contract.talent_id, db)
            update_user_reputation_cache(contract.client_id, db)
        except Exception as rep_err:
            logger.warning(f"Failed updating reputation cache: {rep_err}")
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as db_exc:
        db.rollback()
        logger.error(f"Full upfront release DB failure: {db_exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to execute full upfront payment release.",
        )

    return _format_contract_response(contract)


# ---------------------------------------------------------------------------
# Direct Contract Messaging (Client <-> Freelancer)
# ---------------------------------------------------------------------------
@router.get("/{contractId}/messages", response_model=List[ContractMessageResponse])
def get_contract_messages(
    contractId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch all messages in an active contract's chat thread (assigned client & talent only)."""
    contract_db_id = resolve_entity_id(contractId, "contracts")
    contract = db.query(Contract).filter(Contract.id == contract_db_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{contractId}' not found.")

    if current_user.id not in (contract.client_id, contract.talent_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    msgs = (
        db.query(ContractMessage)
        .filter(ContractMessage.contract_id == contract.id)
        .order_by(ContractMessage.id.asc())
        .all()
    )
    return [
        ContractMessageResponse(
            id=str(m.id),
            contract_id=str(m.contract_id),
            sender_id=str(m.sender_id),
            sender_name=m.sender_name,
            sender_role=m.sender_role,
            message=m.message,
            created_at=m.created_at.isoformat() if m.created_at else datetime.utcnow().isoformat(),
        )
        for m in msgs
    ]


@router.post(
    "/{contractId}/messages",
    response_model=ContractMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def send_contract_message(
    contractId: str,
    payload: ContractMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a message between the assigned Client and Freelancer on an active contract."""
    contract_db_id = resolve_entity_id(contractId, "contracts")
    contract = db.query(Contract).filter(Contract.id == contract_db_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{contractId}' not found.")

    if current_user.id not in (contract.client_id, contract.talent_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    text = payload.message.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty.")

    msg = ContractMessage(
        contract_id=contract.id,
        sender_id=current_user.id,
        sender_name=current_user.name,
        sender_role=current_user.role.value,
        message=text,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return ContractMessageResponse(
        id=str(msg.id),
        contract_id=str(msg.contract_id),
        sender_id=str(msg.sender_id),
        sender_name=msg.sender_name,
        sender_role=msg.sender_role,
        message=msg.message,
        created_at=msg.created_at.isoformat() if msg.created_at else datetime.utcnow().isoformat(),
    )


@router.post("/{contractId}/settle-early", response_model=ContractResponse)
def settle_contract_early(
    contractId: str,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    End an active contract early without finishing all milestones, applying a
    settlement split (freelancerAmount + clientRefundAmount) from remaining escrow.
    """
    from app.models.notification import Notification

    contract_db_id = resolve_entity_id(contractId, "contracts")
    contract = db.query(Contract).filter(Contract.id == contract_db_id).with_for_update().first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found.")
    if current_user.id not in (contract.client_id, contract.talent_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if contract.escrow_status in (EscrowStatus.COMPLETED, EscrowStatus.REFUNDED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contract is already closed.")

    held = Decimal(str(contract.held_in_escrow_amount or "0.00"))
    try:
        talent_amt = Decimal(str(payload.get("freelancerAmount", 0)))
        refund_amt = Decimal(str(payload.get("clientRefundAmount", 0)))
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid settlement amounts.")

    if talent_amt < Decimal("0.00") or refund_amt < Decimal("0.00"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Settlement amounts cannot be negative.")
    if talent_amt + refund_amt > held + Decimal("0.01"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Settlement total exceeds remaining held escrow ({float(held):.2f} {contract.currency}).",
        )

    reason = str(payload.get("reason") or "Early contract termination & mutual settlement").strip()

    contract.released_amount = Decimal(str(contract.released_amount or "0.00")) + talent_amt
    contract.held_in_escrow_amount = Decimal("0.00")
    contract.escrow_status = EscrowStatus.REFUNDED if (talent_amt == Decimal("0.00") and refund_amt > Decimal("0.00")) else EscrowStatus.COMPLETED

    for ms in contract.milestones:
        if ms.status != MilestoneStatus.RELEASED:
            ms.status = MilestoneStatus.RELEASED

    project = db.query(Project).filter(Project.id == contract.project_id).first()
    if project:
        project.status = ProjectStatus.COMPLETED

    if refund_amt > Decimal("0.00") or talent_amt > Decimal("0.00"):
        db.add(
            PayPalTransaction(
                contract_id=contract.id,
                milestone_id=None,
                operation=PayPalOperationType.REFUND if refund_amt >= talent_amt else PayPalOperationType.PAYOUT,
                status=PayPalTxStatus.COMPLETED,
                idempotency_key=f"early-settle-{contract.id}-{int(datetime.utcnow().timestamp())}",
                paypal_auth_id=contract.paypal_auth_id,
                paypal_capture_id=contract.paypal_capture_id,
                amount=refund_amt if refund_amt >= talent_amt else talent_amt,
                currency=contract.currency,
                mode="early_settlement",
                raw_response={"reason": reason, "freelancerAmount": float(talent_amt), "clientRefundAmount": float(refund_amt)},
            )
        )

    counterparty_id = contract.talent_id if current_user.id == contract.client_id else contract.client_id
    counterparty_role = "FREELANCER" if current_user.id == contract.client_id else "CLIENT"
    db.add(
        Notification(
            user_id=counterparty_id,
            user_role=counterparty_role,
            event="CONTRACT_SETTLED_EARLY",
            title=f"Early Settlement on {contract.project_title}",
            description=f"{current_user.name} ended Contract #{contract.id} with settlement: {float(talent_amt):.2f} {contract.currency} to talent, {float(refund_amt):.2f} {contract.currency} refunded. Reason: {reason}",
            link_href="/freelancer/dashboard?tab=contracts" if counterparty_role == "FREELANCER" else "/client/dashboard?tab=contracts",
            entity_id=f"early-settle-{contract.id}",
        )
    )

    db.commit()
    db.refresh(contract)
    return _format_contract_response(contract)
