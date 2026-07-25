#!/bin/bash
# Restore MyReader integration details after ubrn generation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INDEX_FILE="$PROJECT_DIR/src/index.ts"
EXPORT_LINE="export { nativeApi, NativeAutomerge, NativeSyncState, Automerge } from './useapi-adapter';"

node - "$INDEX_FILE" <<'NODE'
const fs = require("node:fs")
const indexFile = process.argv[2]
let source = fs.readFileSync(indexFile, "utf8")

if (!source.includes("__MYREADER_AUTOMERGE_RUST_INSTALLED__")) {
  source = source.replace(
    "import installer from './NativeAutomergeGenerated';",
    `import installer from './NativeAutomergeGenerated';

declare global {
  var __MYREADER_AUTOMERGE_RUST_INSTALLED__: boolean | undefined;
  var __MYREADER_AUTOMERGE_BINDINGS_INITIALIZED__: boolean | undefined;
}`,
  )
  source = source.replace(
    `// Register the rust crate with Hermes
// - the boolean flag ensures this loads exactly once, even if the JS
//   code is reloaded (e.g. during development with metro).
let rustInstalled = false;
if (!rustInstalled) {
  installer.installRustCrate();
  rustInstalled = true;
}`,
    `// Register the rust crate with Hermes
// - global flags survive Metro module reloads in the same JS runtime.
if (!globalThis.__MYREADER_AUTOMERGE_RUST_INSTALLED__) {
  installer.installRustCrate();
  globalThis.__MYREADER_AUTOMERGE_RUST_INSTALLED__ = true;
}`,
  )
  source = source.replace(
    `// Initialize the generated bindings: mostly checksums, but also callbacks.
// - the boolean flag ensures this loads exactly once, even if the JS code
//   is reloaded (e.g. during development with metro).
let initialized = false;
if (!initialized) {
  automerge.default.initialize();
  initialized = true;
}`,
    `// Initialize the generated bindings: mostly checksums, but also callbacks.
// - this must also remain idempotent across Metro module reloads.
if (!globalThis.__MYREADER_AUTOMERGE_BINDINGS_INITIALIZED__) {
  automerge.default.initialize();
  globalThis.__MYREADER_AUTOMERGE_BINDINGS_INITIALIZED__ = true;
}`,
  )
}

if (
  !source.includes("__MYREADER_AUTOMERGE_RUST_INSTALLED__") ||
  source.includes("let rustInstalled = false") ||
  source.includes("let initialized = false")
) {
  throw new Error(`Unable to make ${indexFile} reload-safe`)
}

fs.writeFileSync(indexFile, source)
NODE

if grep -q "from './useapi-adapter'" "$INDEX_FILE"; then
    echo "UseApi export already present in index.ts"
    if ! grep -B 5 "from './useapi-adapter'" "$INDEX_FILE" | grep -q "Automerge"; then
        echo "Error: incomplete native Automerge export in $INDEX_FILE" >&2
        exit 1
    fi
else
    temp_file="$(mktemp)"
    awk -v export_line="$EXPORT_LINE" '
        /\/\/ Export the crates as individually namespaced objects/ && !inserted {
            print "// Export the UseApi adapter for native Automerge integration"
            print export_line
            print ""
            inserted = 1
        }
        { print }
        END {
            if (!inserted) exit 1
        }
    ' "$INDEX_FILE" > "$temp_file"
    mv "$temp_file" "$INDEX_FILE"
    echo "Added native Automerge export to index.ts"
fi

for generated_file in \
    "$PROJECT_DIR/src/generated/automerge.ts" \
    "$PROJECT_DIR/src/generated/automerge-ffi.ts"
do
    if ! head -n 1 "$generated_file" | grep -q "^// @ts-nocheck$"; then
        temp_file="$(mktemp)"
        {
            printf '%s\n' '// @ts-nocheck'
            cat "$generated_file"
        } > "$temp_file"
        mv "$temp_file" "$generated_file"
    fi
done

node - \
    "$PROJECT_DIR/src/generated/automerge.ts" \
    "$PROJECT_DIR/cpp/generated/automerge.cpp" <<'NODE'
const fs = require("node:fs")

for (const generatedFile of process.argv.slice(2)) {
  const source = fs.readFileSync(generatedFile, "utf8")
  fs.writeFileSync(generatedFile, source.replace(/[ \t]+$/gm, ""))
}
NODE
