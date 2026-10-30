import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { readerChromePalette } from "@my-reader/tools/reader-chrome-palette"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ReaderTtsSettingsPanel } from "@/components/reader/readium/ReaderTtsSettingsPanel"
import type { EpubTtsSession } from "@/hooks/reader/useEpubTtsSession"
import type { TtsConfigDto } from "@/lib/tauri-specta"

const mocks = vi.hoisted(() => ({
  openTtsProviderSettings: vi.fn().mockResolvedValue(undefined),
  getTtsConfig: vi.fn(),
  getBookNarration: vi.fn(),
  setTtsDefaultEngine: vi.fn(),
  setTtsPlaybackPreferences: vi.fn(),
  synthesizeTtsRequest: vi.fn(),
  cancelTtsSynthesis: vi.fn(),
  notifyTtsConfigChanged: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/settingsWindow", () => ({
  openTtsProviderSettings: mocks.openTtsProviderSettings,
}))

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
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
    listQwenTtsModels: vi.fn().mockResolvedValue([]),
    listQwenTtsPresets: vi.fn().mockResolvedValue([]),
    getTtsConfig: mocks.getTtsConfig,
    getBookNarration: mocks.getBookNarration,
    listTtsVoices: vi.fn().mockResolvedValue([]),
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
  schemaVersion: 2,
  providers: [],
  defaultEngine: { kind: "system" },
  profiles: [
    {
      id: "openai",
      name: "OpenAI",
      kind: "openAiCompatible",
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
    viewportOriginLocator: null,
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
    const openAiOption = await screen.findByRole("option", {
      name: "OpenAI/gpt-4o-mini-tts",
    })
    const oceanPalette = readerChromePalette("#ffffff", "#181842")
    expect(openAiOption.closest('[style*="--popover"]')).toHaveStyle({
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

    act(() => speedSlider.focus())
    await user.keyboard("{ArrowRight>5}")
    expect(vi.mocked(ttsSession.setSpeed).mock.lastCall?.[0]).toBeCloseTo(1.5)

    fireEvent.click(
      screen.getByRole("button", { name: "ttsSettings.manageProviders" }),
    )
    expect(mocks.openTtsProviderSettings).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole("button", { name: "settings.speech.addProvider" }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

it("names the character being edited and replaces general playback controls until returning", async () => {
  mocks.getBookNarration.mockResolvedValue({
    bookId: 42,
    scopeId: "book:42",
    scopeName: null,
    mergeSources: [],
    enabled: true,
    revision: 1,
    identityRevision: 1,
    characters: [
      {
        id: "narrator",
        name: "narrator",
        nicknames: [],
        description: "",
        voice: null,
        instructions: "",
        source: null,
      },
      {
        id: "chen",
        name: "陈默",
        nicknames: [],
        description: "Teacher",
        voice: null,
        instructions: "",
        source: null,
      },
    ],
  })
  mocks.getTtsConfig.mockResolvedValue(config)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <QueryClientProvider client={client}>
      <ReaderTtsSettingsPanel
        visible
        session={session()}
        book={{
          libraryId: "library",
          bookId: 42,
          title: "Novel",
          authors: [],
          language: "zh",
        }}
      />
    </QueryClientProvider>,
  )
  await screen.findByRole("combobox", { name: "reader.tts.engine" })
  expect(screen.queryByRole("button", { name: /陈默/ })).not.toBeInTheDocument()
  expect(
    screen.queryByRole("button", { name: "narration.add" }),
  ).not.toBeInTheDocument()
  fireEvent.click(await screen.findByRole("button", { name: "narration.edit" }))
  expect(
    await screen.findByRole("button", { name: /陈默/ }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "narration.add" }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole("combobox", { name: "reader.tts.engine" }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole("slider", { name: /^reader\.tts\.speed/ }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole("switch", { name: "narration.enabled" }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: /narration.narrator/ }))
  expect(await screen.findByText("narration.narrator")).toBeInTheDocument()
  expect(
    screen.getByRole("combobox", { name: "narration.provider" }),
  ).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /陈默/ })).not.toBeInTheDocument()
  expect(
    screen.queryByRole("button", { name: "narration.add" }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "common.back" }))
  expect(
    await screen.findByRole("button", { name: /陈默/ }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole("combobox", { name: "reader.tts.engine" }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: /陈默/ }))
  expect(screen.getByLabelText(/narration\.name/)).toHaveValue("陈默")
  fireEvent.click(screen.getByRole("button", { name: "llm.cancel" }))
  expect(
    await screen.findByRole("button", { name: /陈默/ }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole("combobox", { name: "reader.tts.engine" }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "common.back" }))
  expect(
    await screen.findByRole("combobox", { name: "reader.tts.engine" }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole("button", { name: "common.back" }),
  ).not.toBeInTheDocument()
  client.clear()
})
