from __future__ import annotations

from argparse import Namespace

from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.solana.pubkeys import normalize_pubkey
from ai_arbitration_dao.types import CommandResult, CommandStatus


def _coerce_approve(raw_value: object) -> bool | None:
    if isinstance(raw_value, bool):
        return raw_value

    if isinstance(raw_value, int):
        return raw_value != 0

    if isinstance(raw_value, str):
        normalized = raw_value.strip().lower()
        if normalized in {"true", "1", "yes", "approve", "approved"}:
            return True
        if normalized in {"false", "0", "no", "deny", "denied"}:
            return False

    return None


def run_submit_vote(args: Namespace, _: AppSettings) -> CommandResult:
    proposal_id = str(getattr(args, "proposal_id", "")).strip()
    if not proposal_id:
        return CommandResult(
            command="submit-vote",
            status=CommandStatus.FAILED,
            details={
                "error": "proposal_id is required",
                "si": ["SI-012", "SI-013"],
            },
        )

    try:
        voter = normalize_pubkey(str(getattr(args, "voter", "")), field_name="voter")
    except ValueError as exc:
        return CommandResult(
            command="submit-vote",
            status=CommandStatus.FAILED,
            details={
                "error": str(exc),
                "si": ["SI-012", "SI-013", "SI-018"],
            },
        )

    approve = _coerce_approve(getattr(args, "approve", True))
    if approve is None:
        return CommandResult(
            command="submit-vote",
            status=CommandStatus.FAILED,
            details={
                "error": "approve flag must be a boolean value",
                "si": ["SI-012", "SI-013"],
            },
        )

    return CommandResult(
        command="submit-vote",
        status=CommandStatus.PENDING,
        details={
            "proposal_id": proposal_id,
            "voter": voter,
            "vote": "approve" if approve else "deny",
            "si": ["SI-012", "SI-013", "SI-018"],
        },
    )
