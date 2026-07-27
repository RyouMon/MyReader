#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$MODULE_DIR/../../.." && pwd)"
BUILD_DIR="$MODULE_DIR/build/uniffi"
SWIFT_DIR="$MODULE_DIR/ios/generated"
KOTLIN_DIR="$MODULE_DIR/android/src/main/java/com/myreader/rustcomponents/uniffi"
LIBRARY_PATH="$REPO_ROOT/target/debug/libmyreader_rust_components.dylib"

cd "$REPO_ROOT"
cargo build -p myreader-rust-components
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$SWIFT_DIR" "$KOTLIN_DIR"
cargo run -p myreader-rust-components \
  --features bindgen \
  --bin uniffi-bindgen \
  -- generate \
  --library \
  --language swift \
  --language kotlin \
  --no-format \
  --out-dir "$BUILD_DIR" \
  "$LIBRARY_PATH"

cp "$BUILD_DIR/MyReaderRustComponentsBindings.swift" "$SWIFT_DIR/"
cp "$BUILD_DIR/MyReaderRustComponentsBindingsFFI.h" "$SWIFT_DIR/"
cp "$BUILD_DIR/com/myreader/rustcomponents/uniffi/myreader_rust_components.kt" \
  "$KOTLIN_DIR/MyReaderRustComponentsBindings.kt"
