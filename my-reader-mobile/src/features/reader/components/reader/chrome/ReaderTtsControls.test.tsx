import type { TtsPlaybackState } from "@my-reader/readium"
import { fireEvent, render } from "@testing-library/react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import { ReaderTtsControls } from "./ReaderTtsControls"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("./ReaderChromeIcon", () => {
  const React = jest.requireActual("react")
  const { Text } = jest.requireActual("react-native")

  return {
    ReaderChromeIcon: ({ name }: { name: string }) =>
      React.createElement(Text, null, name),
  }
})

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
      viewportRelation={null}
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
        viewportRelation={null}
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
    fireEvent.press(screen.getByLabelText("reader.tts.previous"))
    fireEvent.press(screen.getByLabelText("reader.tts.next"))

    expect(callbacks.onStop).toHaveBeenCalledTimes(1)
    expect(callbacks.onPrevious).toHaveBeenCalledTimes(1)
    expect(callbacks.onNext).toHaveBeenCalledTimes(1)
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

  it("returns on the left and fast-forwards from a viewport after playback", () => {
    const screen = render(
      <ReaderTtsControls
        visible
        expanded
        state={{
          sessionId: "session-1",
          state: "playing",
          canGoPrevious: false,
          canGoNext: false,
        }}
        remote={false}
        viewportRelation="after"
        palette={palette}
        {...callbacks}
      />,
    )

    expect(screen.getByText("returnBackward")).toBeTruthy()
    expect(screen.getByText("fastForward")).toBeTruthy()
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel),
    ).toEqual([
      "reader.tts.stop",
      "reader.tts.returnToPlaybackPosition",
      "reader.tts.pause",
      "reader.tts.playFromCurrentPosition",
    ])
    expect(
      screen.getByTestId("reader-tts-left-action").props.accessibilityLabel,
    ).toBe("reader.tts.returnToPlaybackPosition")
    expect(
      screen.getByTestId("reader-tts-right-action").props.accessibilityLabel,
    ).toBe("reader.tts.playFromCurrentPosition")

    fireEvent.press(
      screen.getByRole("button", {
        name: "reader.tts.returnToPlaybackPosition",
      }),
    )

    expect(callbacks.onReturnToPlaybackPosition).toHaveBeenCalledTimes(1)

    fireEvent.press(
      screen.getByRole("button", {
        name: "reader.tts.playFromCurrentPosition",
      }),
    )

    expect(callbacks.onPlayFromCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it("rewinds from the left and returns on the right from a viewport before playback", () => {
    const screen = render(
      <ReaderTtsControls
        visible
        expanded
        state={{ sessionId: "session-1", state: "paused" }}
        remote={false}
        viewportRelation="before"
        palette={palette}
        {...callbacks}
      />,
    )

    expect(screen.getByText("rewind")).toBeTruthy()
    expect(screen.getByText("returnForward")).toBeTruthy()
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel),
    ).toEqual([
      "reader.tts.stop",
      "reader.tts.playFromCurrentPosition",
      "reader.tts.play",
      "reader.tts.returnToPlaybackPosition",
    ])
    expect(
      screen.getByTestId("reader-tts-left-action").props.accessibilityLabel,
    ).toBe("reader.tts.playFromCurrentPosition")
    expect(
      screen.getByTestId("reader-tts-right-action").props.accessibilityLabel,
    ).toBe("reader.tts.returnToPlaybackPosition")

    fireEvent.press(
      screen.getByRole("button", {
        name: "reader.tts.playFromCurrentPosition",
      }),
    )
    fireEvent.press(
      screen.getByRole("button", {
        name: "reader.tts.returnToPlaybackPosition",
      }),
    )

    expect(callbacks.onPlayFromCurrentPosition).toHaveBeenCalledTimes(1)
    expect(callbacks.onReturnToPlaybackPosition).toHaveBeenCalledTimes(1)
  })
})
