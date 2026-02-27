from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

JsonDict = dict[str, Any]


class CommandStatus(StrEnum):
    PENDING = "pending"
    EXECUTED = "executed"
    ALREADY_RULED = "already_ruled"
    FAILED = "failed"


class SeatProvider(StrEnum):
    CLAUDE = "claude"
    OPENAI = "openai"
    MINIMAX = "minimax"


@dataclass(slots=True, frozen=True)
class CommandResult:
    command: str
    status: CommandStatus
    details: JsonDict = field(default_factory=dict)

    def to_dict(self) -> JsonDict:
        return {
            "command": self.command,
            "status": self.status.value,
            "details": self.details,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))
