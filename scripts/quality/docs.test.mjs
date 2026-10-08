import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { checkLinks } from "./docs.mjs"

// These exercise the real CLIs and repository configuration, not mock scanners.
test("Lychee accepts local references offline and fails for broken files and anchors", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "myreader-docs-"))
  try {
    const file = path.join(dir, "README.md")
    writeFileSync(path.join(dir, "with space.md"), "# Exists\n")
    writeFileSync(
      path.join(dir, "image.svg"),
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
    )
    const valid =
      "# Here\n[ok][ref]\n\n[ref]: with%20space.md#exists\n\n![image](image.svg)\n[anchor](#here)\n[offline](https://not-a-real-site.invalid)\n`[example](sample.md)`\n```md\n[x](example.md)\n```\n"
    writeFileSync(file, valid)
    assert.doesNotThrow(() => checkLinks([file]))
    for (const link of ["absent.md", "with%20space.md#missing", "absent.svg"]) {
      writeFileSync(file, `${valid}\n[broken](${link})\n`)
      assert.throws(
        () => checkLinks([file]),
        (error) => error.status > 0,
      )
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("historical ADRs still reject broken document links while retaining source references", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "myreader-adr-"))
  try {
    const file = path.join(dir, "0001-history.md")
    writeFileSync(
      file,
      "[historical source](removed.ts)\n[offline](https://not-a-real-site.invalid/doc.md)\n",
    )
    assert.doesNotThrow(() => checkLinks([file], { historical: true }))
    writeFileSync(file, "[historical source](removed.ts)\n[doc](missing.md)\n")
    assert.throws(
      () => checkLinks([file], { historical: true }),
      (error) => error.status > 0,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
