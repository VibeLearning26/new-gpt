"""
VibeGPT API – LLM Provider Factory & Model Catalog

Selects the active LLM backend (local Ollama or the 9Router gateway)
and exposes a cached catalog of available models for the student UI.
"""

from __future__ import annotations

import time

from app.core.config import get_settings
from app.rag.ollama_client import OllamaClient
from app.rag.router_client import RouterClient


def get_llm_client() -> OllamaClient | RouterClient:
    """Instantiate the configured LLM provider client."""
    settings = get_settings()
    if settings.LLM_PROVIDER == "router":
        return RouterClient()
    return OllamaClient(timeout=settings.OLLAMA_TIMEOUT_SECONDS)


# The app surfaces only an explicit allowlist of gateway models
# (ROUTER_ALLOWED_MODELS). Everything else the gateway lists stays hidden.
# An empty allowlist disables filtering and exposes the full catalog.


def allowed_models() -> list[str]:
    settings = get_settings()
    return [m.strip() for m in settings.ROUTER_ALLOWED_MODELS.split(",") if m.strip()]


def filter_gateway_models(models: list[dict]) -> list[dict]:
    allowlist = allowed_models()
    if not allowlist:
        return models
    by_id = {m["id"]: m for m in models}
    # Allowlist order wins so the UI list is stable and curated.
    return [by_id[model_id] for model_id in allowlist if model_id in by_id]


class ModelCatalog:
    """Cached view of the models the active provider can serve."""

    def __init__(self, ttl_seconds: float = 60.0):
        self.ttl = ttl_seconds
        self._cache: tuple[float, list[str]] | None = None

    async def available_models(self) -> list[str]:
        settings = get_settings()
        if settings.LLM_PROVIDER != "router":
            return [settings.OLLAMA_MODEL]

        now = time.monotonic()
        if self._cache is not None and now - self._cache[0] < self.ttl:
            return self._cache[1]

        raw = await RouterClient().list_models()
        models = [m["id"] for m in filter_gateway_models(raw)]
        self._cache = (now, models)
        return models

    async def default_model(self) -> str:
        """Preferred default: configured MiMo model, else any MiMo, else first."""
        settings = get_settings()
        if settings.LLM_PROVIDER != "router":
            return settings.OLLAMA_MODEL

        models = await self.available_models()
        preferred = settings.ROUTER_DEFAULT_MODEL
        if preferred in models:
            return preferred
        mimo = next((m for m in models if "mimo" in m.lower()), None)
        return mimo or (models[0] if models else preferred)

    async def is_available(self, model: str) -> bool:
        return model in await self.available_models()


_model_catalog = ModelCatalog()


def get_model_catalog() -> ModelCatalog:
    return _model_catalog
