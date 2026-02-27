# Localnet Environment

This directory contains runtime state and configuration for the safe-treasury + governance localnet integration.

## Program IDs

| Program | ID |
|---|---|
| `safe-treasury` | `9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD` |
| `spl-governance` (mainnet binary) | `GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw` |

> **IMPORTANT — governance binary:** The local source build of `spl-governance` (solana-program 1.14.6)
> is **incompatible** with modern `cargo build-sbf` (Agave 2.2.12 platform-tools). It crashes with
> `Access violation in unknown section at address 0x2` during `CreateRealm`. Always use the
> pre-dumped mainnet binary at `localnet/spl_governance_mainnet.so`. See
> `IMPORTANT-governance-abi-fix.md` in the repo root for full details.

## Files

- `spl_governance_mainnet.so`: Mainnet-dumped governance binary (required for localnet).
- `.env.localnet.example`: Canonical localnet environment variables.
- `dao-state.json`: Written by `bootstrap-three-daos.sh` — DAO realm/governance addresses + challenge token mint.
- `dao-state.example.json`: Template for the above.
- `safe-policy-state.json`: Written by `seed-ui-fixtures.sh` — Safe + SafePolicy addresses.
- `safe-policy-state.example.json`: Template for the above.
- `payout-fixtures.json`: Written by `seed-ui-fixtures.sh` — queued payout fixture for UI tests.
- `payout-fixtures.example.json`: Template for the above.
- `ui-agent-context.json`: Written by `seed-ui-fixtures.sh` — combined context for UI/agent handoff.

## Local scripts

- `scripts/localnet/build-programs.sh`
  - Builds the `safe-treasury` SBF artifact (`safe_treasury.so`).
- `scripts/localnet/refresh-safe-treasury-idl.sh`
  - Regenerates `target/idl/safe_treasury.json` from an ephemeral Anchor workspace.
- `scripts/localnet/start-local-validator.sh`
  - Starts `solana-test-validator` with safe-treasury + mainnet governance binaries.
- `scripts/localnet/bootstrap-three-daos.sh`
  - Creates Test/AI/Human DAO realms on-chain and writes `localnet/dao-state.json`.
- `scripts/localnet/seed-ui-fixtures.sh`
  - Creates challenge-token mint, seeds SafePolicy + Queued Payout accounts, writes all fixture JSONs.
- `scripts/localnet/bootstrap-safe-treasury-primitives.sh`
  - Runs one-time on-chain setup: `init_challenge_bond_vault`, `init_native_vault`, `fund_native_vault`.
- `scripts/localnet/export-ui-agent-input.sh`
  - Reads fixture JSON files and emits `localnet/ui-agent-context.json`.
- `scripts/localnet/run-standalone-challenge-flow.sh`
  - Exercises direct-wallet challenge path (`challenge_payout` + direct resolver `record_ruling`).
- `scripts/localnet/governance-queue-payout-proposal.sh`
  - Creates/votes/executes a Realms proposal containing `queue_payout` CPI instruction.

## Quick start

Run all commands from `arbitration-layer/`:

```bash
# 1. Build safe-treasury (governance uses pre-dumped mainnet binary)
bash scripts/localnet/build-programs.sh

# 2. Start validator (in a separate terminal — leave running)
bash scripts/localnet/start-local-validator.sh

# 3. Bootstrap 3-DAO realms on-chain → writes localnet/dao-state.json
bash scripts/localnet/bootstrap-three-daos.sh

# 4. Seed UI fixtures → writes localnet/safe-policy-state.json,
#    localnet/payout-fixtures.json, localnet/ui-agent-context.json
bash scripts/localnet/seed-ui-fixtures.sh

# 5. One-time safe-treasury vault setup
bash scripts/localnet/bootstrap-safe-treasury-primitives.sh
```

Optional flows:

```bash
# Standalone challenge + direct-resolver ruling
bash scripts/localnet/run-standalone-challenge-flow.sh

# Governance CPI queue proposal
bash scripts/localnet/governance-queue-payout-proposal.sh
```

### UI agent handoff (required fields in `ui-agent-context.json`)

- `network.rpcUrl`
- `challengePayout.challengeTokenMint`
- `challengePayout.safePolicy`
- `challengePayout.queuedPayout` *(strongly recommended for full ChallengePayout form testing)*

## Notes

- `solana-test-validator` is used instead of Surfpool for local development.
- The governance program **must** use the mainnet-dumped binary. Do not replace it with the local build.
- To refresh the governance binary: `solana program dump --url mainnet-beta GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw localnet/spl_governance_mainnet.so`
- All fixture JSON files in this directory are regenerated on each bootstrap run and are safe to delete and recreate.
