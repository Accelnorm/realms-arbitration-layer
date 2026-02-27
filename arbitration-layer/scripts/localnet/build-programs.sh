#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ARB_ROOT="$REPO_ROOT/arbitration-layer"
SAFE_TREASURY_MANIFEST="$ARB_ROOT/programs/safe-treasury/Cargo.toml"
GOVERNANCE_MANIFEST="$REPO_ROOT/governance/program/Cargo.toml"
SAFE_TREASURY_DIR="$ARB_ROOT/programs/safe-treasury"
GOVERNANCE_DIR="$REPO_ROOT/governance/program"

if ! command -v cargo >/dev/null 2>&1; then
  echo "Error: cargo is not available in PATH" >&2
  exit 1
fi

if ! cargo build-sbf --help >/dev/null 2>&1; then
  echo "Error: cargo build-sbf is unavailable. Install Solana toolchain first." >&2
  exit 1
fi

if [[ ! -f "$SAFE_TREASURY_MANIFEST" ]]; then
  echo "Error: missing $SAFE_TREASURY_MANIFEST" >&2
  exit 1
fi

if [[ ! -f "$GOVERNANCE_MANIFEST" ]]; then
  echo "Error: missing $GOVERNANCE_MANIFEST" >&2
  exit 1
fi

echo "[localnet] Building safe-treasury..."
(
  cd "$SAFE_TREASURY_DIR"
  cargo build-sbf --manifest-path "$SAFE_TREASURY_MANIFEST" --no-default-features
)

echo "[localnet] Building governance program..."
(
  cd "$GOVERNANCE_DIR"
  cargo build-sbf --manifest-path "$GOVERNANCE_MANIFEST"
)

echo "[localnet] Build complete. Expected artifacts:"
echo "  - $ARB_ROOT/programs/safe-treasury/target/deploy/safe_treasury.so"
echo "  - $REPO_ROOT/governance/program/target/deploy/spl_governance.so"
