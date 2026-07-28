#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$MODULE_DIR/../../.." && pwd)"
BUILD_DIR="$MODULE_DIR/build/uniffi"
SWIFT_DIR="$MODULE_DIR/ios/generated"
KOTLIN_DIR="$MODULE_DIR/android/src/main/java/com/myreader/core/uniffi"
LIBRARY_PATH="$REPO_ROOT/target/debug/libmy_reader_core_ffi.dylib"

cd "$REPO_ROOT"
cargo build -p my-reader-core-ffi
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$SWIFT_DIR" "$KOTLIN_DIR"
cargo run -p my-reader-core-ffi \
  --features bindgen \
  --bin uniffi-bindgen \
  -- generate \
  --library \
  --language swift \
  --language kotlin \
  --no-format \
  --out-dir "$BUILD_DIR" \
  "$LIBRARY_PATH"

cp "$BUILD_DIR/MyReaderCoreFfiBindings.swift" "$SWIFT_DIR/"
cp "$BUILD_DIR/MyReaderCoreFfiBindingsFFI.h" "$SWIFT_DIR/"
cp "$BUILD_DIR/com/myreader/core/uniffi/my_reader_core_ffi.kt" \
  "$KOTLIN_DIR/MyReaderCoreFfiBindings.kt"

perl -pi -e 's/[ \t]+$//' \
  "$SWIFT_DIR/MyReaderCoreFfiBindings.swift" \
  "$SWIFT_DIR/MyReaderCoreFfiBindingsFFI.h" \
  "$KOTLIN_DIR/MyReaderCoreFfiBindings.kt"
perl -0777 -pi -e 's/\n+\z/\n/' \
  "$SWIFT_DIR/MyReaderCoreFfiBindings.swift" \
  "$SWIFT_DIR/MyReaderCoreFfiBindingsFFI.h" \
  "$KOTLIN_DIR/MyReaderCoreFfiBindings.kt"
