# Test Prompt Guidance — Three-Component Validation

Prompt guidance for an LLM agent (Playwright + Bash) to systematically test
`governance-ui`, `ai-arbitration-dao`, and `human-arbitration-dao`.

---

## Prerequisites — Run First

Everything depends on these being healthy before any component testing begins.

```bash
# Terminal 1 — leave running for entire session
bash arbitration-layer/scripts/localnet/start-local-validator.sh

# Terminal 2 — bootstrap + seed (run once; safe to re-run)
bash arbitration-layer/scripts/localnet/bootstrap-three-daos.sh
bash arbitration-layer/scripts/localnet/seed-ui-fixtures.sh
bash arbitration-layer/scripts/localnet/bootstrap-safe-treasury-primitives.sh
```

Verify health before any UI step:
```bash
curl -s -X POST http://127.0.0.1:8899 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep '"ok"'
```

Key runtime values (refresh from files if validator was restarted):
```bash
cat arbitration-layer/localnet/dao-state.json
cat arbitration-layer/localnet/ui-agent-context.json
```

| Value | Where |
|---|---|
| TestDAO realm | `dao-state.json → testDao.realm` |
| Governance program | `GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw` |
| Safe-treasury program | `9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD` |
| SafePolicy address | `ui-agent-context.json → challengePayout.safePolicy` |
| Queued payout | `ui-agent-context.json → challengePayout.queuedPayout.payout` |

---

## 1 — governance-ui

### Start the UI

```bash
# Start governance-ui (default port 3000; use PORT=3002 if occupied)
npm --prefix governance-ui run dev
```

Check which port it actually bound to:
```bash
curl -sI http://localhost:3000 | head -1
curl -sI http://localhost:3002 | head -1
```

Use whatever port returns `HTTP/1.1 200`. All subsequent URLs use `$UI_PORT`.

### Known quirks

- On first visit a **"Realms v2 is here"** terms dialog blocks the page.
  Dismiss it with JS before interacting:
  ```js
  document.querySelectorAll('button').find(b => b.textContent.includes('Stay on v1'))?.click()
  ```
- Always append `?cluster=localnet` to DAO URLs. Without it the UI hits mainnet
  and returns `Realm not found`.
- Some console 403 errors from `rpcpool.com` are cosmetic — they are mainnet
  calls for token lists that do not affect localnet flows.
- The Next.js dev error overlay may appear for those 403s. Close it with the ✕
  button before taking screenshots.

### Test sequence

Work through each item in order. For each item:
1. Navigate / interact as described.
2. Take a screenshot.
3. Verify pass criteria.
4. If passed, set `validated: true` in `governance-ui/specs/ui-testing.json`.

#### Infrastructure (UT-001 – UT-003) — already validated
These are confirmed passing. Skip unless validator was restarted.

#### Navigation (UT-004 – UT-006)

**UT-004** — Homepage terms dialog  
Navigate to `http://localhost:$UI_PORT`.  
Pass: `"Realms v2 is here"` heading visible + both accept buttons present.

**UT-005** — Dismiss terms to v1  
Click `"Accept & Stay on v1"`. Wait 2 s.  
Pass: dialog gone, URL still at `localhost:$UI_PORT/realms`, no redirect to external v2 site.

**UT-006** — `?cluster=localnet` routes to local RPC  
Navigate to `http://localhost:$UI_PORT/dao/<REALM>?cluster=localnet`.  
Open DevTools Network tab or check console for requests to `127.0.0.1:8899`.  
Pass: no 403 from mainnet RPC for governance account fetches.

#### DAO page (UT-007 – UT-009)

Use URL: `http://localhost:$UI_PORT/dao/<REALM>?cluster=localnet`  
where `<REALM>` = `testDao.realm` from `dao-state.json`.

**UT-007** — DAO loads without "Realm not found"  
Wait 5 s after navigation. Take screenshot.  
Pass: text `"Realm not found"` absent; DAO content area rendered.

**UT-008** — Header shows "TestDAO"  
Pass: `"TestDAO"` visible in header or sidebar.

**UT-009** — Sidebar has Proposals + Treasury links  
Pass: at minimum `"Proposals"` and `"Treasury"` nav items visible.

#### Proposal creation (UT-010 – UT-012)

Navigate to `http://localhost:$UI_PORT/dao/<REALM>/proposal/new?cluster=localnet`.

**UT-010** — New proposal page loads  
Wait 3 s. Pass: proposal form renders; title input or `"Add instruction"` visible.

**UT-011** — DisputeSafe package in instruction selector  
Click instruction type selector / `"Add instruction"`. Scroll or search.  
Pass: `"DisputeSafe"` or `"Dispute Safe"` option listed. *(Already validated via code inspection.)*

**UT-012** — All 6 DisputeSafe instructions listed  
After selecting DisputeSafe, check sub-list.  
Pass: all 6 present — `MigrateToSafe`, `QueuePayout`, `ChallengePayout`,
`RecordRuling`, `ReleasePayout`, `ExitFromCustody`. *(Already validated.)*

#### Instruction forms (UT-013 – UT-018)

For each, select the instruction type on the new proposal page and screenshot the form.
UT-013 through UT-018 are **already validated via code inspection** but can be
re-verified visually by checking field labels match:

| ID | Instruction | Key fields to confirm visible |
|---|---|---|
| UT-013 | MigrateToSafe | resolver pubkey, dispute window, challenge bond, eligibility mint, treasury mode toggle |
| UT-014 | QueuePayout | Asset Type dropdown (Native/SPL Token), recipient, amount |
| UT-015 | ChallengePayout | Payout Index, bond amount |
| UT-016 | RecordRuling | Outcome dropdown with Allow/Deny |
| UT-017 | ReleasePayout | Asset Type, recipient; SPL fields appear on switch |
| UT-018 | ExitFromCustody | Vault, recipient, Asset Type (Native/SPL/SPL-2022) |

#### Treasury page (UT-019 – UT-021)

Navigate to `http://localhost:$UI_PORT/dao/<REALM>/treasury/v2?cluster=localnet`.

**UT-019** — Treasury page loads  
Wait 5 s. Pass: no white-screen crash or `"Realm not found"`.

**UT-020** — Safe custody section visible  
Pass: section labeled `"Safe Custody"`, `"Dispute Safe"`, or similar present;
`"Queue Payout"` action accessible.

**UT-021** — Payout queue table columns  
Pass: at least 4 of: payout index, recipient, amount, asset, state badge, countdown.  
(Queued payout from `ui-agent-context.json → queuedPayout` should appear.)

#### Proposal detail (UT-022 – UT-023)

If no proposal exists, create one first:
```bash
bash arbitration-layer/scripts/localnet/governance-queue-payout-proposal.sh
```

**UT-022** — Proposal detail page loads  
Navigate to a proposal from the proposals list, or directly to
`/dao/<REALM>/proposal/<PK>?cluster=localnet`.  
Pass: title and voting/execution section visible.

**UT-023** — Payout state badge in QueuePayout proposal  
On a proposal containing DisputeSafeQueuePayout, check for a colored badge:
`Queued | Challenged | ReleaseReady | Released | Denied`.

#### Standalone actions (UT-024 – UT-025)

**UT-024** — Challenge button in payout queue  
Navigate to treasury or proposal with queued payout at index 0.  
Pass: `"Challenge"` or `"Challenge Payout"` button visible; clicking opens
confirmation/amount modal (not full proposal form).

**UT-025** — Release button for release-ready payout  
Requires advancing payout to `ReleaseReady` (run standalone challenge + ruling script).
Pass: `"Release"` or `"Release Payout"` button visible and enabled.

### Marking results

For each passed test, set `"validated": true` in `governance-ui/specs/ui-testing.json`
and add a brief note. Do not mark as validated without actually verifying.

---

## 2 — ai-arbitration-dao

### Setup

```bash
cd ai-arbitration-dao
uv sync --extra dev
```

If `uv` is unavailable: `pip install -e ".[dev]"` inside a virtualenv.

### Test sequence

All tests run via `uv run` (or `python -m ai_arbitration_dao`) with top-level `--json` flag.
Every command must return valid JSON with no Python traceback.

#### CLI smoke tests

```bash
# 1. Health check — must return JSON with status field
uv run ai-arbitration-dao --json agent-health-check \
  --seat-id seat-001 \
  --model-provider claude \
  --rpc-ok --governance-ok --model-ok

# 2. Bootstrap — dry-run DAO setup (no real keypair needed for JSON output)
uv run ai-arbitration-dao --json bootstrap-arbitration-dao \
  --creator GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw \
  | tee /tmp/ai-bootstrap.json

# Optional: extract governance/resolver addresses from bootstrap output for bind-resolver
GOV=$(cat /tmp/ai-bootstrap.json | python3 -c "import json,sys; print(json.load(sys.stdin)['details']['manifest']['governance_address'])")
RES=$(cat /tmp/ai-bootstrap.json | python3 -c "import json,sys; print(json.load(sys.stdin)['details']['manifest']['resolver_candidate'])")

# 3. Bind resolver
uv run ai-arbitration-dao --json bind-resolver \
  --governance-address "${GOV:-GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw}" \
  --resolver-address "${RES:-GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw}"

# 4. Create ruling proposal
uv run ai-arbitration-dao --json create-ruling-proposal \
  --safe GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw \
  --payout-id 1 \
  --dispute-id test-dispute-001 \
  --round 0 \
  --outcome Allow

# 5. Submit vote (Allow outcome)
uv run ai-arbitration-dao --json submit-vote \
  --proposal-id proposal_test_001 \
  --voter GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw \
  --approve

# 6. Execute ruling proposal
uv run ai-arbitration-dao --json execute-ruling-proposal \
  --proposal-id proposal_test_001 \
  --dispute-id test-dispute-001 \
  --round 0

# 7. Verify ruling status
uv run ai-arbitration-dao --json verify-ruling-status \
  --dispute-id test-dispute-001 \
  --round 0 \
  --expected-status executed

# 8. Reconcile agent runtime
uv run ai-arbitration-dao --json reconcile-agent-runtime \
  --dispute-id test-dispute-001 \
  --round 0 \
  --target-status executed
```

#### Unit tests

```bash
uv run pytest -q
```

Pass: all tests pass or only `xfail` (ignored red-phase) tests fail.
No `ERROR` or unexpected `FAILED` results.

#### Key behaviors to verify

- Every command with `--json` outputs well-formed JSON (verify with `| python3 -m json.tool`).
- `agent-health-check` returns a `status` field.
- `submit-vote` requires `proposal_id`, `voter`, and one of `--approve`/`--deny`.
- `create-ruling-proposal` requires `safe`, `payout_id` (int), `dispute_id`, `round`, and `outcome`.
- `execute-ruling-proposal` requires `proposal_id` (optionally `dispute_id` + `round`).
- `verify-ruling-status` requires `dispute_id`, `round`, and `expected_status`.
- No command should write to chain on a dry run without explicit RPC configuration.

---

## 3 — human-arbitration-dao

This component has two surfaces: a **TypeScript CLI** and a **Next.js web UI**.

### 3a — TypeScript CLI

```bash
cd human-arbitration-dao
npm install   # if node_modules missing
npm run build
```

#### CLI smoke tests

```bash
# Help / usage
node dist/cli.js

# Bootstrap command (dry run — no real RPC needed for argument parsing)
node dist/cli.js bootstrap --rpc http://127.0.0.1:8899 \
  --realm HumanArbitrationDAO \
  --admin FdrDZPcYEjdB3nQGUgL7muXj4SBTzbAMMvMosufdtun1

# Roles command
node dist/cli.js roles \
  --admin FdrDZPcYEjdB3nQGUgL7muXj4SBTzbAMMvMosufdtun1
```

#### Unit tests

```bash
npm test
```

Pass: all tests pass; no unexpected failures.

### 3b — Web UI

```bash
cd human-arbitration-dao/web
npm install   # if node_modules missing
npm run dev
# Default port: 3000. Use next available if occupied (3001, 3002...)
```

Check port: `curl -sI http://localhost:3000 | head -1`

#### Test sequence (Playwright / browser)

**HAD-001 — Page loads**  
Navigate to `http://localhost:<PORT>`.  
Pass: page title or `<h1>` contains `"Human Arbitration DAO"`.  
Pass: wallet connect section visible with connector buttons.

**HAD-002 — Wallet connect UI**  
Pass: at least one wallet connector button visible.  
Pass: `"No wallet connected"` shown in address display before connection.

**HAD-003 — Unauthorized wallet warning**  
If a wallet is connected but its address ≠ `FdrDZPcYEjdB3nQGUgL7muXj4SBTzbAMMvMosufdtun1`:  
Pass: amber warning message rendered: `"Unauthorized wallet … Expected arbitrator address FdrDZ…"`.

**HAD-004 — Authorized wallet shows workspace**  
Connect with wallet `FdrDZPcYEjdB3nQGUgL7muXj4SBTzbAMMvMosufdtun1`
(requires that wallet in browser; if unavailable, verify code path via code inspection).  
Pass: `ArbitratorWorkspace` component rendered; case inbox visible.

**HAD-005 — Case inbox renders sample cases**  
Pass: at least two case cards visible; status badges present (`DOCKETED`, `IN_PROGRESS`, `CONCLUDED`).

**HAD-006 — Case detail opens**  
Click a case card in the inbox.  
Pass: `CaseDetail` panel slides in or renders; case ID and status visible.

**HAD-007 — Decision composer is accessible**  
From a case in `IN_PROGRESS` status, navigate to or click the decision section.  
Pass: `DecisionComposer` component renders with outcome selection (Allow/Deny or equivalent).

**HAD-008 — Proposal audit panel**  
Pass: `ProposalAudit` section renders in the workspace (may require a case to be selected).

**HAD-009 — Disconnect wallet**  
Click the `"Disconnect"` button.  
Pass: wallet address resets to `"No wallet connected"`. Workspace hides.

#### Notes

- The web UI uses `@solana/react-hooks` with Solflare-first wallet flow.
  No Brave wallet forced connection.
- Authorized arbitrator is hardcoded to `FdrDZPcYEjdB3nQGUgL7muXj4SBTzbAMMvMosufdtun1`.
  Any other connected wallet shows the unauthorized warning.
- Case data is currently sample/mock data (not live chain reads). Tests validate UI
  rendering, not on-chain state.

---

## General Agent Instructions

1. **Always read `dao-state.json` and `ui-agent-context.json` at session start**
   to get current addresses — they change on each bootstrap run.

2. **Screenshot discipline**: take a screenshot before and after each interaction,
   name files `<UT-ID>-before.png` / `<UT-ID>-after.png`, save to a run-specific
   directory such as `governance-ui/scripts/ralph/logs/<RUN_ID>/`.

3. **Marking validated**: only set `"validated": true` after the pass criteria
   are visually or programmatically confirmed. Add a one-line note with what
   was observed.

4. **Don't skip failures**: if a test fails, record the failure in the `notes`
   field and continue to the next test. Do not retry more than 3 times for the
   same item.

5. **Port auto-detection**: check actual bound ports with `curl -sI` before
   hardcoding any URL. governance-ui may be on 3000, 3001, or 3002 depending
   on what else is running.

6. **Cluster param is mandatory**: every governance-ui DAO URL must include
   `?cluster=localnet`. Missing it causes `"Realm not found"` — this is not a bug.

7. **Test file to update**: `governance-ui/specs/ui-testing.json` for governance-ui items.
   For ai-arbitration-dao and human-arbitration-dao, report results inline in
   your output (no dedicated JSON spec file exists for those yet).
