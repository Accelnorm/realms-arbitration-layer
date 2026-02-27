# ADR-0001: Initial Runtime and Tooling Choices

## Status
Accepted

## Context
The AI Arbitration DAO MVP requires:

- Python runtime for all panel seats
- deterministic automation commands with machine-readable output
- fast setup for iterative development by delegated contributors

## Decision
We standardize on:

- Python 3.12
- `uv` for environment and lock management
- `ruff` for lint/format
- `mypy` strict typing in core modules
- `pytest` + `pytest-asyncio` + `pytest-cov`
- `solana-py` + `solders` for Solana transactions and RPC integration
- `structlog` JSON logging with redaction processor

## Consequences
- Faster onboarding and consistent local/CI behavior.
- Strong baseline for deterministic command behavior and typed interfaces.
- Additional work is required to harden adapter implementations for production networks.
