from argparse import Namespace

from ai_arbitration_dao.commands.execute_ruling_proposal import run_execute_ruling_proposal
from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandStatus


def _settings() -> AppSettings:
    return AppSettings()


def _args(**overrides: object) -> Namespace:
    base = {
        "proposal_id": "prop-123",
        "already_ruled": False,
        "dispute_id": "dispute-1",
        "round": 0,
        "proposal_proof": {
            "proposal_id": "prop-123",
            "executed": True,
            "dispute_id": "dispute-1",
            "round": 0,
            "outcome": "Allow",
        },
    }
    base.update(overrides)
    return Namespace(**base)


def test_execute_rejects_empty_proposal_id() -> None:
    result = run_execute_ruling_proposal(_args(proposal_id="   "), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "proposal_id is required"


def test_execute_rejects_empty_dispute_id_without_already_ruled() -> None:
    result = run_execute_ruling_proposal(_args(dispute_id="   "), _settings())

    assert result.status == CommandStatus.FAILED
    assert "dispute_id is required" in str(result.details["reason"])


def test_execute_rejects_negative_round() -> None:
    result = run_execute_ruling_proposal(_args(round=-1), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["reason"] == "round must be non-negative"


def test_execute_rejects_non_boolean_already_ruled() -> None:
    result = run_execute_ruling_proposal(_args(already_ruled="maybe"), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["reason"] == "already_ruled must be a boolean value"


def test_execute_rejects_boolean_round_type() -> None:
    result = run_execute_ruling_proposal(_args(round=True), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["reason"] == "round must be an integer"


def test_execute_rejects_non_object_proposal_proof() -> None:
    result = run_execute_ruling_proposal(_args(proposal_proof=[]), _settings())

    assert result.status == CommandStatus.FAILED
    assert "expected JSON object" in str(result.details["reason"])


def test_execute_rejects_mismatched_proposal_id_between_arg_and_proof() -> None:
    result = run_execute_ruling_proposal(
        _args(proposal_id="prop-abc", proposal_proof={"proposal_id": "prop-def", "executed": True}),
        _settings(),
    )

    assert result.status == CommandStatus.FAILED
    assert "proposal proof mismatch" in str(result.details["reason"])


def test_execute_rejects_invalid_outcome() -> None:
    result = run_execute_ruling_proposal(
        _args(
            proposal_proof={
                "proposal_id": "prop-123",
                "executed": True,
                "dispute_id": "dispute-1",
                "round": 0,
                "outcome": "Escalate",
            }
        ),
        _settings(),
    )

    assert result.status == CommandStatus.FAILED
    assert "invalid outcome" in str(result.details["reason"])


def test_execute_rejects_missing_replay_binding_fields_in_proof() -> None:
    result = run_execute_ruling_proposal(
        _args(proposal_proof={"proposal_id": "prop-123", "executed": True}),
        _settings(),
    )

    assert result.status == CommandStatus.FAILED
    assert "dispute_id is required" in str(result.details["reason"])
