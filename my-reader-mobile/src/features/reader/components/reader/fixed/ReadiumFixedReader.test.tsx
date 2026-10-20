import React from "react"
import { Platform, View } from "react-native"
import { act, render } from "@testing-library/react-native"
import { ReaderNavigationHistory } from "@my-reader/tools/reader-navigation-history"
import type {
  Locator,
  PublicationReadyEvent,
  ReadiumProps,
} from "@my-reader/readium"

import ReadiumFixedReader, {
  type ReadiumFixedReaderRef,
} from "./ReadiumFixedReader"

const mockGoTo = jest.fn()
let mockReadiumProps: ReadiumProps | null = null

jest.mock("@my-reader/readium", () => {
  const mockReact = jest.requireActual<typeof React>("react")
  const { View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    ReadiumView: mockReact.forwardRef(function ReadiumViewMock(
      props: ReadiumProps,
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
  afterEach(() => jest.restoreAllMocks())

  beforeEach(() => {
    mockGoTo.mockClear()
    mockReadiumProps = null
  })

  it.each([
    ["android", "pdf"],
    ["android", "cbz"],
    ["ios", "pdf"],
    ["ios", "cbz"],
  ] as const)("should open %s %s at the saved page without a restoration jump", (platform, format) => {
    jest.replaceProperty(Platform, "OS", platform)
    const positions = [0, 1, 2].map((page) =>
      format === "pdf"
        ? fixedLocator(page)
        : {
            ...fixedLocator(page),
            href: `${page + 1}.jpg`,
            type: "image/jpeg",
          },
    )
    const saved = positions[1]!
    const history = new ReaderNavigationHistory()
    const onStateChange = jest.fn(({ locator }: { locator?: Locator }) => {
      if (locator) history.update(locator)
    })
    const onUserLocationChange = jest.fn(
      (locator: Locator, _id: string, kind: string) => {
        if (kind === "programmatic") history.jump(locator)
      },
    )
    render(
      <ReadiumFixedReader
        filePath={`/tmp/book.${format}`}
        initialLocator={saved}
        onRequestClose={jest.fn()}
        onStateChange={onStateChange}
        onUserLocationChange={onUserLocationChange}
        onTocReady={jest.fn()}
        backgroundColor="#ffffff"
        navigationMode="horizontal"
        readingProgression="ltr"
        spread="auto"
      />,
    )

    expect(mockReadiumProps?.file.initialLocation).toEqual(saved)
    // PDFKit can report its document's first page while initializing.
    act(() => mockReadiumProps?.onLocationChange?.(positions[0]!))
    act(() => {
      mockReadiumProps?.onPublicationReady?.({
        metadata: { language: [], title: "Book" },
        positions,
        publicationId: "publication",
        tableOfContents: [],
      } as PublicationReadyEvent)
      mockReadiumProps?.onLocationChange?.(saved)
    })

    expect(mockGoTo).not.toHaveBeenCalled()
    expect(onUserLocationChange).not.toHaveBeenCalled()
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ locator: saved }),
    )
    expect(history.getSnapshot()).toMatchObject({ entries: [saved], index: 0 })

    act(() =>
      mockReadiumProps?.onLocationChange?.(
        positions[2]!,
        "user",
        "jump",
        "programmatic",
      ),
    )
    expect(onUserLocationChange).toHaveBeenCalledWith(
      positions[2],
      "jump",
      "programmatic",
    )
    expect(history.move(-1)).toEqual(saved)
    expect(history.move(-1)).toBeNull()
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
