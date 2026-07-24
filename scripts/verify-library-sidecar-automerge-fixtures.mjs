import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import * as Automerge from "../my-reader-mobile/node_modules/@automerge/automerge/dist/mjs/entrypoints/fullfat_node.js"

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
const fixtureDirectory = path.join(
  repositoryRoot,
  "fixtures",
  "library-sidecar-automerge",
)
const manifest = JSON.parse(
  await readFile(path.join(fixtureDirectory, "manifest.json"), "utf8"),
)
const bytes = await readFile(path.join(fixtureDirectory, "genesis.automerge"))
const document = Automerge.load(bytes, {
  actor: "a1b2c3d4e5f64890abcdef1234567890",
})

if (Automerge.getObjectId(document) !== "_root") {
  throw new Error("canonical genesis is not an Automerge document root")
}
if (document.schema !== manifest.schemaVersion) {
  throw new Error(
    `canonical genesis schema ${document.schema} does not match ${manifest.schemaVersion}`,
  )
}
if (
  JSON.stringify(Automerge.getHeads(document)) !==
  JSON.stringify(manifest.genesisHeads)
) {
  throw new Error("canonical genesis heads do not match the manifest")
}
for (const root of manifest.roots) {
  if (Automerge.getObjectId(document[root]) == null) {
    throw new Error(`canonical genesis is missing map root ${root}`)
  }
}

const typescriptIncremental = await readFile(
  path.join(fixtureDirectory, "typescript-position.incremental"),
)
const fromTypescript = Automerge.loadIncremental(
  document,
  typescriptIncremental,
)
if (
  String(fromTypescript.libraryUuid) !== manifest.libraryUuid ||
  JSON.parse(String(fromTypescript.positions["7:PDF"]))
    .displayProgressionPpm !== manifest.typescriptPosition.displayProgressionPpm
) {
  throw new Error("TypeScript incremental fixture did not hydrate")
}
if (
  JSON.parse(String(fromTypescript.favorites["7"])).isFavorite !== true ||
  JSON.parse(
    String(fromTypescript.bookmarks[manifest.typescriptDomains.bookmarkKey]),
  ).locatorKey !== "page-7" ||
  String(
    fromTypescript.annotations[manifest.typescriptDomains.annotationId].note,
  ) !== "fixture note" ||
  JSON.parse(
    String(fromTypescript.sessions[manifest.typescriptDomains.sessionId]),
  ).durationSeconds !== 120 ||
  JSON.parse(
    String(fromTypescript.completions[manifest.typescriptDomains.completionId]),
  ).completedAt !== 4000
) {
  throw new Error("TypeScript domain fixtures did not hydrate")
}
if (
  JSON.stringify(Automerge.getHeads(fromTypescript)) !==
  JSON.stringify(manifest.typescriptPosition.heads)
) {
  throw new Error("TypeScript incremental heads do not match the manifest")
}

const rustIncremental = await readFile(
  path.join(fixtureDirectory, "rust-position.incremental"),
)
const rustBase = Automerge.load(bytes, {
  actor: "a1b2c3d4e5f64890abcdef1234567890",
})
const fromRust = Automerge.loadIncremental(rustBase, rustIncremental)
if (
  String(fromRust.libraryUuid) !== manifest.libraryUuid ||
  JSON.parse(String(fromRust.positions["7:PDF"])).displayProgressionPpm !==
    300000
) {
  throw new Error("Rust incremental fixture did not hydrate")
}

process.stdout.write(
  `Verified Automerge genesis and Rust/TypeScript incrementals for schema ${manifest.schemaVersion}.\n`,
)
