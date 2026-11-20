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
const release = workflow("release")
test("only release PRs into main can build or promote; no tag or manual entry point", () => {
  assert.deepEqual(Object.keys(release.on), ["pull_request"])
  assert.deepEqual(release.on.pull_request.branches, ["main"])
  for (const name of ["verify", "stage"]) {
    assert.match(
      release.jobs[name].if,
      /startsWith\(github.head_ref, 'release\/'\)/,
    )
    assert.match(
      release.jobs[name].if,
      /head.repo.full_name == github.repository/,
    )
  }
  assert.match(
    release.jobs.stage.if,
    /github.event.action == 'closed' && github.event.pull_request.merged/,
  )
  assert.equal(release.jobs["submit-ios"].needs, "stage")
  assert.deepEqual(release.jobs.publish.needs, ["stage", "submit-ios"])
  assert.ok(
    !Object.values(release.jobs).some((j) => j.uses?.includes("mobile-build")),
  )
  assert.equal(
    workflow("desktop-build").jobs.windows["runs-on"],
    "windows-latest",
  )
  assert.equal(release.jobs["desktop-e2e"].with.windows_only, true)
  assert.ok(release.jobs["desktop-e2e"].with.advisory)
  assert.match(release.jobs.report.if, /always\(\)/)
})
test("required QA checks the candidate status on this PR head only on release PRs", () => {
  const gate = workflow("quality").jobs["qa-gate"].steps.find(
    (s) => s.name === "Require release candidate for this commit",
  )
  assert.match(gate.if, /startsWith\(github.head_ref, 'release\/'\)/)
  assert.match(gate.run, /Release local artifacts/)
  assert.match(gate.run, /target_url == \$url/)
  assert.match(gate.env.RELEASE_HEAD, /pull_request.head.sha/)
})
