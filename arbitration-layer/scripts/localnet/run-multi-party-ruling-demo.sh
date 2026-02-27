#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RPC_URL="${LOCAL_RPC_URL:-${SURFPOOL_RPC_URL:-http://127.0.0.1:8899}}"
PAYOUT_INDEX="${PAYOUT_INDEX:-61}"
GOVERNANCE_VOTE_WAIT_SECONDS="${GOVERNANCE_VOTE_WAIT_SECONDS:-0}"
BOOTSTRAP_DAOS="${BOOTSTRAP_DAOS:-0}"
REPORT_PATH="${MULTI_PARTY_DEMO_REPORT_PATH:-$ROOT/localnet/multi-party-ruling-demo-report.json}"

# Hardcoded minimal demo votes.
# This intentionally avoids external CSV inputs to keep hackathon demo setup trivial.
HUMAN_VOTE_SEQUENCE=("Deny" "Allow" "Deny")
AI_VOTE_SEQUENCE=("Allow" "Deny")

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: missing command '$1'" >&2
    exit 1
  }
}

for cmd in bash curl python3 solana spl-token; do
  need_cmd "$cmd"
done

if ! curl -s -X POST "$RPC_URL" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null; then
  echo "Error: RPC is not reachable at $RPC_URL" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

calc_majority_outcome() {
  local allow=0
  local deny=0
  local vote
  for vote in "$@"; do
    case "${vote,,}" in
      allow)
        allow=$((allow + 1))
        ;;
      deny)
        deny=$((deny + 1))
        ;;
      *)
        echo "Error: unsupported vote token '$vote' (expected allow|deny)" >&2
        exit 1
        ;;
    esac
  done

  if (( allow > deny )); then
    echo "Allow"
  else
    echo "Deny"
  fi
}

extract_json_field() {
  local field="$1"
  python3 -c 'import json,sys
raw=sys.stdin.read()
decoder=json.JSONDecoder()
objs=[]
i=0
while True:
    j=raw.find("{", i)
    if j==-1:
        break
    try:
        obj,end=decoder.raw_decode(raw[j:])
        objs.append(obj)
        i=j+end
    except json.JSONDecodeError:
        i=j+1
if not objs:
    raise SystemExit("No JSON object found in command output")
obj=objs[-1]
value=obj
for part in sys.argv[1].split("."):
    if part:
        value=value[part]
print(value)
' "$field"
}

ensure_temp_payout_fixtures() {
  local payout_pubkey="$1"
  local payout_index="$2"
  local temp_path="$3"
  python3 - <<'PY' "$ROOT/localnet/payout-fixtures.json" "$temp_path" "$payout_pubkey" "$payout_index"
import json,sys
src,dst,payout,index=sys.argv[1:]
index=int(index)
obj=json.load(open(src,'r',encoding='utf-8'))
queued=obj.get('queuedPayout',{})
queued['payout']=payout
queued['payoutIndex']=index
obj['queuedPayout']=queued
with open(dst,'w',encoding='utf-8') as f:
    json.dump(obj,f,indent=2)
    f.write('\n')
PY
}

if [[ "$BOOTSTRAP_DAOS" == "1" ]]; then
  echo "[multi-demo] optional bootstrap requested"
  LOCAL_RPC_URL="$RPC_URL" bash "$SCRIPT_DIR/bootstrap-three-daos.sh"
  LOCAL_RPC_URL="$RPC_URL" bash "$SCRIPT_DIR/seed-ui-fixtures.sh"
  LOCAL_RPC_URL="$RPC_URL" bash "$SCRIPT_DIR/bootstrap-safe-treasury-primitives.sh"
fi

echo "[multi-demo] queueing payout via governance"
QUEUE_OUTPUT="$TMP_DIR/governance-queue.txt"
LOCAL_RPC_URL="$RPC_URL" \
PAYOUT_INDEX="$PAYOUT_INDEX" \
GOVERNANCE_VOTE_WAIT_SECONDS="$GOVERNANCE_VOTE_WAIT_SECONDS" \
  bash "$SCRIPT_DIR/governance-queue-payout-proposal.sh" | tee "$QUEUE_OUTPUT" >/dev/null
QUEUED_PAYOUT="$(extract_json_field queuedPayout < "$QUEUE_OUTPUT")"
QUEUED_PAYOUT_INDEX="$(extract_json_field payoutIndex < "$QUEUE_OUTPUT")"

# Current behavior: aggregate hardcoded multi-party votes off-chain.
# Next step (TODO): replace this with real wallet-signed human votes and AI seat attestations.
HUMAN_OUTCOME="$(calc_majority_outcome "${HUMAN_VOTE_SEQUENCE[@]}")"
AI_OUTCOME="$(calc_majority_outcome "${AI_VOTE_SEQUENCE[@]}")"

FINAL_OUTCOME="Deny"
if [[ "$HUMAN_OUTCOME" == "Allow" && "$AI_OUTCOME" == "Allow" ]]; then
  FINAL_OUTCOME="Allow"
fi

echo "[multi-demo] human majority=$HUMAN_OUTCOME ai majority=$AI_OUTCOME final=$FINAL_OUTCOME"

TEMP_PAYOUT_FIXTURES="$TMP_DIR/payout-fixtures.multi.json"
ensure_temp_payout_fixtures "$QUEUED_PAYOUT" "$QUEUED_PAYOUT_INDEX" "$TEMP_PAYOUT_FIXTURES"

CHALLENGE_OUTPUT="$TMP_DIR/challenge.txt"
LOCAL_RPC_URL="$RPC_URL" \
PAYOUT_FIXTURES_PATH="$TEMP_PAYOUT_FIXTURES" \
RULING_OUTCOME="$FINAL_OUTCOME" \
  bash "$SCRIPT_DIR/run-standalone-challenge-flow.sh" | tee "$CHALLENGE_OUTPUT" >/dev/null

CHALLENGE_PAYOUT="$(extract_json_field payout < "$CHALLENGE_OUTPUT")"
CHALLENGE_PUBKEY="$(extract_json_field challenge < "$CHALLENGE_OUTPUT")"
BOND_VAULT="$(extract_json_field bondVault < "$CHALLENGE_OUTPUT")"

if [[ "$CHALLENGE_PAYOUT" != "$QUEUED_PAYOUT" ]]; then
  echo "Error: challenged payout ($CHALLENGE_PAYOUT) does not match queued payout ($QUEUED_PAYOUT)" >&2
  exit 1
fi

mkdir -p "$(dirname "$REPORT_PATH")"
python3 - <<'PY' "$REPORT_PATH" "$RPC_URL" "$PAYOUT_INDEX" "$QUEUED_PAYOUT" "$CHALLENGE_PUBKEY" "$BOND_VAULT" "$HUMAN_OUTCOME" "$AI_OUTCOME" "$FINAL_OUTCOME" "${HUMAN_VOTE_SEQUENCE[*]}" "${AI_VOTE_SEQUENCE[*]}"
import json,sys,time
(
  report_path,
  rpc_url,
  payout_index,
  queued_payout,
  challenge,
  bond_vault,
  human_outcome,
  ai_outcome,
  final_outcome,
  human_votes_raw,
  ai_votes_raw,
)=sys.argv[1:]
obj={
  'timestamp': int(time.time()),
  'rpcUrl': rpc_url,
  'status': 'ok',
  'mode': 'multi-party-simulation',
  'flow': {
    'payoutIndex': int(payout_index),
    'queuedPayout': queued_payout,
    'challenge': challenge,
    'bondVault': bond_vault,
    'humanVotes': [v for v in human_votes_raw.split(' ') if v],
    'aiVotes': [v for v in ai_votes_raw.split(' ') if v],
    'humanMajorityOutcome': human_outcome,
    'aiMajorityOutcome': ai_outcome,
    'finalSafeTreasuryOutcome': final_outcome,
  },
  'nextSteps': [
    'Replace simulated votes with real wallet-signed human arbitrator ballots',
    'Replace simulated AI votes with seat attestation + governance proof records',
    'Record and verify proposal-proof mode on-chain before record_ruling',
  ],
}
with open(report_path,'w',encoding='utf-8') as f:
  json.dump(obj,f,indent=2)
  f.write('\n')
PY

echo "[multi-demo] complete"
echo "- queued payout: $QUEUED_PAYOUT"
echo "- payout index: $QUEUED_PAYOUT_INDEX"
echo "- final outcome: $FINAL_OUTCOME"
echo "- report: $REPORT_PATH"
