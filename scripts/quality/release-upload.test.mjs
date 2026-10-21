import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { verifyUploadedRelease } from "../release/verify-upload.mjs"

test("publication requires exact uploaded names, bytes and server-side digests", () => {
  const directory = mkdtempSync(join(tmpdir(), "myreader-upload-"))
  try {
    writeFileSync(join(directory, "app.apk"), "tested")
    const asset = {
      name: "app.apk",
      state: "uploaded",
      size: 6,
      digest: `sha256:${createHash("sha256").update("tested").digest("hex")}`,
    }
    const release = { draft: true, tag_name: "v1.0.0", assets: [asset] }
    verifyUploadedRelease(directory, release, "v1.0.0")
    for (const changed of [
      { state: "starter" },
      { size: 5 },
      { digest: "sha256:wrong" },
    ]) {
      assert.throws(() =>
        verifyUploadedRelease(
          directory,
          { ...release, assets: [{ ...asset, ...changed }] },
          "v1.0.0",
        ),
      )
    }
    assert.throws(() =>
      verifyUploadedRelease(directory, { ...release, assets: [] }, "v1.0.0"),
    )
    assert.throws(() =>
      verifyUploadedRelease(
        directory,
        { ...release, assets: [asset, { ...asset, name: "old.apk" }] },
        "v1.0.0",
      ),
    )
    assert.throws(() =>
      verifyUploadedRelease(directory, { ...release, draft: false }, "v1.0.0"),
    )
    assert.throws(() => verifyUploadedRelease(directory, release, "v2.0.0"))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
