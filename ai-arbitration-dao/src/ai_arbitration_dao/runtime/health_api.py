from __future__ import annotations

from dataclasses import dataclass

from fastapi import FastAPI

from ai_arbitration_dao.agents.base import SeatConfig
from ai_arbitration_dao.config import AppSettings, get_settings
from ai_arbitration_dao.types import SeatProvider


@dataclass(slots=True, frozen=True)
class SeatHealth:
    seat: SeatConfig
    runtime_status: str
    rpc_status: str
    governance_status: str


def build_health_app(settings: AppSettings, seat_health: SeatHealth) -> FastAPI:
    app = FastAPI(title=f"{settings.dao_name}-health", version="0.1.0")

    @app.get("/livez")
    async def livez() -> dict[str, str]:
        return {"status": "ok", "seat_id": seat_health.seat.seat_id}

    @app.get("/readyz")
    async def readyz() -> dict[str, str]:
        return {
            "seat_id": seat_health.seat.seat_id,
            "model_provider": seat_health.seat.provider.value,
            "runtime_status": seat_health.runtime_status,
            "rpc_status": seat_health.rpc_status,
            "governance_status": seat_health.governance_status,
        }

    return app


def default_health_app() -> FastAPI:
    settings = get_settings()
    seat = SeatConfig(
        seat_id="seat-claude",
        provider=SeatProvider.CLAUDE,
        model=settings.claude_model,
    )
    return build_health_app(
        settings,
        SeatHealth(
            seat=seat,
            runtime_status="ready",
            rpc_status="ok",
            governance_status="ok",
        ),
    )
