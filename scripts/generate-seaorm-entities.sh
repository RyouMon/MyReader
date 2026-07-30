#!/usr/bin/env bash
# Generate SeaORM query entities from the schema produced by myreader-core.
#
# Prerequisites:
#   - sea-orm-cli installed: cargo install sea-orm-cli
#
# Usage: bash scripts/generate-seaorm-entities.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMP_DIR=$(mktemp -d)
TEMP_DB="$TEMP_DIR/myreader_schema.db"
ENTITY_DIR="$ROOT_DIR/crates/myreader-core/src/entities/app"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Build the complete schema through the same Rust migrator used at runtime.
cargo run --quiet -p myreader-core --example migrate_database -- "$TEMP_DB"

# Generate SeaORM entities
mkdir -p "$ENTITY_DIR"
sea-orm-cli generate entity \
  --database-url "sqlite://$TEMP_DB" \
  --output-dir "$ENTITY_DIR" \
  --with-serde both \
  --date-time-crate time

echo "SeaORM entities generated at: $ENTITY_DIR"

echo "Done. Commit the generated entity files together with schema changes."
