"""Stage timing utilities for the processing pipeline."""

import time
from app.models.schemas import StageResult


class StageTimer:
    """Collects timing for named processing stages."""

    def __init__(self) -> None:
        self._stages: dict[str, StageResult] = {}
        self._start_time: float = time.perf_counter()

    def record(self, name: str, duration_ms: float) -> None:
        self._stages[name] = StageResult(completed=True, duration_ms=round(duration_ms, 1))

    def measure(self, name: str):
        """Context-manager-style usage via enter/exit isn't needed — just use start/stop."""
        return _StageMeasure(self, name)

    @property
    def stages(self) -> dict[str, StageResult]:
        return dict(self._stages)

    @property
    def total_ms(self) -> float:
        return round((time.perf_counter() - self._start_time) * 1000, 1)


class _StageMeasure:
    def __init__(self, timer: StageTimer, name: str) -> None:
        self._timer = timer
        self._name = name
        self._t0: float = 0.0

    def __enter__(self) -> "_StageMeasure":
        self._t0 = time.perf_counter()
        return self

    def __exit__(self, *_: object) -> None:
        elapsed = (time.perf_counter() - self._t0) * 1000
        self._timer.record(self._name, elapsed)
