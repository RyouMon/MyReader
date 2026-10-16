import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export const inputs = [
  ["js", "coverage-0/lcov.info", "packages/fonts"],
  ["js", "coverage-1/lcov.info", "packages/i18n"],
  ["js", "coverage-2/lcov.info", "packages/tools"],
  ["js", "coverage-3/lcov.info", "my-reader"],
  ["js", "coverage-4/lcov.info", "my-reader-mobile"],
  ["rust", "rust-coverage-report/lcov.info", ""],
  ["swift", "swift-coverage-report/lcov.info", ""],
  ["android", "android-coverage-report/readium-unit.info", ""],
  ["android", "android-coverage-report/readium-device.info", ""],
  ["android", "android-coverage-report/sharing.info", ""],
]

export function parseLcov(text) {
  const files = new Map()
  let lines
  for (const row of text.split(/\r?\n/)) {
    if (row.startsWith("SF:")) {
      if (lines) throw new Error("Unterminated LCOV record")
      const file = row.slice(3)
      if (!file) throw new Error("Missing LCOV source path")
      if (!files.has(file)) files.set(file, new Map())
      lines = files.get(file)
    } else if (row.startsWith("DA:")) {
      const [line, hits] = row.slice(3).split(",").map(Number)
      if (
        !lines ||
        !Number.isInteger(line) ||
        line < 1 ||
        !Number.isFinite(hits) ||
        hits < 0
      )
        throw new Error(`Invalid LCOV entry: ${row}`)
      lines.set(line, Math.max(lines.get(line) ?? 0, hits))
    } else if (row === "end_of_record") {
      lines = undefined
    }
  }
  if (lines) throw new Error("Unterminated LCOV record")
  if (![...files.values()].some((entries) => entries.size))
    throw new Error("Empty LCOV report")
  return files
}

// Report patch-owned instructions at the checked-in patch's reviewable line.
// The original upstream dependency must not inflate the coverage denominator.
export function patchLineMap(patch) {
  const files = new Map()
  let lines
  let sourceLine = 0
  patch.split("\n").forEach((row, index) => {
    if (row.startsWith("+++ b/")) {
      lines = new Map()
      files.set(row.slice(6), lines)
    } else if (row.startsWith("@@")) {
      sourceLine = Number(row.match(/\+(\d+)/)?.[1])
    } else if (lines && row.startsWith("+")) {
      lines.set(sourceLine++, index + 1)
    } else if (row.startsWith(" ")) {
      sourceLine++
    }
  })
  return files
}

function sourcePath(source, packageDirectory) {
  const normalized = source.replaceAll("\\", "/")
  const repositoryPath = normalized.match(
    /(?:^|\/)((?:my-reader(?:-mobile|-core)?|packages)\/.*)$/,
  )?.[1]
  return repositoryPath ?? path.posix.join(packageDirectory, normalized)
}

export function normalizeCoverage(
  files,
  group,
  packageDirectory,
  sharingPatch,
) {
  const result = new Map()
  for (const [source, lines] of files) {
    const dependency = source
      .replaceAll("\\", "/")
      .match(/node_modules\/expo-sharing\/(.+)$/)
    let file = sourcePath(source, packageDirectory)
    let normalizedLines = lines
    if (dependency) {
      const mapping = sharingPatch.lines.get(dependency[1])
      if (!mapping) continue
      file = sharingPatch.file
      normalizedLines = new Map(
        [...lines]
          .filter(([line]) => mapping.has(line))
          .map(([line, hits]) => [mapping.get(line), hits]),
      )
    } else if (group === "swift" || group === "android") {
      if (
        !file.startsWith(
          `my-reader-mobile/modules/readium/${group === "swift" ? "ios" : "android/src/main"}/`,
        )
      )
        continue
      if (!/\.(swift|kt|java)$/.test(file)) continue
      if (/(?:^|\/)(?:Tests|Generated[^/]*)(?:\/|\.)/.test(file)) continue
    } else if (group === "rust") {
      if (
        !/^(?:my-reader-core\/|my-reader-mobile\/modules\/my-reader-core\/rust\/)/.test(
          file,
        )
      )
        continue
      if (
        /(?:^|\/)(?:tests|generated|examples)\//.test(file) ||
        !file.endsWith(".rs")
      )
        continue
    }
    if (normalizedLines.size)
      mergeCoverage(result, new Map([[file, normalizedLines]]))
  }
  if (!result.size)
    throw new Error(`No ${group} source coverage after normalization`)
  return result
}

export function mergeCoverage(target, incoming) {
  for (const [file, lines] of incoming) {
    if (!target.has(file)) target.set(file, new Map())
    const existing = target.get(file)
    for (const [line, hits] of lines)
      existing.set(line, Math.max(existing.get(line) ?? 0, hits))
  }
}

export function writeLcov(files) {
  return [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, lines]) =>
      [
        `SF:${file}`,
        ...[...lines]
          .sort(([a], [b]) => a - b)
          .map(([line, hits]) => `DA:${line},${hits}`),
        `LF:${lines.size}`,
        `LH:${[...lines.values()].filter((hits) => hits > 0).length}`,
        "end_of_record",
        "",
      ].join("\n"),
    )
    .join("")
}

export function changedLines(diff) {
  const files = new Map()
  let file
  let line = 0
  for (const row of diff.split("\n")) {
    if (row.startsWith("+++ b/")) {
      file = row.slice(6)
      files.set(file, new Set())
    } else if (row.startsWith("+++ /dev/null")) file = undefined
    else if (row.startsWith("@@")) line = Number(row.match(/\+(\d+)/)?.[1])
    else if (file && row.startsWith("+")) files.get(file).add(line++)
    else if (row.startsWith(" ")) line++
  }
  return files
}

export function summarizeChanges(files, changes) {
  let changed = 0
  for (const [file, lines] of files) {
    for (const line of changes.get(file) ?? []) {
      if (lines.has(line)) changed++
    }
  }
  return { changed }
}

export function prepareReports(
  inputDirectory,
  outputDirectory,
  repositoryRoot = root,
) {
  const sharingPatchFile = "patches/expo-sharing@57.0.22.patch"
  const sharingPatch = {
    file: sharingPatchFile,
    lines: patchLineMap(
      readFileSync(path.join(repositoryRoot, sharingPatchFile), "utf8"),
    ),
  }
  const groups = new Map()
  for (const [group, file, directory] of inputs) {
    const parsed = parseLcov(
      readFileSync(path.join(inputDirectory, file), "utf8"),
    )
    if (!groups.has(group)) groups.set(group, new Map())
    mergeCoverage(
      groups.get(group),
      normalizeCoverage(parsed, group, directory, sharingPatch),
    )
  }
  mkdirSync(outputDirectory, { recursive: true })
  const base = process.env.COVERAGE_BASE_SHA
  const changes = base
    ? changedLines(
        execFileSync(
          "git",
          [
            "-c",
            "core.quotePath=false",
            "diff",
            "--no-ext-diff",
            "--no-renames",
            "--unified=0",
            `${base}...HEAD`,
          ],
          {
            cwd: repositoryRoot,
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
          },
        ),
      )
    : new Map()
  const summary = {}
  for (const [group, files] of groups) {
    writeFileSync(path.join(outputDirectory, `${group}.info`), writeLcov(files))
    summary[group] = summarizeChanges(files, changes)
  }
  writeFileSync(
    path.join(outputDirectory, "summary.json"),
    JSON.stringify(summary),
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  prepareReports(
    path.resolve(process.argv[2] ?? "reports/coverage-input"),
    path.resolve(process.argv[3] ?? "reports/coverage"),
  )
}
