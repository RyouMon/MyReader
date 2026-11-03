import { act, renderHook, waitFor } from "@testing-library/react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { PropsWithChildren } from "react"
import { analyzeBookNarration } from "@/src/services/core/narration"
import { analyzeNarrationChapter } from "./narration-chapter"
import { useReadingPlan } from "./use-reading-plan"
import type { NarrationBookContext } from "./narration-playback"

jest.mock("@/src/services/core/narration", () => ({
  analyzeBookNarration: jest.fn(),
  getBookReadingPlan: jest.fn().mockResolvedValue([]),
}))
jest.mock("@my-reader/readium", () => ({
  publication: {
    getTtsContent: jest.fn().mockResolvedValue({
      utterances: [{ locator: { href: "one.xhtml" }, text: "一段文字" }],
    }),
  },
}))
jest.mock("@/src/domain/llm/use-book-narration", () => ({
  useBookNarration: () => ({ query: { data: { enabled: true } } }),
}))
jest.mock("@/src/services/core/tts", () => ({
  getTtsConfig: jest.fn().mockResolvedValue({}),
}))
jest.mock("./reader-tts", () => ({
  resolveReaderTtsSelection: () => ({ kind: "system", voiceId: "" }),
}))
jest.mock("@/src/i18n/error-message", () => ({ errorMessage: String }))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

it("shows automatic playback analysis in the current book and clears it on cancellation", async () => {
  let emit!: (kind: string, delta: string) => void
  let finish!: () => void
  jest.mocked(analyzeBookNarration).mockImplementationOnce(
    (_library, _requests, _signal, progress) =>
      new Promise((resolve) => {
        emit = progress!
        finish = resolve
      }),
  )
  const book = {
    library: { id: "library" },
    bookId: 1,
    contentVersion: "v1",
    positions: [],
    publicationId: "book",
  } as unknown as NarrationBookContext
  const abort = new AbortController()
  const stop = jest.fn(() => abort.abort())
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const { result, rerender } = renderHook(
    ({ currentBook }: { currentBook: NarrationBookContext }) =>
      useReadingPlan(
        currentBook,
        { href: "one.xhtml", type: "application/xhtml+xml" },
        "zh",
        stop,
        jest.fn(),
        jest.fn(),
      ),
    {
      initialProps: { currentBook: book },
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  )
  let analysis!: Promise<unknown>
  act(() => {
    analysis = analyzeNarrationChapter(
      book,
      { href: "one.xhtml", type: "application/xhtml+xml" },
      abort.signal,
    )
  })
  await waitFor(() => expect(analyzeBookNarration).toHaveBeenCalledTimes(1))
  act(() => {
    emit("started", "")
    emit("reasoning", "识别")
    emit("reasoning", "人物")
  })
  expect(result.current.progress).toBe("识别人物")
  expect(result.current.analyzing).toBe(true)
  act(() => result.current.cancel())
  expect(stop).toHaveBeenCalledTimes(1)
  expect(abort.signal.aborted).toBe(true)
  act(() => emit("text", "late"))
  expect(result.current.progress).toBe("")
  expect(result.current.analyzing).toBe(false)
  rerender({ currentBook: { ...book, bookId: 2 } })
  await act(async () => {
    finish()
    await analysis
  })
  expect(result.current.progress).toBe("")
})
