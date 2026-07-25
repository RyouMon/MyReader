#!/bin/bash
# Clean all generated and build artifacts
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Cleaning generated files..."
rm -rf cpp/generated src/generated

echo "Cleaning Rust build cache..."
cd rust && cargo clean 2>/dev/null || true
cd "$PROJECT_DIR"

echo "Cleaning build artifacts..."
rm -rf build lib

echo "Done."
