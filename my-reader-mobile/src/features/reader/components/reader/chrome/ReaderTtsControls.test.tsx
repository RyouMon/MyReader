import type { TtsPlaybackState } from "@my-reader/readium"
import { fireEvent, render } from "@testing-library/react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import { ReaderTtsControls } from "./ReaderTtsControls"

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
  onMore: jest.fn(),
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

    fireEvent.press(screen.getByLabelText("reader.chrome.moreActions"))
    expect(callbacks.onMore).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByLabelText("reader.tts.openControls"))

    expect(callbacks.onExpand).toHaveBeenCalledTimes(1)
    expect(callbacks.onPlay).not.toHaveBeenCalled()

    screen.rerender(
      <ReaderTtsControls
        visible
        expanded
        state={null}
        remote={false}
        palette={palette}
        {...callbacks}
      />,
    )
    fireEvent.press(screen.getByLabelText("reader.tts.play"))
    expect(callbacks.onPlay).toHaveBeenCalledTimes(1)
  })

  it("exposes five playback and more controls when expanded", () => {
    const screen = renderPlayer({
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
      "reader.chrome.moreActions",
    ])
    expect(
      screen.queryByText("This text is represented by the reader highlight."),
    ).toBeNull()

    fireEvent.press(screen.getByLabelText("reader.tts.stop"))
    fireEvent.press(screen.getByLabelText("reader.chrome.moreActions"))
    expect(callbacks.onStop).toHaveBeenCalledTimes(1)
    expect(callbacks.onMore).toHaveBeenCalledTimes(1)
  })

  it("shows generation only as the playback-button spinner", () => {
    const screen = renderPlayer({ state: "loading" }, true)

    expect(
      screen.getByLabelText("reader.tts.states.generating").props
        .accessibilityRole,
    ).toBe("progressbar")
    expect(screen.queryByText("reader.tts.states.generating")).toBeNull()
  })
})
