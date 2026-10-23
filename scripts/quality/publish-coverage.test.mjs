import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { publishCoverage } from "./publish-coverage.mjs"

const keys = ["js", "rust", "swift", "android"]
function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "myreader-coverage-publish-"))
  const summary = path.join(dir, "summary.json")
  writeFileSync(
    summary,
    JSON.stringify(
      Object.fromEntries(
        keys.map((key) => [
          key,
          { changed: key === "rust" ? 0 : 10, covered: key === "rust" ? 0 : 5 },
        ]),
      ),
    ),
  )
  process.env.GITHUB_JOB = "coverage-report"
  process.env.COVERAGE_REPORT_STARTED_AT = "2026-10-17T00:00:00Z"
  const artifacts = keys.map((key) => ({
    name: `codecov-coverage-results-codex-coverage-coverage-report-${key}`,
    expired: false,
  }))
  const statuses = keys.flatMap((key) =>
    ["project", "patch"].map((kind) => ({
      context: `codecov/${kind} (${key})`,
      created_at: "2026-10-17T00:01:00Z",
      description:
        kind === "project" ? "50% (No base report)" : "50% < target 80%",
    })),
  )
  const comments = []
  const writes = []
  const summaries = []
  const github = {
    rest: {
      actions: { listWorkflowRunArtifacts: "artifacts" },
      repos: { listCommitStatusesForRef: "statuses" },
      issues: {
        listComments: "comments",
        updateComment: async (value) => writes.push({ update: value }),
        createComment: async (value) => writes.push({ create: value }),
      },
    },
    paginate: async (endpoint, args) => {
      if (endpoint === "artifacts") return artifacts
      if (endpoint === "statuses") {
        assert.equal(args.ref, "current-head")
        return statuses
      }
      return comments
    },
  }
  const context = {
    repo: { owner: "owner", repo: "reader" },
    runId: 123,
    ref: "refs/pull/117/merge",
    sha: "merge-head",
    serverUrl: "https://github.com",
    payload: {
      repository: { full_name: "owner/reader" },
      pull_request: {
        number: 117,
        head: {
          ref: "codex/coverage",
          sha: "current-head",
          repo: { full_name: "owner/reader" },
        },
      },
    },
  }
  const core = {
    info: () => {},
    summary: {
      addRaw: (body) => ({ write: async () => summaries.push(body) }),
    },
  }
  return {
    args: { github, context, core },
    summary,
    artifacts,
    statuses,
    comments,
    writes,
    summaries,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

test("failed coverage remains visible and repeated runs update one bot-owned PR comment", async () => {
  const f = fixture()
  try {
    f.comments.push({
      id: 1,
      user: { type: "User" },
      body: "<!-- myreader-coverage-report -->",
    })
    await publishCoverage(f.args, f.summary)
    assert.equal(f.writes.length, 1)
    assert.match(f.writes[0].create.body, /50\.00% \(5\/10\) < target 80%/)
    assert.match(f.writes[0].create.body, /block merging/)
    assert.match(
      f.writes[0].create.body,
      /N\/A — no measured executable changes/,
    )
    assert.match(f.writes[0].create.body, /No base report/)
    f.comments.push({
      id: 2,
      user: { type: "Bot" },
      body: f.writes[0].create.body,
    })
    await publishCoverage(f.args, f.summary)
    assert.equal(f.writes[1].update.comment_id, 2)
  } finally {
    f.cleanup()
  }
})

test("the PR summary uses the gate's exact counts even when the upstream display rounds or omits a line", async () => {
  const f = fixture()
  try {
    writeFileSync(
      f.summary,
      JSON.stringify({
        js: { changed: 100000, covered: 79999 },
        rust: { changed: 211, covered: 197 },
        swift: { changed: 10, covered: 8 },
        android: { changed: 10, covered: 8 },
      }),
    )
    f.statuses.find(
      (status) => status.context === "codecov/patch (js)",
    ).description = "80.00% >= target 80%"
    f.statuses.find(
      (status) => status.context === "codecov/patch (rust)",
    ).description = "93.81% >= target 80%"
    await publishCoverage(f.args, f.summary)
    const body = f.writes[0].create.body
    assert.match(body, /80\.00% \(79999\/100000\) < target 80%/)
    assert.match(body, /93\.36% \(197\/211\) >= target 80%/)
    assert.match(body, /80\.00% \(8\/10\) >= target 80%/)
    assert.doesNotMatch(body, /93\.81%/)
  } finally {
    f.cleanup()
  }
})

test("a missing baseline artifact fails publication instead of reusing old green results", async () => {
  const f = fixture()
  try {
    f.artifacts.pop()
    await assert.rejects(
      publishCoverage(f.args, f.summary),
      /baseline artifact missing/,
    )
    assert.equal(f.writes.length, 0)
  } finally {
    f.cleanup()
  }
})

test("release reports wait until newly written commit statuses are visible", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] })
  const f = fixture()
  try {
    delete f.args.context.payload.pull_request
    f.args.context.ref = "refs/heads/codex/coverage"
    f.args.context.sha = "current-head"
    const paginate = f.args.github.paginate
    let visible = false
    f.args.github.paginate = async (endpoint, args) => {
      const result = await paginate(endpoint, args)
      if (endpoint !== "statuses" || visible) return result
      return result
        .filter((status) => status.context !== "codecov/patch (android)")
        .map((status) =>
          status.context === "codecov/project (android)"
            ? { ...status, created_at: "2026-10-16T00:00:00Z" }
            : status,
        )
    }
    const publication = publishCoverage(f.args, f.summary).then(
      () => true,
      (error) => error,
    )
    await new Promise(setImmediate)
    assert.deepEqual(f.summaries, [])
    visible = true
    t.mock.timers.tick(1000)
    assert.equal(await publication, true)
    assert.equal(f.summaries.length, 1)
    assert.match(f.summaries[0], /current-head/)
    assert.match(f.summaries[0], /50\.00% \(5\/10\) < target 80%/)
    assert.equal(f.writes.length, 0)
  } finally {
    f.cleanup()
  }
})

test("tagged release reports use the upstream action's tag artifact names", async () => {
  const f = fixture()
  try {
    delete f.args.context.payload.pull_request
    f.args.context.ref = "refs/tags/v0.18.0"
    f.args.context.sha = "current-head"
    for (const artifact of f.artifacts)
      artifact.name = artifact.name.replace("codex-coverage", "unknown")
    await publishCoverage(f.args, f.summary)
    assert.equal(f.summaries.length, 1)
    assert.match(f.summaries[0], /current-head/)
    assert.equal(f.writes.length, 0)
  } finally {
    f.cleanup()
  }
})

for (const unavailable of ["missing", "stale"]) {
  test(`${unavailable} commit statuses still block publication after the wait budget`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] })
    const f = fixture()
    try {
      if (unavailable === "missing") f.statuses.pop()
      else f.statuses[0].created_at = "2026-10-16T00:00:00Z"
      const publication = assert.rejects(
        publishCoverage(f.args, f.summary),
        /Current coverage status missing/,
      )
      await new Promise(setImmediate)
      assert.deepEqual(f.summaries, [])
      t.mock.timers.tick(30_000)
      await publication
      assert.deepEqual(f.summaries, [])
      assert.equal(f.writes.length, 0)
    } finally {
      f.cleanup()
    }
  })
}

test("fork PRs require reports but do not need a write token or post comments", async () => {
  const f = fixture()
  try {
    f.args.context.payload.pull_request.head.repo.full_name =
      "contributor/reader"
    await publishCoverage(f.args, f.summary)
    assert.equal(f.writes.length, 0)
    f.artifacts.pop()
    await assert.rejects(
      publishCoverage(f.args, f.summary),
      /baseline artifact missing/,
    )
  } finally {
    f.cleanup()
  }
})
