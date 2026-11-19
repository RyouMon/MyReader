jest.mock("my-reader-core", () => ({
  downloadCancel: jest.fn(),
  downloadEnqueue: jest.fn(),
  downloadReportProgress: jest.fn(),
}))

import {
  downloadCancel,
  downloadEnqueue,
  downloadReportProgress,
} from "my-reader-core"
import {
  cancelDownloadTask,
  enqueueDownloadTask,
  reportDownloadTaskProgress,
} from "./downloads"

describe("core download adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should pass typed task fields when a download is enqueued", () => {
    jest.mocked(downloadEnqueue).mockReturnValue({
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

    expect(downloadEnqueue).toHaveBeenCalledWith(
      "task",
      "library",
      "42",
      "epub",
      "Author/Book/book.epub",
      "Book",
    )
  })

  it("should forward progress and cancellation when native work changes", () => {
    jest.mocked(downloadReportProgress).mockReturnValue(undefined)
    jest.mocked(downloadCancel).mockReturnValue(true)

    reportDownloadTaskProgress("task", 50, 100)
    cancelDownloadTask("task")

    expect(downloadReportProgress).toHaveBeenCalledWith("task", 50, 100)
    expect(downloadCancel).toHaveBeenCalledWith("task")
  })

  it("reports an unknown native response length as indeterminate to Core", () => {
    jest
      .mocked(downloadReportProgress)
      .mockImplementation((_id, received, total) => {
        if (total < 0)
          throw new Error("total must be a non-negative safe integer number")
        return undefined
      })

    expect(() => reportDownloadTaskProgress("task", 0, -1)).not.toThrow()
    reportDownloadTaskProgress("task", 50, -1)
    expect(downloadReportProgress).toHaveBeenLastCalledWith("task", 50, 0)
    reportDownloadTaskProgress("task", 100, 100)
    expect(downloadReportProgress).toHaveBeenLastCalledWith("task", 100, 100)
  })
})
