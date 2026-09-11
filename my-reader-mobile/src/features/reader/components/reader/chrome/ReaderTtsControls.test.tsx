import type { TtsPlaybackState } from "@my-reader/readium"
import { fireEvent, render } from "@testing-library/react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import { ReaderTtsControls } from "./ReaderTtsControls"
import {
  READER_FLOATING_BUTTON_LEFT,
  READER_FLOATING_BUTTON_RIGHT,
  READER_FLOATING_BUTTON_SIZE,
  readerTtsControlLayout,
} from "./readerChromeConstants"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("./ReaderChromeIcon", () => ({
  ReaderChromeIcon: () => null,
}))

const palette = readerChromePalette("#FFFFFF", "#181842")

const callbacks = {
  onExpand: jest.fn(),
  onPlay: jest.fn(),
  onPause: jest.fn(),
  onPrevious: jest.fn(),
  onNext: jest.fn(),
  onStop: jest.fn(),
  onPlayFromCurrentPosition: jest.fn(),
  onReturnToPlaybackPosition: jest.fn(),
}

function renderPlayer(
  state: TtsPlaybackState | null,
  remote = false,
  expanded = state !== null,
) {
  return render(
    <ReaderTtsControls
      visible
      expanded={expanded}
      state={state}
      remote={remote}
      playFromCurrentPosition={false}
      palette={palette}
      {...callbacks}
    />,
  )
}

describe("ReaderTtsControls", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("opens the player without starting narration", () => {
    const screen = renderPlayer(null)

    fireEvent.press(screen.getByLabelText("reader.tts.openControls"))

    expect(callbacks.onExpand).toHaveBeenCalledTimes(1)
    expect(callbacks.onPlay).not.toHaveBeenCalled()

    screen.rerender(
      <ReaderTtsControls
        visible
        expanded
        state={null}
        remote={false}
        playFromCurrentPosition={false}
        palette={palette}
        {...callbacks}
      />,
    )
    fireEvent.press(screen.getByLabelText("reader.tts.play"))
    expect(callbacks.onPlay).toHaveBeenCalledTimes(1)
  })

  it("exposes four playback controls when expanded", () => {
    const screen = renderPlayer({
      sessionId: "session-1",
      state: "playing",
      utterance: "This text is represented by the reader highlight.",
      canGoPrevious: true,
      canGoNext: true,
    })

    const labels = screen
      .getAllByRole("button")
      .map((button) => button.props.accessibilityLabel)

    expect(labels).toEqual([
      "reader.tts.stop",
      "reader.tts.previous",
      "reader.tts.pause",
      "reader.tts.next",
    ])
    expect(
      screen.queryByText("This text is represented by the reader highlight."),
    ).toBeNull()

    fireEvent.press(screen.getByLabelText("reader.tts.stop"))
    expect(callbacks.onStop).toHaveBeenCalledTimes(1)
  })

  it("shows generation only as the playback-button spinner", () => {
    const screen = renderPlayer(
      { sessionId: "session-1", state: "loading" },
      true,
    )

    expect(
      screen.getByLabelText("reader.tts.states.generating").props
        .accessibilityRole,
    ).toBe("progressbar")
    expect(screen.queryByText("reader.tts.states.generating")).toBeNull()
  })

  it("offers to play from the visible page after the viewport moves", () => {
    const screen = render(
      <ReaderTtsControls
        visible
        expanded
        state={{ sessionId: "session-1", state: "playing" }}
        remote={false}
        playFromCurrentPosition
        palette={palette}
        {...callbacks}
      />,
    )

    fireEvent.press(
      screen.getByRole("button", {
        name: "reader.tts.playFromCurrentPosition",
      }),
    )

    expect(callbacks.onPlayFromCurrentPosition).toHaveBeenCalledTimes(1)

    fireEvent.press(
      screen.getByRole("button", {
        name: "reader.tts.returnToPlaybackPosition",
      }),
    )

    expect(callbacks.onReturnToPlaybackPosition).toHaveBeenCalledTimes(1)
  })

  it("uses the circular-control gap between detached actions", () => {
    const windowWidth = 393
    const layout = readerTtsControlLayout(windowWidth)
    const circularControlGap = layout.anchorStep - READER_FLOATING_BUTTON_SIZE

    expect(layout.detachedActionGap).toBe(circularControlGap)
    expect(layout.detachedActionWidth * 2 + layout.detachedActionGap).toBe(
      windowWidth - READER_FLOATING_BUTTON_LEFT - READER_FLOATING_BUTTON_RIGHT,
    )
  })
})
