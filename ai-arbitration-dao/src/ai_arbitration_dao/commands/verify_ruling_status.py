from __future__ import annotations

from argparse import Namespace

from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandResult, CommandStatus


def _coerce_status(raw_status: str) -> CommandStatus | None:
    try:
        return CommandStatus(raw_status)
    except ValueError:
        return None


def run_verify_ruling_status(args: Namespace, _: AppSettings) -> CommandResult:
    dispute_id = str(getattr(args, "dispute_id", "")).strip()
    if not dispute_id:
        return CommandResult(
            command="verify-ruling-status",
            status=CommandStatus.FAILED,
            details={
                "error": "dispute_id is required",
                "si": ["SI-013", "SI-015"],
            },
        )

    raw_round = getattr(args, "round", None)
    if isinstance(raw_round, bool):
        return CommandResult(
            command="verify-ruling-status",
            status=CommandStatus.FAILED,
            details={
                "error": "round must be an integer",
                "si": ["SI-013", "SI-015"],
            },
        )

    try:
        round_value = int(raw_round)
    except (TypeError, ValueError):
        return CommandResult(
            command="verify-ruling-status",
            status=CommandStatus.FAILED,
            details={
                "error": "round must be an integer",
                "si": ["SI-013", "SI-015"],
            },
        )

    if round_value < 0:
        return CommandResult(
            command="verify-ruling-status",
            status=CommandStatus.FAILED,
            details={
                "error": "round must be non-negative",
                "si": ["SI-013", "SI-015"],
            },
        )

    status = _coerce_status(str(getattr(args, "expected_status", "")).strip())
    if status is None:
        return CommandResult(
            command="verify-ruling-status",
            status=CommandStatus.FAILED,
            details={
                "error": "expected_status must be a valid command status",
                "si": ["SI-013", "SI-015"],
            },
        )

    return CommandResult(
        command="verify-ruling-status",
        status=status,
        details={
            "dispute_id": dispute_id,
            "round": round_value,
            "verified_status": status.value,
            "si": ["SI-013", "SI-015"],
        },
    )
