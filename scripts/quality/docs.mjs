import { execFileSync } from "node:child_process"
import { existsSync, realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))

// Only select inputs and invoke upstream tools here; validation belongs to their configs.
export function checkLinks(files, { historical = false } = {}) {
  if (!files.length) return ""
  const configs = ["--config", path.join(root, ".lychee.toml")]
  if (historical)
    configs.push("--config", path.join(root, "scripts/quality/lychee-adr.toml"))
  return execFileSync("lychee", [...configs, "--", ...files], {
    encoding: "utf8",
    stdio: "pipe",
  })
}

function main() {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter((file) => /\.(?:md|mdc)$/.test(file))
    .map((file) => path.join(root, file))
    .filter(existsSync)
    .map((file) => realpathSync(file))
  const documents = [...new Set(files)]
  const links = documents.filter((file) => {
    const relative = path.relative(root, file).split(path.sep).join("/")
    // Imported tutorials contain example paths, not references into this repository.
    return (
      !relative.startsWith(".agents/skills/") ||
      relative.startsWith(".agents/skills/myreader-design-system/") ||
      relative.startsWith(".agents/skills/compress/")
    )
  })
  const isHistorical = (file) =>
    /^docs\/adr\/\d/.test(path.relative(root, file).split(path.sep).join("/"))
  console.log(checkLinks(links.filter((file) => !isHistorical(file))))
  console.log(checkLinks(links.filter(isHistorical), { historical: true }))
  console.log(`Docs: ${links.length} link inputs.`)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main()
  } catch (error) {
    if (error.stdout) process.stderr.write(error.stdout)
    console.error(error.message)
    process.exitCode = error.status || 1
  }
}
