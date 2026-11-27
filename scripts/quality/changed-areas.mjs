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

const appJsonPath = "my-reader-mobile/app.json"

const workspaceDependencies = [
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$/,
  /^patches\//,
]
const mobileDependencies = [
  ...workspaceDependencies,
  /^my-reader-mobile\/(?:package\.json|app\.config\.[cm]?[jt]s)$/,
  /^my-reader-mobile\/modules\/[^/]+\/(?:package\.json|expo-module\.config\.json)$/,
]
const iosDependencies = [
  ...mobileDependencies,
  /^my-reader-mobile\/.*\.podspec$/,
  /^my-reader-mobile\/ios\/Podfile/,
  /^my-reader-mobile\/modules\/[^/]+\/scripts\/.*\.rb$/,
  /^my-reader-mobile\/plugins\/with-.*ios.*(?<!\.test)\.[cm]?js$/,
]
const parserSources = [/^packages\/reader-formats\//]
const sharedNativeSources = [
  ...parserSources,
  /^packages\/tools\/src\/reader-(?:viewport-anchor|note-marker)/,
  /^scripts\/generate-reader-viewport-anchor\.mjs$/,
  /^my-reader-mobile\/modules\/readium\/scripts\/generate-reader-note-marker-template\.mjs$/,
  /^scripts\/quality\/native-coverage\.py$/,
]

const patterns = {
  js: [
    ...parserSources,
    ...workspaceDependencies,
    /^(?:my-reader|my-reader-mobile|packages\/[^/]+)\/src\//,
    /^my-reader-mobile\/modules\/[^/]+\/src\//,
    /^(?:my-reader|my-reader-mobile|packages\/[^/]+)\/(?:__mocks__|test|plugins|scripts)\//,
    /^(?:my-reader|my-reader-mobile|packages\/[^/]+)\/tests\/(?!native-sharing\/)/,
    /^(?:my-reader|my-reader-mobile|packages\/[^/]+)\/[^/]+\.(?:[cm]?[jt]sx?|json)$/,
    /^(?:vitest|jest|babel|tsconfig)[^/]*\.(?:[cm]?[jt]s|json)$/,
  ],
  rust: [
    ...parserSources,
    /^my-reader-core\//,
    /^my-reader\/src-tauri\//,
    /^my-reader-mobile\/modules\/my-reader-core\/rust\//,
    /(?:^|\/)(?:Cargo\.(?:toml|lock)|rust-toolchain(?:\.toml)?|clippy\.toml)$/,
    /^\.cargo\//,
  ],
  swift: [
    ...iosDependencies,
    ...sharedNativeSources,
    /^scripts\/quality\/ios-test-host\.m$/,
    /^my-reader-mobile\/(?:ios\/|modules\/[^/]+\/ios\/)/,
  ],
  android: [
    ...mobileDependencies,
    ...sharedNativeSources,
    /^my-reader-mobile\/(?:android\/|modules\/[^/]+\/android\/|tests\/native-sharing\/)/,
    /^my-reader-mobile\/plugins\/with-android.*(?<!\.test)\.[cm]?js$/,
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

function pluginName(entry) {
  if (typeof entry === "string") return entry
  if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0]
  return null
}

function pluginConfig(entry) {
  return Array.isArray(entry) ? entry[1] : undefined
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value)
}

function appJsonNativeBuildSnapshot(config) {
  const plugins = Array.isArray(config?.expo?.plugins)
    ? config.expo.plugins
    : []
  const buildProperties = plugins.find(
    (entry) => pluginName(entry) === "expo-build-properties",
  )
  const buildConfig = pluginConfig(buildProperties)
  return {
    swift: {
      buildProperties:
        buildConfig && typeof buildConfig === "object"
          ? (buildConfig.ios ?? null)
          : (buildConfig ?? null),
      plugins: plugins.filter((entry) => {
        const name = pluginName(entry)
        return (
          typeof name === "string" && /^\.\/plugins\/with-.*ios/i.test(name)
        )
      }),
    },
    android: {
      buildProperties:
        buildConfig && typeof buildConfig === "object"
          ? (buildConfig.android ?? null)
          : (buildConfig ?? null),
      plugins: plugins.filter((entry) => {
        const name = pluginName(entry)
        return (
          typeof name === "string" && /^\.\/plugins\/with-android/i.test(name)
        )
      }),
    },
  }
}

export function classifyAppJsonChange(beforeText, afterText) {
  if (typeof beforeText !== "string" || typeof afterText !== "string") {
    return { swift: true, android: true }
  }
  try {
    const before = appJsonNativeBuildSnapshot(JSON.parse(beforeText))
    const after = appJsonNativeBuildSnapshot(JSON.parse(afterText))
    return {
      swift: canonicalJson(before.swift) !== canonicalJson(after.swift),
      android: canonicalJson(before.android) !== canonicalJson(after.android),
    }
  } catch {
    return { swift: true, android: true }
  }
}

export function classifyChangedPaths(paths, options = {}) {
  const normalized = paths.map((file) => file.replaceAll("\\", "/"))
  const areas = Object.fromEntries(
    Object.entries(patterns).map(([area, matches]) => [
      area,
      normalized.some((file) => matches.some((pattern) => pattern.test(file))),
    ]),
  )
  if (normalized.includes(appJsonPath)) {
    const appJsonAreas = classifyAppJsonChange(
      options.appJsonDiff?.before,
      options.appJsonDiff?.after,
    )
    areas.swift = areas.swift || appJsonAreas.swift
    areas.android = areas.android || appJsonAreas.android
  }
  areas.coverage = areas.js || areas.rust || areas.swift || areas.android
  return areas
}

function changedContext() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
  const pullRequest = event.pull_request
  if (
    pullRequest?.base.ref === "main" &&
    pullRequest.head.ref?.startsWith("release/")
  )
    return null
  if (pullRequest) {
    const paths = gitChangedPaths(pullRequest.base.sha, pullRequest.head.sha)
    if (!paths.includes(appJsonPath)) {
      return { paths }
    }
    const mergeBase = gitMergeBase(pullRequest.base.sha, pullRequest.head.sha)
    return {
      paths,
      appJsonDiff: {
        before: gitShowFile(mergeBase, appJsonPath),
        after: gitShowFile(pullRequest.head.sha, appJsonPath),
      },
    }
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

function gitMergeBase(base, head) {
  return execFileSync("git", ["merge-base", base, head], {
    encoding: "utf8",
  }).trim()
}

function gitShowFile(ref, file) {
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch {
    return null
  }
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
  const context = process.env.GITHUB_EVENT_PATH ? changedContext() : null
  writeOutputs(
    context
      ? classifyChangedPaths(context.paths, {
          appJsonDiff: context.appJsonDiff,
        })
      : allAreas,
  )
}
