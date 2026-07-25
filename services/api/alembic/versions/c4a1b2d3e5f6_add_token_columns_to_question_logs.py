"""Add token usage columns to question_logs.

Revision ID: c4a1b2d3e5f6
Revises: 78af08a344ac
Create Date: 2026-07-25 12:38:00.000000
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4a1b2d3e5f6"
down_revision: str | None = "78af08a344ac"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE question_logs ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER"
    )
    op.execute(
        "ALTER TABLE question_logs ADD COLUMN IF NOT EXISTS completion_tokens INTEGER"
    )
    op.execute(
        "ALTER TABLE question_logs ADD COLUMN IF NOT EXISTS total_tokens INTEGER"
    )


def downgrade() -> None:
    op.drop_column("question_logs", "total_tokens")
    op.drop_column("question_logs", "completion_tokens")
    op.drop_column("question_logs", "prompt_tokens")
