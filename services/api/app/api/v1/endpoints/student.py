"""
VibeGPT API – Student Endpoints

GET  /api/v1/student/subjects
GET  /api/v1/student/subjects/{subject_id}/modules
POST /api/v1/student/answers
GET  /api/v1/student/history
GET  /api/v1/student/history/{question_id}
POST /api/v1/student/history/{question_id}/save
DELETE /api/v1/student/history/{question_id}/save
POST /api/v1/student/feedback
GET  /api/v1/student/saved-answers
GET  /api/v1/student/profile
"""

from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import DbSession, StudentUser
from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.rate_limit import limiter
from app.models.academic import Module, StudentSubjectPermission, Subject
from app.models.document import Document, DocumentStatus
from app.models.question import Feedback, QuestionLog, QuestionSource, SavedAnswer
from app.rag.generation import AnswerGenerationService
from app.schemas.academic import ModuleResponse, SubjectResponse
from app.schemas.auth import UserProfile
from app.schemas.common import MessageResponse
from app.schemas.question import (
    AnswerResponse,
    AskQuestionRequest,
    FeedbackRequest,
    HistoryItem,
    SourceInfo,
    ValidationResult,
)
from app.storage import get_document_storage

router = APIRouter(prefix="/student", tags=["Student"])


def _published_subject_ids():
    """Subjects that have at least one published, non-archived document."""
    return (
        select(Document.subject_id)
        .where(
            Document.status == DocumentStatus.PUBLISHED,
            Document.archived_at.is_(None),
        )
        .distinct()
    )


def _subject_access_clause(current_user):
    """Allow subjects with published material, explicit grants, or the
    student's assigned department/semester cohort."""
    clauses = [
        Subject.id.in_(_published_subject_ids()),
        StudentSubjectPermission.id.is_not(None),
    ]
    if current_user.department_id is not None and current_user.semester_id is not None:
        clauses.append(
            and_(
                Subject.department_id == current_user.department_id,
                Subject.semester_id == current_user.semester_id,
            )
        )
    return or_(*clauses)


def _accessible_subject_query(current_user):
    return (
        select(Subject)
        .outerjoin(
            StudentSubjectPermission,
            and_(
                StudentSubjectPermission.subject_id == Subject.id,
                StudentSubjectPermission.user_id == current_user.id,
                StudentSubjectPermission.is_active == True,  # noqa: E712
            ),
        )
        .where(
            Subject.is_active == True,  # noqa: E712
            Subject.archived_at.is_(None),
            _subject_access_clause(current_user),
        )
    )


async def _require_subject_access(subject_id: UUID, current_user, db: DbSession) -> None:
    result = await db.execute(
        _accessible_subject_query(current_user).where(Subject.id == subject_id)
    )
    if result.scalar_one_or_none() is None:
        raise AuthorizationError("You do not have access to this subject")


@router.get("/subjects", response_model=list[SubjectResponse])
async def get_student_subjects(current_user: StudentUser, db: DbSession):
    """Get subjects the student has access to."""
    result = await db.execute(
        _accessible_subject_query(current_user)
        .options(selectinload(Subject.department), selectinload(Subject.semester))
        .distinct()
    )
    subjects = result.scalars().unique().all()
    responses = []
    for subject in subjects:
        response = SubjectResponse.model_validate(subject)
        response.department_name = subject.department.name if subject.department else None
        response.semester_name = (
            f"Semester {subject.semester.number}" if subject.semester else None
        )
        responses.append(response)
    return responses


@router.get("/subjects/{subject_id}/documents")
async def get_subject_documents(subject_id: UUID, current_user: StudentUser, db: DbSession):
    """List published study material for a subject (must have access)."""
    await _require_subject_access(subject_id, current_user, db)

    result = await db.execute(
        select(Document)
        .where(
            Document.subject_id == subject_id,
            Document.status == DocumentStatus.PUBLISHED,
            Document.archived_at.is_(None),
        )
        .order_by(Document.published_at.desc().nulls_last())
    )
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "document_name": d.document_name,
            "source_type": d.source_type.value,
            "file_size": d.file_size,
            "topic": d.topic,
            "description": d.description,
            "total_chunks": d.total_chunks,
            "published_at": (d.published_at or d.created_at).isoformat(),
        }
        for d in docs
    ]


@router.get("/documents/{document_id}/file")
async def get_document_file(
    document_id: UUID,
    current_user: StudentUser,
    db: DbSession,
    download: bool = Query(False),
):
    """Stream a published document's file for viewing or download."""
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if doc is None or doc.archived_at is not None or doc.status != DocumentStatus.PUBLISHED:
        raise NotFoundError("Document")

    await _require_subject_access(doc.subject_id, current_user, db)

    try:
        data = await get_document_storage().get(doc.storage_path)
    except FileNotFoundError as exc:
        raise NotFoundError("Document file", "The stored file could not be found") from exc

    filename = quote(doc.original_filename or doc.document_name)
    disposition = "attachment" if download else "inline"
    return Response(
        content=data,
        media_type=doc.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{filename}",
            "Cache-Control": "private, max-age=300",
        },
    )


@router.get("/subjects/{subject_id}/modules", response_model=list[ModuleResponse])
async def get_subject_modules(subject_id: UUID, current_user: StudentUser, db: DbSession):
    """Get modules for a subject (must have access)."""
    # Verify access
    await _require_subject_access(subject_id, current_user, db)

    result = await db.execute(
        select(Module)
        .where(
            and_(
                Module.subject_id == subject_id,
                Module.is_active.is_(True),
                Module.archived_at.is_(None),
            )
        )
        .order_by(Module.number)
    )
    modules = result.scalars().all()
    return [ModuleResponse.model_validate(m) for m in modules]


@router.post("/answers", response_model=AnswerResponse)
@limiter.limit("20/minute")
async def ask_question(
    request: Request,
    body: AskQuestionRequest,
    current_user: StudentUser,
    db: DbSession,
):
    """
    Submit a question and receive an exam-ready answer.
    This is the core RAG endpoint — skeleton for Phase 1.
    """
    # Verify subject access
    await _require_subject_access(body.subject_id, current_user, db)

    # Full RAG pipeline: retrieve → prompt → Ollama → validate
    if body.module_id is not None:
        module_result = await db.execute(
            select(Module).where(
                Module.id == body.module_id,
                Module.subject_id == body.subject_id,
                Module.is_active == True,  # noqa: E712
                Module.archived_at.is_(None),
            )
        )
        if module_result.scalar_one_or_none() is None:
            raise NotFoundError("Module", "Module not found in the selected subject")

    service = AnswerGenerationService(db)
    result = await service.generate(
        question=body.question,
        subject_id=body.subject_id,
        marks=body.marks,
        module_id=body.module_id,
    )

    question_log = QuestionLog(
        user_id=current_user.id,
        subject_id=body.subject_id,
        module_id=body.module_id,
        marks=body.marks,
        question=body.question,
        answer=result.answer,
        answer_status=result.status,
        word_count=result.word_count,
        model_name=result.model_name,
        prompt_version=result.prompt_version,
        retrieved_chunk_ids=[c.chunk_id for c in result.sources] or None,
        processing_time_ms=result.processing_ms,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        total_tokens=result.total_tokens,
        validation_result=result.validation or None,
    )
    db.add(question_log)
    await db.flush()

    for citation in result.sources:
        db.add(
            QuestionSource(
                question_log_id=question_log.id,
                chunk_id=citation.chunk_id,
                document_id=citation.document_id,
                label=citation.label,
                relevance_score=citation.relevance_score,
                page_number=citation.page_number,
                slide_number=citation.slide_number,
                preview=citation.preview,
            )
        )
    await db.flush()
    await db.refresh(question_log)

    return AnswerResponse(
        id=question_log.id,
        status=question_log.answer_status.value,
        answer=question_log.answer,
        word_count=question_log.word_count,
        marks=question_log.marks,
        question=question_log.question,
        sources=[
            SourceInfo(
                label=c.label,
                document_id=c.document_id,
                document_name=c.document_name,
                page_number=c.page_number,
                slide_number=c.slide_number,
                sheet_name=c.sheet_name,
                preview=c.preview,
                relevance_score=c.relevance_score,
            )
            for c in result.sources
        ],
        model=question_log.model_name,
        processing_ms=question_log.processing_time_ms,
        validation=ValidationResult(
            word_count_valid=result.validation.get("word_count_valid", True),
            required_sections_valid=result.validation.get(
                "required_sections_valid", True
            ),
            citations_valid=result.validation.get("citations_valid", True),
            details=result.validation or None,
        ),
        created_at=question_log.created_at,
    )


@router.get("/history", response_model=list[HistoryItem])
async def get_history(
    current_user: StudentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """Get the student's question history."""
    offset = (page - 1) * page_size
    result = await db.execute(
        select(QuestionLog)
        .where(QuestionLog.user_id == current_user.id)
        .order_by(QuestionLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .options(selectinload(QuestionLog.subject), selectinload(QuestionLog.module))
    )
    logs = result.scalars().all()

    items = []
    for log in logs:
        # Check if saved
        saved = await db.execute(
            select(SavedAnswer).where(
                and_(SavedAnswer.question_log_id == log.id, SavedAnswer.user_id == current_user.id)
            )
        )
        items.append(
            HistoryItem(
                id=log.id,
                subject_name=log.subject.name if log.subject else "Unknown",
                module_name=log.module.name if log.module else None,
                marks=log.marks,
                question=log.question,
                answer_preview=log.answer[:200] if log.answer else None,
                status=log.answer_status,
                created_at=log.created_at,
                is_saved=saved.scalar_one_or_none() is not None,
            )
        )
    return items


@router.get("/history/{question_id}", response_model=AnswerResponse)
async def get_history_detail(question_id: UUID, current_user: StudentUser, db: DbSession):
    """Get full details of a past question and answer."""
    result = await db.execute(
        select(QuestionLog)
        .where(and_(QuestionLog.id == question_id, QuestionLog.user_id == current_user.id))
        .options(selectinload(QuestionLog.sources))
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise NotFoundError("Question")

    sources = [
        SourceInfo(
            label=s.label,
            document_id=s.document_id,
            document_name="",  # Will be resolved in Phase 5
            page_number=s.page_number,
            slide_number=s.slide_number,
            preview=s.preview,
            relevance_score=s.relevance_score,
        )
        for s in log.sources
    ]

    return AnswerResponse(
        id=log.id,
        status=log.answer_status,
        answer=log.answer,
        word_count=log.word_count,
        marks=log.marks,
        question=log.question,
        sources=sources,
        model=log.model_name,
        processing_ms=log.processing_time_ms,
        validation=ValidationResult(**(log.validation_result or {})) if log.validation_result else None,
        created_at=log.created_at,
    )


@router.post("/history/{question_id}/save", response_model=MessageResponse)
async def save_answer(question_id: UUID, current_user: StudentUser, db: DbSession):
    """Save/bookmark an answer."""
    # Verify ownership
    result = await db.execute(
        select(QuestionLog).where(
            and_(QuestionLog.id == question_id, QuestionLog.user_id == current_user.id)
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Question")

    existing = await db.execute(
        select(SavedAnswer).where(
            and_(SavedAnswer.question_log_id == question_id, SavedAnswer.user_id == current_user.id)
        )
    )
    if existing.scalar_one_or_none() is not None:
        return MessageResponse(message="Already saved")

    db.add(SavedAnswer(user_id=current_user.id, question_log_id=question_id))
    await db.flush()
    return MessageResponse(message="Answer saved")


@router.delete("/history/{question_id}/save", response_model=MessageResponse)
async def unsave_answer(question_id: UUID, current_user: StudentUser, db: DbSession):
    """Remove a saved/bookmarked answer."""
    result = await db.execute(
        select(SavedAnswer).where(
            and_(SavedAnswer.question_log_id == question_id, SavedAnswer.user_id == current_user.id)
        )
    )
    saved = result.scalar_one_or_none()
    if saved is None:
        raise NotFoundError("Saved answer")

    await db.delete(saved)
    await db.flush()
    return MessageResponse(message="Answer removed from saved")


@router.post("/feedback", response_model=MessageResponse)
async def submit_feedback(body: FeedbackRequest, current_user: StudentUser, db: DbSession):
    """Submit feedback/rating for an answer."""
    # Verify ownership
    result = await db.execute(
        select(QuestionLog).where(
            and_(QuestionLog.id == body.question_log_id, QuestionLog.user_id == current_user.id)
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Question")

    # Check for existing feedback
    existing = await db.execute(
        select(Feedback).where(
            and_(Feedback.question_log_id == body.question_log_id, Feedback.user_id == current_user.id)
        )
    )
    if existing.scalar_one_or_none() is not None:
        return MessageResponse(message="Feedback already submitted")

    db.add(
        Feedback(
            user_id=current_user.id,
            question_log_id=body.question_log_id,
            rating=body.rating,
            comment=body.comment,
        )
    )
    await db.flush()
    return MessageResponse(message="Feedback submitted")


@router.get("/saved-answers", response_model=list[HistoryItem])
async def get_saved_answers(current_user: StudentUser, db: DbSession):
    """Get all saved/bookmarked answers."""
    result = await db.execute(
        select(QuestionLog)
        .join(SavedAnswer, and_(SavedAnswer.question_log_id == QuestionLog.id, SavedAnswer.user_id == current_user.id))
        .order_by(SavedAnswer.created_at.desc())
        .options(selectinload(QuestionLog.subject), selectinload(QuestionLog.module))
    )
    logs = result.scalars().all()
    return [
        HistoryItem(
            id=log.id,
            subject_name=log.subject.name if log.subject else "Unknown",
            module_name=log.module.name if log.module else None,
            marks=log.marks,
            question=log.question,
            answer_preview=log.answer[:200] if log.answer else None,
            status=log.answer_status,
            created_at=log.created_at,
            is_saved=True,
        )
        for log in logs
    ]


@router.get("/profile", response_model=UserProfile)
async def get_profile(current_user: StudentUser):
    """Get student profile."""
    return UserProfile(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value,
        department_id=current_user.department_id,
        semester_id=current_user.semester_id,
        avatar_url=current_user.avatar_url,
        is_active=current_user.is_active,
        last_login_at=current_user.last_login_at,
        created_at=current_user.created_at,
    )
