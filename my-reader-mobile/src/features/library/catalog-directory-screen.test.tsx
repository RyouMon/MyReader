import { fireEvent, render, screen } from "@testing-library/react-native"
import { Platform, SectionList } from "react-native"
import { useHeaderHeight } from "expo-router/react-navigation"
import CatalogDirectoryScreen from "./catalog-directory-screen"

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ kind: "authors" }),
  useIsFocused: () => true,
}))
jest.mock("expo-router/react-navigation", () => ({
  useHeaderHeight: jest.fn(() => 104),
}))
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 60, bottom: 34, left: 0, right: 0 }),
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { letter?: string }) => options?.letter ?? key,
  }),
}))
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))
jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: () => ({ options: {}, toolbar: null }),
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: (selector: (state: object) => unknown) =>
    selector({ activeLibraryId: "fixture", libraryViewMode: "grid" }),
}))
jest.mock("./hooks/useLibraryQuery", () => ({
  useBooks: () => ({ data: [] }),
  useCatalogNavigation: () => ({
    data: {
      authors: ["D Author 01", "E Author 01", "E Author 02", "G Author 01"].map(
        (name) => ({ name, bookCount: 1, covers: [] }),
      ),
    },
  }),
}))
jest.mock("./components/books/book-cover", () => ({ BookCover: () => null }))
jest.mock("./components/catalog-token-field", () => ({
  CatalogTokenField: () => null,
}))

afterEach(() => jest.restoreAllMocks())

it.each([
  "android",
  "ios",
] as const)("aligns the selected section header with the visible list edge on %s", (platform) => {
  jest.replaceProperty(Platform, "OS", platform)
  jest.mocked(useHeaderHeight).mockReturnValue(104)
  const scroll = jest.spyOn(SectionList.prototype, "scrollToLocation")
  render(<CatalogDirectoryScreen />)
  fireEvent.press(screen.getByRole("button", { name: "E" }))

  // Index zero targets the section header itself; only overlapping navigation
  // chrome needs an offset, not the height of the preceding section header.
  expect(scroll).toHaveBeenLastCalledWith({
    sectionIndex: 1,
    itemIndex: 0,
    animated: false,
    viewOffset: platform === "ios" ? 104 : 0,
  })
})

it("uses the updated iOS header height for subsequent alphabet jumps", () => {
  jest.replaceProperty(Platform, "OS", "ios")
  jest.mocked(useHeaderHeight).mockReturnValue(168)
  const scroll = jest.spyOn(SectionList.prototype, "scrollToLocation")
  render(<CatalogDirectoryScreen />)
  fireEvent.press(screen.getByRole("button", { name: "E" }))
  expect(scroll).toHaveBeenLastCalledWith(
    expect.objectContaining({ sectionIndex: 1, viewOffset: 168 }),
  )

  jest.mocked(useHeaderHeight).mockReturnValue(116)
  screen.rerender(<CatalogDirectoryScreen />)
  fireEvent.press(screen.getByRole("button", { name: "G" }))
  expect(scroll).toHaveBeenLastCalledWith(
    expect.objectContaining({ sectionIndex: 2, viewOffset: 116 }),
  )
})
