"""
VibeGPT API – FastAPI Dependencies

Common dependencies for auth, DB sessions, and role checking.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, AuthorizationError
from app.core.security import decode_token
from app.database.session import get_db
from app.models.user import User, UserRole

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Extract and validate the current user from the JWT access token."""
    if credentials is None:
        raise AuthenticationError("Authorization header missing")

    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise AuthenticationError("Invalid token type")

        user_id = payload.get("sub")
        if user_id is None:
            raise AuthenticationError("Token missing subject")

    except JWTError as e:
        raise AuthenticationError("Invalid or expired token") from e

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()

    if user is None:
        raise AuthenticationError("User not found")
    if not user.is_active:
        raise AuthenticationError("User account is disabled")
    if user.is_archived:
        raise AuthenticationError("User account has been archived")

    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Alias for get_current_user (already checks active status)."""
    return current_user


def require_role(*roles: UserRole):
    """
    FastAPI dependency factory that checks if the user has one of the specified roles.

    Usage:
        @router.get("/admin-only", dependencies=[Depends(require_role(UserRole.ADMIN))])
    """

    async def role_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role not in roles:
            raise AuthorizationError(
                f"This action requires one of these roles: {', '.join(r.value for r in roles)}"
            )
        return current_user

    return role_checker


# Convenience typed dependencies
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN))]
SuperAdminUser = Annotated[User, Depends(require_role(UserRole.SUPER_ADMIN))]
# Admins keep the full student experience (chat, models, sessions) so the
# admin "Student view" works exactly like the student login.
StudentUser = Annotated[
    User, Depends(require_role(UserRole.STUDENT, UserRole.ADMIN, UserRole.SUPER_ADMIN))
]
DbSession = Annotated[AsyncSession, Depends(get_db)]
