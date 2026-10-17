import { act, render } from "@testing-library/react-native"
import CatalogTokenInput from "./catalog-token-input.android"
import { LibraryTabVisibilityContext } from "./library-tab-visibility"

const mockFocus = jest.fn()
const mockListeners = new Map<string, Set<(event: unknown) => void>>()
const mockNavigation = {
  isFocused: jest.fn(() => true),
  addListener: (name: string, listener: (event: unknown) => void) => {
    const listeners = mockListeners.get(name) ?? new Set()
    mockListeners.set(name, listeners)
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

jest.mock("expo-router", () => ({
  useNavigation: () => mockNavigation,
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({}),
}))
jest.mock("@expo/ui/jetpack-compose", () => {
  const React = jest.requireActual<typeof import("react")>("react")
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native")
  function TextField({
    ref,
    autoFocus,
    children,
  }: {
    ref: React.Ref<{ focus: () => void }>
    autoFocus: boolean
    children: React.ReactNode
  }) {
    React.useImperativeHandle(ref, () => ({ focus: mockFocus }))
    React.useEffect(() => {
      if (autoFocus) mockFocus()
    }, [autoFocus])
    return React.createElement(View, null, children)
  }
  TextField.LeadingIcon = View
  TextField.Placeholder = View
  TextField.TrailingIcon = View
  return {
    Column: View,
    FlowRow: View,
    Host: View,
    Icon: View,
    IconButton: View,
    Text: View,
    TextField,
    useNativeState: () => React.useMemo(() => ({ set: jest.fn() }), []),
  }
})
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  fillMaxWidth: jest.fn(),
  onSizeChanged: jest.fn(),
  semantics: jest.fn(),
}))

const props = {
  tokens: [],
  text: "",
  placeholder: "Search books",
  onChange: jest.fn(),
  onSubmit: jest.fn(),
  onHeightChange: jest.fn(),
}

function emit(name: string, data = { closing: false }) {
  act(() => mockListeners.get(name)?.forEach((listener) => listener({ data })))
}

beforeEach(() => {
  mockFocus.mockClear()
  mockListeners.clear()
  mockNavigation.isFocused.mockReturnValue(true)
})

it("recovers the search focus after the native entry transition", () => {
  render(<CatalogTokenInput {...props} />)
  expect(mockFocus).toHaveBeenCalledTimes(1)

  emit("transitionEnd")

  expect(mockFocus).toHaveBeenCalledTimes(2)
})

it("does not refocus a dismissed keyboard on rerenders or later transitions", () => {
  const { rerender } = render(<CatalogTokenInput {...props} />)
  emit("transitionEnd")
  mockFocus.mockClear()

  rerender(<CatalogTokenInput {...props} text="Dune" />)
  emit("transitionEnd")

  expect(mockFocus).not.toHaveBeenCalled()
})

it("does not reopen the keyboard after leaving and returning to an existing search", () => {
  render(<CatalogTokenInput {...props} />)
  mockFocus.mockClear()
  emit("blur")
  emit("transitionEnd", { closing: true })
  emit("transitionEnd")

  expect(mockFocus).not.toHaveBeenCalled()
})

it("never focuses an outgoing or inactive screen", () => {
  render(<CatalogTokenInput {...props} />)
  mockFocus.mockClear()
  emit("transitionEnd", { closing: true })
  mockNavigation.isFocused.mockReturnValue(false)
  emit("transitionEnd")

  expect(mockFocus).not.toHaveBeenCalled()
})

it("cancels pending focus when search is closed before the transition ends", () => {
  const { unmount } = render(<CatalogTokenInput {...props} />)
  mockFocus.mockClear()
  unmount()
  emit("transitionEnd")

  expect(mockFocus).not.toHaveBeenCalled()
})

it("waits for the native library tab to appear before requesting focus", () => {
  const { rerender } = render(
    <LibraryTabVisibilityContext value={false}>
      <CatalogTokenInput {...props} />
    </LibraryTabVisibilityContext>,
  )
  emit("transitionEnd")
  expect(mockFocus).not.toHaveBeenCalled()

  rerender(
    <LibraryTabVisibilityContext value={true}>
      <CatalogTokenInput {...props} />
    </LibraryTabVisibilityContext>,
  )
  expect(mockFocus).toHaveBeenCalledTimes(1)
})

it("does not repeat autofocus when switching away from and back to the library tab", () => {
  const input = <CatalogTokenInput {...props} />
  const { rerender } = render(
    <LibraryTabVisibilityContext value={true}>
      {input}
    </LibraryTabVisibilityContext>,
  )
  mockFocus.mockClear()
  emit("blur")
  rerender(
    <LibraryTabVisibilityContext value={false}>
      {input}
    </LibraryTabVisibilityContext>,
  )
  rerender(
    <LibraryTabVisibilityContext value={true}>
      {input}
    </LibraryTabVisibilityContext>,
  )
  emit("transitionEnd")
  expect(mockFocus).not.toHaveBeenCalled()
})
