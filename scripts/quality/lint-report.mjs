import { mkdirSync, writeFileSync } from "node:fs"
import { ESLint } from "eslint"

// Report the official ESLint findings without a suppression baseline.
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
