"""Live model latency and queue-pressure estimates for the chat UI."""

from __future__ import annotations

import asyncio
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass


# One real, tiny-prompt latency probe per enabled model (2026-07-31). Runtime
# observations and persisted question logs replace these defaults as traffic
# accumulates. Values are estimates, never a promise of response time.
BENCHMARK_LATENCY_MS: dict[str, int] = {
    "big-pickle": 2236,
    "deepseek-v4-flash-free": 1328,
    "laguna-s-2.1-free": 1019,
    "ling-3.0-flash-free": 1539,
    "mimo-v2.5-free": 2045,
    "nemotron-3-ultra-free": 11989,
    "north-mini-code-free": 1321,
}

MODEL_CONTEXT_TOKENS: dict[str, int] = {
    "big-pickle": 200_000,
    "deepseek-v4-flash-free": 128_000,
    "laguna-s-2.1-free": 128_000,
    "ling-3.0-flash-free": 128_000,
    "mimo-v2.5-free": 128_000,
    "nemotron-3-ultra-free": 128_000,
    "north-mini-code-free": 64_000,
}


@dataclass(frozen=True)
class RequestTicket:
    model: str
    started_at: float


class ModelPerformanceTracker:
    """Process-local active queue plus a small rolling latency window."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._active: dict[str, int] = defaultdict(int)
        self._durations: dict[str, deque[int]] = defaultdict(lambda: deque(maxlen=20))

    async def begin(self, model: str) -> RequestTicket:
        async with self._lock:
            self._active[model] += 1
        return RequestTicket(model=model, started_at=time.monotonic())

    async def finish(self, ticket: RequestTicket) -> None:
        duration_ms = max(1, round((time.monotonic() - ticket.started_at) * 1000))
        async with self._lock:
            self._active[ticket.model] = max(0, self._active[ticket.model] - 1)
            self._durations[ticket.model].append(duration_ms)

    async def live_snapshot(self, model: str) -> tuple[int, int, int | None]:
        async with self._lock:
            total_active = sum(self._active.values())
            model_active = self._active.get(model, 0)
            samples = list(self._durations.get(model, ()))
        recent_average = round(sum(samples) / len(samples)) if samples else None
        return total_active, model_active, recent_average


tracker = ModelPerformanceTracker()


def performance_payload(
    *,
    model: str,
    total_active: int,
    model_active: int,
    recent_questions: int,
    runtime_average_ms: int | None,
    database_average_ms: int | None,
    database_samples: int,
) -> dict:
    baseline_ms = (
        runtime_average_ms
        or database_average_ms
        or BENCHMARK_LATENCY_MS.get(model, 2_500)
    )

    # Large context/capacity is valuable, but usually carries a small latency
    # cost. Actual observed latency remains the dominant signal.
    context_tokens = MODEL_CONTEXT_TOKENS.get(model, 128_000)
    capacity_factor = 1.08 if context_tokens >= 200_000 else (0.96 if context_tokens <= 64_000 else 1.0)
    queued_ahead = max(0, total_active - 1)
    queue_factor = 1 + min(0.9, queued_ahead * 0.16)
    traffic_factor = 1 + min(0.35, recent_questions * 0.012)
    effective_latency = baseline_ms * capacity_factor * queue_factor * traffic_factor

    # A square-root curve keeps the motion expressive without becoming frantic
    # or nearly motionless at the extremes.
    cycle_ms = round(820 * math.sqrt(max(500, effective_latency) / 1_500))
    cycle_ms = max(560, min(2_200, cycle_ms))
    if cycle_ms <= 800:
        speed = "Fast"
    elif cycle_ms <= 1_200:
        speed = "Balanced"
    elif cycle_ms <= 1_700:
        speed = "Deliberate"
    else:
        speed = "Deep reasoning"

    if queued_ahead:
        queue_label = f"{queued_ahead} ahead"
    elif total_active:
        queue_label = "live"
    else:
        queue_label = "ready"

    return {
        "model": model,
        "speed": speed,
        "queue_label": queue_label,
        "cycle_duration_ms": cycle_ms,
        "estimated_response_ms": round(effective_latency),
        "active_requests": total_active,
        "model_active_requests": model_active,
        "recent_questions": recent_questions,
        "sample_count": database_samples,
        "context_tokens": context_tokens,
        "source": (
            "live" if runtime_average_ms is not None
            else "history" if database_average_ms is not None
            else "benchmark"
        ),
    }
