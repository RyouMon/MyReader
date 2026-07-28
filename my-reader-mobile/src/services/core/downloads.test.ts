jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    findActiveDownloadTask: jest.fn(),
    enqueueDownloadTask: jest.fn(),
    claimDownloadTasks: jest.fn(),
    claimDownloadTask: jest.fn(),
    markDownloadTaskStarted: jest.fn(),
    reportDownloadTaskProgress: jest.fn(),
    completeDownloadTask: jest.fn(),
    failDownloadTask: jest.fn(),
    cancelDownloadTask: jest.fn(),
    listDownloadTasks: jest.fn(),
    releaseDownloadTask: jest.fn(),
    clearFinishedDownloadTasks: jest.fn(),
  },
}))

import MyReaderRustComponents from "@/modules/myreader-rust-components"

import {
  cancelDownloadTask,
  enqueueDownloadTask,
  reportDownloadTaskProgress,
} from "./downloads"

describe("core download adapter", () => {
  it("should pass typed task fields when a download is enqueued", () => {
    jest.mocked(MyReaderRustComponents.enqueueDownloadTask).mockReturnValue({
      inserted: true,
      task: {
        id: "task",
        libraryId: "library",
        bookId: "42",
        format: "EPUB",
        relativePath: "Author/Book/book.epub",
        label: "Book",
        status: "queued",
        progress: 0,
        error: null,
      },
    })

    enqueueDownloadTask({
      id: "task",
      libraryId: "library",
      bookId: "42",
      format: "epub",
      relativePath: "Author/Book/book.epub",
      label: "Book",
    })

    expect(MyReaderRustComponents.enqueueDownloadTask).toHaveBeenCalledWith(
      "task",
      "library",
      "42",
      "epub",
      "Author/Book/book.epub",
      "Book",
    )
  })

  it("should forward progress and cancellation when native work changes", () => {
    reportDownloadTaskProgress("task", 50, 100)
    cancelDownloadTask("task")

    expect(
      MyReaderRustComponents.reportDownloadTaskProgress,
    ).toHaveBeenCalledWith("task", 50, 100)
    expect(MyReaderRustComponents.cancelDownloadTask).toHaveBeenCalledWith(
      "task",
    )
  })
})
