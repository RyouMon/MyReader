import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"

describe("useReaderPanels", () => {
  it("keeps TTS settings mutually exclusive with the other reader panels", () => {
    const { result } = renderHook(() => useReaderPanels())

    act(() => result.current.toggleSettings())
    expect(result.current.settingsOpen).toBe(true)

    act(() => result.current.toggleTtsSettings())
    expect(result.current.settingsOpen).toBe(false)
    expect(result.current.ttsSettingsOpen).toBe(true)

    act(() => result.current.toggleSearch())
    expect(result.current.ttsSettingsOpen).toBe(false)
    expect(result.current.searchOpen).toBe(true)
  })
})
