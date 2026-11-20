import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { lstatSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

export const evidenceFile = "release-evidence.json"

export function candidateIdentity(pr, repository, tree) {
  assert.ok(
    pr.base.ref === "main" &&
      pr.head.repo?.full_name === repository &&
      pr.base.repo.full_name === repository,
    "Expected a same-repository release PR into main",
  )
  const version =
    /^release\/((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(
      pr.head.ref,
    )?.[1]
  assert.ok(version, "Expected release/<major.minor.patch>")
  assert.ok(Number.isSafeInteger(pr.number) && pr.number > 0)
  const commit = pr.head.sha
  for (const hash of [commit, tree]) assert.match(hash, /^[a-f0-9]{40}$/)
  return {
    schema: 1,
    repository,
    pr: pr.number,
    commit,
    tree,
    version,
    candidateTag: `candidate-pr-${pr.number}-${commit}`,
  }
}

export function releaseFiles(version) {
  const prefix = `MyReader_${version}_`
  const apk = `MyReader-${version}-android.apk`
  return {
    installers: [
      prefix + "aarch64.dmg",
      prefix + "x64.dmg",
      prefix + "x64_en-US.msi",
      prefix + "x64-setup.exe",
      apk,
    ],
    checksum: apk + ".sha256",
    ipa: `MyReader-${version}-ios.ipa`,
    simulator: "MyReader-iOS-simulator.tar.gz",
  }
}

export function digest(file) {
  assert.ok(
    lstatSync(file).isFile() && lstatSync(file).size > 0,
    `Missing or empty file: ${file}`,
  )
  return createHash("sha256").update(readFileSync(file)).digest("hex")
}

export function manifestFor(directory, identity, windowsRun) {
  assert.ok(Number.isSafeInteger(windowsRun) && windowsRun > 0)
  const { installers, checksum, ipa, simulator } = releaseFiles(
    identity.version,
  )
  const names = [...installers, checksum, ipa, simulator]
  assert.deepEqual(
    readdirSync(directory)
      .filter((name) => name !== evidenceFile)
      .sort(),
    names.sort(),
    "Unexpected or missing candidate files",
  )
  const hashes = (entries) =>
    Object.fromEntries(
      entries.map((name) => [name, digest(join(directory, name))]),
    )
  const assets = hashes([...installers, checksum])
  const apk = checksum.slice(0, -7)
  assert.equal(
    readFileSync(join(directory, checksum), "utf8").trim(),
    `${assets[apk]}  ${apk}`,
    "APK checksum mismatch",
  )
  return {
    ...identity,
    windowsRun,
    assets,
    privateAssets: hashes([ipa, simulator]),
    e2e: {
      policy: "advisory",
      report: `https://github.com/${identity.repository}/pull/${identity.pr}`,
    },
  }
}

export function verifyCandidate(directory, identity, approvedDigest) {
  assert.equal(
    digest(join(directory, evidenceFile)),
    approvedDigest,
    "Evidence differs from the candidate approved on the PR",
  )
  const manifest = JSON.parse(
    readFileSync(join(directory, evidenceFile), "utf8"),
  )
  assert.deepEqual(
    manifest,
    manifestFor(directory, identity, manifest.windowsRun),
    "Candidate bytes or identity differ from the approved release",
  )
  return manifest
}
