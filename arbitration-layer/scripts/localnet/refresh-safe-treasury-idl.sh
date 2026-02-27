#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROGRAM_DIR="$ARB_ROOT/programs/safe-treasury"
OUT_IDL_PATH="${SAFE_TREASURY_IDL_OUT:-$ARB_ROOT/target/idl/safe_treasury.json}"
PROGRAM_ID="${SAFE_TREASURY_PROGRAM_ID:-9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD}"

if ! command -v anchor >/dev/null 2>&1; then
  echo "Error: anchor CLI not found in PATH" >&2
  exit 1
fi

if [[ ! -d "$PROGRAM_DIR" ]]; then
  echo "Error: program dir not found at $PROGRAM_DIR" >&2
  exit 1
fi

TMP_WS="$(mktemp -d /tmp/safe-idl-workspace-XXXXXX)"
cleanup() {
  rm -rf "$TMP_WS"
}
trap cleanup EXIT

mkdir -p "$TMP_WS/programs"
ln -s "$PROGRAM_DIR" "$TMP_WS/programs/safe-treasury"

cat > "$TMP_WS/Anchor.toml" <<TOML
[workspace]
members = ["programs/safe-treasury"]

[programs.localnet]
safe_treasury = "$PROGRAM_ID"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"
TOML

mkdir -p "$(dirname "$OUT_IDL_PATH")"
(
  cd "$TMP_WS"
  anchor idl build -p safe_treasury --out "$OUT_IDL_PATH"
)

echo "Wrote IDL: $OUT_IDL_PATH"
