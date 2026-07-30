#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(dirname "$SCRIPT_DIR")"
MOBILE_DIR="$(cd "$MODULE_DIR/../.." && pwd)"
NODE_BINARY="${NODE_BINARY:-node}"
PLATFORM="${1:-all}"
UBRN_CLI="$MOBILE_DIR/node_modules/uniffi-bindgen-react-native/bin/cli.cjs"

NODE_EXECUTABLE="$(command -v "$NODE_BINARY" 2>/dev/null || true)"
if [[ -n "$NODE_EXECUTABLE" ]]; then
  export PATH="$(dirname "$NODE_EXECUTABLE"):$PATH"
fi

if ! command -v clang-format >/dev/null 2>&1 && command -v xcrun >/dev/null 2>&1; then
  CLANG_FORMAT="$(xcrun --find clang-format 2>/dev/null || true)"
  if [[ -x "$CLANG_FORMAT" ]]; then
    export PATH="$(dirname "$CLANG_FORMAT"):$PATH"
  fi
fi

if ! command -v clang-format >/dev/null 2>&1; then
  echo "clang-format is required to generate MyReader Core bindings." >&2
  exit 1
fi

build_platform() {
  local platform="$1"

  (
    cd "$MODULE_DIR"
    "$NODE_BINARY" "$UBRN_CLI" \
      build "$platform" \
      --release \
      --and-generate \
      --config ubrn.config.yaml

    "$NODE_BINARY" "$UBRN_CLI" \
      generate jsi turbo-module my_reader_core_ffi \
      --config ubrn.config.yaml

    clang-format \
      -i \
      --style=file \
      --fallback-style=LLVM \
      cpp/bindings/my_reader_core_ffi.cpp \
      cpp/bindings/my_reader_core_ffi.hpp \
      cpp/my-reader-core.cpp \
      cpp/my-reader-core.h

    "$NODE_BINARY" "$MOBILE_DIR/node_modules/prettier/bin/prettier.cjs" \
      --write "src/**/*.ts" \
      --no-error-on-unmatched-pattern
  )
}

case "$PLATFORM" in
  ios|android)
    build_platform "$PLATFORM"
    ;;
  all)
    build_platform ios
    build_platform android
    ;;
  *)
    echo "Usage: $0 [ios|android|all]" >&2
    exit 1
    ;;
esac
