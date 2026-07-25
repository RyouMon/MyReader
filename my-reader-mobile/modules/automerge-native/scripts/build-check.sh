#!/bin/bash
# Verify Rust compilation (fast check, no binary output)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure rustup toolchain is used (not Homebrew Rust)
export PATH="$HOME/.cargo/bin:$PATH"

echo "Using rustc: $(which rustc) ($(rustc --version))"
echo "Using cargo: $(which cargo) ($(cargo --version))"
echo ""

cd "$PROJECT_DIR/rust"
cargo check "$@"

echo ""
echo "Rust check passed."
