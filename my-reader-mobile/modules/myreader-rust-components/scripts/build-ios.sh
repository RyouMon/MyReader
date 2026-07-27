#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$MODULE_DIR/../../.." && pwd)"
ARCH="${CURRENT_ARCH:-}"
if [[ -z "$ARCH" || "$ARCH" == "undefined_arch" ]]; then
  ARCH="${ARCHS%% *}"
fi
if [[ -z "$ARCH" ]]; then
  ARCH="${NATIVE_ARCH_ACTUAL:-arm64}"
fi
PLATFORM="${PLATFORM_NAME:-iphonesimulator}"

case "$PLATFORM-$ARCH" in
  iphoneos-arm64)
    RUST_TARGET="aarch64-apple-ios"
    ;;
  iphonesimulator-arm64)
    RUST_TARGET="aarch64-apple-ios-sim"
    ;;
  iphonesimulator-x86_64)
    RUST_TARGET="x86_64-apple-ios"
    ;;
  *)
    echo "Unsupported iOS Rust target: $PLATFORM-$ARCH" >&2
    exit 1
    ;;
esac

OUTPUT_DIR="$MODULE_DIR/build/ios/$PLATFORM"
CARGO_TARGET_DIR="$MODULE_DIR/build/cargo"

mkdir -p "$OUTPUT_DIR"
cd "$REPO_ROOT"
CARGO_TARGET_DIR="$CARGO_TARGET_DIR" cargo build \
  --locked \
  --release \
  --target "$RUST_TARGET" \
  --package myreader-rust-components
cp \
  "$CARGO_TARGET_DIR/$RUST_TARGET/release/libmyreader_rust_components.a" \
  "$OUTPUT_DIR/"

if [[ -n "${CONFIGURATION_BUILD_DIR:-}" ]]; then
  mkdir -p "$CONFIGURATION_BUILD_DIR"
  cp \
    "$CARGO_TARGET_DIR/$RUST_TARGET/release/libmyreader_rust_components.a" \
    "$CONFIGURATION_BUILD_DIR/"
fi
