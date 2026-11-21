import { fireEvent, render, screen } from "@testing-library/react-native"
import { router } from "expo-router"
import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import type { UseScreenHeaderOptions } from "@/src/navigation/hooks/use-screen-header"
import {
  DataSourcesScreen,
  LibrariesScreen,
  SourceTypeScreen,
} from "./resource-management-screens"

let mockSources: Partial<DataSource>[] = []
let mockLibraries: Partial<Library>[] = []
let mockHeader: UseScreenHeaderOptions
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: (select: (state: object) => unknown) =>
    select({
      dataSources: mockSources,
      libraries: mockLibraries,
      activeLibraryId: "current",
    }),
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name: string }) =>
      opts ? `${key}:${opts.name}` : key,
  }),
}))
jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: (options: UseScreenHeaderOptions) => {
    mockHeader = options
    return { options: {}, toolbar: null }
  },
}))
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))
jest.mock("@/src/components", () => {
  const { View, Text, Pressable } = require("react-native")
  const Button = ({
    title,
    detail,
    value,
    label,
    onPress,
  }: {
    title: string
    detail?: string
    value?: string
    label?: string
    onPress: () => void
  }) => (
    <Pressable accessibilityLabel={label} onPress={onPress}>
      <Text>{title}</Text>
      <Text>{detail}</Text>
      <Text>{value}</Text>
    </Pressable>
  )
  return {
    Screen: View,
    SectionCard: View,
    PrimaryButton: Button,
    ListRow: Button,
    EmptyState: ({
      title,
      action,
    }: {
      title: string
      action: React.ReactNode
    }) => (
      <View>
        <Text>{title}</Text>
        {action}
      </View>
    ),
  }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockSources = []
  mockLibraries = []
})

it.each([
  [
    "/settings/add-library",
    LibrariesScreen,
    "addLibraryFlow.noLibrary.title",
    "settings.addLibrary",
  ],
  [
    "/settings/source-type",
    DataSourcesScreen,
    "settings.resources.noSources",
    "cloud.sources.add",
  ],
] as const)("opens %s directly from its empty state", (destination, Manager, title, addLabel) => {
  render(<Manager />)
  expect(screen.getByText(title)).toBeTruthy()
  expect(mockHeader.right).toHaveLength(0)
  fireEvent.press(screen.getByText(addLabel))
  expect(router.push).toHaveBeenCalledWith(destination)
})

it("lists all libraries, marks the active one and opens the selected library", () => {
  mockLibraries = [
    { id: "current", name: "My books", libraryType: "myreader" },
    { id: "legacy", name: "Calibre" },
  ]
  render(<LibrariesScreen />)
  expect(
    screen.getByLabelText(
      /My books, libraryDetail.myreaderLibrary, settings.currentInUse/,
    ),
  ).toBeTruthy()
  expect(screen.getAllByText("settings.currentInUse")).toHaveLength(1)
  fireEvent.press(
    screen.getByLabelText(/Calibre, libraryDetail.calibreLibrary/),
  )
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/settings/library/[libraryId]",
    params: { libraryId: "legacy" },
  })
  mockHeader.right?.[0]?.onPress()
  expect(router.push).toHaveBeenLastCalledWith("/settings/add-library")
})

it("shows configured accounts together and opens their own details, including accounts with the same name", () => {
  mockSources = [
    {
      id: "dav",
      type: "webdav",
      name: "Archive",
      endpoint: "https://dav.example",
      rootPath: "/books",
    },
    {
      id: "ms",
      type: "onedrive",
      displayName: "Reader",
      email: "ms@example.org",
    },
    {
      id: "google",
      type: "gdrive",
      displayName: "Reader",
      email: "g@example.org",
    },
    { id: "db", type: "dropbox", name: "Personal" },
    {
      id: "s3",
      type: "s3",
      name: "Archive",
      endpoint: "https://storage.example",
      bucket: "books",
    },
  ]
  render(<DataSourcesScreen />)
  const rows = [
    "Archive, WebDAV · https://dav.example/books",
    "Reader, OneDrive · ms@example.org",
    "Reader, Google Drive · g@example.org",
    "Personal, Dropbox",
    "Archive, S3 · https://storage.example/books",
  ]
  rows.forEach((label, index) => {
    const source = mockSources[index]!
    fireEvent.press(screen.getByLabelText(label))
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: `/settings/${source.type}/[dataSourceId]`,
      params: { dataSourceId: source.id },
    })
  })
  mockHeader.right?.[0]?.onPress()
  expect(router.push).toHaveBeenLastCalledWith("/settings/source-type")
})

it("opens the corresponding add form for each of the five source types", () => {
  render(<SourceTypeScreen />)
  for (const [title, type] of [
    ["WebDAV", "webdav"],
    ["OneDrive", "onedrive"],
    ["Google Drive", "gdrive"],
    ["Dropbox", "dropbox"],
    ["S3", "s3"],
  ]) {
    fireEvent.press(screen.getByText(title!))
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/settings/source-type/[type]",
      params: { type },
    })
  }
})
