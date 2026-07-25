"""
VibeGPT API – LLM Gateway Client

OpenAI-compatible gateway client. Talks to OmniRoute (or LLM gateway / any
OpenAI-compatible endpoint) for model listing and chat completions.
The API key is read from server-side settings and injected into the
Authorization header here — it must never be exposed to the frontend.

Reuses the OllamaError hierarchy so the generation pipeline's error
mapping works identically for both providers.
"""

from __future__ import annotations

import httpx

from app.core.config import get_settings
from app.rag.ollama_client import (
    OllamaConnectionError,
    OllamaEmptyResponseError,
    OllamaResponseError,
    OllamaTimeoutError,
    OllamaUsage,
)


class RouterClient:
    """Client for an OpenAI-compatible gateway (LLM gateway)."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ):
        settings = get_settings()
        self.base_url = (base_url or settings.ROUTER_BASE_URL).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.ROUTER_API_KEY
        self.model = model or settings.ROUTER_DEFAULT_MODEL
        self.timeout = timeout if timeout is not None else settings.OLLAMA_TIMEOUT_SECONDS

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def list_models(self) -> list[dict]:
        """Fetch the gateway's model catalog (GET /v1/models)."""
        url = f"{self.base_url}/models"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=self._headers())
        except httpx.TimeoutException as e:
            raise OllamaTimeoutError("LLM gateway models request timed out") from e
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise OllamaConnectionError(
                f"Failed to connect to LLM gateway at {self.base_url}"
            ) from e
        except httpx.RequestError as e:
            raise OllamaConnectionError(f"HTTP request error while calling LLM gateway: {e}") from e

        if response.status_code != 200:
            raise OllamaResponseError(
                f"LLM gateway returned HTTP status {response.status_code}: {response.text}"
            )

        try:
            data = response.json()
        except (ValueError, TypeError) as e:
            raise OllamaResponseError(f"LLM gateway response is not valid JSON: {e}") from e

        models = data.get("data") if isinstance(data, dict) else None
        if not isinstance(models, list):
            return []
        return [m for m in models if isinstance(m, dict) and isinstance(m.get("id"), str)]

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        model: str | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> str:
        usage = await self.generate_with_usage(prompt, system_prompt, model, history)
        return usage.content

    async def generate_with_usage(
        self,
        prompt: str,
        system_prompt: str | None = None,
        model: str | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> OllamaUsage:
        """Non-streaming chat completion via POST /v1/chat/completions.

        ``history`` carries earlier {"role", "content"} conversation turns so
        the model can see the session context (no repeated introductions,
        coherent follow-ups).
        """
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": prompt})

        requested_model = model or self.model
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": requested_model,
            "messages": messages,
            "stream": False,
            "temperature": 0.1,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload, headers=self._headers())
        except httpx.TimeoutException as e:
            raise OllamaTimeoutError(
                f"LLM gateway request timed out after {self.timeout}s"
            ) from e
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise OllamaConnectionError(
                f"Failed to connect to LLM gateway at {self.base_url}"
            ) from e
        except httpx.RequestError as e:
            raise OllamaConnectionError(f"HTTP request error while calling LLM gateway: {e}") from e

        if response.status_code != 200:
            raise OllamaResponseError(
                f"LLM gateway returned HTTP status {response.status_code}: {response.text}"
            )

        try:
            data = response.json()
        except (ValueError, TypeError) as e:
            raise OllamaResponseError(f"LLM gateway response is not valid JSON: {e}") from e

        if not isinstance(data, dict):
            raise OllamaResponseError("LLM gateway response JSON is not an object")

        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            raise OllamaEmptyResponseError("LLM gateway response has no choices")

        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if not isinstance(message, dict):
            raise OllamaEmptyResponseError("LLM gateway choice is missing the 'message' object")

        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise OllamaEmptyResponseError("LLM gateway returned an empty response content")

        usage = data.get("usage")
        usage = usage if isinstance(usage, dict) else {}
        prompt_tokens = usage.get("prompt_tokens")
        completion_tokens = usage.get("completion_tokens")
        responded_model = data.get("model")

        return OllamaUsage(
            content=content,
            prompt_tokens=prompt_tokens if isinstance(prompt_tokens, int) else None,
            completion_tokens=completion_tokens if isinstance(completion_tokens, int) else None,
            model=responded_model if isinstance(responded_model, str) else requested_model,
        )

    async def check_health(self) -> bool:
        try:
            await self.list_models()
            return True
        except Exception:
            return False
