import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve, sep } from "node:path"
import { parseAllDocuments } from "yaml"

export function validateMaestroSuite(root, suite) {
  const visited = new Set()
  function visit(path) {
    const absolute = resolve(root, path)
    assert.ok(
      absolute.startsWith(`${resolve(root)}${sep}`),
      `Flow escapes the suite: ${path}`,
    )
    if (visited.has(absolute)) return
    visited.add(absolute)
    const documents = parseAllDocuments(readFileSync(absolute, "utf8"))
    assert.equal(
      documents.length,
      2,
      `Flow must contain config and commands: ${path}`,
    )
    for (const document of documents)
      assert.deepEqual(document.errors, [], `Invalid YAML: ${path}`)
    const [config, commands] = documents.map((document) => document.toJSON())
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Maestro expands this placeholder at runtime.
    assert.equal(config.appId, "${APP_ID}")
    assert.ok(
      !config.tags?.some((tag) => ["skip", "wip"].includes(tag)),
      `Excluded flow: ${path}`,
    )
    assert.ok(
      Array.isArray(commands) && commands.length > 0,
      `Empty flow: ${path}`,
    )
    function walk(value) {
      if (!value || typeof value !== "object") return
      assert.ok(
        !("retry" in value),
        `Whole-step retries conceal failures: ${path}`,
      )
      assert.notEqual(
        value.optional,
        true,
        `Optional assertion/action: ${path}`,
      )
      const flow = value.runFlow
      const file = typeof flow === "string" ? flow : flow?.file
      if (file) visit(resolve(dirname(absolute), file))
      for (const child of Object.values(value)) walk(child)
    }
    walk(commands)
  }
  assert.ok(suite.length > 0, "Empty release suite")
  assert.equal(new Set(suite).size, suite.length, "Duplicate top-level flow")
  suite.forEach(visit)
  return visited
}
