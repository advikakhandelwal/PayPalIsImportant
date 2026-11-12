"""
TrustPay AI — Authentication API Endpoints (Phase 7B & SEC-06 Remediation)
===========================================================================
Implements:
- POST /api/auth/register (User registration for CLIENT and FREELANCER roles)
- POST /api/auth/login    (Authentication via email + password, issues JWT)
- GET  /api/auth/me       (Fetch authenticated user profile)

Security Standards:
- Zero credential hardcoding or demo backdoors.
- Passwords verified strictly using bcrypt cryptographic checking.
"""

import logging
from typing import Optional
from datetime import datetime
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.auth_schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    UserProfileUpdateRequest,
    UserAuthResponse,
    TokenResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
)
from app.schemas.marketplace_schemas import TrustScorecardData
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    is_production_environment,
)
from app.utils.auth import get_current_user
from app.services.reputation_service import calculate_user_reputation

logger = logging.getLogger("trustpay.auth_routes")
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _format_user_auth_response(user: User, db: Optional[Session] = None) -> UserAuthResponse:
    """Format SQLAlchemy User model into UserAuthResponse including reputation scorecard."""
    scorecard = None
    if db:
        rep = calculate_user_reputation(user, db)
        scorecard = TrustScorecardData(
            rating=rep["rating"],
            on_time_delivery_rate=rep["on_time_delivery_rate"],
            compliance_score=rep["compliance_score"],
            completed_projects=rep["completed_projects"],
            total_earnings_or_spent=rep["total_earnings_or_spent"],
            currency=rep.get("currency", "USD"),
            badges=rep["badges"],
            is_unrated=rep["is_unrated"],
        )
    elif user.trust_score is not None:
        has_ratings = bool(user.rating is not None and user.rating > 0.0)
        scorecard = TrustScorecardData(
            rating=float(user.rating) if has_ratings else None,
            on_time_delivery_rate=int(user.on_time_rate) if user.on_time_rate is not None else None,
            compliance_score=int(user.compliance_score) if user.compliance_score is not None else 100,
            completed_projects=int(user.completed_projects) if user.completed_projects is not None else 0,
            total_earnings_or_spent=float(user.total_earnings_or_spent) if user.total_earnings_or_spent is not None else 0.0,
            currency="USD",
            badges=user.badges if user.badges else [],
            is_unrated=not has_ratings,
        )

    return UserAuthResponse(
        id=str(user.id),
        name=user.name,
        email=user.email,
        role=user.role,
        domain=user.domain,
        bio=user.bio,
        company_name=user.company_name,
        paypal_payout_email=getattr(user, "paypal_payout_email", None),
        city=getattr(user, "city", None),
        state=getattr(user, "state", None),
        country=getattr(user, "country", None),
        address=getattr(user, "address", None),
        postal_code=getattr(user, "postal_code", None),
        skills=getattr(user, "skills", None) or [],
        experience_years=getattr(user, "experience_years", None),
        education=getattr(user, "education", None) or [],
        created_at=user.created_at.isoformat() if user.created_at else datetime.utcnow().isoformat(),
        trust_scorecard=scorecard,
    )


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user account.
    Validates role (strictly CLIENT or FREELANCER), email uniqueness, password strength (<= 72 bytes),
    hashes the password using bcrypt, and returns an access token with user profile.
    """
    # 1. Check email uniqueness
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{payload.email}' is already registered.",
        )

    # 2. Hash password
    hashed = hash_password(payload.password)

    # 3. Create user
    new_user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hashed,
        role=UserRole(payload.role),
        domain=payload.domain or "General",
        bio=payload.bio,
        company_name=payload.company_name,
        rating=0.0,
        on_time_rate=100,
        compliance_score=100,
        completed_projects=0,
        total_earnings_or_spent=0.0,
        badges=[],
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # 4. Generate JWT
    access_token = create_access_token(
        subject=str(new_user.id),
        role=new_user.role.value,
        email=new_user.email,
    )

    logger.info(f"Registered new user '{new_user.email}' with role '{new_user.role.value}' (ID: {new_user.id})")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=_format_user_auth_response(new_user, db),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
)
def login_user(payload: UserLoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate user with email and password, issuing an HS256 JWT access token.
    Enforces strict cryptographic bcrypt verification. Zero hardcoded bypasses.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Cryptographically verify password against stored bcrypt hash
    is_valid = verify_password(payload.password, user.hashed_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        subject=str(user.id),
        role=user.role.value,
        email=user.email,
    )

    logger.info(f"User '{user.email}' logged in successfully (ID: {user.id})")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=_format_user_auth_response(user, db),
    )


@router.get(
    "/me",
    response_model=UserAuthResponse,
    status_code=status.HTTP_200_OK,
)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve authenticated user profile from verified JWT token.
    """
    return _format_user_auth_response(current_user, db)


@router.patch(
    "/profile",
    response_model=UserAuthResponse,
    status_code=status.HTTP_200_OK,
)
def update_profile(
    payload: UserProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update authenticated user's profile details.
    """
    if payload.name is not None and payload.name.strip():
        current_user.name = payload.name.strip()
    if payload.domain is not None:
        current_user.domain = payload.domain.strip()
    if payload.bio is not None:
        current_user.bio = payload.bio.strip()
    if payload.company_name is not None:
        current_user.company_name = payload.company_name.strip()
    if payload.paypal_payout_email is not None:
        current_user.paypal_payout_email = payload.paypal_payout_email.strip().lower() or None
    if payload.city is not None:
        current_user.city = payload.city.strip() or None
    if payload.state is not None:
        current_user.state = payload.state.strip() or None
    if payload.country is not None:
        current_user.country = payload.country.strip() or None
    if payload.address is not None:
        current_user.address = payload.address.strip() or None
    if payload.postal_code is not None:
        current_user.postal_code = payload.postal_code.strip() or None
    if payload.skills is not None:
        current_user.skills = [s.strip() for s in payload.skills if s and s.strip()]
    if payload.experience_years is not None:
        current_user.experience_years = payload.experience_years
    if payload.education is not None:
        current_user.education = [e.strip() for e in payload.education if e and e.strip()]

    db.commit()
    db.refresh(current_user)
    return _format_user_auth_response(current_user, db)


@router.post("/verify-password", status_code=status.HTTP_200_OK)
def verify_owner_password(
    payload: dict,
    current_user: User = Depends(get_current_user),
):
    """
    Step-up security verification: confirms the logged-in owner's password
    before initiating sensitive escrow funding or payment transfers.
    """
    raw_password = str(payload.get("password") or "")
    if not raw_password or not verify_password(raw_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Incorrect account password. Owner verification failed.",
        )
    return {"verified": True, "userId": str(current_user.id)}


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    status_code=status.HTTP_200_OK,
)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Generate a 15-minute, single-use password reset token for the requested email.
    In non-production environments (e.g. local/LAN demo without SMTP), returns the
    reset token so the user can complete the reset directly in the UI.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    reset_token: Optional[str] = None
    if user:
        token = create_password_reset_token(
            user_id=str(user.id),
            email=user.email,
            password_hash_prefix=user.hashed_password[:12],
            expires_minutes=15,
        )
        logger.info(f"Generated password reset token for user ID {user.id}")
        if not is_production_environment():
            reset_token = token

    return ForgotPasswordResponse(
        message="If an account with that email exists, a password reset token has been generated.",
        reset_token=reset_token,
        expires_in_minutes=15,
    )


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Verify a single-use password reset token and update the user's bcrypt password hash.
    """
    try:
        claims = decode_password_reset_token(payload.token.strip())
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset token has expired. Please request a new one.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password reset token.",
        )

    user_id = claims.get("sub")
    user = db.query(User).filter(User.id == int(user_id)).first() if user_id and str(user_id).isdigit() else None
    if not user or user.email != claims.get("email") or user.hashed_password[:12] != claims.get("pwh"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset token is no longer valid or has already been used.",
        )

    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    logger.info(f"Password reset completed for user ID {user.id}")
    return {"message": "Password has been reset successfully. You can now log in."}
