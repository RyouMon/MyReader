import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import test from "node:test"

test("iOS Maestro packaging preserves artifact integrity and rejects incomplete inputs", () => {
  const script = fileURLToPath(
    new URL(
      "../../my-reader-mobile/e2e/scripts/prepare-ios-maestro.test.py",
      import.meta.url,
    ),
  )
  const result = spawnSync(
    process.platform === "win32" ? "python" : "python3",
    [script],
    {
      encoding: "utf8",
      timeout: 30000,
    },
  )
  assert.equal(
    result.status,
    0,
    result.error?.message ?? `${result.stdout}\n${result.stderr}`,
  )
})
