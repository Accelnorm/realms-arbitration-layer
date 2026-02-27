from argparse import Namespace

from ai_arbitration_dao.commands.create_ruling_proposal import run_create_ruling_proposal
from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandStatus


def _settings() -> AppSettings:
    return AppSettings()


def _args(**overrides: object) -> Namespace:
    base = {
        "safe": "safe111",
        "payout_id": 1,
        "dispute_id": "dispute-1",
        "round": 0,
        "outcome": "Allow",
        "is_final": False,
    }
    base.update(overrides)
    return Namespace(**base)


def test_create_ruling_proposal_succeeds_for_valid_input() -> None:
    result = run_create_ruling_proposal(_args(), _settings())

    assert result.status == CommandStatus.PENDING
    assert "proposal_id" in result.details
    assert result.details["snapshot"]["dispute_id"] == "dispute-1"


def test_create_ruling_proposal_rejects_non_boolean_is_final() -> None:
    result = run_create_ruling_proposal(_args(is_final="sometimes"), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "is_final must be a boolean value"


def test_create_ruling_proposal_rejects_boolean_payout_id() -> None:
    result = run_create_ruling_proposal(_args(payout_id=True), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "payout_id must be an integer"


def test_create_ruling_proposal_rejects_boolean_round() -> None:
    result = run_create_ruling_proposal(_args(round=False), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "round must be an integer"
