"""Add TOTP MFA columns to users.

Revision ID: f2a3b4c5d6e7
Revises: e7f8a9b0c1d2
Create Date: 2026-07-25 21:03:00.000000
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(512)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_codes JSON")


def downgrade() -> None:
    op.drop_column("users", "mfa_recovery_codes")
    op.drop_column("users", "mfa_secret")
    op.drop_column("users", "mfa_enabled")
