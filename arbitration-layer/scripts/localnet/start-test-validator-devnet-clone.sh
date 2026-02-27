#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SAFE_TREASURY_SO="$ARB_ROOT/programs/safe-treasury/target/deploy/safe_treasury.so"
SAFE_TREASURY_ID="9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD"

GOVERNANCE_ID="EvZSBRp7pJkRUqTtNU41C2gmBK9Cz35gh2oy42GKL7Ff"

if [[ ! -f "$SAFE_TREASURY_SO" ]]; then
  echo "Error: safe-treasury program not found at $SAFE_TREASURY_SO" >&2
  echo "Run: bash scripts/localnet/build-programs.sh" >&2
  exit 1
fi

echo "Starting solana-test-validator with programs:"
echo "  safe-treasury: $SAFE_TREASURY_ID (local)"
echo "  governance:    $GOVERNANCE_ID (cloned from devnet)"
echo ""
echo "RPC will be available at http://127.0.0.1:8899"
echo "Press Ctrl+C to stop"
echo ""

exec solana-test-validator \
  --bpf-program "$SAFE_TREASURY_ID" "$SAFE_TREASURY_SO" \
  --clone-upgradeable-program "$GOVERNANCE_ID" \
  --url devnet \
  --reset \
  --quiet
