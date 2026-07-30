#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${EAS_BUILD_PLATFORM:-}" in
  ios|android)
    "$SCRIPT_DIR/build-bindings.sh" "$EAS_BUILD_PLATFORM"
    ;;
  *)
    echo "EAS_BUILD_PLATFORM must be ios or android." >&2
    exit 1
    ;;
esac
