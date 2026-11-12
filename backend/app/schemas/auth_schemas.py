"""
TrustPay AI — Authentication Pydantic Schemas (Phase 7B & SEC-05 Remediation)
==============================================================================
Request and response schemas for user registration, login, and authentication tokens.
Enforces the 72-byte bcrypt limit and two platform roles: CLIENT and FREELANCER.
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator
import re

from app.models.user import UserRole
from app.schemas.marketplace_schemas import TrustScorecardData


def _normalize_and_validate_email(v: str) -> str:
    clean = v.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", clean):
        raise ValueError("Invalid email format.")
    return clean


def _validate_new_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters.")
    byte_length = len(v.encode("utf-8"))
    if byte_length > 72:
        raise ValueError(
            f"Password exceeds maximum allowed length of 72 bytes (provided: {byte_length} bytes). "
            "Please choose a shorter password."
        )
    return v


class BaseAuthSchema(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class UserRegisterRequest(BaseModel):
    """Payload for user registration."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters.")
    role: str = Field(..., description="Must be either CLIENT or FREELANCER.")
    domain: Optional[str] = Field("General", max_length=120)
    bio: Optional[str] = Field(None)
    company_name: Optional[str] = Field(None, alias="companyName", max_length=120)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", clean):
            raise ValueError("Invalid email format.")
        return clean

    @field_validator("password")
    @classmethod
    def validate_password_byte_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        byte_length = len(v.encode("utf-8"))
        if byte_length > 72:
            raise ValueError(
                f"Password exceeds maximum allowed length of 72 bytes (provided: {byte_length} bytes). "
                "Please choose a shorter password."
            )
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        normalized = v.strip().upper()
        if normalized not in (UserRole.CLIENT.value, UserRole.FREELANCER.value):
            raise ValueError(
                f"Invalid role '{v}'. Registration is restricted to 'CLIENT' or 'FREELANCER'."
            )
        return normalized

    @field_validator("name")
    @classmethod
    def validate_name_not_blank(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Name cannot be empty or whitespace.")
        return clean


class UserLoginRequest(BaseModel):
    """Payload for user authentication."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    email: str = Field(...)
    password: str = Field(..., description="Password to authenticate.")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password_byte_length(cls, v: str) -> str:
        byte_length = len(v.encode("utf-8"))
        if byte_length > 72:
            raise ValueError(
                f"Password exceeds maximum allowed length of 72 bytes (provided: {byte_length} bytes)."
            )
        return v


class UserProfileUpdateRequest(BaseModel):
    """Payload for updating user profile."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    name: Optional[str] = Field(None, min_length=1, max_length=120)
    domain: Optional[str] = Field(None, max_length=120)
    bio: Optional[str] = Field(None)
    company_name: Optional[str] = Field(None, alias="companyName", max_length=120)
    paypal_payout_email: Optional[str] = Field(None, alias="paypalPayoutEmail", max_length=255)
    city: Optional[str] = Field(None, max_length=120)
    state: Optional[str] = Field(None, max_length=120)
    country: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None)
    postal_code: Optional[str] = Field(None, alias="postalCode", max_length=40)
    skills: Optional[List[str]] = Field(None)
    experience_years: Optional[int] = Field(None, alias="experienceYears", ge=0, le=80)
    education: Optional[List[str]] = Field(None)

    @field_validator("paypal_payout_email")
    @classmethod
    def validate_payout_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        clean = v.strip().lower()
        if not clean:
            return ""
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", clean):
            raise ValueError("Invalid PayPal payout email format.")
        return clean


class UserAuthResponse(BaseAuthSchema):
    """Public user profile returned upon authentication."""
    id: str
    name: str
    email: str
    role: UserRole
    domain: Optional[str] = None
    bio: Optional[str] = None
    company_name: Optional[str] = Field(None, serialization_alias="companyName")
    paypal_payout_email: Optional[str] = Field(None, serialization_alias="paypalPayoutEmail")
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = Field(None, serialization_alias="postalCode")
    skills: Optional[List[str]] = None
    experience_years: Optional[int] = Field(None, serialization_alias="experienceYears")
    education: Optional[List[str]] = None
    created_at: Optional[str] = Field(None, serialization_alias="createdAt")
    trust_scorecard: Optional[TrustScorecardData] = Field(None, serialization_alias="trustScorecard")


class TokenResponse(BaseAuthSchema):
    """JWT bearer token and authenticated user payload."""
    access_token: str = Field(..., serialization_alias="accessToken")
    token_type: str = Field("bearer", serialization_alias="tokenType")
    user: UserAuthResponse


class ForgotPasswordRequest(BaseModel):
    """Payload to initiate a password reset."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    email: str = Field(..., min_length=3, max_length=255)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        return _normalize_and_validate_email(v)


class ForgotPasswordResponse(BaseAuthSchema):
    """Response from initiating a password reset."""
    message: str
    reset_token: Optional[str] = Field(None, serialization_alias="resetToken")
    expires_in_minutes: int = Field(15, serialization_alias="expiresInMinutes")


class ResetPasswordRequest(BaseModel):
    """Payload to complete a password reset using a verified reset token."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    token: str = Field(..., min_length=10)
    new_password: str = Field(..., alias="newPassword", min_length=8)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_new_password(v)
