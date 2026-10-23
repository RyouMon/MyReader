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

test("publication and TestFlight depend on every build, full E2E suite and quality gate", () => {
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
