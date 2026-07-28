jest.mock("./transport", () => ({
  invokeCoreSync: jest.fn(),
}))

import { invokeCoreSync } from "./transport"
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
    jest.mocked(invokeCoreSync).mockReturnValue({
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

    expect(invokeCoreSync).toHaveBeenCalledWith("download", "enqueue", {
      id: "task",
      libraryId: "library",
      bookId: "42",
      format: "epub",
      relativePath: "Author/Book/book.epub",
      label: "Book",
    })
  })

  it("should forward progress and cancellation when native work changes", () => {
    jest.mocked(invokeCoreSync).mockReturnValue(null)

    reportDownloadTaskProgress("task", 50, 100)
    cancelDownloadTask("task")

    expect(invokeCoreSync).toHaveBeenCalledWith("download", "reportProgress", {
      taskId: "task",
      received: 50,
      total: 100,
    })
    expect(invokeCoreSync).toHaveBeenCalledWith("download", "cancel", {
      taskId: "task",
    })
  })
})
