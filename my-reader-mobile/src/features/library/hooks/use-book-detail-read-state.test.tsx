import {
  act,
  renderHook as baseRenderHook,
} from "@testing-library/react-native"

import type { Library } from "@/src/domain/types"
import type { BookDetail } from "@my-reader/tools/types/book"
import { Alert } from "react-native"

import type { FormatInfo } from "./use-book-detail-formats"
import { useBookDetailReadState } from "./use-book-detail-read-state"

jest.mock("@my-reader/tools/utils", () => ({
  isReadableInAppFormat: jest.fn(() => true),
  pickReadableFormat: jest.fn(() => "EPUB"),
}))

jest.mock("react-i18next", () => {
  const t = (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  return {
    initReactI18next: { type: "3rdParty", init: jest.fn() },
    useTranslation: () => ({ t }),
  }
})

const localLibrary: Library = {
  id: "lib-local",
  name: "Local Library",
  path: "/local",
  sourceType: "local",
} as Library

const remoteLibrary: Library = {
  id: "lib-remote",
  name: "Remote Library",
  path: "/remote",
  sourceType: "webdav",
  dataSourceId: "ds-1",
} as Library

const baseDetail = {
  id: 1,
  title: "Test Book",
  formats: ["EPUB", "PDF"],
} as unknown as BookDetail

type ReadStateOptions = {
  activeLibrary?: Library
  bookId?: string
  detail?: BookDetail | null
  selectedFormat?: string | null
  progressByFormat?: Record<string, number> | undefined
  formatInfoMap?: Record<string, FormatInfo>
  onOpenReader?: (bookId: string, format: string | null) => void
  handleDownloadFormat?: (format: string) => void
}

function renderReadState(overrides: Partial<ReadStateOptions> = {}) {
  const {
    activeLibrary = localLibrary,
    bookId = "1",
    detail = baseDetail,
    selectedFormat = null,
    progressByFormat = undefined,
    formatInfoMap = {
      EPUB: { relativePath: "book.epub", localState: "present" } as FormatInfo,
    },
    onOpenReader = jest.fn(),
    handleDownloadFormat = jest.fn(),
  } = { ...overrides }

  return baseRenderHook(() =>
    useBookDetailReadState(
      activeLibrary,
      bookId,
      detail,
      selectedFormat,
      progressByFormat,
      formatInfoMap,
      onOpenReader,
      handleDownloadFormat,
    ),
  )
}

describe("useBookDetailReadState", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const { isReadableInAppFormat, pickReadableFormat } = jest.requireMock(
      "@my-reader/tools/utils",
    )
    isReadableInAppFormat.mockReturnValue(true)
    pickReadableFormat.mockReturnValue("EPUB")
  })

  describe("format selection", () => {
    it("should return empty readable formats when detail is null", () => {
      const { result } = renderReadState({ detail: null })

      expect(result.current.readableFormats).toEqual([])
      expect(result.current.canReadInApp).toBe(false)
      expect(result.current.readableSelectedFormat).toBeNull()
    })

    it("should filter formats with isReadableInAppFormat when resolving book detail read state", () => {
      const { isReadableInAppFormat } = jest.requireMock(
        "@my-reader/tools/utils",
      )
      isReadableInAppFormat.mockImplementation(
        (format: string) => format === "EPUB",
      )

      const { result } = renderReadState()

      expect(result.current.readableFormats).toEqual(["EPUB"])
      expect(result.current.canReadInApp).toBe(true)
    })

    it("should use provided selectedFormat when resolving book detail read state", () => {
      const { result } = renderReadState({ selectedFormat: "PDF" })

      expect(result.current.readableSelectedFormat).toBe("PDF")
    })

    it("should fallback to pickReadableFormat when selectedFormat is null", () => {
      const { pickReadableFormat } = jest.requireMock("@my-reader/tools/utils")
      pickReadableFormat.mockReturnValue("PDF")

      const { result } = renderReadState()

      expect(result.current.readableSelectedFormat).toBe("PDF")
    })

    it("should have no selected format when detail and fallback are missing", () => {
      const { pickReadableFormat } = jest.requireMock("@my-reader/tools/utils")
      pickReadableFormat.mockReturnValue(null)

      const { result } = renderReadState({ detail: null })

      expect(result.current.readableSelectedFormat).toBeNull()
    })
  })

  describe("local library", () => {
    it("should open reader when format is readable", () => {
      const onOpenReader = jest.fn()
      const { result } = renderReadState({ onOpenReader })

      act(() => {
        result.current.handleReadAction()
      })

      expect(onOpenReader).toHaveBeenCalledWith("1", "EPUB")
    })

    it("should do nothing when there is no readable format", () => {
      const { isReadableInAppFormat } = jest.requireMock(
        "@my-reader/tools/utils",
      )
      isReadableInAppFormat.mockReturnValue(false)
      const onOpenReader = jest.fn()
      const handleDownloadFormat = jest.fn()
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})

      const { result } = renderReadState({ onOpenReader, handleDownloadFormat })

      act(() => {
        result.current.handleReadAction()
      })

      expect(onOpenReader).not.toHaveBeenCalled()
      expect(handleDownloadFormat).not.toHaveBeenCalled()
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it("should do nothing when selected format is null", () => {
      const { pickReadableFormat } = jest.requireMock("@my-reader/tools/utils")
      pickReadableFormat.mockReturnValue(null)
      const onOpenReader = jest.fn()

      const { result } = renderReadState({ onOpenReader })

      act(() => {
        result.current.handleReadAction()
      })

      expect(onOpenReader).not.toHaveBeenCalled()
    })

    it("should show start reading title when progress is zero", () => {
      const { result } = renderReadState({ progressByFormat: { EPUB: 0 } })

      expect(result.current.readButtonTitle).toBe("bookDetail.startReading")
    })

    it("should show continue reading title when progress is greater than zero", () => {
      const { result } = renderReadState({ progressByFormat: { EPUB: 0.5 } })

      expect(result.current.readButtonTitle).toBe("bookDetail.continueReading")
    })

    it("should show no readable format title when formats are empty", () => {
      const { isReadableInAppFormat } = jest.requireMock(
        "@my-reader/tools/utils",
      )
      isReadableInAppFormat.mockReturnValue(false)

      const { result } = renderReadState()

      expect(result.current.readButtonTitle).toBe("bookDetail.noReadableFormat")
    })
  })

  describe("remote library", () => {
    it("should open reader when selected format is present", () => {
      const onOpenReader = jest.fn()
      const { result } = renderReadState({
        activeLibrary: remoteLibrary,
        onOpenReader,
      })

      act(() => {
        result.current.handleReadAction()
      })

      expect(onOpenReader).toHaveBeenCalledWith("1", "EPUB")
    })

    it("should start download and alert when selected format is not present", () => {
      const handleDownloadFormat = jest.fn()
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      const { result } = renderReadState({
        activeLibrary: remoteLibrary,
        formatInfoMap: {
          EPUB: {
            relativePath: "book.epub",
            localState: "remote_only",
          } as FormatInfo,
        },
        handleDownloadFormat,
      })

      act(() => {
        result.current.handleReadAction()
      })

      expect(handleDownloadFormat).toHaveBeenCalledWith("EPUB")
      expect(alertSpy).toHaveBeenCalled()
      expect(result.current.readButtonTitle).toBe("bookDetail.downloadAndRead")
    })

    it("should show download and read title when selected format is not present", () => {
      const { result } = renderReadState({
        activeLibrary: remoteLibrary,
        formatInfoMap: {
          EPUB: {
            relativePath: "book.epub",
            localState: "remote_only",
          } as FormatInfo,
        },
      })

      expect(result.current.readButtonTitle).toBe("bookDetail.downloadAndRead")
    })

    it("should show no readable format title for remote library without readable formats when resolving book detail read state", () => {
      const { isReadableInAppFormat } = jest.requireMock(
        "@my-reader/tools/utils",
      )
      isReadableInAppFormat.mockReturnValue(false)

      const { result } = renderReadState({ activeLibrary: remoteLibrary })

      expect(result.current.readButtonTitle).toBe("bookDetail.noReadableFormat")
    })
  })
})
