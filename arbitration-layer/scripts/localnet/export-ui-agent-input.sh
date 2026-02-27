#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DAO_STATE_PATH="${DAO_STATE_PATH:-$ARB_ROOT/localnet/dao-state.json}"
SAFE_POLICY_STATE_PATH="${SAFE_POLICY_STATE_PATH:-$ARB_ROOT/localnet/safe-policy-state.json}"
PAYOUT_FIXTURES_PATH="${PAYOUT_FIXTURES_PATH:-$ARB_ROOT/localnet/payout-fixtures.json}"
OUTPUT_PATH="${UI_AGENT_CONTEXT_PATH:-$ARB_ROOT/localnet/ui-agent-context.json}"

python3 - "$DAO_STATE_PATH" "$SAFE_POLICY_STATE_PATH" "$PAYOUT_FIXTURES_PATH" "$OUTPUT_PATH" <<'PY'
import json
import os
import sys
from pathlib import Path


def load_json(path: str):
    p = Path(path)
    if not p.exists():
        return None
    with p.open("r", encoding="utf-8") as fh:
        return json.load(fh)


dao_state = load_json(sys.argv[1])
safe_policy_state = load_json(sys.argv[2])
payout_fixtures = load_json(sys.argv[3])
out_path = Path(sys.argv[4])

missing_files = []
if dao_state is None:
    missing_files.append(sys.argv[1])
if safe_policy_state is None:
    missing_files.append(sys.argv[2])

if missing_files:
    print("Missing required fixture file(s):", file=sys.stderr)
    for f in missing_files:
        print(f"- {f}", file=sys.stderr)
    print("Hint: copy *.example.json under localnet/ and fill real addresses.", file=sys.stderr)
    sys.exit(1)

challenge_token_mint = (
    dao_state.get("testDao", {}).get("challengeTokenMint")
    if isinstance(dao_state, dict)
    else None
)
safe_policy = safe_policy_state.get("safePolicy") if isinstance(safe_policy_state, dict) else None

queued_payout = None
if isinstance(payout_fixtures, dict):
    queued_payout = payout_fixtures.get("queuedPayout")

required_missing = []
if not challenge_token_mint:
    required_missing.append("testDao.challengeTokenMint")
if not safe_policy:
    required_missing.append("safePolicy")

if required_missing:
    print("Missing required fields:", file=sys.stderr)
    for field in required_missing:
        print(f"- {field}", file=sys.stderr)
    sys.exit(1)

ui_context = {
    "network": {
        "cluster": "local-validator",
        "rpcUrl": os.environ.get("LOCAL_RPC_URL") or os.environ.get("SURFPOOL_RPC_URL", "http://127.0.0.1:8899"),
    },
    "challengePayout": {
        "challengeTokenMint": challenge_token_mint,
        "safePolicy": safe_policy,
        "queuedPayout": queued_payout,
    },
    "sourceFiles": {
        "daoState": sys.argv[1],
        "safePolicyState": sys.argv[2],
        "payoutFixtures": sys.argv[3],
    },
}

out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(ui_context, indent=2) + "\n", encoding="utf-8")

print(f"Wrote UI context: {out_path}")
print(json.dumps(ui_context, indent=2))
PY
