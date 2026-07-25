"""
VibeGPT – Campus Study Agent API

FastAPI application entry point.
"""

from __future__ import annotations

import logging
import re
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Import all models so they are registered with SQLAlchemy
import app.models  # noqa: F401
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.database.init_db import init_db
from app.database.session import async_session_factory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    settings = get_settings()
    logger.info(f"Starting {settings.APP_NAME} ({settings.APP_ENV})")

    # Initialize database with defaults
    async with async_session_factory() as session:
        try:
            await init_db(session)
        except Exception as e:
            logger.error(f"Database initialization failed: {e}")
            logger.info("Make sure PostgreSQL is running and migrations have been applied.")

    yield

    logger.info("Shutting down VibeGPT API")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="VibeGPT – Campus Study Agent API",
        description=(
            "RAG-powered academic answer generation system. "
            "Students ask questions, receive exam-ready answers grounded in "
            "admin-approved college study materials."
        ),
        version="0.1.0",
        docs_url="/api/docs" if not settings.is_production else None,
        redoc_url="/api/redoc" if not settings.is_production else None,
        openapi_url="/api/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # CORS — explicit origins only (never "*") with credentials; methods and
    # headers restricted to what the app actually uses.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # Global request-body cap (defense against memory-exhaustion uploads).
    max_body_bytes = settings.MAX_REQUEST_BODY_MB * 1024 * 1024

    @app.middleware("http")
    async def enforce_body_limit(request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > max_body_bytes:
                    return JSONResponse(
                        status_code=413, content={"detail": "Request body too large"}
                    )
            except ValueError:
                return JSONResponse(
                    status_code=400, content={"detail": "Invalid Content-Length"}
                )
        return await call_next(request)

    # Correlation IDs + security-event audit logging (401/403/429).
    request_id_re = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

    @app.middleware("http")
    async def security_context(request: Request, call_next):
        raw_id = request.headers.get("x-request-id") or ""
        request_id = raw_id if request_id_re.match(raw_id) else uuid.uuid4().hex[:16]
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        if response.status_code in (401, 403, 429):
            client = request.client.host if request.client else "?"
            logger.warning(
                "security_event status=%s path=%s client=%s request_id=%s",
                response.status_code,
                request.url.path,
                client,
                request_id,
            )
        return response

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Include API routes
    app.include_router(api_router)

    return app


app = create_app()
