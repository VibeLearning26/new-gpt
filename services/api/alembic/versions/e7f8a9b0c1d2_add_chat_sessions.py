"""Add chat sessions and link question_logs to them.

Revision ID: e7f8a9b0c1d2
Revises: d5e6f7a8b9c0
Create Date: 2026-07-25 17:22:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("subject_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("model_name", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])
    op.execute(
        "ALTER TABLE question_logs ADD COLUMN IF NOT EXISTS session_id UUID"
    )
    op.execute(
        "ALTER TABLE question_logs "
        "ADD CONSTRAINT fk_question_logs_session_id "
        "FOREIGN KEY (session_id) REFERENCES chat_sessions (id)"
    )
    op.create_index("ix_question_logs_session_id", "question_logs", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_question_logs_session_id", table_name="question_logs")
    op.drop_constraint("fk_question_logs_session_id", "question_logs", type_="foreignkey")
    op.drop_column("question_logs", "session_id")
    op.drop_index("ix_chat_sessions_user_id", table_name="chat_sessions")
    op.drop_table("chat_sessions")
