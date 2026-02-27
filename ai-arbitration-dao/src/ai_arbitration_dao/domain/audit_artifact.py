from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_arbitration_dao.domain.dispute_snapshot import RulingOutcome


@dataclass(slots=True, frozen=True)
class AuditArtifact:
    proposal_id: str
    tx_signature: str
    payload_hash: str
    dispute_id: str
    round: int
    outcome: RulingOutcome

    def as_dict(self) -> dict[str, Any]:
        return {
            "proposal_id": self.proposal_id,
            "tx_signature": self.tx_signature,
            "payload_hash": self.payload_hash,
            "dispute_id": self.dispute_id,
            "round": self.round,
            "outcome": self.outcome.value,
        }


def create_audit_artifact(
    proposal_id: str,
    tx_signature: str,
    payload_hash: str,
    dispute_id: str,
    round: int,
    outcome: RulingOutcome,
) -> AuditArtifact:
    return AuditArtifact(
        proposal_id=proposal_id,
        tx_signature=tx_signature,
        payload_hash=payload_hash,
        dispute_id=dispute_id,
        round=round,
        outcome=outcome,
    )
