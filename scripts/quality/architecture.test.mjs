import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))

function inspect(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "myreader-architecture-"))
  try {
    for (const [name, source] of Object.entries(files)) {
      const file = path.join(dir, name)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, source)
    }
    const result = spawnSync(
      process.execPath,
      [
        path.join(
          root,
          "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
        ),
        "--config",
        path.join(root, ".dependency-cruiser.cjs"),
        "--output-type",
        "json",
        ...Object.keys(files),
      ],
      { cwd: dir, encoding: "utf8" },
    )
    if (result.error) throw result.error
    assert.ok(result.stdout.startsWith("{"), result.stderr)
    return JSON.parse(result.stdout).summary.violations
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test("architecture rejects upward imports and runtime cycles", () => {
  const violations = inspect({
    "my-reader/src/components/view.ts": "export const view = 1",
    "my-reader/src/stores/state.ts":
      'export { view } from "../components/view"',
    "my-reader/src/lib/ui.ts": 'export { view } from "../components/view"',
    "my-reader/src/lib/a.ts": 'export { b } from "./b"; export const a = 1',
    "my-reader/src/lib/b.ts": 'export { a } from "./a"; export const b = 1',
    "my-reader-mobile/src/features/view.ts": "export const view = 1",
    "my-reader-mobile/src/services/api.ts":
      'export { view } from "../features/view"',
    "my-reader-mobile/src/domain/state.ts":
      'export { view } from "../features/view"',
    "packages/tools/src/index.ts":
      'export { view } from "../../../my-reader/src/components/view"',
  })
  assert.deepEqual(
    new Set(violations.map(({ rule }) => rule.name)),
    new Set([
      "desktop-stores-stay-below-ui",
      "desktop-lib-stays-below-ui",
      "no-circular",
      "mobile-services-stay-below-ui",
      "mobile-domain-stays-below-features",
      "shared-does-not-import-apps",
    ]),
  )
})

test("architecture permits downward dependencies and cycles that only exist in types", () => {
  const violations = inspect({
    "my-reader/src/types/a.ts":
      'import type { B } from "./b"; export type A = { b: B }',
    "my-reader/src/types/b.ts":
      'import type { A } from "./a"; export type B = { a: A }',
    "my-reader/src/stores/state.ts": 'export type { A } from "../types/a"',
    "my-reader-mobile/src/services/api.ts": "export const value = 1",
    "my-reader-mobile/src/domain/state.ts":
      'export { value } from "../services/api"',
  })
  assert.deepEqual(violations, [])
})
