import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parse } from "yaml"

const workflow = (name) =>
  parse(
    readFileSync(
      new URL(`../../.github/workflows/${name}.yml`, import.meta.url),
      "utf8",
    ),
  )

test("desktop release E2E runs on Windows and macOS", () => {
  const { desktop } = workflow("desktop-e2e").jobs
  assert.deepEqual(desktop.strategy.matrix.os, [
    "windows-latest",
    "macos-26-intel",
  ])
  assert.equal(desktop.strategy["fail-fast"], false)
  assert.ok((desktop.strategy["max-parallel"] ?? 2) >= 2)
  assert.equal(desktop.needs, undefined)
  const build = desktop.steps.findIndex((step) =>
    step.run?.includes("build:e2e:native"),
  )
  assert.ok(build >= 0)
  for (const command of [
    "test:integration:frontend",
    "test:e2e:frontend",
    "test:e2e:native",
  ]) {
    assert.ok(
      desktop.steps.findIndex((step) => step.run?.includes(command)) > build,
      `${command} must run after its platform's Release build`,
    )
  }
  const caller = workflow("release").jobs["desktop-e2e"]
  assert.equal(caller.needs, "verify")
  assert.match(caller.if, /inputs.review_run_id == ''/)
})

test("mobile E2E starts after its own artifact without waiting for another platform", () => {
  const mobile = workflow("mobile-build")
  const e2e = workflow("mobile-e2e")
  assert.equal(mobile.on.workflow_call.inputs.run_e2e.default, false)
  assert.equal(mobile.on.workflow_call.inputs.e2e_advisory.default, false)
  assert.equal(e2e.on.workflow_call.inputs.platform.default, "all")
  for (const [platform, build, artifact] of [
    ["android", "android", "MyReader-Android-APK"],
    ["ios", "ios-simulator", "MyReader-iOS-simulator"],
  ]) {
    const caller = mobile.jobs[`${platform}-e2e`]
    assert.equal(caller.needs, build)
    assert.equal(caller.if, `inputs.run_e2e && inputs.build_${platform}`)
    assert.equal(caller.uses, "./.github/workflows/mobile-e2e.yml")
    assert.equal(caller.with.platform, platform)
    assert.equal(caller.with.advisory, "${{ inputs.e2e_advisory }}")
    assert.equal(
      e2e.jobs[platform].if,
      `inputs.platform == 'all' || inputs.platform == '${platform}'`,
    )
    assert.equal(e2e.jobs[platform].needs, undefined)
    assert.ok(
      mobile.jobs[build].steps.some(
        (step) =>
          step.uses?.startsWith("actions/upload-artifact@") &&
          step.with?.name === artifact,
      ),
    )
    assert.ok(
      e2e.jobs[platform].steps.some(
        (step) =>
          step.uses?.startsWith("actions/download-artifact@") &&
          step.with?.name === artifact,
      ),
    )
  }
  assert.equal(workflow("release").jobs.mobile.with.run_e2e, true)
  assert.equal(workflow("release").jobs.mobile.with.e2e_advisory, true)
})

test("publication requires quality and builds plus passed E2E or a recorded review", () => {
  const { jobs } = workflow("release")
  function ancestors(name) {
    const needs = jobs[name].needs
    return (Array.isArray(needs) ? needs : needs ? [needs] : []).flatMap(
      (parent) => [parent, ...ancestors(parent)],
    )
  }
  for (const name of ["submit-ios", "publish"]) {
    const dependencies = ancestors(name)
    for (const gate of [
      "quality",
      "desktop",
      "mobile",
      "desktop-e2e",
      "candidate",
    ])
      assert.ok(dependencies.includes(gate), `${name} can bypass ${gate}`)
    assert.match(jobs[name].if, /github.event_name == 'push'/)
    assert.match(jobs[name].if, /refs\/tags\/v/)
  }
  assert.ok(ancestors("publish").includes("submit-ios"))
  assert.match(
    jobs["submit-ios"].if,
    /needs.candidate.outputs.publishable == 'true'/,
  )
  assert.match(jobs["submit-ios"].if, /needs.review.result == 'success'/)
  for (const gate of ["quality", "desktop", "mobile"])
    assert.ok(jobs.candidate.if.includes(`needs.${gate}.result == 'success'`))
  for (const name of ["desktop-e2e", "mobile-e2e"]) {
    assert.equal(workflow(name).on.workflow_call.inputs.advisory.default, false)
  }
  assert.equal(jobs["desktop-e2e"].with.advisory, true)
  assert.match(jobs.review.if, /inputs.review_run_id != ''/)
  assert.deepEqual(jobs.review.needs, "verify")
  assert.ok(
    jobs.review.steps.some((step) =>
      step.run?.includes("scripts/release/review.mjs"),
    ),
  )
  const ipa = jobs["submit-ios"].steps.find(
    (step) => step.with?.name === "MyReader-iOS-IPA",
  )
  assert.equal(
    ipa.with["run-id"],
    "${{ inputs.review_run_id || github.run_id }}",
  )
  assert.ok("workflow_dispatch" in workflow("release").on)
  for (const name of ["release", "desktop-e2e", "mobile-build", "mobile-e2e"]) {
    for (const job of Object.values(workflow(name).jobs)) {
      assert.notEqual(job["continue-on-error"], true)
      for (const step of job.steps || [])
        assert.notEqual(step["continue-on-error"], true)
    }
  }
  const mobileBuild = JSON.stringify(workflow("mobile-build"))
  assert.doesNotMatch(mobileBuild, /eas submit|gh release/)
})
