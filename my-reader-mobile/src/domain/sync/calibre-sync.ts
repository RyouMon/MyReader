import { File } from "expo-file-system"
import i18n from "@/src/i18n"
import {
  COVER_FILE_NAME,
  METADATA_DB_RELATIVE,
} from "@/src/services/fs/library-paths"
import { countBooks, listBookSummaries } from "../../repos/calibre/books"
import { getBookFormatRows } from "../../repos/calibre/data"
import { refreshRemoteLibrary } from "../../services/core/remote"
import { joinRelativePath } from "../../services/fs/path"
import { describeError } from "../../utils/common"
import { fetchBooks, forceRefreshLibraryMetadata } from "../library/calibre"
import { withLocalLibraryCalibreRoot } from "../library/local-library-content"
import type { Library } from "../types"
import { isRemoteSourceType } from "../types"

import { type BookDiff, type BookSummary, diffBooks } from "./book-diff"
import type { SyncTargetContext } from "./context"
import { LocalDirectBackend } from "./local"
import { isRemoteBackend, type SyncBackend } from "./resolve"
import { evictLocalFileOfflineSafe } from "./transfer"
import type { CalibreSyncResult, SyncLibraryOptions } from "./types"

function mapSummaries(
  rows: Awaited<ReturnType<typeof listBookSummaries>>,
): BookSummary[] {
  return rows.map((row) => ({
    id: String(row.id),
    path: row.path ?? undefined,
    hasCover: row.hasCover !== 0,
    formats: row.formats,
  }))
}

async function statMetadataEtag(
  library: Library,
  backend: SyncBackend,
): Promise<string | null> {
  if (isRemoteBackend(backend)) {
    const stat = await backend.statRemoteFile(METADATA_DB_RELATIVE)
    if (!stat) return null
    return stat.etag ?? `${stat.mtimeMs}-${stat.size}`
  }

  return withLocalLibraryCalibreRoot(library, async (calibreRootUri) => {
    const localBackend = new LocalDirectBackend(calibreRootUri)
    const stat = await localBackend.statRemote(METADATA_DB_RELATIVE)
    if (!stat.exists) return null
    return `${stat.mtimeMs}-${stat.size}`
  })
}

async function materializeMetadata(
  ctx: SyncTargetContext,
  etag: string,
  dataSources: import("../types").DataSource[],
): Promise<Library> {
  const { library, backend } = ctx

  if (isRemoteBackend(backend)) {
    const source = dataSources.find(
      (candidate) => candidate.id === library.dataSourceId,
    )
    if (!source) {
      throw new Error(`DATASOURCE_NOT_FOUND: ${library.dataSourceId ?? ""}`)
    }
    const refreshed = await refreshRemoteLibrary(library, source)
    return { ...refreshed.library, metadataEtag: etag }
  }

  const refreshed = await forceRefreshLibraryMetadata(library)
  return { ...refreshed, metadataEtag: etag }
}

async function evictRemovedBookFiles(
  library: Library,
  book: BookSummary,
  metadataUri: string,
): Promise<void> {
  if (!isRemoteSourceType(library.sourceType)) return
  if (!book.path) return

  try {
    await evictLocalFileOfflineSafe(
      library,
      joinRelativePath(book.path, COVER_FILE_NAME),
    )
  } catch {}

  const formatRows = await getBookFormatRows(metadataUri, Number(book.id))
  for (const row of formatRows.formats) {
    const relative = joinRelativePath(
      book.path,
      `${row.name}.${(row.format ?? "").toLowerCase()}`,
    )
    try {
      await evictLocalFileOfflineSafe(library, relative)
    } catch {}
  }
}

async function applyBookDiffCleanup(
  library: Library,
  diff: BookDiff,
  oldMetadataUri: string | undefined,
): Promise<void> {
  if (oldMetadataUri) {
    for (const book of diff.removed) {
      await evictRemovedBookFiles(library, book, oldMetadataUri)
    }
  }

  if (!isRemoteSourceType(library.sourceType)) return

  for (const { old: oldBook, new: newBook } of diff.modified) {
    if (!oldBook.path || oldBook.path === newBook.path) continue
    try {
      await evictLocalFileOfflineSafe(
        library,
        joinRelativePath(oldBook.path, COVER_FILE_NAME),
      )
    } catch {}
  }
}

/** Phase A — Calibre 同步：metadata.db stat → materialize → 书目 diff。 */
export async function syncCalibre(
  ctx: SyncTargetContext,
  dataSources: import("../types").DataSource[],
  options: Pick<SyncLibraryOptions, "forceCalibre">,
): Promise<CalibreSyncResult> {
  const { library } = ctx
  const forceCalibre = options.forceCalibre ?? false

  try {
    const etag = await statMetadataEtag(library, ctx.backend)
    if (!etag && !forceCalibre) {
      return {
        skipped: true,
        skipReason: "unchanged",
        changed: false,
        library,
      }
    }

    const unchanged =
      !forceCalibre &&
      etag !== null &&
      library.metadataEtag &&
      library.metadataEtag === etag

    if (unchanged) {
      return {
        skipped: true,
        skipReason: "unchanged",
        changed: false,
        library: etag ? { ...library, metadataEtag: etag } : library,
      }
    }

    const oldMetadataUri = library.metadataUri
    let oldSummaries: BookSummary[] = []
    if (oldMetadataUri) {
      const oldFile = new File(oldMetadataUri)
      if (oldFile.exists) {
        oldSummaries = mapSummaries(await listBookSummaries(oldMetadataUri))
      }
    }

    const nextEtag = etag ?? library.metadataEtag ?? ""
    let newLibrary = await materializeMetadata(ctx, nextEtag, dataSources)

    const newMetadataUri = newLibrary.metadataUri
    if (!newMetadataUri) {
      throw new Error(i18n.t("sync.cannotRedownloadMeta"))
    }

    const newSummaries = mapSummaries(await listBookSummaries(newMetadataUri))
    const newBookCount = await countBooks(newMetadataUri)
    newLibrary = { ...newLibrary, bookCount: newBookCount }

    const diff = diffBooks(oldSummaries, newSummaries)
    await applyBookDiffCleanup(newLibrary, diff, oldMetadataUri)

    const books = await fetchBooks(newLibrary, dataSources)

    return {
      skipped: false,
      changed: true,
      library: newLibrary,
      books,
      diff,
    }
  } catch (err) {
    return {
      skipped: true,
      skipReason: "error",
      changed: false,
      library,
      error: describeError(err),
    }
  }
}

export function skippedCalibre(library: Library): CalibreSyncResult {
  return {
    skipped: true,
    skipReason: "not_applicable",
    changed: false,
    library,
  }
}
