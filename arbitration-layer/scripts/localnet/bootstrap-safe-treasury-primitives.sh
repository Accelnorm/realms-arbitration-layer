#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RPC_URL="${LOCAL_RPC_URL:-${SURFPOOL_RPC_URL:-http://127.0.0.1:8899}}"
SAFE_TREASURY_PROGRAM_ID="${SAFE_TREASURY_PROGRAM_ID:-9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD}"
AUTHORITY_KEYPAIR="${LOCAL_AUTHORITY_KEYPAIR:-$HOME/.config/solana/id.json}"
SAFE_POLICY_STATE_PATH="${SAFE_POLICY_STATE_PATH:-$ARB_ROOT/localnet/safe-policy-state.json}"
NATIVE_VAULT_FUND_LAMPORTS="${NATIVE_VAULT_FUND_LAMPORTS:-20000000}"
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

if [[ ! -f "$AUTHORITY_KEYPAIR" ]]; then
  echo "Error: authority keypair not found at $AUTHORITY_KEYPAIR" >&2
  exit 1
fi

if [[ ! -f "$SAFE_POLICY_STATE_PATH" ]]; then
  echo "Error: safe policy state file missing at $SAFE_POLICY_STATE_PATH" >&2
  echo "Run: bash scripts/localnet/seed-ui-fixtures.sh" >&2
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

SAFE_VALUES="$(python3 - <<'PY' "$SAFE_POLICY_STATE_PATH"
import json,sys
p=json.load(open(sys.argv[1],'r',encoding='utf-8'))
print(p.get('safe',''))
print(p.get('safePolicy',''))
print(p.get('resolver',''))
print(p.get('disputeWindowSeconds',86400))
print(p.get('challengeBondLamports',10000000))
print(p.get('eligibilityMint',''))
print(p.get('minTokenBalance',1))
PY
)"
SAFE_PUBKEY="$(printf '%s\n' "$SAFE_VALUES" | sed -n '1p')"
SAFE_POLICY_PUBKEY="$(printf '%s\n' "$SAFE_VALUES" | sed -n '2p')"
RESOLVER_PUBKEY="$(printf '%s\n' "$SAFE_VALUES" | sed -n '3p')"
DISPUTE_WINDOW_SECONDS="$(printf '%s\n' "$SAFE_VALUES" | sed -n '4p')"
CHALLENGE_BOND_LAMPORTS="$(printf '%s\n' "$SAFE_VALUES" | sed -n '5p')"
ELIGIBILITY_MINT_PUBKEY="$(printf '%s\n' "$SAFE_VALUES" | sed -n '6p')"
MIN_TOKEN_BALANCE="$(printf '%s\n' "$SAFE_VALUES" | sed -n '7p')"

if [[ -z "$SAFE_PUBKEY" || -z "$SAFE_POLICY_PUBKEY" || -z "$RESOLVER_PUBKEY" || -z "$ELIGIBILITY_MINT_PUBKEY" ]]; then
  echo "Error: safe-policy-state missing required fields (safe/safePolicy/resolver/eligibilityMint)" >&2
  exit 1
fi

AUTHORITY_PUBKEY="$(solana address --keypair "$AUTHORITY_KEYPAIR")"

solana airdrop 5 --url "$RPC_URL" --keypair "$AUTHORITY_KEYPAIR" >/dev/null || true

set +e
BOOTSTRAP_OUTPUT="$(NODE_PATH="$NODE_MODULES_DIR" node - "$RPC_URL" "$SAFE_TREASURY_PROGRAM_ID" "$AUTHORITY_KEYPAIR" "$AUTHORITY_PUBKEY" "$SAFE_PUBKEY" "$SAFE_POLICY_PUBKEY" "$RESOLVER_PUBKEY" "$DISPUTE_WINDOW_SECONDS" "$CHALLENGE_BOND_LAMPORTS" "$ELIGIBILITY_MINT_PUBKEY" "$MIN_TOKEN_BALANCE" "$NATIVE_VAULT_FUND_LAMPORTS" <<'NODE'
const fs = require('fs')
const BN = require('bn.js')
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js')

const [
  rpcUrl,
  programIdRaw,
  authorityKeypairPath,
  authorityPubkeyRaw,
  safeRaw,
  safePolicyRaw,
  resolverRaw,
  disputeWindowSecondsRaw,
  challengeBondLamportsRaw,
  eligibilityMintRaw,
  minTokenBalanceRaw,
  nativeVaultTargetLamportsRaw,
] = process.argv.slice(2)

const DISCRIMINATORS = {
  initializeSafePolicy: Uint8Array.from([224, 246, 214, 53, 134, 77, 214, 125]),
  initNativeVault: Uint8Array.from([215, 164, 145, 228, 222, 75, 2, 101]),
  fundNativeVault: Uint8Array.from([20, 116, 76, 32, 124, 16, 63, 217]),
  initChallengeBondVault: Uint8Array.from([249, 179, 65, 157, 71, 22, 75, 233]),
}

function u64ToLeBytes(value) {
  return Uint8Array.from(new BN(value).toArray('le', 8))
}

function boolToByte(value) {
  return value ? 1 : 0
}

async function sendIx(connection, payer, ix) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({
    feePayer: payer.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(ix)
  await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  })
}

async function main() {
  const connection = new Connection(rpcUrl, 'confirmed')
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(authorityKeypairPath, 'utf8'))))
  const programId = new PublicKey(programIdRaw)
  const authority = new PublicKey(authorityPubkeyRaw)
  const safe = new PublicKey(safeRaw)
  const safePolicy = new PublicKey(safePolicyRaw)
  const resolver = new PublicKey(resolverRaw)
  const eligibilityMint = new PublicKey(eligibilityMintRaw)
  const disputeWindowSeconds = new BN(disputeWindowSecondsRaw)
  const challengeBondLamports = new BN(challengeBondLamportsRaw)
  const minTokenBalance = new BN(minTokenBalanceRaw)
  const targetLamports = new BN(nativeVaultTargetLamportsRaw)

  const [challengeBondVault] = PublicKey.findProgramAddressSync([Buffer.from('challenge_bond_vault')], programId)
  const [nativeVault] = PublicKey.findProgramAddressSync([Buffer.from('native_vault'), safe.toBuffer()], programId)

  const safePolicyAccount = await connection.getAccountInfo(safePolicy, 'confirmed')
  if (!safePolicyAccount) {
    const initSafePolicyArgs = Buffer.from(Uint8Array.from([
      ...DISCRIMINATORS.initializeSafePolicy,
      ...resolver.toBytes(),
      ...u64ToLeBytes(disputeWindowSeconds),
      ...u64ToLeBytes(challengeBondLamports),
      ...eligibilityMint.toBytes(),
      ...u64ToLeBytes(minTokenBalance),
      2,
      ...u64ToLeBytes(new BN(3600)),
      ...new Uint8Array(32),
      boolToByte(false),
      boolToByte(true),
    ]))

    await sendIx(
      connection,
      payer,
      new (require('@solana/web3.js').TransactionInstruction)({
        programId,
        keys: [
          { pubkey: safePolicy, isSigner: false, isWritable: true },
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: initSafePolicyArgs,
      })
    )
  }

  const challengeBondAccount = await connection.getAccountInfo(challengeBondVault, 'confirmed')
  if (!challengeBondAccount) {
    await sendIx(
      connection,
      payer,
      new (require('@solana/web3.js').TransactionInstruction)({
        programId,
        keys: [
          { pubkey: challengeBondVault, isSigner: false, isWritable: true },
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(DISCRIMINATORS.initChallengeBondVault),
      })
    )
  }

  const nativeVaultAccount = await connection.getAccountInfo(nativeVault, 'confirmed')
  if (!nativeVaultAccount) {
    await sendIx(
      connection,
      payer,
      new (require('@solana/web3.js').TransactionInstruction)({
        programId,
        keys: [
          { pubkey: nativeVault, isSigner: false, isWritable: true },
          { pubkey: safe, isSigner: false, isWritable: true },
          { pubkey: safePolicy, isSigner: false, isWritable: false },
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(DISCRIMINATORS.initNativeVault),
      })
    )
  }

  const nativeVaultAfterInit = await connection.getAccountInfo(nativeVault, 'confirmed')
  if (!nativeVaultAfterInit) {
    throw new Error(`NativeVault missing after init: ${nativeVault.toBase58()}`)
  }

  const currentLamports = new BN(nativeVaultAfterInit.lamports)
  const deficit = targetLamports.sub(currentLamports)
  if (deficit.gt(new BN(0))) {
    await sendIx(
      connection,
      payer,
      new (require('@solana/web3.js').TransactionInstruction)({
        programId,
        keys: [
          { pubkey: nativeVault, isSigner: false, isWritable: true },
          { pubkey: safe, isSigner: false, isWritable: true },
          { pubkey: safePolicy, isSigner: false, isWritable: false },
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(Uint8Array.from([...DISCRIMINATORS.fundNativeVault, ...u64ToLeBytes(deficit)])),
      })
    )
  }

  const nativeVaultFinal = await connection.getAccountInfo(nativeVault, 'confirmed')

  process.stdout.write(
    JSON.stringify(
      {
        challengeBondVault: challengeBondVault.toBase58(),
        nativeVault: nativeVault.toBase58(),
        nativeVaultLamports: nativeVaultFinal ? nativeVaultFinal.lamports : 0,
        targetLamports: targetLamports.toString(),
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
 )"
BOOTSTRAP_STATUS=$?
set -e

if [[ $BOOTSTRAP_STATUS -eq 0 ]]; then
  printf '%s\n' "$BOOTSTRAP_OUTPUT"
else
  echo "$BOOTSTRAP_OUTPUT" >&2
  echo "Error: safe-treasury primitive bootstrap failed on local validator." >&2
  echo "Hint: ensure SafePolicy is initialized on-chain for the authority in localnet/safe-policy-state.json" >&2
  exit 1
fi

echo ""
echo "[bootstrap-safe-treasury-primitives] complete"
