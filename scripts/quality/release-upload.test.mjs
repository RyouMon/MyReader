import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { parse } from "yaml"
import { verifyUploadedRelease } from "../release/verify-upload.mjs"

test("publication requires exact uploaded names, bytes and server-side digests", () => {
  const directory = mkdtempSync(join(tmpdir(), "myreader-upload-"))
  try {
    writeFileSync(join(directory, "app.apk"), "tested")
    const asset = {
      name: "app.apk",
      state: "uploaded",
      size: 6,
      digest: `sha256:${createHash("sha256").update("tested").digest("hex")}`,
    }
    const release = { draft: true, tag_name: "v1.0.0", assets: [asset] }
    verifyUploadedRelease(directory, release, "v1.0.0")
    for (const changed of [
      { state: "starter" },
      { size: 5 },
      { digest: "sha256:wrong" },
    ]) {
      assert.throws(() =>
        verifyUploadedRelease(
          directory,
          { ...release, assets: [{ ...asset, ...changed }] },
          "v1.0.0",
        ),
      )
    }
    assert.throws(() =>
      verifyUploadedRelease(directory, { ...release, assets: [] }, "v1.0.0"),
    )
    assert.throws(() =>
      verifyUploadedRelease(
        directory,
        { ...release, assets: [asset, { ...asset, name: "old.apk" }] },
        "v1.0.0",
      ),
    )
    assert.throws(() =>
      verifyUploadedRelease(directory, { ...release, draft: false }, "v1.0.0"),
    )
    assert.throws(() => verifyUploadedRelease(directory, release, "v2.0.0"))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("draft publication resolves its API resource and verifies uploads before publishing", () => {
  const { jobs } = parse(
    readFileSync(
      new URL("../../.github/workflows/release.yml", import.meta.url),
      "utf8",
    ),
  )
  const publish = jobs.publish.steps.find((step) =>
    step.run?.includes("scripts/release/verify-upload.mjs"),
  )
  const directory = mkdtempSync(join(tmpdir(), "myreader-publish-"))
  try {
    mkdirSync(join(directory, "release-assets"))
    mkdirSync(join(directory, "scripts/release"), { recursive: true })
    copyFileSync(
      new URL("../release/verify-upload.mjs", import.meta.url),
      join(directory, "scripts/release/verify-upload.mjs"),
    )
    writeFileSync(join(directory, "release-assets/app.apk"), "tested")
    const state = join(directory, "draft-state")
    const response = join(directory, "release.json")
    writeFileSync(
      join(directory, "gh"),
      `#!/usr/bin/env bash
set -eu
case "$1 $2" in
  "release view")
    case "$*" in
      *"--json apiUrl"*) printf '%s\\n' "$GH_MOCK_API_URL" ;;
      *"--json isDraft"*) cat "$GH_MOCK_STATE" ;;
    esac ;;
  "release edit")
    for arg in "$@"; do
      if [ "$arg" = --draft=false ]; then printf false > "$GH_MOCK_STATE"; fi
    done ;;
  "release upload") ;;
  "api $GH_MOCK_API_URL") cat "$GH_MOCK_RESPONSE" ;;
  *) echo 'HTTP 404: draft release is unavailable by tag' >&2; exit 1 ;;
esac
`,
      { mode: 0o755 },
    )
    for (const mismatched of [false, true]) {
      writeFileSync(state, "true")
      writeFileSync(
        response,
        JSON.stringify({
          draft: true,
          tag_name: "v1.0.0",
          assets: [
            {
              name: "app.apk",
              state: "uploaded",
              size: 6,
              digest: mismatched
                ? "sha256:wrong"
                : `sha256:${createHash("sha256").update("tested").digest("hex")}`,
            },
          ],
        }),
      )
      const result = spawnSync("bash", ["-e", "-c", publish.run], {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          GITHUB_REF_NAME: "v1.0.0",
          GITHUB_REPOSITORY: "example/repo",
          RUNNER_TEMP: directory,
          GH_MOCK_API_URL:
            "https://api.github.com/repos/example/repo/releases/42",
          GH_MOCK_STATE: state,
          GH_MOCK_RESPONSE: response,
        },
      })
      assert.equal(result.status, mismatched ? 1 : 0, result.stderr)
      assert.equal(readFileSync(state, "utf8"), String(mismatched))
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
