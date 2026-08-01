from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

GRAPHICS_SUBJECT = re.compile(
    r"\b(engineering\s+graphics|engineering\s+drawing|graphics|orthographic|egd)\b",
    re.IGNORECASE,
)
DRAWING_INTENT = re.compile(
    r"\b(draw|drawing|projection|orthographic|front\s+view|top\s+view|side\s+view|"
    r"isometric|inclined|hp\b|vp\b|solid|prism|pyramid|cylinder|cone|cube|tetrahedron)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class GraphicsContext:
    document_id: str
    document_name: str
    text: str
    score: float
    page: int | None = None


def should_generate_drawing(subject_name: str, subject_code: str, question: str) -> bool:
    """Require both a Graphics subject and an explicit drawing/projection intent."""
    subject = f"{subject_code} {subject_name}"
    return bool(GRAPHICS_SUBJECT.search(subject) and DRAWING_INTENT.search(question))


class GraphicsDrawingClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.GRAPHICS_SERVICE_URL.rstrip("/")
        self.timeout = settings.GRAPHICS_REQUEST_TIMEOUT_SECONDS

    async def generate(
        self,
        question: str,
        contexts: list[GraphicsContext],
    ) -> dict | None:
        """Generate deterministic SVG using only VibeGPT's scoped RAG excerpts.

        Drawing failure must not suppress the normal text answer. Unsupported
        constructions are logged and returned as no attachment.
        """
        if not contexts:
            return None
        payload = {
            "question": question,
            "reference_contexts": [
                {
                    "resource_id": item.document_id,
                    "file_name": item.document_name,
                    "chunk_index": index,
                    "text": item.text,
                    "score": item.score,
                    "page": item.page or 0,
                }
                for index, item in enumerate(contexts)
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/drawings/generate",
                    json=payload,
                )
            if response.status_code == 422:
                logger.info("Graphics question is outside the current deterministic solver")
                return None
            response.raise_for_status()
            result = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Graphics service unavailable or invalid response: %s", exc)
            return None

        svg = result.get("svg")
        spec = result.get("drawing_spec")
        if not isinstance(svg, str) or not svg.lstrip().startswith("<svg"):
            logger.warning("Graphics service returned a non-SVG drawing")
            return None
        if not isinstance(spec, dict):
            return None
        return {
            "drawing_id": str(result.get("drawing_id", "")),
            "title": str(spec.get("title", "Engineering drawing")),
            "svg": svg,
            "spec": spec,
            "warnings": [str(value) for value in result.get("warnings", [])],
            "engine": "GraphicsPythonVibeGPT",
        }
