import { render, screen } from "@testing-library/react-native"

import type { BookDetail } from "@my-reader/tools/types/book"
import type { MenuAction } from "@react-native-menu/menu"
import { MenuView } from "@react-native-menu/menu"
import { Platform } from "react-native"

import type { LocalState } from "@/src/domain/types"

import { FormatSection } from "./format-section"
import type { DetailColors } from "./types"

jest.mock("@react-native-menu/menu", () => ({
  MenuView: jest.fn(() => null),
}))

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))

jest.mock("expo-symbols", () => ({
  SymbolView: jest.fn(() => null),
}))

jest.mock("@/src/components", () => ({
  CircularProgress: jest.fn(() => null),
  MoreActionsIcon: jest.fn(() => null),
  SectionCard: jest.fn(({ children }) => children),
  SectionLabel: jest.fn(({ children }) => children),
}))

jest.mock("@/src/domain/download/download-store", () => ({
  useDownloadTaskForPath: jest.fn(() => undefined),
  useDownloadTaskForBookFormat: jest.fn(() => undefined),
  cancel: jest.fn(),
}))

jest.mock("react-i18next", () => {
  const t = (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  return {
    initReactI18next: { type: "3rdParty", init: jest.fn() },
    useTranslation: () => ({ t }),
  }
})

jest.mock("@/src/utils/book-detail", () => ({
  formatFileSize: (bytes: number) => `${bytes} B`,
}))

const mockColors = {
  background: "#000",
  border: "#333",
  text: "#fff",
  tertiary: "#888",
  muted: "#666",
  accent: "#f00",
  progressTrack: "#222",
  palette: {
    surface: "#111",
    textMuted: "#999",
  },
} as unknown as DetailColors

const baseBook = {
  id: "1",
  formats: ["EPUB", "PDF"],
  formatSizes: [
    { format: "EPUB", sizeBytes: 1024 },
    { format: "PDF", sizeBytes: 2048 },
  ],
} as unknown as BookDetail

const originalPlatformOs = Platform.OS

function getMenuActions(): MenuAction[] {
  return (MenuView as unknown as jest.Mock).mock.calls[0]?.[0]?.actions ?? []
}

function getMenuProps(index = 0) {
  return (MenuView as unknown as jest.Mock).mock.calls[index]?.[0]
}

function renderFormatSection(
  overrides: {
    defaultFormat?: string | null
    fileLocalState?: LocalState | null
    formatInfoMap?: React.ComponentProps<typeof FormatSection>["formatInfoMap"]
    formatSizeMap?: Map<string, number>
    isNetworkSource?: boolean
    isReadable?: boolean
    onDeleteFormat?: jest.Mock
    onDownloadFormat?: jest.Mock
    onSetDefaultFormat?: jest.Mock
    onShareFormat?: jest.Mock
    progressByFormat?: Record<string, number>
    readableFormats?: string[]
  } = {},
) {
  const {
    defaultFormat = "EPUB",
    fileLocalState = "present",
    formatInfoMap,
    formatSizeMap = new Map([
      ["EPUB", 1024],
      ["PDF", 2048],
    ]),
    isNetworkSource = false,
    isReadable = true,
    onDeleteFormat = jest.fn(),
    onDownloadFormat = jest.fn(),
    onSetDefaultFormat = jest.fn(),
    onShareFormat = jest.fn(),
    progressByFormat,
    readableFormats = isReadable ? ["EPUB", "PDF"] : [],
  } = overrides

  const result = render(
    <FormatSection
      book={baseBook}
      colors={mockColors}
      defaultFormat={defaultFormat}
      formatInfoMap={
        formatInfoMap ?? {
          EPUB: {
            relativePath: "Author/Test Book/Test Book.epub",
            localState: fileLocalState,
          },
          PDF: {
            relativePath: "Author/Test Book/Test Book.pdf",
            localState: fileLocalState,
          },
        }
      }
      formatSizeMap={formatSizeMap}
      isNetworkSource={isNetworkSource}
      libraryId="lib-1"
      onDeleteFormat={onDeleteFormat}
      onDownloadFormat={onDownloadFormat}
      onSetDefaultFormat={onSetDefaultFormat}
      onShareFormat={onShareFormat}
      progressByFormat={progressByFormat}
      readableFormats={readableFormats}
    />,
  )

  return {
    ...result,
    onDeleteFormat,
    onDownloadFormat,
    onSetDefaultFormat,
    onShareFormat,
  }
}

describe("FormatSection", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const downloadStore = jest.requireMock(
      "@/src/domain/download/download-store",
    )
    downloadStore.useDownloadTaskForPath.mockReturnValue(undefined)
    downloadStore.useDownloadTaskForBookFormat.mockReturnValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatformOs,
    })
  })

  it("should render format rows when book has formats", () => {
    renderFormatSection()

    expect(screen.getByText("EPUB")).toBeTruthy()
    expect(screen.getByText("PDF")).toBeTruthy()
  })

  it("should show share and delete actions when network format is present", () => {
    renderFormatSection({ fileLocalState: "present", isNetworkSource: true })

    const actions = getMenuActions()
    expect(actions.map((a) => a.id)).toEqual(["setDefault", "share", "delete"])
  })

  it("should hide delete action when format is not present", () => {
    renderFormatSection({ fileLocalState: "remote_only" })

    const actions = getMenuActions()
    expect(actions.map((a) => a.id)).toEqual(["setDefault", "share"])
    expect(actions.find((a) => a.id === "delete")).toBeUndefined()
  })

  it("should disable deleting a pending upload while keeping the local file usable", () => {
    renderFormatSection({
      fileLocalState: "dirty_push",
      isNetworkSource: true,
    })

    const actions = getMenuActions()
    expect(actions.map((action) => action.id)).toEqual([
      "setDefault",
      "share",
      "delete",
    ])
    expect(
      actions.find((action) => action.id === "delete")?.attributes,
    ).toEqual({ destructive: true, disabled: true })
    expect(actions.find((action) => action.id === "download")).toBeUndefined()
  })

  it("should hide delete action when library is local", () => {
    renderFormatSection({ fileLocalState: "present", isNetworkSource: false })

    const actions = getMenuActions()
    expect(actions.map((a) => a.id)).toEqual(["setDefault", "share"])
    expect(actions.find((a) => a.id === "delete")).toBeUndefined()
  })

  it("should show download action when remote format is not present", () => {
    renderFormatSection({
      fileLocalState: "remote_only",
      isNetworkSource: true,
    })

    const actions = getMenuActions()
    expect(actions.map((a) => a.id)).toEqual([
      "setDefault",
      "download",
      "share",
    ])
  })

  it("should mark default format when format matches default", () => {
    renderFormatSection({ fileLocalState: "present" })

    const actions = getMenuActions()
    const setDefault = actions.find((a) => a.id === "setDefault")
    expect(setDefault?.state).toBe("on")
  })

  it("should hide setDefault action when format is not readable", () => {
    renderFormatSection({
      fileLocalState: "present",
      isNetworkSource: true,
      isReadable: false,
    })

    const actions = getMenuActions()
    expect(actions.map((a) => a.id)).toEqual(["share", "delete"])
  })

  it("should route menu actions when action is pressed", () => {
    const handlers = renderFormatSection({
      fileLocalState: "present",
      isNetworkSource: true,
    })

    const menu = getMenuProps()
    menu.onPressAction({ nativeEvent: { event: "setDefault" } })
    menu.onPressAction({ nativeEvent: { event: "download" } })
    menu.onPressAction({ nativeEvent: { event: "share" } })
    menu.onPressAction({ nativeEvent: { event: "delete" } })

    expect(handlers.onSetDefaultFormat).toHaveBeenCalledWith("EPUB")
    expect(handlers.onDownloadFormat).toHaveBeenCalledWith("EPUB")
    expect(handlers.onShareFormat).toHaveBeenCalledWith("EPUB")
    expect(handlers.onDeleteFormat).toHaveBeenCalledWith("EPUB")
  })

  it("should show cancel action when native download is active", () => {
    const downloadStore = jest.requireMock(
      "@/src/domain/download/download-store",
    )
    downloadStore.useDownloadTaskForPath.mockReturnValue({
      id: "task-1",
      progress: 0.4,
      status: "downloading",
    })

    renderFormatSection({
      fileLocalState: "remote_only",
      isNetworkSource: true,
      progressByFormat: { EPUB: 35 },
    })

    const actions = getMenuActions()
    expect(actions.map((a) => a.id)).toEqual(["setDefault", "cancel", "share"])

    getMenuProps().onPressAction({ nativeEvent: { event: "cancel" } })
    expect(downloadStore.cancel).toHaveBeenCalledWith("task-1")
    expect(
      screen.getByText("1024 B · 35% · bookDetail.formatSection.default"),
    ).toBeTruthy()
  })

  it("should fall back when format metadata is missing", () => {
    renderFormatSection({
      defaultFormat: null,
      formatInfoMap: {},
      formatSizeMap: new Map(),
      isNetworkSource: true,
      readableFormats: ["PDF"],
    })

    expect(screen.getAllByText("0 B · bookRow.unread")).toHaveLength(2)
    expect(getMenuProps(0).actions.map((a: MenuAction) => a.id)).toEqual([
      "share",
    ])
    expect(getMenuProps(1).actions.map((a: MenuAction) => a.id)).toEqual([
      "setDefault",
      "share",
    ])
  })

  it("should use Android menu anchoring when platform is Android", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    })

    renderFormatSection({
      fileLocalState: "remote_only",
      isNetworkSource: true,
    })

    expect(getMenuProps()).toMatchObject({
      hitSlop: undefined,
      isAnchoredToRight: true,
    })
    expect(getMenuProps().style).toMatchObject({ width: "100%" })
  })
})
