import { render, screen } from "@testing-library/react-native"

import type { BookDetail } from "@my-reader/tools/types/book"
import type { MenuAction } from "@react-native-menu/menu"
import { MenuView } from "@react-native-menu/menu"

import type { LocalState } from "@/src/domain/types"

import { FormatSection } from "./format-section"
import type { DetailColors } from "./types"

jest.mock("@react-native-menu/menu", () => ({
  MenuView: jest.fn(() => null),
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

function getMenuActions(): MenuAction[] {
  return (MenuView as unknown as jest.Mock).mock.calls[0]?.[0]?.actions ?? []
}

function renderFormatSection(
  overrides: {
    fileLocalState?: LocalState | null
    isNetworkSource?: boolean
    isReadable?: boolean
  } = {},
) {
  const {
    fileLocalState = "present",
    isNetworkSource = false,
    isReadable = true,
  } = overrides

  return render(
    <FormatSection
      book={baseBook}
      colors={mockColors}
      defaultFormat="EPUB"
      formatInfoMap={{
        EPUB: {
          relativePath: "Author/Test Book/Test Book.epub",
          localState: fileLocalState,
        },
        PDF: {
          relativePath: "Author/Test Book/Test Book.pdf",
          localState: fileLocalState,
        },
      }}
      formatSizeMap={
        new Map([
          ["EPUB", 1024],
          ["PDF", 2048],
        ])
      }
      isNetworkSource={isNetworkSource}
      libraryId="lib-1"
      onDeleteFormat={jest.fn()}
      onDownloadFormat={jest.fn()}
      onSetDefaultFormat={jest.fn()}
      onShareFormat={jest.fn()}
      readableFormats={isReadable ? ["EPUB", "PDF"] : []}
    />,
  )
}

describe("FormatSection", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should render format rows for each format", () => {
    renderFormatSection()

    expect(screen.getByText("EPUB")).toBeTruthy()
    expect(screen.getByText("PDF")).toBeTruthy()
  })

  it("should show share and delete actions when network format is present", () => {
    renderFormatSection({ fileLocalState: "present", isNetworkSource: true })

    const actions = getMenuActions()
    expect(actions.map((a) => a.id)).toEqual(["setDefault", "share", "delete"])
  })

  it("should not show delete action when format is not present", () => {
    renderFormatSection({ fileLocalState: "remote_only" })

    const actions = getMenuActions()
    expect(actions.map((a) => a.id)).toEqual(["setDefault", "share"])
    expect(actions.find((a) => a.id === "delete")).toBeUndefined()
  })

  it("should not show delete action for local library when format is present", () => {
    renderFormatSection({ fileLocalState: "present", isNetworkSource: false })

    const actions = getMenuActions()
    expect(actions.map((a) => a.id)).toEqual(["setDefault", "share"])
    expect(actions.find((a) => a.id === "delete")).toBeUndefined()
  })

  it("should show download action when format is remote and not present", () => {
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

  it("should mark default format in menu", () => {
    renderFormatSection({ fileLocalState: "present" })

    const actions = getMenuActions()
    const setDefault = actions.find((a) => a.id === "setDefault")
    expect(setDefault?.state).toBe("on")
  })

  it("should not show setDefault action when format is not readable", () => {
    renderFormatSection({
      fileLocalState: "present",
      isNetworkSource: true,
      isReadable: false,
    })

    const actions = getMenuActions()
    expect(actions.map((a) => a.id)).toEqual(["share", "delete"])
  })
})
