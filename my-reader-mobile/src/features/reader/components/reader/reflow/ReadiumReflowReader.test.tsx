import type {
  DecorationGroup,
  Link,
  Locator,
  PublicationReadyEvent,
  SelectionMenuConfig,
} from "@my-reader/readium"
import { act, render } from "@testing-library/react-native"
import React from "react"
import { View } from "react-native"

import ReadiumReflowReader, {
  type ReadiumReflowReaderProps,
  type ReadiumReflowReaderRef,
} from "./ReadiumReflowReader"

const mockGoTo = jest.fn()
const mockClearSelection = jest.fn()
const mockStartTts = jest.fn()
const mockCompleteTtsSynthesis = jest.fn()
let mockReadiumProps: {
  onPublicationReady?: (event: PublicationReadyEvent) => void
  onLocationChange?: (
    locator: Locator,
    source?: "tts" | "user",
    navigationId?: string,
    navigationKind?: "pageTurn" | "programmatic",
  ) => void
  decorations?: DecorationGroup[]
  selectionMenu?: SelectionMenuConfig
  customSelectionMenu?: boolean
  onTap?: () => void
  onTtsStateChange?: (event: { sessionId: string; state: "playing" }) => void
} | null = null

jest.mock("@my-reader/readium", () => {
  const mockReact = jest.requireActual<typeof React>("react")
  const { View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native")

  return {
    ReadiumView: mockReact.forwardRef(function ReadiumViewMock(
      props: {
        onPublicationReady?: (event: PublicationReadyEvent) => void
        onLocationChange?: (
          locator: Locator,
          source?: "tts" | "user",
          navigationId?: string,
          navigationKind?: "pageTurn" | "programmatic",
        ) => void
        decorations?: DecorationGroup[]
        selectionMenu?: SelectionMenuConfig
        customSelectionMenu?: boolean
        onTap?: () => void
        onTtsStateChange?: (event: {
          sessionId: string
          state: "playing"
        }) => void
      },
      ref: React.Ref<unknown>,
    ) {
      mockReadiumProps = props
      mockReact.useImperativeHandle(ref, () => ({
        goTo: mockGoTo,
        clearSelection: mockClearSelection,
        startTts: mockStartTts,
        playTts: jest.fn(),
        pauseTts: jest.fn(),
        stopTts: jest.fn(),
        previousTts: jest.fn(),
        nextTts: jest.fn(),
        completeTtsSynthesis: mockCompleteTtsSynthesis,
      }))
      return mockReact.createElement(MockView, { testID: "readium-view-mock" })
    }),
    publication: {
      getContent: jest.fn(() => Promise.resolve({ utterances: [] })),
    },
  }
})

const mockGetContent = jest.requireMock("@my-reader/readium").publication
  .getContent as jest.Mock<Promise<Record<string, unknown>>, []>

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
    mockClearSelection.mockClear()
    mockStartTts.mockClear()
    mockCompleteTtsSynthesis.mockClear()
    mockGetContent.mockReset()
    mockGetContent.mockResolvedValue({ utterances: [] })
    mockReadiumProps = null
  })

  it("should enhance shared-resource toc items from native content locators", async () => {
    const onTocReady = jest.fn()
    const positions = Array.from({ length: 5 }, (_, index) =>
      locator("OEBPS/chapter.xhtml", {
        position: index + 1,
        progression: index / 5,
      }),
    )
    mockGetContent.mockResolvedValueOnce({
      content: [
        {
          text: "第一次见面",
          locator: locator("OEBPS/chapter.xhtml", { progression: 0.2 }),
        },
        {
          text: "再次相遇",
          locator: locator("OEBPS/chapter.xhtml", { progression: 0.6 }),
        },
      ],
    })
    readerElement({ onTocReady })

    await act(async () => {
      mockReadiumProps?.onPublicationReady?.({
        metadata: { language: [], title: "Book" },
        positions,
        publicationId: "publication",
        tableOfContents: [
          {
            href: "chapter.xhtml",
            title: "第二章",
            children: [
              { href: "chapter.xhtml", title: "第一次见面" },
              { href: "chapter.xhtml", title: "再次相遇" },
            ],
          },
        ],
      } as PublicationReadyEvent)
    })

    const enhancedToc = onTocReady.mock.calls.at(-1)?.[0]
    expect(enhancedToc?.[1]).toMatchObject({
      label: "第一次见面",
      locatorSource: "content",
      locator: { locations: { progression: 0.2 } },
    })
    expect(enhancedToc?.[2]).toMatchObject({
      label: "再次相遇",
      locatorSource: "content",
      locator: { locations: { progression: 0.6 } },
    })
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

  it("should forward active search decorations to ReadiumView", () => {
    const decorations: DecorationGroup[] = [
      {
        name: "search",
        decorations: [
          {
            id: "active-search-result",
            locator: locator("OEBPS/chapter.xhtml", { position: 1 }),
            style: { type: "highlight", tint: "#C4622D", isActive: false },
          },
        ],
      },
    ]
    readerElement({ decorations })

    expect(mockReadiumProps?.decorations).toEqual(decorations)
  })

  it("should expose custom selection handling through the reader ref", () => {
    const readerRef = React.createRef<ReadiumReflowReaderRef>()
    const selectionMenu: SelectionMenuConfig = {
      locator: locator("OEBPS/chapter.xhtml", { position: 1 }),
      selectedText: "selected text",
      colorMenuLabel: "Highlight",
      colors: [
        {
          id: "color:yellow",
          label: "Amber",
          color: "#D9A928",
          selected: true,
        },
      ],
      actions: [
        { id: "readAloud", label: "Read from here" },
        { id: "addNote", label: "Add note" },
      ],
    }
    readerElement({ customSelectionMenu: true, selectionMenu }, readerRef)

    act(() => readerRef.current?.clearSelection())

    expect(mockReadiumProps?.customSelectionMenu).toBe(true)
    expect(mockReadiumProps?.selectionMenu).toEqual(selectionMenu)
    expect(mockClearSelection).toHaveBeenCalledTimes(1)
  })

  it("should forward a reader tap only as a chrome toggle signal", () => {
    const onToggleChrome = jest.fn()
    readerElement({ onToggleChrome })

    act(() => mockReadiumProps?.onTap?.())

    expect(onToggleChrome).toHaveBeenCalledTimes(1)
  })

  it("should forward the TTS session contract through the reflow reader", () => {
    const readerRef = React.createRef<ReadiumReflowReaderRef>()
    const onTtsStateChange = jest.fn()
    const startLocator = locator("OEBPS/chapter.xhtml", { position: 1 })
    const engine = {
      kind: "provider" as const,
      profileId: "openai",
      voiceId: "reader-voice",
      speed: 1,
      pitch: 1,
    }
    const startOptions = {
      sessionId: "session-1",
      startAtViewportStart: true,
      skipPartialViewportSentence: true,
    }
    readerElement({ onTtsStateChange }, readerRef)

    act(() => {
      readerRef.current?.startTts(engine, startLocator, startOptions)
      readerRef.current?.completeTtsSynthesis({
        sessionId: "session-1",
        requestId: "request-1",
        path: "/tmp/speech.mp3",
        mimeType: "audio/mpeg",
      })
      mockReadiumProps?.onTtsStateChange?.({
        sessionId: "session-1",
        state: "playing",
      })
    })

    expect(mockStartTts).toHaveBeenCalledWith(
      engine,
      startLocator,
      startOptions,
    )
    expect(mockCompleteTtsSynthesis).toHaveBeenCalledWith({
      sessionId: "session-1",
      requestId: "request-1",
      path: "/tmp/speech.mp3",
      mimeType: "audio/mpeg",
    })
    expect(onTtsStateChange).toHaveBeenCalledWith({
      sessionId: "session-1",
      state: "playing",
    })
  })

  it("should expose the publication id when Readium reports readiness", () => {
    const onPublicationReady = jest.fn()
    readerElement({ onPublicationReady })

    act(() => {
      mockReadiumProps?.onPublicationReady?.({
        metadata: { language: [], title: "Book" },
        positions: [locator("OEBPS/chapter.xhtml", { position: 1 })],
        publicationId: "publication",
        tableOfContents: [],
      } as PublicationReadyEvent)
    })

    expect(onPublicationReady).toHaveBeenCalledWith("publication")
  })

  it("should restore synced progress when native location arrives before publication readiness", () => {
    const onStateChange = jest.fn()
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
    const initialLocator = locator("desktop/chapter3.xhtml", {
      position: 3,
      totalProgression: 1,
    })
    readerElement({ initialLocator, onStateChange })

    act(() => {
      mockReadiumProps?.onLocationChange?.(positions[0]!)
    })
    mockGoTo.mockClear()
    onStateChange.mockClear()

    act(() => {
      mockReadiumProps?.onPublicationReady?.({
        metadata: { language: [], title: "Book" },
        positions,
        publicationId: "publication",
        tableOfContents: [],
      } as PublicationReadyEvent)
    })

    expect(mockGoTo).toHaveBeenCalledWith(positions[2])
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currentPage: 2,
        locator: positions[2],
      }),
    )
  })

  it("should notify TTS only for an explicit user navigation transaction", () => {
    const readerRef = React.createRef<ReadiumReflowReaderRef>()
    const onUserLocationChange = jest.fn()
    const target = locator("OEBPS/chapter.xhtml", {
      position: 2,
      totalProgression: 0.2,
    })
    const nextPage = locator("OEBPS/chapter.xhtml", {
      position: 3,
      progression: 0.3,
      totalProgression: 0.3,
    })
    readerElement({ onUserLocationChange }, readerRef)

    act(() => readerRef.current?.goTo(target))
    act(() =>
      mockReadiumProps?.onLocationChange?.(
        target,
        "user",
        "navigation-1",
        "programmatic",
      ),
    )

    expect(onUserLocationChange).toHaveBeenCalledWith(
      target,
      "navigation-1",
      "programmatic",
    )

    act(() =>
      mockReadiumProps?.onLocationChange?.(
        nextPage,
        "user",
        "navigation-2",
        "pageTurn",
      ),
    )

    expect(onUserLocationChange).toHaveBeenCalledTimes(2)
    expect(onUserLocationChange).toHaveBeenCalledWith(
      nextPage,
      "navigation-2",
      "pageTurn",
    )
  })

  it("should never turn an unowned native locator update into a TTS seek", () => {
    const onUserLocationChange = jest.fn()
    const internalPage = locator("OEBPS/chapter.xhtml", {
      position: 3,
      progression: 0.3,
    })
    readerElement({ onUserLocationChange })

    act(() => mockReadiumProps?.onLocationChange?.(internalPage))

    expect(onUserLocationChange).not.toHaveBeenCalled()
  })

  it("should not classify TTS follow-text navigation as a user page turn", () => {
    const onUserLocationChange = jest.fn()
    const spokenPage = locator("OEBPS/chapter.xhtml", {
      position: 4,
      progression: 0.4,
    })
    readerElement({ onUserLocationChange })

    act(() => {
      mockReadiumProps?.onLocationChange?.(spokenPage, "tts")
      mockReadiumProps?.onLocationChange?.(spokenPage, "tts")
    })

    expect(onUserLocationChange).not.toHaveBeenCalled()
  })
})
