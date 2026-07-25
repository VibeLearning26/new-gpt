"""
Unit tests for AnswerGenerationService (mocked retrieval + Ollama).
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.document import DocumentChunk
from app.models.question import AnswerStatus
from app.rag.generation import (
    AnswerGenerationService,
    _build_citations,
    build_prompt,
    validate_answer,
)
from app.rag.ollama_client import OllamaConnectionError, OllamaUsage


def make_chunk(content: str, page: int | None = 1, doc_name: str = "Notes.pdf") -> DocumentChunk:
    chunk = DocumentChunk(
        id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        content=content,
        page_number=page,
        chunk_index=0,
    )
    chunk.document = MagicMock()
    chunk.document.document_name = doc_name
    return chunk


def make_service(scored_chunks, ollama_response=None, ollama_error=None):
    db = AsyncMock()
    # No answer rule found
    rule_result = MagicMock()
    rule_result.scalars.return_value.all.return_value = []
    db.execute.return_value = rule_result

    retrieval = MagicMock()
    retrieval.search_chunks_with_scores = AsyncMock(return_value=scored_chunks)

    ollama = MagicMock()
    ollama.model = "llama3.2:3b"
    if ollama_error is not None:
        ollama.generate_with_usage = AsyncMock(side_effect=ollama_error)
    else:
        ollama.generate_with_usage = AsyncMock(
            return_value=OllamaUsage(
                content=ollama_response, prompt_tokens=10, completion_tokens=7
            )
        )

    return AnswerGenerationService(db, retrieval=retrieval, ollama=ollama)


@pytest.mark.asyncio
async def test_generate_success_with_citations():
    chunks = [(make_chunk("Normalization reduces redundancy."), 0.9)]
    service = make_service(chunks, ollama_response="Normalization reduces redundancy [S1].")

    result = await service.generate("What is normalization?", uuid.uuid4(), marks=5)

    assert result.status == AnswerStatus.COMPLETED
    assert "[S1]" in result.answer
    assert result.sources[0].label == "S1"
    assert result.sources[0].relevance_score == 0.9
    assert result.word_count > 0
    assert result.prompt_tokens == 10
    assert result.completion_tokens == 7
    assert result.total_tokens == 17
    service.ollama.generate_with_usage.assert_awaited_once()


@pytest.mark.asyncio
async def test_generate_insufficient_sources():
    service = make_service([], ollama_response="should never be called")

    result = await service.generate("Anything?", uuid.uuid4(), marks=5)

    assert result.status == AnswerStatus.INSUFFICIENT_SOURCES
    assert result.sources == []
    service.ollama.generate_with_usage.assert_not_awaited()


@pytest.mark.asyncio
async def test_generate_ollama_failure_maps_to_generation_failed():
    chunks = [(make_chunk("content"), 0.8)]
    service = make_service(chunks, ollama_error=OllamaConnectionError("down"))

    result = await service.generate("Q?", uuid.uuid4(), marks=2)

    assert result.status == AnswerStatus.GENERATION_FAILED
    assert result.answer is None
    assert "down" in result.validation["error"]
    # Sources still returned so the caller can log retrieval evidence
    assert len(result.sources) == 1


@pytest.mark.asyncio
async def test_generate_missing_citations_fails_validation():
    chunks = [(make_chunk("content"), 0.8)]
    service = make_service(chunks, ollama_response="An answer with no citation labels at all.")

    result = await service.generate("Q?", uuid.uuid4(), marks=2)

    assert result.status == AnswerStatus.VALIDATION_FAILED
    assert result.validation["citations_valid"] is False


def test_build_citations_labels_are_sequential():
    scored = [(make_chunk(f"chunk {i}", page=i), 0.9 - i * 0.1) for i in range(3)]
    citations = _build_citations(scored)
    assert [c.label for c in citations] == ["S1", "S2", "S3"]


def test_build_prompt_includes_sources_and_question():
    citations = _build_citations([(make_chunk("The CAP theorem states..."), 0.9)])
    prompt = build_prompt("Explain CAP theorem", 5, citations, rule=None)
    assert "[S1]" in prompt
    assert "The CAP theorem states..." in prompt
    assert "Explain CAP theorem" in prompt
    assert "5 marks" in prompt


def test_validate_answer_detects_unknown_citation():
    citations = _build_citations([(make_chunk("x"), 0.9)])
    validation = validate_answer("Claim [S1]. Bogus [S9].", citations, rule=None)
    assert validation["citations_valid"] is False
    assert validation["unknown_citations"] == ["S9"]
