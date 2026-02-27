from argparse import Namespace

from ai_arbitration_dao.commands.reconcile_agent_runtime import run_reconcile_agent_runtime
from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandStatus


def _settings() -> AppSettings:
    return AppSettings()


def _args(**overrides: object) -> Namespace:
    base = {
        "dispute_id": "dispute-1",
        "round": 0,
        "target_status": "executed",
    }
    base.update(overrides)
    return Namespace(**base)


def test_reconcile_agent_runtime_succeeds_for_valid_input() -> None:
    result = run_reconcile_agent_runtime(_args(), _settings())

    assert result.status == CommandStatus.EXECUTED
    assert result.details["reconciled_status"] == "executed"


def test_reconcile_agent_runtime_rejects_invalid_target_status() -> None:
    result = run_reconcile_agent_runtime(_args(target_status="invalid"), _settings())

    assert result.status == CommandStatus.FAILED
    assert "target_status must be one of" in str(result.details["error"])


def test_reconcile_agent_runtime_rejects_empty_dispute_id() -> None:
    result = run_reconcile_agent_runtime(_args(dispute_id="   "), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "dispute_id is required"


def test_reconcile_agent_runtime_rejects_negative_round() -> None:
    result = run_reconcile_agent_runtime(_args(round=-1), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "round must be non-negative"


def test_reconcile_agent_runtime_rejects_boolean_round() -> None:
    result = run_reconcile_agent_runtime(_args(round=False), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "round must be an integer"
