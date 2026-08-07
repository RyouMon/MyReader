import { act, renderHook } from "@testing-library/react-native"

import { useSyncStatusHeaderAction } from "./use-sync-status-header-action"

const mockPush = jest.fn()
let mockPresentation: {
  indicator:
    | "idle"
    | "offline"
    | "recent_success"
    | "unchanged"
    | "syncing"
    | "pushing"
    | "pulling"
    | "failed"
  library: { id: string; name: string } | null
} = {
  indicator: "idle",
  library: null,
}

jest.mock("expo-router", () => ({
  router: { push: (route: string) => mockPush(route) },
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    danger: "#b00",
    primary: "#c4622d",
    success: "#080",
    text: "#111",
    textMuted: "#666",
  }),
}))

jest.mock("./use-sync-status-presentation", () => ({
  useSyncStatusPresentation: () => mockPresentation,
}))

describe("useSyncStatusHeaderAction", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPresentation = {
      indicator: "idle",
      library: null,
    }
  })

  it("should keep the global sync action mounted before library hydration", () => {
    const { result } = renderHook(() => useSyncStatusHeaderAction())

    expect(result.current.iosSfSymbol).toBe("icloud")

    act(() => result.current.onPress())

    expect(mockPush).toHaveBeenCalledWith("/sync-status")
  })

  it("should keep the toolbar foreground fixed across sync states", () => {
    mockPresentation = {
      indicator: "failed",
      library: { id: "library-1", name: "Current Library" },
    }
    const { result, rerender } = renderHook(() => useSyncStatusHeaderAction())

    expect(result.current.color).toBe("#111")

    mockPresentation = {
      indicator: "unchanged",
      library: { id: "library-1", name: "Current Library" },
    }
    rerender(undefined)

    expect(result.current.color).toBe("#111")
  })
})
