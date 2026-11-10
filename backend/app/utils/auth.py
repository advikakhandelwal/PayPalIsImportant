"""
TrustPay AI — Development Identity Resolver (Placeholder)
==========================================================
⚠️ SECURITY WARNING & ARCHITECTURAL BLOCKER:
This module DOES NOT implement genuine, cryptographically secure authentication.
It extracts an unverified user identifier (numeric database ID, email, or registered
demo alias) from request headers solely to simulate caller identity during local
development and API integration testing.

KNOWN SECURITY LIMITATION:
Because headers can be set arbitrarily by any HTTP client, anyone can potentially
impersonate another user. This does NOT provide production-grade access control.

EXTERNAL DEPENDENCY / TEAM BLOCKER:
Full authentication infrastructure (e.g., JWT issuance with cryptographic signature
verification, password hashing/verification, session cookies, or OAuth2) is outside
the current backend core scope and is a documented dependency/blocker for the
assigned authentication/security owner.

Once genuine authentication is delivered by the authentication owner, this function
(`get_current_user`) should be updated to:
1. Cryptographically decode and verify the Bearer token signature.
2. Validate token claims (exp, iss, sub).
3. Retrieve the authenticated User record via the verified subject claim.
"""

from typing import Optional
from fastapi import Header, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.utils.id_converter import DEMO_ID_ALIASES


def get_current_user(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency: Resolves caller identity from request headers for local development.

    ⚠️ NOTICE: This is a DEVELOPMENT IDENTITY RESOLVER, NOT GENUINE AUTHENTICATION.
    It resolves an unverified database User from client-supplied headers without
    cryptographic signature or password verification.

    Raises:
        HTTP 401 Unauthorized: If no user identity header is supplied, or if the identifier
                              does not correspond to any registered User in the database.
    """
    raw_credential: Optional[str] = None

    if x_user_id and x_user_id.strip():
        raw_credential = x_user_id.strip()
    elif authorization and authorization.strip():
        auth_header = authorization.strip()
        if auth_header.lower().startswith("bearer "):
            raw_credential = auth_header[7:].strip()
        else:
            raw_credential = auth_header

    if not raw_credential:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Caller identity required. Please provide a user ID, email, or registered alias "
                "via 'X-User-Id' or 'Authorization: Bearer <id>' header. "
                "(Note: Genuine cryptographic authentication is pending authentication owner implementation)."
            ),
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Lookup by Email
    if "@" in raw_credential:
        user = db.query(User).filter(User.email == raw_credential.lower()).first()
        if user:
            return user

    # 2. Lookup by Numeric Database Primary Key
    if raw_credential.isdigit():
        user = db.query(User).filter(User.id == int(raw_credential)).first()
        if user:
            return user

    # 3. Lookup by Registered Demo Alias (e.g. 'freelancer-vachan', 'client-fintech-corp')
    user_aliases = DEMO_ID_ALIASES.get("users", {})
    if raw_credential in user_aliases:
        user_id = user_aliases[raw_credential]
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            return user

    # If identity cannot be matched to any existing database User
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Unknown caller identity: No registered user matches identifier '{raw_credential}'.",
        headers={"WWW-Authenticate": "Bearer"},
    )
