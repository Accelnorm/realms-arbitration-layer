# AI Arbitration DAO (MVP Scaffold)

Python-first tooling and runtime scaffold for the AI Arbitration DAO defined in `specs/`.

## Current scope

This initial scaffold delivers:

- CLI surface with required MVP commands
- JSON output mode for each command
- Typed domain models for deterministic ruling payloads
- Logging/redaction utilities for safe machine output
- Test scaffold (unit + integration + e2e placeholder)
- systemd deployment template for always-on seat workers

## Required commands

- `bootstrap-arbitration-dao`
- `bind-resolver`
- `create-ruling-proposal`
- `submit-vote`
- `execute-ruling-proposal`
- `verify-ruling-status`
- `agent-health-check`
- `reconcile-agent-runtime`

## Quick start

```bash
uv sync --extra dev
uv run ai-arbitration-dao bootstrap-arbitration-dao --creator <PUBKEY> --json
uv run pytest -q
```

## Make targets

```bash
make install
make lint
make typecheck
make test
```

## Notes

- MVP seat composition is fixed to Claude, OpenAI, and Minimax providers.
- Command behavior is deterministic and JSON-friendly for automation.
- Real chain writes are adapter-backed and can be incrementally replaced with production integrations.
