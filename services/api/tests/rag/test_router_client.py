"""
Unit tests for the RouterClient (9Router / OpenAI-compatible gateway).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.rag.ollama_client import (
    OllamaEmptyResponseError,
    OllamaResponseError,
)
from app.rag.router_client import RouterClient


def _mock_httpx(response: MagicMock) -> AsyncMock:
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.__aenter__.return_value = mock_client
    mock_client.post.return_value = response
    mock_client.get.return_value = response
    return mock_client


@pytest.mark.asyncio
async def test_generate_with_usage_parses_openai_response():
    client = RouterClient(
        base_url="http://localhost:20128/v1", api_key="secret-key", model="mimo-v2.5-pro"
    )

    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {
        "model": "mimo-v2.5-pro",
        "choices": [{"message": {"role": "assistant", "content": "Recursion calls itself."}}],
        "usage": {"prompt_tokens": 120, "completion_tokens": 42, "total_tokens": 162},
    }

    with patch("httpx.AsyncClient", return_value=_mock_httpx(response)) as mock_cls:
        usage = await client.generate_with_usage("Explain recursion", system_prompt="Sys")

    assert usage.content == "Recursion calls itself."
    assert usage.prompt_tokens == 120
    assert usage.completion_tokens == 42
    assert usage.total_tokens == 162
    assert usage.model == "mimo-v2.5-pro"

    http_client = mock_cls.return_value.__aenter__.return_value
    args, kwargs = http_client.post.call_args
    assert args[0] == "http://localhost:20128/v1/chat/completions"
    assert kwargs["json"]["model"] == "mimo-v2.5-pro"
    assert kwargs["json"]["messages"][0] == {"role": "system", "content": "Sys"}
    # Credentials stay server-side: injected as a header, never in the body.
    assert kwargs["headers"]["Authorization"] == "Bearer secret-key"
    assert "api_key" not in kwargs["json"]


@pytest.mark.asyncio
async def test_generate_with_usage_honors_model_override():
    client = RouterClient(
        base_url="http://localhost:20128/v1", api_key="k", model="mimo-v2.5-pro"
    )

    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {
        "model": "mimo-v2-flash",
        "choices": [{"message": {"content": "Fast answer."}}],
        "usage": {"prompt_tokens": 5, "completion_tokens": 3},
    }

    with patch("httpx.AsyncClient", return_value=_mock_httpx(response)) as mock_cls:
        usage = await client.generate_with_usage("Q", model="mimo-v2-flash")

    http_client = mock_cls.return_value.__aenter__.return_value
    assert http_client.post.call_args.kwargs["json"]["model"] == "mimo-v2-flash"
    assert usage.model == "mimo-v2-flash"


@pytest.mark.asyncio
async def test_generate_http_error_raises_response_error():
    client = RouterClient(base_url="http://localhost:20128/v1", api_key="k")

    response = MagicMock(spec=httpx.Response)
    response.status_code = 401
    response.text = "unauthorized"

    with (
        patch("httpx.AsyncClient", return_value=_mock_httpx(response)),
        pytest.raises(OllamaResponseError),
    ):
        await client.generate_with_usage("Q")


@pytest.mark.asyncio
async def test_generate_empty_content_raises():
    client = RouterClient(base_url="http://localhost:20128/v1", api_key="k")

    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {"choices": [{"message": {"content": "   "}}]}

    with (
        patch("httpx.AsyncClient", return_value=_mock_httpx(response)),
        pytest.raises(OllamaEmptyResponseError),
    ):
        await client.generate_with_usage("Q")


@pytest.mark.asyncio
async def test_list_models_parses_catalog():
    client = RouterClient(base_url="http://localhost:20128/v1", api_key="secret-key")

    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {
        "data": [
            {"id": "mimo-v2.5-pro", "owned_by": "xiaomi"},
            {"id": "mimo-v2-flash", "owned_by": "xiaomi"},
            {"id": "llama3.2:3b", "owned_by": "ollama"},
            {"broken": True},
        ]
    }

    with patch("httpx.AsyncClient", return_value=_mock_httpx(response)) as mock_cls:
        models = await client.list_models()

    assert [m["id"] for m in models] == ["mimo-v2.5-pro", "mimo-v2-flash", "llama3.2:3b"]
    http_client = mock_cls.return_value.__aenter__.return_value
    args, kwargs = http_client.get.call_args
    assert args[0] == "http://localhost:20128/v1/models"
    assert kwargs["headers"]["Authorization"] == "Bearer secret-key"
