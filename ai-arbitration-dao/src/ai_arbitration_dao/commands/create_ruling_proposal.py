from __future__ import annotations

import hashlib
from argparse import Namespace

from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.domain.dispute_snapshot import DisputeSnapshot, RulingOutcome
from ai_arbitration_dao.domain.ruling_payload import compile_ruling_payload
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


def run_create_ruling_proposal(args: Namespace, _: AppSettings) -> CommandResult:
    is_final = _coerce_bool(getattr(args, "is_final", False))
    if is_final is None:
        return CommandResult(
            command="create-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "error": "is_final must be a boolean value",
                "si": ["SI-006", "SI-007"],
            },
        )

    raw_payout_id = getattr(args, "payout_id", None)
    if isinstance(raw_payout_id, bool):
        return CommandResult(
            command="create-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "error": "payout_id must be an integer",
                "si": ["SI-006", "SI-007"],
            },
        )

    raw_round = getattr(args, "round", None)
    if isinstance(raw_round, bool):
        return CommandResult(
            command="create-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "error": "round must be an integer",
                "si": ["SI-006", "SI-007"],
            },
        )

    try:
        snapshot = DisputeSnapshot(
            safe=str(getattr(args, "safe", "")).strip(),
            payout_id=int(raw_payout_id),
            dispute_id=str(getattr(args, "dispute_id", "")).strip(),
            round=int(raw_round),
            outcome=RulingOutcome(str(getattr(args, "outcome", "")).strip()),
        )
        payload = compile_ruling_payload(snapshot, is_final=is_final)
    except (TypeError, ValueError) as exc:
        return CommandResult(
            command="create-ruling-proposal",
            status=CommandStatus.FAILED,
            details={
                "error": str(exc),
                "si": ["SI-006", "SI-007"],
            },
        )

    proposal_id = hashlib.sha256(payload.serialized.encode("utf-8")).hexdigest()[:24]

    return CommandResult(
        command="create-ruling-proposal",
        status=CommandStatus.PENDING,
        details={
            "proposal_id": proposal_id,
            "payload": payload.as_dict(),
            "snapshot": snapshot.canonical_fields(),
            "si": ["SI-006", "SI-007", "SI-012"],
        },
    )
