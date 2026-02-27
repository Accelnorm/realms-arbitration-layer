from __future__ import annotations

import json
from argparse import ArgumentParser, BooleanOptionalAction, Namespace
from collections.abc import Callable, Sequence

from ai_arbitration_dao.commands import (
    run_agent_health_check,
    run_bind_resolver,
    run_bootstrap_arbitration_dao,
    run_create_ruling_proposal,
    run_execute_ruling_proposal,
    run_reconcile_agent_runtime,
    run_submit_vote,
    run_verify_ruling_status,
)
from ai_arbitration_dao.config import AppSettings, get_settings
from ai_arbitration_dao.types import CommandResult, CommandStatus, SeatProvider

CommandHandler = Callable[[Namespace, AppSettings], CommandResult]

COMMAND_HANDLERS: dict[str, CommandHandler] = {
    "bootstrap-arbitration-dao": run_bootstrap_arbitration_dao,
    "bind-resolver": run_bind_resolver,
    "create-ruling-proposal": run_create_ruling_proposal,
    "submit-vote": run_submit_vote,
    "execute-ruling-proposal": run_execute_ruling_proposal,
    "verify-ruling-status": run_verify_ruling_status,
    "agent-health-check": run_agent_health_check,
    "reconcile-agent-runtime": run_reconcile_agent_runtime,
}


def build_parser() -> ArgumentParser:
    parser = ArgumentParser(prog="ai-arbitration-dao", description="AI Arbitration DAO CLI")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON output")

    subparsers = parser.add_subparsers(dest="command", required=True)

    bootstrap = subparsers.add_parser("bootstrap-arbitration-dao")
    bootstrap.add_argument("--creator", required=True)
    bootstrap.add_argument("--realm-name", default="ai-arbitration-realm")
    bootstrap.add_argument("--custom-panel", default="")

    bind = subparsers.add_parser("bind-resolver")
    bind.add_argument("--governance-address", required=True)
    bind.add_argument("--resolver-address", required=True)

    create = subparsers.add_parser("create-ruling-proposal")
    create.add_argument("--safe", required=True)
    create.add_argument("--payout-id", required=True, type=int)
    create.add_argument("--dispute-id", required=True)
    create.add_argument("--round", required=True, type=int)
    create.add_argument("--outcome", required=True, choices=["Allow", "Deny"])
    create.add_argument("--is-final", action="store_true")

    vote = subparsers.add_parser("submit-vote")
    vote.add_argument("--proposal-id", required=True)
    vote.add_argument("--voter", required=True)
    vote_group = vote.add_mutually_exclusive_group(required=False)
    vote_group.add_argument("--approve", dest="approve", action="store_true", default=True)
    vote_group.add_argument("--deny", dest="approve", action="store_false")

    execute = subparsers.add_parser("execute-ruling-proposal")
    execute.add_argument("--proposal-id", required=True)
    execute.add_argument("--already-ruled", action="store_true")
    execute.add_argument("--dispute-id", required=False, default="")
    execute.add_argument("--round", type=int, required=False, default=0)
    execute.add_argument("--proposal-proof", type=json.loads, required=False, default=None)

    verify = subparsers.add_parser("verify-ruling-status")
    verify.add_argument("--dispute-id", required=True)
    verify.add_argument("--round", required=True, type=int)
    verify.add_argument(
        "--expected-status",
        required=True,
        choices=[status.value for status in CommandStatus],
    )

    health = subparsers.add_parser("agent-health-check")
    health.add_argument("--seat-id", required=True)
    health.add_argument(
        "--model-provider",
        required=True,
        choices=[provider.value for provider in SeatProvider],
    )
    health.add_argument("--rpc-ok", action=BooleanOptionalAction, default=True)
    health.add_argument("--governance-ok", action=BooleanOptionalAction, default=True)
    health.add_argument("--model-ok", action=BooleanOptionalAction, default=True)

    reconcile = subparsers.add_parser("reconcile-agent-runtime")
    reconcile.add_argument("--dispute-id", required=True)
    reconcile.add_argument("--round", required=True, type=int)
    reconcile.add_argument(
        "--target-status",
        required=True,
        choices=[status.value for status in CommandStatus],
    )

    return parser


def _emit_result(result: CommandResult, *, as_json: bool) -> None:
    if as_json:
        print(result.to_json())
        return

    print(f"{result.command}: {result.status.value}")
    if result.details:
        print(json.dumps(result.details, indent=2, sort_keys=True))


def entrypoint(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    settings = get_settings()

    handler = COMMAND_HANDLERS[str(args.command)]
    result = handler(args, settings)
    _emit_result(result, as_json=bool(args.json))
    return 1 if result.status == CommandStatus.FAILED else 0


if __name__ == "__main__":
    raise SystemExit(entrypoint())
