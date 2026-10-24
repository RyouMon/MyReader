import { readFileSync } from "node:fs"

const groups = [
  ["js", "JS / TS · five packages"],
  ["rust", "Rust · Core / FFI / Tauri"],
  ["swift", "Swift · Readium / sharing patch"],
  ["android", "Java / Kotlin · Readium / sharing patch"],
]

export async function publishCoverage(
  { github, context, core },
  summaryPath = "reports/coverage/summary.json",
) {
  const repository = context.repo
  const pr = context.payload.pull_request
  // Match getsentry/coverage-action's getCurrentBranch, including tag events.
  const branch =
    pr?.head.ref ??
    (context.ref.startsWith("refs/heads/")
      ? context.ref.replace("refs/heads/", "")
      : "unknown")
  const safeBranch = branch.replace(/[^a-zA-Z0-9-_]/g, "-")
  const artifacts = await github.paginate(
    github.rest.actions.listWorkflowRunArtifacts,
    {
      ...repository,
      run_id: context.runId,
      per_page: 100,
    },
  )
  // The upstream action treats artifact upload failures as warnings. Baseline
  // storage is required here, alongside the changed-line threshold.
  for (const [key] of groups) {
    const expected = `codecov-coverage-results-${safeBranch}-${process.env.GITHUB_JOB}-${key}`
    if (
      !artifacts.some(
        (artifact) => artifact.name === expected && !artifact.expired,
      )
    )
      throw new Error(`Coverage baseline artifact missing: ${expected}`)
  }
  if (
    pr?.head.repo.full_name !== undefined &&
    pr.head.repo.full_name !== context.payload.repository.full_name
  ) {
    core.info(
      "Fork PR: coverage details are available in the job summary; no write token is used.",
    )
    return
  }
  const startedAt = new Date(process.env.COVERAGE_REPORT_STARTED_AT)
  const deadline = Date.now() + 30_000
  const contexts = groups.flatMap(([key]) =>
    ["project", "patch"].map((kind) => `${kind} (${key})`),
  )
  let statuses
  for (;;) {
    statuses = await github.paginate(
      github.rest.repos.listCommitStatusesForRef,
      {
        ...repository,
        ref: pr?.head.sha ?? context.sha,
        per_page: 100,
      },
    )
    const missing = contexts.find((context) => {
      const status = statuses.find(
        (entry) => entry.context === `codecov/${context}`,
      )
      return !status || new Date(status.created_at) < startedAt
    })
    if (!missing) break
    const remaining = deadline - Date.now()
    if (remaining <= 0)
      throw new Error(`Current coverage status missing: ${missing}`)
    core.info(`Waiting for current coverage status: ${missing}`)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000, remaining)),
    )
  }
  const description = (kind, key) => {
    const status = statuses.find(
      (entry) => entry.context === `codecov/${kind} (${key})`,
    )
    return status.description.replaceAll("|", "\\|")
  }
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"))
  const rows = groups.map(([key, label]) => {
    description("patch", key)
    const { changed, covered } = summary[key]
    const patch = changed
      ? `${((covered / changed) * 100).toFixed(2)}% (${covered}/${changed}) ${covered * 100 >= changed * 80 ? ">=" : "<"} target 80%`
      : "N/A — no measured executable changes"
    return `| ${label} | ${description("project", key)} | ${patch} |`
  })
  const marker = "<!-- myreader-coverage-report -->"
  const runUrl = `${context.serverUrl}/${repository.owner}/${repository.repo}/actions/runs/${context.runId}`
  const body = [
    marker,
    "## Coverage report",
    "",
    `Commit: \`${pr?.head.sha ?? context.sha}\` · [Reports and uncovered lines](${runUrl})`,
    "",
    "| Scope | Line coverage / baseline change | Changed-line coverage |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "Changed-line coverage must reach 80% independently in every language. Below-target coverage, failed tests, collection errors or missing required reports block merging. Overall coverage remains informational. Passing 80% is a minimum, not a substitute for protecting important behavior.",
    "",
    "Native reports cover Readium and authored expo-sharing patch instructions. Android includes JVM and device tests; Rust includes Tauri tests on macOS and Windows. Other mobile native modules are not yet collected. Patch percentages describe measured executable lines; the detailed reports identify when no changed executable lines were found.",
    "",
    "`No base report` means a main-branch baseline is not available yet, not a zero coverage change. Main pushes store the baseline for subsequent PRs.",
  ].join("\n")
  await core.summary.addRaw(body).write()
  if (!pr) return
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repository,
    issue_number: pr.number,
    per_page: 100,
  })
  const existing = comments.find(
    (comment) =>
      comment.user.type === "Bot" && comment.body?.startsWith(marker),
  )
  if (existing) {
    await github.rest.issues.updateComment({
      ...repository,
      comment_id: existing.id,
      body,
    })
  } else {
    await github.rest.issues.createComment({
      ...repository,
      issue_number: pr.number,
      body,
    })
  }
}
