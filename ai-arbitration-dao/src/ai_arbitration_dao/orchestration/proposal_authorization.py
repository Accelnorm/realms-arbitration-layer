from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_arbitration_dao.types import CommandStatus

EXECUTED_GOVERNANCE_PROOF_TYPE = "executed-governance-proposal"


@dataclass(frozen=True)
class ProposalProof:
    proposal_id: str
    proof_type: str
    executed: bool
    dispute_id: str | None = None
    round: int | None = None


class ProposalAuthorizationError(Exception):
    def __init__(self, status: CommandStatus, message: str) -> None:
        self.status = status
        self.message = message
        super().__init__(message)


class ProposalStore:
    def __init__(self) -> None:
        self._proposals: dict[str, ProposalProof] = {}

    def add_proposal(self, proof: ProposalProof) -> None:
        self._proposals[proof.proposal_id] = proof

    def get_proposal(self, proposal_id: str) -> ProposalProof | None:
        return self._proposals.get(proposal_id)

    def mark_executed(self, proposal_id: str) -> bool:
        proposal = self._proposals.get(proposal_id)
        if proposal is None:
            return False
        self._proposals[proposal_id] = ProposalProof(
            proposal_id=proposal.proposal_id,
            proof_type=proposal.proof_type,
            executed=True,
            dispute_id=proposal.dispute_id,
            round=proposal.round,
        )
        return True


def parse_proposal_proof(proof: dict[str, Any]) -> ProposalProof | None:
    proposal_id_raw = proof.get("proposal_id")
    if not isinstance(proposal_id_raw, str):
        return None

    proposal_id = proposal_id_raw.strip()
    if not proposal_id:
        return None

    proof_type_raw = proof.get("proof_type", EXECUTED_GOVERNANCE_PROOF_TYPE)
    if not isinstance(proof_type_raw, str):
        return None

    proof_type = proof_type_raw.strip()
    if not proof_type:
        return None

    executed_raw = proof.get("executed")
    if not isinstance(executed_raw, bool):
        return None

    dispute_id_raw = proof.get("dispute_id")
    dispute_id: str | None
    if dispute_id_raw is None:
        dispute_id = None
    elif isinstance(dispute_id_raw, str) and dispute_id_raw.strip():
        dispute_id = dispute_id_raw.strip()
    else:
        return None

    round_raw = proof.get("round")
    round_value: int | None
    if round_raw is None:
        round_value = None
    elif isinstance(round_raw, int) and not isinstance(round_raw, bool) and round_raw >= 0:
        round_value = round_raw
    else:
        return None

    return ProposalProof(
        proposal_id=proposal_id,
        proof_type=proof_type,
        executed=executed_raw,
        dispute_id=dispute_id,
        round=round_value,
    )


def authorize_ruling_write(
    store: ProposalStore,
    proof: dict[str, Any] | None,
    target_dispute_id: str,
    target_round: int,
) -> tuple[CommandStatus, str | None]:
    if not target_dispute_id.strip():
        return (
            CommandStatus.FAILED,
            "invalid target dispute: dispute_id is required",
        )

    if target_round < 0:
        return (
            CommandStatus.FAILED,
            "invalid target round: round must be non-negative",
        )

    if proof is None:
        return (
            CommandStatus.FAILED,
            "proposal proof missing: resolver write requires executed governance proposal",
        )

    parsed = parse_proposal_proof(proof)
    if parsed is None:
        return (
            CommandStatus.FAILED,
            "invalid proposal proof: missing required fields (proposal_id)",
        )

    if parsed.proof_type != EXECUTED_GOVERNANCE_PROOF_TYPE:
        return (
            CommandStatus.FAILED,
            f"invalid proposal proof type: expected {EXECUTED_GOVERNANCE_PROOF_TYPE}",
        )

    if not parsed.executed:
        return (
            CommandStatus.FAILED,
            f"proposal not executed: proposal {parsed.proposal_id} status is not executed",
        )

    stored = store.get_proposal(parsed.proposal_id)
    if stored is None:
        return (
            CommandStatus.FAILED,
            f"proposal not found: {parsed.proposal_id}",
        )

    if not stored.executed:
        return (
            CommandStatus.FAILED,
            f"proposal not executed: proposal {parsed.proposal_id} is not marked as executed",
        )

    if parsed.dispute_id is None:
        return (
            CommandStatus.FAILED,
            "invalid proposal proof: dispute_id is required for replay protection",
        )

    if parsed.round is None:
        return (
            CommandStatus.FAILED,
            "invalid proposal proof: round is required for replay protection",
        )

    if parsed.dispute_id is not None and parsed.dispute_id != target_dispute_id:
        return (
            CommandStatus.FAILED,
            f"dispute mismatch: proposal dispute {parsed.dispute_id} != "
            f"target dispute {target_dispute_id}",
        )

    if parsed.round is not None and parsed.round != target_round:
        return (
            CommandStatus.FAILED,
            f"round mismatch: proposal round {parsed.round} != target round {target_round}",
        )

    return CommandStatus.PENDING, None
