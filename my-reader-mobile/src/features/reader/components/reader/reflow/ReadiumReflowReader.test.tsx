import React from "react"
import { View } from "react-native"
import { act, render } from "@testing-library/react-native"
import type { Link, Locator, PublicationReadyEvent } from "@my-reader/readium"

import ReadiumReflowReader, {
  type ReadiumReflowReaderRef,
  type ReadiumReflowReaderProps,
} from "./ReadiumReflowReader"

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
      mockReact.useImperativeHandle(ref, () => ({
        goTo: mockGoTo,
      }))
      return mockReact.createElement(MockView, { testID: "readium-view-mock" })
    }),
    publication: {
      getContent: jest.fn(() => Promise.resolve({ utterances: [] })),
    },
  }
})

function locator(
  href: string,
  locations: Partial<NonNullable<Locator["locations"]>> = {},
): Locator {
  return {
    href,
    type: "application/xhtml+xml",
    locations: {
      progression: 0,
      ...locations,
    },
  } as Locator
}

function readerElement(
  props: Partial<ReadiumReflowReaderProps> = {},
  ref?: React.Ref<ReadiumReflowReaderRef>,
) {
  return render(
    <View style={{ height: 800, width: 400 }}>
      <ReadiumReflowReader
        ref={ref}
        epubPath="/tmp/book.epub"
        onRequestClose={jest.fn()}
        onStateChange={jest.fn()}
        onTocReady={jest.fn()}
        {...props}
      />
    </View>,
  )
}

describe("ReadiumReflowReader", () => {
  beforeEach(() => {
    mockGoTo.mockClear()
    mockReadiumProps = null
  })

  it("should update state from the native location after selecting a parent toc chapter", () => {
    const readerRef = React.createRef<ReadiumReflowReaderRef>()
    const onStateChange = jest.fn()
    const onTocReady = jest.fn()
    const positions = [
      locator("OEBPS/text00011.html", {
        position: 60,
        progression: 0.34,
        totalProgression: 0.34,
      }),
      locator("OEBPS/text00011.html", {
        position: 61,
        progression: 0.4,
        totalProgression: 0.4,
      }),
    ]
    const tableOfContents: Link[] = [
      {
        href: "text00011.html",
        title: "Chapter 3",
        children: [
          {
            href: "text00011.html#bw20",
            title: "3.1 The Street",
          } as Link,
        ],
      } as Link,
    ]

    const props = { onStateChange, onTocReady }
    readerElement(props, readerRef)
    act(() => {
      mockReadiumProps?.onPublicationReady?.({
        metadata: { language: [], title: "Book" },
        positions,
        publicationId: "publication",
        tableOfContents,
      } as PublicationReadyEvent)
    })
    onStateChange.mockClear()

    act(() => {
      const selectedTocItem = onTocReady.mock.calls[0]?.[0]?.[0]
      readerRef.current?.goTo(positions[0]!, selectedTocItem)
    })

    expect(mockGoTo).toHaveBeenCalledWith(positions[0])
    expect(onStateChange).not.toHaveBeenCalled()

    act(() => {
      mockReadiumProps?.onLocationChange?.(positions[0]!)
    })
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chapterTitle: "Chapter 3",
        locator: expect.objectContaining({
          href: "text00011.html",
          title: "Chapter 3",
        }),
      }),
    )
  })

  it("should navigate to the exact Readium position when progress is committed", () => {
    const readerRef = React.createRef<ReadiumReflowReaderRef>()
    const onStateChange = jest.fn()
    const onPositionsReady = jest.fn()
    const positions = [
      locator("OEBPS/chapter1.xhtml", {
        position: 1,
        totalProgression: 0,
      }),
      locator("OEBPS/chapter2.xhtml", {
        position: 2,
        totalProgression: 0.5,
      }),
      locator("OEBPS/chapter3.xhtml", {
        position: 3,
        totalProgression: 1,
      }),
    ]
    const props = { onStateChange, onPositionsReady }
    readerElement(props, readerRef)

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
