from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import SeatProvider


@dataclass(slots=True, frozen=True)
class SeatConfig:
    seat_id: str
    provider: SeatProvider
    model: str

    def as_dict(self) -> dict[str, str]:
        return {
            "seat_id": self.seat_id,
            "model_provider": self.provider.value,
            "model": self.model,
        }


class AgentSeat(Protocol):
    config: SeatConfig

    def assess(self, prompt: str) -> str:
        ...


def fixed_panel_template(settings: AppSettings) -> tuple[SeatConfig, SeatConfig, SeatConfig]:
    return (
        SeatConfig("seat-claude", SeatProvider.CLAUDE, settings.claude_model),
        SeatConfig("seat-openai", SeatProvider.OPENAI, settings.openai_model),
        SeatConfig("seat-minimax", SeatProvider.MINIMAX, settings.minimax_model),
    )
