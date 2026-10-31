import { act, renderHook, waitFor } from "@testing-library/react-native"
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query"
import type { PropsWithChildren } from "react"
import type { Library } from "@my-reader/tools/types/library"
import {
  draftBookCharacters,
  searchBookCharacterSources,
} from "@/src/services/core/narration"
import { useCharacterDraft } from "./use-character-draft"

jest.mock("@/src/services/core/narration", () => ({
  draftBookCharacters: jest.fn(),
  searchBookCharacterSources: jest.fn(),
}))
const library = { id: "library" } as Library
const book = { bookId: 1, title: "Book", authors: [], language: "zh" }
function mount() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useCharacterDraft(library, book), { wrapper })
}
beforeEach(() => jest.clearAllMocks())

it("keeps the live tail, replaces reasoning with text, and ignores late events after completion", async () => {
  let finish!: (value: []) => void
  jest.mocked(draftBookCharacters).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { result } = mount()
  act(() =>
    result.current.draftCharacters.mutate({ kind: "prompt", prompt: "Alice" }),
  )
  await waitFor(() => expect(draftBookCharacters).toHaveBeenCalled())
  const progress = jest.mocked(draftBookCharacters).mock.calls[0]![3]
  act(() => progress("reasoning", "思考"))
  expect(result.current.progress).toBe("思考")
  act(() => progress("text", "😀".repeat(2100)))
  expect(Array.from(result.current.progress)).toHaveLength(2048)
  await act(async () => finish([]))
  expect(result.current.progress).toBe("")
  act(() => progress("text", "late"))
  expect(result.current.progress).toBe("")
})

it("aborts superseded searches and pending work when leaving the screen", async () => {
  jest
    .mocked(searchBookCharacterSources)
    .mockImplementation(() => new Promise(() => {}))
  const { result, unmount } = mount()
  act(() => result.current.searchSources.mutate("first"))
  await waitFor(() =>
    expect(searchBookCharacterSources).toHaveBeenCalledTimes(1),
  )
  const first = jest.mocked(searchBookCharacterSources).mock.calls[0]![2]
  act(() => result.current.searchSources.mutate("second"))
  await waitFor(() =>
    expect(searchBookCharacterSources).toHaveBeenCalledTimes(2),
  )
  expect(first.aborted).toBe(true)
  const second = jest.mocked(searchBookCharacterSources).mock.calls[1]![2]
  unmount()
  expect(second.aborted).toBe(true)
})

it("cancels a draft without losing sources or accepting stale output after a restart", async () => {
  const sources = [{ title: "Book", url: "https://example.com" }]
  jest.mocked(searchBookCharacterSources).mockResolvedValueOnce(sources)
  const finishes: ((value: []) => void)[] = []
  jest
    .mocked(draftBookCharacters)
    .mockImplementation(() => new Promise((resolve) => finishes.push(resolve)))
  const { result } = mount()
  act(() => result.current.searchSources.mutate("Book"))
  await waitFor(() => expect(result.current.searchSources.isSuccess).toBe(true))
  const onSuccess = jest.fn()
  act(() =>
    result.current.draftCharacters.mutate(
      { kind: "prompt", prompt: "Alice" },
      { onSuccess },
    ),
  )
  await waitFor(() => expect(draftBookCharacters).toHaveBeenCalledTimes(1))
  const first = jest.mocked(draftBookCharacters).mock.calls[0]!
  act(() => first[3]("text", "partial"))
  act(() => result.current.cancelDraft())
  expect(first[4].aborted).toBe(true)
  expect(result.current.progress).toBe("")
  expect(result.current.draftCharacters.isPending).toBe(false)
  expect(result.current.searchSources.data).toEqual(sources)
  act(() =>
    result.current.draftCharacters.mutate({ kind: "prompt", prompt: "Alice" }),
  )
  await waitFor(() => expect(draftBookCharacters).toHaveBeenCalledTimes(2))
  act(() => jest.mocked(draftBookCharacters).mock.calls[1]![3]("text", "new"))
  await act(async () => {
    first[3]("text", "late")
    finishes[0]!([])
  })
  expect(onSuccess).not.toHaveBeenCalled()
  expect(result.current.progress).toBe("new")
  expect(result.current.draftCharacters.isPending).toBe(true)
  await act(async () => finishes[1]!([]))
  await waitFor(() =>
    expect(result.current.draftCharacters.isSuccess).toBe(true),
  )
})

beforeAll(() => notifyManager.setNotifyFunction((notify) => act(notify)))
afterAll(() => notifyManager.setNotifyFunction((notify) => notify()))
