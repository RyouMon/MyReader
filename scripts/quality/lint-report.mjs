import { mkdirSync, writeFileSync } from "node:fs"
import { ESLint } from "eslint"

// The API reports raw findings; CLI bulk suppressions only apply to `pnpm lint`.
const eslint = new ESLint()
const results = await eslint.lintFiles([
  "eslint.config.cjs",
  ".dependency-cruiser.cjs",
  "my-reader/src",
  "my-reader-mobile/src",
  "my-reader-mobile/modules",
  "packages",
  "scripts",
])
mkdirSync("reports", { recursive: true })
writeFileSync("reports/eslint.json", JSON.stringify(results, null, 2) + "\n")
const errors = results.reduce((sum, result) => sum + result.errorCount, 0)
console.log(
  `${results.length} files, ${errors} errors; full findings: reports/eslint.json`,
)
process.exitCode = errors ? 1 : 0
