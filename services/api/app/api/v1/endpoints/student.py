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

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.dependencies import DbSession, StudentUser
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.rate_limit import limiter
from app.models.academic import Module, StudentSubjectPermission, Subject
from app.models.document import Document, DocumentStatus
from app.models.question import (
    ChatSession,
    Feedback,
    QuestionLog,
    QuestionSource,
    SavedAnswer,
)
from app.rag.generation import AnswerGenerationService
from app.rag.llm import filter_gateway_models, get_model_catalog
from app.rag.ollama_client import OllamaError
from app.rag.router_client import RouterClient
from app.schemas.academic import ModuleResponse, SubjectResponse
from app.schemas.auth import UserProfile
from app.schemas.common import MessageResponse
from app.schemas.question import (
    AnswerResponse,
    AskQuestionRequest,
    ChatSessionResponse,
    FeedbackRequest,
    HistoryItem,
    RenameSessionRequest,
    SessionMessage,
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


@router.get("/models")
async def list_available_models(current_user: StudentUser):
    """List LLM models the student can pick from (proxied — no gateway
    credentials ever reach the client)."""
    settings = get_settings()
    if settings.LLM_PROVIDER != "router":
        return {
            "provider": "ollama",
            "models": [{"id": settings.OLLAMA_MODEL, "owned_by": "ollama"}],
            "default": settings.OLLAMA_MODEL,
        }

    try:
        raw = await RouterClient().list_models()
        default = await get_model_catalog().default_model()
    except OllamaError as exc:
        raise HTTPException(status_code=502, detail="Model gateway unavailable") from exc

    return {
        "provider": "router",
        "models": [
            {"id": m["id"], "owned_by": m.get("owned_by")}
            for m in filter_gateway_models(raw)
        ],
        "default": default,
    }


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

    # Validate the requested model against the active provider's catalog.
    if body.model is not None and not await get_model_catalog().is_available(body.model):
        raise ValidationError(f"Model '{body.model}' is not available")

    # Full RAG pipeline: retrieve → prompt → LLM → validate
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

    # Resolve the chat session — a new chat auto-creates one on its first
    # question, titled from that question.
    if body.session_id is not None:
        session = await _load_owned_session(body.session_id, current_user, db)
    else:
        session = ChatSession(
            user_id=current_user.id,
            subject_id=body.subject_id,
            title=body.question.strip()[:80] or "New chat",
        )
        db.add(session)
        await db.flush()

    # Conversation context so follow-ups are coherent and the assistant
    # never re-introduces itself mid-session.
    history: list[dict[str, str]] = []
    if body.session_id is not None:
        prior = await db.execute(
            select(QuestionLog)
            .where(
                QuestionLog.session_id == session.id,
                QuestionLog.answer.is_not(None),
            )
            .order_by(QuestionLog.created_at.desc())
            .limit(6)
        )
        for log in reversed(prior.scalars().all()):
            history.append({"role": "user", "content": log.question})
            history.append({"role": "assistant", "content": log.answer or ""})

    service = AnswerGenerationService(db)
    result = await service.generate(
        question=body.question,
        subject_id=body.subject_id,
        marks=body.marks,
        module_id=body.module_id,
        model=body.model,
        history=history or None,
    )

    question_log = QuestionLog(
        user_id=current_user.id,
        session_id=session.id,
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
    session.model_name = result.model_name
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
        session_id=session.id,
        created_at=question_log.created_at,
    )


# ── Chat sessions ────────────────────────────────────────────


async def _load_owned_session(
    session_id: UUID, current_user, db
) -> ChatSession:
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
            ChatSession.archived_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise NotFoundError("Chat session")
    return session


@router.get("/chat-sessions", response_model=list[ChatSessionResponse])
async def list_chat_sessions(current_user: StudentUser, db: DbSession):
    """List the student's chat sessions, most recent first."""
    sessions = (
        await db.execute(
            select(ChatSession)
            .where(
                ChatSession.user_id == current_user.id,
                ChatSession.archived_at.is_(None),
            )
            .order_by(ChatSession.updated_at.desc())
        )
    ).scalars().all()

    counts: dict[UUID, int] = {}
    if sessions:
        rows = await db.execute(
            select(QuestionLog.session_id, func.count())
            .where(
                QuestionLog.session_id.in_([s.id for s in sessions]),
            )
            .group_by(QuestionLog.session_id)
        )
        counts = {sid: int(n) for sid, n in rows.all()}

    return [
        ChatSessionResponse(
            id=s.id,
            title=s.title,
            subject_id=s.subject_id,
            model_name=s.model_name,
            message_count=counts.get(s.id, 0),
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in sessions
    ]


@router.get("/chat-sessions/{session_id}/messages", response_model=list[SessionMessage])
async def get_session_messages(
    session_id: UUID, current_user: StudentUser, db: DbSession
):
    """All exchanges of one session, oldest first."""
    session = await _load_owned_session(session_id, current_user, db)

    logs = (
        (
            await db.execute(
                select(QuestionLog)
                .where(QuestionLog.session_id == session.id)
                .options(
                    selectinload(QuestionLog.sources),
                    selectinload(QuestionLog.subject),
                    selectinload(QuestionLog.module),
                    selectinload(QuestionLog.feedback_entry),
                )
                .order_by(QuestionLog.created_at)
            )
        )
        .scalars()
        .all()
    )

    doc_ids = {src.document_id for log in logs for src in log.sources}
    doc_names: dict[UUID, str] = {}
    if doc_ids:
        rows = await db.execute(
            select(Document.id, Document.document_name).where(Document.id.in_(doc_ids))
        )
        doc_names = {did: name for did, name in rows.all()}

    return [
        SessionMessage(
            id=log.id,
            question=log.question,
            answer=log.answer,
            status=log.answer_status.value,
            marks=log.marks,
            model_name=log.model_name,
            word_count=log.word_count,
            processing_ms=log.processing_time_ms,
            subject_name=log.subject.name if log.subject else None,
            module_name=log.module.name if log.module else None,
            feedback_rating=log.feedback_entry.rating if log.feedback_entry else None,
            feedback_comment=log.feedback_entry.comment if log.feedback_entry else None,
            sources=[
                SourceInfo(
                    label=src.label,
                    document_id=src.document_id,
                    document_name=doc_names.get(src.document_id, "Document"),
                    page_number=src.page_number,
                    slide_number=src.slide_number,
                    sheet_name=None,
                    preview=src.preview,
                    relevance_score=src.relevance_score,
                )
                for src in log.sources
            ],
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.patch("/chat-sessions/{session_id}", response_model=ChatSessionResponse)
async def rename_chat_session(
    session_id: UUID,
    body: RenameSessionRequest,
    current_user: StudentUser,
    db: DbSession,
):
    session = await _load_owned_session(session_id, current_user, db)
    session.title = body.title.strip()
    await db.flush()
    await db.refresh(session)
    count = (
        await db.execute(
            select(func.count())
            .select_from(QuestionLog)
            .where(QuestionLog.session_id == session.id)
        )
    ).scalar() or 0
    return ChatSessionResponse(
        id=session.id,
        title=session.title,
        subject_id=session.subject_id,
        model_name=session.model_name,
        message_count=int(count),
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.delete("/chat-sessions/{session_id}", response_model=MessageResponse)
async def delete_chat_session(
    session_id: UUID, current_user: StudentUser, db: DbSession
):
    session = await _load_owned_session(session_id, current_user, db)
    session.archived_at = func.now()
    await db.flush()
    return MessageResponse(message="Chat session deleted")


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
    """Submit feedback/rating for an answer. Re-submitting edits the
    existing entry so students can correct a mistaken report."""
    # Verify ownership
    result = await db.execute(
        select(QuestionLog).where(
            and_(QuestionLog.id == body.question_log_id, QuestionLog.user_id == current_user.id)
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Question")

    # Upsert: update the existing feedback if the student resends.
    existing = (
        await db.execute(
            select(Feedback).where(
                and_(
                    Feedback.question_log_id == body.question_log_id,
                    Feedback.user_id == current_user.id,
                )
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.rating = body.rating
        existing.comment = body.comment
        # A corrected report goes back to the admin's queue.
        existing.admin_response = None
        existing.reviewed_at = None
        existing.reviewed_by = None
        await db.flush()
        return MessageResponse(message="Feedback updated")

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
