jest.mock("../../services/core/catalog", () => ({
  getMyreaderBookContent: jest.fn(),
}))
jest.mock("../../services/core/content", () => ({
  deleteFileState: jest.fn(),
  finalizeDownloadedFile: jest.fn(),
  installVerifiedDownloadedFile: jest.fn(),
  markFileRemoteOnly: jest.fn(),
  markFileSourceMissing: jest.fn(),
}))
jest.mock("../../services/download/remote-to-local", () => ({
  downloadRemoteToLocalUri: jest.fn(),
}))
jest.mock("../../services/fs/file-io", () => ({
  deleteFileAtUri: jest.fn(),
}))
jest.mock("./resolve", () => ({
  isRemoteBackend: (backend: { kind: string }) =>
    backend.kind === "webdav" || backend.kind === "onedrive",
}))

import type { Library } from "@my-reader/tools/types/library"
import { getMyreaderBookContent } from "../../services/core/catalog"
import {
  installVerifiedDownloadedFile,
  markFileSourceMissing,
} from "../../services/core/content"
import { downloadRemoteToLocalUri } from "../../services/download/remote-to-local"
import type { RemoteBackend } from "../../services/remote/backend"
import type { SyncTargetContext } from "./context"
import { downloadFileDirectWithProgress } from "./transfer"

function managedContext(
  statRemoteFile: RemoteBackend["statRemoteFile"],
): SyncTargetContext {
  const library: Library = {
    id: "library-1",
    name: "Remote",
    path: "file:///cache",
    bookCount: 1,
    libraryType: "myreader",
    sourceType: "webdav",
    dataSourceId: "source-1",
    sourcePath: "Library",
  }
  return {
    library,
    libraryId: library.id,
    dataSourceId: "source-1",
    libraryRootUri: "file:///cache",
    librarySidecarRootUri: "file:///cache",
    libraryStorage: {
      kind: "webdav",
      endpoint: "https://example.com",
      username: "reader",
      password: "secret",
      root: "Library",
    },
    backend: {
      kind: "webdav",
      dataSourceId: "source-1",
      statRemoteFile,
    } as RemoteBackend,
  }
}

describe("managed library download transfer", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(getMyreaderBookContent).mockResolvedValue({
      bookId: 7,
      format: "EPUB",
      relativePath: "Books/uuid/book.epub",
      size: 4,
      sha256: "ab".repeat(32),
    })
    jest.mocked(downloadRemoteToLocalUri).mockResolvedValue({
      size: 4,
      mtimeMs: 100,
    })
    jest.mocked(installVerifiedDownloadedFile).mockResolvedValue({
      size: 4,
      sha256: "ab".repeat(32),
      mtimeMs: 100,
    })
  })

  it("should install a part file only after catalog digest verification", async () => {
    const ctx = managedContext(
      jest.fn().mockResolvedValue({ etag: "etag", size: 4, mtimeMs: 100 }),
    )

    await downloadFileDirectWithProgress(
      ctx,
      "Books/uuid/book.epub",
      undefined,
      { taskId: "download-1" },
      { bookId: "7", format: "EPUB" },
    )

    expect(downloadRemoteToLocalUri).toHaveBeenCalledWith(
      ctx.backend,
      "Books/uuid/book.epub",
      "file:///cache/Books/uuid/book.epub.part",
      undefined,
      { taskId: "download-1" },
    )
    expect(installVerifiedDownloadedFile).toHaveBeenCalledWith(
      ctx.library,
      "Books/uuid/book.epub",
      "file:///cache/Books/uuid/book.epub.part",
      "file:///cache/Books/uuid/book.epub",
      4,
      "ab".repeat(32),
    )
  })

  it("should record source_missing when the catalog entity is absent remotely", async () => {
    const ctx = managedContext(jest.fn().mockResolvedValue(null))

    await expect(
      downloadFileDirectWithProgress(
        ctx,
        "Books/uuid/book.epub",
        undefined,
        {},
        { bookId: "7", format: "EPUB" },
      ),
    ).rejects.toThrow("REMOTE_BOOK_FILE_NOT_FOUND")

    expect(markFileSourceMissing).toHaveBeenCalledWith(
      ctx.library,
      "Books/uuid/book.epub",
    )
    expect(downloadRemoteToLocalUri).not.toHaveBeenCalled()
  })
})
