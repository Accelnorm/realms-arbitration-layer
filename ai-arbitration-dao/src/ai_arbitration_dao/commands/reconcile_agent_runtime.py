from __future__ import annotations

from argparse import Namespace

from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandResult, CommandStatus


def _target_status(raw_status: str) -> CommandStatus | None:
    try:
        return CommandStatus(raw_status)
    except ValueError:
        return None


def run_reconcile_agent_runtime(args: Namespace, _: AppSettings) -> CommandResult:
    dispute_id = str(getattr(args, "dispute_id", "")).strip()
    if not dispute_id:
        return CommandResult(
            command="reconcile-agent-runtime",
            status=CommandStatus.FAILED,
            details={
                "error": "dispute_id is required",
                "si": ["SI-014", "SI-015", "SI-023"],
            },
        )

    raw_round = getattr(args, "round", None)
    if isinstance(raw_round, bool):
        return CommandResult(
            command="reconcile-agent-runtime",
            status=CommandStatus.FAILED,
            details={
                "error": "round must be an integer",
                "si": ["SI-014", "SI-015", "SI-023"],
            },
        )

    try:
        round_value = int(raw_round)
    except (TypeError, ValueError):
        return CommandResult(
            command="reconcile-agent-runtime",
            status=CommandStatus.FAILED,
            details={
                "error": "round must be an integer",
                "si": ["SI-014", "SI-015", "SI-023"],
            },
        )

    if round_value < 0:
        return CommandResult(
            command="reconcile-agent-runtime",
            status=CommandStatus.FAILED,
            details={
                "error": "round must be non-negative",
                "si": ["SI-014", "SI-015", "SI-023"],
            },
        )

    status = _target_status(str(getattr(args, "target_status", "")).strip())
    if status is None:
        return CommandResult(
            command="reconcile-agent-runtime",
            status=CommandStatus.FAILED,
            details={
                "error": (
                    "target_status must be one of: "
                    "pending, executed, already_ruled, failed"
                ),
                "si": ["SI-014", "SI-015", "SI-023"],
            },
        )

    return CommandResult(
        command="reconcile-agent-runtime",
        status=status,
        details={
            "dispute_id": dispute_id,
            "round": round_value,
            "reconciled_status": status.value,
            "si": ["SI-014", "SI-015", "SI-023"],
        },
    )
