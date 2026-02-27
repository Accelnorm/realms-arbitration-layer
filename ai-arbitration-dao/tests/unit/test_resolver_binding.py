from argparse import Namespace

from ai_arbitration_dao.commands.bind_resolver import run_bind_resolver
from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandStatus

VALID_GOVERNANCE_ADDRESS = "11111111111111111111111111111111"
VALID_RESOLVER_ADDRESS = "Stake11111111111111111111111111111111111111"


def _settings() -> AppSettings:
    return AppSettings()


def test_resolver_binding_succeeds_on_match() -> None:
    args = Namespace(
        governance_address=VALID_GOVERNANCE_ADDRESS,
        resolver_address=VALID_GOVERNANCE_ADDRESS,
    )
    result = run_bind_resolver(args, _settings())

    assert result.status == CommandStatus.EXECUTED
    assert result.details["verified"] is True
    assert result.details["governance_address"] == VALID_GOVERNANCE_ADDRESS
    assert result.details["resolver_address"] == VALID_GOVERNANCE_ADDRESS


def test_resolver_binding_fails_on_mismatch() -> None:
    args = Namespace(
        governance_address=VALID_GOVERNANCE_ADDRESS,
        resolver_address=VALID_RESOLVER_ADDRESS,
    )
    result = run_bind_resolver(args, _settings())

    assert result.status == CommandStatus.FAILED
    assert "resolver mismatch" in str(result.details["error"])
    assert result.details["expected_governance_address"] == VALID_GOVERNANCE_ADDRESS
    assert result.details["actual_resolver_address"] == VALID_RESOLVER_ADDRESS


def test_resolver_binding_fails_on_invalid_pubkey() -> None:
    args = Namespace(
        governance_address="invalid-governance-address",
        resolver_address=VALID_RESOLVER_ADDRESS,
    )
    result = run_bind_resolver(args, _settings())

    assert result.status == CommandStatus.FAILED
    assert "valid Solana public key" in str(result.details["error"])
