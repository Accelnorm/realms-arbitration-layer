from argparse import Namespace

from ai_arbitration_dao.commands.bootstrap import run_bootstrap_arbitration_dao
from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandStatus

VALID_CREATOR = "11111111111111111111111111111111"


def _settings() -> AppSettings:
    return AppSettings()


def test_bootstrap_rejects_custom_panel_in_mvp() -> None:
    args = Namespace(creator=VALID_CREATOR, realm_name="realm", custom_panel="custom")
    result = run_bootstrap_arbitration_dao(args, _settings())

    assert result.status == CommandStatus.FAILED
    assert "MVP forbids custom panel" in str(result.details["error"])


def test_bootstrap_emits_deterministic_manifest() -> None:
    args = Namespace(creator=VALID_CREATOR, realm_name="realm", custom_panel="")

    result_one = run_bootstrap_arbitration_dao(args, _settings())
    result_two = run_bootstrap_arbitration_dao(args, _settings())

    assert result_one.status == CommandStatus.EXECUTED
    assert result_one.details["manifest"] == result_two.details["manifest"]


def test_bootstrap_rejects_invalid_creator_pubkey() -> None:
    args = Namespace(creator="creator111", realm_name="realm", custom_panel="")

    result = run_bootstrap_arbitration_dao(args, _settings())

    assert result.status == CommandStatus.FAILED
    assert "creator must be a valid Solana public key" in str(result.details["error"])


def test_bootstrap_rejects_empty_realm_name() -> None:
    args = Namespace(creator=VALID_CREATOR, realm_name="   ", custom_panel="")

    result = run_bootstrap_arbitration_dao(args, _settings())

    assert result.status == CommandStatus.FAILED
    assert str(result.details["error"]) == "realm_name is required"
