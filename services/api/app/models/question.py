"""
VibeGPT – Question and Answer Models

Tables: question_logs, question_sources, saved_answers, feedback
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.academic import Module, Subject
    from app.models.user import User


class AnswerStatus(enum.StrEnum):
    COMPLETED = "completed"
    INSUFFICIENT_SOURCES = "insufficient_sources"
    GENERATION_FAILED = "generation_failed"
    VALIDATION_FAILED = "validation_failed"
    REGENERATED = "regenerated"


class ChatSession(Base, UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    """A conversation thread between a student and VibeGPT."""

    __tablename__ = "chat_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="New chat")
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relationships
    user: Mapped[User] = relationship()
    subject: Mapped[Subject | None] = relationship()
    messages: Mapped[list[QuestionLog]] = relationship(back_populates="session")

    def __repr__(self) -> str:
        return f"<ChatSession {self.id} title={self.title!r}>"


class QuestionLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "question_logs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id"), nullable=True, index=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False, index=True
    )
    module_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("modules.id"), nullable=True
    )
    marks: Mapped[int] = mapped_column(Integer, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_status: Mapped[AnswerStatus] = mapped_column(
        Enum(AnswerStatus, name="answer_status", create_constraint=True),
        nullable=False,
        default=AnswerStatus.COMPLETED,
    )
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    retrieved_chunk_ids: Mapped[list | None] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=True
    )
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    validation_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    drawing_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Relationships
    user: Mapped[User] = relationship(back_populates="question_logs")
    session: Mapped[ChatSession | None] = relationship(back_populates="messages")
    subject: Mapped[Subject] = relationship()
    module: Mapped[Module | None] = relationship()
    sources: Mapped[list[QuestionSource]] = relationship(
        back_populates="question_log", cascade="all, delete-orphan"
    )
    saved_answer: Mapped[SavedAnswer | None] = relationship(
        back_populates="question_log", uselist=False
    )
    feedback_entry: Mapped[Feedback | None] = relationship(
        back_populates="question_log", uselist=False
    )

    def __repr__(self) -> str:
        return f"<QuestionLog {self.id} marks={self.marks}>"


class QuestionSource(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "question_sources"

    question_log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_logs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document_chunks.id"), nullable=False
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(10), nullable=False)  # S1, S2, ...
    relevance_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    slide_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preview: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    question_log: Mapped[QuestionLog] = relationship(back_populates="sources")


class SavedAnswer(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "saved_answers"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_logs.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    question_log: Mapped[QuestionLog] = relationship(back_populates="saved_answer")


class Feedback(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "feedback"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_logs.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped[User] = relationship(back_populates="feedback", foreign_keys=[user_id])
    question_log: Mapped[QuestionLog] = relationship(back_populates="feedback_entry")
