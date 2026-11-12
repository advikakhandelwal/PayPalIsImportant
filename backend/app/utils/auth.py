"""
TrustPay AI — Authentication & Authorization Dependency (Phase 7C & SEC-01 Remediation)
========================================================================================
Provides genuine cryptographic JWT authentication and role-based access control guards
for FastAPI endpoints.

Security Capabilities:
1. Validates and decodes HS256 Bearer JWT access tokens.
2. Cryptographically verifies signature, token expiration, and required claims.
3. Retrieves authenticated User record via the verified subject ('sub') claim.
4. Enforces role boundaries: CLIENT vs FREELANCER (with safe legacy INFLUENCER support).
5. SEC-01 Protection: Rejects all development identity headers (X-User-Id, non-JWT Bearer,
   numeric ID, email, alias) with HTTP 401 in production environments.
"""

import os
from typing import Optional
from fastapi import Header, Depends, HTTPException, status
from sqlalchemy.orm import Session
import jwt

from app.database import get_db
from app.models.user import User, UserRole
from app.utils.id_converter import DEMO_ID_ALIASES
from app.core.security import decode_access_token


def is_production_environment() -> bool:
    """
    Checks if running in a production environment.
    Normalizes environment detection: treats 'production', 'prod', and case variations as production.
    """
    env = os.getenv("ENVIRONMENT", "development").strip().lower()
    return env in ("production", "prod")


def is_dev_auth_allowed() -> bool:
    """
    Checks whether development/test identity resolution (X-User-Id, plain Bearer tokens, aliases)
    is permitted in the current runtime environment.

    Production Security Invariants:
    - If running in production (production, prod, and case variations), dev auth is strictly prohibited (returns False).
    - Production cannot accidentally activate dev auth.
    - Only permitted when ENVIRONMENT is explicitly 'development', 'test', 'testing', or 'local'.
    """
    if is_production_environment():
        return False
    env = os.getenv("ENVIRONMENT", "development").strip().lower()
    return env in ("development", "test", "testing", "local", "dev")


def get_current_user(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency: Resolves and cryptographically authenticates the caller.

    Authentication Flow:
    1. If 'Authorization: Bearer <jwt>' is provided, decodes and verifies the JWT signature and expiration.
    2. If JWT is expired or tampered, raises HTTP 401 Unauthorized immediately.
    3. In production: any missing token, plain Bearer token, or X-User-Id header is rejected with 401.
    4. In development/test environments: permits development resolution against registered demo aliases
       or database primary keys for local regression testing.
    5. If no identity is provided, raises HTTP 401 Unauthorized.
    """
    raw_credential: Optional[str] = None
    is_bearer = False

    if authorization and authorization.strip():
        auth_header = authorization.strip()
        if auth_header.lower().startswith("bearer "):
            raw_credential = auth_header[7:].strip()
            is_bearer = True
        else:
            raw_credential = auth_header
    elif x_user_id and x_user_id.strip():
        raw_credential = x_user_id.strip()

    if not raw_credential:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Caller identity required. Please provide a valid Bearer JWT token in the 'Authorization' header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # -----------------------------------------------------------------------
    # 1. Cryptographic JWT Verification
    # -----------------------------------------------------------------------
    # A standard JWT consists of three base64url-encoded parts separated by dots
    if is_bearer and len(raw_credential.split(".")) == 3:
        try:
            payload = decode_access_token(raw_credential)
            subject = payload.get("sub")
            if not subject:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing subject claim ('sub').",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Query database for user matching token subject
            user = db.query(User).filter(User.id == int(subject)).first()
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User belonging to this token no longer exists.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return user

        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token signature or malformed token.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # -----------------------------------------------------------------------
    # 2. Production Environment Guard (SEC-01)
    # -----------------------------------------------------------------------
    # In production, legacy development identity headers and plain Bearer tokens
    # are strictly rejected with HTTP 401 Unauthorized.
    if not is_dev_auth_allowed():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Authentication failed: Production requires a valid cryptographically signed Bearer JWT token. "
                "Development identity headers and unverified Bearer tokens are disabled in production."
            ),
            headers={"WWW-Authenticate": "Bearer"},
        )

    # -----------------------------------------------------------------------
    # 3. Development / Test Identity Resolution (Only when explicitly permitted)
    # -----------------------------------------------------------------------
    # Email lookup
    if "@" in raw_credential:
        user = db.query(User).filter(User.email == raw_credential.lower()).first()
        if user:
            return user

    # Numeric primary key lookup
    if raw_credential.isdigit():
        user = db.query(User).filter(User.id == int(raw_credential)).first()
        if user:
            return user

    # Registered demo aliases (e.g. 'client-fintech-corp', 'freelancer-vachan')
    user_aliases = DEMO_ID_ALIASES.get("users", {})
    if raw_credential in user_aliases:
        user_id = user_aliases[raw_credential]
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            return user

    # Unrecognized identity in development
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Unknown caller identity: No registered user matches identifier '{raw_credential}'.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_client(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that enforces caller has the CLIENT role."""
    if current_user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User '{current_user.name}' has role '{current_user.role.value}'. This action is restricted to CLIENT accounts.",
        )
    return current_user


def require_freelancer(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that enforces caller has the FREELANCER role (or legacy INFLUENCER)."""
    if current_user.role not in (UserRole.FREELANCER, UserRole.INFLUENCER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User '{current_user.name}' has role '{current_user.role.value}'. This action is restricted to FREELANCER accounts.",
        )
    return current_user


def get_optional_current_user(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Resolve authenticated user if valid credentials are provided; otherwise return None."""
    if not authorization and not x_user_id:
        return None
    try:
        return get_current_user(x_user_id=x_user_id, authorization=authorization, db=db)
    except HTTPException:
        return None
