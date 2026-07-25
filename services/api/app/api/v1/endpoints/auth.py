"""
VibeGPT API – Authentication Endpoints

POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
GET  /api/v1/auth/me
POST /api/v1/auth/change-password
POST /api/v1/auth/mfa/enroll
POST /api/v1/auth/mfa/activate
POST /api/v1/auth/mfa/disable
"""

import hashlib
import logging
import secrets
from datetime import UTC, datetime

import pyotp
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.dependencies import AdminUser, CurrentUser, DbSession
from app.core.exceptions import AuthenticationError, ValidationError
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.models.system import AuditLog
from app.models.user import RefreshToken, User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    MfaActivateResponse,
    MfaCodeRequest,
    MfaEnrollResponse,
    TokenResponse,
    UserProfile,
)
from app.schemas.common import MessageResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.JWT_REFRESH_TOKEN_DAYS * 24 * 60 * 60,
        path="/api/v1/auth",
    )


async def _revoke_all_user_tokens(db, user_id) -> int:
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    return result.rowcount or 0


def _verify_mfa_code(user: User, code: str) -> bool:
    """Check a TOTP code or consume a one-time recovery code."""
    if not user.mfa_secret:
        return False
    secret = decrypt_secret(user.mfa_secret)
    if pyotp.TOTP(secret).verify(code, valid_window=1):
        return True
    # Recovery codes are stored hashed, single-use.
    code_hash = hashlib.sha256(code.strip().lower().encode()).hexdigest()
    codes = user.mfa_recovery_codes or []
    if code_hash in codes:
        user.mfa_recovery_codes = [c for c in codes if c != code_hash]
        return True
    return False


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, db: DbSession):
    """Authenticate with email and password (+ TOTP when enrolled)."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.hashed_password):
        raise AuthenticationError("Invalid email or password")

    if not user.is_active:
        raise AuthenticationError("Account is disabled")

    if user.is_archived:
        raise AuthenticationError("Account has been archived")

    if user.mfa_enabled and (not body.mfa_code or not _verify_mfa_code(user, body.mfa_code)):
        logger.warning("security_event status=mfa_failed email=%s", user.email)
        raise AuthenticationError("MFA code required or invalid (mfa_required)")

    # Create tokens
    access_token = create_access_token(str(user.id), user.role.value)
    refresh_token_str, token_id, expires_at = create_refresh_token(str(user.id))

    # Store refresh token hash in DB
    token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
    db_token = RefreshToken(
        id=token_id,
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(db_token)

    # Update last login
    user.last_login_at = datetime.now(UTC)

    db.add(
        AuditLog(
            user_id=user.id,
            action="user.login",
            resource_type="user",
            resource_id=str(user.id),
            ip_address=request.client.host if request.client else None,
            user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        )
    )

    await db.flush()

    # Create response with cookie
    settings = get_settings()
    response = JSONResponse(
        content={
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.JWT_ACCESS_TOKEN_MINUTES * 60,
            "role": user.role.value,
        },
        status_code=200,
    )
    _set_refresh_cookie(response, refresh_token_str)
    return response


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh_token(request: Request, db: DbSession, response: Response):
    """Rotate the refresh token and issue a new access token.

    Reuse detection: presenting an already-rotated (revoked) token means a
    stolen credential is being replayed — revoke the user's ENTIRE token
    family so both the attacker and the legitimate client must re-login.
    """
    refresh_token_str = request.cookies.get("refresh_token")
    if not refresh_token_str:
        raise AuthenticationError("Refresh token missing")

    try:
        payload = decode_token(refresh_token_str)
        if payload.get("type") != "refresh":
            raise AuthenticationError("Invalid token type")
    except Exception as e:
        raise AuthenticationError("Invalid refresh token") from e

    token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    db_token = result.scalar_one_or_none()

    if db_token is None or db_token.is_expired:
        raise AuthenticationError("Refresh token is invalid or expired")

    if db_token.is_revoked:
        # Possible token theft — kill every session for this user.
        revoked = await _revoke_all_user_tokens(db, db_token.user_id)
        logger.warning(
            "security_event status=refresh_reuse user_id=%s revoked_sessions=%s",
            db_token.user_id,
            revoked,
        )
        response.delete_cookie("refresh_token", path="/api/v1/auth")
        raise AuthenticationError("Refresh token reuse detected; all sessions revoked")

    # Get user
    user_result = await db.execute(select(User).where(User.id == db_token.user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise AuthenticationError("User not found or disabled")

    # Revoke old token
    db_token.revoked_at = datetime.now(UTC)

    # Create new tokens (rotation)
    new_access = create_access_token(str(user.id), user.role.value)
    new_refresh_str, new_token_id, new_expires = create_refresh_token(str(user.id))
    new_hash = hashlib.sha256(new_refresh_str.encode()).hexdigest()

    db_token.replaced_by = new_hash

    new_db_token = RefreshToken(
        id=new_token_id,
        user_id=user.id,
        token_hash=new_hash,
        expires_at=new_expires,
    )
    db.add(new_db_token)
    await db.flush()

    settings = get_settings()
    _set_refresh_cookie(response, new_refresh_str)

    return TokenResponse(
        access_token=new_access,
        expires_in=settings.JWT_ACCESS_TOKEN_MINUTES * 60,
        role=user.role.value,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(request: Request, db: DbSession, response: Response):
    """Revoke the refresh token and clear the cookie."""
    refresh_token_str = request.cookies.get("refresh_token")
    if refresh_token_str:
        token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == token_hash)
            .values(revoked_at=datetime.now(UTC))
        )

    response.delete_cookie("refresh_token", path="/api/v1/auth")
    return MessageResponse(message="Logged out successfully")


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all(
    request: Request, current_user: CurrentUser, db: DbSession, response: Response
):
    """Revoke every refresh token for the current user (all devices)."""
    revoked = await _revoke_all_user_tokens(db, current_user.id)
    response.delete_cookie("refresh_token", path="/api/v1/auth")
    return MessageResponse(message=f"Logged out of {revoked} session(s)")


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: CurrentUser):
    """Get the current authenticated user's profile."""
    return UserProfile(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value,
        department_id=current_user.department_id,
        semester_id=current_user.semester_id,
        avatar_url=current_user.avatar_url,
        is_active=current_user.is_active,
        mfa_enabled=current_user.mfa_enabled,
        last_login_at=current_user.last_login_at,
        created_at=current_user.created_at,
    )


@router.post("/change-password", response_model=MessageResponse)
async def change_password(body: ChangePasswordRequest, current_user: CurrentUser, db: DbSession):
    """Change the current user's password and revoke all other sessions."""
    if not verify_password(body.current_password, current_user.hashed_password):
        raise AuthenticationError("Current password is incorrect")

    issues = validate_password_strength(body.new_password)
    if issues:
        raise ValidationError("; ".join(issues))

    current_user.hashed_password = hash_password(body.new_password)
    # A password change invalidates every existing session.
    await _revoke_all_user_tokens(db, current_user.id)
    await db.flush()

    return MessageResponse(message="Password changed; all sessions were signed out")


# ── TOTP MFA (admin / super-admin accounts) ──────────────────


@router.post("/mfa/enroll", response_model=MfaEnrollResponse)
async def mfa_enroll(current_user: AdminUser, db: DbSession):
    """Begin TOTP enrollment: returns the secret + otpauth URL to scan.
    MFA becomes active only after /mfa/activate verifies a code."""
    secret = pyotp.random_base32()
    current_user.mfa_secret = encrypt_secret(secret)
    current_user.mfa_enabled = False
    await db.flush()
    return MfaEnrollResponse(
        secret=secret,
        otpauth_url=pyotp.TOTP(secret).provisioning_uri(
            name=current_user.email, issuer_name="VibeGPT"
        ),
    )


@router.post("/mfa/activate", response_model=MfaActivateResponse)
async def mfa_activate(body: MfaCodeRequest, current_user: AdminUser, db: DbSession):
    """Verify a TOTP code against the enrolled secret and enable MFA.
    Returns one-time recovery codes (shown once, stored hashed)."""
    if not current_user.mfa_secret:
        raise ValidationError("Enroll first via /mfa/enroll")

    secret = decrypt_secret(current_user.mfa_secret)
    if not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise AuthenticationError("Invalid TOTP code")

    recovery_codes = [secrets.token_hex(4) for _ in range(8)]
    current_user.mfa_enabled = True
    current_user.mfa_recovery_codes = [
        hashlib.sha256(c.encode()).hexdigest() for c in recovery_codes
    ]
    await db.flush()

    logger.info("security_event status=mfa_activated user_id=%s", current_user.id)
    return MfaActivateResponse(
        message="Two-factor authentication enabled. Store the recovery codes safely — "
        "they are shown only once.",
        recovery_codes=recovery_codes,
    )


@router.post("/mfa/disable", response_model=MessageResponse)
async def mfa_disable(body: MfaCodeRequest, current_user: AdminUser, db: DbSession):
    """Disable MFA after verifying a TOTP or recovery code."""
    if not current_user.mfa_enabled:
        return MessageResponse(message="MFA is not enabled")

    if not _verify_mfa_code(current_user, body.code):
        raise AuthenticationError("Invalid TOTP or recovery code")

    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    current_user.mfa_recovery_codes = None
    await db.flush()

    logger.info("security_event status=mfa_disabled user_id=%s", current_user.id)
    return MessageResponse(message="Two-factor authentication disabled")
