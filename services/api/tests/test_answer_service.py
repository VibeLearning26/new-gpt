"""
Unit tests for AnswerService (Task V2 – RAG Orchestration).

All external dependencies (OllamaClient, RetrievalService, DB session) are mocked
so tests run without a live database or Ollama server.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.answer_rule import AnswerRule
from app.models.document import DocumentChunk
from app.models.question import AnswerStatus
from app.rag.answer_service import AnswerService
from app.rag.ollama_client import OllamaConnectionError, OllamaTimeoutError
from app.rag.prompt_builder import PromptBuilder
from app.schemas.question import AnswerResponse

# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_rule(
    marks: int = 5,
    min_words: int = 50,
    max_words: int = 100,
    require_citations: bool = True,
    use_bullet_points: bool = False,
    required_sections: list | None = None,
    require_example: bool = False,
    require_conclusion: bool = False,
    require_formula: bool = False,
    num_points: int | None = None,
    preferred_style: str | None = "academic",
) -> AnswerRule:
    """Create a minimal in-memory AnswerRule (not persisted to DB)."""
    rule = AnswerRule(
        marks=marks,
        name=f"Test {marks}-Mark Rule",
        min_words=min_words,
        max_words=max_words,
        require_citations=require_citations,
        use_bullet_points=use_bullet_points,
        required_sections=required_sections,
        require_example=require_example,
        require_conclusion=require_conclusion,
        require_formula=require_formula,
        num_points=num_points,
        preferred_style=preferred_style,
    )
    return rule


def make_chunk(content: str = "This is a test chunk.", page_number: int = 1) -> DocumentChunk:
    """Create a minimal mock DocumentChunk."""
    chunk = MagicMock(spec=DocumentChunk)
    chunk.id = uuid.uuid4()
    chunk.content = content
    chunk.page_number = page_number
    chunk.slide_number = None
    chunk.document_id = uuid.uuid4()
    chunk.document = MagicMock()
    chunk.document.document_name = "Introduction to Testing"
    return chunk


def make_db_session(log_id: uuid.UUID | None = None) -> AsyncMock:
    """Create a mock AsyncSession that simulates flush/refresh behavior."""
    db = AsyncMock()

    mock_log = MagicMock()
    mock_log.id = log_id or uuid.uuid4()
    mock_log.answer_status = AnswerStatus.COMPLETED
    mock_log.answer = "Generated answer text."
    mock_log.word_count = 10
    mock_log.marks = 5
    mock_log.question = "What is testing?"
    mock_log.model_name = "llama3.2:3b"
    mock_log.processing_time_ms = 200
    mock_log.created_at = datetime.now(timezone.utc)
    mock_log.validation_result = {}

    # Simulate db.add(), db.flush(), db.refresh() adding id and created_at to log
    async def refresh_side_effect(obj):
        if hasattr(obj, "id") and obj.id is None:
            obj.id = log_id or uuid.uuid4()
        if hasattr(obj, "created_at") and obj.created_at is None:
            obj.created_at = datetime.now(timezone.utc)

    db.flush = AsyncMock()
    db.refresh = AsyncMock(side_effect=refresh_side_effect)
    db.add = MagicMock()

    return db


# ─── Tests: PromptBuilder ──────────────────────────────────────────────────────

class TestPromptBuilder:
    """Tests for the PromptBuilder helper."""

    def test_system_prompt_contains_grounding_rules(self):
        builder = PromptBuilder()
        prompt = builder.build_system_prompt()
        assert "ONLY on the provided Study Materials" in prompt
        assert "Insufficient context to answer" in prompt
        assert "[S1]" in prompt or "labels like [S1]" in prompt

    def test_user_prompt_labels_chunks(self):
        builder = PromptBuilder()
        chunks = [make_chunk("Alpha content"), make_chunk("Beta content")]
        rule = make_rule(min_words=50, max_words=100)
        prompt = builder.build_user_prompt("What is alpha?", chunks, rule)
        assert "[S1]" in prompt
        assert "[S2]" in prompt
        assert "Alpha content" in prompt
        assert "Beta content" in prompt

    def test_user_prompt_includes_word_count_constraints(self):
        builder = PromptBuilder()
        chunks = [make_chunk()]
        rule = make_rule(min_words=120, max_words=180)
        prompt = builder.build_user_prompt("Explain X", chunks, rule)
        assert "120" in prompt
        assert "180" in prompt

    def test_user_prompt_bullet_points_rule(self):
        builder = PromptBuilder()
        chunks = [make_chunk()]
        rule = make_rule(use_bullet_points=True)
        prompt = builder.build_user_prompt("Explain Y", chunks, rule)
        assert "bullet points" in prompt.lower()

    def test_user_prompt_no_chunks_shows_fallback(self):
        builder = PromptBuilder()
        rule = make_rule()
        prompt = builder.build_user_prompt("Explain Z", [], rule)
        assert "No study materials available" in prompt

    def test_user_prompt_includes_required_sections(self):
        builder = PromptBuilder()
        chunks = [make_chunk()]
        rule = make_rule(required_sections=["introduction", "conclusion"])
        prompt = builder.build_user_prompt("Describe X", chunks, rule)
        assert "introduction" in prompt
        assert "conclusion" in prompt

    def test_user_prompt_no_chunks_page_shows_doc_name(self):
        builder = PromptBuilder()
        chunk = make_chunk("Test content")
        chunk.page_number = None
        chunk.slide_number = 3
        rule = make_rule()
        prompt = builder.build_user_prompt("Q?", [chunk], rule)
        assert "Slide 3" in prompt


# ─── Tests: AnswerService – happy path ────────────────────────────────────────

@pytest.mark.asyncio
async def test_answer_service_returns_answer_response_on_success():
    """Full happy path: retrieval returns chunks, Ollama returns answer."""
    chunk = make_chunk("The OSI model has 7 layers. [S1]")
    rule = make_rule(min_words=5, max_words=200, require_citations=True)

    mock_ollama = AsyncMock()
    mock_ollama.model = "llama3.2:3b"
    # Answer references [S1] and has sufficient words
    mock_ollama.generate = AsyncMock(
        return_value="The OSI model has 7 layers [S1]. Each layer serves a distinct purpose."
    )

    mock_retrieval = AsyncMock()
    mock_retrieval.retrieve = AsyncMock(return_value=[(chunk, 0.85)])

    db = make_db_session()

    # Patch _get_rule to return our rule without hitting the DB
    service = AnswerService(
        ollama_client=mock_ollama,
        retrieval_service=mock_retrieval,
    )

    with patch.object(service, "_get_rule", AsyncMock(return_value=rule)), patch.object(
        service, "_get_subject_name", AsyncMock(return_value="Test Subject")
    ):
        response = await service.generate_answer(
            db=db,
            user_id=uuid.uuid4(),
            subject_id=uuid.uuid4(),
            module_id=None,
            marks=5,
            question="What is the OSI model?",
        )

    assert isinstance(response, AnswerResponse)
    assert response.answer is not None
    assert "OSI" in response.answer
    assert len(response.sources) == 1
    assert response.sources[0].label == "S1"


@pytest.mark.asyncio
async def test_answer_service_returns_insufficient_context_when_no_chunks():
    """When retrieval returns no chunks, service returns an INSUFFICIENT_SOURCES response."""
    mock_ollama = AsyncMock()
    mock_ollama.model = "llama3.2:3b"

    mock_retrieval = AsyncMock()
    mock_retrieval.retrieve = AsyncMock(return_value=[])  # empty retrieval

    rule = make_rule()
    db = make_db_session()

    service = AnswerService(
        ollama_client=mock_ollama,
        retrieval_service=mock_retrieval,
    )

    with patch.object(service, "_get_rule", AsyncMock(return_value=rule)), patch.object(
        service, "_get_subject_name", AsyncMock(return_value="Test Subject")
    ):
        response = await service.generate_answer(
            db=db,
            user_id=uuid.uuid4(),
            subject_id=uuid.uuid4(),
            module_id=None,
            marks=5,
            question="What is an undefined concept?",
        )

    assert response.status == AnswerStatus.INSUFFICIENT_SOURCES.value
    assert "Insufficient context" in response.answer
    assert response.sources == []
    mock_ollama.generate.assert_not_called()


@pytest.mark.asyncio
async def test_answer_service_returns_insufficient_when_model_says_so():
    """When Ollama returns the special insufficient-context phrase, status is set correctly."""
    chunk = make_chunk("Some unrelated content.")
    rule = make_rule(min_words=5, max_words=200)

    mock_ollama = AsyncMock()
    mock_ollama.model = "llama3.2:3b"
    mock_ollama.generate = AsyncMock(
        return_value="Insufficient context to answer the question based on the provided study materials."
    )

    mock_retrieval = AsyncMock()
    mock_retrieval.retrieve = AsyncMock(return_value=[(chunk, 0.40)])

    rule = make_rule()
    db = make_db_session()

    service = AnswerService(
        ollama_client=mock_ollama,
        retrieval_service=mock_retrieval,
    )

    with patch.object(service, "_get_rule", AsyncMock(return_value=rule)), patch.object(
        service, "_get_subject_name", AsyncMock(return_value="Test Subject")
    ):
        response = await service.generate_answer(
            db=db,
            user_id=uuid.uuid4(),
            subject_id=uuid.uuid4(),
            module_id=None,
            marks=5,
            question="Explain the concept of void.",
        )

    assert response.status == AnswerStatus.INSUFFICIENT_SOURCES.value


# ─── Tests: AnswerService – validation ────────────────────────────────────────

@pytest.mark.asyncio
async def test_answer_service_marks_validation_failed_when_word_count_low():
    """When generated answer is too short, status is VALIDATION_FAILED."""
    chunk = make_chunk("Short content.")
    rule = make_rule(min_words=100, max_words=200, require_citations=False)

    mock_ollama = AsyncMock()
    mock_ollama.model = "llama3.2:3b"
    mock_ollama.generate = AsyncMock(return_value="Too short answer.")  # far fewer than 100 words

    mock_retrieval = AsyncMock()
    mock_retrieval.retrieve = AsyncMock(return_value=[(chunk, 0.75)])

    db = make_db_session()
    service = AnswerService(ollama_client=mock_ollama, retrieval_service=mock_retrieval)

    with patch.object(service, "_get_rule", AsyncMock(return_value=rule)), patch.object(
        service, "_get_subject_name", AsyncMock(return_value="Test Subject")
    ):
        response = await service.generate_answer(
            db=db,
            user_id=uuid.uuid4(),
            subject_id=uuid.uuid4(),
            module_id=None,
            marks=5,
            question="Explain something complex.",
        )

    assert response.status == AnswerStatus.VALIDATION_FAILED.value
    assert response.validation is not None
    assert response.validation.word_count_valid is False


@pytest.mark.asyncio
async def test_answer_service_marks_validation_failed_when_citations_missing():
    """When citation requirement is on but [S1] not in answer, citations_valid is False."""
    chunk = make_chunk("Important content.")
    rule = make_rule(
        min_words=1,
        max_words=500,
        require_citations=True,
    )

    # Answer has enough words but NO [S1] citation
    long_answer = " ".join(["word"] * 50)

    mock_ollama = AsyncMock()
    mock_ollama.model = "llama3.2:3b"
    mock_ollama.generate = AsyncMock(return_value=long_answer)

    mock_retrieval = AsyncMock()
    mock_retrieval.retrieve = AsyncMock(return_value=[(chunk, 0.80)])

    db = make_db_session()
    service = AnswerService(ollama_client=mock_ollama, retrieval_service=mock_retrieval)

    with patch.object(service, "_get_rule", AsyncMock(return_value=rule)), patch.object(
        service, "_get_subject_name", AsyncMock(return_value="Test Subject")
    ):
        response = await service.generate_answer(
            db=db,
            user_id=uuid.uuid4(),
            subject_id=uuid.uuid4(),
            module_id=None,
            marks=5,
            question="Explain something.",
        )

    assert response.validation is not None
    assert response.validation.citations_valid is False


# ─── Tests: AnswerService – error handling ────────────────────────────────────

@pytest.mark.asyncio
async def test_answer_service_propagates_ollama_connection_error():
    """If OllamaClient raises OllamaConnectionError, the service re-raises it."""
    chunk = make_chunk("Some relevant context.")
    rule = make_rule()

    mock_ollama = AsyncMock()
    mock_ollama.model = "llama3.2:3b"
    mock_ollama.generate = AsyncMock(
        side_effect=OllamaConnectionError("Failed to connect to Ollama server")
    )

    mock_retrieval = AsyncMock()
    mock_retrieval.retrieve = AsyncMock(return_value=[(chunk, 0.75)])

    db = make_db_session()
    service = AnswerService(ollama_client=mock_ollama, retrieval_service=mock_retrieval)

    with patch.object(service, "_get_rule", AsyncMock(return_value=rule)), patch.object(
        service, "_get_subject_name", AsyncMock(return_value="Test Subject")
    ), pytest.raises(OllamaConnectionError):
        await service.generate_answer(
            db=db,
            user_id=uuid.uuid4(),
            subject_id=uuid.uuid4(),
            module_id=None,
            marks=5,
            question="What is networking?",
        )


@pytest.mark.asyncio
async def test_answer_service_propagates_ollama_timeout_error():
    """If OllamaClient raises OllamaTimeoutError, the service re-raises it."""
    chunk = make_chunk("Some relevant context.")
    rule = make_rule()

    mock_ollama = AsyncMock()
    mock_ollama.model = "llama3.2:3b"
    mock_ollama.generate = AsyncMock(
        side_effect=OllamaTimeoutError("Ollama request timed out after 30.0s")
    )

    mock_retrieval = AsyncMock()
    mock_retrieval.retrieve = AsyncMock(return_value=[(chunk, 0.75)])

    db = make_db_session()
    service = AnswerService(ollama_client=mock_ollama, retrieval_service=mock_retrieval)

    with patch.object(service, "_get_rule", AsyncMock(return_value=rule)), patch.object(
        service, "_get_subject_name", AsyncMock(return_value="Test Subject")
    ), pytest.raises(OllamaTimeoutError):
        await service.generate_answer(
            db=db,
            user_id=uuid.uuid4(),
            subject_id=uuid.uuid4(),
            module_id=None,
            marks=5,
            question="What is networking?",
        )


# ─── Tests: AnswerService – source labeling ───────────────────────────────────

@pytest.mark.asyncio
async def test_answer_service_labels_multiple_sources_correctly():
    """Multiple retrieved chunks must be labeled S1, S2, S3 in order."""
    chunks = [
        make_chunk("First chunk content."),
        make_chunk("Second chunk content."),
        make_chunk("Third chunk content."),
    ]
    rule = make_rule(min_words=1, max_words=1000, require_citations=False)

    answer_text = "Answer using [S1] first chunk, [S2] second, and [S3] third."

    mock_ollama = AsyncMock()
    mock_ollama.model = "llama3.2:3b"
    mock_ollama.generate = AsyncMock(return_value=answer_text)

    mock_retrieval = AsyncMock()
    mock_retrieval.retrieve = AsyncMock(
        return_value=[(chunks[0], 0.90), (chunks[1], 0.80), (chunks[2], 0.70)]
    )

    db = make_db_session()
    service = AnswerService(ollama_client=mock_ollama, retrieval_service=mock_retrieval)

    with patch.object(service, "_get_rule", AsyncMock(return_value=rule)), patch.object(
        service, "_get_subject_name", AsyncMock(return_value="Test Subject")
    ):
        response = await service.generate_answer(
            db=db,
            user_id=uuid.uuid4(),
            subject_id=uuid.uuid4(),
            module_id=None,
            marks=5,
            question="Explain everything.",
        )

    assert len(response.sources) == 3
    labels = [s.label for s in response.sources]
    assert labels == ["S1", "S2", "S3"]


# ─── Tests: AnswerService – processing time ───────────────────────────────────

@pytest.mark.asyncio
async def test_answer_service_reports_processing_time():
    """Response must include a positive processing_ms value."""
    chunk = make_chunk("Context chunk.")
    rule = make_rule(min_words=1, max_words=500, require_citations=False)

    mock_ollama = AsyncMock()
    mock_ollama.model = "llama3.2:3b"
    mock_ollama.generate = AsyncMock(return_value="A proper answer with some content here.")

    mock_retrieval = AsyncMock()
    mock_retrieval.retrieve = AsyncMock(return_value=[(chunk, 0.70)])

    db = make_db_session()
    service = AnswerService(ollama_client=mock_ollama, retrieval_service=mock_retrieval)

    with patch.object(service, "_get_rule", AsyncMock(return_value=rule)), patch.object(
        service, "_get_subject_name", AsyncMock(return_value="Test Subject")
    ):
        response = await service.generate_answer(
            db=db,
            user_id=uuid.uuid4(),
            subject_id=uuid.uuid4(),
            module_id=None,
            marks=5,
            question="What is X?",
        )

    assert response.processing_ms is not None
    assert response.processing_ms >= 0
