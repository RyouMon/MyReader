#!/bin/bash
# Build for iOS and generate React Native bindings
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure rustup toolchain is used (not Homebrew Rust)
export PATH="$HOME/.cargo/bin:$PATH"

echo "Using rustc: $(which rustc) ($(rustc --version))"
echo "Using cargo: $(which cargo) ($(cargo --version))"
echo ""

# Ensure iOS targets are installed
rustup target add aarch64-apple-ios aarch64-apple-ios-sim 2>/dev/null || true

cd "$PROJECT_DIR"
npx ubrn build ios --config ubrn.config.yaml --and-generate "$@"

# Add UseApi export to index.ts
"$SCRIPT_DIR/add-useapi-export.sh"

echo ""
echo "iOS build complete. Generated files:"
echo "  - src/generated/"
echo "  - cpp/generated/"
echo "  - ios/"
