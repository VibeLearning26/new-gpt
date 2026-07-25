"""
VibeGPT API – Symmetric encryption helper.

Encrypts at-rest secrets (currently TOTP enrollment secrets) using Fernet
with a key derived from JWT_SECRET_KEY. Rotating JWT_SECRET_KEY requires
re-enrolling MFA secrets.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(
        hashlib.sha256(get_settings().JWT_SECRET_KEY.encode()).digest()
    )
    return Fernet(key)


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Unable to decrypt secret (key rotated?)") from exc
