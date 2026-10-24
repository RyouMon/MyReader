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
  assert.deepEqual(workflow("desktop-e2e").jobs.desktop.strategy.matrix.os, [
    "windows-latest",
    "macos-latest",
  ])
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
      "mobile-e2e",
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
    assert.equal(jobs[name].with.advisory, true)
    assert.equal(workflow(name).on.workflow_call.inputs.advisory.default, false)
  }
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
  for (const name of ["release", "desktop-e2e", "mobile-e2e"]) {
    for (const job of Object.values(workflow(name).jobs)) {
      assert.notEqual(job["continue-on-error"], true)
      for (const step of job.steps || [])
        assert.notEqual(step["continue-on-error"], true)
    }
  }
  const mobileBuild = JSON.stringify(workflow("mobile-build"))
  assert.doesNotMatch(mobileBuild, /eas submit|gh release/)
})
