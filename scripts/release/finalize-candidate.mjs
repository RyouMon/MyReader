import assert from "node:assert/strict"
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import {
  candidateIdentity,
  digest,
  evidenceFile,
  releaseFiles,
  verifyCandidate,
} from "./candidate.mjs"
import {
  api,
  draft,
  gh,
  git,
  isCandidateRun,
  prRuns,
  repository,
  statusContext,
} from "./github.mjs"
import { verifyUploadedRelease } from "./verify-upload.mjs"

const { pull_request: pr, action } = JSON.parse(
  readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
)
assert.ok(
  action === "closed" &&
    pr.merged &&
    pr.merge_commit_sha === git("rev-parse", "HEAD"),
  "Expected the merged release PR checkout",
)
const identity = candidateIdentity(
  pr,
  repository,
  git("rev-parse", "HEAD^{tree}"),
)
const { candidateTag, commit, version } = identity
assert.equal(
  api(`git/commits/${commit}`).tree.sha,
  identity.tree,
  "Merged tree differs from the built PR",
)
assert.equal(
  JSON.parse(readFileSync("my-reader-mobile/app.json")).expo.version,
  version,
)
assert.equal(
  JSON.parse(readFileSync("my-reader/src-tauri/tauri.conf.json")).version,
  version,
)
const tag = "v" + version
// Existing versions must never be retargeted, even on a retry.
const remoteRef = git(
  "ls-remote",
  "origin",
  `refs/tags/${tag}`,
  `refs/tags/${tag}^{}`,
)
  .split("\n")
  .at(-1)
if (remoteRef)
  assert.equal(
    remoteRef.split(/\s+/)[0],
    pr.merge_commit_sha,
    "Version tag already belongs to another commit",
  )
const quality = prRuns("quality", identity)[0]
assert.ok(quality, "No quality run for release commit")
const checks = api(`actions/runs/${quality.id}/jobs?per_page=100`).jobs
for (const name of ["QA", "Unit tests", "Changed-line coverage"])
  assert.ok(
    checks.some((j) => j.name === name && j.conclusion === "success"),
    `Missing required check: ${name}`,
  )
const status = api(`commits/${commit}/status`).statuses.find(
  (s) => s.context === statusContext,
)
assert.ok(
  status?.state === "success" &&
    status.target_url === pr.html_url &&
    /^sha256:[a-f0-9]{64}$/.test(status.description),
  "Missing approved release candidate",
)
const source = draft(candidateTag)
assert.equal(source.target_commitish, commit)
const dir = join(process.env.RUNNER_TEMP, "candidate")
mkdirSync(dir, { recursive: true })
gh("release", "download", candidateTag, "--repo", repository, "--dir", dir)
verifyUploadedRelease(dir, source, candidateTag)
const manifest = verifyCandidate(dir, identity, status.description.slice(7))
const windows = api(`actions/runs/${manifest.windowsRun}`)
assert.ok(
  isCandidateRun(windows, identity),
  "Windows installers were not built for this PR",
)
assert.ok(
  api(`actions/runs/${windows.id}/jobs?per_page=100`).jobs.some(
    (job) =>
      job.name.endsWith("/ Windows installers") && job.conclusion === "success",
  ),
  "Windows installer job failed",
)
const windowsDir = join(process.env.RUNNER_TEMP, "windows")
gh(
  "run",
  "download",
  String(windows.id),
  "--repo",
  repository,
  "--name",
  "MyReader-Windows-x64",
  "--dir",
  windowsDir,
)
assert.equal(
  readFileSync(join(windowsDir, "commit.txt"), "utf8").trim(),
  commit,
)
for (const file of Object.keys(manifest.assets).filter((f) =>
  /\.(msi|exe)$/.test(f),
))
  assert.equal(
    digest(join(windowsDir, file)),
    manifest.assets[file],
    "Windows installer differs from Actions artifact",
  )
mkdirSync("release-assets")
for (const file of [...Object.keys(manifest.assets), evidenceFile])
  copyFileSync(join(dir, file), join("release-assets", file))
const changelog = readFileSync("CHANGELOG.md", "utf8")
  .split(/^## \[/m)
  .find((section) => section.startsWith(version + "]"))
assert.ok(changelog, "No changelog for release version")
const notes = changelog.slice(changelog.indexOf("\n") + 1).trim()
assert.ok(notes)
writeFileSync(join(process.env.RUNNER_TEMP, "release-notes.md"), notes + "\n")
appendFileSync(
  process.env.GITHUB_OUTPUT,
  `tag=${tag}\ncandidate=${candidateTag}\nipa=${join(dir, releaseFiles(version).ipa)}\n`,
)
