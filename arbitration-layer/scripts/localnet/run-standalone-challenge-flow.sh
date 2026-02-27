#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RPC_URL="${LOCAL_RPC_URL:-${SURFPOOL_RPC_URL:-http://127.0.0.1:8899}}"
SAFE_TREASURY_PROGRAM_ID="${SAFE_TREASURY_PROGRAM_ID:-9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD}"
AUTHORITY_KEYPAIR="${LOCAL_AUTHORITY_KEYPAIR:-$HOME/.config/solana/id.json}"
SAFE_POLICY_STATE_PATH="${SAFE_POLICY_STATE_PATH:-$ARB_ROOT/localnet/safe-policy-state.json}"
PAYOUT_FIXTURES_PATH="${PAYOUT_FIXTURES_PATH:-$ARB_ROOT/localnet/payout-fixtures.json}"
CHALLENGE_BOND_LAMPORTS="${CHALLENGE_BOND_LAMPORTS:-10000000}"
RULING_OUTCOME="${RULING_OUTCOME:-Deny}"
NODE_MODULES_DIR="${SAFE_TREASURY_NODE_MODULES_DIR:-$ARB_ROOT/../human-arbitration-dao/node_modules}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: missing command '$1'" >&2
    exit 1
  }
}

need_cmd node
need_cmd python3
need_cmd solana
need_cmd spl-token

if [[ ! -f "$AUTHORITY_KEYPAIR" ]]; then
  echo "Error: authority keypair not found at $AUTHORITY_KEYPAIR" >&2
  exit 1
fi

if [[ ! -f "$SAFE_POLICY_STATE_PATH" || ! -f "$PAYOUT_FIXTURES_PATH" ]]; then
  echo "Error: fixture files missing. Run: bash scripts/localnet/seed-ui-fixtures.sh" >&2
  exit 1
fi

if [[ ! -f "$NODE_MODULES_DIR/@solana/web3.js/package.json" ]]; then
  echo "Error: @solana/web3.js not found under $NODE_MODULES_DIR" >&2
  echo "Install deps in human-arbitration-dao first (npm install)." >&2
  exit 1
fi

if ! curl -s -X POST "$RPC_URL" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null; then
  echo "Error: RPC is not reachable at $RPC_URL" >&2
  exit 1
fi

echo "[standalone-challenge] ensuring primitive setup"
LOCAL_RPC_URL="$RPC_URL" \
SAFE_TREASURY_PROGRAM_ID="$SAFE_TREASURY_PROGRAM_ID" \
bash "$SCRIPT_DIR/bootstrap-safe-treasury-primitives.sh"

VALUES="$(python3 - <<'PY' "$SAFE_POLICY_STATE_PATH" "$PAYOUT_FIXTURES_PATH"
import json,sys
policy=json.load(open(sys.argv[1],'r',encoding='utf-8'))
fixtures=json.load(open(sys.argv[2],'r',encoding='utf-8'))
q=fixtures.get('queuedPayout',{})
print(policy.get('safe',''))
print(policy.get('safePolicy',''))
print(policy.get('authority',''))
print(policy.get('resolver',''))
print(policy.get('eligibilityMint',''))
print(q.get('payoutIndex',0))
PY
)"
SAFE_PUBKEY="$(printf '%s\n' "$VALUES" | sed -n '1p')"
SAFE_POLICY_PUBKEY="$(printf '%s\n' "$VALUES" | sed -n '2p')"
AUTHORITY_PUBKEY="$(printf '%s\n' "$VALUES" | sed -n '3p')"
RESOLVER_PUBKEY="$(printf '%s\n' "$VALUES" | sed -n '4p')"
CHALLENGE_TOKEN_MINT="$(printf '%s\n' "$VALUES" | sed -n '5p')"
PAYOUT_INDEX="$(printf '%s\n' "$VALUES" | sed -n '6p')"

ONCHAIN_ELIGIBILITY_MINT="$(python3 - <<'PY' "$RPC_URL" "$SAFE_POLICY_PUBKEY"
import base64, json, sys, urllib.request

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def b58encode(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    out = ""
    while n > 0:
        n, rem = divmod(n, 58)
        out = ALPHABET[rem] + out
    pad = 0
    for b in data:
        if b == 0:
            pad += 1
        else:
            break
    return ("1" * pad) + (out or "1")

rpc_url, safe_policy = sys.argv[1], sys.argv[2]
payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getAccountInfo",
    "params": [safe_policy, {"encoding": "base64"}],
}
try:
    req = urllib.request.Request(
        rpc_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    value = (data.get("result") or {}).get("value")
    if not value:
        print("")
        raise SystemExit(0)
    raw = base64.b64decode(value["data"][0])
    if len(raw) < 120:
        print("")
        raise SystemExit(0)
    print(b58encode(raw[88:120]))
except Exception:
    print("")
PY
)"
if [[ -n "$ONCHAIN_ELIGIBILITY_MINT" ]]; then
  CHALLENGE_TOKEN_MINT="$ONCHAIN_ELIGIBILITY_MINT"
fi

if [[ -z "$SAFE_PUBKEY" || -z "$SAFE_POLICY_PUBKEY" || -z "$AUTHORITY_PUBKEY" || -z "$CHALLENGE_TOKEN_MINT" ]]; then
  echo "Error: fixture files missing required fields" >&2
  exit 1
fi

case "$RULING_OUTCOME" in
  Allow|Deny) ;;
  *)
    echo "Error: RULING_OUTCOME must be 'Allow' or 'Deny' (received: $RULING_OUTCOME)" >&2
    exit 1
    ;;
esac

TOKEN_ACCOUNT_OUTPUT="$(spl-token --url "$RPC_URL" create-account "$CHALLENGE_TOKEN_MINT" 2>/dev/null || true)"
AUTHORITY_WALLET_PUBKEY="$(solana address --keypair "$AUTHORITY_KEYPAIR")"
TOKEN_ACCOUNTS_JSON="$(spl-token --url "$RPC_URL" accounts --owner "$AUTHORITY_WALLET_PUBKEY" --output json)"
CHALLENGER_TOKEN_ACCOUNT="$(python3 - <<'PY' "$TOKEN_ACCOUNTS_JSON" "$CHALLENGE_TOKEN_MINT"
import json,sys
obj=json.loads(sys.argv[1])
mint=sys.argv[2]
for row in obj.get('accounts',[]):
    if row.get('mint')==mint:
        print(row['address'])
        break
PY
)"
if [[ -z "$CHALLENGER_TOKEN_ACCOUNT" ]]; then
  echo "Error: failed to resolve challenger token account for mint $CHALLENGE_TOKEN_MINT" >&2
  if [[ -n "$TOKEN_ACCOUNT_OUTPUT" ]]; then
    echo "$TOKEN_ACCOUNT_OUTPUT" >&2
  fi
  exit 1
fi

spl-token --url "$RPC_URL" mint "$CHALLENGE_TOKEN_MINT" 5 "$CHALLENGER_TOKEN_ACCOUNT" >/dev/null
solana airdrop 2 --url "$RPC_URL" --keypair "$AUTHORITY_KEYPAIR" >/dev/null || true

NODE_PATH="$NODE_MODULES_DIR" node - "$RPC_URL" "$SAFE_TREASURY_PROGRAM_ID" "$AUTHORITY_KEYPAIR" "$SAFE_PUBKEY" "$SAFE_POLICY_PUBKEY" "$RESOLVER_PUBKEY" "$PAYOUT_INDEX" "$CHALLENGER_TOKEN_ACCOUNT" "$CHALLENGE_BOND_LAMPORTS" "$RULING_OUTCOME" <<'NODE'
const fs = require('fs')
const BN = require('bn.js')
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js')

const [
  rpcUrl,
  programIdRaw,
  authorityKeypairPath,
  safeRaw,
  safePolicyRaw,
  resolverRaw,
  payoutIndexRaw,
  challengerTokenAccountRaw,
  challengeBondLamportsRaw,
  rulingOutcomeRaw,
] = process.argv.slice(2)

const DISCRIMINATORS = {
  challengePayout: Uint8Array.from([128, 122, 229, 7, 139, 210, 241, 49]),
  recordRuling: Uint8Array.from([176, 44, 173, 34, 129, 227, 28, 153]),
}

function u64ToLeBytes(value) {
  return Uint8Array.from(new BN(value).toArray('le', 8))
}

function encodeRecordRulingArgs() {
  const normalizedOutcome = String(rulingOutcomeRaw).trim().toLowerCase()
  let outcome = 1
  if (normalizedOutcome === 'allow') {
    outcome = 0
  } else if (normalizedOutcome === 'deny') {
    outcome = 1
  } else {
    throw new Error(`RULING_OUTCOME must be Allow or Deny. Received: ${rulingOutcomeRaw}`)
  }

  return Uint8Array.from([
    0, // round
    outcome,
    1, // is_final = true
    0, // authorization_mode = direct resolver signer
    0, // payload_hash: None
    0, // proposal_owner: None
    0, // proposal_signatory: None
    0, // proposal_state: None
  ])
}

async function sendTx(connection, payer, instructions) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({
    feePayer: payer.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(...instructions)
  return sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  })
}

async function main() {
  const connection = new Connection(rpcUrl, 'confirmed')
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(authorityKeypairPath, 'utf8'))))
  const programId = new PublicKey(programIdRaw)
  const safe = new PublicKey(safeRaw)
  const safePolicy = new PublicKey(safePolicyRaw)
  const resolver = new PublicKey(resolverRaw)
  const payoutIndex = new BN(payoutIndexRaw)
  const challengerTokenAccount = new PublicKey(challengerTokenAccountRaw)

  const [payout] = PublicKey.findProgramAddressSync(
    [Buffer.from('payout'), safe.toBuffer(), Buffer.from(payoutIndex.toArray('le', 8))],
    programId,
  )
  const [challenge] = PublicKey.findProgramAddressSync([Buffer.from('challenge'), payout.toBuffer()], programId)
  const [bondVault] = PublicKey.findProgramAddressSync([Buffer.from('challenge_bond_vault')], programId)

  await sendTx(connection, payer, [
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: payout, isSigner: false, isWritable: true },
        { pubkey: challenge, isSigner: false, isWritable: true },
        { pubkey: safePolicy, isSigner: false, isWritable: true },
        { pubkey: safe, isSigner: false, isWritable: true },
        { pubkey: bondVault, isSigner: false, isWritable: true },
        { pubkey: challengerTokenAccount, isSigner: false, isWritable: false },
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(Uint8Array.from([...DISCRIMINATORS.challengePayout, ...u64ToLeBytes(challengeBondLamportsRaw)])),
    }),
  ])

  await sendTx(connection, payer, [
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: payout, isSigner: false, isWritable: true },
        { pubkey: challenge, isSigner: false, isWritable: true },
        { pubkey: safePolicy, isSigner: false, isWritable: false },
        { pubkey: bondVault, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: false, isWritable: true },
        { pubkey: safe, isSigner: false, isWritable: true },
        { pubkey: resolver, isSigner: true, isWritable: false },
        // proposal: Option<UncheckedAccount> — pass SystemProgram as None-sentinel (mode 0)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(Uint8Array.from([...DISCRIMINATORS.recordRuling, ...encodeRecordRulingArgs()])),
    }),
  ])

  process.stdout.write(
    JSON.stringify(
      {
        payout: payout.toBase58(),
        challenge: challenge.toBase58(),
        bondVault: bondVault.toBase58(),
        outcome: String(rulingOutcomeRaw).trim(),
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
NODE

echo ""
echo "[standalone-challenge] complete"
