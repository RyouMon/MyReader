import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { validateMaestroSuite } from "../release/maestro-suite.mjs"

test("every mobile release flow is executable and reachable without exclusions or retries", () => {
  const root = fileURLToPath(
    new URL("../../my-reader-mobile/e2e", import.meta.url),
  )
  const suites = JSON.parse(
    readFileSync(join(root, "release-suite.json"), "utf8"),
  )
  const visited = new Set()
  for (const platform of ["ios", "android"]) {
    for (const path of validateMaestroSuite(root, suites[platform]))
      visited.add(path)
  }
  function requireReachable(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) requireReachable(path)
      else if (entry.name.endsWith(".yaml"))
        assert.ok(visited.has(path), `Unexecuted flow: ${path}`)
    }
  }
  requireReachable(join(root, "flows"))
  requireReachable(join(root, "common"))
})
