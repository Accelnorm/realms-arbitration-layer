from __future__ import annotations

from argparse import Namespace

from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.types import CommandResult, CommandStatus, SeatProvider


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


def run_agent_health_check(args: Namespace, _: AppSettings) -> CommandResult:
    seat_id = str(getattr(args, "seat_id", "")).strip()
    if not seat_id:
        return CommandResult(
            command="agent-health-check",
            status=CommandStatus.FAILED,
            details={
                "error": "seat_id is required",
                "si": ["SI-017", "SI-022", "SI-023"],
            },
        )

    raw_model_provider = str(getattr(args, "model_provider", "")).strip()
    try:
        model_provider = SeatProvider(raw_model_provider)
    except ValueError:
        return CommandResult(
            command="agent-health-check",
            status=CommandStatus.FAILED,
            details={
                "error": "model_provider must be one of: claude, openai, minimax",
                "si": ["SI-017", "SI-022", "SI-023"],
            },
        )

    rpc_ok = _coerce_bool(getattr(args, "rpc_ok", True))
    if rpc_ok is None:
        return CommandResult(
            command="agent-health-check",
            status=CommandStatus.FAILED,
            details={
                "error": "rpc_ok must be a boolean value",
                "si": ["SI-017", "SI-022", "SI-023"],
            },
        )

    governance_ok = _coerce_bool(getattr(args, "governance_ok", True))
    if governance_ok is None:
        return CommandResult(
            command="agent-health-check",
            status=CommandStatus.FAILED,
            details={
                "error": "governance_ok must be a boolean value",
                "si": ["SI-017", "SI-022", "SI-023"],
            },
        )

    model_ok = _coerce_bool(getattr(args, "model_ok", True))
    if model_ok is None:
        return CommandResult(
            command="agent-health-check",
            status=CommandStatus.FAILED,
            details={
                "error": "model_ok must be a boolean value",
                "si": ["SI-017", "SI-022", "SI-023"],
            },
        )

    healthy = rpc_ok and governance_ok and model_ok
    status = CommandStatus.EXECUTED if healthy else CommandStatus.FAILED

    return CommandResult(
        command="agent-health-check",
        status=status,
        details={
            "seat_id": seat_id,
            "model_provider": model_provider.value,
            "runtime_status": "ready" if healthy else "degraded",
            "rpc_status": "ok" if rpc_ok else "failed",
            "governance_status": "ok" if governance_ok else "failed",
            "model_status": "ok" if model_ok else "failed",
            "si": ["SI-017", "SI-022", "SI-023"],
        },
    )
