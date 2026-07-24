import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/tauri-api"
import {
  invalidateFavoriteBookQueries,
  useFavoriteBookSet,
} from "../useFavoriteBooksQuery"

vi.mock("@/lib/tauri-api", () => ({
  api: {
    listFavoriteBookIds: vi.fn(),
  },
}))

describe("favorite book queries", () => {
  let client: QueryClient

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

  it("should refresh the detail favorite state when synced favorites change", async () => {
    vi.mocked(api.listFavoriteBookIds)
      .mockResolvedValueOnce([42])
      .mockResolvedValueOnce([])
    const { result } = renderHook(() => useFavoriteBookSet("library-1"), {
      wrapper,
    })
    await waitFor(() => expect(result.current.favoriteSet.has(42)).toBe(true))

    await act(async () => {
      await invalidateFavoriteBookQueries(client, "library-1")
    })

    await waitFor(() => expect(result.current.favoriteSet.has(42)).toBe(false))
  })
})
