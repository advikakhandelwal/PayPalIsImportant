"""
TrustPay AI — Reputation & Trust Score Engine (Phase 6)
======================================================
Implements deterministic, ledger-derived reputation and trust scorecard calculations.

Guarantees:
1. Idempotency: All metrics are computed as pure aggregates from historical database records
   (contracts, milestones, submissions). Recalculating produces identical, non-inflating results.
2. Payment Confirmation Boundary:
   - Internal RELEASED/COMPLETED status indicates contractual deliverable approval.
   - Payment-related certifications (e.g. "Escrow Protected" badge) and confirmed financial
     settlement require authoritative payment capture signals coordinating with Devansh's PayPal scope.
3. Deterministic Compliance:
   - 0 revisions: 100
   - 1 revision: 85
   - 2 revisions: 70
   - 3 revisions: 55
   - Clamped between 0 and 100.
4. Role Separation:
   - Freelancer earnings and client spending are strictly isolated based on user role and relationship.
   - Handles CLIENT and FREELANCER roles, plus legacy INFLUENCER role safely mapped to talent.
5. No Fabricated Ratings:
   - Unrated users have rating = None and is_unrated = True, rather than false 5.0 stars.
6. Genuine Profile Verification for Badges:
   - "Verified Creator" requires genuine profile completeness (name, non-default domain, substantive bio)
     and at least one completed contract.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from decimal import Decimal
import logging
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.models.contract import Contract, EscrowStatus
from app.models.milestone import Milestone, MilestoneStatus
from app.models.submission import Submission

logger = logging.getLogger("trustpay.reputation_service")

# Deterministic Compliance Map per milestone revision count
REVISION_COMPLIANCE_MAP = {
    0: 100,
    1: 85,
    2: 70,
    3: 55,
}


def _normalize_to_utc_naive(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Normalize a datetime to a UTC-naive datetime for safe comparison.
    - If timezone-aware: convert to UTC, then strip tzinfo.
    - If naive: assume it already represents UTC, return as-is.
    - If None: return None.
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def is_contract_payment_confirmed(contract: Contract) -> bool:
    """
    Authoritative payment confirmation check coordinating with Devansh's PayPal integration.
    Rules:
    - Contract escrow status must be COMPLETED.
    - An authoritative capture signal (`paypal_capture_id`) must be present and non-empty.
    - An internal RELEASED status alone in the database ledger is NOT treated as proof
      of external PayPal settlement.
    """
    if contract.escrow_status != EscrowStatus.COMPLETED:
        return False
    return bool(contract.paypal_capture_id and contract.paypal_capture_id.strip())


def calculate_user_reputation(user: User, db: Session) -> Dict[str, Any]:
    """
    Pure, idempotent calculation of user reputation metrics directly from historical records.
    """
    is_client = (user.role == UserRole.CLIENT)
    is_talent = (user.role in (UserRole.FREELANCER, UserRole.INFLUENCER))

    # -------------------------------------------------------------------------
    # 1. Completed Contracts Count & Financial Ledger
    # -------------------------------------------------------------------------
    if is_client:
        completed_contracts = (
            db.query(Contract)
            .filter(
                Contract.client_id == user.id,
                Contract.escrow_status == EscrowStatus.COMPLETED,
            )
            .all()
        )
        completed_projects = len(completed_contracts)
        # Client spending: only sum contracts with confirmed PayPal payment evidence
        confirmed_contracts = [c for c in completed_contracts if is_contract_payment_confirmed(c)]
        total_earnings_or_spent = float(
            sum(c.released_amount or Decimal("0.00") for c in confirmed_contracts)
        )
    else:
        completed_contracts = (
            db.query(Contract)
            .filter(
                Contract.talent_id == user.id,
                Contract.escrow_status == EscrowStatus.COMPLETED,
            )
            .all()
        )
        completed_projects = len(completed_contracts)
        # Freelancer earnings: only sum contracts with confirmed PayPal payment evidence
        confirmed_contracts = [c for c in completed_contracts if is_contract_payment_confirmed(c)]
        total_earnings_or_spent = float(
            sum(c.released_amount or Decimal("0.00") for c in confirmed_contracts)
        )

    # -------------------------------------------------------------------------
    # 2. Rating & Client Reviews (Applicable to Freelancers)
    # -------------------------------------------------------------------------
    if is_talent:
        rated_contracts = (
            db.query(Contract)
            .filter(
                Contract.talent_id == user.id,
                Contract.client_rating.isnot(None),
            )
            .all()
        )
        if rated_contracts:
            avg_rating = round(
                sum(c.client_rating for c in rated_contracts) / len(rated_contracts), 2
            )
            is_unrated = False
        else:
            avg_rating = None
            is_unrated = True
    else:
        avg_rating = None
        is_unrated = True

    # -------------------------------------------------------------------------
    # 3. Punctuality & On-Time Delivery Rate (Milestone Deadlines)
    # -------------------------------------------------------------------------
    on_time_rate: Optional[int] = None
    if is_talent and completed_projects > 0:
        # Inspect all RELEASED milestones for completed contracts
        completed_contract_ids = [c.id for c in completed_contracts]
        milestones_with_deadlines = (
            db.query(Milestone)
            .filter(
                Milestone.contract_id.in_(completed_contract_ids),
                Milestone.status == MilestoneStatus.RELEASED,
                Milestone.deadline.isnot(None),
            )
            .all()
        )

        if milestones_with_deadlines:
            on_time_count = 0
            for m in milestones_with_deadlines:
                # Initial deliverable submission defines whether milestone was delivered on time
                subs = sorted(m.submissions, key=lambda s: s.id) if m.submissions else []
                if subs:
                    first_sub = subs[0]
                    sub_time = first_sub.submitted_at or getattr(first_sub, "created_at", None)
                    norm_sub = _normalize_to_utc_naive(sub_time)
                    norm_deadline = _normalize_to_utc_naive(m.deadline)
                    if norm_sub and norm_deadline:
                        if norm_sub <= norm_deadline:
                            on_time_count += 1
                else:
                    # No submission recorded on released milestone (unverifiable, omit)
                    pass

            on_time_rate = round((on_time_count / len(milestones_with_deadlines)) * 100)
        else:
            # Completed contracts exist, but none defined deadlines
            on_time_rate = None

    # -------------------------------------------------------------------------
    # 4. Deterministic Compliance Score (0 to 100)
    # -------------------------------------------------------------------------
    compliance_score: int = 100
    if is_talent and completed_projects > 0:
        completed_contract_ids = [c.id for c in completed_contracts]
        completed_milestones = (
            db.query(Milestone)
            .filter(
                Milestone.contract_id.in_(completed_contract_ids),
                Milestone.status == MilestoneStatus.RELEASED,
            )
            .all()
        )

        if completed_milestones:
            scores = []
            for m in completed_milestones:
                revs = getattr(m, "revision_count", 0) or 0
                if revs == 0:
                    scores.append(100)
                elif revs == 1:
                    scores.append(85)
                elif revs == 2:
                    scores.append(70)
                else:
                    scores.append(55)
            avg_comp = sum(scores) / len(scores)
            compliance_score = max(0, min(100, round(avg_comp)))
        else:
            compliance_score = 100

    # -------------------------------------------------------------------------
    # 5. Verified Platform Badges
    # -------------------------------------------------------------------------
    badges: List[str] = []
    if is_talent:
        # A. "Verified Creator": Substantive profile completeness + at least 1 completed contract
        has_real_name = bool(user.name and len(user.name.strip()) >= 2)
        has_real_domain = bool(user.domain and user.domain.strip() not in ("General", "General Talent", ""))
        has_real_bio = bool(user.bio and len(user.bio.strip()) >= 10)

        if has_real_name and has_real_domain and has_real_bio and completed_projects >= 1:
            badges.append("Verified Creator")

        # B. "Clean Code Certified": High compliance (>= 90) + at least 1 completed contract
        if completed_projects >= 1 and compliance_score >= 90:
            badges.append("Clean Code Certified")

        # C. "Top Timeliness": Maintained 95%+ on-time rate with verified deadline history
        if completed_projects >= 1 and on_time_rate is not None and on_time_rate >= 95:
            badges.append("Top Timeliness")

        # D. "Escrow Protected": At least 1 completed contract with confirmed PayPal settlement evidence
        has_confirmed_settlement = any(is_contract_payment_confirmed(c) for c in completed_contracts)
        if completed_projects >= 1 and has_confirmed_settlement:
            badges.append("Escrow Protected")

    # -------------------------------------------------------------------------
    # 6. Composite Trust Score (0.0 to 100.0)
    # -------------------------------------------------------------------------
    if is_unrated:
        # Unrated users: Trust index reflects compliance and on-time if available, else 100.0 baseline
        if on_time_rate is not None:
            trust_score = round((on_time_rate * 0.5) + (compliance_score * 0.5), 1)
        else:
            trust_score = round(float(compliance_score), 1)
    else:
        # Rated users: Balanced composite of Rating (40%), Punctuality (30%), Compliance (30%)
        effective_on_time = on_time_rate if on_time_rate is not None else 100
        effective_rating = avg_rating if avg_rating is not None else 5.0
        trust_score = round(
            ((effective_rating / 5.0) * 40.0)
            + (effective_on_time * 0.30)
            + (compliance_score * 0.30),
            1,
        )

    return {
        "rating": avg_rating,
        "is_unrated": is_unrated,
        "on_time_delivery_rate": on_time_rate,
        "compliance_score": compliance_score,
        "completed_projects": completed_projects,
        "total_earnings_or_spent": total_earnings_or_spent,
        "trust_score": trust_score,
        "badges": badges,
    }


def update_user_reputation_cache(user_id: int, db: Session) -> Optional[User]:
    """
    Atomically recalculates and persists the updated reputation metrics on the User record.
    Returns the refreshed User model.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    rep = calculate_user_reputation(user, db)

    user.rating = rep["rating"] if rep["rating"] is not None else 0.0
    user.on_time_rate = rep["on_time_delivery_rate"] if rep["on_time_delivery_rate"] is not None else 100
    user.compliance_score = rep["compliance_score"]
    user.completed_projects = rep["completed_projects"]
    user.total_earnings_or_spent = rep["total_earnings_or_spent"]
    user.trust_score = rep["trust_score"]
    user.badges = rep["badges"]

    db.add(user)
    db.commit()
    db.refresh(user)
    return user

