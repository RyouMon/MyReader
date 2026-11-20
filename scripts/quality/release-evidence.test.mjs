import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  candidateIdentity,
  digest,
  evidenceFile,
  manifestFor,
  releaseFiles,
  verifyCandidate,
} from "../release/candidate.mjs"
import { isCandidateRun } from "../release/github.mjs"

const repo = "example/project",
  commit = "1".repeat(40),
  tree = "2".repeat(40)
const pr = {
  number: 8,
  head: { ref: "release/1.2.3", sha: commit, repo: { full_name: repo } },
  base: { ref: "main", repo: { full_name: repo } },
}
const identity = candidateIdentity(pr, repo, tree)

test("release PRs bind the repo, version, SHA, PR number and built tree", () => {
  assert.equal(identity.version, "1.2.3")
  for (const changed of [
    { ...pr, head: { ...pr.head, ref: "release/latest" } },
    { ...pr, base: { ...pr.base, ref: "test" } },
    { ...pr, head: { ...pr.head, repo: { full_name: "fork/project" } } },
  ])
    assert.throws(() => candidateIdentity(changed, repo, tree))
  const run = {
    event: "pull_request",
    head_sha: commit,
    head_branch: "release/1.2.3",
    head_repository: { full_name: repo },
    path: ".github/workflows/release.yml",
    display_title: `Candidate PR #8 at ${commit}`,
  }
  assert.ok(isCandidateRun(run, identity))
  for (const changes of [
    { head_sha: tree },
    { event: "push" },
    { head_repository: { full_name: "other/project" } },
    { display_title: `Candidate PR #9 at ${commit}` },
  ])
    assert.equal(isCandidateRun({ ...run, ...changes }, identity), false)
})

test("promotion verifies every file, exact architecture, checksum, PR and tree", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "reader-candidate-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const { installers, ipa, simulator, checksum } = releaseFiles(
    identity.version,
  )
  const apk = checksum.slice(0, -7)
  for (const f of [...installers, ipa, simulator])
    writeFileSync(join(dir, f), f)
  const apkHash = digest(join(dir, apk))
  writeFileSync(join(dir, checksum), apkHash + "  " + apk + "\n")
  const manifest = manifestFor(dir, identity, 215)
  writeFileSync(join(dir, evidenceFile), JSON.stringify(manifest))
  const seal = digest(join(dir, evidenceFile))
  assert.deepEqual(verifyCandidate(dir, identity, seal), manifest)
  assert.equal(manifest.e2e.policy, "advisory")
  assert.ok(!Object.hasOwn(manifest.assets, ipa))
  for (const name of [
    "MyReader_1.2.3_amd64.AppImage",
    "MyReader_1.2.3_amd64.deb",
    "MyReader-1.2.3-1.x86_64.rpm",
  ]) {
    writeFileSync(join(dir, name), "discontinued installer")
    assert.throws(() => verifyCandidate(dir, identity, seal), /Unexpected/)
    rmSync(join(dir, name))
  }
  for (const mismatch of [{ tree: commit }, { commit: tree }, { pr: 9 }])
    assert.throws(() =>
      verifyCandidate(dir, { ...identity, ...mismatch }, seal),
    )
  assert.throws(
    () => verifyCandidate(dir, identity, "0".repeat(64)),
    /approved/,
  )
  writeFileSync(join(dir, ipa), "replacement")
  assert.throws(() => verifyCandidate(dir, identity, seal), /bytes/)
  writeFileSync(join(dir, checksum), "stale  " + apk)
  assert.throws(() => manifestFor(dir, identity, 215), /checksum mismatch/)
  writeFileSync(join(dir, "unexpected.dmg"), "extra")
  assert.throws(() => manifestFor(dir, identity, 215), /Unexpected/)
})
