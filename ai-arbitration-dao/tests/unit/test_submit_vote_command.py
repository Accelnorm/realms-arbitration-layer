from argparse import Namespace

from ai_arbitration_dao.commands.submit_vote import run_submit_vote
from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandStatus

VALID_VOTER = "11111111111111111111111111111111"


def _settings() -> AppSettings:
    return AppSettings()


def _args(**overrides: object) -> Namespace:
    base = {
        "proposal_id": "prop-123",
        "voter": VALID_VOTER,
        "approve": True,
    }
    base.update(overrides)
    return Namespace(**base)


def test_submit_vote_succeeds_for_valid_input() -> None:
    result = run_submit_vote(_args(), _settings())

    assert result.status == CommandStatus.PENDING
    assert result.details["proposal_id"] == "prop-123"
    assert result.details["voter"] == VALID_VOTER
    assert result.details["vote"] == "approve"


def test_submit_vote_rejects_empty_proposal_id() -> None:
    result = run_submit_vote(_args(proposal_id="   "), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "proposal_id is required"


def test_submit_vote_rejects_invalid_voter_pubkey() -> None:
    result = run_submit_vote(_args(voter="not-a-pubkey"), _settings())

    assert result.status == CommandStatus.FAILED
    assert "valid Solana public key" in str(result.details["error"])


def test_submit_vote_rejects_invalid_approve_flag_type() -> None:
    result = run_submit_vote(_args(approve="maybe"), _settings())

    assert result.status == CommandStatus.FAILED
    assert result.details["error"] == "approve flag must be a boolean value"
