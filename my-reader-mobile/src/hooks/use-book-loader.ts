import type { Locator } from "@my-reader/readium"
import { resolveReadFormat } from "@my-reader/tools/utils"
import { File } from "expo-file-system"
import { useEffect, useRef, useState } from "react"
import {
  buildCoverUri as buildLocalCoverUri,
  getBookFormatPaths,
  readBookDetailFromMetadata,
  resolveBookFileForRead,
} from "@/src/domain/library/calibre"
import { getReadingProgress } from "@/src/domain/library/reading-progress"
import {
  getReadingPositionCandidates,
  selectReadingPositionCandidate,
} from "@/src/domain/sync/library-sidecar/reading-position"
import type { LibrarySidecarReadingPositionCandidate } from "@/src/domain/sync/library-sidecar/automerge-document"
import { createRemoteOps } from "@/src/domain/library/remote-library"
import { getFileState } from "@/src/domain/sync/actions"
import type {
  BookItem,
  DataSource,
  Library,
  LocalState,
} from "@/src/domain/types"
import { isRemoteSourceType } from "@/src/domain/types"
import { pageIndexFromFixedLocator } from "@/src/features/reader/components/reader/locator"
import i18n from "@/src/i18n"
import { libraryBookFileUri } from "@/src/services/fs/library-paths"
import { queryClient } from "@/src/services/query/query-client"
import { useAppStore } from "@/src/store/app-store"
import { libraryQueryKeys } from "../features/library/hooks/useLibraryQuery"
import { isReadyBookLoadForRequest } from "./book-load-identity"

const INITIAL_READER_PAGE = 0

async function resolveRemoteCoverUri(
  library: Library,
  dataSources: DataSource[],
  bookPath: string,
  hasCover: boolean,
) {
  const ops = await createRemoteOps(library, dataSources)
  if (!ops) return undefined
  return ops.buildCoverUri(library, bookPath, hasCover)
}

function isDownloadedLocalState(state: LocalState | null | undefined): boolean {
  return state === "present" || state === "local_only" || state === "dirty_push"
}

async function readFileHeaderBytes(
  file: File,
  byteCount: number,
): Promise<Uint8Array> {
  const safeByteCount = Math.max(0, byteCount | 0)
  if (safeByteCount === 0) return new Uint8Array()
  const handle = file.open()
  try {
    return handle.readBytes(safeByteCount)
  } finally {
    handle.close()
  }
}

async function hasExpectedReaderSignature(
  file: File,
  format: string,
): Promise<boolean> {
  if (!file.exists || (file.size ?? 0) <= 0) return false
  const upper = format.toUpperCase()
  if (upper !== "EPUB" && upper !== "CBZ" && upper !== "PDF") return true
  const bytes = await readFileHeaderBytes(file, upper === "PDF" ? 4 : 2)

  if (upper === "PDF") {
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    )
  }
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

async function resolveDownloadedWebDavBookFile(input: {
  library: Library
  calibreBookId: number
  format: string
}): Promise<File | null> {
  const paths = await getBookFormatPaths(input.library, input.calibreBookId)
  const match = paths.find(
    (path) => path.format.toUpperCase() === input.format.toUpperCase(),
  )
  if (!match) return null

  const state = await getFileState(input.library, match.relativePath)
  if (!isDownloadedLocalState(state?.localState)) return null

  const file = new File(libraryBookFileUri(input.library, match.relativePath))
  if (await hasExpectedReaderSignature(file, input.format)) return file
  if (file.exists) file.delete()
  return null
}

type ReadyBookLoad = {
  libraryId: string
  /** EPUB 容器 `file://` URI，供 Readium 转原生路径打开。 */
  epubFileUri: string | null
  /** PDF：原生阅读器使用的稳定本地 `file://`（不经由 base64） */
  pdfLocalUri: string | null
  bookArchiveUri: string | null
  bookArchiveFingerprint: string | null
  bookArchiveOwned: boolean
  bookId: number
  format: string
  title: string
  languages: string[]
  initialPage: number
  initialLocator: Locator | null
  layoutMode: "fixedLayout" | "reflowable" | "unknown"
}

export type LoadState =
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | ({ status: "ready" } & ReadyBookLoad)
  | {
      status: "position-conflict"
      ready: ReadyBookLoad
      candidates: LibrarySidecarReadingPositionCandidate[]
    }

export function useBookLoader(
  id: string | undefined,
  formatParam: string | undefined,
  activeLibraryId: string | null,
) {
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    message: i18n.t("bookLoader.loadingBook"),
  })
  const [coverUri, setCoverUri] = useState<string | undefined>(undefined)
  const [bookTitle, setBookTitle] = useState<string | undefined>(undefined)
  const loadStateRef = useRef<LoadState>({
    status: "loading",
    message: i18n.t("bookLoader.loadingBook"),
  })

  useEffect(() => {
    loadStateRef.current = loadState
  }, [loadState])

  useEffect(() => {
    if (!id || !activeLibraryId) {
      setLoadState({
        status: "error",
        message: !id
          ? i18n.t("bookLoader.missingParam")
          : i18n.t("bookLoader.noLibrary"),
      })
      return
    }

    if (
      isReadyBookLoadForRequest(
        loadStateRef.current,
        activeLibraryId,
        id,
        formatParam,
      )
    ) {
      return
    }

    const state = useAppStore.getState()
    const currentLibrary =
      state.libraries.find((l) => l.id === activeLibraryId) ?? null
    if (!currentLibrary) {
      setLoadState({ status: "error", message: i18n.t("bookLoader.noLibrary") })
      return
    }
    const lib = currentLibrary

    const isRemoteSource = isRemoteSourceType(lib.sourceType)

    let cancelled = false

    async function load() {
      try {
        setLoadState({
          status: "loading",
          message: i18n.t("bookLoader.readingBookInfo"),
        })

        // 优先从已有的 books 列表中获取封面和标题，减少等待感
        const books =
          queryClient.getQueryData<BookItem[]>(
            libraryQueryKeys.books(activeLibraryId),
          ) ?? []
        const bookItem = books.find((b) => b.id === id)
        if (bookItem?.coverUri) {
          const cover = bookItem.coverUri
          setCoverUri(typeof cover === "string" ? cover : cover?.uri)
        }
        if (bookItem?.title) {
          setBookTitle(bookItem.title)
        }

        const calibreId = Number(id)
        if (!Number.isFinite(calibreId) || calibreId <= 0) {
          setLoadState({
            status: "error",
            message: i18n.t("bookLoader.invalidId"),
          })
          return
        }

        const detail = await readBookDetailFromMetadata(lib, calibreId)
        if (cancelled) return
        if (!detail) {
          setLoadState({
            status: "error",
            message: i18n.t("bookLoader.notFoundInLibrary"),
          })
          return
        }

        // 如果 books 列表中没有封面，用 detail 构建封面 URI
        if (!bookItem?.coverUri && detail.hasCover && detail.path) {
          let builtCover:
            | string
            | { uri: string; headers?: Record<string, string> }
            | undefined
          if (isRemoteSource) {
            builtCover = await resolveRemoteCoverUri(
              lib,
              state.dataSources,
              detail.path,
              detail.hasCover,
            )
          } else {
            builtCover = buildLocalCoverUri(lib, detail.path, detail.hasCover)
          }
          if (builtCover)
            setCoverUri(
              typeof builtCover === "string" ? builtCover : builtCover.uri,
            )
        }
        setBookTitle(detail.title)

        const fmt = resolveReadFormat(detail.formats, formatParam)
        if (!fmt) {
          setLoadState({
            status: "error",
            message: i18n.t("bookLoader.noReadableFormat"),
          })
          return
        }

        const fmtUpper = fmt.toUpperCase()

        setLoadState({
          status: "loading",
          message: isRemoteSource
            ? i18n.t("bookLoader.downloadingFromRemote")
            : i18n.t("bookLoader.loadingBookFile"),
        })

        const detailLayoutMode =
          fmtUpper === "EPUB"
            ? "reflowable"
            : fmtUpper === "PDF" || fmtUpper === "CBZ"
              ? "fixedLayout"
              : "unknown"

        const needsNativeComicPath = fmtUpper === "CBZ"
        const needsPdfNativePath = fmtUpper === "PDF"
        const needsEpubExtract = fmtUpper === "EPUB"

        const downloadedWebDavBookFile = isRemoteSource
          ? await resolveDownloadedWebDavBookFile({
              library: lib,
              calibreBookId: calibreId,
              format: fmt,
            })
          : null

        const localBookFile =
          !isRemoteSource && needsNativeComicPath
            ? await resolveBookFileForRead(lib, calibreId, fmt)
            : null
        const localEpubFile =
          needsEpubExtract && !isRemoteSource
            ? await resolveBookFileForRead(lib, calibreId, fmt)
            : null
        const webDavEpubFile =
          needsEpubExtract && isRemoteSource ? downloadedWebDavBookFile : null
        const webDavBookFile =
          isRemoteSource && needsNativeComicPath
            ? downloadedWebDavBookFile
            : null

        const pdfLocalFile = needsPdfNativePath
          ? isRemoteSource
            ? downloadedWebDavBookFile
            : await resolveBookFileForRead(lib, calibreId, fmt)
          : null

        const epubArchiveFile = localEpubFile ?? webDavEpubFile
        const requiredWebDavFile =
          isRemoteSource &&
          (needsEpubExtract || needsNativeComicPath || needsPdfNativePath)
        if (requiredWebDavFile && !downloadedWebDavBookFile) {
          setLoadState({
            status: "error",
            message: i18n.t("bookLoader.downloadFirst"),
          })
          return
        }

        if (cancelled) return

        const archiveFile = needsPdfNativePath
          ? pdfLocalFile
          : (localBookFile ?? webDavBookFile)
        const bookArchiveFingerprint = archiveFile
          ? `${calibreId}-${fmtUpper}-${archiveFile.md5 ?? `sz${archiveFile.size ?? 0}`}`
          : epubArchiveFile
            ? `${calibreId}-${fmtUpper}-${epubArchiveFile.md5 ?? `sz${epubArchiveFile.size ?? 0}`}`
            : `${calibreId}-${fmtUpper}-nohash`
        const bookArchiveOwned =
          Boolean(localBookFile) ||
          Boolean(needsPdfNativePath && !isRemoteSource && pdfLocalFile)

        const initialLocator = await getReadingProgress(lib, calibreId, fmt)
        if (cancelled) return
        console.info("[reading-sync] reader:initial-progress-loaded", {
          libraryId: lib.id,
          bookId: calibreId,
          format: fmtUpper,
          found: initialLocator !== null,
          href: initialLocator?.href ?? null,
          position: initialLocator?.locations?.position ?? null,
          totalProgression: initialLocator?.locations?.totalProgression ?? null,
        })

        const initialPage =
          detailLayoutMode === "fixedLayout"
            ? pageIndexFromFixedLocator(initialLocator, INITIAL_READER_PAGE)
            : INITIAL_READER_PAGE

        const ready: ReadyBookLoad = {
          libraryId: lib.id,
          epubFileUri:
            needsEpubExtract && epubArchiveFile ? epubArchiveFile.uri : null,
          pdfLocalUri:
            needsPdfNativePath && pdfLocalFile ? pdfLocalFile.uri : null,
          bookArchiveUri: archiveFile?.uri ?? null,
          bookArchiveFingerprint,
          bookArchiveOwned,
          bookId: calibreId,
          format: fmt,
          title: detail.title,
          languages: detail.languages,
          initialPage,
          initialLocator,
          layoutMode: detailLayoutMode,
        }
        const candidates = await getReadingPositionCandidates(
          lib,
          calibreId,
          fmt,
        )
        if (cancelled) return
        setLoadState(
          candidates.length > 1
            ? { status: "position-conflict", ready, candidates }
            : { status: "ready", ...ready },
        )
      } catch (e) {
        if (cancelled) return
        setLoadState({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id, activeLibraryId, formatParam])

  const resolveReadingPositionConflict = async (operationId: string | null) => {
    const current = loadStateRef.current
    if (current.status !== "position-conflict") return
    let initialLocator = current.ready.initialLocator
    if (operationId) {
      const candidate = current.candidates.find(
        (item) => item.operationId === operationId,
      )
      if (!candidate) throw new Error("Reading position candidate not found")
      const conflictLibrary = useAppStore
        .getState()
        .libraries.find((library) => library.id === current.ready.libraryId)
      if (!conflictLibrary) throw new Error("Library not found")
      await selectReadingPositionCandidate(
        conflictLibrary,
        current.ready.bookId,
        current.ready.format,
        operationId,
      )
      initialLocator = JSON.parse(candidate.value.locatorJson) as Locator
    }
    setLoadState({
      status: "ready",
      ...current.ready,
      initialLocator,
      initialPage:
        current.ready.layoutMode === "fixedLayout"
          ? pageIndexFromFixedLocator(initialLocator, INITIAL_READER_PAGE)
          : INITIAL_READER_PAGE,
    })
  }

  return {
    loadState,
    coverUri,
    bookTitle,
    resolveReadingPositionConflict,
  }
}
