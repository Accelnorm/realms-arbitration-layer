from __future__ import annotations

from ai_arbitration_dao.domain.status import is_terminal_status
from ai_arbitration_dao.types import CommandStatus


def reconcile_status(current_status: CommandStatus, target_status: CommandStatus) -> CommandStatus:
    if is_terminal_status(current_status):
        return current_status
    return target_status
