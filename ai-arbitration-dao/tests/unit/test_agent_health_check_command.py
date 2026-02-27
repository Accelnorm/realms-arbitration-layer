from argparse import Namespace

from ai_arbitration_dao.commands.agent_health_check import run_agent_health_check
from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandStatus


def _settings() -> AppSettings:
    return AppSettings()


def _args(**overrides: object) -> Namespace:
    base = {
        "seat_id": "seat-claude",
        "model_provider": "claude",
        "rpc_ok": True,
        "governance_ok": True,
        "model_ok": True,
    }
    base.update(overrides)
    return Namespace(**base)


def test_agent_health_check_succeeds_for_healthy_seat() -> None:
    result = run_agent_health_check(_args(), _settings())

    assert result.status == CommandStatus.EXECUTED
    assert result.details["runtime_status"] == "ready"


def test_agent_health_check_reports_degraded_on_component_failure() -> None:
    result = run_agent_health_check(_args(model_ok=False), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["runtime_status"] == "degraded"
    assert result.details["model_status"] == "failed"


def test_agent_health_check_rejects_invalid_model_provider() -> None:
    result = run_agent_health_check(_args(model_provider="unknown"), _settings())

    assert result.status == CommandStatus.FAILED
    assert "model_provider must be one of" in str(result.details["error"])


def test_agent_health_check_rejects_invalid_rpc_ok_type() -> None:
    result = run_agent_health_check(_args(rpc_ok="sometimes"), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "rpc_ok must be a boolean value"


def test_agent_health_check_rejects_missing_seat_id() -> None:
    result = run_agent_health_check(_args(seat_id="   "), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "seat_id is required"
