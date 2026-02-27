from __future__ import annotations

from dataclasses import dataclass

from ai_arbitration_dao.agents.base import SeatConfig


@dataclass(slots=True, frozen=True)
class OpenAISeat:
    config: SeatConfig

    def assess(self, prompt: str) -> str:
        return f"openai:{self.config.model}:{prompt}"[:240]
