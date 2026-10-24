import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function reviewCandidate(directory, run, context) {
  const { commit, tag, repository, runId, reviewer, reason } = context
  assert.match(runId, /^\d+$/, "Invalid source run ID")
  assert.equal(String(run.id), runId, "Wrong source run")
  assert.equal(run.repository.full_name, repository, "Wrong repository")
  assert.equal(run.path, ".github/workflows/release.yml", "Not a Release run")
  assert.equal(run.status, "completed", "Source run is still active")
  assert.equal(run.event, "push", "Review requires an original tag release")
  assert.match(tag, /^v\d/, "Review must run on the release tag")
  assert.equal(run.head_branch, tag, "Source run has a different tag")
  assert.equal(run.head_sha, commit, "Source run has a different commit")
  assert.ok(reviewer?.trim(), "Missing reviewer")
  assert.ok(reason?.trim(), "Explain the confirmed non-functional E2E cause")

  const path = join(directory, "release-evidence.json")
  const manifest = JSON.parse(readFileSync(path, "utf8"))
  assert.equal(manifest.commit, commit, "Candidate has a different commit")
  assert.equal(manifest.sourceRun.id, runId, "Candidate has a different run")
  assert.equal(
    manifest.sourceRun.attempt,
    String(run.run_attempt),
    "Candidate has a different run attempt",
  )
  assert.equal(manifest.e2e.status, "review-required", "No pending E2E review")
  const assets = Object.entries(manifest.assets)
  assert.equal(assets.length, 8, "Incomplete release assets")
  const apk = assets.find(([name]) => name.endsWith(".apk"))
  assert.ok(apk, "Missing APK")
  assert.deepEqual(
    readdirSync(directory).sort(),
    [
      ...assets.map(([name]) => name),
      `${apk[0]}.sha256`,
      "release-evidence.json",
    ].sort(),
    "Unexpected candidate files",
  )
  for (const [name, digest] of assets) {
    assert.equal(basename(name), name, "Invalid asset path")
    assert.equal(
      createHash("sha256")
        .update(readFileSync(join(directory, name)))
        .digest("hex"),
      digest,
      `Candidate asset changed: ${name}`,
    )
  }
  assert.equal(
    readFileSync(join(directory, `${apk[0]}.sha256`), "utf8")
      .trim()
      .split(/\s+/)[0],
    apk[1],
    "APK checksum mismatch",
  )
  manifest.e2e.review = {
    classification: "non-functional",
    reviewer,
    reason: reason.trim(),
    sourceUrl: run.html_url,
    reviewedAt: new Date().toISOString(),
  }
  // Keep the original failed results; approval does not turn them into passes.
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [directory, runPath] = process.argv.slice(2)
  assert.equal(process.env.GITHUB_EVENT_NAME, "workflow_dispatch")
  assert.equal(process.env.GITHUB_REF_TYPE, "tag")
  reviewCandidate(directory, JSON.parse(readFileSync(runPath, "utf8")), {
    commit: process.env.GITHUB_SHA,
    tag: process.env.GITHUB_REF_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.REVIEW_RUN_ID,
    reviewer: process.env.GITHUB_ACTOR,
    reason: process.env.REVIEW_REASON,
  })
}
