"""
VibeGPT API – Authentication Endpoints

POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
POST /api/v1/auth/change-password
"""

import hashlib
from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.dependencies import CurrentUser, DbSession
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
    TokenResponse,
    UserProfile,
)
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, db: DbSession):
    """Authenticate with email and password. Returns access token and sets refresh cookie."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.hashed_password):
        raise AuthenticationError("Invalid email or password")

    if not user.is_active:
        raise AuthenticationError("Account is disabled")

    if user.is_archived:
        raise AuthenticationError("Account has been archived")

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
    response.set_cookie(
        key="refresh_token",
        value=refresh_token_str,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.JWT_REFRESH_TOKEN_DAYS * 24 * 60 * 60,
        path="/api/v1/auth",
    )
    return response


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, db: DbSession, response: Response):
    """Rotate the refresh token and issue a new access token."""
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

    if db_token is None or db_token.is_revoked or db_token.is_expired:
        raise AuthenticationError("Refresh token is invalid or expired")

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
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_str,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.JWT_REFRESH_TOKEN_DAYS * 24 * 60 * 60,
        path="/api/v1/auth",
    )

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
        last_login_at=current_user.last_login_at,
        created_at=current_user.created_at,
    )


@router.post("/change-password", response_model=MessageResponse)
async def change_password(body: ChangePasswordRequest, current_user: CurrentUser, db: DbSession):
    """Change the current user's password."""
    if not verify_password(body.current_password, current_user.hashed_password):
        raise AuthenticationError("Current password is incorrect")

    issues = validate_password_strength(body.new_password)
    if issues:
        raise ValidationError("; ".join(issues))

    current_user.hashed_password = hash_password(body.new_password)
    await db.flush()

    return MessageResponse(message="Password changed successfully")
