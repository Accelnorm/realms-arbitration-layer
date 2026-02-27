from __future__ import annotations

from ai_arbitration_dao.runtime.worker import (
    _default_worker,
    _poll_interval_from_env,
    _seat_provider_from_env,
)
from ai_arbitration_dao.types import SeatProvider


def test_seat_provider_from_env_uses_default_for_invalid_value(monkeypatch: object) -> None:
    monkeypatch.setenv("SEAT_PROVIDER", "unknown")  # type: ignore[attr-defined]

    provider = _seat_provider_from_env()

    assert provider == SeatProvider.CLAUDE


def test_seat_provider_from_env_normalizes_case_and_whitespace(monkeypatch: object) -> None:
    monkeypatch.setenv("SEAT_PROVIDER", "  OPENAI  ")  # type: ignore[attr-defined]

    provider = _seat_provider_from_env()

    assert provider == SeatProvider.OPENAI


def test_poll_interval_from_env_rejects_invalid_or_non_positive_values(monkeypatch: object) -> None:
    monkeypatch.setenv("SEAT_POLL_INTERVAL_SECONDS", "invalid")  # type: ignore[attr-defined]
    assert _poll_interval_from_env() == 2.0

    monkeypatch.setenv("SEAT_POLL_INTERVAL_SECONDS", "0")  # type: ignore[attr-defined]
    assert _poll_interval_from_env() == 2.0

    monkeypatch.setenv("SEAT_POLL_INTERVAL_SECONDS", "-1")  # type: ignore[attr-defined]
    assert _poll_interval_from_env() == 2.0


def test_poll_interval_from_env_accepts_valid_float(monkeypatch: object) -> None:
    monkeypatch.setenv("SEAT_POLL_INTERVAL_SECONDS", "1.5")  # type: ignore[attr-defined]

    interval = _poll_interval_from_env()

    assert interval == 1.5


def test_default_worker_uses_normalized_env_values(monkeypatch: object) -> None:
    monkeypatch.setenv("SEAT_PROVIDER", "  minimax  ")  # type: ignore[attr-defined]
    monkeypatch.setenv("SEAT_ID", "   ")  # type: ignore[attr-defined]
    monkeypatch.setenv("SEAT_POLL_INTERVAL_SECONDS", "3.5")  # type: ignore[attr-defined]

    worker = _default_worker()

    assert worker.seat.provider == SeatProvider.MINIMAX
    assert worker.seat.seat_id == "seat-minimax"
    assert worker.poll_interval_seconds == 3.5
