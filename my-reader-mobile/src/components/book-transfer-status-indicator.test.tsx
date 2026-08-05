import { render } from "@testing-library/react-native"

import { useDownloadTaskForBookFormat } from "@/src/domain/download/download-store"
import {
  applyBookUploadTaskProgress,
  clearBookUploadTaskProgress,
} from "@/src/domain/sync/book-upload-store"
import { CloudIcon } from "@/src/components/ui/cloud-icon"
import { BookTransferStatusIndicatorBase } from "./book-transfer-status-indicator"

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))
jest.mock("expo-symbols", () => ({ SymbolView: jest.fn(() => null) }))

jest.mock("@/src/components/ui/cloud-icon", () => ({
  CloudIcon: jest.fn(() => null),
}))

jest.mock("@/src/components/ui/circular-progress", () => {
  const React = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  return {
    CircularProgress: ({
      indeterminate,
      progress,
    }: {
      indeterminate?: boolean
      progress: number
    }) =>
      React.createElement(View, {
        testID: indeterminate
          ? "indeterminate-transfer-progress"
          : "determinate-transfer-progress",
        accessibilityValue: { min: 0, max: 1, now: progress },
      }),
  }
})

jest.mock("@/src/domain/download/download-store", () => ({
  useDownloadTaskForBookFormat: jest.fn(),
}))

const baseProps = {
  cloudColor: "gray",
  progressColor: "orange",
}

describe("BookTransferStatusIndicatorBase", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(useDownloadTaskForBookFormat).mockReturnValue(undefined)
  })

  it("should show a down arrow in an indeterminate ring when a download is pending", () => {
    jest.mocked(useDownloadTaskForBookFormat).mockReturnValue({
      status: "queued",
      progress: 0,
    } as ReturnType<typeof useDownloadTaskForBookFormat>)

    const view = render(
      <BookTransferStatusIndicatorBase
        {...baseProps}
        status="downloading"
        libraryId="library-1"
        bookId="book-1"
        format="EPUB"
      />,
    )

    expect(view.getByTestId("indeterminate-transfer-progress")).toBeTruthy()
    expect(view.getByTestId("transfer-arrow-down")).toBeTruthy()
  })

  it("should show a down arrow in the ring when a download is active", () => {
    jest.mocked(useDownloadTaskForBookFormat).mockReturnValue({
      status: "downloading",
      progress: 0.4,
    } as ReturnType<typeof useDownloadTaskForBookFormat>)

    const view = render(
      <BookTransferStatusIndicatorBase
        {...baseProps}
        status="downloading"
        libraryId="library-1"
        bookId="book-1"
        format="EPUB"
      />,
    )

    expect(view.getByTestId("determinate-transfer-progress")).toBeTruthy()
    expect(view.getByTestId("transfer-arrow-down")).toBeTruthy()
  })

  it("should show a dashed cloud when an upload is pending", () => {
    render(
      <BookTransferStatusIndicatorBase {...baseProps} status="uploadPending" />,
    )

    expect(CloudIcon).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "dashed" }),
      undefined,
    )
  })

  it("should show an up arrow in the ring when an upload is active", () => {
    const view = render(
      <BookTransferStatusIndicatorBase {...baseProps} status="uploading" />,
    )

    expect(view.getByTestId("indeterminate-transfer-progress")).toBeTruthy()
    expect(view.getByTestId("transfer-arrow-up")).toBeTruthy()
  })

  it("should show determinate progress when an active upload reports bytes", () => {
    applyBookUploadTaskProgress("library-progress", {
      taskId: "task-progress",
      completed: 40,
      total: 100,
      bookUuid: "book-progress",
    })
    try {
      const view = render(
        <BookTransferStatusIndicatorBase
          {...baseProps}
          status="uploading"
          libraryId="library-progress"
          bookUuid="book-progress"
        />,
      )

      expect(
        view.getByTestId("determinate-transfer-progress").props
          .accessibilityValue.now,
      ).toBe(0.4)
      expect(view.getByTestId("transfer-arrow-up")).toBeTruthy()
      view.unmount()
    } finally {
      clearBookUploadTaskProgress("library-progress", "task-progress")
    }
  })
})
