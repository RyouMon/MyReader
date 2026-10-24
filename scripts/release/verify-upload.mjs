import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function verifyUploadedRelease(directory, release, tag) {
  assert.equal(
    release.draft,
    true,
    "Release must remain a draft until verification",
  )
  assert.equal(release.tag_name, tag, "Uploaded release has the wrong tag")
  const names = readdirSync(directory).sort()
  assert.deepEqual(
    release.assets.map((asset) => asset.name).sort(),
    names,
    "Uploaded assets differ from the validated candidate",
  )
  for (const asset of release.assets) {
    const contents = readFileSync(join(directory, asset.name))
    assert.ok(contents.length > 0, `Empty release asset: ${asset.name}`)
    assert.equal(asset.state, "uploaded", `Incomplete upload: ${asset.name}`)
    assert.equal(
      asset.size,
      contents.length,
      `Uploaded size mismatch: ${asset.name}`,
    )
    assert.equal(
      asset.digest,
      `sha256:${createHash("sha256").update(contents).digest("hex")}`,
      `Uploaded digest mismatch: ${asset.name}`,
    )
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [directory, response, tag] = process.argv.slice(2)
  verifyUploadedRelease(
    directory,
    JSON.parse(readFileSync(response, "utf8")),
    tag,
  )
}
