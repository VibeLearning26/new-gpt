"""
VibeGPT API – Pydantic Schemas for Authentication
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    # Login must accept the seeded development accounts under *.local.
    # User creation still uses EmailStr for normal production accounts.
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)
    mfa_code: str | None = Field(default=None, max_length=16)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    role: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


class MfaEnrollResponse(BaseModel):
    secret: str
    otpauth_url: str


class MfaCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=16)


class MfaActivateResponse(BaseModel):
    message: str
    recovery_codes: list[str]


class UserProfile(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    department_id: UUID | None = None
    semester_id: UUID | None = None
    avatar_url: str | None = None
    is_active: bool
    mfa_enabled: bool = False
    last_login_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
