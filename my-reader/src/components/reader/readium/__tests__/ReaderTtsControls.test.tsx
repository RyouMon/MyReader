import { fireEvent, render, screen } from "@testing-library/react"
import { toast } from "sonner"
import { describe, expect, it, vi } from "vitest"
import { ReaderTtsControls } from "@/components/reader/readium/ReaderTtsControls"
import type { EpubTtsSession } from "@/hooks/reader/useEpubTtsSession"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}))

function session(overrides: Partial<EpubTtsSession> = {}): EpubTtsSession {
  return {
    available: true,
    loading: false,
    state: "ready",
    viewportDetached: false,
    remote: false,
    engineName: "system",
    utteranceCount: 3,
    currentUtterance: null,
    voices: [],
    currentVoiceId: "",
    speed: 1,
    error: null,
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
    readFrom: vi.fn(),
    rebase: vi.fn(),
    markViewportMoved: vi.fn(),
    goToCurrent: vi.fn(),
    setVoice: vi.fn(),
    setSpeed: vi.fn(),
    ...overrides,
  }
}

describe("ReaderTtsControls", () => {
  it("opens the player without starting narration", () => {
    const ttsSession = session()
    const onPlay = vi.fn()
    render(
      <ReaderTtsControls
        session={ttsSession}
        visible
        settingsOpen={false}
        onPlay={onPlay}
        onPlayFromCurrentPosition={vi.fn()}
        onReturnToPlaybackPosition={vi.fn()}
        onToggleSettings={vi.fn()}
      />,
    )

    expect(screen.getAllByRole("button")).toHaveLength(1)
    fireEvent.click(
      screen.getByRole("button", { name: "reader.tts.openControls" }),
    )

    expect(ttsSession.play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "reader.tts.play" }))
    expect(onPlay).toHaveBeenCalledOnce()
    expect(ttsSession.play).not.toHaveBeenCalled()
  })

  it("expands left with settings, sentence controls, and stop at the right edge", () => {
    const ttsSession = session()
    render(
      <ReaderTtsControls
        session={ttsSession}
        visible
        settingsOpen={false}
        onPlayFromCurrentPosition={vi.fn()}
        onReturnToPlaybackPosition={vi.fn()}
        onToggleSettings={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "reader.tts.openControls" }),
    )

    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "reader.tts.settings",
      "reader.tts.previousSentence",
      "reader.tts.play",
      "reader.tts.nextSentence",
      "reader.tts.stop",
    ])
    expect(screen.queryByText("system")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "reader.tts.stop" }))

    expect(ttsSession.stop).toHaveBeenCalledOnce()
    expect(screen.getAllByRole("button")).toHaveLength(1)
  })

  it("uses pause as the center action while speech is playing", () => {
    const ttsSession = session({ state: "playing" })
    render(
      <ReaderTtsControls
        session={ttsSession}
        visible={false}
        settingsOpen={false}
        onPlayFromCurrentPosition={vi.fn()}
        onReturnToPlaybackPosition={vi.fn()}
        onToggleSettings={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "reader.tts.pause" }))

    expect(ttsSession.pause).toHaveBeenCalledOnce()
  })

  it("shows when a remote provider is generating audio", () => {
    const { rerender } = render(
      <ReaderTtsControls
        session={session({ state: "playing", remote: true })}
        visible
        settingsOpen={false}
        onPlayFromCurrentPosition={vi.fn()}
        onReturnToPlaybackPosition={vi.fn()}
        onToggleSettings={vi.fn()}
      />,
    )

    rerender(
      <ReaderTtsControls
        session={session({ state: "loading", remote: true })}
        visible
        settingsOpen={false}
        onPlayFromCurrentPosition={vi.fn()}
        onReturnToPlaybackPosition={vi.fn()}
        onToggleSettings={vi.fn()}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "reader.tts.generating",
    )
  })

  it("reports speech engine failures to the user", () => {
    vi.mocked(toast.error).mockClear()
    const { rerender } = render(
      <ReaderTtsControls
        session={session()}
        visible
        settingsOpen={false}
        onPlayFromCurrentPosition={vi.fn()}
        onReturnToPlaybackPosition={vi.fn()}
        onToggleSettings={vi.fn()}
      />,
    )

    rerender(
      <ReaderTtsControls
        session={session({ error: "speech engine failed" })}
        visible
        settingsOpen={false}
        onPlayFromCurrentPosition={vi.fn()}
        onReturnToPlaybackPosition={vi.fn()}
        onToggleSettings={vi.fn()}
      />,
    )

    expect(toast.error).toHaveBeenCalledWith("reader.tts.error", {
      description: "speech engine failed",
    })
  })

  it("offers to play from the visible page after the viewport moves", () => {
    const onPlayFromCurrentPosition = vi.fn()
    const onReturnToPlaybackPosition = vi.fn()
    render(
      <ReaderTtsControls
        session={session({ state: "playing", viewportDetached: true })}
        visible
        settingsOpen={false}
        onPlayFromCurrentPosition={onPlayFromCurrentPosition}
        onReturnToPlaybackPosition={onReturnToPlaybackPosition}
        onToggleSettings={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "reader.tts.playFromCurrentPosition",
      }),
    )

    expect(onPlayFromCurrentPosition).toHaveBeenCalledOnce()

    fireEvent.click(
      screen.getByRole("button", {
        name: "reader.tts.returnToPlaybackPosition",
      }),
    )

    expect(onReturnToPlaybackPosition).toHaveBeenCalledOnce()
  })
})
