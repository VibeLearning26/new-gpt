"""
VibeGPT API – Analytics Schemas

Response models for GET /api/v1/admin/analytics.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TimePoint(BaseModel):
    """One bucket in a time series."""

    t: datetime
    value: float


class NamedCount(BaseModel):
    """A labelled count (subject, status, rating, marks band...)."""

    name: str
    count: int
    code: str | None = None


class HourCount(BaseModel):
    """Question volume for one hour of the day (0-23)."""

    hour: int
    count: int


class UserMetric(BaseModel):
    """A per-user leaderboard entry."""

    user_id: UUID
    name: str
    value: float


class AnalyticsKpis(BaseModel):
    total_questions: int
    questions_today: int
    total_tokens: int
    active_users_24h: int
    total_students: int
    avg_response_ms: float
    avg_rating: float | None
    published_documents: int


class TokenStats(BaseModel):
    total: int
    avg_per_question: float
    series: list[TimePoint]
    per_user: list[UserMetric]


class UsageStats(BaseModel):
    questions_series: list[TimePoint]
    by_subject: list[NamedCount]
    marks_distribution: list[NamedCount]
    peak_hours: list[HourCount]


class UsersStats(BaseModel):
    active_now: int
    active_today: int
    active_week: int
    active_month: int
    signups_series: list[TimePoint]
    most_active: list[UserMetric]
    logins_series: list[TimePoint]


class PerformanceStats(BaseModel):
    avg_ms: float
    trend_pct: float | None
    rating_distribution: list[NamedCount]
    low_rated: int


class ContentStats(BaseModel):
    documents_by_status: list[NamedCount]
    subjects: int
    departments: int


class AnalyticsResponse(BaseModel):
    range: str
    kpis: AnalyticsKpis
    tokens: TokenStats
    usage: UsageStats
    users: UsersStats
    performance: PerformanceStats
    content: ContentStats
