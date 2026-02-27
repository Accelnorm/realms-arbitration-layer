#!/usr/bin/env bash
set -euo pipefail

CONF_PATH="${1:-conf/Smoke.conf}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTORA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROGRAM_DIR="${CERTORA_DIR}/../programs/safe-treasury"

if ! command -v certoraSolanaProver >/dev/null 2>&1; then
  echo "error: certoraSolanaProver not found in PATH" >&2
  exit 1
fi

if [ ! -f "${CERTORA_DIR}/${CONF_PATH}" ]; then
  echo "error: config file not found: ${CERTORA_DIR}/${CONF_PATH}" >&2
  exit 1
fi

echo "Running Certora with ${CONF_PATH}"
cd "${PROGRAM_DIR}"
certoraSolanaProver "${CERTORA_DIR}/${CONF_PATH}"
