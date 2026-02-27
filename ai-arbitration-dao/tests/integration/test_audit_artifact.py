from __future__ import annotations

import json

from ai_arbitration_dao.cli import entrypoint

REQUIRED_AUDIT_FIELDS = frozenset([
    "proposal_id",
    "tx_signature",
    "payload_hash",
    "dispute_id",
    "round",
    "outcome",
])


class TestSI016AuditArtifactCompleteness:
    def test_execute_ruling_proposal_emits_complete_audit_artifact(self, capsys: object) -> None:
        exit_code = entrypoint(
            [
                "--json",
                "execute-ruling-proposal",
                "--proposal-id",
                "prop-abc123",
                "--dispute-id",
                "dispute-42",
                "--round",
                "1",
                "--proposal-proof",
                (
                    '{"proposal_id": "prop-abc123", "executed": true, '
                    '"dispute_id": "dispute-42", "round": 1, "outcome": "Allow"}'
                ),
            ]
        )

        assert exit_code == 0

        captured = capsys.readouterr()  # type: ignore[attr-defined]
        payload = json.loads(captured.out)

        assert payload["status"] == "executed"
        assert "audit_artifact" in payload["details"]

        audit = payload["details"]["audit_artifact"]
        for field in REQUIRED_AUDIT_FIELDS:
            assert field in audit, f"Missing required audit field: {field}"
            assert audit[field], f"Empty audit field: {field}"

        assert audit["dispute_id"] == "dispute-42"
        assert audit["round"] == 1
        assert audit["outcome"] == "Allow"

    def test_execute_ruling_proposal_audit_includes_payload_hash(self, capsys: object) -> None:
        exit_code = entrypoint(
            [
                "--json",
                "execute-ruling-proposal",
                "--proposal-id",
                "prop-xyz789",
                "--dispute-id",
                "dispute-99",
                "--round",
                "3",
                "--proposal-proof",
                (
                    '{"proposal_id": "prop-xyz789", "executed": true, '
                    '"dispute_id": "dispute-99", "round": 3, "outcome": "Deny"}'
                ),
            ]
        )

        assert exit_code == 0

        captured = capsys.readouterr()
        payload = json.loads(captured.out)

        audit = payload["details"]["audit_artifact"]
        assert len(audit["payload_hash"]) == 64
        assert audit["outcome"] == "Deny"

    def test_execute_ruling_proposal_audit_tx_signature_format(self, capsys: object) -> None:
        exit_code = entrypoint(
            [
                "--json",
                "execute-ruling-proposal",
                "--proposal-id",
                "prop-test123",
                "--dispute-id",
                "dispute-1",
                "--round",
                "0",
                "--proposal-proof",
                (
                    '{"proposal_id": "prop-test123", "executed": true, '
                    '"dispute_id": "dispute-1", "round": 0}'
                ),
            ]
        )

        assert exit_code == 0

        captured = capsys.readouterr()
        payload = json.loads(captured.out)

        audit = payload["details"]["audit_artifact"]
        assert audit["tx_signature"].startswith("sig_")
        assert len(audit["tx_signature"]) > 4
