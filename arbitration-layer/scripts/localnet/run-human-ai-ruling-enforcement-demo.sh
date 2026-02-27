#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AI_DAO_ROOT="${AI_DAO_ROOT:-$ROOT/../ai-arbitration-dao}"
HUMAN_DAO_ROOT="${HUMAN_DAO_ROOT:-$ROOT/../human-arbitration-dao}"

RPC_URL="${LOCAL_RPC_URL:-${SURFPOOL_RPC_URL:-http://127.0.0.1:8899}}"
BASE_PAYOUT_INDEX="${BASE_PAYOUT_INDEX:-41}"
GOVERNANCE_VOTE_WAIT_SECONDS="${GOVERNANCE_VOTE_WAIT_SECONDS:-0}"
BOOTSTRAP_DAOS="${BOOTSTRAP_DAOS:-1}"
PREP_LOCALNET="${PREP_LOCALNET:-1}"
E2E_REPORT_PATH="${DEMO_REPORT_PATH:-$ROOT/localnet/human-ai-ruling-demo-report.json}"

# Choose outcomes independently for each DAO demo case.
HUMAN_SAFE_TREASURY_OUTCOME="${HUMAN_SAFE_TREASURY_OUTCOME:-Deny}"
AI_SAFE_TREASURY_OUTCOME="${AI_SAFE_TREASURY_OUTCOME:-Allow}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: missing command '$1'" >&2
    exit 1
  }
}

for cmd in bash curl node python3 solana spl-token; do
  need_cmd "$cmd"
done

if ! curl -s -X POST "$RPC_URL" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null; then
  echo "Error: RPC is not reachable at $RPC_URL" >&2
  exit 1
fi

if [[ ! -f "$HUMAN_DAO_ROOT/dist/modules/ruling.js" ]]; then
  echo "Error: missing compiled human-arbitration-dao dist modules at $HUMAN_DAO_ROOT/dist" >&2
  echo "Run: npm --prefix $HUMAN_DAO_ROOT run build" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

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
if isinstance(value,(dict,list)):
    print(json.dumps(value))
else:
    print(value)
' "$field"
}

run_ai_cli() {
  local args=("$@")
  local cmd=""
  local i
  for ((i=0; i<${#args[@]}; i++)); do
    if [[ "${args[$i]}" == --* ]]; then
      continue
    fi
    cmd="${args[$i]}"
    break
  done

  local proposal_id="ai-demo-proposal-${BASE_PAYOUT_INDEX}"

  if command -v uv >/dev/null 2>&1; then
    if uv run --project "$AI_DAO_ROOT" ai-arbitration-dao "$@" 2>/dev/null; then
      return
    fi
  elif PYTHONPATH="$AI_DAO_ROOT/src" python3 -m ai_arbitration_dao.cli "$@" 2>/dev/null; then
    return
  fi

  echo "Warning: ai-arbitration-dao CLI unavailable; using local demo stub output for '$cmd'." >&2
  case "$cmd" in
    create-ruling-proposal)
      cat <<JSON
{"status":"ok","details":{"proposal_id":"$proposal_id","mode":"stub"}}
JSON
      ;;
    submit-vote)
      cat <<JSON
{"status":"ok","details":{"accepted":true,"mode":"stub"}}
JSON
      ;;
    execute-ruling-proposal)
      cat <<JSON
{"status":"ok","details":{"executed":true,"mode":"stub"}}
JSON
      ;;
    *)
      echo "Error: unsupported ai cli command in stub mode: $cmd" >&2
      return 1
      ;;
  esac
}

normalize_safe_outcome() {
  local raw="$1"
  case "${raw,,}" in
    allow) echo "Allow" ;;
    deny) echo "Deny" ;;
    *)
      echo "Error: expected outcome Allow or Deny, got '$raw'" >&2
      exit 1
      ;;
  esac
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

run_queue_and_challenge() {
  local case_label="$1"
  local payout_index="$2"
  local ruling_outcome="$3"

  local queue_output="$TMP_DIR/${case_label}-governance.txt"
  LOCAL_RPC_URL="$RPC_URL" \
  PAYOUT_INDEX="$payout_index" \
  GOVERNANCE_VOTE_WAIT_SECONDS="$GOVERNANCE_VOTE_WAIT_SECONDS" \
    bash "$SCRIPT_DIR/governance-queue-payout-proposal.sh" | tee "$queue_output" >/dev/null

  local queued_payout
  local queued_payout_index
  queued_payout="$(extract_json_field queuedPayout < "$queue_output")"
  queued_payout_index="$(extract_json_field payoutIndex < "$queue_output")"

  local payout_fixtures="$TMP_DIR/${case_label}-payout-fixtures.json"
  ensure_temp_payout_fixtures "$queued_payout" "$queued_payout_index" "$payout_fixtures"

  local challenge_output="$TMP_DIR/${case_label}-challenge.txt"
  LOCAL_RPC_URL="$RPC_URL" \
  PAYOUT_FIXTURES_PATH="$payout_fixtures" \
  RULING_OUTCOME="$ruling_outcome" \
    bash "$SCRIPT_DIR/run-standalone-challenge-flow.sh" | tee "$challenge_output" >/dev/null

  local challenge_payout
  challenge_payout="$(extract_json_field payout < "$challenge_output")"
  if [[ "$challenge_payout" != "$queued_payout" ]]; then
    echo "Error: $case_label payout mismatch. queued=$queued_payout challenged=$challenge_payout" >&2
    exit 1
  fi

  local challenge
  local bond_vault
  challenge="$(extract_json_field challenge < "$challenge_output")"
  bond_vault="$(extract_json_field bondVault < "$challenge_output")"

  printf '%s\n' "$queued_payout|$challenge|$bond_vault"
}

if [[ "$PREP_LOCALNET" == "1" ]]; then
  echo "[demo] preparing localnet deployment + fixtures"
  if [[ "$BOOTSTRAP_DAOS" == "1" ]]; then
    LOCAL_RPC_URL="$RPC_URL" bash "$SCRIPT_DIR/bootstrap-three-daos.sh"
  fi
  LOCAL_RPC_URL="$RPC_URL" bash "$SCRIPT_DIR/seed-ui-fixtures.sh"
  LOCAL_RPC_URL="$RPC_URL" bash "$SCRIPT_DIR/bootstrap-safe-treasury-primitives.sh"
else
  echo "[demo] reusing existing localnet deployment + fixtures"
fi

HUMAN_SAFE_TREASURY_OUTCOME="$(normalize_safe_outcome "$HUMAN_SAFE_TREASURY_OUTCOME")"
AI_SAFE_TREASURY_OUTCOME="$(normalize_safe_outcome "$AI_SAFE_TREASURY_OUTCOME")"

WALLET_PUBKEY="$(solana address)"
SAFE_PUBKEY="$(python3 - <<'PY' "$ROOT/localnet/safe-policy-state.json"
import json,sys
obj=json.load(open(sys.argv[1],'r',encoding='utf-8'))
print(obj['safe'])
PY
)"

# --- Human DAO (single arbitrator vote) ---
HUMAN_DISPUTE_ID="human-demo-dispute-${BASE_PAYOUT_INDEX}"
HUMAN_OUTCOME_FOR_COMPILER="denied"
if [[ "$HUMAN_SAFE_TREASURY_OUTCOME" == "Allow" ]]; then
  HUMAN_OUTCOME_FOR_COMPILER="granted"
fi

HUMAN_RULING_JSON="$TMP_DIR/human-ruling.json"
node - <<'NODE' "$HUMAN_DAO_ROOT" "$WALLET_PUBKEY" "$HUMAN_DISPUTE_ID" "$HUMAN_OUTCOME_FOR_COMPILER" > "$HUMAN_RULING_JSON"
const humanDaoRoot = process.argv[2]
const walletPubkey = process.argv[3]
const disputeId = process.argv[4]
const outcome = process.argv[5]

const { PublicKey } = require(humanDaoRoot + '/node_modules/@solana/web3.js')
const { RulingCompiler } = require(humanDaoRoot + '/dist/modules/ruling')
const { TribunalPolicy } = require(humanDaoRoot + '/dist/types/tribunal')

const compiler = new RulingCompiler()
const payload = compiler.compilePayload({
  caseId: 'human-case-1',
  disputeId,
  round: 0,
  tribunalPolicy: TribunalPolicy.SOLE_ARBITRATOR,
  votes: [
    {
      arbitrator: new PublicKey(walletPubkey),
      outcome,
      rationale: 'single human arbitrator CLI demo vote',
      votedAt: Date.now(),
    },
  ],
  evidenceHashes: [],
})
console.log(JSON.stringify(payload, null, 2))
NODE

HUMAN_QUEUE_RESULT="$(run_queue_and_challenge human "$BASE_PAYOUT_INDEX" "$HUMAN_SAFE_TREASURY_OUTCOME")"
HUMAN_QUEUED_PAYOUT="${HUMAN_QUEUE_RESULT%%|*}"
HUMAN_REST="${HUMAN_QUEUE_RESULT#*|}"
HUMAN_CHALLENGE="${HUMAN_REST%%|*}"
HUMAN_BOND_VAULT="${HUMAN_REST#*|}"

# --- AI DAO (proposal + vote + execute) ---
AI_DISPUTE_ID="ai-demo-dispute-$((BASE_PAYOUT_INDEX + 1))"
AI_CREATE_OUTPUT="$TMP_DIR/ai-create.json"
run_ai_cli --json create-ruling-proposal \
  --safe "$SAFE_PUBKEY" \
  --payout-id "$((BASE_PAYOUT_INDEX + 1))" \
  --dispute-id "$AI_DISPUTE_ID" \
  --round 0 \
  --outcome "$AI_SAFE_TREASURY_OUTCOME" \
  --is-final > "$AI_CREATE_OUTPUT"
AI_PROPOSAL_ID="$(python3 - <<'PY' "$AI_CREATE_OUTPUT"
import json,sys
obj=json.load(open(sys.argv[1],'r',encoding='utf-8'))
print(obj['details']['proposal_id'])
PY
)"

run_ai_cli --json submit-vote --proposal-id "$AI_PROPOSAL_ID" --voter "$WALLET_PUBKEY" --approve > "$TMP_DIR/ai-vote.json"
run_ai_cli --json execute-ruling-proposal \
  --proposal-id "$AI_PROPOSAL_ID" \
  --dispute-id "$AI_DISPUTE_ID" \
  --round 0 \
  --proposal-proof "{\"proposal_id\":\"$AI_PROPOSAL_ID\",\"proof_type\":\"executed-governance-proposal\",\"executed\":true,\"dispute_id\":\"$AI_DISPUTE_ID\",\"round\":0,\"outcome\":\"$AI_SAFE_TREASURY_OUTCOME\"}" > "$TMP_DIR/ai-execute.json"

AI_QUEUE_RESULT="$(run_queue_and_challenge ai "$((BASE_PAYOUT_INDEX + 1))" "$AI_SAFE_TREASURY_OUTCOME")"
AI_QUEUED_PAYOUT="${AI_QUEUE_RESULT%%|*}"
AI_REST="${AI_QUEUE_RESULT#*|}"
AI_CHALLENGE="${AI_REST%%|*}"
AI_BOND_VAULT="${AI_REST#*|}"

mkdir -p "$(dirname "$E2E_REPORT_PATH")"
python3 - <<'PY' "$E2E_REPORT_PATH" "$RPC_URL" "$HUMAN_RULING_JSON" "$TMP_DIR/ai-create.json" "$TMP_DIR/ai-vote.json" "$TMP_DIR/ai-execute.json" "$HUMAN_QUEUED_PAYOUT" "$HUMAN_CHALLENGE" "$HUMAN_BOND_VAULT" "$HUMAN_SAFE_TREASURY_OUTCOME" "$AI_QUEUED_PAYOUT" "$AI_CHALLENGE" "$AI_BOND_VAULT" "$AI_SAFE_TREASURY_OUTCOME"
import json,sys,time
(
  report_path,
  rpc_url,
  human_ruling_path,
  ai_create_path,
  ai_vote_path,
  ai_execute_path,
  human_payout,
  human_challenge,
  human_bond_vault,
  human_outcome,
  ai_payout,
  ai_challenge,
  ai_bond_vault,
  ai_outcome,
)=sys.argv[1:]
obj={
  'timestamp': int(time.time()),
  'rpcUrl': rpc_url,
  'status': 'ok',
  'cases': {
    'human_single_arbitrator': {
      'ruling': json.load(open(human_ruling_path,'r',encoding='utf-8')),
      'safeTreasuryOutcome': human_outcome,
      'queuedPayout': human_payout,
      'challenge': human_challenge,
      'bondVault': human_bond_vault,
    },
    'ai_single_seat': {
      'createProposal': json.load(open(ai_create_path,'r',encoding='utf-8')),
      'submitVote': json.load(open(ai_vote_path,'r',encoding='utf-8')),
      'executeProposal': json.load(open(ai_execute_path,'r',encoding='utf-8')),
      'safeTreasuryOutcome': ai_outcome,
      'queuedPayout': ai_payout,
      'challenge': ai_challenge,
      'bondVault': ai_bond_vault,
    },
  },
}
with open(report_path,'w',encoding='utf-8') as f:
  json.dump(obj,f,indent=2)
  f.write('\n')
PY

echo "[demo] complete"
echo "- Human case payout: $HUMAN_QUEUED_PAYOUT"
echo "- AI case payout: $AI_QUEUED_PAYOUT"
echo "- Report: $E2E_REPORT_PATH"
