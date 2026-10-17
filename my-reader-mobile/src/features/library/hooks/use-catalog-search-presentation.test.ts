import { act, renderHook } from "@testing-library/react-native"
import { BackHandler, Keyboard } from "react-native"
import { useCatalogSearchPresentation } from "./use-catalog-search-presentation"

jest.mock("expo-router", () => ({ useIsFocused: () => true }))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

it("starts with a search button and only opens the editor when requested", () => {
  const onOpen = jest.fn()
  const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {})
  const { result } = renderHook(() =>
    useCatalogSearchPresentation("library", false, onOpen),
  )
  expect(result.current.isOpen).toBe(false)
  expect(result.current.action.iosSfSymbol).toBe("magnifyingglass")
  act(() => result.current.action.onPress())
  expect(result.current.isOpen).toBe(true)
  expect(onOpen).toHaveBeenCalledTimes(1)
  act(() => result.current.action.onPress())
  expect(result.current.isOpen).toBe(false)
  expect(dismiss).toHaveBeenCalled()
  dismiss.mockRestore()
})

it("closes the editor before navigating back on Android", () => {
  const subscribe = jest.spyOn(BackHandler, "addEventListener")
  const onClose = jest.fn()
  const { result } = renderHook(() =>
    useCatalogSearchPresentation("library", true, undefined, onClose),
  )
  const handler = subscribe.mock.calls.at(-1)![1]
  act(() => expect(handler({} as Parameters<typeof handler>[0])).toBe(true))
  expect(result.current.isOpen).toBe(false)
  expect(onClose).toHaveBeenCalledTimes(1)
  subscribe.mockRestore()
})

it("resets presentation when changing libraries", () => {
  const { result, rerender } = renderHook(
    ({ library }: { library: string }) => useCatalogSearchPresentation(library),
    { initialProps: { library: "one" } },
  )
  act(() => result.current.action.onPress())
  rerender({ library: "two" })
  expect(result.current.isOpen).toBe(false)
})
