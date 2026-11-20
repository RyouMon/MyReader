import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"

export const repository = process.env.GITHUB_REPOSITORY || "RyouMon/MyReader"
export const statusContext = "Release local artifacts"
export const gh = (...args) =>
  execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()
export const api = (path, ...args) =>
  JSON.parse(gh("api", `repos/${repository}/${path}`, ...args))
export const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim()
export function draft(tag) {
  const url = gh(
    "release",
    "view",
    tag,
    "--repo",
    repository,
    "--json",
    "apiUrl",
    "--jq",
    ".apiUrl",
  )
  const release = JSON.parse(gh("api", url))
  assert.ok(
    release.draft && release.tag_name === tag,
    "Expected the matching candidate draft",
  )
  return release
}
export function openPR(number, expectedHead) {
  const pr = api(`pulls/${number}`)
  assert.equal(pr.state, "open", "Release PR is no longer open")
  if (expectedHead)
    assert.equal(
      pr.head.sha,
      expectedHead,
      "Release PR changed; run again for the new head",
    )
  return pr
}
export function setStatus(identity, state, description) {
  gh(
    "api",
    "--method",
    "POST",
    `repos/${repository}/statuses/${identity.commit}`,
    "-f",
    `state=${state}`,
    "-f",
    `context=${statusContext}`,
    "-f",
    `description=${description}`,
    "-f",
    `target_url=https://github.com/${repository}/pull/${identity.pr}`,
  )
}
export function prRuns(workflow, identity) {
  const branch = encodeURIComponent(`release/${identity.version}`)
  return api(
    `actions/workflows/${workflow}.yml/runs?event=pull_request&head_sha=${identity.commit}&branch=${branch}&per_page=100`,
  ).workflow_runs.filter(
    (run) =>
      run.head_repository?.full_name === repository &&
      run.head_sha === identity.commit,
  )
}
export function isCandidateRun(run, identity) {
  return (
    run?.event === "pull_request" &&
    run.path === ".github/workflows/release.yml" &&
    run.head_sha === identity.commit &&
    run.head_repository?.full_name === identity.repository &&
    run.head_branch === `release/${identity.version}` &&
    run.display_title === `Candidate PR #${identity.pr} at ${identity.commit}`
  )
}
export async function windowsDownload(identity, dir) {
  const deadline = Date.now() + 3 * 3600_000
  while (Date.now() < deadline) {
    openPR(identity.pr, identity.commit)
    const run = prRuns("release", identity).find((r) =>
      isCandidateRun(r, identity),
    )
    if (run) {
      const jobs = api(`actions/runs/${run.id}/jobs?per_page=100`).jobs
      const build = jobs.find((j) => j.name.endsWith("/ Windows installers"))
      if (build?.conclusion === "success") {
        gh(
          "run",
          "download",
          String(run.id),
          "--repo",
          repository,
          "--name",
          "MyReader-Windows-x64",
          "--dir",
          dir,
        )
        return run.id
      }
      if (build?.conclusion || run.status === "completed")
        throw new Error(`Windows build did not pass: ${run.html_url}`)
    }
    await delay(30000)
  }
  throw new Error("Timed out waiting for Windows installers")
}
