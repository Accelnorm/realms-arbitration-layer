from __future__ import annotations

from ai_arbitration_dao.agents.base import SeatConfig, fixed_panel_template
from ai_arbitration_dao.agents.claude import ClaudeSeat
from ai_arbitration_dao.agents.minimax import MinimaxSeat
from ai_arbitration_dao.agents.openai import OpenAISeat
from ai_arbitration_dao.config import get_settings


class TestSI022PythonAgentRuntime:
    """SI-022: AI arbitration panel MUST run on Python runtime profile."""

    def test_panel_template_has_three_seats(self) -> None:
        settings = get_settings()
        seats = fixed_panel_template(settings)
        assert len(seats) == 3

    def test_panel_template_has_claude_seat(self) -> None:
        settings = get_settings()
        seats = fixed_panel_template(settings)
        claude_seat = next(s for s in seats if s.provider.value == "claude")
        assert claude_seat.seat_id == "seat-claude"

    def test_panel_template_has_openai_seat(self) -> None:
        settings = get_settings()
        seats = fixed_panel_template(settings)
        openai_seat = next(s for s in seats if s.provider.value == "openai")
        assert openai_seat.seat_id == "seat-openai"

    def test_panel_template_has_minimax_seat(self) -> None:
        settings = get_settings()
        seats = fixed_panel_template(settings)
        minimax_seat = next(s for s in seats if s.provider.value == "minimax")
        assert minimax_seat.seat_id == "seat-minimax"

    def test_claude_seat_assess_returns_response(self) -> None:
        from ai_arbitration_dao.types import SeatProvider

        config = SeatConfig(
            seat_id="seat-claude",
            provider=SeatProvider.CLAUDE,
            model="claude-3-5-haiku",
        )
        seat = ClaudeSeat(config=config)
        result = seat.assess("Test prompt")
        assert "claude" in result
        assert "Test prompt" in result

    def test_openai_seat_assess_returns_response(self) -> None:
        from ai_arbitration_dao.types import SeatProvider

        config = SeatConfig(
            seat_id="seat-openai",
            provider=SeatProvider.OPENAI,
            model="gpt-4o-mini",
        )
        seat = OpenAISeat(config=config)
        result = seat.assess("Test prompt")
        assert "openai" in result
        assert "Test prompt" in result

    def test_minimax_seat_assess_returns_response(self) -> None:
        from ai_arbitration_dao.types import SeatProvider

        config = SeatConfig(
            seat_id="seat-minimax",
            provider=SeatProvider.MINIMAX,
            model="minimax-m2.5",
        )
        seat = MinimaxSeat(config=config)
        result = seat.assess("Test prompt")
        assert "minimax" in result
        assert "Test prompt" in result

    def test_panel_seats_use_different_providers(self) -> None:
        settings = get_settings()
        seats = fixed_panel_template(settings)
        providers = {s.provider.value for s in seats}
        assert providers == {"claude", "openai", "minimax"}

    def test_panel_seat_config_includes_model(self) -> None:
        settings = get_settings()
        seats = fixed_panel_template(settings)
        for seat in seats:
            assert seat.model is not None
            assert len(seat.model) > 0

    def test_python_runtime_worker_can_run_seat(self) -> None:
        import asyncio

        from ai_arbitration_dao.runtime.worker import SeatWorker
        from ai_arbitration_dao.types import SeatProvider

        worker = SeatWorker(
            seat=SeatConfig(
                seat_id="seat-claude",
                provider=SeatProvider.CLAUDE,
                model="claude-3-5-haiku",
            ),
            poll_interval_seconds=0.01,
        )

        async def run_once() -> None:
            await worker.run_once()

        asyncio.run(run_once())
