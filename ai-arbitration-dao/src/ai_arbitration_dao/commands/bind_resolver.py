from __future__ import annotations

from argparse import Namespace

from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.solana.pubkeys import normalize_pubkey
from ai_arbitration_dao.types import CommandResult, CommandStatus


def _normalized_string(raw_value: object) -> str:
    if raw_value is None:
        return ""
    return str(raw_value).strip()


def run_bind_resolver(args: Namespace, _: AppSettings) -> CommandResult:
    try:
        governance_address = normalize_pubkey(
            _normalized_string(getattr(args, "governance_address", "")),
            field_name="governance_address",
        )
        resolver_address = normalize_pubkey(
            _normalized_string(getattr(args, "resolver_address", "")),
            field_name="resolver_address",
        )
    except ValueError as exc:
        return CommandResult(
            command="bind-resolver",
            status=CommandStatus.FAILED,
            details={
                "error": str(exc),
                "si": ["SI-004", "SI-005", "SI-021"],
            },
        )

    is_match = governance_address == resolver_address
    if not is_match:
        return CommandResult(
            command="bind-resolver",
            status=CommandStatus.FAILED,
            details={
                "error": "resolver mismatch",
                "expected_governance_address": governance_address,
                "actual_resolver_address": resolver_address,
                "si": ["SI-005"],
            },
        )

    return CommandResult(
        command="bind-resolver",
        status=CommandStatus.EXECUTED,
        details={
            "governance_address": governance_address,
            "resolver_address": resolver_address,
            "verified": True,
            "si": ["SI-004", "SI-005", "SI-021"],
        },
    )
