#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SAFE_TREASURY_SO="$ARB_ROOT/programs/safe-treasury/target/deploy/safe_treasury.so"
SAFE_TREASURY_ID="9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD"

# Use the mainnet-dumped governance binary to avoid ABI mismatch.
# The local build (solana-program 1.14.6 + modern cargo build-sbf) produces a
# binary that crashes with "Access violation" on CreateRealm CPI.
GOVERNANCE_SO="$ARB_ROOT/localnet/spl_governance_mainnet.so"
GOVERNANCE_ID="GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"

if [[ ! -f "$SAFE_TREASURY_SO" ]]; then
  echo "Error: safe-treasury program not found at $SAFE_TREASURY_SO" >&2
  echo "Run: bash scripts/localnet/build-programs.sh" >&2
  exit 1
fi

if [[ ! -f "$GOVERNANCE_SO" ]]; then
  echo "Error: governance program not found at $GOVERNANCE_SO" >&2
  echo "Run: solana program dump --url mainnet-beta $GOVERNANCE_ID $GOVERNANCE_SO" >&2
  exit 1
fi

echo "Starting solana-test-validator with programs:"
echo "  safe-treasury: $SAFE_TREASURY_ID"
echo "  governance:    $GOVERNANCE_ID"
echo ""
echo "RPC will be available at http://127.0.0.1:8899"
echo "Press Ctrl+C to stop"
echo ""

exec solana-test-validator \
  --bpf-program "$SAFE_TREASURY_ID" "$SAFE_TREASURY_SO" \
  --bpf-program "$GOVERNANCE_ID" "$GOVERNANCE_SO" \
  --reset \
  --quiet
