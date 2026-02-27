from __future__ import annotations

import hashlib
from argparse import Namespace

from ai_arbitration_dao.agents.base import fixed_panel_template
from ai_arbitration_dao.config import AppSettings
from ai_arbitration_dao.solana.pubkeys import normalize_pubkey
from ai_arbitration_dao.types import CommandResult, CommandStatus


def _derive_deterministic_address(seed: str) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return f"pda_{digest[:32]}"


def _normalized_string(raw_value: object) -> str:
    if raw_value is None:
        return ""
    return str(raw_value).strip()


def run_bootstrap_arbitration_dao(args: Namespace, settings: AppSettings) -> CommandResult:
    custom_panel = getattr(args, "custom_panel", None)
    if custom_panel:
        return CommandResult(
            command="bootstrap-arbitration-dao",
            status=CommandStatus.FAILED,
            details={
                "error": "MVP forbids custom panel configuration; use default template",
                "si": ["SI-003", "SI-020"],
            },
        )

    realm_name = _normalized_string(getattr(args, "realm_name", ""))
    if not realm_name:
        return CommandResult(
            command="bootstrap-arbitration-dao",
            status=CommandStatus.FAILED,
            details={
                "error": "realm_name is required",
                "si": ["SI-001"],
            },
        )

    try:
        creator = normalize_pubkey(
            _normalized_string(getattr(args, "creator", "")),
            field_name="creator",
        )
    except ValueError as exc:
        return CommandResult(
            command="bootstrap-arbitration-dao",
            status=CommandStatus.FAILED,
            details={
                "error": str(exc),
                "si": ["SI-001", "SI-021"],
            },
        )

    panel = [seat.as_dict() for seat in fixed_panel_template(settings)]

    manifest = {
        "realm_name": realm_name,
        "creator": creator,
        "governance_address": _derive_deterministic_address(f"{creator}:{realm_name}:governance"),
        "resolver_candidate": _derive_deterministic_address(f"{creator}:{realm_name}:resolver"),
        "treasury_address": _derive_deterministic_address(f"{creator}:{realm_name}:treasury"),
        "panel": panel,
    }

    return CommandResult(
        command="bootstrap-arbitration-dao",
        status=CommandStatus.EXECUTED,
        details={
            "manifest": manifest,
            "si": ["SI-001", "SI-002", "SI-003", "SI-020", "SI-021"],
        },
    )
