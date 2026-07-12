import React from "react"
import { View } from "react-native"
import { act, render } from "@testing-library/react-native"
import type { Locator, PublicationReadyEvent } from "@my-reader/readium"

import ReadiumFixedReader, {
  type ReadiumFixedReaderRef,
} from "./ReadiumFixedReader"

const mockGoTo = jest.fn()
let mockReadiumProps: {
  onPublicationReady?: (event: PublicationReadyEvent) => void
  onLocationChange?: (locator: Locator) => void
} | null = null

jest.mock("@my-reader/readium", () => {
  const mockReact = jest.requireActual<typeof React>("react")
  const { View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    ReadiumView: mockReact.forwardRef(function ReadiumViewMock(
      props: {
        onPublicationReady?: (event: PublicationReadyEvent) => void
        onLocationChange?: (locator: Locator) => void
      },
      ref: React.Ref<unknown>,
    ) {
      mockReadiumProps = props
      mockReact.useImperativeHandle(ref, () => ({ goTo: mockGoTo }))
      return mockReact.createElement(MockView, { testID: "readium-view-mock" })
    }),
  }
})

function fixedLocator(page: number): Locator {
  return {
    href: "publication.pdf",
    type: "application/pdf",
    locations: {
      position: page + 1,
      progression: 0,
      totalProgression: page / 2,
    },
  }
}

describe("ReadiumFixedReader", () => {
  beforeEach(() => {
    mockGoTo.mockClear()
    mockReadiumProps = null
  })

  it("should navigate to the exact Readium position when progress is committed", () => {
    const readerRef = React.createRef<ReadiumFixedReaderRef>()
    const onStateChange = jest.fn()
    const onPositionsReady = jest.fn()
    const positions = [fixedLocator(0), fixedLocator(1), fixedLocator(2)]
    render(
      <View style={{ height: 800, width: 400 }}>
        <ReadiumFixedReader
          ref={readerRef}
          filePath="/tmp/book.pdf"
          onRequestClose={jest.fn()}
          onStateChange={onStateChange}
          onPositionsReady={onPositionsReady}
          onTocReady={jest.fn()}
          backgroundColor="#ffffff"
          navigationMode="horizontal"
          readingProgression="ltr"
          spread="auto"
        />
      </View>,
    )

    act(() => {
      mockReadiumProps?.onPublicationReady?.({
        metadata: { language: [], title: "Book" },
        positions,
        publicationId: "publication",
        tableOfContents: [],
      } as PublicationReadyEvent)
    })
    expect(onPositionsReady).toHaveBeenCalledWith(positions)
    mockGoTo.mockClear()
    onStateChange.mockClear()

    act(() => {
      readerRef.current?.goTo(positions[1]!)
    })

    expect(mockGoTo).toHaveBeenCalledWith(positions[1])
    expect(onStateChange).not.toHaveBeenCalled()

    act(() => {
      mockReadiumProps?.onLocationChange?.(positions[1]!)
    })
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currentPage: 1,
        totalPages: 3,
        progress: 50,
        locator: positions[1],
      }),
    )
  })
})
