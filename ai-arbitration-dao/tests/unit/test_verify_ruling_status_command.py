from argparse import Namespace

from ai_arbitration_dao.commands.verify_ruling_status import run_verify_ruling_status
from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandStatus


def _settings() -> AppSettings:
    return AppSettings()


def _args(**overrides: object) -> Namespace:
    base = {
        "dispute_id": "dispute-1",
        "round": 0,
        "expected_status": "executed",
    }
    base.update(overrides)
    return Namespace(**base)


def test_verify_ruling_status_succeeds_for_valid_input() -> None:
    result = run_verify_ruling_status(_args(), _settings())

    assert result.status == CommandStatus.EXECUTED
    assert result.details["verified_status"] == "executed"


def test_verify_ruling_status_rejects_invalid_expected_status() -> None:
    result = run_verify_ruling_status(_args(expected_status="done"), _settings())

    assert result.status == CommandStatus.FAILED
    assert "expected_status must be a valid command status" in str(result.details["error"])


def test_verify_ruling_status_rejects_empty_dispute_id() -> None:
    result = run_verify_ruling_status(_args(dispute_id="  "), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "dispute_id is required"


def test_verify_ruling_status_rejects_negative_round() -> None:
    result = run_verify_ruling_status(_args(round=-1), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "round must be non-negative"


def test_verify_ruling_status_rejects_boolean_round() -> None:
    result = run_verify_ruling_status(_args(round=True), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "round must be an integer"
