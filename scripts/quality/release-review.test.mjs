import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { reviewCandidate } from "../release/review.mjs"

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "myreader-review-"))
  const digest = createHash("sha256").update("built release").digest("hex")
  const assets = Object.fromEntries(
    [
      "arm.dmg",
      "intel.dmg",
      "app.msi",
      "app.exe",
      "app.AppImage",
      "app.deb",
      "app.rpm",
      "app.apk",
    ].map((name) => {
      writeFileSync(join(directory, name), "built release")
      return [name, digest]
    }),
  )
  writeFileSync(join(directory, "app.apk.sha256"), `${digest}  app.apk\n`)
  const manifest = {
    commit: "release-head",
    sourceRun: { id: "123", attempt: "2" },
    assets,
    e2e: {
      status: "review-required",
      results: [
        {
          name: "mobile-android",
          status: "review-required",
          reason: "Emulator exited",
        },
      ],
    },
  }
  writeFileSync(
    join(directory, "release-evidence.json"),
    JSON.stringify(manifest),
  )
  return {
    directory,
    manifest,
    run: {
      id: 123,
      run_attempt: 2,
      repository: { full_name: "owner/repo" },
      path: ".github/workflows/release.yml",
      status: "completed",
      event: "push",
      head_branch: "v1.0.0",
      head_sha: "release-head",
      html_url: "https://github.com/owner/repo/actions/runs/123",
    },
    context: {
      commit: "release-head",
      tag: "v1.0.0",
      repository: "owner/repo",
      runId: "123",
      reviewer: "maintainer",
      reason:
        "QEMU host crash confirmed in emulator log; manual application check passed.",
    },
  }
}

test("non-functional review keeps failed results and records approval for the original bytes", () => {
  const { directory, manifest, run, context } = fixture()
  try {
    const approved = reviewCandidate(directory, run, context)
    assert.deepEqual(approved.e2e.results, manifest.e2e.results)
    assert.equal(approved.e2e.status, "review-required")
    assert.equal(approved.e2e.review.classification, "non-functional")
    assert.equal(approved.e2e.review.reviewer, context.reviewer)
    assert.equal(approved.e2e.review.reason, context.reason)
    assert.equal(approved.e2e.review.sourceUrl, run.html_url)
    assert.deepEqual(
      JSON.parse(readFileSync(join(directory, "release-evidence.json"))),
      approved,
    )
    assert.equal(
      readFileSync(join(directory, "app.apk"), "utf8"),
      "built release",
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("review cannot reuse another repository, commit, tag, workflow or run attempt", () => {
  const { directory, manifest, run, context } = fixture()
  try {
    for (const change of [
      { id: 456 },
      { repository: { full_name: "another/repo" } },
      { path: ".github/workflows/mobile-build.yml" },
      { status: "in_progress" },
      { event: "workflow_dispatch" },
      { head_branch: "v1.0.1" },
      { head_sha: "other-head" },
      { run_attempt: 3 },
    ])
      assert.throws(() =>
        reviewCandidate(directory, { ...run, ...change }, context),
      )
    for (const change of [
      { runId: "../123" },
      { tag: "main" },
      { reviewer: " " },
      { reason: " " },
    ])
      assert.throws(() =>
        reviewCandidate(directory, run, { ...context, ...change }),
      )
    assert.deepEqual(
      JSON.parse(readFileSync(join(directory, "release-evidence.json"))),
      manifest,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("review rejects modified or extra installers instead of waiving integrity checks", () => {
  const { directory, run, context } = fixture()
  try {
    writeFileSync(join(directory, "app.apk"), "replaced")
    assert.throws(
      () => reviewCandidate(directory, run, context),
      /asset changed/,
    )
    writeFileSync(join(directory, "app.apk"), "built release")
    writeFileSync(join(directory, "extra.apk"), "unverified")
    assert.throws(
      () => reviewCandidate(directory, run, context),
      /Unexpected candidate/,
    )
    rmSync(join(directory, "extra.apk"))
    writeFileSync(join(directory, "app.apk.sha256"), "wrong digest")
    assert.throws(
      () => reviewCandidate(directory, run, context),
      /checksum mismatch/,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
