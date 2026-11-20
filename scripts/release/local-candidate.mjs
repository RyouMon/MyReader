import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import {
  candidateIdentity,
  digest,
  evidenceFile,
  manifestFor,
} from "./candidate.mjs"
import {
  api,
  draft,
  gh,
  git,
  openPR,
  prRuns,
  repository,
  setStatus,
  statusContext,
  windowsDownload,
} from "./github.mjs"
import { verifyUploadedRelease } from "./verify-upload.mjs"

const cache =
  process.env.MYREADER_RELEASE_CACHE ||
  join(homedir(), "Library/Caches/MyReader-release")
const [flag, number, ...rest] = process.argv.slice(2)
assert.ok(
  process.platform === "darwin" &&
    flag === "--pr" &&
    /^[1-9]\d*$/.test(number) &&
    !rest.length,
  "Usage (Mac): pnpm release:local --pr <number>",
)
const pr = openPR(number)
const identity = candidateIdentity(
  pr,
  repository,
  api(`git/commits/${pr.head.sha}`).tree.sha,
)
const { commit, version, candidateTag } = identity
git(
  "fetch",
  "--no-tags",
  `https://github.com/${repository}.git`,
  `refs/pull/${number}/head`,
)
assert.equal(git("rev-parse", "FETCH_HEAD"), commit, "PR changed during fetch")
const releaseRoot = join(cache, `pr-${number}-${commit}`)
mkdirSync(releaseRoot, { recursive: true, mode: 0o700 })
const assets = join(releaseRoot, "assets")
mkdirSync(assets, { recursive: true })
const lock = join(releaseRoot, "running")
mkdirSync(lock)
writeFileSync(join(lock, "pid"), String(process.pid))
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"))
const env = { ...process.env, CI: "true", HUSKY: "0" }
function checkout(name) {
  const dir = join(releaseRoot, name)
  if (!existsSync(dir)) git("worktree", "add", "--detach", dir, commit)
  assert.equal(git("-C", dir, "rev-parse", "HEAD"), commit)
  return dir
}
function run(label, cmd, args, cwd) {
  const log = join(releaseRoot, label + ".log")
  console.log(`${label} → ${log}`)
  const fd = openSync(log, "w", 0o600)
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env, stdio: ["ignore", fd, fd] })
    closeSync(fd)
    p.on("error", reject)
    p.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${label} exited ${code}. See ${log}`)),
    )
  })
}
async function build(platform, src) {
  const dir = join(releaseRoot, platform + "-files")
  const receipt = join(releaseRoot, platform + ".json")
  mkdirSync(dir, { recursive: true })
  if (existsSync(receipt)) {
    const recorded = readJson(receipt)
    if (
      Object.entries(recorded).every(
        ([name, hash]) =>
          existsSync(join(dir, name)) && digest(join(dir, name)) === hash,
      )
    ) {
      console.log(`Reusing verified ${platform} build`)
      return dir
    }
  }
  await run(
    platform,
    "bash",
    ["scripts/release/build-local.sh", platform, version, dir, cache],
    src,
  )
  const hashes = Object.fromEntries(
    readdirSync(dir).map((name) => [name, digest(join(dir, name))]),
  )
  assert.ok(Object.keys(hashes).length)
  writeFileSync(receipt, JSON.stringify(hashes))
  return dir
}
function comment(name, body) {
  const path = join(releaseRoot, name + ".md")
  writeFileSync(path, body)
  gh("pr", "comment", number, "--repo", repository, "--body-file", path)
}
async function advise(src) {
  const result = []
  for (const suite of ["macos", "android", "iPhone", "iPad"]) {
    try {
      await run(
        "e2e-" + suite,
        "bash",
        ["scripts/release/advisory.sh", suite, releaseRoot, cache],
        src,
      )
      result.push(`- ${suite}: passed`)
    } catch {
      result.push(
        `- ⚠️ ${suite}: failed or unavailable. Release Mac log: e2e-${suite}.log`,
      )
    }
    comment(
      "e2e-" + suite,
      `Local E2E for \`${commit}\`\n\n${result.at(-1)}\n\nLogs: release Mac, \`pr-${number}-${commit}/\`.\n`,
    )
  }
}
async function refreshQA() {
  // Only retry the single gate that ran before the Mac finished uploading.
  const deadline = Date.now() + 3 * 3600_000
  while (Date.now() < deadline) {
    const run = prRuns("quality", identity)[0]
    if (!run) return
    const job = api(`actions/runs/${run.id}/jobs?per_page=100`).jobs.find(
      (j) => j.name === "QA",
    )
    if (!job || job.status === "queued" || job.conclusion === "success") return
    if (
      job.status === "completed" &&
      !job.steps.some(
        (s) =>
          s.name === "Require release candidate for this commit" &&
          s.conclusion === "failure",
      )
    )
      return
    if (run.status === "completed" && job.status === "completed") {
      gh(
        "run",
        "rerun",
        String(run.id),
        "--repo",
        repository,
        "--job",
        String(job.id),
      )
      return
    }
    await delay(15000)
  }
  throw new Error("QA did not finish. Re-run its candidate check on GitHub.")
}
async function main() {
  const source = checkout("src")
  const simulator = checkout("sim-src")
  const appVersion = readJson(join(source, "my-reader-mobile/app.json")).expo
    .version
  assert.equal(version, appVersion)
  assert.equal(
    version,
    readJson(join(source, "my-reader/src-tauri/tauri.conf.json")).version,
  )
  // EAS local builds read the project environment from the invoking process.
  const vars = api("actions/variables").variables
  const sentry = vars.find((v) => v.name === "EXPO_PUBLIC_SENTRY_DSN")
  if (sentry) env.EXPO_PUBLIC_SENTRY_DSN = sentry.value
  const previous = api(`commits/${commit}/status`).statuses.find(
    (s) => s.context === statusContext,
  )
  if (previous?.state === "success" && previous.target_url === pr.html_url) {
    verifyUploadedRelease(assets, draft(candidateTag), candidateTag)
    assert.equal(
      previous.description,
      `sha256:${digest(join(assets, evidenceFile))}`,
    )
    await refreshQA()
    return
  }
  setStatus(identity, "pending", "Building release candidate")
  let ready = false
  try {
    const install = (dir) =>
      run(
        dir === source ? "dependencies" : "sim-dependencies",
        "pnpm",
        ["install", "--frozen-lockfile", "--prefer-offline"],
        dir,
      )
    const sharedInstall = install(source)
    const windows = join(releaseRoot, "windows")
    mkdirSync(windows, { recursive: true })
    const pending = [
      windowsDownload(identity, windows),
      sharedInstall.then(() => build("macos", source)),
      sharedInstall.then(() => build("android", source)),
      sharedInstall.then(() => build("ios", source)),
      install(simulator).then(() => build("simulator", simulator)),
    ]
    const results = await Promise.allSettled(pending)
    const failures = results.filter((r) => r.status === "rejected")
    if (failures.length)
      throw new Error(failures.map((r) => r.reason.message).join("\n"))
    assert.equal(
      readFileSync(join(windows, "commit.txt"), "utf8").trim(),
      commit,
    )
    const [windowsResult, ...localResults] = results
    for (const dir of [windows, ...localResults.map((r) => r.value)]) {
      for (const file of readdirSync(dir))
        if (file !== "commit.txt")
          copyFileSync(join(dir, file), join(assets, file))
    }
    const manifest = manifestFor(assets, identity, windowsResult.value)
    writeFileSync(
      join(assets, evidenceFile),
      JSON.stringify(manifest, null, 2) + "\n",
    )
    openPR(number, commit)
    const existing = JSON.parse(
      gh(
        "api",
        "--paginate",
        "--slurp",
        `repos/${repository}/releases?per_page=100`,
      ),
    )
      .flat()
      .find((r) => r.tag_name === candidateTag)
    if (existing)
      assert.ok(existing.draft && existing.target_commitish === commit)
    else
      gh(
        "release",
        "create",
        candidateTag,
        "--repo",
        repository,
        "--draft",
        "--target",
        commit,
        "--title",
        `Candidate for PR #${number}`,
        "--notes",
        `Candidate for ${pr.html_url} at ${commit}.`,
      )
    gh(
      "release",
      "upload",
      candidateTag,
      ...readdirSync(assets).map((f) => join(assets, f)),
      "--clobber",
      "--repo",
      repository,
    )
    verifyUploadedRelease(assets, draft(candidateTag), candidateTag)
    openPR(number, commit)
    setStatus(
      identity,
      "success",
      `sha256:${digest(join(assets, evidenceFile))}`,
    )
    ready = true
    comment(
      "candidate",
      `Candidate for **v${version}** at \`${commit}\` uploaded. All five installers, the APK checksum, IPA and simulator archive match their server-side SHA-256. [Windows build](https://github.com/${repository}/actions/runs/${manifest.windowsRun}). Local E2E reports follow as advisory comments.\n`,
    )
    await Promise.all([refreshQA(), advise(source)])
  } catch (error) {
    if (!ready)
      setStatus(
        identity,
        "failure",
        "Release candidate incomplete. See the release Mac logs.",
      )
    throw error
  }
}
try {
  await main()
} finally {
  rmSync(lock, { recursive: true })
}
