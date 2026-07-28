#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$MODULE_DIR/../../.." && pwd)"
PLATFORM="${1:-all}"

"$SCRIPT_DIR/generate-bindings.sh"

case "$PLATFORM" in
  ios)
    "$SCRIPT_DIR/build-ios.sh"
    ;;
  android)
    "$SCRIPT_DIR/build-android.sh"
    ;;
  all)
    "$SCRIPT_DIR/build-ios.sh"
    "$SCRIPT_DIR/build-android.sh"
    ;;
  *)
    echo "Usage: $0 [ios|android|all]" >&2
    exit 1
    ;;
esac

if git -C "$REPO_ROOT" ls-files \
  'my-reader-mobile/modules/my-reader-core/**/*.a' \
  'my-reader-mobile/modules/my-reader-core/**/*.so' \
  'my-reader-mobile/modules/my-reader-core/**/*.dylib' |
  grep -q .; then
  echo "Precompiled Rust libraries must not be tracked by Git." >&2
  exit 1
fi
