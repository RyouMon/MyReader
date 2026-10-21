import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function validateEvidence(report, commit, suite) {
  assert.equal(report.commit, commit, "Evidence belongs to another commit")
  assert.match(
    report.sha256,
    /^[a-f0-9]{64}$/,
    "Missing installed application digest",
  )
  assert.deepEqual(report.suite, suite, "The complete suite did not execute")
}

export function validateBrowserReport(report) {
  assert.ok(report.stats.expected > 0, "No browser tests executed")
  for (const key of ["unexpected", "skipped", "flaky"])
    assert.equal(report.stats[key], 0, `Browser tests contain ${key} cases`)
  assert.deepEqual(report.errors, [], "Browser runner reported an error")
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : [join(directory, entry.name)],
  )
}

function one(paths, suffix) {
  const matches = paths.filter((path) => path.endsWith(suffix))
  assert.equal(
    matches.length,
    1,
    `Expected one ${suffix}, got ${matches.length}`,
  )
  return matches[0]
}

export function prepareCandidate(assetDirectory, reportDirectory, commit) {
  const mobile = JSON.parse(
    readFileSync(
      new URL("../../my-reader-mobile/e2e/release-suite.json", import.meta.url),
      "utf8",
    ),
  )
  const desktop = JSON.parse(
    readFileSync(
      new URL("../../my-reader/e2e-native/suite.json", import.meta.url),
      "utf8",
    ),
  )
  const assets = files(assetDirectory)
  // Two macOS architectures, two Windows installers, three Linux packages and the tested APK.
  for (const [extension, count] of [
    [".dmg", 2],
    [".msi", 1],
    [".exe", 1],
    [".AppImage", 1],
    [".deb", 1],
    [".rpm", 1],
    [".apk", 1],
  ]) {
    assert.equal(
      assets.filter((path) => path.endsWith(extension)).length,
      count,
      `Missing or duplicate release asset: ${extension}`,
    )
  }
  const digests = Object.fromEntries(
    assets
      .filter((path) => !path.endsWith(".sha256"))
      .map((path) => [
        basename(path),
        createHash("sha256").update(readFileSync(path)).digest("hex"),
      ]),
  )
  assert.equal(Object.keys(digests).length, 8, "Unexpected release assets")
  const apk = one(assets, ".apk")
  assert.equal(
    readFileSync(`${apk}.sha256`, "utf8").trim().split(/\s+/)[0],
    digests[basename(apk)],
    "APK checksum mismatch",
  )
  let iosDigest
  for (const [name, platform] of [
    ["android", "android"],
    ["ios-iPhone", "ios"],
    ["ios-iPad", "ios"],
  ]) {
    const paths = files(join(reportDirectory, `e2e-mobile-${name}`))
    const report = JSON.parse(readFileSync(one(paths, "passed.json"), "utf8"))
    validateEvidence(report, commit, mobile[platform])
    assert.equal(report.platform, platform)
    if (platform === "android")
      assert.equal(
        report.sha256,
        digests[basename(apk)],
        "Tested APK differs from the release APK",
      )
    else {
      if (iosDigest)
        assert.equal(
          report.sha256,
          iosDigest,
          "iPhone and iPad tested different apps",
        )
      iosDigest = report.sha256
    }
  }
  for (const [runner, platform] of [
    ["ubuntu-22.04", "linux"],
    ["windows-latest", "win32"],
    ["macos-latest", "darwin"],
  ]) {
    const paths = files(join(reportDirectory, `e2e-desktop-${runner}`))
    const report = JSON.parse(readFileSync(one(paths, "passed.json"), "utf8"))
    validateEvidence(report, commit, desktop)
    assert.equal(report.platform, platform)
    for (const file of ["/reports/report.json", "/reports/integration.json"]) {
      validateBrowserReport(JSON.parse(readFileSync(one(paths, file), "utf8")))
    }
  }
  const manifest = { commit, assets: digests, iosSimulatorSha256: iosDigest }
  writeFileSync(
    join(assetDirectory, "release-evidence.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return manifest
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [assets, reports, commit] = process.argv.slice(2)
  assert.ok(
    assets && reports && commit,
    "Usage: candidate.mjs <assets> <reports> <commit>",
  )
  prepareCandidate(assets, reports, commit)
}
