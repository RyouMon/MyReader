import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url))

test("EAS archives retain workspace manifests for frozen dependency installation", (t) => {
  const projects = JSON.parse(
    execFileSync("pnpm", ["--recursive", "list", "--depth=-1", "--json"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
    }),
  )
  const requiredFiles = [
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ...projects.map((project) =>
      join(relative(repositoryRoot, project.path), "package.json").replaceAll(
        "\\",
        "/",
      ),
    ),
  ]
  const archive = mkdtempSync(join(tmpdir(), "myreader-eas-archive-"))
  t.after(() => rmSync(archive, { recursive: true, force: true }))
  execFileSync("git", ["init", "--quiet", archive])
  writeFileSync(
    join(archive, ".gitignore"),
    readFileSync(join(repositoryRoot, ".easignore")),
  )
  for (const path of requiredFiles) {
    mkdirSync(dirname(join(archive, path)), { recursive: true })
    writeFileSync(join(archive, path), "")
  }
  const ignored = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {
    cwd: archive,
    input: `${requiredFiles.join("\n")}\n`,
    encoding: "utf8",
  })
  assert.equal(
    ignored.status,
    1,
    `EAS archive omits required files:\n${ignored.stdout}${ignored.stderr}`,
  )
})
