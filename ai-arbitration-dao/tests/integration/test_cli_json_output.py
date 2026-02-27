from __future__ import annotations

import json

from ai_arbitration_dao.cli import entrypoint


def test_cli_bootstrap_json_output(capsys: object) -> None:
    exit_code = entrypoint(
        [
            "--json",
            "bootstrap-arbitration-dao",
            "--creator",
            "11111111111111111111111111111111",
            "--realm-name",
            "realm111",
        ]
    )

    assert exit_code == 0

    captured = capsys.readouterr()  # type: ignore[attr-defined]
    payload = json.loads(captured.out)

    assert payload["command"] == "bootstrap-arbitration-dao"
    assert payload["status"] == "executed"


def test_execute_ruling_proposal_with_valid_proof(capsys: object) -> None:
    exit_code = entrypoint(
        [
            "--json",
            "execute-ruling-proposal",
            "--proposal-id",
            "prop-123",
            "--dispute-id",
            "dispute-1",
            "--round",
            "0",
            "--proposal-proof",
            '{"proposal_id": "prop-123", "executed": true, "dispute_id": "dispute-1", "round": 0}',
        ]
    )

    assert exit_code == 0

    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    assert payload["command"] == "execute-ruling-proposal"
    assert payload["status"] == "executed"
    assert "SI-008" in payload["details"]["si"]


def test_execute_ruling_proposal_with_already_ruled(capsys: object) -> None:
    exit_code = entrypoint(
        [
            "--json",
            "execute-ruling-proposal",
            "--proposal-id",
            "prop-123",
            "--already-ruled",
        ]
    )

    assert exit_code == 0

    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    assert payload["command"] == "execute-ruling-proposal"
    assert payload["status"] == "already_ruled"
