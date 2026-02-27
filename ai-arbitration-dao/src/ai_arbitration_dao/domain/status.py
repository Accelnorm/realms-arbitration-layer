from __future__ import annotations

from ai_arbitration_dao.types import CommandStatus

TERMINAL_STATUSES: frozenset[CommandStatus] = frozenset(
    {
        CommandStatus.EXECUTED,
        CommandStatus.ALREADY_RULED,
        CommandStatus.FAILED,
    }
)


def is_terminal_status(status: CommandStatus) -> bool:
    return status in TERMINAL_STATUSES
