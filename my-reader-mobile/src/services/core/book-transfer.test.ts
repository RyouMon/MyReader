jest.mock("my-reader-core", () => ({
  bookTransferReadTaskProgress: jest.fn(() => null),
  bookTransferReleaseTask: jest.fn(),
  bookTransferRunPendingUploads: jest.fn(),
  CoreFfiError: {
    DataIntegrity: {
      instanceOf: () => false,
    },
  },
}))

jest.mock("@/src/services/fs/library-paths", () => ({
  librarySidecarRootUri: () => "file:///sidecar",
}))

jest.mock("@/src/services/fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))

import {
  bookTransferReadTaskProgress,
  bookTransferReleaseTask,
  bookTransferRunPendingUploads,
} from "my-reader-core"
import type { Library } from "@my-reader/tools/types/library"

import { runPendingBookUploads } from "./book-transfer"

describe("core book transfer adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it("should report progress and release the task when background upload runs", async () => {
    jest.useFakeTimers()
    let finishUpload: ((completed: string[]) => void) | undefined
    jest.mocked(bookTransferRunPendingUploads).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve
        }),
    )
    jest.mocked(bookTransferReadTaskProgress).mockReturnValue({
      taskId: "book-upload:library-1:100:1",
      bookUuid: "book-uuid",
      completed: 25,
      total: 100,
    })
    jest.spyOn(Date, "now").mockReturnValue(100)
    const onProgress = jest.fn()

    const upload = runPendingBookUploads({
      library: { id: "library-1" } as Library,
      libraryRootUri: "file:///library",
      storage: {
        kind: "onedrive",
        accessToken: "token",
        root: "/Library",
      },
      onProgress,
    })
    jest.advanceTimersByTime(100)

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        bookUuid: "book-uuid",
        completed: 25,
        total: 100,
      }),
    )
    finishUpload?.(["book-uuid"])
    await expect(upload).resolves.toEqual(["book-uuid"])
    expect(bookTransferRunPendingUploads).toHaveBeenCalledWith(
      "book-upload:library-1:100:1",
      "/sidecar",
      "/library",
      { kind: "onedrive", accessToken: "token", root: "/Library" },
    )
    expect(bookTransferReleaseTask).toHaveBeenCalledWith(
      "book-upload:library-1:100:1",
    )
  })
})
