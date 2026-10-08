import { beforeEach, describe, expect, it, vi } from "vitest"
import { PdfNavigator } from "../PdfNavigator"

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }))
vi.mock("pdfjs-dist", () => ({ getDocument }))
vi.mock("@/lib/pdfWorker", () => ({ ensurePdfJsWorker: vi.fn() }))

describe("PdfNavigator document lifetime", () => {
  beforeEach(() => {
    getDocument.mockReset()
  })

  it("releases the PDF worker when a loaded book closes", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    const document = { numPages: 3, loadingTask: { destroy } }
    getDocument.mockReturnValue({ promise: Promise.resolve(document) })
    const navigator = new PdfNavigator("book.pdf")

    await navigator.load()
    expect(navigator.totalPages).toBe(3)
    await navigator.destroy()
    await navigator.destroy()

    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it("releases a document that finishes loading after the reader closes", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    const document = { numPages: 3, loadingTask: { destroy } }
    let finishLoading!: (value: typeof document) => void
    getDocument.mockReturnValue({
      promise: new Promise((resolve) => {
        finishLoading = resolve
      }),
    })
    const navigator = new PdfNavigator("book.pdf")
    const loading = navigator.load()
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledOnce())
    await navigator.destroy()
    finishLoading(document)
    await loading

    expect(navigator.totalPages).toBe(0)
    expect(destroy).toHaveBeenCalledOnce()
  })
})
