#!/usr/bin/env bash
# Generate SeaORM entity files for Calibre metadata.db tables.
#
# Flow:
#   1. Create temp drizzle config pointing at calibre schema
#   2. drizzle-kit generate → SQL migration file
#   3. sqlite3 creates temp DB from that SQL
#   4. sea-orm-cli generate entity → Rust entities
#   5. Cleanup temp config, SQL, and DB
#
# Prerequisites:
#   - sea-orm-cli: cargo install sea-orm-cli
#   - sqlite3 CLI
#
# Usage: bash scripts/generate-seaorm-calibre-entities.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_DIR="$ROOT_DIR/packages/db"
ENTITY_DIR="$ROOT_DIR/my-reader/src-tauri/src/entities/calibre"
TEMP_DIR=$(mktemp -d)

cleanup() {
  rm -rf "$TEMP_DIR"
  rm -rf "$DB_DIR/.calibre-migration"
  rm -f "$DB_DIR/drizzle.config.calibre.ts"
}
trap cleanup EXIT

echo "Step 1: Creating temp drizzle config for calibre schema..."

cat > "$DB_DIR/drizzle.config.calibre.ts" << 'EOF'
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/calibre/index.ts",
  out: "./.calibre-migration",
  dialect: "sqlite",
  dbCredentials: {
    url: ":memory:",
  },
});
EOF

echo "Step 2: Generating SQL from calibre drizzle schema..."

cd "$DB_DIR"
npx drizzle-kit generate --config drizzle.config.calibre.ts 2>&1

# Find the generated SQL file
SQL_FILE=$(find "$DB_DIR/.calibre-migration" -name "*.sql" | head -1)

if [ -z "$SQL_FILE" ]; then
  echo "Error: No SQL migration file generated."
  exit 1
fi

echo "Generated SQL: $(head -3 "$SQL_FILE")..."

echo "Step 3: Creating temp SQLite DB from generated SQL..."

TEMP_DB="$TEMP_DIR/calibre_schema.db"
rm -f "$TEMP_DB"
sqlite3 "$TEMP_DB" < "$SQL_FILE"

echo "Step 4: Generating SeaORM entities..."

mkdir -p "$ENTITY_DIR"
sea-orm-cli generate entity \
  --database-url "sqlite://$TEMP_DB" \
  --output-dir "$ENTITY_DIR" \
  --with-serde both \
  --date-time-crate time

echo "Calibre SeaORM entities generated at: $ENTITY_DIR"
echo "Done."
