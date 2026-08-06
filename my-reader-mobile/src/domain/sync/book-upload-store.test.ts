import {
  applyBookUploadTaskProgress,
  getBookUploadState,
  requestPendingBookUploads,
  subscribePendingBookUploads,
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

  it("should deliver an upload request when the runtime subscribes after the action", () => {
    requestPendingBookUploads("library-before-runtime", "book-before-runtime")
    const listener = jest.fn()

    const unsubscribe = subscribePendingBookUploads(listener)

    expect(listener).toHaveBeenCalledWith("library-before-runtime")
    expect(getBookUploadState("library-before-runtime")).toMatchObject({
      bookUuid: "book-before-runtime",
      progress: null,
    })
    unsubscribe()
  })
})
