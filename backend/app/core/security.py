"""
TrustPay AI — Cryptographic Security Module (Phase 7A & 7C Remediation)
========================================================================
Provides bcrypt password hashing/verification and HS256 JWT token
creation/decoding with strict production secret enforcement.

Security Standards:
- Production (ENVIRONMENT=production) fails startup if JWT_SECRET_KEY is missing or < 32 bytes.
- Enforces HS256 algorithm explicitly.
- Bcrypt enforces UTF-8 byte length limit of 72 bytes defensively.
- Secret values are never logged or exposed.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

# ---------------------------------------------------------------------------
# Configuration & Secret Management
# ---------------------------------------------------------------------------
JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
BCRYPT_MAX_BYTES: int = 72


def is_production_environment() -> bool:
    """
    Checks if running in a production environment.
    Normalizes environment detection: treats 'production', 'prod', and case variations as production.
    """
    env = os.getenv("ENVIRONMENT", "development").strip().lower()
    return env in ("production", "prod")


def validate_jwt_configuration() -> None:
    """
    Validates JWT configuration parameters at application startup.
    Fails fast in production if JWT_SECRET_KEY is missing or weak (< 32 bytes).
    Never logs or prints the secret value.
    """
    secret = os.getenv("JWT_SECRET_KEY")

    if is_production_environment():
        if not secret:
            raise RuntimeError(
                "FATAL CONFIGURATION ERROR: In production, the 'JWT_SECRET_KEY' environment variable "
                "is mandatory and must be explicitly set."
            )
        if len(secret.encode("utf-8")) < 32:
            raise RuntimeError(
                "FATAL CONFIGURATION ERROR: In production, 'JWT_SECRET_KEY' must be at least 32 bytes "
                "(256 bits) long for secure HS256 signing."
            )


def get_jwt_secret_key() -> str:
    """
    Returns the active JWT secret key.
    Guarantees no predictable default is ever returned in a production environment.
    """
    secret = os.getenv("JWT_SECRET_KEY")

    if is_production_environment():
        if not secret or len(secret.encode("utf-8")) < 32:
            raise RuntimeError(
                "FATAL CONFIGURATION ERROR: In production, 'JWT_SECRET_KEY' must be at least 32 bytes."
            )
        return secret

    # Safe fallback strictly for local development and unit tests
    return secret or "trustpay-dev-secret-key-change-in-production-only-min-32-chars"


# Module-level alias for development/testing compatibility
JWT_SECRET_KEY: str = get_jwt_secret_key()


# ---------------------------------------------------------------------------
# Password Hashing (bcrypt)
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    """
    Hash a plaintext password using bcrypt.
    Enforces the bcrypt 72-byte limit on UTF-8 bytes to prevent truncation or exceptions.
    """
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > BCRYPT_MAX_BYTES:
        raise ValueError(
            f"Password exceeds maximum allowed length of {BCRYPT_MAX_BYTES} bytes "
            f"(provided: {len(password_bytes)} bytes)."
        )
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plaintext password against a stored bcrypt hash.
    Safely rejects oversized passwords (> 72 bytes) and invalid hashes without raising.
    """
    try:
        plain_bytes = plain_password.encode("utf-8")
        if len(plain_bytes) > BCRYPT_MAX_BYTES:
            return False
        return bcrypt.checkpw(
            plain_bytes,
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# JWT Token Management
# ---------------------------------------------------------------------------
def create_access_token(
    subject: str,
    role: str,
    email: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a signed HS256 JWT access token.

    Claims:
        sub   — User ID (string)
        email — User email
        role  — UserRole value (CLIENT / FREELANCER)
        exp   — Expiration timestamp (UTC)
    """
    secret_key = get_jwt_secret_key()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {
        "sub": str(subject),
        "email": email,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, secret_key, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and verify a JWT access token using HS256.

    Raises:
        jwt.ExpiredSignatureError — Token has expired.
        jwt.InvalidTokenError    — Token is malformed or signature is invalid.

    Returns:
        dict with verified 'sub', 'email', 'role', 'exp' claims.
    """
    secret_key = get_jwt_secret_key()
    return jwt.decode(token, secret_key, algorithms=[JWT_ALGORITHM])
