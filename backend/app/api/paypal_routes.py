"""
TrustPay AI — PayPal Escrow & Payout API Routes
================================================
Implements Devansh's PayPal Integration Endpoints:
- GET  /api/paypal/config                                       (Public PayPal mode & clientId config)
- POST /api/paypal/contracts/{contractId}/create-order          (Create Orders v2 intent=AUTHORIZE order)
- POST /api/paypal/contracts/{contractId}/authorize             (Authorize order -> HELD_IN_ESCROW + activate Step 1)
- POST /api/paypal/contracts/{contractId}/milestones/{mid}/capture (Execute/retry partwise milestone capture)
- POST /api/paypal/contracts/{contractId}/milestones/{mid}/payout  (Disburse milestone payout to talent's PayPal email)
- POST /api/paypal/contracts/{contractId}/refund                (Void authorization or refund capture)
- GET  /api/paypal/contracts/{contractId}/transactions          (Audit log of PayPal transactions for contract)
- POST /api/paypal/webhook                                      (Signature-verified PayPal webhook receiver)
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.models.paypal_transaction import (
    PayPalOperationType,
    PayPalTransaction,
    PayPalTxStatus,
)
from app.models.user import User
from app.schemas.paypal_schemas import (
    EscrowOrderAuthorizeRequest,
    EscrowOrderAuthorizeResponse,
    EscrowOrderCreateRequest,
    EscrowOrderCreateResponse,
    EscrowRefundRequest,
    EscrowRefundResponse,
    MilestoneCaptureRequest,
    MilestoneCaptureResponse,
    MilestonePayoutRequest,
    MilestonePayoutResponse,
    PayPalConfigResponse,
    PayPalTransactionRecordResponse,
)
from app.services.paypal_service import (
    PayPalConfigurationError,
    PayPalError,
    PayPalPaymentError,
    PayPalService,
    PayPalTransientError,
    build_idempotency_key,
    resolve_talent_payout_email,
)
from app.utils.auth import get_current_user
from app.utils.id_converter import resolve_entity_id

logger = logging.getLogger("trustpay.paypal_routes")
router = APIRouter(prefix="/api/paypal", tags=["PayPal Escrow"])


def get_paypal_service() -> PayPalService:
    """Dependency provider for PayPalService (easily overridable in tests)."""
    return PayPalService()


def _effective_paypal_service(
    contract: Contract,
    paypal: PayPalService,
    *,
    simulate: bool = False,
) -> PayPalService:
    """Use mock simulator cleanly when requested in non-live mode or when contract was funded via simulated escrow."""
    is_mock_contract = bool(
        (contract.paypal_auth_id and contract.paypal_auth_id.startswith("MOCK-"))
        or (contract.paypal_capture_id and contract.paypal_capture_id.startswith("MOCK-"))
    )
    if (simulate and paypal.mode != "live") or (is_mock_contract and paypal.mode != "mock"):
        return PayPalService(mode="mock", escrow_intent="AUTHORIZE")
    return paypal


def _raise_paypal_http_error(exc: PayPalError) -> None:
    if isinstance(exc, PayPalConfigurationError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.to_dict(),
        )
    if isinstance(exc, PayPalTransientError):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=exc.to_dict(),
        )
    raise HTTPException(
        status_code=exc.status_code if 400 <= exc.status_code < 500 else status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=exc.to_dict(),
    )


def _record_failed_tx(
    db: Session,
    *,
    contract_id: int,
    milestone_id: Optional[int],
    operation: PayPalOperationType,
    idempotency_key: str,
    amount: Decimal,
    currency: str,
    mode: str,
    exc: PayPalError,
) -> None:
    """Best-effort persistence of failed PayPal diagnostic metadata without poisoning caller rollback."""
    try:
        existing = db.query(PayPalTransaction).filter(PayPalTransaction.idempotency_key == idempotency_key).first()
        if existing:
            existing.status = PayPalTxStatus.FAILED
            existing.paypal_debug_id = exc.debug_id
            existing.error_message = exc.message
            existing.raw_response = exc.raw
        else:
            tx = PayPalTransaction(
                contract_id=contract_id,
                milestone_id=milestone_id,
                operation=operation,
                status=PayPalTxStatus.FAILED,
                idempotency_key=f"{idempotency_key}-err-{int(datetime.utcnow().timestamp())}"[:140],
                paypal_debug_id=exc.debug_id,
                amount=amount,
                currency=currency,
                mode=mode,
                raw_response=exc.raw,
                error_message=exc.message,
            )
            db.add(tx)
        db.commit()
    except SQLAlchemyError as log_err:
        db.rollback()
        logger.warning(f"Failed to persist failed PayPalTransaction audit row: {log_err}")


def _format_tx_record(tx: PayPalTransaction) -> PayPalTransactionRecordResponse:
    return PayPalTransactionRecordResponse(
        id=str(tx.id),
        contract_id=str(tx.contract_id),
        milestone_id=str(tx.milestone_id) if tx.milestone_id is not None else None,
        operation=tx.operation.value,
        status=tx.status.value,
        idempotency_key=tx.idempotency_key,
        paypal_order_id=tx.paypal_order_id,
        paypal_auth_id=tx.paypal_auth_id,
        paypal_capture_id=tx.paypal_capture_id,
        paypal_refund_id=tx.paypal_refund_id,
        paypal_payout_batch_id=tx.paypal_payout_batch_id,
        paypal_debug_id=tx.paypal_debug_id,
        amount=float(tx.amount or 0.0),
        currency=tx.currency,
        mode=tx.mode,
        error_message=tx.error_message,
        created_at=tx.created_at.isoformat() if tx.created_at else datetime.utcnow().isoformat(),
    )


# ---------------------------------------------------------------------------
# 1. Public Config
# ---------------------------------------------------------------------------
@router.get("/config", response_model=PayPalConfigResponse)
def get_paypal_config(paypal: PayPalService = Depends(get_paypal_service)):
    """Expose non-sensitive PayPal client configuration for the frontend PayPal JS SDK."""
    return PayPalConfigResponse(
        mode=paypal.mode,
        intent=paypal.escrow_intent,
        configured=paypal.is_configured(),
        has_live_credentials=paypal.has_live_credentials(),
        client_id=paypal.client_id if paypal.has_live_credentials() else None,
    )


# ---------------------------------------------------------------------------
# 2. Create Escrow Order (intent: AUTHORIZE)
# ---------------------------------------------------------------------------
@router.post("/contracts/{contractId}/create-order", response_model=EscrowOrderCreateResponse)
def create_escrow_order_route(
    contractId: str,
    payload: EscrowOrderCreateRequest = Body(default_factory=EscrowOrderCreateRequest),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    paypal: PayPalService = Depends(get_paypal_service),
):
    """
    Create a PayPal Orders v2 order (`intent: AUTHORIZE`) for the contract's full budget.
    Only the assigned Client can initiate escrow funding.
    """
    contract_db_id = resolve_entity_id(contractId, "contracts")
    contract = db.query(Contract).filter(Contract.id == contract_db_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{contractId}' not found.")

    if current_user.id != contract.client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the assigned client can fund escrow for this contract.",
        )

    if contract.escrow_status != EscrowStatus.AWAITING_AUTHORIZATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Contract escrow cannot create a funding order in status '{contract.escrow_status.value}'.",
        )

    flow_tag = "redir" if (payload.return_url and payload.cancel_url) else "sdk"
    idem_key = payload.idempotency_key or build_idempotency_key(
        "order", contract.id, paypal.escrow_intent, flow_tag, f"{Decimal(str(contract.total_budget)):.2f}"
    )

    # Idempotent replay check
    existing_tx = (
        db.query(PayPalTransaction)
        .filter(
            PayPalTransaction.idempotency_key == idem_key,
            PayPalTransaction.status == PayPalTxStatus.COMPLETED,
        )
        .first()
    )
    if existing_tx and existing_tx.paypal_order_id:
        approval_url = None
        for link in (existing_tx.raw_response or {}).get("links", []):
            if link.get("rel") in ("approve", "payer-action"):
                approval_url = link.get("href")
                break
        return EscrowOrderCreateResponse(
            contract_id=str(contract.id),
            order_id=existing_tx.paypal_order_id,
            status=(existing_tx.raw_response or {}).get("status", "CREATED"),
            intent=(existing_tx.raw_response or {}).get("intent", paypal.escrow_intent),
            approval_url=approval_url,
            amount=float(contract.total_budget),
            currency=contract.currency,
            idempotency_key=idem_key,
            mode=existing_tx.mode,
        )

    try:
        result = paypal.create_escrow_order(
            contract_id=contract.id,
            amount=contract.total_budget,
            currency=contract.currency,
            description=f"TrustPay Escrow: {contract.project_title}",
            return_url=payload.return_url,
            cancel_url=payload.cancel_url,
            intent=paypal.escrow_intent,
            idempotency_key=idem_key,
        )
    except PayPalError as exc:
        _record_failed_tx(
            db,
            contract_id=contract.id,
            milestone_id=None,
            operation=PayPalOperationType.CREATE_ORDER,
            idempotency_key=idem_key,
            amount=contract.total_budget,
            currency=contract.currency,
            mode=paypal.mode,
            exc=exc,
        )
        _raise_paypal_http_error(exc)

    tx = PayPalTransaction(
        contract_id=contract.id,
        milestone_id=None,
        operation=PayPalOperationType.CREATE_ORDER,
        status=PayPalTxStatus.COMPLETED,
        idempotency_key=idem_key,
        paypal_order_id=result["order_id"],
        amount=contract.total_budget,
        currency=contract.currency,
        mode=result["mode"],
        raw_response=result["raw"],
    )
    db.add(tx)
    db.commit()

    return EscrowOrderCreateResponse(
        contract_id=str(contract.id),
        order_id=result["order_id"],
        status=result["status"],
        intent=result.get("intent", paypal.escrow_intent),
        approval_url=result.get("approval_url"),
        amount=float(contract.total_budget),
        currency=contract.currency,
        idempotency_key=idem_key,
        mode=result["mode"],
    )


# ---------------------------------------------------------------------------
# 3. Authorize Approved Order -> Lock Escrow & Activate Milestone Step 1
# ---------------------------------------------------------------------------
@router.post("/contracts/{contractId}/authorize", response_model=EscrowOrderAuthorizeResponse)
def authorize_escrow_route(
    contractId: str,
    payload: EscrowOrderAuthorizeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    paypal: PayPalService = Depends(get_paypal_service),
):
    """
    Authorize a payer-approved PayPal order (or verify a JS SDK authorizationId).
    Atomically transitions:
    - contract.paypal_auth_id -> authorization_id
    - contract.escrow_status -> HELD_IN_ESCROW
    - contract.held_in_escrow_amount -> contract.total_budget
    - Milestone Step 1 -> ACTIVE
    """
    contract_db_id = resolve_entity_id(contractId, "contracts")
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
            detail="Access denied: Only the assigned client can authorize escrow funds.",
        )

    # Idempotent replay if already funded with the same authorization
    if contract.escrow_status != EscrowStatus.AWAITING_AUTHORIZATION:
        if contract.paypal_auth_id and (
            not payload.authorization_id or payload.authorization_id == contract.paypal_auth_id
        ):
            step1 = (
                db.query(Milestone)
                .filter(Milestone.contract_id == contract.id, Milestone.step_number == 1)
                .first()
            )
            return EscrowOrderAuthorizeResponse(
                contract_id=str(contract.id),
                order_id=payload.order_id,
                authorization_id=contract.paypal_auth_id,
                status="ALREADY_AUTHORIZED",
                escrow_status=contract.escrow_status.value,
                held_in_escrow_amount=float(contract.held_in_escrow_amount),
                currency=contract.currency,
                active_milestone_id=str(step1.id) if step1 else None,
                idempotency_key=payload.idempotency_key or build_idempotency_key("auth", contract.id, contract.paypal_auth_id),
                mode=paypal.mode,
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Contract escrow is already '{contract.escrow_status.value}'.",
        )

    if not payload.simulate and not payload.order_id and not payload.authorization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'orderId', 'authorizationId', or 'simulate=true' is required to authorize escrow.",
        )

    if payload.simulate and paypal.mode == "live":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Simulated escrow fallback is disabled when PAYPAL_MODE=live.",
        )

    eff_paypal = _effective_paypal_service(contract, paypal, simulate=payload.simulate)
    idem_key = payload.idempotency_key or (
        build_idempotency_key("auth-sim", contract.id, f"{Decimal(str(contract.total_budget)):.2f}")
        if payload.simulate
        else build_idempotency_key("auth", contract.id, payload.order_id or payload.authorization_id)
    )

    capture_deposit_id: Optional[str] = None
    stored_order_id = payload.order_id
    try:
        if payload.simulate:
            sim_order = eff_paypal.create_escrow_order(
                contract_id=contract.id,
                amount=contract.total_budget,
                currency=contract.currency,
                description=f"TrustPay Simulated Escrow: {contract.project_title}",
                idempotency_key=build_idempotency_key("ord-sim", contract.id, f"{Decimal(str(contract.total_budget)):.2f}"),
            )
            stored_order_id = sim_order["order_id"]
            auth_result = eff_paypal.authorize_order(
                order_id=stored_order_id,
                contract_id=contract.id,
                idempotency_key=idem_key,
            )
            auth_id = auth_result["authorization_id"]
            auth_status = auth_result["status"]
            raw_resp = auth_result["raw"]
            resp_mode = auth_result["mode"]
        elif payload.order_id:
            if eff_paypal.escrow_intent == "CAPTURE":
                cap_dep = eff_paypal.capture_escrow_order(
                    order_id=payload.order_id,
                    contract_id=contract.id,
                    idempotency_key=idem_key,
                )
                capture_deposit_id = cap_dep["capture_id"]
                auth_id = f"ESCROW-DEP-{capture_deposit_id}"
                auth_status = cap_dep["status"]
                raw_resp = cap_dep["raw"]
                resp_mode = cap_dep["mode"]
            else:
                auth_result = eff_paypal.authorize_order(
                    order_id=payload.order_id,
                    contract_id=contract.id,
                    idempotency_key=idem_key,
                )
                auth_id = auth_result["authorization_id"]
                auth_status = auth_result["status"]
                raw_resp = auth_result["raw"]
                resp_mode = auth_result["mode"]
        else:
            details = eff_paypal.get_authorization_details(payload.authorization_id)  # type: ignore[arg-type]
            auth_id = details.get("id", payload.authorization_id)
            auth_status = details.get("status", "CREATED")
            if auth_status in ("DENIED", "VOIDED", "EXPIRED"):
                raise PayPalPaymentError(
                    f"Authorization {auth_id} is not active (status={auth_status}).",
                    code=f"AUTHORIZATION_{auth_status}",
                    status_code=422,
                    raw=details,
                )
            raw_resp = details
            resp_mode = eff_paypal.mode
    except PayPalError as exc:
        _record_failed_tx(
            db,
            contract_id=contract.id,
            milestone_id=None,
            operation=PayPalOperationType.AUTHORIZE_ORDER,
            idempotency_key=idem_key,
            amount=contract.total_budget,
            currency=contract.currency,
            mode=eff_paypal.mode,
            exc=exc,
        )
        _raise_paypal_http_error(exc)

    try:
        contract.paypal_auth_id = auth_id
        if capture_deposit_id:
            contract.paypal_capture_id = capture_deposit_id
        contract.escrow_status = EscrowStatus.HELD_IN_ESCROW
        contract.held_in_escrow_amount = contract.total_budget

        step1 = (
            db.query(Milestone)
            .filter(Milestone.contract_id == contract.id, Milestone.step_number == 1)
            .with_for_update()
            .first()
        )
        if step1 and step1.status == MilestoneStatus.LOCKED:
            step1.status = MilestoneStatus.ACTIVE

        tx = PayPalTransaction(
            contract_id=contract.id,
            milestone_id=step1.id if step1 else None,
            operation=PayPalOperationType.AUTHORIZE_ORDER,
            status=PayPalTxStatus.COMPLETED,
            idempotency_key=idem_key,
            paypal_order_id=stored_order_id,
            paypal_auth_id=auth_id,
            paypal_capture_id=capture_deposit_id,
            amount=contract.total_budget,
            currency=contract.currency,
            mode=resp_mode,
            raw_response=raw_resp,
        )
        db.add(tx)
        db.commit()
        db.refresh(contract)
    except SQLAlchemyError as db_err:
        db.rollback()
        logger.error(f"Failed updating contract after PayPal authorization: {db_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist escrow authorization in database.",
        )

    return EscrowOrderAuthorizeResponse(
        contract_id=str(contract.id),
        order_id=stored_order_id,
        authorization_id=auth_id,
        status=auth_status,
        escrow_status=contract.escrow_status.value,
        held_in_escrow_amount=float(contract.held_in_escrow_amount),
        currency=contract.currency,
        active_milestone_id=str(step1.id) if step1 else None,
        idempotency_key=idem_key,
        mode=resp_mode,
    )


# ---------------------------------------------------------------------------
# 4. Capture Milestone Payment (Manual / Idempotent Retry Endpoint)
# ---------------------------------------------------------------------------
@router.post("/contracts/{contractId}/milestones/{milestoneId}/capture", response_model=MilestoneCaptureResponse)
def capture_milestone_route(
    contractId: str,
    milestoneId: str,
    payload: MilestoneCaptureRequest = Body(default_factory=MilestoneCaptureRequest),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    paypal: PayPalService = Depends(get_paypal_service),
):
    """
    Execute (or idempotently retry) a PayPal partial capture for a RELEASED milestone.
    """
    contract_db_id = resolve_entity_id(contractId, "contracts")
    milestone_db_id = resolve_entity_id(milestoneId, "milestones")

    contract = db.query(Contract).filter(Contract.id == contract_db_id).with_for_update().first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{contractId}' not found.")

    if current_user.id != contract.client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the assigned client can trigger PayPal capture.",
        )

    milestone = db.query(Milestone).filter(Milestone.id == milestone_db_id).first()
    if not milestone or milestone.contract_id != contract.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Milestone '{milestoneId}' not found on Contract '{contractId}'.",
        )

    if milestone.status != MilestoneStatus.RELEASED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Milestone must be in RELEASED status before capturing via PayPal (current: {milestone.status.value}).",
        )

    if not contract.paypal_auth_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contract does not have an active PayPal authorization ID.",
        )

    idem_key = payload.idempotency_key or build_idempotency_key("capture", contract.id, milestone.id)

    # Idempotent check: return previously confirmed capture for this milestone
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
        return MilestoneCaptureResponse(
            contract_id=str(contract.id),
            milestone_id=str(milestone.id),
            authorization_id=contract.paypal_auth_id,
            capture_id=existing_tx.paypal_capture_id,
            status="COMPLETED",
            amount=float(existing_tx.amount),
            currency=existing_tx.currency,
            final_capture=bool((existing_tx.raw_response or {}).get("final_capture", False)),
            idempotency_key=existing_tx.idempotency_key,
            mode=existing_tx.mode,
        )

    all_milestones = db.query(Milestone).filter(Milestone.contract_id == contract.id).all()
    is_final = all(m.status == MilestoneStatus.RELEASED for m in all_milestones)
    eff_paypal = _effective_paypal_service(contract, paypal)

    try:
        cap_result = eff_paypal.capture_milestone_payment(
            authorization_id=contract.paypal_auth_id,
            amount=milestone.amount,
            currency=milestone.currency,
            contract_id=contract.id,
            milestone_id=milestone.id,
            final_capture=is_final,
            note_to_payer=payload.note_to_payer or f"TrustPay AI Step {milestone.step_number}: {milestone.title}",
            idempotency_key=idem_key,
        )
    except PayPalError as exc:
        _record_failed_tx(
            db,
            contract_id=contract.id,
            milestone_id=milestone.id,
            operation=PayPalOperationType.CAPTURE_MILESTONE,
            idempotency_key=idem_key,
            amount=milestone.amount,
            currency=milestone.currency,
            mode=paypal.mode,
            exc=exc,
        )
        _raise_paypal_http_error(exc)

    contract.paypal_capture_id = cap_result["capture_id"]
    tx = PayPalTransaction(
        contract_id=contract.id,
        milestone_id=milestone.id,
        operation=PayPalOperationType.CAPTURE_MILESTONE,
        status=PayPalTxStatus.COMPLETED,
        idempotency_key=idem_key,
        paypal_auth_id=contract.paypal_auth_id,
        paypal_capture_id=cap_result["capture_id"],
        amount=milestone.amount,
        currency=milestone.currency,
        mode=cap_result["mode"],
        raw_response=cap_result["raw"],
    )
    db.add(tx)
    db.commit()

    # Recalculate reputation if contract is completed (updates confirmed earnings & badges)
    if contract.escrow_status == EscrowStatus.COMPLETED:
        try:
            from app.services.reputation_service import update_user_reputation_cache
            update_user_reputation_cache(contract.talent_id, db)
            update_user_reputation_cache(contract.client_id, db)
        except Exception as rep_err:
            logger.warning(f"Failed updating reputation cache after capture: {rep_err}")

    return MilestoneCaptureResponse(
        contract_id=str(contract.id),
        milestone_id=str(milestone.id),
        authorization_id=contract.paypal_auth_id,
        capture_id=cap_result["capture_id"],
        status=cap_result["status"],
        amount=float(milestone.amount),
        currency=milestone.currency,
        final_capture=cap_result["final_capture"],
        idempotency_key=idem_key,
        mode=cap_result["mode"],
    )


# ---------------------------------------------------------------------------
# 5. Payout to Talent PayPal Email
# ---------------------------------------------------------------------------
@router.post("/contracts/{contractId}/milestones/{milestoneId}/payout", response_model=MilestonePayoutResponse)
def payout_milestone_route(
    contractId: str,
    milestoneId: str,
    payload: MilestonePayoutRequest = Body(default_factory=MilestonePayoutRequest),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    paypal: PayPalService = Depends(get_paypal_service),
):
    """Disburse captured milestone funds to the freelancer/influencer's PayPal email."""
    contract_db_id = resolve_entity_id(contractId, "contracts")
    milestone_db_id = resolve_entity_id(milestoneId, "milestones")

    contract = db.query(Contract).filter(Contract.id == contract_db_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{contractId}' not found.")

    if current_user.id not in (contract.client_id, contract.talent_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    milestone = db.query(Milestone).filter(Milestone.id == milestone_db_id).first()
    if not milestone or milestone.contract_id != contract.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found on contract.")

    if milestone.status != MilestoneStatus.RELEASED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Milestone must be RELEASED before initiating PayPal payout.",
        )

    eff_paypal = _effective_paypal_service(contract, paypal)
    talent = db.query(User).filter(User.id == contract.talent_id).first()
    recipient_email = (
        payload.recipient_email.strip()
        if payload.recipient_email and payload.recipient_email.strip()
        else resolve_talent_payout_email(talent, mode=eff_paypal.mode)
    )
    if not recipient_email or "@" not in recipient_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valid recipient PayPal email required.")

    idem_key = payload.idempotency_key or build_idempotency_key("payout", contract.id, milestone.id)
    existing_tx = (
        db.query(PayPalTransaction)
        .filter(
            PayPalTransaction.idempotency_key == idem_key,
            PayPalTransaction.status == PayPalTxStatus.COMPLETED,
        )
        .first()
    )
    if existing_tx and existing_tx.paypal_payout_batch_id:
        return MilestonePayoutResponse(
            contract_id=str(contract.id),
            milestone_id=str(milestone.id),
            payout_batch_id=existing_tx.paypal_payout_batch_id,
            batch_status=(existing_tx.raw_response or {}).get("batch_header", {}).get("batch_status", "PENDING"),
            recipient_email=recipient_email,
            amount=float(existing_tx.amount),
            currency=existing_tx.currency,
            idempotency_key=idem_key,
            mode=existing_tx.mode,
        )

    try:
        payout_res = eff_paypal.create_payout(
            recipient_email=recipient_email,
            amount=milestone.amount,
            currency=milestone.currency,
            contract_id=contract.id,
            milestone_id=milestone.id,
            note=payload.note,
            idempotency_key=idem_key,
        )
    except PayPalError as exc:
        _record_failed_tx(
            db,
            contract_id=contract.id,
            milestone_id=milestone.id,
            operation=PayPalOperationType.PAYOUT,
            idempotency_key=idem_key,
            amount=milestone.amount,
            currency=milestone.currency,
            mode=paypal.mode,
            exc=exc,
        )
        _raise_paypal_http_error(exc)

    tx = PayPalTransaction(
        contract_id=contract.id,
        milestone_id=milestone.id,
        operation=PayPalOperationType.PAYOUT,
        status=PayPalTxStatus.COMPLETED,
        idempotency_key=idem_key,
        paypal_payout_batch_id=payout_res.get("payout_batch_id"),
        amount=milestone.amount,
        currency=milestone.currency,
        mode=payout_res["mode"],
        raw_response=payout_res["raw"],
    )
    db.add(tx)
    db.commit()

    return MilestonePayoutResponse(
        contract_id=str(contract.id),
        milestone_id=str(milestone.id),
        payout_batch_id=payout_res.get("payout_batch_id"),
        batch_status=payout_res["batch_status"],
        recipient_email=payout_res["recipient_email"],
        amount=float(milestone.amount),
        currency=milestone.currency,
        idempotency_key=idem_key,
        mode=payout_res["mode"],
    )


# ---------------------------------------------------------------------------
# 6. Refund / Void Escrow (Disputes & Cancellations)
# ---------------------------------------------------------------------------
@router.post("/contracts/{contractId}/refund", response_model=EscrowRefundResponse)
def refund_or_void_escrow_route(
    contractId: str,
    payload: EscrowRefundRequest = Body(default_factory=EscrowRefundRequest),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    paypal: PayPalService = Depends(get_paypal_service),
):
    """
    Refund a captured PayPal payment OR void an uncaptured authorization.
    """
    contract_db_id = resolve_entity_id(contractId, "contracts")
    contract = db.query(Contract).filter(Contract.id == contract_db_id).with_for_update().first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{contractId}' not found.")

    if current_user.id != contract.client_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only the assigned client can initiate a refund or void.",
        )

    target_capture_id = payload.capture_id or contract.paypal_capture_id
    idem_key = payload.idempotency_key or build_idempotency_key(
        "refund", contract.id, target_capture_id or contract.paypal_auth_id or "escrow"
    )

    eff_paypal = _effective_paypal_service(contract, paypal)

    # Case A: Refund an existing capture
    if target_capture_id:
        refund_amt = Decimal(str(payload.amount)) if payload.amount is not None else contract.released_amount
        try:
            ref_res = eff_paypal.refund_capture(
                capture_id=target_capture_id,
                amount=payload.amount,
                currency=contract.currency,
                note_to_payer=payload.reason,
                idempotency_key=idem_key,
            )
        except PayPalError as exc:
            _record_failed_tx(
                db,
                contract_id=contract.id,
                milestone_id=None,
                operation=PayPalOperationType.REFUND,
                idempotency_key=idem_key,
                amount=refund_amt,
                currency=contract.currency,
                mode=paypal.mode,
                exc=exc,
            )
            _raise_paypal_http_error(exc)

        contract.escrow_status = EscrowStatus.REFUNDED
        if payload.void_remaining_authorization and contract.paypal_auth_id and (contract.held_in_escrow_amount or Decimal("0.00")) > Decimal("0.00"):
            try:
                eff_paypal.void_authorization(authorization_id=contract.paypal_auth_id, contract_id=contract.id)
                contract.held_in_escrow_amount = Decimal("0.00")
            except PayPalError as void_err:
                logger.warning(f"Voiding remaining auth after refund failed: {void_err}")

        tx = PayPalTransaction(
            contract_id=contract.id,
            milestone_id=None,
            operation=PayPalOperationType.REFUND,
            status=PayPalTxStatus.COMPLETED,
            idempotency_key=idem_key,
            paypal_capture_id=target_capture_id,
            paypal_refund_id=ref_res["refund_id"],
            amount=Decimal(str(ref_res["amount"])) if ref_res.get("amount") else refund_amt,
            currency=contract.currency,
            mode=ref_res["mode"],
            raw_response=ref_res["raw"],
        )
        db.add(tx)
        db.commit()

        return EscrowRefundResponse(
            contract_id=str(contract.id),
            action="REFUND_CAPTURE",
            refund_id=ref_res["refund_id"],
            authorization_id=contract.paypal_auth_id,
            status=ref_res["status"],
            escrow_status=contract.escrow_status.value,
            amount=float(ref_res["amount"]) if ref_res.get("amount") else None,
            currency=contract.currency,
            mode=ref_res["mode"],
        )

    # Case B: Void uncaptured authorization
    if not contract.paypal_auth_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contract has no PayPal authorization or capture to refund/void.",
        )

    try:
        void_res = eff_paypal.void_authorization(
            authorization_id=contract.paypal_auth_id,
            contract_id=contract.id,
            idempotency_key=idem_key,
        )
    except PayPalError as exc:
        _record_failed_tx(
            db,
            contract_id=contract.id,
            milestone_id=None,
            operation=PayPalOperationType.VOID_AUTH,
            idempotency_key=idem_key,
            amount=contract.held_in_escrow_amount,
            currency=contract.currency,
            mode=paypal.mode,
            exc=exc,
        )
        _raise_paypal_http_error(exc)

    voided_amt = contract.held_in_escrow_amount
    contract.held_in_escrow_amount = Decimal("0.00")
    contract.escrow_status = EscrowStatus.REFUNDED

    tx = PayPalTransaction(
        contract_id=contract.id,
        milestone_id=None,
        operation=PayPalOperationType.VOID_AUTH,
        status=PayPalTxStatus.COMPLETED,
        idempotency_key=idem_key,
        paypal_auth_id=contract.paypal_auth_id,
        amount=voided_amt,
        currency=contract.currency,
        mode=void_res["mode"],
        raw_response=void_res.get("raw"),
    )
    db.add(tx)
    db.commit()

    return EscrowRefundResponse(
        contract_id=str(contract.id),
        action="VOID_AUTHORIZATION",
        refund_id=None,
        authorization_id=contract.paypal_auth_id,
        status=void_res["status"],
        escrow_status=contract.escrow_status.value,
        amount=float(voided_amt),
        currency=contract.currency,
        mode=void_res["mode"],
    )


# ---------------------------------------------------------------------------
# 7. Transaction Audit Log
# ---------------------------------------------------------------------------
@router.get("/contracts/{contractId}/transactions", response_model=List[PayPalTransactionRecordResponse])
def get_contract_paypal_transactions(
    contractId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch chronological PayPal audit ledger for a contract (client & talent only)."""
    contract_db_id = resolve_entity_id(contractId, "contracts")
    contract = db.query(Contract).filter(Contract.id == contract_db_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Contract '{contractId}' not found.")

    if current_user.id not in (contract.client_id, contract.talent_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    txs = (
        db.query(PayPalTransaction)
        .filter(PayPalTransaction.contract_id == contract.id)
        .order_by(PayPalTransaction.id.desc())
        .all()
    )
    return [_format_tx_record(tx) for tx in txs]


# ---------------------------------------------------------------------------
# 8. PayPal Webhook Listener
# ---------------------------------------------------------------------------
@router.post("/webhook")
async def paypal_webhook_listener(
    request: Request,
    db: Session = Depends(get_db),
    paypal: PayPalService = Depends(get_paypal_service),
):
    """
    Signature-verified PayPal webhook receiver.
    Reconciles async PayPal events (`PAYMENT.CAPTURE.COMPLETED`,
    `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.REFUNDED`) idempotently.
    """
    try:
        event: Dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON webhook body.")

    headers_dict = {k: v for k, v in request.headers.items()}
    if not paypal.verify_webhook_signature(headers=headers_dict, webhook_event=event):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid PayPal webhook signature.",
        )

    event_id = event.get("id") or headers_dict.get("paypal-transmission-id") or "unknown"
    event_type = event.get("event_type", "")
    resource = event.get("resource") or {}
    idem_key = build_idempotency_key("webhook", event_id)

    # Deduplicate already-processed webhooks
    if db.query(PayPalTransaction).filter(PayPalTransaction.idempotency_key == idem_key).first():
        return {"status": "ALREADY_PROCESSED", "eventId": event_id, "eventType": event_type}

    capture_id = resource.get("id") if "CAPTURE" in event_type else None
    auth_id = (
        resource.get("id")
        if "AUTHORIZATION" in event_type
        else (resource.get("supplementary_data", {}).get("related_ids", {}) or {}).get("authorization_id")
    )

    contract = None
    if auth_id:
        contract = db.query(Contract).filter(Contract.paypal_auth_id == auth_id).first()
    if not contract and capture_id:
        contract = db.query(Contract).filter(Contract.paypal_capture_id == capture_id).first()
    if not contract and resource.get("custom_id"):
        try:
            contract = db.query(Contract).filter(Contract.id == int(resource["custom_id"])).first()
        except (TypeError, ValueError):
            contract = None

    if contract:
        if event_type == "PAYMENT.CAPTURE.COMPLETED" and capture_id:
            contract.paypal_capture_id = capture_id
        elif event_type == "PAYMENT.AUTHORIZATION.VOIDED":
            contract.escrow_status = EscrowStatus.REFUNDED
            contract.held_in_escrow_amount = Decimal("0.00")
        elif event_type == "PAYMENT.CAPTURE.REFUNDED":
            contract.escrow_status = EscrowStatus.REFUNDED

        amt_val = Decimal(str((resource.get("amount") or {}).get("value", "0.00")))
        curr = (resource.get("amount") or {}).get("currency_code", contract.currency)
        tx = PayPalTransaction(
            contract_id=contract.id,
            milestone_id=None,
            operation=PayPalOperationType.WEBHOOK,
            status=PayPalTxStatus.COMPLETED,
            idempotency_key=idem_key,
            paypal_auth_id=auth_id,
            paypal_capture_id=capture_id,
            amount=amt_val,
            currency=curr,
            mode=paypal.mode,
            raw_response=event,
        )
        db.add(tx)
        db.commit()

    return {
        "status": "PROCESSED",
        "eventId": event_id,
        "eventType": event_type,
        "contractId": str(contract.id) if contract else None,
    }
