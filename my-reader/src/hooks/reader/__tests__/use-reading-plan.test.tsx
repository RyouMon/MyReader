import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { PropsWithChildren } from "react"
import { beforeEach, expect, it, vi } from "vitest"
import { api } from "@/lib/tauri-api"
import { useReadingPlan } from "../use-reading-plan"

vi.mock("@/lib/tauri-api", () => ({
  api: { analyzeBookNarration: vi.fn(), getBookReadingPlan: vi.fn() },
}))
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))
vi.mock("@/lib/readium/narrationDecorations", () => ({
  applyNarrationDecorations: vi.fn(),
}))
vi.mock("@/lib/tts/narration-context", () => ({
  contentVersion: vi.fn().mockResolvedValue("v1"),
  narrationContext: vi.fn().mockResolvedValue({ text: "一段文字" }),
}))
vi.mock("@/lib/error-presentation", () => ({ errorMessage: String }))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getBookReadingPlan).mockResolvedValue([])
})

it("streams chapter analysis, ignores cancelled output and resets after changing books", async () => {
  const work: {
    emit: NonNullable<Parameters<typeof api.analyzeBookNarration>[3]>
    signal: AbortSignal
    finish: () => void
  }[] = []
  vi.mocked(api.analyzeBookNarration).mockImplementation(
    (_library, _requests, signal, emit) =>
      new Promise((finish) => {
        work.push({ emit: emit!, signal: signal!, finish })
      }),
  )
  const options = {
    libraryId: "library",
    enabled: true,
    resources: [],
    utterances: [{ text: "一段文字", locator: { href: "chapter.xhtml" } }],
    voice: { engine: "system", voiceId: "" },
    navigatorRef: { current: null },
    currentLocator: null,
    stop: vi.fn(),
    playEntry: vi.fn(),
    navigate: vi.fn(),
  } as unknown as Omit<Parameters<typeof useReadingPlan>[0], "bookId">
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const { result, rerender } = renderHook(
    ({ bookId }) => useReadingPlan({ ...options, bookId }),
    {
      initialProps: { bookId: 1 },
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  )
  await waitFor(() => expect(api.getBookReadingPlan).toHaveBeenCalled())
  act(() => {
    void result.current.analyze()
  })
  await waitFor(() => expect(work).toHaveLength(1))
  act(() => work[0]!.emit({ kind: "reasoning", delta: "识别旁白" }))
  expect(result.current.progress).toBe("识别旁白")
  expect(result.current.analyzing).toBe(true)
  act(() => result.current.cancel())
  expect(work[0]!.signal.aborted).toBe(true)
  expect(result.current.progress).toBe("")
  act(() => {
    void result.current.analyze()
  })
  await waitFor(() => expect(work).toHaveLength(2))
  act(() => work[1]!.emit({ kind: "text", delta: "当前输出" }))
  await act(async () => {
    work[0]!.emit({ kind: "text", delta: "过时输出" })
    work[0]!.finish()
  })
  expect(result.current.progress).toBe("当前输出")
  expect(result.current.analyzing).toBe(true)
  rerender({ bookId: 2 })
  await act(async () => {
    work[1]!.emit({ kind: "text", delta: "另一本书" })
    work[1]!.finish()
  })
  expect(result.current.progress).toBe("")
  expect(result.current.analyzing).toBe(false)
})
