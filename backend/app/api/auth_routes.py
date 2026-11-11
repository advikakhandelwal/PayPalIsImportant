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
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.auth_schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    UserAuthResponse,
    TokenResponse,
)
from app.core.security import hash_password, verify_password, create_access_token
from app.utils.auth import get_current_user

logger = logging.getLogger("trustpay.auth_routes")
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _format_user_auth_response(user: User) -> UserAuthResponse:
    """Format SQLAlchemy User model into UserAuthResponse."""
    return UserAuthResponse(
        id=str(user.id),
        name=user.name,
        email=user.email,
        role=user.role,
        domain=user.domain,
        bio=user.bio,
        company_name=user.company_name,
        created_at=user.created_at.isoformat() if user.created_at else datetime.utcnow().isoformat(),
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
        rating=5.0,
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
        user=_format_user_auth_response(new_user),
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
        user=_format_user_auth_response(user),
    )


@router.get(
    "/me",
    response_model=UserAuthResponse,
    status_code=status.HTTP_200_OK,
)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """
    Retrieve authenticated user profile from verified JWT token.
    """
    return _format_user_auth_response(current_user)
