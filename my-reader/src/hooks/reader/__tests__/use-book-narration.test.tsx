import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { useBookNarration } from "../use-book-narration"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
}))
vi.mock("@/lib/tauri-api", () => ({ api: { getBookNarration: mocks.get } }))
vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
  emit: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

it("refreshes an open character list when provider changes reset its saved voice", async () => {
  const before = {
    revision: 1,
    characters: [{ id: "alice", voice: { profileId: "removed" } }],
  }
  const after = { revision: 2, characters: [{ id: "alice", voice: null }] }
  mocks.get.mockResolvedValueOnce(before).mockResolvedValue(after)
  mocks.listen.mockResolvedValue(mocks.unlisten)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result, unmount } = renderHook(() => useBookNarration("library", 1), {
    wrapper,
  })
  await waitFor(() => expect(result.current.query.data).toEqual(before))
  expect(mocks.listen).toHaveBeenCalledWith(
    "myreader://tts-config-changed",
    expect.any(Function),
  )
  act(() => mocks.listen.mock.calls[0]![1]({ payload: { source: "settings" } }))
  await waitFor(() => expect(result.current.query.data).toEqual(after))
  unmount()
  expect(mocks.unlisten).toHaveBeenCalledOnce()
  client.clear()
})

it("releases the event listener even when it registers after unmount", async () => {
  let registered!: (cleanup: () => void) => void
  mocks.listen.mockReturnValue(
    new Promise((resolve) => {
      registered = resolve
    }),
  )
  const client = new QueryClient()
  const { unmount } = renderHook(() => useBookNarration("library", 1), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  unmount()
  await act(async () => registered(mocks.unlisten))
  expect(mocks.unlisten).toHaveBeenCalledOnce()
  client.clear()
})
