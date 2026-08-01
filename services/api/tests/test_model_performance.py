import pytest

from app.rag.model_performance import (
    ModelPerformanceTracker,
    performance_payload,
)


def payload(model: str, **overrides):
    values = {
        "model": model,
        "total_active": 0,
        "model_active": 0,
        "recent_questions": 0,
        "runtime_average_ms": None,
        "database_average_ms": None,
        "database_samples": 0,
    }
    values.update(overrides)
    return performance_payload(**values)


def test_benchmark_changes_animation_speed_by_model():
    fast = payload("laguna-s-2.1-free")
    slow = payload("nemotron-3-ultra-free")

    assert fast["cycle_duration_ms"] < slow["cycle_duration_ms"]
    assert fast["estimated_response_ms"] < slow["estimated_response_ms"]
    assert fast["source"] == "benchmark"


def test_queue_and_traffic_slow_the_animation():
    ready = payload("mimo-v2.5-free")
    busy = payload(
        "mimo-v2.5-free",
        total_active=5,
        model_active=2,
        recent_questions=20,
    )

    assert busy["cycle_duration_ms"] > ready["cycle_duration_ms"]
    assert busy["estimated_response_ms"] > ready["estimated_response_ms"]
    assert busy["queue_label"] == "4 ahead"


def test_live_measurement_takes_priority_and_values_are_bounded():
    measured = payload(
        "big-pickle",
        runtime_average_ms=1,
        database_average_ms=50_000,
        database_samples=12,
    )

    assert measured["source"] == "live"
    assert measured["cycle_duration_ms"] == 560
    assert measured["context_tokens"] == 200_000


@pytest.mark.asyncio
async def test_tracker_reports_active_work_and_runtime_average():
    tracker = ModelPerformanceTracker()
    ticket = await tracker.begin("test-model")
    total, active, average = await tracker.live_snapshot("test-model")
    assert (total, active, average) == (1, 1, None)

    await tracker.finish(ticket)
    total, active, average = await tracker.live_snapshot("test-model")
    assert total == 0
    assert active == 0
    assert average is not None
