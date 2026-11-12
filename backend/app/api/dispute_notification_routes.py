"""
TrustPay AI — Shared Disputes & Notifications API Routes
=========================================================
Persists disputes and cross-user notifications in SQLite so both Client
and Freelancer see each other's disputes, settlement offers, and alerts
across any browser or device on the network.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.contract import Contract
from app.models.dispute import Dispute
from app.models.notification import Notification
from app.utils.auth import get_current_user
from app.utils.id_converter import resolve_entity_id

disputes_router = APIRouter(prefix="/api/disputes", tags=["Disputes"])
notifications_router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


class DisputeUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str
    contract_id: str = Field(..., alias="contractId")
    status: str = "OPEN"
    data: Dict[str, Any]


class NotificationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    user_id: str = Field(..., alias="userId")
    user_role: str = Field("FREELANCER", alias="userRole")
    event: str = "SYSTEM_INFO"
    title: str
    description: str
    link_href: str = Field("/", alias="linkHref")
    entity_id: Optional[str] = Field(None, alias="entityId")


def _format_notification(n: Notification) -> Dict[str, Any]:
    return {
        "id": str(n.id),
        "userId": str(n.user_id),
        "userRole": n.user_role,
        "event": n.event,
        "title": n.title,
        "description": n.description,
        "linkHref": n.link_href,
        "entityId": n.entity_id,
        "isRead": bool(n.is_read),
        "isDismissed": bool(n.is_dismissed),
        "createdAt": n.created_at.isoformat() if n.created_at else datetime.utcnow().isoformat(),
    }


def _create_notification_record(
    db: Session,
    user_id: int,
    user_role: str,
    event: str,
    title: str,
    description: str,
    link_href: str,
    entity_id: Optional[str] = None,
) -> Optional[Notification]:
    if entity_id:
        existing = (
            db.query(Notification)
            .filter(Notification.user_id == user_id, Notification.entity_id == entity_id)
            .first()
        )
        if existing:
            return existing
    notif = Notification(
        user_id=user_id,
        user_role=user_role,
        event=event,
        title=title,
        description=description,
        link_href=link_href,
        entity_id=entity_id,
    )
    db.add(notif)
    return notif


@disputes_router.get("")
def list_my_disputes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all disputes for contracts where the authenticated user is Client or Freelancer."""
    rows = (
        db.query(Dispute)
        .filter((Dispute.client_id == current_user.id) | (Dispute.freelancer_id == current_user.id))
        .order_by(Dispute.updated_at.desc())
        .all()
    )
    return [row.data for row in rows if isinstance(row.data, dict)]


@disputes_router.post("", status_code=status.HTTP_201_CREATED)
def create_or_update_dispute(
    payload: DisputeUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or update a dispute on a contract the user belongs to, and notify the counterparty."""
    contract_db_id = resolve_entity_id(payload.contract_id, "contracts")
    contract = db.query(Contract).filter(Contract.id == contract_db_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found.")
    if current_user.id not in (contract.client_id, contract.talent_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to contract dispute.")

    existing = db.query(Dispute).filter(Dispute.contract_id == contract.id).first()
    dispute_data = dict(payload.data)
    dispute_data["contractId"] = str(contract.id)

    if existing:
        existing.status = payload.status
        existing.data = dispute_data
        db.commit()
        db.refresh(existing)
        return existing.data

    new_dispute = Dispute(
        external_id=payload.id,
        contract_id=contract.id,
        client_id=contract.client_id,
        freelancer_id=contract.talent_id,
        status=payload.status,
        data=dispute_data,
    )
    db.add(new_dispute)

    # Notify counterparty immediately in DB
    is_client_initiator = current_user.id == contract.client_id
    counterparty_id = contract.talent_id if is_client_initiator else contract.client_id
    counterparty_role = "FREELANCER" if is_client_initiator else "CLIENT"
    _create_notification_record(
        db=db,
        user_id=counterparty_id,
        user_role=counterparty_role,
        event="DISPUTE_RAISED",
        title=f"Dispute Raised on {contract.project_title}",
        description=f"{current_user.name} opened a dispute: {dispute_data.get('reason', 'Dispute opened')}",
        link_href=f"/disputes?contractId={contract.id}",
        entity_id=f"dispute-open-{contract.id}",
    )

    db.commit()
    db.refresh(new_dispute)
    return new_dispute.data


@disputes_router.put("/{disputeId}")
def update_dispute(
    disputeId: str,
    payload: DisputeUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing dispute's state (AI approval, settlement offer, resolution) and notify counterparty."""
    contract_db_id = resolve_entity_id(payload.contract_id, "contracts")
    row = (
        db.query(Dispute)
        .filter((Dispute.external_id == disputeId) | (Dispute.contract_id == contract_db_id))
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispute not found.")
    if current_user.id not in (row.client_id, row.freelancer_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to dispute.")

    prev_status = row.status
    dispute_data = dict(payload.data)
    dispute_data["contractId"] = str(row.contract_id)
    row.status = payload.status
    row.data = dispute_data

    # Notify counterparty on status transitions (including dispute resolution)
    if prev_status != payload.status:
        is_client = current_user.id == row.client_id
        counterparty_id = row.freelancer_id if is_client else row.client_id
        counterparty_role = "FREELANCER" if is_client else "CLIENT"
        is_resolved = "RESOLVED" in payload.status.upper() or "SETTLED" in payload.status.upper()
        _create_notification_record(
            db=db,
            user_id=counterparty_id,
            user_role=counterparty_role,
            event="DISPUTE_RESOLVED" if is_resolved else "DISPUTE_UPDATED",
            title=f"Dispute Resolved (Contract #{row.contract_id})" if is_resolved else f"Dispute Update (Contract #{row.contract_id})",
            description=(
                f"{current_user.name} finalized the dispute resolution on Contract #{row.contract_id}."
                if is_resolved
                else f"{current_user.name} updated dispute status to {payload.status.replace('_', ' ')}."
            ),
            link_href=f"/disputes?contractId={row.contract_id}",
            entity_id=f"dispute-{row.contract_id}-{payload.status}-{int(datetime.utcnow().timestamp())}",
        )

    db.commit()
    db.refresh(row)
    return row.data


@notifications_router.get("")
def list_my_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all non-dismissed notifications for the authenticated user."""
    rows = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_dismissed == False,  # noqa: E712
        )
        .order_by(Notification.id.desc())
        .limit(100)
        .all()
    )
    return [_format_notification(n) for n in rows]


@notifications_router.post("", status_code=status.HTTP_201_CREATED)
def create_notification(
    payload: NotificationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Persist a notification for a target user ID."""
    target_uid = resolve_entity_id(payload.user_id, "users")
    target_user = db.query(User).filter(User.id == target_uid).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found.")

    notif = _create_notification_record(
        db=db,
        user_id=target_uid,
        user_role=payload.user_role,
        event=payload.event,
        title=payload.title,
        description=payload.description,
        link_href=payload.link_href,
        entity_id=payload.entity_id,
    )
    db.commit()
    db.refresh(notif)
    return _format_notification(notif)


@notifications_router.patch("/{notifId}/read")
def mark_notification_read(
    notifId: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notif = db.query(Notification).filter(Notification.id == notifId, Notification.user_id == current_user.id).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    notif.is_read = True
    db.commit()
    return {"ok": True}


@notifications_router.post("/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).update(  # noqa: E712
        {"is_read": True}
    )
    db.commit()
    return {"ok": True}


@notifications_router.patch("/{notifId}/dismiss")
def dismiss_notification(
    notifId: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notif = db.query(Notification).filter(Notification.id == notifId, Notification.user_id == current_user.id).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    notif.is_dismissed = True
    db.commit()
    return {"ok": True}
