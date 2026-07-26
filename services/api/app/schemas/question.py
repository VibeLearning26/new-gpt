"""
VibeGPT API – Question & Answer Schemas
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ChatAttachment(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=3, max_length=100)
    data_url: str = Field(min_length=16, max_length=12_000_000)


class AskQuestionRequest(BaseModel):
    subject_id: UUID | None = None
    module_id: UUID | None = None
    marks: int = Field(ge=1, le=20)
    question: str = Field(min_length=1, max_length=2000)
    model: str | None = Field(default=None, max_length=100)
    session_id: UUID | None = None
    attachments: list[ChatAttachment] = Field(default_factory=list, max_length=4)


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
    subject_id: UUID
    subject_name: str
    sources: list[SourceInfo] = []
    model: str | None = None
    processing_ms: int | None = None
    validation: ValidationResult | None = None
    session_id: UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionResponse(BaseModel):
    id: UUID
    title: str
    subject_id: UUID | None = None
    model_name: str | None = None
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RenameSessionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class SessionMessage(BaseModel):
    id: UUID
    question: str
    answer: str | None = None
    status: str
    marks: int
    model_name: str | None = None
    word_count: int | None = None
    processing_ms: int | None = None
    subject_name: str | None = None
    module_name: str | None = None
    sources: list[SourceInfo] = []
    feedback_rating: int | None = None
    feedback_comment: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminFeedbackItem(BaseModel):
    id: UUID
    student_name: str
    question: str
    answer_preview: str | None = None
    subject_name: str | None = None
    marks: int
    rating: int
    comment: str | None = None
    status: Literal["new", "reviewed", "resolved"]
    admin_response: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None


class ReviewFeedbackRequest(BaseModel):
    status: Literal["reviewed", "resolved"]
    admin_response: str | None = Field(default=None, max_length=2000)


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
