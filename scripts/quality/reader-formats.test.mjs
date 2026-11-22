import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import test from "node:test"

test("all shipped Foliate originals match the pinned upstream bytes", async () => {
  const root = new URL("../../packages/reader-formats/", import.meta.url)
  const { files } = JSON.parse(
    await readFile(new URL("UPSTREAM.json", root), "utf8"),
  )
  const vendor = new URL("vendor/foliate-js/", root)
  const entries = await readdir(vendor, {
    recursive: true,
    withFileTypes: true,
  })
  assert.equal(
    entries.filter((entry) => entry.isFile()).length,
    Object.keys(files).length,
  )
  for (const [name, expected] of Object.entries(files)) {
    const digest = createHash("sha256")
      .update(await readFile(new URL(name, vendor)))
      .digest("hex")
    assert.equal(digest, expected, name)
  }
})
