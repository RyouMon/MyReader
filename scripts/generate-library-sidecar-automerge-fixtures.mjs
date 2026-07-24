import { mkdir, writeFile } from "node:fs/promises"
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
const generatedModulePath = path.join(
  repositoryRoot,
  "my-reader-mobile",
  "src",
  "domain",
  "sync",
  "library-sidecar",
  "automerge-genesis.generated.ts",
)
const roots = [
  "favorites",
  "positions",
  "bookmarks",
  "annotations",
  "sessions",
  "completions",
]

let document = Automerge.init({
  actor: "00000000000000000000000000000000",
})
document = Automerge.change(
  document,
  { message: "myreader:library-sidecar-schema:1", time: 0 },
  (draft) => {
    draft.schema = 1
    for (const root of roots) {
      draft[root] = {}
    }
  },
)

const bytes = Automerge.save(document)
const heads = Automerge.getHeads(document)
const base64 = Buffer.from(bytes).toString("base64")
const libraryUuid = "11111111-2222-4333-8444-555555555555"
const typescriptReplicaId = "a1b2c3d4-e5f6-4890-abcd-ef1234567890"
let typescriptDocument = Automerge.load(bytes, {
  actor: typescriptReplicaId.replaceAll("-", ""),
})
typescriptDocument = Automerge.change(
  typescriptDocument,
  { message: "myreader:set-library-identity", time: 1 },
  (draft) => {
    draft.libraryUuid = new Automerge.ImmutableString(libraryUuid)
  },
)
typescriptDocument = Automerge.change(
  typescriptDocument,
  { message: "myreader:set-domain-fixtures", time: 2 },
  (draft) => {
    draft.positions["7:PDF"] = new Automerge.ImmutableString(
      JSON.stringify({
        format: "PDF",
        locatorJson: '{"href":"page-7"}',
        displayProgressionPpm: 700000,
        recordedAt: 2000,
        replicaId: typescriptReplicaId,
      }),
    )
    draft.favorites["7"] = new Automerge.ImmutableString(
      JSON.stringify({
        isFavorite: true,
        addedAt: 2000,
        recordedAt: 2000,
        replicaId: typescriptReplicaId,
      }),
    )
    draft.bookmarks["7:PDF:page-7"] = new Automerge.ImmutableString(
      JSON.stringify({
        id: "11111111111141118111111111111111",
        bookId: 7,
        format: "PDF",
        locatorKey: "page-7",
        locatorJson: '{"href":"page-7"}',
        createdAt: 2000,
        deletedAt: null,
        recordedAt: 2000,
        replicaId: typescriptReplicaId,
      }),
    )
    draft.annotations["22222222222242228222222222222222"] = {
      id: new Automerge.ImmutableString("22222222222242228222222222222222"),
      bookId: 7,
      format: new Automerge.ImmutableString("PDF"),
      kind: new Automerge.ImmutableString("highlight"),
      locatorJson: new Automerge.ImmutableString('{"href":"page-7"}'),
      createdAt: 2000,
      color: new Automerge.ImmutableString("yellow"),
      note: new Automerge.ImmutableString("fixture note"),
      updatedAt: 2000,
      deleted: false,
      deletedAt: null,
    }
    draft.sessions["33333333333343338333333333333333"] =
      new Automerge.ImmutableString(
        JSON.stringify({
          id: "33333333333343338333333333333333",
          originReplicaId: typescriptReplicaId,
          bookId: 7,
          format: "PDF",
          localDay: "2026-07-25",
          startedAt: 2000,
          durationSeconds: 120,
          updatedAt: 3000,
        }),
      )
    draft.completions["44444444444444448444444444444444"] =
      new Automerge.ImmutableString(
        JSON.stringify({
          id: "44444444444444448444444444444444",
          bookId: 7,
          format: "PDF",
          localDay: "2026-07-25",
          completedAt: 4000,
          updatedAt: 4000,
          replicaId: typescriptReplicaId,
        }),
      )
  },
)
const typescriptIncremental = Automerge.saveSince(typescriptDocument, heads)
const typescriptHeads = Automerge.getHeads(typescriptDocument)

await mkdir(fixtureDirectory, { recursive: true })
await writeFile(path.join(fixtureDirectory, "genesis.automerge"), bytes)
await writeFile(
  path.join(fixtureDirectory, "typescript-position.incremental"),
  typescriptIncremental,
)
await writeFile(
  path.join(fixtureDirectory, "manifest.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      genesisActor: "00000000000000000000000000000000",
      genesisHeads: heads,
      roots,
      libraryUuid,
      typescriptPosition: {
        replicaId: typescriptReplicaId,
        heads: typescriptHeads,
        bookId: 7,
        format: "PDF",
        displayProgressionPpm: 700000,
      },
      typescriptDomains: {
        favoriteBookId: 7,
        bookmarkKey: "7:PDF:page-7",
        annotationId: "22222222222242228222222222222222",
        sessionId: "33333333333343338333333333333333",
        completionId: "44444444444444448444444444444444",
      },
    },
    null,
    2,
  )}\n`,
)
await writeFile(
  generatedModulePath,
  `// Generated by scripts/generate-library-sidecar-automerge-fixtures.mjs.\n` +
    `// Do not edit by hand.\n` +
    `export const LIBRARY_SIDECAR_GENESIS_BASE64 = ${JSON.stringify(base64)}\n` +
    `export const LIBRARY_SIDECAR_GENESIS_HEADS = ${JSON.stringify(heads)} as const\n`,
)
