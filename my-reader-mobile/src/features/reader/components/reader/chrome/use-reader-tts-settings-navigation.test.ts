import { act, renderHook } from "@testing-library/react-native"

import { useReaderTtsSettingsNavigation } from "./use-reader-tts-settings-navigation"

describe("useReaderTtsSettingsNavigation", () => {
  it("returns through the actual provider flow history", () => {
    const { result } = renderHook(() => useReaderTtsSettingsNavigation())

    act(() => result.current.push("providers"))
    act(() => result.current.push("providerType"))
    act(() => result.current.push("providerForm"))

    expect(result.current.currentRoute.name).toBe("providerForm")
    expect(result.current.transitionDirection).toBe("forward")

    act(() => result.current.pop())

    expect(result.current.currentRoute.name).toBe("providerType")
    expect(result.current.transitionDirection).toBe("back")
  })

  it("returns directly to the provider list after saving a nested form", () => {
    const { result } = renderHook(() => useReaderTtsSettingsNavigation())

    act(() => result.current.push("providers"))
    act(() => result.current.push("providerType"))
    act(() => result.current.push("providerForm"))
    act(() => result.current.popTo("providers"))

    expect(result.current.currentRoute.name).toBe("providers")
    expect(result.current.canGoBack).toBe(true)

    act(() => result.current.reset())

    expect(result.current.currentRoute.name).toBe("settings")
    expect(result.current.canGoBack).toBe(false)
  })
})
