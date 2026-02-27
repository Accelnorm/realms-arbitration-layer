#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEFAULT_MANIFEST="$ARB_ROOT/localnet/Surfpool.toml"

MANIFEST_PATH="${SURFPOOL_MANIFEST_PATH:-$DEFAULT_MANIFEST}"
if [[ -n "${1:-}" && "${1:0:1}" != "-" ]]; then
  MANIFEST_PATH="$1"
  shift
fi

if ! command -v surfpool >/dev/null 2>&1; then
  echo "Error: surfpool CLI not found in PATH" >&2
  echo "Install instructions: curl -sL https://run.surfpool.run/ | bash" >&2
  exit 1
fi

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "Error: Surfpool manifest not found at $MANIFEST_PATH" >&2
  exit 1
fi

EXTRA_ARGS=("$@")
START_ARGS=(-m "$MANIFEST_PATH")
if [[ "${SURFPOOL_NO_TUI:-1}" == "1" ]]; then
  START_ARGS+=(--no-tui)
fi
if [[ "${SURFPOOL_NO_DEPLOY:-1}" == "1" ]]; then
  START_ARGS+=(--no-deploy)
fi
START_ARGS+=("${EXTRA_ARGS[@]}")

echo "Starting Surfpool with manifest: $MANIFEST_PATH"
set +e
surfpool start "${START_ARGS[@]}"
STATUS=$?
set -e

if [[ $STATUS -ne 0 ]]; then
  echo "Surfpool exited with status $STATUS" >&2
  echo "Diagnostic: surfpool ls" >&2
  surfpool ls 2>&1 || true
  echo "Hint: a malformed txtx.yml in the workspace can cause immediate exit." >&2
  exit $STATUS
fi
