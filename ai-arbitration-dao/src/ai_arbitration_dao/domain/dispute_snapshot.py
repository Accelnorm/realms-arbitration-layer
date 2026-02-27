from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class RulingOutcome(StrEnum):
    ALLOW = "Allow"
    DENY = "Deny"


@dataclass(slots=True, frozen=True)
class DisputeSnapshot:
    safe: str
    payout_id: int
    dispute_id: str
    round: int
    outcome: RulingOutcome

    def ensure_canonical(self) -> None:
        if not self.safe:
            raise ValueError("safe is required")
        if self.payout_id < 0:
            raise ValueError("payout_id must be non-negative")
        if not self.dispute_id:
            raise ValueError("dispute_id is required")
        if self.round < 0:
            raise ValueError("round must be non-negative")

    def canonical_fields(self) -> dict[str, Any]:
        self.ensure_canonical()
        return {
            "safe": self.safe,
            "payout_id": self.payout_id,
            "dispute_id": self.dispute_id,
            "round": self.round,
            "outcome": self.outcome.value,
        }
