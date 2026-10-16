import assert from "node:assert/strict"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  changedLines,
  inputs,
  mergeCoverage,
  normalizeCoverage,
  parseLcov,
  patchLineMap,
  prepareReports,
  requireChangedCoverage,
  requireChangedSources,
  summarizeChanges,
  writeLcov,
} from "./coverage-reports.mjs"

test("changed-line coverage rejects any language below 80%, without rounding or averaging", () => {
  const passing = Object.fromEntries(
    ["js", "rust", "swift", "android"].map((key) => [
      key,
      { changed: 10, covered: 8 },
    ]),
  )
  assert.doesNotThrow(() => requireChangedCoverage(passing))
  for (const key of Object.keys(passing)) {
    assert.throws(
      () =>
        requireChangedCoverage({
          ...passing,
          [key]: { changed: 10000, covered: 7999 },
        }),
      new RegExp(key),
    )
    assert.throws(
      () => requireChangedCoverage({ ...passing, [key]: undefined }),
      /missing/i,
    )
  }
  assert.doesNotThrow(() =>
    requireChangedCoverage({ ...passing, rust: { changed: 0, covered: 0 } }),
  )
})

test("unreported changed product sources fail instead of silently becoming N/A", () => {
  const files = new Set(["my-reader/src/lib/reader-image.ts"])
  const changes = new Map([
    ["my-reader/src/lib/reader-image.ts", new Set([1])],
    [
      "my-reader-mobile/modules/book-transition/ios/Transition.swift",
      new Set([1]),
    ],
  ])
  assert.throws(
    () => requireChangedSources(files, changes, () => "func exportImage() {}"),
    /Transition.swift/,
  )
  changes.delete(
    "my-reader-mobile/modules/book-transition/ios/Transition.swift",
  )
  changes.set("my-reader/src-tauri/src/commands/mod.rs", new Set([1]))
  changes.set("my-reader/src/lib/reader-image.test.ts", new Set([1]))
  assert.doesNotThrow(() =>
    requireChangedSources(files, changes, () => "pub mod reader_image;"),
  )
  assert.throws(
    () =>
      requireChangedSources(files, changes, () => "pub fn export_image() {}"),
    /mod.rs/,
  )
})

const record = (file, lines = "DA:10,0\nDA:11,1") =>
  `SF:${file}\n${lines}\nend_of_record\n`
const patch =
  "diff --git a/ios/Sharing.swift b/ios/Sharing.swift\n--- a/ios/Sharing.swift\n+++ b/ios/Sharing.swift\n@@ -8,2 +8,3 @@\n context\n-old\n+new\n+added\n"
const sharingPatch = {
  file: "patches/expo-sharing@57.0.22.patch",
  lines: patchLineMap(patch),
}

test("coverage reports retain uncovered instructions and merge unit/device hits without double counting", () => {
  const coverage = parseLcov(record("reader.kt"))
  mergeCoverage(
    coverage,
    parseLcov(record("reader.kt", "DA:10,1\nDA:11,0\nDA:12,0")),
  )
  const report = writeLcov(coverage)
  assert.match(report, /DA:10,1\nDA:11,1\nDA:12,0\nLF:3\nLH:2/)
  assert.deepEqual(parseLcov(report), coverage)
})

test("missing, empty, truncated and invalid compiler reports fail instead of reporting 100%", () => {
  for (const text of [
    "",
    "SF:test.kt\nend_of_record\n",
    "SF:test.kt\nDA:1,0",
    record("a", "DA:0,2"),
    record("a", "DA:1,-1"),
    record("a", "DA:1,NaN"),
  ]) {
    assert.throws(() => parseLcov(text))
  }
})

test("runner-specific paths normalize to the same repository source", () => {
  const source =
    "my-reader-mobile/modules/readium/ios/Reader/ReaderImageExport.swift"
  for (const prefix of [
    "/Users/runner/work/MyReader/",
    "D:\\a\\MyReader\\",
    "",
  ]) {
    const file = prefix.includes("\\") ? source.replaceAll("/", "\\") : source
    const normalized = normalizeCoverage(
      parseLcov(record(prefix + file)),
      "swift",
      "",
      sharingPatch,
    )
    assert.deepEqual([...normalized.keys()], [source])
  }
  const js = normalizeCoverage(
    parseLcov(record("src/index.ts")),
    "js",
    "packages/fonts",
    sharingPatch,
  )
  assert.deepEqual([...js.keys()], ["packages/fonts/src/index.ts"])
})

test("patched native dependency coverage maps only authored additions to reviewable patch lines", () => {
  const report = record(
    "/workspace/node_modules/.pnpm/expo-sharing/node_modules/expo-sharing/ios/Sharing.swift",
    "DA:8,100\nDA:9,0\nDA:10,1\nDA:20,100",
  )
  const normalized = normalizeCoverage(
    parseLcov(report),
    "swift",
    "",
    sharingPatch,
  )
  assert.deepEqual(
    [...normalized],
    [
      [
        sharingPatch.file,
        new Map([
          [7, 0],
          [8, 1],
        ]),
      ],
    ],
  )
})

test("multiple files in one dependency patch retain both sets of covered and missed instructions", () => {
  const more = `${patch}\ndiff --git a/ios/Options.swift b/ios/Options.swift\n--- a/ios/Options.swift\n+++ b/ios/Options.swift\n@@ -1,0 +2,1 @@\n+option\n`
  const mapping = { ...sharingPatch, lines: patchLineMap(more) }
  const reports =
    record("/node_modules/expo-sharing/ios/Sharing.swift", "DA:9,0") +
    record("/node_modules/expo-sharing/ios/Options.swift", "DA:2,1")
  const combined = normalizeCoverage(parseLcov(reports), "swift", "", mapping)
  assert.equal(combined.get(sharingPatch.file).size, 2)
  assert.deepEqual([...combined.get(sharingPatch.file).values()], [0, 1])
})

test("no measured executable changes are distinguishable from 100% coverage", () => {
  const changes = changedLines(
    "--- a/reader.kt\n+++ b/reader.kt\n@@ -9,2 +9,3 @@\n context\n-old\n+new\n+comment\n",
  )
  assert.deepEqual([...changes.get("reader.kt")], [10, 11])
  assert.equal(
    summarizeChanges(parseLcov(record("reader.kt", "DA:10,0")), changes)
      .changed,
    1,
  )
  assert.equal(
    summarizeChanges(parseLcov(record("other.kt")), changes).changed,
    0,
  )
})

test("native reports exclude generated code, tests and upstream libraries", () => {
  const root = "my-reader-mobile/modules/readium/ios/"
  const report = [
    "Tests/ReaderTests.swift",
    "Reader/EPUB/GeneratedReaderViewportAnchorScript.swift",
    "Reader/ReaderImageExport.swift",
  ]
    .map((name) => record(root + name))
    .join("")
  const result = normalizeCoverage(parseLcov(report), "swift", "", sharingPatch)
  assert.deepEqual(
    [...result.keys()],
    [`${root}Reader/ReaderImageExport.swift`],
  )
  assert.throws(
    () =>
      normalizeCoverage(
        parseLcov(record("/Pods/ReadiumNavigator/Reader.swift")),
        "swift",
        "",
        sharingPatch,
      ),
    /No swift source/,
  )
})

test("the report bundle requires every producer, including Android device and patched sharing reports", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "myreader-coverage-"))
  try {
    mkdirSync(path.join(dir, "patches"))
    writeFileSync(path.join(dir, sharingPatch.file), patch)
    const input = path.join(dir, "input")
    const output = path.join(dir, "output")
    for (const [group, file] of inputs) {
      const source =
        group === "swift"
          ? "my-reader-mobile/modules/readium/ios/Reader/ReaderImageExport.swift"
          : group === "android"
            ? "my-reader-mobile/modules/readium/android/src/main/java/Reader.kt"
            : group === "rust"
              ? "my-reader-core/src/lib.rs"
              : "src/index.ts"
      mkdirSync(path.dirname(path.join(input, file)), { recursive: true })
      writeFileSync(path.join(input, file), record(source))
    }
    prepareReports(input, output, dir)
    for (const group of ["js", "rust", "swift", "android"])
      assert.ok(
        parseLcov(readFileSync(path.join(output, `${group}.info`), "utf8"))
          .size,
      )
    rmSync(path.join(input, "android-coverage-report/readium-device.info"))
    assert.throws(() => prepareReports(input, output, dir), /ENOENT/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
