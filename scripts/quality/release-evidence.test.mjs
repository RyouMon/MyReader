import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import {
  prepareCandidate,
  validateBrowserReport,
  validateEvidence,
} from "../release/candidate.mjs"

test("release evidence rejects an old commit, partial suites and missing artifact identity", () => {
  const suite = ["import", "read", "restore"]
  const passing = { commit: "candidate", sha256: "a".repeat(64), suite }
  validateEvidence(passing, "candidate", suite)
  assert.throws(
    () => validateEvidence(passing, "new-head", suite),
    /another commit/,
  )
  assert.throws(
    () =>
      validateEvidence({ ...passing, suite: ["import"] }, "candidate", suite),
    /complete suite/,
  )
  assert.throws(
    () => validateEvidence({ ...passing, sha256: "" }, "candidate", suite),
    /digest/,
  )
})

test("release candidates retain assets for E2E review without relaxing artifact integrity", () => {
  const root = mkdtempSync(join(tmpdir(), "myreader-release-"))
  try {
    const assets = join(root, "assets")
    const evidence = join(root, "evidence")
    mkdirSync(assets)
    const apk = "MyReader.apk"
    const digest = createHash("sha256").update("release payload").digest("hex")
    for (const name of [
      "arm.dmg",
      "intel.dmg",
      "msi/app.msi",
      "nsis/app.exe",
      "appimage/app.AppImage",
      "deb/app.deb",
      "rpm/app.rpm",
      apk,
    ]) {
      mkdirSync(dirname(join(assets, name)), { recursive: true })
      writeFileSync(join(assets, name), "release payload")
    }
    writeFileSync(join(assets, `${apk}.sha256`), `${digest}  ${apk}\n`)
    const mobile = JSON.parse(
      readFileSync(
        new URL(
          "../../my-reader-mobile/e2e/release-suite.json",
          import.meta.url,
        ),
      ),
    )
    const desktop = JSON.parse(
      readFileSync(
        new URL("../../my-reader/e2e-native/suite.json", import.meta.url),
      ),
    )
    const report = (name, platform, suite) => {
      const directory = join(evidence, name, "reports")
      mkdirSync(directory, { recursive: true })
      writeFileSync(
        join(directory, "passed.json"),
        JSON.stringify({ commit: "head", platform, suite, sha256: digest }),
      )
      return directory
    }
    report("e2e-mobile-android", "android", mobile.android)
    report("e2e-mobile-ios-iPhone", "ios", mobile.ios)
    report("e2e-mobile-ios-iPad", "ios", mobile.ios)
    for (const [runner, platform] of [
      ["windows-latest", "win32"],
      ["macos-latest", "darwin"],
    ]) {
      const directory = report(`e2e-desktop-${runner}`, platform, desktop)
      for (const name of ["report.json", "integration.json"]) {
        writeFileSync(
          join(directory, name),
          JSON.stringify({
            stats: { expected: 12, unexpected: 0, skipped: 0, flaky: 0 },
            errors: [],
          }),
        )
      }
    }
    const manifest = prepareCandidate(assets, evidence, "head")
    assert.equal(manifest.e2e.status, "passed")
    assert.equal(manifest.e2e.results.length, 5)
    assert.equal(manifest.assets[apk], digest)
    assert.deepEqual(
      readdirSync(assets).sort(),
      [
        ...Object.keys(manifest.assets),
        `${apk}.sha256`,
        "release-evidence.json",
      ].sort(),
    )
    for (const name of Object.keys(manifest.assets))
      assert.equal(readFileSync(join(assets, name), "utf8"), "release payload")
    rmSync(join(assets, "release-evidence.json"))
    mkdirSync(join(assets, "nested"))
    writeFileSync(join(assets, "nested/arm.dmg"), "conflicting installer")
    rmSync(join(assets, "intel.dmg"))
    assert.throws(() => prepareCandidate(assets, evidence, "head"), /unique/)
    assert.equal(
      readFileSync(join(assets, "arm.dmg"), "utf8"),
      "release payload",
    )
    rmSync(join(assets, "nested"), { recursive: true })
    writeFileSync(join(assets, "intel.dmg"), "release payload")
    writeFileSync(join(assets, apk), "untested replacement")
    assert.throws(
      () => prepareCandidate(assets, evidence, "head"),
      /checksum mismatch/,
    )
    const replacementDigest = createHash("sha256")
      .update("untested replacement")
      .digest("hex")
    writeFileSync(
      join(assets, `${apk}.sha256`),
      `${replacementDigest}  ${apk}\n`,
    )
    assert.throws(
      () => prepareCandidate(assets, evidence, "head"),
      /Tested APK differs/,
    )
    assert.throws(
      () => prepareCandidate(assets, evidence, "head", { advisory: true }),
      /Tested APK differs/,
    )
    writeFileSync(join(assets, apk), "release payload")
    writeFileSync(join(assets, `${apk}.sha256`), `${digest}  ${apk}\n`)
    rmSync(join(evidence, "e2e-desktop-windows-latest"), { recursive: true })
    assert.throws(() => prepareCandidate(assets, evidence, "head"), /ENOENT/)
    const reviewed = prepareCandidate(assets, evidence, "head", {
      advisory: true,
      sourceRun: { id: "123", attempt: "1" },
    })
    assert.equal(reviewed.e2e.status, "review-required")
    assert.deepEqual(reviewed.sourceRun, { id: "123", attempt: "1" })
    assert.equal(
      reviewed.e2e.results.filter((result) => result.status === "passed")
        .length,
      4,
    )
    assert.match(reviewed.e2e.results.at(-2).reason, /ENOENT/)
    assert.equal(readFileSync(join(assets, apk), "utf8"), "release payload")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("browser release gate rejects failures, retries, skipped tests and empty runs", () => {
  const stats = { expected: 10, unexpected: 0, flaky: 0, skipped: 0 }
  validateBrowserReport({ stats, errors: [] })
  for (const key of ["unexpected", "flaky", "skipped"]) {
    assert.throws(() =>
      validateBrowserReport({ stats: { ...stats, [key]: 1 }, errors: [] }),
    )
  }
  assert.throws(() =>
    validateBrowserReport({ stats: { ...stats, expected: 0 }, errors: [] }),
  )
  assert.throws(() =>
    validateBrowserReport({ stats, errors: [{ message: "runner crashed" }] }),
  )
})
