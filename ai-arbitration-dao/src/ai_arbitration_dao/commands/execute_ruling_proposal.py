from __future__ import annotations

import hashlib
from argparse import Namespace
from typing import Any

from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.domain import RulingOutcome, create_audit_artifact
from ai_arbitration_dao.orchestration.proposal_authorization import (
    EXECUTED_GOVERNANCE_PROOF_TYPE,
    ProposalStore,
    authorize_ruling_write,
    parse_proposal_proof,
)
from ai_arbitration_dao.types import CommandResult, CommandStatus


def _coerce_bool(raw_value: object) -> bool | None:
    if isinstance(raw_value, bool):
        return raw_value

    if isinstance(raw_value, int):
        return raw_value != 0

    if isinstance(raw_value, str):
        normalized = raw_value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False

    return None


def _outcome_from_proof(proof: dict[str, Any]) -> RulingOutcome | None:
    raw_outcome = proof.get("outcome", RulingOutcome.ALLOW.value)
    if not isinstance(raw_outcome, str):
        return None

    normalized = raw_outcome.strip()
    if normalized not in {RulingOutcome.ALLOW.value, RulingOutcome.DENY.value}:
        return None

    return RulingOutcome(normalized)


def run_execute_ruling_proposal(args: Namespace, _: AppSettings) -> CommandResult:
    proposal_id = str(getattr(args, "proposal_id", "")).strip()
    if not proposal_id:
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "error": "proposal_id is required",
                "si": ["SI-008", "SI-009", "SI-013"],
            },
        )

    already_ruled = _coerce_bool(getattr(args, "already_ruled", False))
    if already_ruled is None:
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "proposal_id": proposal_id,
                "reason": "already_ruled must be a boolean value",
                "si": ["SI-010", "SI-015"],
            },
        )

    if already_ruled:
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.ALREADY_RULED,
            details={
                "proposal_id": proposal_id,
                "reason": "target dispute round already has a ruling",
                "si": ["SI-010", "SI-015"],
            },
        )

    target_dispute_id = str(getattr(args, "dispute_id", "")).strip()
    if not target_dispute_id:
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "proposal_id": proposal_id,
                "reason": "dispute_id is required unless --already-ruled is set",
                "si": ["SI-008", "SI-009"],
            },
        )

    raw_round = getattr(args, "round", 0)
    if isinstance(raw_round, bool):
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "proposal_id": proposal_id,
                "reason": "round must be an integer",
                "si": ["SI-008", "SI-009", "SI-011"],
            },
        )

    try:
        target_round = int(raw_round)
    except (TypeError, ValueError):
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "proposal_id": proposal_id,
                "reason": "round must be an integer",
                "si": ["SI-008", "SI-009", "SI-011"],
            },
        )

    if target_round < 0:
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "proposal_id": proposal_id,
                "reason": "round must be non-negative",
                "si": ["SI-008", "SI-009", "SI-011"],
            },
        )

    proof = getattr(args, "proposal_proof", None)
    if proof is None:
        proof = {
            "proposal_id": proposal_id,
            "proof_type": EXECUTED_GOVERNANCE_PROOF_TYPE,
            "executed": True,
            "dispute_id": target_dispute_id,
            "round": target_round,
        }
    elif not isinstance(proof, dict):
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "proposal_id": proposal_id,
                "reason": "invalid proposal proof: expected JSON object",
                "si": ["SI-008", "SI-009"],
            },
        )

    parsed_proof = parse_proposal_proof(proof)
    if parsed_proof is None:
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "proposal_id": proposal_id,
                "reason": "invalid proposal proof",
                "si": ["SI-008", "SI-009"],
            },
        )

    if parsed_proof.proposal_id != proposal_id:
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "proposal_id": proposal_id,
                "reason": "proposal proof mismatch: proposal_id does not match command argument",
                "si": ["SI-008", "SI-009"],
            },
        )

    store = ProposalStore()
    store.add_proposal(parsed_proof)

    status, error = authorize_ruling_write(store, proof, target_dispute_id, target_round)

    if status == CommandStatus.FAILED:
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "proposal_id": proposal_id,
                "reason": error,
                "si": ["SI-008", "SI-009"],
            },
        )

    outcome = _outcome_from_proof(proof)
    if outcome is None:
        return CommandResult(
            command="execute-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "proposal_id": proposal_id,
                "reason": "invalid outcome in proposal proof: expected Allow or Deny",
                "si": ["SI-008", "SI-009", "SI-016"],
            },
        )

    tx_signature = f"sig_{proposal_id[:16]}"
    payload_hash = hashlib.sha256(
        f"{proposal_id}:{target_dispute_id}:{target_round}:{outcome.value}".encode()
    ).hexdigest()

    audit = create_audit_artifact(
        proposal_id=proposal_id,
        tx_signature=tx_signature,
        payload_hash=payload_hash,
        dispute_id=target_dispute_id,
        round=target_round,
        outcome=outcome,
    )

    return CommandResult(
        command="execute-ruling-proposal",
        status=CommandStatus.EXECUTED,
        details={
            "audit_artifact": audit.as_dict(),
            "si": ["SI-008", "SI-012", "SI-013", "SI-016"],
        },
    )
