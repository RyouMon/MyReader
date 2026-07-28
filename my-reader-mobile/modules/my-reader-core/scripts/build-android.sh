#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$MODULE_DIR/../../.." && pwd)"
OUTPUT_DIR="$MODULE_DIR/build/android/jniLibs"
CARGO_TARGET_DIR="$MODULE_DIR/build/cargo"

mkdir -p "$OUTPUT_DIR"
cd "$REPO_ROOT"
CARGO_TARGET_DIR="$CARGO_TARGET_DIR" cargo ndk \
  --target arm64-v8a \
  --target armeabi-v7a \
  --target x86_64 \
  --output-dir "$OUTPUT_DIR" \
  build \
  --locked \
  --release \
  --package my-reader-core-ffi
