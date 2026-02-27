# Localnet Scripts (Direct Flow)

This directory contains deterministic helpers for safe-treasury localnet setup and testing.

## Prerequisites

- `solana-test-validator` running at `http://127.0.0.1:8899` (start with `bash scripts/localnet/start-local-validator.sh`)
- `solana`, `spl-token`, `node`, `python3` in PATH
- Governance/SPL dependencies installed in `../human-arbitration-dao/node_modules`
- `safe-treasury` SBF artifact built (`bash scripts/localnet/build-programs.sh`)
- Mainnet governance binary present at `localnet/spl_governance_mainnet.so`
  - If missing: `solana program dump --url mainnet-beta GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw localnet/spl_governance_mainnet.so`

> **IMPORTANT:** Do **not** use the locally-built `spl-governance` binary. It is ABI-incompatible with
> Agave 2.2.12 and crashes with `Access violation` on `CreateRealm`. See
> `IMPORTANT-governance-abi-fix.md` in the repo root.

## Core Scripts

### `bootstrap-three-daos.sh`
Writes deterministic DAO addresses and challenge token mint into `localnet/dao-state.json`.  
Creates Test/AI/Human DAO realms and governance accounts via web3 transactions.

### `seed-ui-fixtures.sh`
Creates a challenge-token mint and seeds SafePolicy + Queued Payout fixture accounts.  
Writes `localnet/safe-policy-state.json` and `localnet/payout-fixtures.json`.

### `bootstrap-safe-treasury-primitives.sh`
Runs one-time on-chain setup calls for safe-treasury:
- `init_challenge_bond_vault` (global PDA, no args)
- `init_native_vault` (seeded by safe account)
- `fund_native_vault` (tops up native vault with test SOL)

### `export-ui-agent-input.sh`
Reads fixture JSON files and emits `localnet/ui-agent-context.json` for UI consumption.

## Test Flow Scripts

### `run-standalone-challenge-flow.sh`
Exercises the direct-wallet challenge path (no governance):
1. Ensures primitives are set up
2. Creates challenger token account + mints eligibility tokens
3. Calls `challenge_payout` with bond
4. Calls `record_ruling` (direct resolver mode, authorization_mode=0)
5. Outputs challenge/payout addresses

### `governance-queue-payout-proposal.sh`
Exercises the governance CPI queue path:
1. Creates/votes/executes a Realms proposal containing `queue_payout` instruction
2. Uses `authorization_mode=0` (governance PDA signer via Realms CPI execution)
3. Requires safe policy authority to equal TestDAO governance PDA
4. Handles token owner record creation, deposit, sign-off, vote, finalize, execute

### `run-e2e-governance-dispute.sh`
Runs a full localnet integration path with strict checks:
1. Prepares deployment + fixtures via `scripts/ralph/ralph-localnet-integration.sh`
2. Executes Realms governance proposal flow to queue payout
3. Challenges the same queued payout and records ruling (`record_ruling`, direct resolver)
4. Asserts key accounts exist and emits `localnet/e2e-governance-dispute-report.json`

### `run-human-ai-ruling-enforcement-demo.sh`
Runs two minimal ruling demos and proves Safe Treasury enforcement for both DAO folders:
1. Human DAO single-arbitrator vote compilation (CLI-driven demo path)
2. AI DAO proposal create/vote/execute flow via `ai-arbitration-dao` CLI
3. Queues dedicated payouts and enforces outcomes via challenge + `record_ruling`
4. Writes `localnet/human-ai-ruling-demo-report.json`

### `run-multi-party-ruling-demo.sh`
Initial multi-party demo scaffold:
1. Queues payout via governance
2. Uses hardcoded multi-human and multi-AI vote sets
3. Applies final aggregated outcome to Safe Treasury challenge/ruling flow
4. Writes `localnet/multi-party-ruling-demo-report.json`

## Direct Flow

Run these commands in order from `arbitration-layer/`:

```bash
# 0. Build safe-treasury (one time, or after code changes)
bash scripts/localnet/build-programs.sh

# 1. Start local validator (in a separate terminal — leave running)
bash scripts/localnet/start-local-validator.sh

# 2. Create DAO realms on-chain → writes localnet/dao-state.json
bash scripts/localnet/bootstrap-three-daos.sh

# 3. Seed UI fixtures (SafePolicy + Queued payout)
#    → writes localnet/safe-policy-state.json, payout-fixtures.json, ui-agent-context.json
bash scripts/localnet/seed-ui-fixtures.sh

# 4. Run one-time primitive setup (challenge bond + native vault)
bash scripts/localnet/bootstrap-safe-treasury-primitives.sh
```

After step 4, the UI agent can read `localnet/ui-agent-context.json` which contains:
- `network.rpcUrl`
- `challengePayout.challengeTokenMint`
- `challengePayout.safePolicy`
- `challengePayout.queuedPayout` (if present)

## Optional Test Scripts

```bash
# Test standalone challenge flow (direct resolver)
bash scripts/localnet/run-standalone-challenge-flow.sh

# Test governance CPI queue proposal path
bash scripts/localnet/governance-queue-payout-proposal.sh

# Test complete deployment + DAO/proposal/challenge/resolution path
bash scripts/localnet/run-e2e-governance-dispute.sh

# Test both human-arbitration-dao and ai-arbitration-dao ruling flows
bash scripts/localnet/run-human-ai-ruling-enforcement-demo.sh

# Start multi-human / multi-AI resolution demo scaffold
bash scripts/localnet/run-multi-party-ruling-demo.sh
```

## Complete Deployment + Integration Validation

Use this when you want one command that validates deployment readiness and full integration flow:

```bash
bash scripts/localnet/run-e2e-governance-dispute.sh
```

Outputs:
- On success, writes `localnet/e2e-governance-dispute-report.json`
- Includes proposal, proposal-transaction, queued payout, challenge, and bond-vault addresses

## DAO ruling demo variables

- `BASE_PAYOUT_INDEX` (default `41`): base payout index used by `run-human-ai-ruling-enforcement-demo.sh`
- `HUMAN_SAFE_TREASURY_OUTCOME` (`Allow|Deny`, default `Deny`)
- `AI_SAFE_TREASURY_OUTCOME` (`Allow|Deny`, default `Allow`)
- `DEMO_REPORT_PATH`: override `localnet/human-ai-ruling-demo-report.json`
- `MULTI_PARTY_DEMO_REPORT_PATH`: override `localnet/multi-party-ruling-demo-report.json`

## Environment Variables

- `SURFPOOL_RPC_URL`: RPC endpoint (default `http://127.0.0.1:8899`)
- `SAFE_TREASURY_PROGRAM_ID`: Deployed safe-treasury program ID
- `GOVERNANCE_PROGRAM_ID`: Deployed governance program ID
- `LOCAL_AUTHORITY_KEYPAIR`: Authority keypair path (default `~/.config/solana/id.json`)
- `NATIVE_VAULT_FUND_LAMPORTS`: SOL to fund native vault (default `20000000`)
- `CHALLENGE_BOND_LAMPORTS`: Bond amount for challenge flow (default `10000000`)
- `QUEUE_AMOUNT_LAMPORTS`: Amount for governance queue test (default `1000000`)

## Notes

- Scripts use `set -euo pipefail` for safety
- All scripts are executable and include basic dependency checks
- Governance script requires `@solana/spl-governance` in `../human-arbitration-dao/node_modules`
- Scripts are deterministic and can be re-run safely (they check for existing accounts)