import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parse } from "yaml"
import { classifyChangedPaths } from "./changed-areas.mjs"

const { jobs } = parse(
  readFileSync(
    new URL("../../.github/workflows/quality.yml", import.meta.url),
    "utf8",
  ),
)
const jobAreas = {
  unit: "js",
  coverage: "js",
  mutation: "mutation",
  rust: "rust",
  "rust-coverage": "rust",
  "rust-desktop-coverage": "rust",
  "swift-coverage": "swift",
  "android-coverage": "android",
  "ios-dependencies": "ios",
  security: "security",
  "coverage-report": "coverage",
}

test("conditional jobs depend on the correct detected area", () => {
  for (const [job, area] of Object.entries(jobAreas)) {
    assert.ok(jobs[job].needs.includes("changed-areas"), job)
    assert.ok(
      jobs[job].if.includes(`needs.changed-areas.outputs.${area} == 'true'`),
      job,
    )
  }
})

test("Swift coverage reuses native build work without reusing coverage data", () => {
  const swift = jobs["swift-coverage"]
  assert.equal(swift["runs-on"], "macos-26")
  assert.equal(swift.env.USE_CCACHE, "1")
  assert.equal(swift.env.CCACHE_COMPILERCHECK, "content")
  assert.ok(swift.steps.some((step) => step.name === "Restore compiler cache"))
  assert.ok(
    swift.steps.some((step) => step.name === "Restore Xcode derived data"),
  )
  const nativeTests = swift.steps.find((step) => step.id === "native-tests")
  assert.match(nativeTests.run, /READER_REACT_NATIVE_PATH=/)
  assert.match(
    nativeTests.run,
    /REACT_NATIVE_PATH="\$READER_REACT_NATIVE_PATH"/,
  )
  assert.match(nativeTests.run, /ONLY_ACTIVE_ARCH=YES/)
  assert.match(nativeTests.run, /ARCHS="\$\(uname -m\)"/)
  assert.match(nativeTests.run, /rm -rf .*ProfileData/)
  const installPods = swift.steps.find(
    (step) => step.name === "Install CocoaPods dependencies",
  )
  assert.equal(installPods.if, undefined)
  assert.equal(installPods.run, "pod install")
  for (const stepName of ["Save compiler cache", "Save Xcode derived data"]) {
    const save = swift.steps.find((step) => step.name === stepName)
    assert.match(save.if, /outputs\.cache-hit != 'true'/)
  }
})

for (const paths of [
  [],
  ["my-reader/src/reader.tsx"],
  ["my-reader-mobile/modules/readium/ios/Reader.swift"],
  ["Cargo.lock", "pnpm-lock.yaml"],
]) {
  test(`required gates reject failures and unexpected skips for ${paths.join(", ") || "docs only"}`, () => {
    const areas = classifyChangedPaths(paths)
    const results = Object.fromEntries(
      Object.entries(jobAreas).map(([job, area]) => [
        job,
        areas[area] ? "success" : "skipped",
      ]),
    )
    results.static = "success"
    results["changed-areas"] = "success"
    for (const gate of ["qa-gate", "unit-gate", "changed-coverage-gate"]) {
      assert.equal(jobs[gate].if, "always()")
      const run = (statuses) => {
        const script = jobs[gate].steps[0].run.replace(
          /\$\{\{ needs\.([\w-]+)\.(result|outputs\.\w+) \}\}/g,
          (_, job, field) =>
            field === "result" ? statuses[job] : String(areas[field.slice(8)]),
        )
        execFileSync("bash", ["-e", "-c", script], { stdio: "pipe" })
      }
      assert.doesNotThrow(() => run(results))
      for (const job of jobs[gate].needs) {
        for (const state of ["failure", "cancelled", "skipped"]) {
          if (results[job] === state) continue
          assert.throws(
            () => run({ ...results, [job]: state }),
            `${gate}: ${job} ${state}`,
          )
        }
      }
    }
  })
}
