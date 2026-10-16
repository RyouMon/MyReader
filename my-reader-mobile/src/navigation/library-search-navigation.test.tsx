import { router, Slot, Stack } from "expo-router"
import {
  act,
  fireEvent,
  renderRouter,
  screen,
} from "expo-router/testing-library"
import { NativeTabs } from "expo-router/unstable-native-tabs"
import { Pressable, Text, View } from "react-native"

import * as LibraryStack from "@/src/app/(tabs)/library/(content)/_layout"
import CatalogResultsScreen from "@/src/features/library/catalog-results-screen"
import { useCatalogSearchPresentation } from "@/src/features/library/hooks/use-catalog-search-presentation"
import { useLibraryRootHeader } from "@/src/features/library/hooks/use-library-root-header"

jest.mock("@expo/material-symbols/cards_stack.xml", () => ({
  uri: "libraries",
}))
jest.mock("@/src/navigation/hooks/use-stack-screen-options", () => ({
  useStackScreenOptions: () => ({}),
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      storeReady: true,
      activeLibraryId: "one",
      libraries: [{ id: "one" }],
    }),
}))
jest.mock("@/src/features/sync/hooks/use-sync-status-header-action", () => ({
  useSyncStatusHeaderAction: () => ({ label: "Sync", onPress: jest.fn() }),
}))
jest.mock("@/src/features/library/library-screen", () => ({
  __esModule: true,
  default: (props: {
    initialSearchOpen: boolean
    onSearchClose: () => void
  }) => <MockCatalogPage {...props} />,
}))
jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: ({
    right,
  }: {
    right: { label: string; onPress: () => void }[]
  }) => {
    const React = jest.requireActual<typeof import("react")>("react")
    const Native =
      jest.requireActual<typeof import("react-native")>("react-native")
    return {
      options: {},
      toolbar: React.createElement(
        Native.View,
        null,
        right.map((action) =>
          React.createElement(Native.Pressable, {
            key: action.label,
            accessibilityRole: "button",
            accessibilityLabel: action.label,
            onPress: action.onPress,
          }),
        ),
      ),
    }
  },
}))
// Keep the real native-tab router; substitute only its native view and retain visited tabs.
jest.mock("expo-router/build/native-tabs/NativeTabsView", () => ({
  NativeTabsView: ({
    tabs,
    focusedIndex,
  }: {
    tabs: {
      routeKey: string
      contentRenderer: () => import("react").ReactNode
    }[]
    focusedIndex: number
  }) => {
    const React = jest.requireActual<typeof import("react")>("react")
    const Native =
      jest.requireActual<typeof import("react-native")>("react-native")
    const visited = React.useRef(new Set<number>())
    visited.current.add(focusedIndex)
    return React.createElement(
      Native.View,
      null,
      tabs.map((tab, index) =>
        visited.current.has(index)
          ? React.createElement(
              Native.View,
              {
                key: tab.routeKey,
                accessibilityElementsHidden: index !== focusedIndex,
                importantForAccessibility:
                  index === focusedIndex ? "auto" : "no-hide-descendants",
              },
              tab.contentRenderer(),
            )
          : null,
      ),
    )
  },
}))

function RootPage({ title }: { title: string }) {
  const { toolbar } = useLibraryRootHeader(title)
  return (
    <View>
      <Text>{title}</Text>
      {toolbar}
    </View>
  )
}

function MockCatalogPage({
  initialSearchOpen,
  onSearchClose,
}: {
  initialSearchOpen: boolean
  onSearchClose: () => void
}) {
  const presentation = useCatalogSearchPresentation(
    "one",
    initialSearchOpen,
    undefined,
    onSearchClose,
  )
  return (
    <View>
      <Text>All books</Text>
      {presentation.isOpen ? <Text>Search editor</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close search"
        onPress={presentation.action.onPress}
      />
    </View>
  )
}

function renderNavigation() {
  return renderRouter(
    {
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      "reader/[id]": () => <Text>Reader</Text>,
      "(tabs)/_layout": () => (
        <NativeTabs>
          <NativeTabs.Trigger name="home" />
          <NativeTabs.Trigger name="library" />
        </NativeTabs>
      ),
      "(tabs)/home/_layout": () => <Stack />,
      "(tabs)/home/index": () => <RootPage title="Home" />,
      "(tabs)/library/_layout": () => <Slot />,
      "(tabs)/library/(content)/_layout": LibraryStack,
      "(tabs)/library/(content)/index": () => <RootPage title="Library" />,
      "(tabs)/library/(content)/catalog": CatalogResultsScreen,
      "(tabs)/library/(content)/collection/[collectionId]": () => (
        <Text>Collection</Text>
      ),
      "(tabs)/library/(content)/[libraryId]": () => <Text>Library detail</Text>,
    },
    { initialUrl: "/home" },
  )
}

it("opens Home search in the library tab and returns to its root in one back action", () => {
  const navigation = renderNavigation()
  for (let visit = 0; visit < 2; visit++) {
    fireEvent.press(screen.getByRole("button", { name: "common.search" }))
    expect(navigation.getPathname()).toBe("/library/catalog")
    expect(screen.getByText("Search editor")).toBeTruthy()
    act(() => router.back())
    expect(navigation.getPathname()).toBe("/library")
    act(() => router.navigate("/home"))
    expect(screen.getByText("Home")).toBeTruthy()
  }
})

it("reopens search when returning from Home to a retained catalog page", () => {
  const navigation = renderNavigation()
  fireEvent.press(screen.getByRole("button", { name: "common.search" }))
  fireEvent.press(screen.getByRole("button", { name: "Close search" }))
  expect(screen.queryByText("Search editor")).toBeNull()
  act(() => router.navigate("/home"))
  fireEvent.press(screen.getByRole("button", { name: "common.search" }))
  expect(navigation.getPathname()).toBe("/library/catalog")
  expect(screen.getByText("Search editor")).toBeTruthy()
  act(() => router.back())
  expect(navigation.getPathname()).toBe("/library")
})

it("does not add another catalog page for repeated search requests", () => {
  const navigation = renderNavigation()
  const search = screen.getByRole("button", { name: "common.search" })
  act(() => {
    fireEvent.press(search)
    fireEvent.press(search)
  })
  expect(navigation.getPathname()).toBe("/library/catalog")
  expect(screen.getByText("Search editor")).toBeTruthy()
  act(() => router.back())
  expect(navigation.getPathname()).toBe("/library")
})

it("keeps a dismissed search closed when returning without a search request", () => {
  renderNavigation()
  fireEvent.press(screen.getByRole("button", { name: "common.search" }))
  fireEvent.press(screen.getByRole("button", { name: "Close search" }))
  act(() => router.push("/reader/book-1"))
  act(() => router.back())
  expect(screen.getByText("All books")).toBeTruthy()
  expect(screen.queryByText("Search editor")).toBeNull()
})
