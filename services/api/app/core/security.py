"""
VibeGPT API – Security Utilities

JWT token creation/verification and Argon2 password hashing.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

# Argon2 password hashing context
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# JWT issuer/audience — bound into every token and verified on decode so
# tokens minted for another service (or another VibeGPT environment sharing
# a key) are rejected.
TOKEN_ISSUER = "vibegpt"
TOKEN_AUDIENCE = "vibegpt"


def hash_password(password: str) -> str:
    """Hash a password using Argon2."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its Argon2 hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    subject: str,
    role: str,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Create a short-lived JWT access token."""
    settings = get_settings()
    now = datetime.now(UTC)
    expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_MINUTES)

    payload = {
        "sub": subject,
        "role": role,
        "type": "access",
        "iss": TOKEN_ISSUER,
        "aud": TOKEN_AUDIENCE,
        "iat": now,
        "exp": expire,
        "jti": str(uuid.uuid4()),
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str) -> tuple[str, str, datetime]:
    """
    Create a long-lived refresh token.
    Returns (encoded_token, token_id, expiry_datetime).
    """
    settings = get_settings()
    now = datetime.now(UTC)
    expire = now + timedelta(days=settings.JWT_REFRESH_TOKEN_DAYS)
    token_id = str(uuid.uuid4())

    payload = {
        "sub": subject,
        "type": "refresh",
        "iss": TOKEN_ISSUER,
        "aud": TOKEN_AUDIENCE,
        "iat": now,
        "exp": expire,
        "jti": token_id,
    }

    encoded = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded, token_id, expire


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token. Raises JWTError on failure.

    Enforces signature, expiry, issuer and audience.
    """
    settings = get_settings()
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        audience=TOKEN_AUDIENCE,
        issuer=TOKEN_ISSUER,
    )


def validate_password_strength(password: str) -> list[str]:
    """
    Validate password strength. Returns list of issues (empty = valid).
    """
    issues: list[str] = []
    if len(password) < 8:
        issues.append("Password must be at least 8 characters long")
    if not any(c.isupper() for c in password):
        issues.append("Password must contain at least one uppercase letter")
    if not any(c.islower() for c in password):
        issues.append("Password must contain at least one lowercase letter")
    if not any(c.isdigit() for c in password):
        issues.append("Password must contain at least one digit")
    return issues
