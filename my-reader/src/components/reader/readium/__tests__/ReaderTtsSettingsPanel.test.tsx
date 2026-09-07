import { readerChromePalette } from "@my-reader/tools/reader-chrome-palette"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ReaderTtsSettingsPanel } from "@/components/reader/readium/ReaderTtsSettingsPanel"
import type { EpubTtsSession } from "@/hooks/reader/useEpubTtsSession"
import type { TtsConfigDto } from "@/lib/tauri-specta"

const mocks = vi.hoisted(() => ({
  getTtsConfig: vi.fn(),
  setTtsDefaultEngine: vi.fn(),
  setTtsPlaybackPreferences: vi.fn(),
  synthesizeTtsRequest: vi.fn(),
  cancelTtsSynthesis: vi.fn(),
  notifyTtsConfigChanged: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN", language: "zh-CN" },
  }),
}))

vi.mock("@/hooks/use-overlay-scrollbar", () => ({
  useOverlayScrollbar: vi.fn(),
}))

vi.mock("@/lib/tauri-api", () => ({
  api: {
    getTtsConfig: mocks.getTtsConfig,
    setTtsDefaultEngine: mocks.setTtsDefaultEngine,
    setTtsPlaybackPreferences: mocks.setTtsPlaybackPreferences,
    synthesizeTtsRequest: mocks.synthesizeTtsRequest,
    cancelTtsSynthesis: mocks.cancelTtsSynthesis,
  },
  formatApiError: (error: unknown) => String(error),
}))

vi.mock("@/lib/tts/events", () => ({
  notifyTtsConfigChanged: mocks.notifyTtsConfigChanged,
}))

const config: TtsConfigDto = {
  schemaVersion: 1,
  defaultEngine: { kind: "system" },
  profiles: [
    {
      id: "openai",
      name: "OpenAI",
      kind: "openAiCompatible",
      enabled: true,
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini-tts",
      options: {
        kind: "openAiCompatible",
        responseFormat: "mp3",
        voices: ["reader-voice"],
        defaultVoice: "reader-voice",
      },
      revision: 1,
      hasCredential: true,
    },
  ],
  voiceByLanguage: {},
  playback: {
    speed: 1,
    pitch: 1,
    skipPageBreaks: true,
    skipFootnotes: true,
    announceContext: false,
  },
}

function session(): EpubTtsSession {
  return {
    available: true,
    loading: false,
    state: "ready",
    viewportDetached: false,
    remote: false,
    engineName: "system",
    utteranceCount: 2,
    currentUtterance: null,
    voices: [
      {
        identifier: "ting",
        source: "browser",
        label: "Ting-Ting",
        name: "Ting-Ting",
        originalName: "Ting-Ting",
        language: "zh-CN",
      },
      {
        identifier: "li-mu",
        source: "browser",
        label: "Li-mu",
        name: "Li-mu",
        originalName: "Li-mu",
        language: "mul",
      },
    ],
    currentVoiceId: "ting",
    speed: 1,
    error: null,
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
    readFrom: vi.fn(),
    readAtPoint: vi.fn(),
    rebase: vi.fn(),
    markViewportMoved: vi.fn(),
    goToCurrent: vi.fn(),
    setVoice: vi.fn(),
    setSpeed: vi.fn(),
  }
}

describe("ReaderTtsSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    HTMLElement.prototype.hasPointerCapture = () => false
    HTMLElement.prototype.setPointerCapture = () => undefined
    HTMLElement.prototype.releasePointerCapture = () => undefined
    HTMLElement.prototype.scrollIntoView = () => undefined
    mocks.getTtsConfig.mockResolvedValue(config)
    mocks.setTtsDefaultEngine.mockResolvedValue({
      ...config,
      defaultEngine: { kind: "provider", profileId: "openai" },
    })
    mocks.setTtsPlaybackPreferences.mockResolvedValue(config)
    mocks.synthesizeTtsRequest.mockResolvedValue({
      path: "/tmp/preview.mp3",
      mimeType: "audio/mpeg",
      cacheKey: "preview",
    })
    vi.stubGlobal(
      "Audio",
      class {
        onended: (() => void) | null = null
        onerror: (() => void) | null = null
        pause = vi.fn()
        play = vi.fn().mockResolvedValue(undefined)
      },
    )
  })

  it("uses aligned selects and a speed slider without a volume setting", async () => {
    const user = userEvent.setup()
    const ttsSession = session()
    render(
      <ReaderTtsSettingsPanel visible session={ttsSession} theme="ocean" />,
    )

    const engineSelect = await screen.findByRole("combobox", {
      name: "reader.tts.engine",
    })
    expect(
      screen.getByRole("combobox", { name: "reader.tts.voice" }),
    ).toBeInTheDocument()
    const speedSlider = screen.getByRole("slider", {
      name: /^reader\.tts\.speed/,
    })
    expect(speedSlider).toBeInTheDocument()
    expect(
      screen.queryByRole("slider", { name: /^reader\.tts\.volume/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("switch", { name: "reader.tts.followText" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("switch", { name: "reader.tts.skipPageBreaks" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("switch", { name: "reader.tts.skipFootnotes" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "reader.closePanel" }),
    ).not.toBeInTheDocument()

    await user.click(engineSelect)
    const openAiOption = await screen.findByRole("option", { name: "OpenAI" })
    const oceanPalette = readerChromePalette("#ffffff", "#181842")
    expect(openAiOption.closest('[data-slot="select-content"]')).toHaveStyle({
      "--popover": oceanPalette.sheetSurface,
      "--foreground": oceanPalette.text,
      "--primary": oceanPalette.accent,
    })
    await user.click(openAiOption)
    await waitFor(() =>
      expect(mocks.setTtsDefaultEngine).toHaveBeenCalledWith({
        kind: "provider",
        profileId: "openai",
      }),
    )

    await user.click(screen.getByRole("combobox", { name: "reader.tts.voice" }))
    await user.click(
      await screen.findByRole("option", { name: "Li-mu · 多语言" }),
    )
    expect(ttsSession.setVoice).toHaveBeenCalledWith("li-mu")

    fireEvent.change(speedSlider, { target: { value: "1.5" } })
    fireEvent.pointerUp(speedSlider, { target: { value: "1.5" } })
    expect(ttsSession.setSpeed).toHaveBeenCalledWith(1.5)

    fireEvent.click(
      screen.getByRole("button", { name: "reader.tts.manageProviders" }),
    )
    expect(screen.getByRole("button", { name: "common.back" })).toHaveAttribute(
      "data-variant",
      "ghost",
    )
    expect(
      screen.queryByRole("button", { name: "reader.closePanel" }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("settings.speech.previewText")).toBeInTheDocument()
    expect(
      screen.getByRole("combobox", { name: "reader.tts.engine" }),
    ).toHaveTextContent("OpenAI")
    expect(
      screen.getByRole("combobox", { name: "reader.tts.voice" }),
    ).toHaveTextContent("reader-voice")
    expect(
      screen.getByRole("button", { name: "settings.speech.editProvider" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "settings.speech.removeProvider" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "settings.speech.addProvider" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "settings.speech.addProvider" })
        .parentElement?.parentElement,
    ).toHaveStyle({
      "--card": oceanPalette.segmentIdle,
      "--muted-foreground": oceanPalette.textMuted,
    })
    await user.click(
      screen.getByRole("button", { name: "settings.speech.addProvider" }),
    )
    const providerDialog = screen.getByRole("dialog")
    expect(providerDialog).toHaveStyle({
      color: oceanPalette.text,
      "--background": oceanPalette.sheetSurface,
      "--foreground": oceanPalette.text,
      "--border": oceanPalette.border,
    })
    await user.click(
      within(providerDialog).getByRole("button", { name: "common.close" }),
    )
    await user.click(
      screen.getByRole("combobox", { name: "reader.tts.engine" }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "settings.speech.systemTitle",
      }),
    )
    expect(
      screen.getByRole("combobox", { name: "reader.tts.voice" }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole("combobox", { name: "reader.tts.engine" }),
    )
    await user.click(await screen.findByRole("option", { name: "OpenAI" }))
    await user.click(screen.getByRole("combobox", { name: "reader.tts.voice" }))
    await user.click(
      await screen.findByRole("option", { name: "reader-voice" }),
    )
    await user.click(
      screen.getByRole("button", { name: "settings.speech.previewAction" }),
    )
    await waitFor(() =>
      expect(mocks.synthesizeTtsRequest).toHaveBeenCalledWith(
        expect.stringMatching(/^settings-preview-/),
        expect.objectContaining({
          profileId: "openai",
          voiceId: "reader-voice",
          text: "settings.speech.previewText",
        }),
      ),
    )

    fireEvent.click(screen.getByRole("button", { name: "common.back" }))
    expect(
      screen.getByRole("combobox", { name: "reader.tts.engine" }),
    ).toBeInTheDocument()
  })
})
