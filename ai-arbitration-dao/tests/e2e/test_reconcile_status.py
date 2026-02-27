from ai_arbitration_dao.orchestration.reconciliation import reconcile_status
from ai_arbitration_dao.types import CommandStatus


def test_reconcile_keeps_terminal_status() -> None:
    result = reconcile_status(CommandStatus.ALREADY_RULED, CommandStatus.EXECUTED)
    assert result == CommandStatus.ALREADY_RULED


def test_reconcile_moves_pending_to_target() -> None:
    result = reconcile_status(CommandStatus.PENDING, CommandStatus.EXECUTED)
    assert result == CommandStatus.EXECUTED
