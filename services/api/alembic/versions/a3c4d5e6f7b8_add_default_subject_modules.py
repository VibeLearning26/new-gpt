"""Add missing default modules 1-4 to existing subjects.

Revision ID: a3c4d5e6f7b8
Revises: f2a3b4c5d6e7
Create Date: 2026-07-26 12:00:00.000000
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3c4d5e6f7b8"
down_revision: str | None = "f2a3b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DESCRIPTION = "Default curriculum module"


def upgrade() -> None:
    connection = op.get_bind()
    subject_ids = connection.execute(sa.text("SELECT id FROM subjects")).scalars()

    for subject_id in subject_ids:
        existing_numbers = set(
            connection.execute(
                sa.text(
                    "SELECT number FROM modules "
                    "WHERE subject_id = :subject_id AND archived_at IS NULL"
                ),
                {"subject_id": subject_id},
            ).scalars()
        )
        for number in range(1, 5):
            if number in existing_numbers:
                continue
            connection.execute(
                sa.text(
                    "INSERT INTO modules "
                    "(id, name, number, description, subject_id, is_active, "
                    "created_at, updated_at, archived_at) "
                    "VALUES (:id, :name, :number, :description, :subject_id, "
                    "TRUE, NOW(), NOW(), NULL)"
                ),
                {
                    "id": uuid.uuid4(),
                    "name": f"Module {number}",
                    "number": number,
                    "description": _DESCRIPTION,
                    "subject_id": subject_id,
                },
            )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM modules WHERE description = :description").bindparams(
            description=_DESCRIPTION
        )
    )
