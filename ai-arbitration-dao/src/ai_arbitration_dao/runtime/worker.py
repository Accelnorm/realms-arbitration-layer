from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass

from ai_arbitration_dao.agents.base import SeatConfig
from ai_arbitration_dao.config import get_settings
from ai_arbitration_dao.observability.logging import get_logger
from ai_arbitration_dao.types import SeatProvider


@dataclass(slots=True)
class SeatWorker:
    seat: SeatConfig
    poll_interval_seconds: float = 2.0

    async def run_once(self) -> None:
        logger = get_logger("seat_worker")
        logger.info(
            "seat_cycle",
            seat_id=self.seat.seat_id,
            model_provider=self.seat.provider.value,
            model=self.seat.model,
        )

    async def run_forever(self) -> None:
        while True:
            await self.run_once()
            await asyncio.sleep(self.poll_interval_seconds)


def _seat_provider_from_env() -> SeatProvider:
    raw_provider = os.environ.get("SEAT_PROVIDER", SeatProvider.CLAUDE.value).strip().lower()
    try:
        return SeatProvider(raw_provider)
    except ValueError:
        return SeatProvider.CLAUDE


def _poll_interval_from_env() -> float:
    raw_interval = os.environ.get("SEAT_POLL_INTERVAL_SECONDS", "2.0").strip()
    try:
        interval = float(raw_interval)
    except ValueError:
        return 2.0

    if interval <= 0:
        return 2.0
    return interval


def _default_worker() -> SeatWorker:
    settings = get_settings()
    provider = _seat_provider_from_env()
    seat_id = os.environ.get("SEAT_ID", "").strip() or f"seat-{provider.value}"
    model = {
        SeatProvider.CLAUDE: settings.claude_model,
        SeatProvider.OPENAI: settings.openai_model,
        SeatProvider.MINIMAX: settings.minimax_model,
    }[provider]
    interval = _poll_interval_from_env()
    return SeatWorker(
        seat=SeatConfig(seat_id=seat_id, provider=provider, model=model),
        poll_interval_seconds=interval,
    )


async def run_worker() -> None:
    await _default_worker().run_forever()


if __name__ == "__main__":
    asyncio.run(run_worker())
