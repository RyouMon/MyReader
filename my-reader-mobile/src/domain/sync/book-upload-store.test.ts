import {
  applyBookUploadTaskProgress,
  getBookUploadState,
} from "./book-upload-store"

describe("book upload store", () => {
  it("should expose progress when the background book upload reports bytes", () => {
    applyBookUploadTaskProgress("library-1", {
      taskId: "task-1",
      completed: 25,
      total: 100,
      bookUuid: "book-uuid",
    })

    expect(getBookUploadState("library-1")).toEqual({
      taskId: "task-1",
      bookUuid: "book-uuid",
      progress: 0.25,
    })
  })
})
