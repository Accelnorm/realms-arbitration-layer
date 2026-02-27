#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Realms Arbitration Layer — Hackathon Demo Script
#
# Prerequisites:
#   1. solana-test-validator must be running (see step below).
#      Governance uses the mainnet-dumped binary (localnet/spl_governance_mainnet.so).
#      Do NOT use the locally-built spl-governance — it has an ABI mismatch with
#      Agave 2.2.12 and crashes on CreateRealm. See IMPORTANT-governance-abi-fix.md.
#
#   2. Program IDs:
#      safe-treasury:  9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD
#      spl-governance: GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw  (mainnet binary)
#
# Usage:
#   # Terminal 1 — start validator first (leave running):
#   bash arbitration-layer/scripts/localnet/start-local-validator.sh
#
#   # Terminal 2 — run demo:
#   bash demo-hackathon.sh
#
# Environment overrides:
#   RPC_URL=http://127.0.0.1:8899   (default)
#   INSTALL_DEPS=1                   set to install npm/uv deps automatically
#   BUILD_PROGRAMS=1                 set to rebuild safe-treasury before demo
#   BOOTSTRAP_DAOS=1                 set to re-run DAO bootstrap (safe to re-run)
#   RUN_MULTI_PARTY=1                set to also run multi-party demo scaffold
# ---------------------------------------------------------------------------

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$ROOT/arbitration-layer"

RPC_URL="${RPC_URL:-http://127.0.0.1:8899}"
INSTALL_DEPS="${INSTALL_DEPS:-0}"
BUILD_PROGRAMS="${BUILD_PROGRAMS:-0}"
BOOTSTRAP_DAOS="${BOOTSTRAP_DAOS:-1}"
RUN_MULTI_PARTY="${RUN_MULTI_PARTY:-1}"

SAFE_TREASURY_ID="9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD"
GOVERNANCE_ID="GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
GOVERNANCE_SO="$ARB_ROOT/localnet/spl_governance_mainnet.so"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: missing command '$1'" >&2
    exit 1
  }
}

for cmd in bash curl solana spl-token node npm; do
  need_cmd "$cmd"
done

echo "[demo] repo root:     $ROOT"
echo "[demo] rpc:           $RPC_URL"
echo "[demo] safe-treasury: $SAFE_TREASURY_ID"
echo "[demo] governance:    $GOVERNANCE_ID"
echo ""

# Verify mainnet governance binary exists
if [[ ! -f "$GOVERNANCE_SO" ]]; then
  echo "Error: mainnet governance binary not found at $GOVERNANCE_SO" >&2
  echo "Run: solana program dump --url mainnet-beta $GOVERNANCE_ID $GOVERNANCE_SO" >&2
  exit 1
fi

# Optionally build safe-treasury
if [[ "$BUILD_PROGRAMS" == "1" ]]; then
  echo "[demo] building safe-treasury"
  bash "$ARB_ROOT/scripts/localnet/build-programs.sh"
fi

# Install Node.js deps if requested
ensure_deps() {
  local dir="$1"
  local label="$2"
  if [[ -d "$dir/node_modules" ]]; then
    return
  fi
  if [[ "$INSTALL_DEPS" == "1" ]]; then
    echo "[demo] installing $label dependencies"
    npm --prefix "$dir" install
  else
    echo "Error: missing $label node_modules at $dir/node_modules" >&2
    echo "Run with INSTALL_DEPS=1 or: npm --prefix $dir install" >&2
    exit 1
  fi
}

ensure_deps "$ROOT/human-arbitration-dao" "human-arbitration-dao"
ensure_deps "$ROOT/governance-ui" "governance-ui"

# Install Python deps if requested
if [[ "$INSTALL_DEPS" == "1" ]]; then
  if command -v uv >/dev/null 2>&1; then
    echo "[demo] syncing ai-arbitration-dao python dependencies"
    uv sync --project "$ROOT/ai-arbitration-dao" --extra dev
  else
    echo "[demo] uv not found; skipping AI dependency sync"
  fi
fi

# Verify validator is running
if ! curl -sf -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null; then
  echo "Error: RPC not reachable at $RPC_URL" >&2
  echo ""
  echo "Start the validator first (in a separate terminal):"
  echo "  bash $ARB_ROOT/scripts/localnet/start-local-validator.sh"
  exit 1
fi

echo "[demo] validator healthy at $RPC_URL"

# Bootstrap DAOs (creates real on-chain realm + governance accounts)
if [[ "$BOOTSTRAP_DAOS" == "1" ]]; then
  echo "[demo] bootstrapping three DAOs (TestDAO, AIArbitrationDAO, HumanArbitrationDAO)"
  GOVERNANCE_PROGRAM_ID="$GOVERNANCE_ID" \
  LOCAL_RPC_URL="$RPC_URL" \
    bash "$ARB_ROOT/scripts/localnet/bootstrap-three-daos.sh"
fi

# Seed UI fixtures (challenge token mint, SafePolicy, Queued payout)
echo "[demo] seeding UI fixtures"
LOCAL_RPC_URL="$RPC_URL" \
  bash "$ARB_ROOT/scripts/localnet/seed-ui-fixtures.sh"

# One-time safe-treasury vault setup
echo "[demo] initializing safe-treasury primitives (bond vault + native vault)"
LOCAL_RPC_URL="$RPC_URL" \
  bash "$ARB_ROOT/scripts/localnet/bootstrap-safe-treasury-primitives.sh"

# Run ruling enforcement demos
echo "[demo] running human + ai ruling enforcement demo"
LOCAL_RPC_URL="$RPC_URL" \
PREP_LOCALNET=0 \
  bash "$ARB_ROOT/scripts/localnet/run-human-ai-ruling-enforcement-demo.sh"

if [[ "$RUN_MULTI_PARTY" == "1" ]]; then
  echo "[demo] running multi-party scaffold demo"
  LOCAL_RPC_URL="$RPC_URL" \
    bash "$ARB_ROOT/scripts/localnet/run-multi-party-ruling-demo.sh"
fi

echo ""
echo "================================================================"
echo "[demo] SUCCESS"
echo "================================================================"
echo ""
echo "Artifacts:"
echo "  DAO state:        $ARB_ROOT/localnet/dao-state.json"
echo "  Safe policy:      $ARB_ROOT/localnet/safe-policy-state.json"
echo "  Payout fixtures:  $ARB_ROOT/localnet/payout-fixtures.json"
echo "  UI context:       $ARB_ROOT/localnet/ui-agent-context.json"
echo "  Human/AI report:  $ARB_ROOT/localnet/human-ai-ruling-demo-report.json"
if [[ "$RUN_MULTI_PARTY" == "1" ]]; then
  echo "  Multi-party:      $ARB_ROOT/localnet/multi-party-ruling-demo-report.json"
fi
echo ""
echo "To start the governance UI:"
echo "  npm --prefix $ROOT/governance-ui run dev"
echo ""
echo "UI will be available at http://localhost:3000"
echo "Realms governance program: $GOVERNANCE_ID"
echo "Safe-treasury program:     $SAFE_TREASURY_ID"
