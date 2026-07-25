#!/bin/bash
# Build for Android and generate React Native bindings
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure rustup toolchain is used (not Homebrew Rust)
export PATH="$HOME/.cargo/bin:$PATH"

# Android SDK/NDK setup
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  # Find the latest installed NDK
  NDK_DIR=$(ls -d "$ANDROID_HOME/ndk/"* 2>/dev/null | sort -V | tail -1)
  if [ -z "$NDK_DIR" ]; then
    echo "Error: No Android NDK found. Install one via Android Studio or:"
    echo "  \$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager 'ndk;27.2.12479018'"
    exit 1
  fi
  export ANDROID_NDK_HOME="$NDK_DIR"
fi

echo "Using rustc: $(which rustc) ($(rustc --version))"
echo "Using cargo: $(which cargo) ($(cargo --version))"
echo "Using NDK:   $ANDROID_NDK_HOME"
echo ""

# Ensure Android targets are installed
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android 2>/dev/null || true

cd "$PROJECT_DIR"
npx ubrn build android --config ubrn.config.yaml --and-generate "$@"

"$SCRIPT_DIR/add-useapi-export.sh"

echo ""
echo "Android build complete. Generated files:"
echo "  - src/generated/"
echo "  - cpp/generated/"
echo "  - android/"
