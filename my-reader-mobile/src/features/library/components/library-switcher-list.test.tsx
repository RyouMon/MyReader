import { render, screen } from "@testing-library/react-native"
import * as mockReact from "react"
import { Text as mockText, View as mockView } from "react-native"

import { EmptyState } from "@/src/components"

import { LibrarySwitcherList } from "./library-switcher-list"

jest.mock("@expo/material-symbols/newsstand.xml", () => ({ uri: "newsstand" }))
jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))
jest.mock("expo-symbols", () => ({ SymbolView: jest.fn(() => null) }))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("@/src/components", () => ({
  EmptyState: jest.fn(({ detail, title }: { detail: string; title: string }) =>
    mockReact.createElement(
      mockView,
      { testID: "standard-empty-state" },
      mockReact.createElement(mockText, null, title),
      mockReact.createElement(mockText, null, detail),
    ),
  ),
  ListRow: jest.fn(() => null),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    border: "#ddd",
    primary: "#c4622d",
    surface: "#fff",
  }),
}))

jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  switchActiveLibrary: jest.fn(),
}))

jest.mock("@/src/components/ui/library-empty-state-icon", () => ({
  LIBRARY_EMPTY_STATE_ICON: {
    ios: "books.vertical.fill",
    android: { uri: "newsstand" },
  },
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: jest.fn((selector) =>
    selector({ activeLibraryId: null, libraries: [] }),
  ),
}))

it("should use the standard empty state when there are no libraries", () => {
  render(<LibrarySwitcherList onDismiss={jest.fn()} />)

  expect(screen.getByTestId("standard-empty-state")).toBeTruthy()
  expect(screen.getByText("home.noLibrary.title")).toBeTruthy()
  expect(screen.getByText("home.noLibrary.detail")).toBeTruthy()

  const emptyStateProps = jest.mocked(EmptyState).mock.calls[0]?.[0]
  expect(emptyStateProps).toEqual(
    expect.objectContaining({
      layout: "container",
      icon: {
        ios: "books.vertical.fill",
        android: { uri: "newsstand" },
      },
    }),
  )
})
