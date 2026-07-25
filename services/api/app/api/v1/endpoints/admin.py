"""
VibeGPT API – Admin Endpoints

CRUD for departments, semesters, academic years, subjects, modules, users.
Document upload, processing, publishing.
Dashboard, feedback, audit logs.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import logging
import uuid
import zipfile
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import Integer, delete, func, select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.dependencies import AdminUser, DbSession
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.rate_limit import limiter
from app.core.security import hash_password, validate_password_strength
from app.models.academic import (
    AcademicYear,
    Department,
    Module,
    Semester,
    Subject,
)
from app.models.answer_rule import AnswerRule
from app.models.document import (
    Document,
    DocumentChunk,
    DocumentProcessingJob,
    DocumentStatus,
    DocumentVersion,
    ProcessingJobStatus,
    SourceType,
)
from app.models.question import Feedback, QuestionLog, QuestionSource
from app.models.system import AuditLog, SystemSetting
from app.models.user import User, UserRole
from app.rag.llm import filter_gateway_models, get_model_catalog
from app.rag.ollama_client import OllamaError
from app.rag.router_client import RouterClient
from app.schemas.academic import (
    AcademicYearCreate,
    AcademicYearResponse,
    DepartmentCreate,
    DepartmentResponse,
    DepartmentUpdate,
    ModuleCreate,
    ModuleResponse,
    ModuleUpdate,
    SemesterCreate,
    SemesterResponse,
    SubjectCreate,
    SubjectResponse,
    SubjectUpdate,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from app.schemas.analytics import (
    AnalyticsKpis,
    AnalyticsResponse,
    ContentStats,
    HourCount,
    NamedCount,
    PerformanceStats,
    TimePoint,
    TokenStats,
    UsageStats,
    UserMetric,
    UsersStats,
)
from app.schemas.common import MessageResponse
from app.schemas.document import DocumentUploadResponse
from app.schemas.question import AdminFeedbackItem, ReviewFeedbackRequest
from app.storage import get_document_storage

router = APIRouter(prefix="/admin", tags=["Admin"])
logger = logging.getLogger(__name__)


# ── Dashboard ────────────────────────────────────────────────

@router.get("/dashboard")
async def get_dashboard(current_user: AdminUser, db: DbSession):
    """Admin dashboard with real statistics."""
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    published_docs = await db.execute(
        select(func.count()).select_from(Document).where(Document.status == DocumentStatus.PUBLISHED)
    )
    pending_docs = await db.execute(
        select(func.count()).select_from(Document).where(Document.status == DocumentStatus.UPLOADED)
    )
    review_docs = await db.execute(
        select(func.count()).select_from(Document).where(Document.status == DocumentStatus.NEEDS_REVIEW)
    )
    failed_jobs = await db.execute(
        select(func.count()).select_from(DocumentProcessingJob)
        .where(DocumentProcessingJob.status == ProcessingJobStatus.FAILED)
    )
    total_students = await db.execute(
        select(func.count()).select_from(User).where(User.role == UserRole.STUDENT)
    )
    questions_today = await db.execute(
        select(func.count()).select_from(QuestionLog).where(QuestionLog.created_at >= today_start)
    )
    avg_time = await db.execute(
        select(func.avg(QuestionLog.processing_time_ms)).select_from(QuestionLog)
    )
    low_rated = await db.execute(
        select(func.count()).select_from(Feedback).where(Feedback.rating <= 2)
    )

    return {
        "published_documents": published_docs.scalar() or 0,
        "pending_documents": pending_docs.scalar() or 0,
        "review_documents": review_docs.scalar() or 0,
        "failed_jobs": failed_jobs.scalar() or 0,
        "total_students": total_students.scalar() or 0,
        "questions_today": questions_today.scalar() or 0,
        "avg_processing_ms": round(avg_time.scalar() or 0),
        "low_rated_answers": low_rated.scalar() or 0,
    }


# ── Analytics ────────────────────────────────────────────────

AnalyticsRange = Literal["day", "month", "year", "all"]

# range → (date_trunc unit, bucket count, window length)
_RANGE_SPECS: dict[str, tuple[str, int | None, timedelta | None]] = {
    "day": ("hour", 24, timedelta(hours=24)),
    "month": ("day", 30, timedelta(days=30)),
    "year": ("month", 12, timedelta(days=365)),
    "all": ("month", None, None),
}


def _month_start(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, 1, tzinfo=UTC)


def _series_buckets(unit: str, count: int | None, earliest: datetime | None) -> list[datetime]:
    """Continuous bucket starts ending at the current (truncated) instant."""
    now = datetime.now(UTC)
    if unit == "hour":
        end = now.replace(minute=0, second=0, microsecond=0)
        return [end - timedelta(hours=i) for i in range((count or 24) - 1, -1, -1)]
    if unit == "day":
        end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return [end - timedelta(days=i) for i in range((count or 30) - 1, -1, -1)]
    end = _month_start(now)
    total = count
    if total is None:
        if earliest is None:
            total = 12
        else:
            total = min(36, (end.year - earliest.year) * 12 + (end.month - earliest.month) + 1)
            total = max(total, 1)
    buckets: list[datetime] = []
    year, month = end.year, end.month
    for _ in range(total):
        buckets.append(datetime(year, month, 1, tzinfo=UTC))
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    buckets.reverse()
    return buckets


def _fill_series(buckets: list[datetime], rows: list[tuple[datetime, float]]) -> list[TimePoint]:
    values = {bucket: float(value or 0) for bucket, value in rows}
    return [TimePoint(t=bucket, value=values.get(bucket, 0.0)) for bucket in buckets]


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    current_user: AdminUser,
    db: DbSession,
    range_param: AnalyticsRange = Query("month", alias="range"),
):
    """Aggregate platform analytics scoped by a time range."""
    unit, bucket_count, window = _RANGE_SPECS[range_param]
    now = datetime.now(UTC)
    since = now - window if window else None
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    def scoped(column, dt: datetime | None = since):
        return column >= dt if dt is not None else True

    # Bucket grid for every time series in this range.
    earliest_question = (
        await db.execute(select(func.min(QuestionLog.created_at)))
    ).scalar()
    buckets = _series_buckets(unit, bucket_count, earliest_question)

    # ── KPIs ──────────────────────────────────────────────────
    total_questions = (
        await db.execute(
            select(func.count()).select_from(QuestionLog).where(scoped(QuestionLog.created_at))
        )
    ).scalar() or 0
    questions_today = (
        await db.execute(
            select(func.count())
            .select_from(QuestionLog)
            .where(QuestionLog.created_at >= today_start)
        )
    ).scalar() or 0
    total_tokens = (
        await db.execute(
            select(func.coalesce(func.sum(QuestionLog.total_tokens), 0))
            .select_from(QuestionLog)
            .where(scoped(QuestionLog.created_at))
        )
    ).scalar() or 0
    active_24h = (
        await db.execute(
            select(func.count(func.distinct(QuestionLog.user_id)))
            .select_from(QuestionLog)
            .where(QuestionLog.created_at >= now - timedelta(hours=24))
        )
    ).scalar() or 0
    total_students = (
        await db.execute(
            select(func.count()).select_from(User).where(User.role == UserRole.STUDENT)
        )
    ).scalar() or 0
    avg_response_ms = (
        await db.execute(
            select(func.avg(QuestionLog.processing_time_ms))
            .select_from(QuestionLog)
            .where(scoped(QuestionLog.created_at))
        )
    ).scalar() or 0
    avg_rating = (
        await db.execute(
            select(func.avg(Feedback.rating))
            .select_from(Feedback)
            .where(scoped(Feedback.created_at))
        )
    ).scalar()
    published_documents = (
        await db.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.status == DocumentStatus.PUBLISHED)
        )
    ).scalar() or 0

    # ── Tokens ────────────────────────────────────────────────
    token_bucket = func.date_trunc(unit, QuestionLog.created_at)
    token_rows = (
        await db.execute(
            select(token_bucket, func.sum(QuestionLog.total_tokens))
            .where(scoped(QuestionLog.created_at))
            .group_by(token_bucket)
        )
    ).all()
    per_user_rows = (
        await db.execute(
            select(
                User.id,
                User.full_name,
                func.coalesce(func.sum(QuestionLog.total_tokens), 0),
            )
            .select_from(QuestionLog)
            .join(User, User.id == QuestionLog.user_id)
            .where(scoped(QuestionLog.created_at))
            .group_by(User.id, User.full_name)
            .order_by(func.sum(QuestionLog.total_tokens).desc())
            .limit(5)
        )
    ).all()

    # ── Usage ─────────────────────────────────────────────────
    question_bucket = func.date_trunc(unit, QuestionLog.created_at)
    question_rows = (
        await db.execute(
            select(question_bucket, func.count())
            .where(scoped(QuestionLog.created_at))
            .group_by(question_bucket)
        )
    ).all()
    subject_rows = (
        await db.execute(
            select(Subject.name, Subject.code, func.count())
            .select_from(QuestionLog)
            .join(Subject, Subject.id == QuestionLog.subject_id)
            .where(scoped(QuestionLog.created_at))
            .group_by(Subject.name, Subject.code)
            .order_by(func.count().desc())
            .limit(8)
        )
    ).all()
    marks_rows = (
        await db.execute(
            select(QuestionLog.marks, func.count())
            .where(scoped(QuestionLog.created_at))
            .group_by(QuestionLog.marks)
            .order_by(QuestionLog.marks)
        )
    ).all()
    hour_expr = func.extract("hour", QuestionLog.created_at).cast(Integer)
    hour_rows = (
        await db.execute(
            select(hour_expr, func.count())
            .where(scoped(QuestionLog.created_at))
            .group_by(hour_expr)
        )
    ).all()
    peak_hours = [
        HourCount(hour=int(hour), count=int(count)) for hour, count in hour_rows
    ]
    peak_hours.sort(key=lambda h: h.hour)

    # ── Users ─────────────────────────────────────────────────
    async def _active_users(window_start: datetime) -> int:
        return (
            await db.execute(
                select(func.count(func.distinct(QuestionLog.user_id)))
                .select_from(QuestionLog)
                .where(QuestionLog.created_at >= window_start)
            )
        ).scalar() or 0

    active_now = await _active_users(now - timedelta(minutes=15))
    active_today = await _active_users(today_start)
    active_week = await _active_users(now - timedelta(days=7))
    active_month = await _active_users(now - timedelta(days=30))

    signup_bucket = func.date_trunc(unit, User.created_at)
    signups_rows = (
        await db.execute(
            select(signup_bucket, func.count())
            .where(User.role == UserRole.STUDENT, scoped(User.created_at))
            .group_by(signup_bucket)
        )
    ).all()
    most_active_rows = (
        await db.execute(
            select(User.id, User.full_name, func.count())
            .select_from(QuestionLog)
            .join(User, User.id == QuestionLog.user_id)
            .where(scoped(QuestionLog.created_at))
            .group_by(User.id, User.full_name)
            .order_by(func.count().desc())
            .limit(5)
        )
    ).all()
    login_bucket = func.date_trunc(unit, AuditLog.created_at)
    login_rows = (
        await db.execute(
            select(login_bucket, func.count())
            .where(AuditLog.action == "user.login", scoped(AuditLog.created_at))
            .group_by(login_bucket)
        )
    ).all()

    # ── Performance ───────────────────────────────────────────
    trend_pct: float | None = None
    if window is not None:
        prev_avg = (
            await db.execute(
                select(func.avg(QuestionLog.processing_time_ms))
                .select_from(QuestionLog)
                .where(
                    QuestionLog.created_at >= since - window,
                    QuestionLog.created_at < since,
                )
            )
        ).scalar()
        if prev_avg and avg_response_ms:
            trend_pct = round((avg_response_ms - prev_avg) / prev_avg * 100, 1)

    rating_rows = (
        await db.execute(
            select(Feedback.rating, func.count())
            .where(scoped(Feedback.created_at))
            .group_by(Feedback.rating)
        )
    ).all()
    rating_map = {int(rating): int(count) for rating, count in rating_rows}
    rating_distribution = [
        NamedCount(name=str(star), count=rating_map.get(star, 0)) for star in range(1, 6)
    ]
    low_rated = (
        await db.execute(
            select(func.count())
            .select_from(Feedback)
            .where(Feedback.rating <= 2, scoped(Feedback.created_at))
        )
    ).scalar() or 0

    # ── Content ───────────────────────────────────────────────
    status_rows = (
        await db.execute(
            select(Document.status, func.count())
            .where(Document.archived_at.is_(None))
            .group_by(Document.status)
        )
    ).all()
    subject_count = (
        await db.execute(
            select(func.count()).select_from(Subject).where(Subject.archived_at.is_(None))
        )
    ).scalar() or 0
    department_count = (
        await db.execute(
            select(func.count()).select_from(Department).where(Department.archived_at.is_(None))
        )
    ).scalar() or 0

    return AnalyticsResponse(
        range=range_param,
        kpis=AnalyticsKpis(
            total_questions=total_questions,
            questions_today=questions_today,
            total_tokens=int(total_tokens),
            active_users_24h=active_24h,
            total_students=total_students,
            avg_response_ms=round(float(avg_response_ms), 1),
            avg_rating=round(float(avg_rating), 2) if avg_rating is not None else None,
            published_documents=published_documents,
        ),
        tokens=TokenStats(
            total=int(total_tokens),
            avg_per_question=round(int(total_tokens) / total_questions, 1) if total_questions else 0.0,
            series=_fill_series(buckets, token_rows),
            per_user=[
                UserMetric(user_id=user_id, name=name, value=float(value))
                for user_id, name, value in per_user_rows
            ],
        ),
        usage=UsageStats(
            questions_series=_fill_series(buckets, question_rows),
            by_subject=[
                NamedCount(name=name, count=int(count), code=code)
                for name, code, count in subject_rows
            ],
            marks_distribution=[
                NamedCount(name=f"{marks} marks", count=int(count))
                for marks, count in marks_rows
            ],
            peak_hours=peak_hours,
        ),
        users=UsersStats(
            active_now=active_now,
            active_today=active_today,
            active_week=active_week,
            active_month=active_month,
            signups_series=_fill_series(buckets, signups_rows),
            most_active=[
                UserMetric(user_id=user_id, name=name, value=float(count))
                for user_id, name, count in most_active_rows
            ],
            logins_series=_fill_series(buckets, login_rows),
        ),
        performance=PerformanceStats(
            avg_ms=round(float(avg_response_ms), 1),
            trend_pct=trend_pct,
            rating_distribution=rating_distribution,
            low_rated=low_rated,
        ),
        content=ContentStats(
            documents_by_status=[
                NamedCount(name=status.value, count=int(count))
                for status, count in status_rows
            ],
            subjects=subject_count,
            departments=department_count,
        ),
    )


# ── Student Feedback ─────────────────────────────────────────


def _feedback_to_item(f: Feedback) -> AdminFeedbackItem:
    log = f.question_log
    if f.admin_response:
        status = "resolved"
    elif f.reviewed_at is not None:
        status = "reviewed"
    else:
        status = "new"
    return AdminFeedbackItem(
        id=f.id,
        student_name=f.user.full_name if f.user else "Unknown",
        question=log.question if log else "—",
        answer_preview=(log.answer[:240] if log and log.answer else None),
        subject_name=log.subject.name if log and log.subject else None,
        marks=log.marks if log else 0,
        rating=f.rating,
        comment=f.comment,
        status=status,
        admin_response=f.admin_response,
        created_at=f.created_at,
        reviewed_at=f.reviewed_at,
    )


async def _load_feedback_with_context(db, feedback_id: UUID) -> Feedback:
    result = await db.execute(
        select(Feedback)
        .where(Feedback.id == feedback_id)
        .options(
            selectinload(Feedback.user),
            selectinload(Feedback.question_log).selectinload(QuestionLog.subject),
        )
    )
    feedback = result.scalar_one_or_none()
    if feedback is None:
        raise NotFoundError("Feedback")
    return feedback


@router.get("/feedback", response_model=list[AdminFeedbackItem])
async def list_feedback(current_user: AdminUser, db: DbSession):
    """All student feedback, newest first, with question context."""
    result = await db.execute(
        select(Feedback)
        .options(
            selectinload(Feedback.user),
            selectinload(Feedback.question_log).selectinload(QuestionLog.subject),
        )
        .order_by(Feedback.created_at.desc())
    )
    return [_feedback_to_item(f) for f in result.scalars().all()]


@router.patch("/feedback/{feedback_id}", response_model=AdminFeedbackItem)
async def review_feedback(
    feedback_id: UUID,
    body: ReviewFeedbackRequest,
    current_user: AdminUser,
    db: DbSession,
):
    """Mark feedback reviewed/resolved and optionally attach an admin response."""
    feedback = await _load_feedback_with_context(db, feedback_id)

    if body.admin_response is not None:
        feedback.admin_response = body.admin_response
    if feedback.reviewed_at is None:
        feedback.reviewed_at = datetime.now(UTC)
        feedback.reviewed_by = current_user.id

    await db.flush()
    feedback = await _load_feedback_with_context(db, feedback_id)
    return _feedback_to_item(feedback)


@router.delete("/feedback/{feedback_id}", response_model=MessageResponse)
async def delete_feedback(
    feedback_id: UUID,
    current_user: AdminUser,
    db: DbSession,
):
    """Delete a feedback entry once its issue has been handled."""
    feedback = await _load_feedback_with_context(db, feedback_id)
    await db.delete(feedback)
    await db.flush()
    return MessageResponse(message="Feedback deleted")


# ── LLM Gateway (Router) ─────────────────────────────────────


@router.get("/router/status")
async def get_router_status(current_user: AdminUser):
    """Gateway health + catalog summary for the admin Router page.
    No credentials are returned — only reachability and model counts."""
    settings = get_settings()
    payload: dict = {
        "provider": settings.LLM_PROVIDER,
        "base_url": settings.ROUTER_BASE_URL,
        "dashboard_url": settings.ROUTER_DASHBOARD_URL,
        "default_model": settings.ROUTER_DEFAULT_MODEL,
        "reachable": False,
        "models_total": 0,
        "models_available": 0,
        "available_models": [],
        "active_default": None,
    }

    if settings.LLM_PROVIDER != "router":
        payload["active_default"] = settings.OLLAMA_MODEL
        return payload

    try:
        raw = await RouterClient().list_models()
        available = [m["id"] for m in filter_gateway_models(raw)]
        default = await get_model_catalog().default_model()
        payload.update(
            {
                "reachable": True,
                "models_total": len(raw),
                "models_available": len(available),
                "available_models": available,
                "active_default": default,
            }
        )
    except OllamaError:
        payload["reachable"] = False

    return payload


# ── Quick Config / System Settings ───────────────────────────

DEFAULT_SETTINGS: dict[str, str] = {
    "max_questions_per_day": "50",
    "max_concurrent_sessions": "100",
    "api_rate_limit": "20/minute",
}


@router.get("/settings", response_model=dict[str, str])
async def get_system_settings(current_user: AdminUser, db: DbSession):
    """Return all configurable settings, merged over defaults."""
    rows = (await db.execute(select(SystemSetting))).scalars().all()
    merged = {**DEFAULT_SETTINGS, **{row.key: row.value or "" for row in rows}}
    return merged


@router.put("/settings", response_model=MessageResponse)
async def update_system_settings(
    body: dict[str, str], current_user: AdminUser, db: DbSession
):
    """Create or update configurable settings."""
    for key, value in body.items():
        row = (
            await db.execute(select(SystemSetting).where(SystemSetting.key == key))
        ).scalar_one_or_none()
        if row is not None:
            row.value = value
            row.updated_by = current_user.id
        else:
            db.add(SystemSetting(key=key, value=value, updated_by=current_user.id))
    await db.flush()
    return MessageResponse(message="Settings updated")


# ── Departments CRUD ─────────────────────────────────────────

@router.post("/departments", response_model=DepartmentResponse, status_code=201)
async def create_department(body: DepartmentCreate, current_user: AdminUser, db: DbSession):
    existing = await db.execute(select(Department).where(Department.code == body.code))
    if existing.scalar_one_or_none():
        raise ConflictError(f"Department with code '{body.code}' already exists")

    dept = Department(**body.model_dump())
    db.add(dept)
    await db.flush()
    await db.refresh(dept)
    return DepartmentResponse.model_validate(dept)


@router.get("/departments", response_model=list[DepartmentResponse])
async def list_departments(current_user: AdminUser, db: DbSession):
    result = await db.execute(
        select(Department).where(Department.archived_at.is_(None)).order_by(Department.name)
    )
    return [DepartmentResponse.model_validate(d) for d in result.scalars().all()]


@router.get("/departments/archived", response_model=list[DepartmentResponse])
async def list_archived_departments(current_user: AdminUser, db: DbSession):
    result = await db.execute(
        select(Department).where(Department.archived_at.is_not(None)).order_by(Department.name)
    )
    return [DepartmentResponse.model_validate(d) for d in result.scalars().all()]


@router.patch("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(dept_id: UUID, body: DepartmentUpdate, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise NotFoundError("Department")
    for key, val in body.model_dump(exclude_unset=True).items():
        setattr(dept, key, val)
    await db.flush()
    await db.refresh(dept)
    return DepartmentResponse.model_validate(dept)


@router.delete("/departments/{dept_id}", response_model=MessageResponse)
async def archive_department(dept_id: UUID, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise NotFoundError("Department")
    dept.archived_at = datetime.now(UTC)
    await db.flush()
    return MessageResponse(message="Department archived")


@router.post("/departments/{dept_id}/unarchive", response_model=DepartmentResponse)
async def unarchive_department(dept_id: UUID, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise NotFoundError("Department")
    dept.archived_at = None
    await db.flush()
    await db.refresh(dept)
    return DepartmentResponse.model_validate(dept)


class DepartmentDeleteRequest(BaseModel):
    code: str


@router.delete("/departments/{dept_id}/force", response_model=MessageResponse)
async def delete_department(dept_id: UUID, body: DepartmentDeleteRequest, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise NotFoundError("Department")
    if dept.code != body.code.strip().upper():
        raise ValidationError("Department code does not match")
    dependency_count = (await db.execute(select(func.count()).select_from(Subject).where(Subject.department_id == dept_id))).scalar() or 0
    if dependency_count > 0:
        raise ValidationError(
            f"Cannot delete department: {dependency_count} subject(s) are still linked to it"
        )
    await db.delete(dept)
    await db.flush()
    return MessageResponse(message="Department permanently deleted")


# ── Semesters CRUD ───────────────────────────────────────────

@router.post("/semesters", response_model=SemesterResponse, status_code=201)
async def create_semester(body: SemesterCreate, current_user: AdminUser, db: DbSession):
    sem = Semester(**body.model_dump())
    db.add(sem)
    await db.flush()
    await db.refresh(sem)
    return SemesterResponse.model_validate(sem)


@router.get("/semesters", response_model=list[SemesterResponse])
async def list_semesters(current_user: AdminUser, db: DbSession):
    result = await db.execute(
        select(Semester).where(Semester.archived_at.is_(None)).order_by(Semester.number)
    )
    return [SemesterResponse.model_validate(s) for s in result.scalars().all()]


# ── Academic Years CRUD ──────────────────────────────────────

@router.post("/academic-years", response_model=AcademicYearResponse, status_code=201)
async def create_academic_year(body: AcademicYearCreate, current_user: AdminUser, db: DbSession):
    ay = AcademicYear(**body.model_dump())
    db.add(ay)
    await db.flush()
    await db.refresh(ay)
    return AcademicYearResponse.model_validate(ay)


@router.get("/academic-years", response_model=list[AcademicYearResponse])
async def list_academic_years(current_user: AdminUser, db: DbSession):
    result = await db.execute(
        select(AcademicYear)
        .where(AcademicYear.archived_at.is_(None))
        .order_by(AcademicYear.start_year.desc())
    )
    return [AcademicYearResponse.model_validate(ay) for ay in result.scalars().all()]


# ── Subjects CRUD ────────────────────────────────────────────

@router.post("/subjects", response_model=SubjectResponse, status_code=201)
async def create_subject(body: SubjectCreate, current_user: AdminUser, db: DbSession):
    subj = Subject(**body.model_dump())
    db.add(subj)
    await db.flush()
    await db.refresh(subj)
    return SubjectResponse.model_validate(subj)


@router.get("/subjects", response_model=list[SubjectResponse])
async def list_subjects(current_user: AdminUser, db: DbSession):
    result = await db.execute(
        select(Subject).where(Subject.archived_at.is_(None)).order_by(Subject.name)
    )
    return [SubjectResponse.model_validate(s) for s in result.scalars().all()]


@router.patch("/subjects/{subject_id}", response_model=SubjectResponse)
async def update_subject(subject_id: UUID, body: SubjectUpdate, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Subject).where(Subject.id == subject_id))
    subj = result.scalar_one_or_none()
    if not subj:
        raise NotFoundError("Subject")
    for key, val in body.model_dump(exclude_unset=True).items():
        setattr(subj, key, val)
    await db.flush()
    await db.refresh(subj)
    return SubjectResponse.model_validate(subj)


@router.delete("/subjects/{subject_id}", response_model=MessageResponse)
async def archive_subject(subject_id: UUID, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Subject).where(Subject.id == subject_id))
    subj = result.scalar_one_or_none()
    if not subj:
        raise NotFoundError("Subject")
    subj.archived_at = datetime.now(UTC)
    await db.flush()
    return MessageResponse(message="Subject archived")


@router.get("/subjects/archived", response_model=list[SubjectResponse])
async def list_archived_subjects(current_user: AdminUser, db: DbSession):
    result = await db.execute(
        select(Subject).where(Subject.archived_at.is_not(None)).order_by(Subject.name)
    )
    return [SubjectResponse.model_validate(s) for s in result.scalars().all()]


@router.post("/subjects/{subject_id}/unarchive", response_model=SubjectResponse)
async def unarchive_subject(subject_id: UUID, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Subject).where(Subject.id == subject_id))
    subj = result.scalar_one_or_none()
    if not subj:
        raise NotFoundError("Subject")
    subj.archived_at = None
    await db.flush()
    await db.refresh(subj)
    return SubjectResponse.model_validate(subj)


class SubjectDeleteRequest(BaseModel):
    code: str


@router.delete("/subjects/{subject_id}/force", response_model=MessageResponse)
async def delete_subject(
    subject_id: UUID, body: SubjectDeleteRequest, current_user: AdminUser, db: DbSession
):
    result = await db.execute(select(Subject).where(Subject.id == subject_id))
    subj = result.scalar_one_or_none()
    if not subj:
        raise NotFoundError("Subject")
    if subj.code != body.code.strip().upper():
        raise ValidationError("Subject code does not match")
    doc_count = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.subject_id == subject_id)
        )
    ).scalar() or 0
    if doc_count > 0:
        raise ValidationError(
            f"Cannot delete subject: {doc_count} document(s) are still linked to it"
        )
    rule_count = (
        await db.execute(
            select(func.count()).select_from(AnswerRule).where(AnswerRule.subject_id == subject_id)
        )
    ).scalar() or 0
    if rule_count > 0:
        raise ValidationError(
            f"Cannot delete subject: {rule_count} answer rule(s) are still linked to it"
        )
    await db.delete(subj)
    await db.flush()
    return MessageResponse(message="Subject permanently deleted")


# ── Modules CRUD ─────────────────────────────────────────────

@router.post("/modules", response_model=ModuleResponse, status_code=201)
async def create_module(body: ModuleCreate, current_user: AdminUser, db: DbSession):
    mod = Module(**body.model_dump())
    db.add(mod)
    await db.flush()
    await db.refresh(mod)
    return ModuleResponse.model_validate(mod)


@router.get("/modules", response_model=list[ModuleResponse])
async def list_modules(current_user: AdminUser, db: DbSession, subject_id: UUID | None = None):
    query = select(Module).where(Module.archived_at.is_(None))
    if subject_id:
        query = query.where(Module.subject_id == subject_id)
    result = await db.execute(query.order_by(Module.number))
    return [ModuleResponse.model_validate(m) for m in result.scalars().all()]


@router.patch("/modules/{module_id}", response_model=ModuleResponse)
async def update_module(module_id: UUID, body: ModuleUpdate, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Module).where(Module.id == module_id))
    mod = result.scalar_one_or_none()
    if not mod:
        raise NotFoundError("Module")
    for key, val in body.model_dump(exclude_unset=True).items():
        setattr(mod, key, val)
    await db.flush()
    await db.refresh(mod)
    return ModuleResponse.model_validate(mod)


@router.delete("/modules/{module_id}", response_model=MessageResponse)
async def archive_module(module_id: UUID, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Module).where(Module.id == module_id))
    mod = result.scalar_one_or_none()
    if not mod:
        raise NotFoundError("Module")
    mod.archived_at = datetime.now(UTC)
    await db.flush()
    return MessageResponse(message="Module archived")


# ── Users CRUD ───────────────────────────────────────────────

@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(body: UserCreate, current_user: AdminUser, db: DbSession):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise ConflictError(f"User with email '{body.email}' already exists")

    password_issues = validate_password_strength(body.password)
    if password_issues:
        raise ValidationError("; ".join(password_issues))

    try:
        role = UserRole(body.role)
    except ValueError as exc:
        raise ValidationError("Invalid user role") from exc

    if body.department_id is not None:
        department = await db.execute(
            select(Department).where(
                Department.id == body.department_id,
                Department.is_active == True,  # noqa: E712
                Department.archived_at.is_(None),
            )
        )
        if department.scalar_one_or_none() is None:
            raise NotFoundError("Department")

    if body.semester_id is not None:
        semester = await db.execute(
            select(Semester).where(
                Semester.id == body.semester_id,
                Semester.is_active == True,  # noqa: E712
                Semester.archived_at.is_(None),
            )
        )
        if semester.scalar_one_or_none() is None:
            raise NotFoundError("Semester")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=role,
        department_id=body.department_id,
        semester_id=body.semester_id,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    current_user: AdminUser,
    db: DbSession,
    role: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    query = select(User).where(User.archived_at.is_(None))
    if role:
        query = query.where(User.role == UserRole(role))
    result = await db.execute(
        query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    return [UserResponse.model_validate(u) for u in result.scalars().all()]


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: UUID, body: UserUpdate, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User")
    update_data = body.model_dump(exclude_unset=True)
    if "role" in update_data:
        update_data["role"] = UserRole(update_data["role"])
    for key, val in update_data.items():
        setattr(user, key, val)
    await db.flush()
    await db.refresh(user)
    return UserResponse.model_validate(user)


# ── Documents ────────────────────────────────────────────────

# Private helpers for upload functionality

def _get_secure_filename(original_filename: str) -> str:
    import os
    ext = os.path.splitext(original_filename)[1]
    unique_id = uuid.uuid4().hex[:12]
    return f"{unique_id}{ext}"


def _validate_file_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1] if "." in filename else ""
    mime_map = {
        "pdf": "application/pdf",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    if ext not in mime_map:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    return mime_map[ext]


def _validate_file_content(file_bytes: bytes, extension: str) -> None:
    """Reject empty, corrupt, extension-spoofed, or bomb-like documents."""
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    if extension == "pdf":
        if not file_bytes.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="File content is not a valid PDF")
        return

    expected_members = {
        "pptx": "ppt/presentation.xml",
        "docx": "word/document.xml",
        "xlsx": "xl/workbook.xml",
    }
    # Decompression limits checked from the central directory — nothing is
    # extracted here, so a malicious archive cannot exhaust memory/disk.
    max_members = 2048
    max_uncompressed = 256 * 1024 * 1024  # 256 MB across all members
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            infos = archive.infolist()
            if len(infos) > max_members:
                raise HTTPException(
                    status_code=400, detail="Archive contains too many entries"
                )
            if sum(info.file_size for info in infos) > max_uncompressed:
                raise HTTPException(
                    status_code=400, detail="Archive uncompressed size exceeds limit"
                )
            for info in infos:
                name = info.filename
                if name.startswith(("/", "\\")) or ".." in name.split("/"):
                    raise HTTPException(
                        status_code=400, detail="Archive entry has an unsafe path"
                    )
            if expected_members[extension] not in archive.namelist():
                raise HTTPException(
                    status_code=400,
                    detail=f"File content is not a valid {extension.upper()} document",
                )
    except zipfile.BadZipFile as exc:
        raise HTTPException(
            status_code=400,
            detail=f"File content is not a valid {extension.upper()} document",
        ) from exc


@limiter.limit("20/hour")
async def _check_upload_limit(request: Request):
    """Per-client upload throttle; invoked from the upload endpoint because
    slowapi's decorator cannot wrap File/Form signatures directly."""
    return None


@router.post("/documents/upload", response_model=DocumentUploadResponse, status_code=201)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    subject_id: UUID = Form(...),
    module_id: UUID | None = Form(None),
    source_type: str = Form(default="other"),
    description: str | None = Form(None, max_length=2000),
    topic: str | None = Form(None, max_length=500),
    *,
    current_user: AdminUser,
    db: DbSession,
):
    await _check_upload_limit(request)
    settings = get_settings()
    storage = get_document_storage()

    # Validate extension
    filename = file.filename or "unknown"
    ext = filename.lower().split(".")[-1] if "." in filename else ""
    if ext not in ("pdf", "pptx", "docx", "xlsx"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    mime_type = _validate_file_type(filename)

    # Read file with size enforcement during read
    chunk_size = 1024 * 1024  # 1MB chunks
    sha256_hash = hashlib.sha256()
    file_size = 0
    file_buffer = bytearray()
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        sha256_hash.update(chunk)
        file_buffer.extend(chunk)
        file_size += len(chunk)
        if file_size > settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail="File exceeds maximum size")

    file_bytes = bytes(file_buffer)
    file_hash = sha256_hash.hexdigest()
    _validate_file_content(file_bytes, ext)

    # Check for duplicates
    existing = await db.execute(
        select(Document)
        .where(Document.file_hash == file_hash)
        .where(Document.archived_at.is_(None))
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Document already exists")

    # Verify subject exists
    result = await db.execute(
        select(Subject).where(
            Subject.id == subject_id,
            Subject.is_active == True,  # noqa: E712
            Subject.archived_at.is_(None),
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Subject")

    # Verify module if provided
    if module_id:
        result = await db.execute(
            select(Module).where(
                Module.id == module_id,
                Module.subject_id == subject_id,
                Module.is_active == True,  # noqa: E712
                Module.archived_at.is_(None),
            )
        )
        if result.scalar_one_or_none() is None:
            raise NotFoundError("Module", "Module not found in the selected subject")

    # Prepare secure storage path
    secure_name = _get_secure_filename(filename)
    object_key = f"subjects/{subject_id}/{secure_name}"
    stored_path_str = object_key

    try:
        source = SourceType(source_type)
    except ValueError as exc:
        allowed = ", ".join(item.value for item in SourceType)
        raise HTTPException(
            status_code=422,
            detail=f"Invalid source_type. Allowed values: {allowed}",
        ) from exc

    doc = None
    try:
        doc = Document(
            subject_id=subject_id,
            module_id=module_id,
            document_name=filename,
            original_filename=filename,
            storage_path=stored_path_str,
            file_hash=file_hash,
            mime_type=mime_type,
            file_size=file_size,
            source_type=source,
            description=description,
            topic=topic,
            uploaded_by=current_user.id,
            status=DocumentStatus.PROCESSING,
        )
        db.add(doc)
        await db.flush()
        await db.refresh(doc)

        job = DocumentProcessingJob(
            document_id=doc.id,
            status=ProcessingJobStatus.PENDING,
            triggered_by=current_user.id,
        )
        db.add(job)
        await db.flush()

        stored_path_str = await storage.put(object_key, file_bytes, mime_type)
        doc.storage_path = stored_path_str
        await db.flush()
    except Exception:
        await db.rollback()
        with contextlib.suppress(Exception):
            await storage.delete(stored_path_str)
        raise

    # Commit now so the background task (separate session) can see the rows.
    await db.commit()

    # Kick off extraction → chunking → embedding after the response returns.
    # The dedicated worker atomically claims this pending job. Processing it
    # here as well would race the worker and can create duplicate chunks.

    return DocumentUploadResponse(
        id=doc.id,
        document_name=doc.document_name,
        original_filename=doc.original_filename,
        status=doc.status,
        source_type=doc.source_type,
        file_size=doc.file_size,
    )


@router.get("/documents")
async def list_documents(
    current_user: AdminUser,
    db: DbSession,
    status: str | None = None,
    subject_id: UUID | None = None,
):
    query = select(Document).where(Document.archived_at.is_(None))
    if status:
        query = query.where(Document.status == DocumentStatus(status))
    if subject_id:
        query = query.where(Document.subject_id == subject_id)
    result = await db.execute(query.order_by(Document.created_at.desc()))
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "document_name": d.document_name,
            "original_filename": d.original_filename,
            "status": d.status.value,
            "source_type": d.source_type.value,
            "file_size": d.file_size,
            "total_chunks": d.total_chunks,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]


@router.post("/documents/{document_id}/publish", response_model=MessageResponse)
async def publish_document(document_id: UUID, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise NotFoundError("Document")
    if doc.status not in (DocumentStatus.READY, DocumentStatus.NEEDS_REVIEW):
        raise ConflictError(f"Cannot publish document with status '{doc.status.value}'")
    doc.status = DocumentStatus.PUBLISHED
    doc.published_at = datetime.now(UTC)
    doc.published_by = current_user.id
    await db.flush()
    return MessageResponse(message="Document published")


@router.post("/documents/{document_id}/archive", response_model=MessageResponse)
async def archive_document(document_id: UUID, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise NotFoundError("Document")
    doc.status = DocumentStatus.ARCHIVED
    doc.archived_at = datetime.now(UTC)
    await db.flush()
    return MessageResponse(message="Document archived")


@router.delete("/documents/{document_id}", response_model=MessageResponse)
async def delete_document(document_id: UUID, current_user: AdminUser, db: DbSession):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise NotFoundError("Document")

    # QuestionSource references documents/chunks via non-cascading FKs.
    chunk_ids = select(DocumentChunk.id).where(DocumentChunk.document_id == document_id)
    await db.execute(
        delete(QuestionSource).where(
            (QuestionSource.document_id == document_id)
            | (QuestionSource.chunk_id.in_(chunk_ids))
        )
    )

    # Delete child rows with bulk DELETE rather than ORM cascade. The embedding
    # column is stored as JSON, which pgvector cannot deserialize on lazy-load,
    # so loading the chunks to cascade-delete them would raise. Bulk deletes touch
    # only the rows we need and never read the embedding values back.
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
    await db.execute(delete(DocumentVersion).where(DocumentVersion.document_id == document_id))
    await db.execute(
        delete(DocumentProcessingJob).where(DocumentProcessingJob.document_id == document_id)
    )

    # Remove the physical file (best-effort; don't block deletion if it's gone).
    try:
        await get_document_storage().delete(doc.storage_path)
    except Exception:
        logger.warning("Could not delete stored file for document %s", document_id)

    await db.delete(doc)
    await db.flush()
    return MessageResponse(message="Document deleted")


# ── Audit Logs ───────────────────────────────────────────────

@router.get("/audit-logs")
async def list_audit_logs(
    current_user: AdminUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    result = await db.execute(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
