#!/usr/bin/env bash
# Generate SeaORM query entities from the Rust-owned legacy SQL migrations.
#
# Prerequisites:
#   - sea-orm-cli installed: cargo install sea-orm-cli
#   - sqlite3 CLI available
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

# Bash expands the zero-padded migration names in lexical order.
MIGRATION_SQL_FILES=("$ROOT_DIR"/crates/myreader-core/migrations/legacy/*.sql)

if [ ! -e "${MIGRATION_SQL_FILES[0]}" ]; then
  echo "Error: No myreader-core migration SQL found."
  exit 1
fi

# Create the complete schema by replaying every migration in order.
for migration_sql in "${MIGRATION_SQL_FILES[@]}"; do
  echo "Applying migration: $migration_sql"
  sqlite3 "$TEMP_DB" < "$migration_sql"
done

# Generate SeaORM entities
mkdir -p "$ENTITY_DIR"
# This cache is not part of the desktop SeaORM repository layer.
sea-orm-cli generate entity \
  --database-url "sqlite://$TEMP_DB" \
  --output-dir "$ENTITY_DIR" \
  --ignore-tables book_cover_thumbnail_cache \
  --with-serde both \
  --date-time-crate time

echo "SeaORM entities generated at: $ENTITY_DIR"

echo "Done. Commit the generated entity files together with schema changes."
