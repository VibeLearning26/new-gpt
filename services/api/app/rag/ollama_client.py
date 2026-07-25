"""
VibeGPT API – Ollama Client

Wrapper client for Ollama's local chat API.
Implements error handling, timeout options, and health readiness checks.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.config import get_settings


class OllamaError(Exception):
    """Base exception for all Ollama client errors."""

    pass


class OllamaConnectionError(OllamaError):
    """Raised when connection to Ollama fails or service is unreachable."""

    pass


class OllamaTimeoutError(OllamaError):
    """Raised when Ollama request times out."""

    pass


class OllamaResponseError(OllamaError):
    """Raised when Ollama returns an HTTP error status or malformed response."""

    pass


class OllamaEmptyResponseError(OllamaError):
    """Raised when Ollama returns an empty or invalid content response."""

    pass


@dataclass
class OllamaUsage:
    """Token usage reported by Ollama for a non-streaming completion."""

    content: str
    prompt_tokens: int | None
    completion_tokens: int | None

    @property
    def total_tokens(self) -> int | None:
        if self.prompt_tokens is None and self.completion_tokens is None:
            return None
        return (self.prompt_tokens or 0) + (self.completion_tokens or 0)


class OllamaClient:
    """Client to communicate with the private Ollama server."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 30.0,
    ):
        """
        Initialize the Ollama client.

        Args:
            base_url: Optional base URL of the Ollama server. Defaults to settings.OLLAMA_BASE_URL.
            model: Optional model name. Defaults to settings.OLLAMA_MODEL.
            timeout: Timeout in seconds for API calls. Defaults to 30.0.
        """
        settings = get_settings()
        self.base_url = base_url or settings.OLLAMA_BASE_URL
        self.model = model or settings.OLLAMA_MODEL
        self.timeout = timeout

    async def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        """
        Generate a non-streaming chat completion from Ollama.

        Args:
            prompt: User prompt content.
            system_prompt: Optional system prompt to instruct the model.

        Returns:
            The generated response content as a string.

        Raises:
            OllamaConnectionError: If the server is unreachable.
            OllamaTimeoutError: If the request times out.
            OllamaResponseError: If the response is status != 200 or malformed.
            OllamaEmptyResponseError: If the response content is empty.
        """
        usage = await self.generate_with_usage(prompt, system_prompt)
        return usage.content

    async def generate_with_usage(
        self, prompt: str, system_prompt: str | None = None
    ) -> OllamaUsage:
        """
        Generate a non-streaming chat completion and return token usage.

        Ollama reports ``prompt_eval_count`` and ``eval_count`` on
        non-streaming responses; both are surfaced as prompt/completion
        token counts. Counts are ``None`` if the server omits them.
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        url = f"{self.base_url.rstrip('/')}/api/chat"
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.1},
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)
        except httpx.TimeoutException as e:
            raise OllamaTimeoutError(f"Ollama request timed out after {self.timeout}s") from e
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise OllamaConnectionError(f"Failed to connect to Ollama server at {self.base_url}") from e
        except httpx.RequestError as e:
            raise OllamaConnectionError(f"HTTP request error while calling Ollama: {e}") from e

        if response.status_code != 200:
            raise OllamaResponseError(
                f"Ollama returned HTTP status {response.status_code}: {response.text}"
            )

        try:
            data = response.json()
        except (ValueError, TypeError) as e:
            raise OllamaResponseError(f"Ollama response is not valid JSON: {e}") from e

        if not isinstance(data, dict):
            raise OllamaResponseError("Ollama response JSON is not an object")

        if "message" not in data or not isinstance(data["message"], dict):
            raise OllamaEmptyResponseError("Ollama response is missing the 'message' object")

        content = data["message"].get("content")
        if content is None:
            raise OllamaEmptyResponseError("Ollama response message is missing 'content'")

        if not isinstance(content, str):
            raise OllamaResponseError("Ollama response content is not a string")

        if not content.strip():
            raise OllamaEmptyResponseError("Ollama returned an empty response content")

        prompt_tokens = data.get("prompt_eval_count")
        completion_tokens = data.get("eval_count")
        return OllamaUsage(
            content=content,
            prompt_tokens=prompt_tokens if isinstance(prompt_tokens, int) else None,
            completion_tokens=completion_tokens if isinstance(completion_tokens, int) else None,
        )

    async def check_health(self) -> bool:
        """
        Perform a lightweight readiness check.

        Returns:
            True if Ollama is running and responding to tags lookup, False otherwise.
        """
        url = f"{self.base_url.rstrip('/')}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                return response.status_code == 200
        except Exception:
            return False
