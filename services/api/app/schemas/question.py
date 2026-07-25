"""
VibeGPT API – Question & Answer Schemas
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AskQuestionRequest(BaseModel):
    subject_id: UUID
    module_id: UUID | None = None
    marks: int = Field(ge=1, le=20)
    question: str = Field(min_length=3, max_length=2000)


class SourceInfo(BaseModel):
    label: str
    document_id: UUID
    document_name: str
    page_number: int | None = None
    slide_number: int | None = None
    sheet_name: str | None = None
    preview: str | None = None
    relevance_score: float | None = None


class ValidationResult(BaseModel):
    word_count_valid: bool = True
    required_sections_valid: bool = True
    citations_valid: bool = True
    details: dict | None = None


class AnswerResponse(BaseModel):
    id: UUID
    status: str
    answer: str | None = None
    word_count: int | None = None
    marks: int
    question: str
    sources: list[SourceInfo] = []
    model: str | None = None
    processing_ms: int | None = None
    validation: ValidationResult | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HistoryItem(BaseModel):
    id: UUID
    subject_name: str
    module_name: str | None = None
    marks: int
    question: str
    answer_preview: str | None = None
    status: str
    created_at: datetime
    is_saved: bool = False

    model_config = {"from_attributes": True}


class FeedbackRequest(BaseModel):
    question_log_id: UUID
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)
