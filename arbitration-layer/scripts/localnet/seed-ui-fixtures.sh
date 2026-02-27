#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RPC_URL="${LOCAL_RPC_URL:-${SURFPOOL_RPC_URL:-http://127.0.0.1:8899}}"
SAFE_TREASURY_PROGRAM_ID="${SAFE_TREASURY_PROGRAM_ID:-9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD}"
AUTHORITY_KEYPAIR="${LOCAL_AUTHORITY_KEYPAIR:-$HOME/.config/solana/id.json}"

DAO_STATE_PATH="${DAO_STATE_PATH:-$ARB_ROOT/localnet/dao-state.json}"
SAFE_POLICY_STATE_PATH="${SAFE_POLICY_STATE_PATH:-$ARB_ROOT/localnet/safe-policy-state.json}"
PAYOUT_FIXTURES_PATH="${PAYOUT_FIXTURES_PATH:-$ARB_ROOT/localnet/payout-fixtures.json}"

if ! command -v spl-token >/dev/null 2>&1; then
  echo "Error: spl-token CLI not found in PATH" >&2
  exit 1
fi

if ! command -v solana >/dev/null 2>&1; then
  echo "Error: solana CLI not found in PATH" >&2
  exit 1
fi

if [[ ! -f "$AUTHORITY_KEYPAIR" ]]; then
  echo "Error: authority keypair file not found at $AUTHORITY_KEYPAIR" >&2
  exit 1
fi

# Ensure local validator RPC is up.
HEALTH_PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
if ! curl -s -X POST "$RPC_URL" -H 'Content-Type: application/json' -d "$HEALTH_PAYLOAD" >/dev/null; then
  echo "Error: local validator RPC is not reachable at $RPC_URL" >&2
  exit 1
fi

# Fund authority wallet on local validator endpoint.
solana airdrop 100 --url "$RPC_URL" --keypair "$AUTHORITY_KEYPAIR" >/dev/null || true

AUTHORITY_PUBKEY="$(solana address --keypair "$AUTHORITY_KEYPAIR")"
SAFE_PUBKEY="$AUTHORITY_PUBKEY"
SAFE_POLICY_AUTHORITY="$AUTHORITY_PUBKEY"

SAFE_POLICY_JSON="$(solana find-program-derived-address --output json "$SAFE_TREASURY_PROGRAM_ID" "string:safe_policy" "pubkey:$SAFE_POLICY_AUTHORITY")"
SAFE_POLICY_PUBKEY="$(python3 - <<'PY' "$SAFE_POLICY_JSON"
import json, sys
print(json.loads(sys.argv[1])["address"])
PY
)"

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
    # Anchor account layout: 8-byte discriminator + fields.
    # eligibility_mint starts at offset 88.
    if len(raw) < 120:
        print("")
        raise SystemExit(0)
    print(b58encode(raw[88:120]))
except Exception:
    print("")
PY
)"

EXISTING_ELIGIBILITY_MINT="$(python3 - <<'PY' "$SAFE_POLICY_STATE_PATH"
import json,sys
try:
    obj=json.load(open(sys.argv[1],'r',encoding='utf-8'))
except Exception:
    print('')
    raise SystemExit(0)
print(obj.get('eligibilityMint',''))
PY
)"

# Reuse on-chain eligibility mint when SafePolicy already exists to avoid snapshot mismatch.
CHALLENGE_TOKEN_MINT="$ONCHAIN_ELIGIBILITY_MINT"
if [[ -z "$CHALLENGE_TOKEN_MINT" ]]; then
  CHALLENGE_TOKEN_MINT="$EXISTING_ELIGIBILITY_MINT"
fi

if [[ -n "$CHALLENGE_TOKEN_MINT" ]]; then
  MINT_EXISTS="$(python3 - <<'PY' "$RPC_URL" "$CHALLENGE_TOKEN_MINT"
import json,sys,urllib.request
rpc_url,mint=sys.argv[1],sys.argv[2]
payload={
  "jsonrpc":"2.0",
  "id":1,
  "method":"getAccountInfo",
  "params":[mint,{"encoding":"base64"}],
}
try:
    req=urllib.request.Request(
        rpc_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type":"application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data=json.loads(resp.read().decode("utf-8"))
    print("yes" if (data.get("result") or {}).get("value") else "")
except Exception:
    print("")
PY
)"
  if [[ -z "$MINT_EXISTS" ]]; then
    echo "Warning: eligibility mint $CHALLENGE_TOKEN_MINT not found on current RPC; creating a new mint." >&2
    CHALLENGE_TOKEN_MINT=""
  fi
fi

if [[ -z "$CHALLENGE_TOKEN_MINT" ]]; then
  MINT_OUTPUT="$(spl-token --url "$RPC_URL" create-token --decimals 0)"
  CHALLENGE_TOKEN_MINT="$(printf '%s\n' "$MINT_OUTPUT" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' | head -n1)"
  if [[ -z "$CHALLENGE_TOKEN_MINT" ]]; then
    echo "Error: failed to parse challenge token mint address" >&2
    echo "$MINT_OUTPUT" >&2
    exit 1
  fi
fi

TOKEN_ACCOUNT_OUTPUT="$(spl-token --url "$RPC_URL" create-account "$CHALLENGE_TOKEN_MINT" 2>/dev/null || true)"
if [[ -n "$TOKEN_ACCOUNT_OUTPUT" ]]; then
  CHALLENGER_TOKEN_ACCOUNT="$(printf '%s\n' "$TOKEN_ACCOUNT_OUTPUT" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' | head -n1)"
else
  TOKEN_ACCOUNTS_JSON="$(spl-token --url "$RPC_URL" accounts --owner "$AUTHORITY_PUBKEY" --output json)"
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
fi
if [[ -z "$CHALLENGER_TOKEN_ACCOUNT" ]]; then
  echo "Error: failed to resolve challenger token account for mint $CHALLENGE_TOKEN_MINT" >&2
  if [[ -n "$TOKEN_ACCOUNT_OUTPUT" ]]; then
    echo "$TOKEN_ACCOUNT_OUTPUT" >&2
  fi
  exit 1
fi

spl-token --url "$RPC_URL" mint "$CHALLENGE_TOKEN_MINT" 10 "$CHALLENGER_TOKEN_ACCOUNT" >/dev/null

SAFE_POLICY_BUMP="$(python3 - <<'PY' "$SAFE_POLICY_JSON"
import json, sys
print(json.loads(sys.argv[1])["bumpSeed"])
PY
)"

PAYOUT_JSON="$(solana find-program-derived-address --output json "$SAFE_TREASURY_PROGRAM_ID" "string:payout" "pubkey:$SAFE_PUBKEY" "u64le:0")"
PAYOUT_PUBKEY="$(python3 - <<'PY' "$PAYOUT_JSON"
import json, sys
print(json.loads(sys.argv[1])["address"])
PY
)"
PAYOUT_BUMP="$(python3 - <<'PY' "$PAYOUT_JSON"
import json, sys
print(json.loads(sys.argv[1])["bumpSeed"])
PY
)"

python3 - "$RPC_URL" "$SAFE_TREASURY_PROGRAM_ID" "$AUTHORITY_PUBKEY" "$SAFE_POLICY_AUTHORITY" "$SAFE_PUBKEY" "$SAFE_POLICY_PUBKEY" "$SAFE_POLICY_BUMP" "$PAYOUT_PUBKEY" "$PAYOUT_BUMP" "$CHALLENGE_TOKEN_MINT" "$DAO_STATE_PATH" "$SAFE_POLICY_STATE_PATH" "$PAYOUT_FIXTURES_PATH" <<'PY'
import hashlib
import json
import struct
import sys
import time
import urllib.request
from pathlib import Path

(
    rpc_url,
    program_id,
    authority,
    safe_policy_authority,
    safe,
    safe_policy,
    safe_policy_bump,
    payout,
    payout_bump,
    challenge_mint,
    dao_state_path,
    safe_policy_state_path,
    payout_fixtures_path,
) = sys.argv[1:]

safe_policy_bump = int(safe_policy_bump)
payout_bump = int(payout_bump)

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58decode(value: str) -> bytes:
    num = 0
    for ch in value:
        num = num * 58 + ALPHABET.index(ch)
    raw = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    n_pad = len(value) - len(value.lstrip("1"))
    decoded = (b"\x00" * n_pad) + raw
    if len(decoded) > 32:
        raise ValueError(f"base58 value too long for pubkey: {value}")
    return decoded.rjust(32, b"\x00")


def discr(name: str) -> bytes:
    return hashlib.sha256(f"account:{name}".encode()).digest()[:8]


def u64(v: int) -> bytes:
    return struct.pack("<Q", v)


def i64(v: int) -> bytes:
    return struct.pack("<q", v)


def u8(v: int) -> bytes:
    return struct.pack("<B", v)


def boolb(v: bool) -> bytes:
    return b"\x01" if v else b"\x00"


def option_pubkey(value: str | None) -> bytes:
    if value is None:
        return b"\x00"
    return b"\x01" + b58decode(value)


def option_hash32(value: bytes | None) -> bytes:
    if value is None:
        return b"\x00"
    if len(value) != 32:
        raise ValueError("hash32 must be 32 bytes")
    return b"\x01" + value


def option_u8(value: int | None) -> bytes:
    if value is None:
        return b"\x00"
    return b"\x01" + u8(value)


def safe_policy_bytes(*, payout_count: int) -> bytes:
    return b"".join(
        [
            b58decode(safe_policy_authority),
            b58decode(authority),
            u64(86400),
            u64(10_000_000),
            b58decode(challenge_mint),
            u64(1),
            u8(2),
            u64(3600),
            u8(2),
            bytes(32),
            boolb(False),
            boolb(True),
            boolb(False),
            u64(payout_count),
            u8(safe_policy_bump),
        ]
    )


# queue_payout payout_id formula mirrors on-chain helper: sha256 over
# [safe_policy, asset_type, recipient, amount, optional mint, optional metadata].
def compute_payout_id() -> int:
    payload = b"".join(
        [
            b58decode(safe_policy),
            u8(0),  # AssetType::Native
            b58decode(authority),
            u64(1_000_000),
        ]
    )
    digest = hashlib.sha256(payload).digest()
    return int.from_bytes(digest[:8], "little")


def payout_bytes() -> bytes:
    deadline = int(time.time()) + 86400
    return b"".join(
        [
            u64(compute_payout_id()),
            u64(0),  # payout_index
            b58decode(safe),
            u8(0),  # AssetType::Native
            option_pubkey(None),
            b58decode(authority),
            u64(1_000_000),
            option_hash32(None),
            u8(0),  # Queued
            i64(deadline),
            safe_policy_bytes(payout_count=0),  # snapshot pre-increment
            option_pubkey(None),
            u8(0),  # dispute_round
            boolb(False),
            option_u8(None),
            u8(payout_bump),
        ]
    )


# Note: test-validator doesn't support runtime account injection.
# Fixture files will reference deterministic PDAs that can be initialized via program instructions.

Path(dao_state_path).write_text(
    json.dumps(
        (
            lambda existing: {
                **(
                    {"governanceProgramId": existing.get("governanceProgramId")}
                    if existing.get("governanceProgramId")
                    else {}
                ),
                "testDao": {
                    **existing.get("testDao", {}),
                    "realm": existing.get("testDao", {}).get("realm") or authority,
                    "governance": existing.get("testDao", {}).get("governance") or authority,
                    "challengeTokenMint": challenge_mint,
                },
                "aiArbitrationDao": {
                    **existing.get("aiArbitrationDao", {}),
                    "realm": existing.get("aiArbitrationDao", {}).get("realm"),
                    "governance": existing.get("aiArbitrationDao", {}).get("governance"),
                },
                "humanArbitrationDao": {
                    **existing.get("humanArbitrationDao", {}),
                    "realm": existing.get("humanArbitrationDao", {}).get("realm"),
                    "governance": existing.get("humanArbitrationDao", {}).get("governance"),
                },
            }
        )(
            json.loads(Path(dao_state_path).read_text(encoding="utf-8"))
            if Path(dao_state_path).exists()
            else {}
        ),
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

Path(safe_policy_state_path).write_text(
    json.dumps(
        {
            "safe": safe,
            "safePolicy": safe_policy,
            "authority": safe_policy_authority,
            "resolver": authority,
            "challengeBondLamports": 10_000_000,
            "disputeWindowSeconds": 86400,
            "eligibilityMint": challenge_mint,
            "minTokenBalance": 1,
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

Path(payout_fixtures_path).write_text(
    json.dumps(
        {
            "queuedPayout": {
                "payout": payout,
                "safe": safe,
                "safePolicy": safe_policy,
                "payoutId": str(compute_payout_id()),
                "payoutIndex": 0,
                "status": "Queued",
                "assetType": "Native",
                "recipient": authority,
                "amount": "1000000",
            }
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

print("Wrote fixture files:")
print(f"- {dao_state_path}")
print(f"- {safe_policy_state_path}")
print(f"- {payout_fixtures_path}")
print("\nKey values:")
print(f"challengeTokenMint={challenge_mint}")
print(f"safePolicy={safe_policy}")
print(f"queuedPayout={payout}")
PY

bash "$SCRIPT_DIR/export-ui-agent-input.sh"
