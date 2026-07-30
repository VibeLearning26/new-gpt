"""
VibeGPT API – System Endpoints

GET  /api/v1/health
GET  /api/v1/ready
GET  /api/v1/version
GET  /api/v1/stats   (public live metrics for the landing page)
POST /api/v1/visit   (count a landing-page visit)
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
from fastapi import APIRouter
from sqlalchemy import func, select, text

from app.core.config import get_settings
from app.core.dependencies import DbSession
from app.models.academic import Subject
from app.models.document import Document, DocumentChunk, DocumentStatus
from app.models.question import Feedback, QuestionLog
from app.models.system import SystemSetting
from app.schemas.common import HealthResponse, ReadyResponse

router = APIRouter(tags=["System"])

VISITOR_KEY = "total_visitors"


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Basic health check — returns OK if the API is running."""
    return HealthResponse()


@router.get("/ready", response_model=ReadyResponse)
async def readiness_check(db: DbSession):
    """Readiness check — verifies database and Ollama connectivity."""
    settings = get_settings()

    # Check database
    db_ok = False
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    # Check Ollama
    ollama_ok = False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                configured = settings.OLLAMA_MODEL
                ollama_ok = any(
                    model.get("name") == configured
                    or model.get("model") == configured
                    for model in models
                )
    except Exception:
        pass

    status = "ready" if db_ok and ollama_ok else "degraded"
    return ReadyResponse(status=status, database=db_ok, ollama=ollama_ok)


@router.get("/version")
async def version():
    """Return the API version and environment."""
    settings = get_settings()
    return {
        "name": settings.APP_NAME,
        "version": "0.1.0",
        "environment": settings.APP_ENV,
    }


@router.get("/stats")
async def public_stats(db: DbSession):
    """Public live metrics for the landing page (no auth required)."""
    now = datetime.now(UTC)

    active_now = (
        await db.execute(
            select(func.count(func.distinct(QuestionLog.user_id)))
            .select_from(QuestionLog)
            .where(QuestionLog.created_at >= now - timedelta(minutes=15))
        )
    ).scalar() or 0
    active_24h = (
        await db.execute(
            select(func.count(func.distinct(QuestionLog.user_id)))
            .select_from(QuestionLog)
            .where(QuestionLog.created_at >= now - timedelta(hours=24))
        )
    ).scalar() or 0
    total_questions = (
        await db.execute(select(func.count()).select_from(QuestionLog))
    ).scalar() or 0
    total_subjects = (
        await db.execute(
            select(func.count()).select_from(Subject).where(Subject.archived_at.is_(None))
        )
    ).scalar() or 0
    published_documents = (
        await db.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.status == DocumentStatus.PUBLISHED, Document.archived_at.is_(None))
        )
    ).scalar() or 0
    total_chunks = (
        await db.execute(select(func.count()).select_from(DocumentChunk))
    ).scalar() or 0
    avg_rating = (
        await db.execute(select(func.avg(Feedback.rating)).select_from(Feedback))
    ).scalar()

    visitor_row = (
        await db.execute(select(SystemSetting).where(SystemSetting.key == VISITOR_KEY))
    ).scalar_one_or_none()
    total_visitors = int(visitor_row.value) if visitor_row and visitor_row.value else 0

    return {
        "active_now": active_now,
        "active_24h": active_24h,
        "total_questions": total_questions,
        "total_subjects": total_subjects,
        "published_documents": published_documents,
        "total_chunks": total_chunks,
        "avg_rating": round(float(avg_rating), 2) if avg_rating is not None else None,
        "total_visitors": total_visitors,
    }


@router.post("/visit")
async def count_visit(db: DbSession):
    """Increment the cumulative landing-page visit counter."""
    row = (
        await db.execute(select(SystemSetting).where(SystemSetting.key == VISITOR_KEY))
    ).scalar_one_or_none()
    if row is None:
        row = SystemSetting(key=VISITOR_KEY, value="1", description="Cumulative landing-page visits")
        db.add(row)
    else:
        current = int(row.value) if row.value else 0
        row.value = str(current + 1)
    await db.flush()
    return {"total_visitors": int(row.value)}
