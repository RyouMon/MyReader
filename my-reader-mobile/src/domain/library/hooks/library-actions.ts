import type { DataSource } from "@my-reader/tools/types/data-source"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { type Library, libraryTypeOf } from "@my-reader/tools/types/library"
import * as DocumentPicker from "expo-document-picker"
import { Directory, File, Paths } from "expo-file-system"
import { Platform } from "react-native"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  deleteBookFromLibrary,
  ensureLibraryMetadataCached,
  importBookIntoLibrary,
  libraryQueryKeys,
  mapListRowsToBookItems,
  updateBookMetadataInLibrary,
} from "@/src/domain/library/catalog"
import type { BookItem } from "@/src/domain/types"
import type { PickedLocalLibrary } from "@/src/domain/library/local-library-picker"
import { runLibrarySync } from "@/src/domain/sync/hooks/run-library-sync"
import i18n from "@/src/i18n"
import {
  addLocalAppLibrary,
  createLocalMyReaderLibrary as createLocalMyReaderLibraryInCore,
  createManagedLocalMyReaderLibrary as createManagedLocalMyReaderLibraryInCore,
  openLocalMyReaderLibrary as openLocalMyReaderLibraryInCore,
  removeAppLibrary,
  replaceAppLibrary,
  switchAppLibrary,
} from "@/src/services/core/app-config"
import {
  addRemoteLibrary,
  createRemoteMyreaderLibrary,
  openRemoteMyreaderLibrary,
} from "@/src/services/core/remote"
import {
  createSecurityScopedBookmark,
  withSecurityScopedLibraryAccess,
} from "@/src/services/fs/bookmarks"
import { createExclusiveLibraryDirectory } from "@/src/services/fs/library-directory"
import {
  librariesContainerRootUri,
  libraryContainerRootUri,
  METADATA_DB_RELATIVE,
} from "@/src/services/fs/library-paths"
import { fileUriFor } from "@/src/services/fs/path"
import { queryClient } from "@/src/services/query/query-client"
import { useAppStore } from "@/src/store/app-store"
import { excludeLocalLibrarySource } from "@/src/store/app-store.constants"
import { scheduleIdleWork, uuid } from "@/src/utils/common"

const SUPPORTED_BOOK_EXTENSIONS = new Set([".epub", ".pdf", ".cbz"])

/** Resolves a supported import extension from the original name or file URI. */
export function supportedBookExtension(
  sourceFile: File,
  originalName?: string | null,
): string | null {
  const extension = originalName
    ? `.${originalName.split(".").at(-1) ?? ""}`.toLowerCase()
    : sourceFile.extension.toLowerCase()
  return SUPPORTED_BOOK_EXTENSIONS.has(extension) ? extension : null
}

function applyLibraryConfig(config: {
  libraries: Library[]
  activeLibraryId: string | null
}): void {
  useAppStore.getState().setLibraries(config.libraries)
  useAppStore.getState().setActiveLibraryId(config.activeLibraryId)
}

function startInitialLibrarySync(libraryId: string, context: string): void {
  if (useAppStore.getState().activeLibraryId !== libraryId) return
  void runLibrarySync({
    libraryId,
    trigger: "add",
    options: {
      forceCalibre: false,
      throwOnFailure: false,
    },
  }).catch((error) => {
    console.warn(`[${context}] add sync failed:`, error)
  })
}

/** Hydrates persisted libraries into store on app startup. */
export async function hydrateLibraries(): Promise<void> {
  try {
    const config = useAppStore.getState()
    const hydratedLibraries = await Promise.all(
      config.libraries.map(async (library) => {
        try {
          return await ensureLibraryMetadataCached(library)
        } catch {
          return library
        }
      }),
    )

    const nextActiveLibraryId =
      hydratedLibraries.find((library) => library.id === config.activeLibraryId)
        ?.id ??
      hydratedLibraries[0]?.id ??
      null

    useAppStore.getState().setLibraries(hydratedLibraries)
    useAppStore
      .getState()
      .setDataSources(excludeLocalLibrarySource(config.dataSources))
    useAppStore.getState().setActiveLibraryId(nextActiveLibraryId)
  } catch {
    useAppStore.getState().setLibraries([])
    useAppStore.getState().setActiveLibraryId(null)
  } finally {
    useAppStore.getState().setStoreReady(true)
  }
}

/** Downloads, validates, and adds a remote Calibre library through core. */
export async function addRemoteLibraryFromSource(
  source: DataSource,
  sourcePath: string,
): Promise<Library> {
  const { library, config } = await addRemoteLibrary(source, sourcePath)
  applyLibraryConfig(config)

  startInitialLibrarySync(library.id, "addRemoteLibraryFromSource")

  return library
}

export function nextMyReaderLibraryName(): string {
  const baseName = i18n.t("common.myLibrary")
  const names = new Set(
    useAppStore
      .getState()
      .libraries.filter((library) => libraryTypeOf(library) === "myreader")
      .map((library) => library.name),
  )
  if (!names.has(baseName)) return baseName

  let suffix = 2
  while (names.has(`${baseName} ${suffix}`)) {
    suffix += 1
  }
  return `${baseName} ${suffix}`
}

/** Creates a writable MyReader library in the app-owned library container. */
export async function createAppInternalMyReaderLibrary(
  name = nextMyReaderLibraryName(),
): Promise<Library> {
  const result = await createManagedLocalMyReaderLibraryInCore({
    librariesRootUri: librariesContainerRootUri(),
    name,
    addedAt: Date.now(),
  })
  applyLibraryConfig(result.config)
  startInitialLibrarySync(result.library.id, "createAppInternalMyReaderLibrary")
  return result.library
}

function assertIOSLocalStorageSupported(): void {
  if (Platform.OS !== "ios") throw new Error("LOCAL_STORAGE_UNSUPPORTED")
}

/** Creates a MyReader library in an iOS user-selected directory. */
export async function createFolderMyReaderLibrary(
  picked: PickedLocalLibrary | null,
  name = nextMyReaderLibraryName(),
): Promise<Library | null> {
  if (picked === null) return null
  assertIOSLocalStorageSupported()

  const accessLibrary: Library = {
    id: "",
    name,
    path: picked.uri,
    bookCount: 0,
    libraryType: "myreader",
    sourceType: "local",
    securityScopedBookmark: picked.securityScopedBookmark,
  }
  const result = await withSecurityScopedLibraryAccess(
    accessLibrary,
    async (parentRootUri) => {
      const libraryRoot = createExclusiveLibraryDirectory(parentRootUri, name)
      try {
        const bookmark = await createSecurityScopedBookmark(libraryRoot.uri)
        if (!bookmark) throw new Error("SECURITY_SCOPED_BOOKMARK_REQUIRED")
        return createLocalMyReaderLibraryInCore({
          libraryRootUri: bookmark.resolvedUri,
          path: bookmark.resolvedUri,
          sidecarContainerParentUri: librariesContainerRootUri(),
          name,
          addedAt: Date.now(),
          securityScopedBookmark: bookmark,
        })
      } catch (error) {
        if (libraryRoot.exists) libraryRoot.delete()
        throw error
      }
    },
  )
  applyLibraryConfig(result.config)
  startInitialLibrarySync(result.library.id, "createFolderMyReaderLibrary")
  return result.library
}

/** Opens an existing MyReader library from an authorized iOS directory. */
async function openLocalMyReaderLibraryFromPicker(
  picked: PickedLocalLibrary | null,
): Promise<Library | null> {
  if (picked === null) return null
  assertIOSLocalStorageSupported()

  const accessLibrary: Library = {
    id: "",
    name: picked.name ?? "",
    path: picked.uri,
    bookCount: 0,
    libraryType: "myreader",
    sourceType: "local",
    securityScopedBookmark: picked.securityScopedBookmark,
  }
  const result = await withSecurityScopedLibraryAccess(
    accessLibrary,
    (libraryRootUri) =>
      openLocalMyReaderLibraryInCore({
        libraryRootUri,
        path: picked.uri,
        sidecarContainerParentUri: librariesContainerRootUri(),
        name: picked.name,
        addedAt: Date.now(),
        securityScopedBookmark: picked.securityScopedBookmark,
      }),
  )
  applyLibraryConfig(result.config)
  startInitialLibrarySync(
    result.library.id,
    "openLocalMyReaderLibraryFromPicker",
  )
  return result.library
}

async function registerCalibreLibraryFromPicker(
  picked: PickedLocalLibrary,
): Promise<Library> {
  assertIOSLocalStorageSupported()
  const accessLibrary: Library = {
    id: "",
    name: picked.name ?? "",
    path: picked.uri,
    bookCount: 0,
    libraryType: "calibre",
    sourceType: "local",
    securityScopedBookmark: picked.securityScopedBookmark,
  }
  const result = await withSecurityScopedLibraryAccess(
    accessLibrary,
    (libraryRootUri) =>
      addLocalAppLibrary({
        libraryRootUri,
        path: picked.uri,
        sidecarContainerParentUri: librariesContainerRootUri(),
        name: picked.name,
        metadataUri: fileUriFor(libraryRootUri, METADATA_DB_RELATIVE),
        addedAt: Date.now(),
        securityScopedBookmark: picked.securityScopedBookmark,
      }),
  )
  applyLibraryConfig(result.config)
  startInitialLibrarySync(result.library.id, "registerCalibreLibraryFromPicker")
  return result.library
}

/** Opens an existing iOS local MyReader or Calibre library. */
export async function openExistingLocalLibraryFromPicker(
  picked: PickedLocalLibrary | null,
): Promise<Library | null> {
  if (picked === null) return null
  assertIOSLocalStorageSupported()

  try {
    return await openLocalMyReaderLibraryFromPicker(picked)
  } catch (error) {
    if (!isMissingMyReaderMarker(error)) throw error
  }

  try {
    return await registerCalibreLibraryFromPicker(picked)
  } catch (error) {
    if (String(error).includes("METADATA_DB_NOT_FOUND")) {
      throw new Error("LIBRARY_TYPE_NOT_RECOGNIZED")
    }
    throw error
  }
}

async function addRemoteMyReaderLibrary(
  source: DataSource,
  sourcePath: string,
  operation: "create" | "open",
  name?: string,
): Promise<Library> {
  const pathName = sourcePath.split("/").filter(Boolean).at(-1)
  let inferredName = pathName
  if (pathName) {
    try {
      inferredName = decodeURIComponent(pathName)
    } catch {
      inferredName = pathName
    }
  }
  const result =
    operation === "create"
      ? await createRemoteMyreaderLibrary(
          source,
          sourcePath,
          name ?? inferredName ?? nextMyReaderLibraryName(),
        )
      : await openRemoteMyreaderLibrary(source, sourcePath)
  applyLibraryConfig(result.config)
  startInitialLibrarySync(
    result.library.id,
    operation === "create"
      ? "createRemoteMyReaderLibrary"
      : "openRemoteMyReaderLibrary",
  )
  return result.library
}

export function createRemoteMyReaderLibrary(
  source: DataSource,
  sourcePath: string,
  name?: string,
): Promise<Library> {
  return addRemoteMyReaderLibrary(source, sourcePath, "create", name)
}

export function openRemoteMyReaderLibrary(
  source: DataSource,
  sourcePath: string,
): Promise<Library> {
  return addRemoteMyReaderLibrary(source, sourcePath, "open")
}

function isMissingMyReaderMarker(error: unknown): boolean {
  return String(error).includes("MYREADER_LIBRARY_MARKER_NOT_FOUND")
}

/** Opens an existing remote MyReader or Calibre library at the selected root. */
export async function openRemoteExistingLibrary(
  source: DataSource,
  sourcePath: string,
): Promise<Library> {
  try {
    return await openRemoteMyReaderLibrary(source, sourcePath)
  } catch (error) {
    if (!isMissingMyReaderMarker(error)) throw error
    return addRemoteLibraryFromSource(source, sourcePath)
  }
}

async function persistLibraryBookCount(
  library: Library,
  bookCount: number,
): Promise<void> {
  const config = await replaceAppLibrary({
    ...library,
    bookCount: Math.max(0, bookCount),
  })
  applyLibraryConfig(config)
}

function selectedManagedLibrary(library?: Library | null): Library | null {
  if (library && libraryTypeOf(library) === "myreader") return library

  const state = useAppStore.getState()
  const active = state.libraries.find(
    (candidate) => candidate.id === state.activeLibraryId,
  )
  if (active && libraryTypeOf(active) === "myreader") return active
  return (
    state.libraries.find(
      (candidate) => libraryTypeOf(candidate) === "myreader",
    ) ?? null
  )
}

function addPendingBookImport(
  library: Library,
  title: string,
  extension: string,
): string {
  const id = `import:${uuid()}`
  const format = extension.slice(1).toUpperCase()
  const author = i18n.t("common.unknownAuthor")
  const pending: BookItem = {
    id,
    title: title || i18n.t("common.unnamedBook"),
    author,
    authors: [author],
    formats: [format],
    readableFormats: [format],
    preferredFormat: format,
    timestamp: new Date().toISOString(),
    importStatus: "importing",
  }
  queryClient.setQueryData<BookItem[]>(
    libraryQueryKeys.pendingImports(library.id),
    (current = []) => [pending, ...current],
  )
  return id
}

function removePendingBookImport(libraryId: string, importId: string): void {
  queryClient.setQueryData<BookItem[]>(
    libraryQueryKeys.pendingImports(libraryId),
    (current = []) => current.filter((book) => book.id !== importId),
  )
}

function cacheImportedBook(library: Library, book: CalibreBook): void {
  const imported = mapListRowsToBookItems(library, [book])[0]
  if (!imported) return
  queryClient.setQueryData<BookItem[]>(
    libraryQueryKeys.books(library.id),
    (current = []) => [
      imported,
      ...current.filter((candidate) => candidate.id !== imported.id),
    ],
  )
}

/** Imports one supported file into a writable MyReader library. */
export async function importBookFromFile(
  sourceFile: File,
  library?: Library | null,
  originalName?: string | null,
): Promise<{
  library: Library
  bookId: number
} | null> {
  const extension = supportedBookExtension(sourceFile, originalName)
  if (!extension) return null

  const targetLibrary = selectedManagedLibrary(library)
  if (!targetLibrary) throw new Error("MYREADER_LIBRARY_REQUIRED")
  const originalTitle = (originalName?.trim() || sourceFile.name).trim()
  const title = originalTitle.toLowerCase().endsWith(extension)
    ? originalTitle.slice(0, -extension.length).trim()
    : originalTitle
  const pendingImportId = addPendingBookImport(targetLibrary, title, extension)
  let stagedSource: File | null = null

  try {
    let importSource = sourceFile
    if (!sourceFile.uri.startsWith("file://")) {
      const importDirectory = new Directory(Paths.cache, "book-imports")
      if (!importDirectory.exists) {
        importDirectory.create({ idempotent: true, intermediates: true })
      }
      stagedSource = new File(importDirectory, `${uuid()}${extension}`)
      await sourceFile.copy(stagedSource)
      importSource = stagedSource
    }
    const book = await importBookIntoLibrary(targetLibrary, {
      sourceFileUri: importSource.uri,
      sourceFileName: originalName?.trim() || sourceFile.name,
      authors: [i18n.t("common.unknownAuthor")],
      consumeSourceFile: true,
    })
    cacheImportedBook(targetLibrary, book)
    removePendingBookImport(targetLibrary.id, pendingImportId)
    await persistLibraryBookCount(targetLibrary, targetLibrary.bookCount + 1)
    if (useAppStore.getState().activeLibraryId !== targetLibrary.id) {
      await switchActiveLibrary(targetLibrary.id)
    }
    return { library: targetLibrary, bookId: book.id }
  } finally {
    removePendingBookImport(targetLibrary.id, pendingImportId)
    if (stagedSource?.exists) {
      stagedSource.delete()
    }
  }
}

/** Picks one supported book and imports it into a writable MyReader library. */
export async function importBookFromPicker(library?: Library | null): Promise<{
  library: Library
  bookId: number
} | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: "*/*",
  })
  if (picked.canceled) return null

  const [asset] = picked.assets
  if (!asset) return null
  const sourceFile = new File(asset.uri)
  if (!supportedBookExtension(sourceFile, asset.name)) {
    showAlertWithStatusBarRestore(
      i18n.t("library.importUnsupported.title"),
      i18n.t("library.importUnsupported.detail"),
      [{ text: i18n.t("common.gotIt") }],
    )
    return null
  }

  return importBookFromFile(sourceFile, library, asset.name)
}

export async function updateManagedBookMetadata(
  library: Library,
  input: { bookId: number; title: string; authors: string[] },
): Promise<void> {
  await updateBookMetadataInLibrary(library, input)
  await queryClient.invalidateQueries({
    queryKey: libraryQueryKeys.books(library.id),
  })
}

export async function deleteManagedBook(
  library: Library,
  bookId: number,
): Promise<void> {
  await deleteBookFromLibrary(library, bookId)
  const queryKey = libraryQueryKeys.books(library.id)
  await queryClient.cancelQueries({ queryKey, exact: true })
  queryClient.setQueryData<BookItem[]>(queryKey, (current) =>
    current?.filter((book) => book.id !== String(bookId)),
  )
  try {
    await persistLibraryBookCount(library, library.bookCount - 1)
  } finally {
    await queryClient.invalidateQueries({ queryKey })
  }
}

function scheduleLibraryContainerRemoval(
  id: string,
  library: Library | undefined,
): void {
  if (!library) return

  scheduleIdleWork(() => {
    try {
      const container = new Directory(libraryContainerRootUri(id))
      if (container.exists) {
        container.delete()
      }
    } catch (error) {
      console.warn(`[removeLibrary] container cleanup failed (${id}):`, error)
    }
  })
}

/** Removes registration and app-owned files. External source files remain untouched. */
export async function removeLibrary(id: string): Promise<void> {
  const config = useAppStore.getState()
  const removed = config.libraries.find((library) => library.id === id)
  const appConfig = await removeAppLibrary(id)

  useAppStore.getState().setLibraries(appConfig.libraries)
  useAppStore.getState().setActiveLibraryId(appConfig.activeLibraryId)
  useAppStore.getState().removeLibrarySyncStatus(id)

  queryClient.removeQueries({
    queryKey: libraryQueryKeys.books(id),
    exact: true,
  })
  scheduleLibraryContainerRemoval(id, removed)
}

/** Switches the active library without blocking on sync. */
export async function switchActiveLibrary(id: string): Promise<void> {
  const appConfig = await switchAppLibrary(id)
  useAppStore.getState().setActiveLibraryId(appConfig.activeLibraryId)
}
