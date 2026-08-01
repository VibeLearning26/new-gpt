"""Persist generated engineering drawings with chat answers.

Revision ID: b4c5d6e7f8a9
Revises: a3c4d5e6f7b8
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b4c5d6e7f8a9"
down_revision: str | None = "a3c4d5e6f7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("question_logs", sa.Column("drawing_result", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("question_logs", "drawing_result")
