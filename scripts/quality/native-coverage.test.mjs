import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { parseLcov } from "./coverage-reports.mjs"

const script = new URL("./native-coverage.py", import.meta.url)
function run(...args) {
  return execFileSync("python3", [script.pathname, ...args], {
    encoding: "utf8",
    stdio: "pipe",
  })
}

test("JaCoCo export preserves missed Java/Kotlin instructions and rejects ambiguous source mappings", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "myreader-jacoco-"))
  try {
    const sources = path.join(dir, "src")
    mkdirSync(sources)
    for (const file of ["Reader.kt", "Sharing.java"])
      writeFileSync(path.join(sources, file), "package reader;\n")
    const report = path.join(dir, "report.xml")
    const output = path.join(dir, "lcov.info")
    writeFileSync(
      report,
      '<report><package name="reader"><sourcefile name="Reader.kt"><line nr="10" ci="0" mi="5"/><line nr="11" ci="2" mi="1"/></sourcefile><sourcefile name="Sharing.java"><line nr="20" ci="3" mi="0"/></sourcefile><sourcefile name="InlinedDependency.kt"><line nr="5" ci="4"/></sourcefile></package></report>',
    )
    run("jacoco", report, output, sources)
    const files = parseLcov(readFileSync(output, "utf8"))
    assert.equal(files.size, 2)
    assert.deepEqual(
      files.get(realpathSync(path.join(sources, "Reader.kt"))),
      new Map([
        [10, 0],
        [11, 1],
      ]),
    )
    assert.deepEqual(
      files.get(realpathSync(path.join(sources, "Sharing.java"))),
      new Map([[20, 1]]),
    )
    mkdirSync(path.join(sources, "duplicate"))
    writeFileSync(path.join(sources, "duplicate/Reader.kt"), "package reader\n")
    assert.throws(
      () => run("jacoco", report, output, sources),
      /Ambiguous JaCoCo source/,
    )
    writeFileSync(report, "<report/>")
    assert.throws(
      () => run("jacoco", report, output, path.join(dir, "empty")),
      /Empty JaCoCo report/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("Swift coverage instruments production targets while preserving the full native test scheme", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "myreader-swift-"))
  try {
    const schemes = path.join(dir, "xcuserdata/runner.xcuserdatad/xcschemes")
    mkdirSync(schemes, { recursive: true })
    writeFileSync(
      path.join(schemes, "Readium-Unit-Tests.xcscheme"),
      '<Scheme><TestAction><Testables><TestableReference name="all-native-tests"/></Testables></TestAction></Scheme>',
    )
    for (const name of ["Readium", "ExpoSharing"])
      writeFileSync(
        path.join(schemes, `${name}.xcscheme`),
        `<Scheme><BuildAction><BuildableReference BlueprintName="${name}"/></BuildAction></Scheme>`,
      )
    run("prepare-swift", "--project", dir)
    const generated = path.join(
      dir,
      "xcshareddata/xcschemes/Reader-Coverage.xcscheme",
    )
    const first = readFileSync(generated, "utf8")
    run("prepare-swift", "--project", dir)
    assert.equal(readFileSync(generated, "utf8"), first)
    assert.match(first, /codeCoverageEnabled="YES"/)
    assert.match(first, /all-native-tests/)
    assert.match(first, /BlueprintName="Readium"/)
    assert.match(first, /BlueprintName="ExpoSharing"/)
    assert.throws(
      () => run("swift-llvm", dir, "simulator", path.join(dir, "lcov.info")),
      /profile or instrumented test binary missing/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
