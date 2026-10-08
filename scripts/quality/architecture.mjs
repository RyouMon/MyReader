import { spawnSync } from "node:child_process"
import path from "node:path"

const scopes = [
  ["desktop", "my-reader/tsconfig.json", ["my-reader/src"]],
  [
    "mobile",
    "scripts/quality/tsconfig.mobile.json",
    [
      "my-reader-mobile/src",
      "my-reader-mobile/modules/readium/src",
      "my-reader-mobile/modules/book-transition/src",
      "my-reader-mobile/modules/security-scoped-bookmarks/src",
    ],
  ],
  ["shared", "packages/tools/tsconfig.json", ["packages"]],
]
let failed = false
for (const [name, config, sources] of scopes) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "depcruise",
      "--config",
      ".dependency-cruiser.cjs",
      "--ts-config",
      path.resolve(config),
      "--output-type",
      "err-long",
      ...sources,
    ],
    { stdio: "inherit", shell: process.platform === "win32" },
  )
  if (result.error) throw result.error
  console.log(`Architecture ${name}: ${result.status === 0 ? "PASS" : "FAIL"}`)
  failed ||= result.status !== 0
}
process.exitCode = failed ? 1 : 0
