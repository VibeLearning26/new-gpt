"""
Security regression tests: subject-based retrieval isolation.

These prove the authorization/publication predicates are compiled INTO the
vector query (enforced by the database), not applied after fetching rows.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.dialects import postgresql

from app.api.v1.endpoints.student import _require_subject_access
from app.core.exceptions import AuthorizationError
from app.rag.retrieval import RetrievalService


@pytest.fixture
def mock_embedding_service():
    with patch("app.rag.retrieval.EmbeddingService") as cls:
        instance = MagicMock()
        instance.embed_query.return_value = [0.1] * 384
        cls.return_value = instance
        yield instance


def _compiled_sql(stmt) -> str:
    return str(stmt.compile(dialect=postgresql.dialect()))


@pytest.mark.asyncio
async def test_retrieval_enforces_subject_and_published_filters_in_sql(
    mock_embedding_service,
):
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.unique.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    service = RetrievalService(mock_db)
    subject_id = uuid.uuid4()
    await service.search_chunks_with_scores(
        "quantum effects", subject_id=subject_id, top_k=5, threshold=0.8
    )

    stmt = mock_db.execute.call_args.args[0]
    sql = _compiled_sql(stmt)

    # Publication + activation + subject isolation must all be SQL predicates.
    assert "documents.status" in sql
    assert "documents.is_active" in sql
    assert "document_chunks.is_active" in sql
    assert "documents.subject_id" in sql

    # The subject id is bound as a parameter, never string-interpolated.
    compiled = stmt.compile(dialect=postgresql.dialect())
    assert subject_id in compiled.params.values()


@pytest.mark.asyncio
async def test_retrieval_scopes_module_only_when_provided(mock_embedding_service):
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.unique.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result
    service = RetrievalService(mock_db)

    await service.search_chunks_with_scores("q", subject_id=uuid.uuid4())
    sql_no_module = _compiled_sql(mock_db.execute.call_args.args[0])
    assert "documents.module_id" not in sql_no_module

    module_id = uuid.uuid4()
    await service.search_chunks_with_scores(
        "q", subject_id=uuid.uuid4(), module_id=module_id
    )
    stmt = mock_db.execute.call_args.args[0]
    assert "documents.module_id" in _compiled_sql(stmt)
    assert module_id in stmt.compile(dialect=postgresql.dialect()).params.values()


@pytest.mark.asyncio
async def test_retrieval_orders_by_distance_and_limits(mock_embedding_service):
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.unique.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result
    service = RetrievalService(mock_db)

    await service.search_chunks_with_scores("q", subject_id=uuid.uuid4(), top_k=3)
    sql = _compiled_sql(mock_db.execute.call_args.args[0])
    assert "ORDER BY" in sql
    assert "LIMIT" in sql


@pytest.mark.asyncio
async def test_subject_access_denied_without_permission_or_cohort():
    """A student with no grant and no cohort match gets no subject access."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    user = MagicMock(id=uuid.uuid4(), department_id=None, semester_id=None)
    with pytest.raises(AuthorizationError):
        await _require_subject_access(uuid.uuid4(), user, mock_db)


@pytest.mark.asyncio
async def test_subject_access_allowed_when_grant_exists():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = MagicMock()  # access row found
    mock_db.execute.return_value = mock_result

    user = MagicMock(id=uuid.uuid4(), department_id=None, semester_id=None)
    # Should not raise.
    await _require_subject_access(uuid.uuid4(), user, mock_db)
