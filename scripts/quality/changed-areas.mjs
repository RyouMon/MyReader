import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const allAreas = {
  android: true,
  coverage: true,
  ios: true,
  js: true,
  mutation: true,
  rust: true,
  security: true,
  swift: true,
}

const outputKeys = Object.keys(allAreas)

const workspaceDependencies = [
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$/,
  /^patches\//,
]
const mobileDependencies = [
  ...workspaceDependencies,
  /^my-reader-mobile\/(?:package\.json|app\.(?:json|config\.[cm]?[jt]s))$/,
  /^my-reader-mobile\/modules\/[^/]+\/(?:package\.json|expo-module\.config\.json)$/,
]
const iosDependencies = [
  ...mobileDependencies,
  /^my-reader-mobile\/.*\.podspec$/,
  /^my-reader-mobile\/ios\/Podfile/,
  /^my-reader-mobile\/modules\/[^/]+\/scripts\/.*\.rb$/,
  /^my-reader-mobile\/plugins\/with-.*ios.*\.[cm]?js$/,
]
const sharedNativeSources = [
  /^packages\/tools\/src\/reader-(?:viewport-anchor|note-marker)/,
  /^scripts\/generate-reader-viewport-anchor\.mjs$/,
  /^my-reader-mobile\/modules\/readium\/scripts\/generate-reader-note-marker-template\.mjs$/,
  /^scripts\/quality\/native-coverage\.py$/,
]

const patterns = {
  js: [
    ...workspaceDependencies,
    /^(?:my-reader|my-reader-mobile|packages\/[^/]+)\/src\//,
    /^my-reader-mobile\/modules\/[^/]+\/src\//,
    /^(?:my-reader|my-reader-mobile|packages\/[^/]+)\/(?:__mocks__|test|plugins|scripts)\//,
    /^(?:my-reader|my-reader-mobile|packages\/[^/]+)\/tests\/(?!native-sharing\/)/,
    /^(?:my-reader|my-reader-mobile|packages\/[^/]+)\/[^/]+\.(?:[cm]?[jt]sx?|json)$/,
    /^(?:vitest|jest|babel|tsconfig)[^/]*\.(?:[cm]?[jt]s|json)$/,
  ],
  rust: [
    /^my-reader-core\//,
    /^my-reader\/src-tauri\//,
    /^my-reader-mobile\/modules\/my-reader-core\/rust\//,
    /(?:^|\/)(?:Cargo\.(?:toml|lock)|rust-toolchain(?:\.toml)?|clippy\.toml)$/,
    /^\.cargo\//,
  ],
  swift: [
    ...iosDependencies,
    ...sharedNativeSources,
    /^my-reader-mobile\/(?:ios\/|modules\/[^/]+\/ios\/)/,
  ],
  android: [
    ...mobileDependencies,
    ...sharedNativeSources,
    /^my-reader-mobile\/(?:android\/|modules\/[^/]+\/android\/|tests\/native-sharing\/)/,
    /^my-reader-mobile\/plugins\/with-android.*\.[cm]?js$/,
    /^scripts\/quality\/android-coverage\.init\.gradle$/,
  ],
  ios: [...iosDependencies, /^scripts\/quality\/readium-ios-dependencies\.rb$/],
  mutation: [...workspaceDependencies, /^packages\/tools\//],
  security: [
    ...workspaceDependencies,
    /(?:^|\/)(?:package\.json|Cargo\.(?:toml|lock)|Podfile(?:\.lock)?|[^/]+\.podspec|gradle\.properties|build\.gradle(?:\.kts)?|libs\.versions\.toml)$/,
    /^\.cargo\/audit\.toml$/,
  ],
}

export function classifyChangedPaths(paths) {
  const normalized = paths.map((file) => file.replaceAll("\\", "/"))
  const areas = Object.fromEntries(
    Object.entries(patterns).map(([area, matches]) => [
      area,
      normalized.some((file) => matches.some((pattern) => pattern.test(file))),
    ]),
  )
  areas.coverage = areas.js || areas.rust || areas.swift || areas.android
  return areas
}

function changedPaths() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
  const pullRequest = event.pull_request
  if (pullRequest) {
    return gitChangedPaths(pullRequest.base.sha, pullRequest.head.sha)
  }

  // Pushes, workflow calls and workflow dispatches are complete quality runs.
  // A PR is the only event where unrelated checks may be skipped safely.
  return null
}

function gitChangedPaths(base, head) {
  return execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean)
}

export function writeOutputs(areas, output = process.env.GITHUB_OUTPUT) {
  const text = outputKeys
    .map((key) => `${key}=${areas[key] ? "true" : "false"}`)
    .join("\n")
  if (output) {
    appendFileSync(output, `${text}\n`)
  }
  return text
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const paths = process.env.GITHUB_EVENT_PATH ? changedPaths() : null
  writeOutputs(paths ? classifyChangedPaths(paths) : allAreas)
}
