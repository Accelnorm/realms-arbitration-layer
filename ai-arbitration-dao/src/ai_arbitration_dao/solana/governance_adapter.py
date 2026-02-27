from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from ai_arbitration_dao.solana.instruction_codecs.ruling import RecordRulingPayload


@dataclass(slots=True, frozen=True)
class ProposalIntent:
    governance_address: str
    dispute_id: str
    round: int
    payload: RecordRulingPayload


class GovernanceAdapter:
    """Deterministic proposal-id builder for governance orchestration stubs."""

    def derive_proposal_id(self, intent: ProposalIntent) -> str:
        digest = hashlib.sha256(
            (
                f"{intent.governance_address}|{intent.dispute_id}|{intent.round}|"
                f"{intent.payload.payload_hash_hex()}"
            ).encode()
        ).hexdigest()
        return digest[:32]

    def proposal_proof(self, proposal_id: str, *, dispute_id: str, round: int) -> dict[str, Any]:
        return {
            "proposal_id": proposal_id,
            "proof_type": "executed-governance-proposal",
            "executed": True,
            "dispute_id": dispute_id,
            "round": round,
        }
