import React from "react"
import { View } from "react-native"
import { act, render } from "@testing-library/react-native"
import type { Link, Locator, PublicationReadyEvent } from "@my-reader/readium"

import ReadiumReflowReader, {
  type ReadiumReflowReaderProps,
} from "./ReadiumReflowReader"

const mockGoTo = jest.fn()
let mockReadiumProps: {
  onPublicationReady?: (event: PublicationReadyEvent) => void
} | null = null

jest.mock("@my-reader/readium", () => {
  const mockReact = require("react")
  const { View: MockView } = require("react-native")

  return {
    ReadiumView: mockReact.forwardRef(function ReadiumViewMock(
      props: {
        onPublicationReady?: (event: PublicationReadyEvent) => void
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

function readerElement(props: Partial<ReadiumReflowReaderProps> = {}) {
  return render(
    <View style={{ height: 800, width: 400 }}>
      <ReadiumReflowReader
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

  it("should update state immediately when selecting a parent toc chapter", () => {
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
    const { rerender } = readerElement(props)
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
      rerender(
        <View style={{ height: 800, width: 400 }}>
          <ReadiumReflowReader
            epubPath="/tmp/book.epub"
            onRequestClose={jest.fn()}
            onStateChange={onStateChange}
            onTocReady={onTocReady}
            gotoTocIndex={0}
          />
        </View>,
      )
    })

    expect(mockGoTo).toHaveBeenCalledWith(positions[0])
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
})
