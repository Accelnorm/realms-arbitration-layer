#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RPC_URL="${SURFPOOL_RPC_URL:-http://127.0.0.1:8899}"
QUEUE_PAYOUT_INDEX="${QUEUE_PAYOUT_INDEX:-1}"
GOVERNANCE_VOTE_WAIT_SECONDS="${GOVERNANCE_VOTE_WAIT_SECONDS:-3700}"
BOOTSTRAP_DAOS="${BOOTSTRAP_DAOS:-1}"
REPORT_PATH="${E2E_REPORT_PATH:-$ROOT/localnet/e2e-governance-dispute-report.json}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: missing command '$1'" >&2
    exit 1
  }
}

need_cmd bash
need_cmd curl
need_cmd node
need_cmd python3
need_cmd solana
need_cmd spl-token

if ! curl -s -X POST "$RPC_URL" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null; then
  echo "Error: RPC is not reachable at $RPC_URL" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

extract_json_field() {
  local field="$1"
  python3 -c 'import json,re,sys
raw=sys.stdin.read()
matches=re.findall(r"\{[\s\S]*\}", raw)
if not matches:
    raise SystemExit("No JSON object found in command output")
obj=json.loads(matches[-1])
value=obj
for part in sys.argv[1].split("."):
    if part:
        value=value[part]
if isinstance(value,(dict,list)):
    print(json.dumps(value))
else:
    print(value)
' "$field"
}

echo "[e2e] preparing deployment + fixtures"
RALPH_ARGS=(--iterations 5 --sleep-seconds 1)
if [[ "$BOOTSTRAP_DAOS" == "1" ]]; then
  RALPH_ARGS+=(--create-daos)
fi
SURFPOOL_RPC_URL="$RPC_URL" \
  bash "$ROOT/scripts/ralph/ralph-localnet-integration.sh" "${RALPH_ARGS[@]}"

echo "[e2e] creating governance proposal and executing queue_payout"
GOVERNANCE_OUTPUT="$TMP_DIR/governance-output.txt"
SURFPOOL_RPC_URL="$RPC_URL" \
PAYOUT_INDEX="$QUEUE_PAYOUT_INDEX" \
GOVERNANCE_VOTE_WAIT_SECONDS="$GOVERNANCE_VOTE_WAIT_SECONDS" \
  bash "$SCRIPT_DIR/governance-queue-payout-proposal.sh" | tee "$GOVERNANCE_OUTPUT"

PROPOSAL_PUBKEY="$(extract_json_field proposal < "$GOVERNANCE_OUTPUT")"
PROPOSAL_TX_PUBKEY="$(extract_json_field proposalTransaction < "$GOVERNANCE_OUTPUT")"
QUEUED_PAYOUT_PUBKEY="$(extract_json_field queuedPayout < "$GOVERNANCE_OUTPUT")"

if [[ -z "$PROPOSAL_PUBKEY" || -z "$QUEUED_PAYOUT_PUBKEY" ]]; then
  echo "Error: failed to parse governance flow output" >&2
  exit 1
fi

TEMP_PAYOUT_FIXTURES="$TMP_DIR/payout-fixtures.e2e.json"
python3 - <<'PY' "$ROOT/localnet/payout-fixtures.json" "$TEMP_PAYOUT_FIXTURES" "$QUEUED_PAYOUT_PUBKEY" "$QUEUE_PAYOUT_INDEX"
import json,sys
src,dst,payout,index=sys.argv[1:]
index=int(index)
obj=json.load(open(src,'r',encoding='utf-8')) if src else {}
queued=obj.get('queuedPayout',{})
queued['payout']=payout
queued['payoutIndex']=index
obj['queuedPayout']=queued
with open(dst,'w',encoding='utf-8') as f:
    json.dump(obj,f,indent=2)
    f.write('\n')
PY

echo "[e2e] challenging queued payout and recording ruling"
CHALLENGE_OUTPUT="$TMP_DIR/challenge-output.txt"
SURFPOOL_RPC_URL="$RPC_URL" \
PAYOUT_FIXTURES_PATH="$TEMP_PAYOUT_FIXTURES" \
  bash "$SCRIPT_DIR/run-standalone-challenge-flow.sh" | tee "$CHALLENGE_OUTPUT"

CHALLENGE_PAYOUT_PUBKEY="$(extract_json_field payout < "$CHALLENGE_OUTPUT")"
CHALLENGE_PUBKEY="$(extract_json_field challenge < "$CHALLENGE_OUTPUT")"
BOND_VAULT_PUBKEY="$(extract_json_field bondVault < "$CHALLENGE_OUTPUT")"

if [[ "$CHALLENGE_PAYOUT_PUBKEY" != "$QUEUED_PAYOUT_PUBKEY" ]]; then
  echo "Error: challenged payout ($CHALLENGE_PAYOUT_PUBKEY) does not match governance queued payout ($QUEUED_PAYOUT_PUBKEY)" >&2
  exit 1
fi

echo "[e2e] verifying key accounts exist"
solana account --url "$RPC_URL" "$PROPOSAL_PUBKEY" >/dev/null
solana account --url "$RPC_URL" "$PROPOSAL_TX_PUBKEY" >/dev/null
solana account --url "$RPC_URL" "$QUEUED_PAYOUT_PUBKEY" >/dev/null
solana account --url "$RPC_URL" "$CHALLENGE_PUBKEY" >/dev/null
solana account --url "$RPC_URL" "$BOND_VAULT_PUBKEY" >/dev/null

mkdir -p "$(dirname "$REPORT_PATH")"
python3 - <<'PY' "$REPORT_PATH" "$RPC_URL" "$PROPOSAL_PUBKEY" "$PROPOSAL_TX_PUBKEY" "$QUEUED_PAYOUT_PUBKEY" "$CHALLENGE_PUBKEY" "$BOND_VAULT_PUBKEY"
import json,sys,time
(
  report_path,
  rpc_url,
  proposal,
  proposal_tx,
  queued_payout,
  challenge,
  bond_vault,
)=sys.argv[1:]
obj={
  'timestamp': int(time.time()),
  'rpcUrl': rpc_url,
  'status': 'ok',
  'flow': {
    'governanceProposal': proposal,
    'governanceProposalTransaction': proposal_tx,
    'queuedPayout': queued_payout,
    'challenge': challenge,
    'bondVault': bond_vault,
  }
}
with open(report_path,'w',encoding='utf-8') as f:
  json.dump(obj,f,indent=2)
  f.write('\n')
PY

echo "[e2e] complete"
echo "- Proposal: $PROPOSAL_PUBKEY"
echo "- Queued payout: $QUEUED_PAYOUT_PUBKEY"
echo "- Challenge: $CHALLENGE_PUBKEY"
echo "- Report: $REPORT_PATH"
