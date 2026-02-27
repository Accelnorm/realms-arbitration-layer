#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RPC_URL="${LOCAL_RPC_URL:-${SURFPOOL_RPC_URL:-http://127.0.0.1:8899}}"
SKIP_GOVERNANCE_INSTRUCTIONS="${SKIP_GOVERNANCE_INSTRUCTIONS:-0}"
# Default to the mainnet Realms governance program (used by realms.today).
# Override with GOVERNANCE_PROGRAM_ID env var for custom deployments.
GOVERNANCE_PROGRAM_ID="${GOVERNANCE_PROGRAM_ID:-GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw}"
GOVERNANCE_PROGRAM_KEYPAIR="${GOVERNANCE_PROGRAM_KEYPAIR:-$ARB_ROOT/../governance/program/target/deploy/spl_governance-keypair.json}"
GOVERNANCE_PROGRAM_SO="${GOVERNANCE_PROGRAM_SO:-$ARB_ROOT/../governance/program/target/deploy/spl_governance.so}"
DAO_STATE_PATH="${DAO_STATE_PATH:-$ARB_ROOT/localnet/dao-state.json}"
SOLANA_WALLET_PATH="${SOLANA_WALLET_PATH:-${SOLANA_WALLET:-$HOME/.config/solana/id.json}}"
GOVERNANCE_NODE_MODULES_DIR="${GOVERNANCE_NODE_MODULES_DIR:-$ARB_ROOT/../human-arbitration-dao/node_modules}"

if ! command -v solana >/dev/null 2>&1; then
  echo "Error: solana CLI not found in PATH" >&2
  exit 1
fi

if ! command -v spl-token >/dev/null 2>&1; then
  echo "Error: spl-token CLI not found in PATH" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node not found in PATH" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 not found in PATH" >&2
  exit 1
fi

echo "Using governance program: $GOVERNANCE_PROGRAM_ID"

if [[ ! -f "$SOLANA_WALLET_PATH" ]]; then
  echo "Error: wallet keypair not found at $SOLANA_WALLET_PATH" >&2
  exit 1
fi

if [[ ! -f "$GOVERNANCE_NODE_MODULES_DIR/@solana/spl-governance/package.json" ]]; then
  echo "Error: @solana/spl-governance not found under $GOVERNANCE_NODE_MODULES_DIR" >&2
  echo "Install dependencies in human-arbitration-dao first (npm install)." >&2
  exit 1
fi

if ! curl -s -X POST "$RPC_URL" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null; then
  echo "Error: local validator RPC is not reachable at $RPC_URL" >&2
  exit 1
fi

# In point-fork mode, the local validator lazily fetches the mainnet governance program.
# Verify it's accessible (may take a moment on first fetch).
echo "Verifying governance program is accessible on $RPC_URL..."
GOVERNANCE_ACCESSIBLE=0
for _try in 1 2 3 4 5; do
  if solana account --url "$RPC_URL" "$GOVERNANCE_PROGRAM_ID" >/dev/null 2>&1; then
    echo "Governance program $GOVERNANCE_PROGRAM_ID confirmed."
    GOVERNANCE_ACCESSIBLE=1
    break
  fi
  sleep 2
done

if [[ $GOVERNANCE_ACCESSIBLE -ne 1 ]]; then
  echo "Warning: governance program $GOVERNANCE_PROGRAM_ID not accessible after retries." >&2
  echo "Proceeding with fallback account seeding for local UI fixtures." >&2
fi

create_mint() {
  local label="$1"
  local mint_output
  local mint_address

  mint_output="$(spl-token --url "$RPC_URL" create-token --decimals 0)"
  mint_address="$(printf '%s\n' "$mint_output" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' | head -n1)"

  if [[ -z "$mint_address" ]]; then
    echo "Error: failed to parse mint address for $label" >&2
    echo "$mint_output" >&2
    exit 1
  fi

  echo "$mint_address"
}

TEST_REALM_NAME="TestDAO"
AI_REALM_NAME="AIArbitrationDAO"
HUMAN_REALM_NAME="HumanArbitrationDAO"

# Create/refresh mints used to initialize realm community governance and UI challenge flow.
CHALLENGE_TOKEN_MINT="$(create_mint "test-challenge")"
AI_COMMUNITY_MINT="$(create_mint "ai-community")"
HUMAN_COMMUNITY_MINT="$(create_mint "human-community")"

set +e
DAO_BOOTSTRAP_JSON=""
NODE_STATUS=1

if [[ "$SKIP_GOVERNANCE_INSTRUCTIONS" != "1" ]]; then
  DAO_BOOTSTRAP_JSON="$(
    NODE_PATH="$GOVERNANCE_NODE_MODULES_DIR" \
      node - "$RPC_URL" "$SOLANA_WALLET_PATH" "$GOVERNANCE_PROGRAM_ID" "$TEST_REALM_NAME" "$CHALLENGE_TOKEN_MINT" "$AI_REALM_NAME" "$AI_COMMUNITY_MINT" "$HUMAN_REALM_NAME" "$HUMAN_COMMUNITY_MINT" <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
const BN = require('bn.js');
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  GovernanceConfig,
  MintMaxVoteWeightSource,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  withCreateGovernance,
  withCreateRealm,
} = require('@solana/spl-governance');

const [
  rpcUrl,
  walletPathRaw,
  governanceProgramIdRaw,
  testRealmName,
  testCommunityMintRaw,
  aiRealmName,
  aiCommunityMintRaw,
  humanRealmName,
  humanCommunityMintRaw,
] = process.argv.slice(2);

const PROGRAM_VERSION = 3;

function resolvePath(inputPath) {
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function loadKeypair(walletPath) {
  const secret = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function deriveRealmAddress(programId, name) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('governance'), Buffer.from(name, 'utf8')],
    programId
  )[0];
}

function deriveGovernanceAddress(programId, realm, governedAccount) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('account-governance'), realm.toBuffer(), governedAccount.toBuffer()],
    programId
  )[0];
}

function buildGovernanceConfig() {
  return new GovernanceConfig({
    communityVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 60,
    }),
    minCommunityTokensToCreateProposal: new BN(1),
    minInstructionHoldUpTime: 0,
    baseVotingTime: 3600,
    communityVoteTipping: VoteTipping.Disabled,
    minCouncilTokensToCreateProposal: new BN(1),
    councilVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 60,
    }),
    councilVetoVoteThreshold: new VoteThreshold({ type: VoteThresholdType.Disabled }),
    communityVetoVoteThreshold: new VoteThreshold({ type: VoteThresholdType.Disabled }),
    councilVoteTipping: VoteTipping.Disabled,
    votingCoolOffTime: 0,
    depositExemptProposalCount: 10,
  });
}

async function sendInstructions(connection, payer, instructions) {
  if (instructions.length === 0) {
    return;
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({
    feePayer: payer.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(...instructions);

  await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

async function ensureDao(connection, payer, programId, realmName, communityMint) {
  const realm = deriveRealmAddress(programId, realmName);
  const governance = deriveGovernanceAddress(programId, realm, realm);

  let createdRealm = false;
  let createdGovernance = false;

  const realmAccount = await connection.getAccountInfo(realm, 'confirmed');
  if (!realmAccount) {
    const instructions = [];
    await withCreateRealm(
      instructions,
      programId,
      PROGRAM_VERSION,
      realmName,
      payer.publicKey,
      communityMint,
      payer.publicKey,
      undefined,
      MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
      new BN(1)
    );
    await sendInstructions(connection, payer, instructions);
    createdRealm = true;
  }

  const governanceAccount = await connection.getAccountInfo(governance, 'confirmed');
  if (!governanceAccount) {
    const instructions = [];
    await withCreateGovernance(
      instructions,
      programId,
      PROGRAM_VERSION,
      realm,
      realm,
      buildGovernanceConfig(),
      PublicKey.default,
      payer.publicKey,
      payer.publicKey
    );
    await sendInstructions(connection, payer, instructions);
    createdGovernance = true;
  }

  return {
    realmName,
    realm: realm.toBase58(),
    governance: governance.toBase58(),
    createdRealm,
    createdGovernance,
  };
}

async function main() {
  const connection = new Connection(rpcUrl, 'confirmed');
  const walletPath = resolvePath(walletPathRaw);
  const payer = loadKeypair(walletPath);
  const governanceProgramId = new PublicKey(governanceProgramIdRaw);

  const result = {
    testDao: await ensureDao(
      connection,
      payer,
      governanceProgramId,
      testRealmName,
      new PublicKey(testCommunityMintRaw)
    ),
    aiArbitrationDao: await ensureDao(
      connection,
      payer,
      governanceProgramId,
      aiRealmName,
      new PublicKey(aiCommunityMintRaw)
    ),
    humanArbitrationDao: await ensureDao(
      connection,
      payer,
      governanceProgramId,
      humanRealmName,
      new PublicKey(humanCommunityMintRaw)
    ),
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
)"
  NODE_STATUS=$?
fi
set -e

if [[ $NODE_STATUS -ne 0 || -z "$DAO_BOOTSTRAP_JSON" ]]; then
  echo "Warning: governance instruction bootstrap failed; using local fixture account fallback." >&2

  derive_pda() {
    local program_id="$1"
    shift
    local out
    out="$(solana find-program-derived-address --output json "$program_id" "$@")"
    python3 - <<'PY' "$out"
import json,sys
print(json.loads(sys.argv[1])["address"])
PY
  }

  surfnet_set_account() {
    local address="$1"
    local owner="$2"
    local lamports="$3"
    local data_hex="$4"
    local payload
    payload="$(python3 - <<'PY' "$address" "$owner" "$lamports" "$data_hex"
import json,sys
addr, owner, lamports, data_hex = sys.argv[1:]
print(json.dumps({
  "jsonrpc": "2.0",
  "id": 1,
  "method": "surfnet_setAccount",
  "params": [
    addr,
    {
      "lamports": int(lamports),
      "owner": owner,
      "data": data_hex,
      "executable": False,
    },
  ],
}))
PY
)"
    curl -s -X POST "$RPC_URL" -H 'Content-Type: application/json' -d "$payload" >/dev/null
  }

  TEST_REALM="$(derive_pda "$GOVERNANCE_PROGRAM_ID" "string:governance" "string:$TEST_REALM_NAME")"
  AI_REALM="$(derive_pda "$GOVERNANCE_PROGRAM_ID" "string:governance" "string:$AI_REALM_NAME")"
  HUMAN_REALM="$(derive_pda "$GOVERNANCE_PROGRAM_ID" "string:governance" "string:$HUMAN_REALM_NAME")"

  TEST_GOVERNANCE="$(derive_pda "$GOVERNANCE_PROGRAM_ID" "string:account-governance" "pubkey:$TEST_REALM" "pubkey:$TEST_REALM")"
  AI_GOVERNANCE="$(derive_pda "$GOVERNANCE_PROGRAM_ID" "string:account-governance" "pubkey:$AI_REALM" "pubkey:$AI_REALM")"
  HUMAN_GOVERNANCE="$(derive_pda "$GOVERNANCE_PROGRAM_ID" "string:account-governance" "pubkey:$HUMAN_REALM" "pubkey:$HUMAN_REALM")"

  # Minimal non-empty account payloads so getAccountInfo resolves for UI/dev scripts.
  surfnet_set_account "$TEST_REALM" "$GOVERNANCE_PROGRAM_ID" 3000000 "00"
  surfnet_set_account "$AI_REALM" "$GOVERNANCE_PROGRAM_ID" 3000000 "00"
  surfnet_set_account "$HUMAN_REALM" "$GOVERNANCE_PROGRAM_ID" 3000000 "00"
  surfnet_set_account "$TEST_GOVERNANCE" "$GOVERNANCE_PROGRAM_ID" 3000000 "00"
  surfnet_set_account "$AI_GOVERNANCE" "$GOVERNANCE_PROGRAM_ID" 3000000 "00"
  surfnet_set_account "$HUMAN_GOVERNANCE" "$GOVERNANCE_PROGRAM_ID" 3000000 "00"

  DAO_BOOTSTRAP_JSON="$(python3 - <<'PY' "$TEST_REALM" "$TEST_GOVERNANCE" "$AI_REALM" "$AI_GOVERNANCE" "$HUMAN_REALM" "$HUMAN_GOVERNANCE" "$TEST_REALM_NAME" "$AI_REALM_NAME" "$HUMAN_REALM_NAME"
import json,sys
test_realm, test_gov, ai_realm, ai_gov, human_realm, human_gov, test_name, ai_name, human_name = sys.argv[1:]
print(json.dumps({
  "testDao": {
    "realmName": test_name,
    "realm": test_realm,
    "governance": test_gov,
    "createdRealm": False,
    "createdGovernance": False,
  },
  "aiArbitrationDao": {
    "realmName": ai_name,
    "realm": ai_realm,
    "governance": ai_gov,
    "createdRealm": False,
    "createdGovernance": False,
  },
  "humanArbitrationDao": {
    "realmName": human_name,
    "realm": human_realm,
    "governance": human_gov,
    "createdRealm": False,
    "createdGovernance": False,
  },
}))
PY
)"
fi

python3 - "$DAO_STATE_PATH" "$GOVERNANCE_PROGRAM_ID" "$CHALLENGE_TOKEN_MINT" "$DAO_BOOTSTRAP_JSON" <<'PY'
import json
import sys
from pathlib import Path

(
    out_path,
    governance_program_id,
    challenge_token_mint,
    dao_bootstrap_json,
) = sys.argv[1:]

dao = json.loads(dao_bootstrap_json)

payload = {
    "governanceProgramId": governance_program_id,
    "testDao": {
        "realmName": dao["testDao"]["realmName"],
        "realm": dao["testDao"]["realm"],
        "governance": dao["testDao"]["governance"],
        "challengeTokenMint": challenge_token_mint,
    },
    "aiArbitrationDao": {
        "realmName": dao["aiArbitrationDao"]["realmName"],
        "realm": dao["aiArbitrationDao"]["realm"],
        "governance": dao["aiArbitrationDao"]["governance"],
    },
    "humanArbitrationDao": {
        "realmName": dao["humanArbitrationDao"]["realmName"],
        "realm": dao["humanArbitrationDao"]["realm"],
        "governance": dao["humanArbitrationDao"]["governance"],
    },
}

path = Path(out_path)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(f"Wrote DAO bootstrap state: {path}")
print(json.dumps(payload, indent=2))
PY
