#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v cargo >/dev/null 2>&1 || ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs |
    sh -s -- -y --profile minimal
  export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
fi

case "${EAS_BUILD_PLATFORM:-}" in
  ios)
    rustup target add aarch64-apple-ios aarch64-apple-ios-sim
    bash "$SCRIPT_DIR/build-bindings.sh" ios
    ;;
  android)
    rustup target add \
      aarch64-linux-android \
      armv7-linux-androideabi \
      x86_64-linux-android
    cargo install cargo-ndk --locked
    bash "$SCRIPT_DIR/build-bindings.sh" android
    ;;
  *)
    echo "EAS_BUILD_PLATFORM must be ios or android." >&2
    exit 1
    ;;
esac
