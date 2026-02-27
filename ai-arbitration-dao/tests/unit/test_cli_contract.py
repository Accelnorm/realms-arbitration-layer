from ai_arbitration_dao.cli import COMMAND_HANDLERS


def test_required_command_surface_is_present() -> None:
    required = {
        "bootstrap-arbitration-dao",
        "bind-resolver",
        "create-ruling-proposal",
        "submit-vote",
        "execute-ruling-proposal",
        "verify-ruling-status",
        "agent-health-check",
        "reconcile-agent-runtime",
    }

    assert required.issubset(COMMAND_HANDLERS.keys())
