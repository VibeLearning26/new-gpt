"""Measure time-to-completion for every model exposed by VibeGPT.

Run inside the API container:
    python scripts/benchmark_models.py

The prompt and output cap are intentionally tiny so this is a latency probe,
not a quality evaluation and does not consume unnecessary free-tier capacity.
"""

from __future__ import annotations

import asyncio
import json
import time

import httpx

from app.rag.llm import get_model_catalog
from app.rag.router_client import RouterClient


async def main() -> None:
    catalog = get_model_catalog()
    models = await catalog.available_models()
    client_config = RouterClient(timeout=90)
    results: list[dict] = []

    async with httpx.AsyncClient(timeout=90) as client:
        for model in models:
            started = time.perf_counter()
            try:
                response = await client.post(
                    f"{client_config.base_url}/chat/completions",
                    headers=client_config._headers(),
                    json={
                        "model": model,
                        "messages": [
                            {
                                "role": "user",
                                "content": "Reply with exactly the single word READY.",
                            }
                        ],
                        "temperature": 0,
                        "max_tokens": 24,
                        "stream": False,
                    },
                )
                elapsed_ms = round((time.perf_counter() - started) * 1000)
                response.raise_for_status()
                payload = response.json()
                usage = payload.get("usage") or {}
                results.append(
                    {
                        "model": model,
                        "latency_ms": elapsed_ms,
                        "completion_tokens": usage.get("completion_tokens"),
                        "status": "ok",
                    }
                )
            except Exception as exc:  # benchmark should continue to other models
                results.append(
                    {
                        "model": model,
                        "latency_ms": round((time.perf_counter() - started) * 1000),
                        "status": "error",
                        "error": str(exc)[:180],
                    }
                )

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
