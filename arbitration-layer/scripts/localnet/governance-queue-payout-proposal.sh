#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RPC_URL="${LOCAL_RPC_URL:-${SURFPOOL_RPC_URL:-http://127.0.0.1:8899}}"
SAFE_TREASURY_PROGRAM_ID="${SAFE_TREASURY_PROGRAM_ID:-9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD}"
GOVERNANCE_PROGRAM_ID="${GOVERNANCE_PROGRAM_ID:-}"
SOLANA_WALLET_PATH="${SOLANA_WALLET_PATH:-${SOLANA_WALLET:-$HOME/.config/solana/id.json}}"
DAO_STATE_PATH="${DAO_STATE_PATH:-$ARB_ROOT/localnet/dao-state.json}"
SAFE_POLICY_STATE_PATH="${SAFE_POLICY_STATE_PATH:-$ARB_ROOT/localnet/safe-policy-state.json}"
QUEUE_AMOUNT_LAMPORTS="${QUEUE_AMOUNT_LAMPORTS:-1000000}"
PAYOUT_INDEX="${PAYOUT_INDEX:-1}"
GOVERNANCE_VOTE_WAIT_SECONDS="${GOVERNANCE_VOTE_WAIT_SECONDS:-3700}"
NODE_MODULES_DIR="${GOVERNANCE_NODE_MODULES_DIR:-$ARB_ROOT/../human-arbitration-dao/node_modules}"

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

if [[ ! -f "$SOLANA_WALLET_PATH" ]]; then
  echo "Error: wallet keypair not found at $SOLANA_WALLET_PATH" >&2
  exit 1
fi

if [[ ! -f "$DAO_STATE_PATH" || ! -f "$SAFE_POLICY_STATE_PATH" ]]; then
  echo "Error: required fixture files missing." >&2
  echo "Need: $DAO_STATE_PATH and $SAFE_POLICY_STATE_PATH" >&2
  exit 1
fi

if [[ ! -f "$NODE_MODULES_DIR/@solana/spl-governance/package.json" ]]; then
  echo "Error: @solana/spl-governance not found under $NODE_MODULES_DIR" >&2
  echo "Install dependencies in human-arbitration-dao first (npm install)." >&2
  exit 1
fi

if [[ -z "$GOVERNANCE_PROGRAM_ID" ]]; then
  GOVERNANCE_PROGRAM_ID="$(python3 - <<'PY' "$DAO_STATE_PATH"
import json,sys
obj=json.load(open(sys.argv[1],'r',encoding='utf-8'))
print(obj.get('governanceProgramId',''))
PY
)"
fi

if [[ -z "$GOVERNANCE_PROGRAM_ID" ]]; then
  echo "Error: governance program id missing. Set GOVERNANCE_PROGRAM_ID or dao-state governanceProgramId." >&2
  exit 1
fi

VALUES="$(python3 - <<'PY' "$DAO_STATE_PATH" "$SAFE_POLICY_STATE_PATH"
import json,sys
dao=json.load(open(sys.argv[1],'r',encoding='utf-8'))
policy=json.load(open(sys.argv[2],'r',encoding='utf-8'))
test=dao.get('testDao',{})
print(test.get('realm',''))
print(test.get('governance',''))
print(policy.get('safe',''))
print(policy.get('safePolicy',''))
print(policy.get('authority',''))
print(policy.get('eligibilityMint',''))
PY
)"
TEST_REALM="$(printf '%s\n' "$VALUES" | sed -n '1p')"
TEST_GOVERNANCE="$(printf '%s\n' "$VALUES" | sed -n '2p')"
SAFE_PUBKEY="$(printf '%s\n' "$VALUES" | sed -n '3p')"
SAFE_POLICY_PUBKEY="$(printf '%s\n' "$VALUES" | sed -n '4p')"
SAFE_POLICY_AUTHORITY="$(printf '%s\n' "$VALUES" | sed -n '5p')"
FIXTURE_ELIGIBILITY_MINT="$(printf '%s\n' "$VALUES" | sed -n '6p')"

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

CHALLENGE_TOKEN_MINT="$ONCHAIN_ELIGIBILITY_MINT"
if [[ -z "$CHALLENGE_TOKEN_MINT" ]]; then
  CHALLENGE_TOKEN_MINT="$FIXTURE_ELIGIBILITY_MINT"
fi

if [[ -z "$TEST_REALM" || -z "$TEST_GOVERNANCE" || -z "$CHALLENGE_TOKEN_MINT" || -z "$SAFE_POLICY_PUBKEY" ]]; then
  echo "Error: dao/safe policy fixture files are missing required addresses" >&2
  exit 1
fi

QUEUE_MODE="governance"
if [[ "$SAFE_POLICY_AUTHORITY" != "$TEST_GOVERNANCE" ]]; then
  echo "Warning: safe_policy.authority != testDao.governance; using direct authority queue mode on local validator." >&2
  echo "safe_policy.authority=$SAFE_POLICY_AUTHORITY" >&2
  echo "testDao.governance=$TEST_GOVERNANCE" >&2
  QUEUE_MODE="direct"
fi

WALLET_PUBKEY="$(solana address --keypair "$SOLANA_WALLET_PATH")"

TOKEN_ACCOUNT_OUTPUT="$(spl-token --url "$RPC_URL" create-account "$CHALLENGE_TOKEN_MINT" --owner "$WALLET_PUBKEY" 2>/dev/null || true)"
if [[ -n "$TOKEN_ACCOUNT_OUTPUT" ]]; then
  GOVERNING_TOKEN_SOURCE="$(printf '%s\n' "$TOKEN_ACCOUNT_OUTPUT" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' | head -n1)"
else
  GOVERNING_TOKEN_ACCOUNTS_JSON="$(spl-token --url "$RPC_URL" accounts --owner "$WALLET_PUBKEY" --output json)"
  GOVERNING_TOKEN_SOURCE="$(python3 - <<'PY' "$GOVERNING_TOKEN_ACCOUNTS_JSON" "$CHALLENGE_TOKEN_MINT"
import json,sys
obj=json.loads(sys.argv[1])
mint=sys.argv[2]
for row in obj.get('accounts',[]):
    if row.get('mint')==mint:
        print(row['address'])
        break
PY
)"
fi

if [[ -z "$GOVERNING_TOKEN_SOURCE" ]]; then
  echo "Error: unable to resolve governing token source account" >&2
  exit 1
fi

spl-token --url "$RPC_URL" mint "$CHALLENGE_TOKEN_MINT" 25 "$GOVERNING_TOKEN_SOURCE" >/dev/null

NODE_PATH="$NODE_MODULES_DIR" node - "$RPC_URL" "$GOVERNANCE_PROGRAM_ID" "$SAFE_TREASURY_PROGRAM_ID" "$SOLANA_WALLET_PATH" "$TEST_REALM" "$TEST_GOVERNANCE" "$CHALLENGE_TOKEN_MINT" "$SAFE_PUBKEY" "$SAFE_POLICY_PUBKEY" "$GOVERNING_TOKEN_SOURCE" "$QUEUE_AMOUNT_LAMPORTS" "$PAYOUT_INDEX" "$GOVERNANCE_VOTE_WAIT_SECONDS" "$QUEUE_MODE" <<'NODE'
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
const {
  AccountMetaData,
  InstructionData,
  Proposal,
  ProposalState,
  VoteType,
  YesNoVote,
  Vote,
  getGovernance,
  getProposal,
  getTokenOwnerRecordAddress,
  withCastVote,
  withCreateProposal,
  withCreateTokenOwnerRecord,
  withDepositGoverningTokens,
  withExecuteTransaction,
  withFinalizeVote,
  withInsertTransaction,
  withSignOffProposal,
} = require('@solana/spl-governance')

const [
  rpcUrl,
  governanceProgramIdRaw,
  safeTreasuryProgramIdRaw,
  walletPath,
  realmRaw,
  governanceRaw,
  governingTokenMintRaw,
  safeRaw,
  safePolicyRaw,
  governingTokenSourceRaw,
  queueAmountRaw,
  payoutIndexRaw,
  voteWaitSecondsRaw,
  queueMode,
] = process.argv.slice(2)

const PROGRAM_VERSION = 3
const QUEUE_PAYOUT_DISCRIMINATOR = Uint8Array.from([10, 91, 65, 13, 252, 117, 130, 76])

function u64ToLeBytes(v) {
  return Uint8Array.from(new BN(v).toArray('le', 8))
}

function optionPubkey(v) {
  if (!v) return Uint8Array.from([0])
  return Uint8Array.from([1, ...Array.from(v.toBytes())])
}

function optionBytes(v) {
  if (!v) return Uint8Array.from([0])
  return Uint8Array.from([1, ...Array.from(v)])
}

function concat(...chunks) {
  return Uint8Array.from(chunks.flatMap((c) => Array.from(c)))
}

// authorization_mode=0: governance PDA must be the authority signer.
// mode=1 (proposal-proof) requires the governance program to be in utils.rs's
// two-entry whitelist (GovER5... / GTesTBi...), which the localnet deploy does
// not satisfy.  mode=0 works because Realms CPI marks the governance PDA as a
// PDA signer when executing a proposal, satisfying authority.is_signer on-chain.
function queuePayoutArgs({ recipient, amount }) {
  return concat(
    Uint8Array.from([0]), // asset_type Native
    optionPubkey(undefined),  // mint: None
    recipient.toBytes(),
    u64ToLeBytes(amount),
    optionBytes(undefined),   // metadata_hash: None
    Uint8Array.from([0]),     // authorization_mode = 0 (authority signer)
    optionBytes(undefined),   // payload_hash: None
    optionPubkey(undefined),  // proposal_owner: None
    optionPubkey(undefined),  // proposal_signatory: None
  )
}

async function sendInstructions(connection, payer, instructions) {
  if (instructions.length === 0) return
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(...instructions)
  await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  })
}

async function main() {
  const connection = new Connection(rpcUrl, 'confirmed')
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8'))))

  const governanceProgramId = new PublicKey(governanceProgramIdRaw)
  const safeTreasuryProgramId = new PublicKey(safeTreasuryProgramIdRaw)
  const realm = new PublicKey(realmRaw)
  const governance = new PublicKey(governanceRaw)
  const governingTokenMint = new PublicKey(governingTokenMintRaw)
  const safe = new PublicKey(safeRaw)
  const safePolicy = new PublicKey(safePolicyRaw)
  const governingTokenSource = new PublicKey(governingTokenSourceRaw)
  const queueAmount = new BN(queueAmountRaw)
  let payoutIndex = new BN(payoutIndexRaw)
  const voteWaitSeconds = Number(voteWaitSecondsRaw)

  const safePolicyAccount = await connection.getAccountInfo(safePolicy, 'confirmed')
  if (safePolicyAccount && safePolicyAccount.data && safePolicyAccount.data.length >= 9) {
    const payoutCountBytes = safePolicyAccount.data.slice(safePolicyAccount.data.length - 9, safePolicyAccount.data.length - 1)
    payoutIndex = new BN(payoutCountBytes, 'le')
  }

  const tokenOwnerRecord = await getTokenOwnerRecordAddress(
    governanceProgramId,
    realm,
    governingTokenMint,
    payer.publicKey,
  )

  const [payout] = PublicKey.findProgramAddressSync(
    [Buffer.from('payout'), safe.toBuffer(), Buffer.from(payoutIndex.toArray('le', 8))],
    safeTreasuryProgramId,
  )

  if (queueMode === 'direct') {
    const queueIxData = concat(
      QUEUE_PAYOUT_DISCRIMINATOR,
      queuePayoutArgs({ recipient: payer.publicKey, amount: queueAmount }),
    )

    const directQueueIxs = [
      new TransactionInstruction({
        programId: safeTreasuryProgramId,
        keys: [
          { pubkey: payout, isSigner: false, isWritable: true },
          { pubkey: safe, isSigner: false, isWritable: true },
          { pubkey: safePolicy, isSigner: false, isWritable: true },
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: payer.publicKey, isSigner: true, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(queueIxData),
      }),
    ]

    await sendInstructions(connection, payer, directQueueIxs)

    process.stdout.write(
      JSON.stringify(
        {
          mode: 'direct',
          proposal: null,
          proposalTransaction: null,
          payoutIndex: Number(payoutIndex.toString()),
          queuedPayout: payout.toBase58(),
        },
        null,
        2,
      ),
    )
    return
  }

  const tokenOwnerRecordAccount = await connection.getAccountInfo(tokenOwnerRecord, 'confirmed')
  if (!tokenOwnerRecordAccount) {
    const depositIxs = []
    await withCreateTokenOwnerRecord(
      depositIxs,
      governanceProgramId,
      PROGRAM_VERSION,
      realm,
      payer.publicKey,
      governingTokenMint,
      payer.publicKey,
    )
    await withDepositGoverningTokens(
      depositIxs,
      governanceProgramId,
      PROGRAM_VERSION,
      realm,
      governingTokenSource,
      governingTokenMint,
      payer.publicKey,
      payer.publicKey,
      payer.publicKey,
      new BN(10),
    )
    await sendInstructions(connection, payer, depositIxs)
  }

  const governanceState = await getGovernance(connection, governance)
  const proposalIndex = governanceState.account.proposalCount

  const proposalIxs = []
  const proposal = await withCreateProposal(
    proposalIxs,
    governanceProgramId,
    PROGRAM_VERSION,
    realm,
    governance,
    tokenOwnerRecord,
    'Queue Safe-Treasury Native Payout',
    'https://localnet.invalid/dispute-safe/queue',
    governingTokenMint,
    payer.publicKey,
    proposalIndex,
    VoteType.SINGLE_CHOICE,
    ['Approve'],
    true,
    payer.publicKey,
  )

  const queueIxData = concat(
    QUEUE_PAYOUT_DISCRIMINATOR,
    queuePayoutArgs({ recipient: payer.publicKey, amount: queueAmount }),
  )

  // mode=0: governance PDA is both payer (isSigner:true) and authority (isSigner:true).
  // Realms governance marks the governance PDA as a PDA signer via invoke_signed when
  // executing the proposal transaction, satisfying authority.is_signer in the program.
  const queueIx = new InstructionData({
    programId: safeTreasuryProgramId,
    accounts: [
      new AccountMetaData({ pubkey: payout, isSigner: false, isWritable: true }),
      new AccountMetaData({ pubkey: safe, isSigner: false, isWritable: true }),
      new AccountMetaData({ pubkey: safePolicy, isSigner: false, isWritable: true }),
      new AccountMetaData({ pubkey: governance, isSigner: true, isWritable: true }), // payer
      new AccountMetaData({ pubkey: governance, isSigner: true, isWritable: false }), // authority
      new AccountMetaData({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }), // proposal: None
      new AccountMetaData({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }), // system_program
    ],
    data: queueIxData,
  })

  const proposalTx = await withInsertTransaction(
    proposalIxs,
    governanceProgramId,
    PROGRAM_VERSION,
    governance,
    proposal,
    tokenOwnerRecord,
    payer.publicKey,
    0,
    0,
    0,
    [queueIx],
    payer.publicKey,
  )

  withSignOffProposal(
    proposalIxs,
    governanceProgramId,
    PROGRAM_VERSION,
    realm,
    governance,
    proposal,
    payer.publicKey,
    undefined,
    tokenOwnerRecord,
  )

  await sendInstructions(connection, payer, proposalIxs)

  const voteIxs = []
  await withCastVote(
    voteIxs,
    governanceProgramId,
    PROGRAM_VERSION,
    realm,
    governance,
    proposal,
    tokenOwnerRecord,
    tokenOwnerRecord,
    payer.publicKey,
    governingTokenMint,
    Vote.fromYesNoVote(YesNoVote.Yes),
    payer.publicKey,
  )
  await sendInstructions(connection, payer, voteIxs)

  if (voteWaitSeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, voteWaitSeconds * 1000))
  }

  const finalizeIxs = []
  await withFinalizeVote(
    finalizeIxs,
    governanceProgramId,
    PROGRAM_VERSION,
    realm,
    governance,
    proposal,
    tokenOwnerRecord,
    governingTokenMint,
  )
  await sendInstructions(connection, payer, finalizeIxs)

  const proposalState = await getProposal(connection, proposal)
  if (proposalState.account.state !== ProposalState.Succeeded && proposalState.account.state !== ProposalState.Executing && proposalState.account.state !== ProposalState.Completed) {
    throw new Error(`proposal not executable: state=${proposalState.account.state}`)
  }

  const executeIxs = []
  await withExecuteTransaction(
    executeIxs,
    governanceProgramId,
    PROGRAM_VERSION,
    governance,
    proposal,
    proposalTx,
    [queueIx],
  )
  await sendInstructions(connection, payer, executeIxs)

  process.stdout.write(
    JSON.stringify(
      {
        proposal: proposal.toBase58(),
        proposalTransaction: proposalTx.toBase58(),
        payoutIndex: Number(payoutIndex.toString()),
        queuedPayout: payout.toBase58(),
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
echo "[governance-queue-payout-proposal] complete"
