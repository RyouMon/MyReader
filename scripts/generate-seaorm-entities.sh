#!/usr/bin/env bash
# Generate SeaORM entity files from the Drizzle-generated SQL migration.
#
# Prerequisites:
#   - sea-orm-cli installed: cargo install sea-orm-cli
#   - sqlite3 CLI available
#   - pnpm db:generate has been run (produces packages/db/drizzle/*.sql)
#
# Usage: bash scripts/generate-seaorm-entities.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMP_DB="/tmp/myreader_schema.db"
ENTITY_DIR="$ROOT_DIR/my-reader/src-tauri/src/entities/app"

# Find the latest Drizzle migration SQL
MIGRATION_SQL=$(ls -1 "$ROOT_DIR/packages/db/drizzle/"*.sql 2>/dev/null | sort | tail -1)

if [ -z "$MIGRATION_SQL" ]; then
  echo "Error: No Drizzle migration SQL found. Run 'pnpm db:generate' first."
  exit 1
fi

echo "Using migration: $MIGRATION_SQL"

# Create temp SQLite DB from Drizzle-generated SQL
rm -f "$TEMP_DB"
sqlite3 "$TEMP_DB" < "$MIGRATION_SQL"

# Generate SeaORM entities
mkdir -p "$ENTITY_DIR"
sea-orm-cli generate entity \
  --database-url "sqlite://$TEMP_DB" \
  --output-dir "$ENTITY_DIR" \
  --with-serde both \
  --date-time-crate time

echo "SeaORM entities generated at: $ENTITY_DIR"

# Cleanup temp DB
rm -f "$TEMP_DB"

echo "Done. Commit the generated entity files together with schema changes."