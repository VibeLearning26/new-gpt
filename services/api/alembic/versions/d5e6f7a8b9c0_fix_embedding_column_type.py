"""Fix document_chunks.embedding column type to pgvector.

The table predates the vector-aware schema, so the embedding column was
created as JSON. Retrieval (cosine distance) requires the pgvector type.
Existing JSON-array embeddings are converted in place.

Revision ID: d5e6f7a8b9c0
Revises: c4a1b2d3e5f6
Create Date: 2026-07-25 14:45:00.000000
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d5e6f7a8b9c0"
down_revision: str | None = "c4a1b2d3e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute(
        "ALTER TABLE document_chunks "
        "ALTER COLUMN embedding TYPE vector(384) "
        "USING embedding::text::vector(384)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE document_chunks "
        "ALTER COLUMN embedding TYPE json "
        "USING to_json(embedding::real[])"
    )
