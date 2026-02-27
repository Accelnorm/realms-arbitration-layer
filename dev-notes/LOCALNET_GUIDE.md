# Localnet Integration Guide

Complete walkthrough for running the safe-treasury + governance UI on Surfpool localnet.

---

## Prerequisites

| Tool | Version / Notes |
|------|----------------|
| [Surfpool](https://surfpool.run) | `curl -sL https://run.surfpool.run/ \| bash` |
| Solana CLI | 1.18.x — `solana --version` |
| `spl-token` CLI | ships with Solana CLI |
| Rust + `cargo` | 1.85+ with `sbf` target |
| Node.js | 18+ |
| `python3` | 3.9+ (stdlib only) |
| `curl` | for health-check |

One-time Solana keypair (skip if you already have `~/.config/solana/id.json`):

```bash
solana-keygen new --no-bip39-passphrase
```

---

## Directory Layout

```
realms-arbitration-layer/
├── arbitration-layer/          # Rust program + localnet scripts
│   ├── programs/safe-treasury/
│   ├── localnet/               # fixture JSON files + Surfpool.toml
│   └── scripts/localnet/       # all helper scripts
├── governance/                 # spl-governance Rust source
├── governance-ui/              # Next.js UI (Realms fork)
├── human-arbitration-dao/      # Human arbitration modules + Node.js deps
└── ai-arbitration-dao/         # AI arbitration CLI/runtime (Python)
```

---

## Phase 1 — Build Programs

> Run from `arbitration-layer/`

```bash
cd arbitration-layer
bash scripts/localnet/build-programs.sh
```

This builds:
- `programs/safe-treasury/target/deploy/safe_treasury.so`
- `../governance/program/target/deploy/spl_governance.so`

Verify both `.so` files exist before starting Surfpool.

---

## Phase 2 — Install Node.js Dependencies

The localnet scripts embed Node.js inline and resolve modules from
`human-arbitration-dao/node_modules`. Install once:

```bash
cd human-arbitration-dao
npm install
cd ..
```

Required packages: `@solana/web3.js`, `@solana/spl-governance`, `bn.js`.

For AI DAO CLI demos, also ensure Python dependencies are available:

```bash
uv sync --project ai-arbitration-dao --extra dev
```

If you do not use `uv`, install from `ai-arbitration-dao/pyproject.toml` in your preferred Python environment.

---

## Phase 3 — Start Surfpool

> Open a dedicated terminal. Run from `arbitration-layer/`

```bash
bash scripts/localnet/start-surfpool.sh
```

Surfpool auto-deploys both programs from `localnet/Surfpool.toml`.
Default RPC: `http://127.0.0.1:8899`.

Verify it is running:

```bash
curl -s -X POST http://127.0.0.1:8899 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | python3 -m json.tool
# expect: {"result":"ok",...}
```

---

## DAO Ruling Enforcement Demos

### Human + AI minimal demo (recommended hackathon path)

```bash
bash scripts/localnet/run-human-ai-ruling-enforcement-demo.sh
```

This script demonstrates:
1. Human DAO single-arbitrator ruling compilation
2. AI DAO create/vote/execute proposal path
3. Safe Treasury enforcement via challenge + `record_ruling`

Output report: `localnet/human-ai-ruling-demo-report.json`

### Multi-party scaffold demo (hardcoded vote sets)

```bash
bash scripts/localnet/run-multi-party-ruling-demo.sh
```

Output report: `localnet/multi-party-ruling-demo-report.json`

**Keep this terminal running** for all subsequent steps.

---

## Phase 4 — Bootstrap DAO Realms

> New terminal, from `arbitration-layer/`

```bash
bash scripts/localnet/bootstrap-three-daos.sh
```

Creates three Realms DAO governance accounts:
- **TestDAO** — authority for safe-treasury testing; owns the SafePolicy
- **AIArbitrationDAO** — AI arbiter seat
- **HumanArbitrationDAO** — human arbiter seat

Writes addresses to `localnet/dao-state.json`.

---

## Phase 5 — Seed UI Fixtures

```bash
bash scripts/localnet/seed-ui-fixtures.sh
```

This script:
1. Creates a challenge-token mint (eligibility gating)
2. Derives and initialises the **SafePolicy** PDA for the authority wallet
3. Queues a first **Payout** account (index 0) with a test recipient and amount
4. Writes `localnet/safe-policy-state.json` and `localnet/payout-fixtures.json`

---

## Phase 6 — Bootstrap On-Chain Primitives

```bash
bash scripts/localnet/bootstrap-safe-treasury-primitives.sh
```

One-time calls needed before any payout flow:
- `init_challenge_bond_vault` — global PDA that escrows challenger bonds
- `init_native_vault` — per-safe SOL custody vault
- `fund_native_vault` — tops up the vault so release transactions succeed (default 0.02 SOL)

Idempotent: safe to re-run; skips already-initialised accounts.

---

## Phase 7 — Export UI Context

```bash
bash scripts/localnet/export-ui-agent-input.sh
```

Reads the three fixture files and writes `localnet/ui-agent-context.json`:

```json
{
  "network": { "rpcUrl": "http://127.0.0.1:8899" },
  "challengePayout": {
    "challengeTokenMint": "<mint>",
    "safePolicy":         "<safe_policy>",
    "queuedPayout":       "<payout>"
  }
}
```

---

## Phase 8 — Run the Governance UI

> New terminal, from `governance-ui/`

```bash
cp .env.sample .env.local   # first time only
npm install                  # first time only
npm run dev
```

### Connect wallet + select localnet

1. Open `http://localhost:3000`
2. Connect your Solana CLI wallet (Phantom → Settings → Developer Settings → Testnet Mode, or use the CLI key via a local wallet adapter)
3. In the UI's cluster selector, choose **localnet** (`http://127.0.0.1:8899`)
4. Navigate to the TestDAO realm pubkey from `localnet/dao-state.json → testDao.realm`

### What you can test

| UI path | What it exercises |
|---------|------------------|
| Treasury → Dispute Safe Custody | SafePolicy cards + payout queue table |
| Proposals → New → DisputeSafe QueuePayout | Build + submit queue_payout CPI |
| Proposals → New → DisputeSafe ChallengePayout | Challenge a queued payout directly |
| Proposals → New → DisputeSafe RecordRuling | Record resolver ruling |
| Proposals → New → DisputeSafe ReleasePayout | Release after dispute window |
| Proposals → \<any dispute proposal\> | Payout state badge below description |

---

## Optional: Standalone Challenge Flow (no governance)

Tests direct-wallet challenge + resolver ruling without going through Realms proposals:

```bash
bash scripts/localnet/run-standalone-challenge-flow.sh
```

Flow:
1. Calls `bootstrap-safe-treasury-primitives.sh`
2. Creates a challenger token account and mints eligibility tokens
3. Submits `challenge_payout` (direct wallet, `authorization_mode=0`)
4. Submits `record_ruling` (direct resolver, `is_final=true`, outcome from `RULING_OUTCOME`)
5. Prints payout, challenge, and bond-vault addresses

Environment overrides:

```bash
CHALLENGE_BOND_LAMPORTS=5000000 bash scripts/localnet/run-standalone-challenge-flow.sh

RULING_OUTCOME=Allow bash scripts/localnet/run-standalone-challenge-flow.sh
```

---

## Optional: Governance CPI Queue Proposal

Tests the full Realms proposal path for `queue_payout`:

```bash
# Requires safe_policy.authority == TestDAO governance PDA (set by seed-ui-fixtures.sh)
GOVERNANCE_VOTE_WAIT_SECONDS=3700 bash scripts/localnet/governance-queue-payout-proposal.sh
```

Flow:
1. Deposits governing tokens into TestDAO
2. Creates a Realms proposal with an embedded `queue_payout` instruction
3. Casts a Yes vote
4. Waits for the governance vote window to pass (`GOVERNANCE_VOTE_WAIT_SECONDS`, default 3700 s)
5. Finalises the vote and executes the proposal
6. Prints `{ proposal, proposalTransaction, queuedPayout }`

> `authorization_mode=0` is used — the governance PDA is marked `isSigner:true` in the
> proposal instruction data, and Realms CPI signs for it on execution.
> `authorization_mode=1` (proposal-proof) requires the governance program to be on a
> whitelist in `utils.rs` and is **not** supported with the localnet deploy.

---

## Full E2E Validation (single command)

Runs deployment prep + governance queue + standalone challenge in sequence and
asserts all accounts exist:

```bash
bash scripts/localnet/run-e2e-governance-dispute.sh
```

On success, writes `localnet/e2e-governance-dispute-report.json`:

```json
{
  "status": "ok",
  "flow": {
    "governanceProposal": "...",
    "queuedPayout": "...",
    "challenge": "...",
    "bondVault": "..."
  }
}
```

---

## Environment Variables

All scripts read these; set them in your shell or a `.env` file:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SURFPOOL_RPC_URL` | `http://127.0.0.1:8899` | Surfpool RPC endpoint |
| `SAFE_TREASURY_PROGRAM_ID` | `9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD` | Deployed program ID |
| `GOVERNANCE_PROGRAM_ID` | read from `dao-state.json` | Deployed governance program ID |
| `LOCAL_AUTHORITY_KEYPAIR` | `~/.config/solana/id.json` | Payer + authority keypair |
| `NATIVE_VAULT_FUND_LAMPORTS` | `20000000` (0.02 SOL) | Initial native vault balance |
| `CHALLENGE_BOND_LAMPORTS` | `10000000` (0.01 SOL) | Bond amount for challenge flow |
| `QUEUE_AMOUNT_LAMPORTS` | `1000000` (0.001 SOL) | Amount for governance queue test |
| `GOVERNANCE_VOTE_WAIT_SECONDS` | `3700` | Vote window wait (governance proposal) |
| `GOVERNANCE_NODE_MODULES_DIR` | `../human-arbitration-dao/node_modules` | Node deps for governance script |
| `SAFE_TREASURY_NODE_MODULES_DIR` | `../human-arbitration-dao/node_modules` | Node deps for treasury scripts |
| `BASE_PAYOUT_INDEX` | `41` | Base payout index used by human+AI demo |
| `HUMAN_SAFE_TREASURY_OUTCOME` | `Deny` | Final ruling outcome used in human demo case |
| `AI_SAFE_TREASURY_OUTCOME` | `Allow` | Final ruling outcome used in AI demo case |
| `DEMO_REPORT_PATH` | `localnet/human-ai-ruling-demo-report.json` | Override report path for human+AI demo |
| `MULTI_PARTY_DEMO_REPORT_PATH` | `localnet/multi-party-ruling-demo-report.json` | Override report path for multi-party demo |

---

## Troubleshooting

**`Error: @solana/spl-governance not found`**
→ Run `npm install` in `human-arbitration-dao/`.

**`Error: safe-policy-state missing safe/safePolicy fields`**
→ Re-run `seed-ui-fixtures.sh`.

**`Error: SafePolicy account missing`** (bootstrap-primitives)
→ Surfpool may have reset. Re-run the full sequence from Phase 4.

**`proposal not executable: state=<N>`** (governance script)
→ The vote window has not elapsed. Increase `GOVERNANCE_VOTE_WAIT_SECONDS` or
  lower the governance's `maxVotingTime` by re-bootstrapping the DAO.

**`InvalidProposalProof`** (from the program)
→ Do not use `authorization_mode=1` on localnet. The governance script uses
  `authorization_mode=0` by default; ensure you have not overridden this.

**Treasury page shows no Dispute Safe accounts**
→ The governance assets store discovers SafePolicy accounts via `getProgramAccounts`
  with a discriminator filter. Ensure `seed-ui-fixtures.sh` completed and the
  SafePolicy account is on-chain at the expected PDA.
  PDA derivation: `findProgramAddress(["safe_policy", authority], SAFE_TREASURY_PROGRAM_ID)`.

**Challenge action fails with eligibility error**
→ The wallet must hold at least `minTokenBalance` of `eligibilityMint`.
  `seed-ui-fixtures.sh` mints 10 tokens to the authority wallet's token account.
  If you are using a different wallet, mint tokens manually:
  ```bash
  spl-token --url http://127.0.0.1:8899 create-account <eligibilityMint>
  spl-token --url http://127.0.0.1:8899 mint <eligibilityMint> 5 <tokenAccount>
  ```
