import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
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

import { classifyChangedPaths, writeOutputs } from "./changed-areas.mjs"

test("classifies native and dependency changes without enabling unrelated jobs", () => {
  assert.deepEqual(
    classifyChangedPaths([
      "my-reader/src/components/reader/Reader.tsx",
      "my-reader-mobile/modules/readium/ios/Tests/ReaderTests.swift",
      ".github/workflows/quality.yml",
    ]),
    {
      android: false,
      coverage: true,
      ios: false,
      js: true,
      mutation: false,
      rust: false,
      security: false,
      swift: true,
    },
  )
})

test("documentation and workflow-only changes keep static QA without unrelated language jobs", () => {
  assert.ok(
    Object.values(
      classifyChangedPaths([
        "docs/QUALITY.md",
        ".github/workflows/quality.yml",
      ]),
    ).every((enabled) => !enabled),
  )
})

for (const [file, enabled] of [
  ["my-reader-mobile/modules/readium/src/ReadiumView.tsx", ["js"]],
  ["my-reader-mobile/jest.setup.js", ["js"]],
  ["my-reader/vitest.config.ts", ["js"]],
  [
    "my-reader-mobile/modules/readium/scripts/readium_post_install.rb",
    ["swift", "ios"],
  ],
  [
    "my-reader-mobile/modules/readium/ios/Readium.podspec",
    ["swift", "ios", "security"],
  ],
  ["my-reader-mobile/plugins/with-ios-toolchain.js", ["js", "swift", "ios"]],
  ["my-reader-mobile/plugins/with-android-toolchain.js", ["js", "android"]],
  [
    "my-reader-mobile/tests/native-sharing/android/SharingImagesTest.kt",
    ["android"],
  ],
  [
    "my-reader-mobile/modules/readium/android/build.gradle",
    ["android", "security"],
  ],
  ["my-reader-mobile/modules/my-reader-core/rust/src/lib.rs", ["rust"]],
  ["scripts/quality/native-coverage.py", ["swift", "android"]],
  ["scripts/quality/readium-ios-dependencies.rb", ["ios"]],
  ["scripts/generate-reader-viewport-anchor.mjs", ["swift", "android"]],
  ["Cargo.lock", ["rust", "security"]],
  [".cargo/config.toml", ["rust"]],
]) {
  test(`selects the affected jobs for ${file}`, () => {
    const areas = classifyChangedPaths([file])
    assert.deepEqual(
      Object.entries(areas)
        .filter(([key, active]) => key !== "coverage" && active)
        .map(([key]) => key)
        .sort(),
      [...enabled].sort(),
    )
  })
}

test("PR detection handles renames and Unicode paths without including unrelated base changes", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "myreader-changes-"))
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: "pipe",
    }).trim()
  const add = (file) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), "fixture\n")
  }
  try {
    git("init", "-b", "main")
    git("config", "user.name", "Quality tests")
    git("config", "user.email", "quality@example.invalid")
    add("my-reader-mobile/modules/readium/ios/角色.swift")
    git("add", ".")
    git("commit", "-m", "base")
    git("checkout", "-b", "feature")
    add("my-reader-mobile/modules/readium/android/角色.kt")
    git("rm", "my-reader-mobile/modules/readium/ios/角色.swift")
    git("add", ".")
    git("commit", "-m", "move")
    const head = git("rev-parse", "HEAD")
    git("checkout", "main")
    add("my-reader-core/src/lib.rs")
    git("add", ".")
    git("commit", "-m", "unrelated base change")
    const base = git("rev-parse", "HEAD")
    const eventPath = path.join(dir, "event.json")
    const outputPath = path.join(dir, "output.txt")
    const detect = (event) => {
      writeFileSync(eventPath, JSON.stringify(event))
      writeFileSync(outputPath, "")
      execFileSync(
        process.execPath,
        [new URL("./changed-areas.mjs", import.meta.url).pathname],
        {
          cwd: dir,
          env: {
            ...process.env,
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_OUTPUT: outputPath,
          },
          stdio: "pipe",
        },
      )
      return Object.fromEntries(
        readFileSync(outputPath, "utf8")
          .trim()
          .split("\n")
          .map((line) => line.split("=")),
      )
    }
    const result = detect({
      pull_request: { base: { sha: base }, head: { sha: head } },
    })
    assert.equal(result.swift, "true")
    assert.equal(result.android, "true")
    assert.equal(result.rust, "false")
    assert.ok(Object.values(detect({})).every((value) => value === "true"))
    assert.throws(() =>
      detect({
        pull_request: { base: { sha: "missing" }, head: { sha: head } },
      }),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("shared tools and dependency changes enable their required checks", () => {
  assert.deepEqual(
    classifyChangedPaths([
      "packages/tools/src/reader-text.ts",
      "pnpm-lock.yaml",
    ]),
    {
      android: true,
      coverage: true,
      ios: true,
      js: true,
      mutation: true,
      rust: false,
      security: true,
      swift: true,
    },
  )
})

test("native source changes do not run the clean iOS dependency installation", () => {
  assert.deepEqual(
    classifyChangedPaths([
      "my-reader-mobile/modules/readium/ios/Tests/ReaderStartLocationTests.swift",
      "my-reader-mobile/modules/readium/ios/Reader/EPUB/EPUBViewController.swift",
    ]),
    {
      android: false,
      coverage: true,
      ios: false,
      js: false,
      mutation: false,
      rust: false,
      security: false,
      swift: true,
    },
  )
})

test("iOS and Android dependency changes select only their native dependency jobs", () => {
  assert.deepEqual(
    classifyChangedPaths([
      "my-reader-mobile/modules/readium/ios/Readium.podspec",
      "my-reader-mobile/android/gradle.properties",
    ]),
    {
      android: true,
      coverage: true,
      ios: true,
      js: false,
      mutation: false,
      rust: false,
      security: true,
      swift: true,
    },
  )
})

test("workflow output can be asserted without a GitHub runner", () => {
  assert.equal(
    writeOutputs(
      {
        android: false,
        coverage: false,
        ios: false,
        js: false,
        mutation: true,
        rust: false,
        security: true,
        swift: false,
      },
      null,
    ),
    "android=false\ncoverage=false\nios=false\njs=false\nmutation=true\nrust=false\nsecurity=true\nswift=false",
  )
})
