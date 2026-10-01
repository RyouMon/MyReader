import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import * as mockReact from "react"
import {
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
} from "react-native"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  getTtsConfig,
  setTtsDefaultEngine,
  synthesizeTts,
} from "@/src/services/core/tts"
import TtsSettingsScreen from "./tts-settings-screen"

let mockPlaybackRate = 1
const mockAudioPlayer = {
  pause: jest.fn(),
  play: jest.fn(() => mockPlaybackRate),
  replace: jest.fn(),
  // Reject assignment like the native getter-only property, even outside strict mode.
  get playbackRate() {
    return mockPlaybackRate
  },
  set playbackRate(_rate: number) {
    throw new TypeError(
      "Cannot assign to property 'playbackRate' which has only a getter",
    )
  },
  setPlaybackRate: jest.fn((rate: number) => {
    mockPlaybackRate = rate
  }),
}
const mockUseAudioPlayer = jest.fn((_source: string | null) => mockAudioPlayer)
const mockSpeechStop = jest.fn().mockResolvedValue(undefined)
const mockT = (key: string) => key
const mockProviderConfig = {
  schemaVersion: 1,
  defaultEngine: { kind: "provider" as const, profileId: "openai" },
  profiles: [
    {
      id: "openai",
      name: "OpenAI",
      kind: "openAiCompatible" as const,
      enabled: true,
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini-tts",
      responseFormat: "mp3" as const,
      voices: ["reader-voice"],
      defaultVoice: "reader-voice",
      revision: 1,
      hasCredential: true,
    },
  ],
  voices: [],
  playback: {
    speed: 1.25,
    pitch: 1,
    skipPageBreaks: true,
    skipFootnotes: false,
    announceContext: false,
  },
}

jest.mock("expo-audio", () => ({
  useAudioPlayer: (source: string | null) => mockUseAudioPlayer(source),
  useAudioPlayerStatus: () => ({
    didJustFinish: false,
    error: null,
    isLoaded: true,
  }),
}))

jest.mock("expo-speech", () => ({
  speak: jest.fn(),
  stop: () => mockSpeechStop(),
}))

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => undefined | (() => void)) =>
    mockReact.useEffect(callback, [callback]),
}))

jest.mock("@my-reader/readium", () => ({
  tts: { getSystemVoices: jest.fn().mockResolvedValue([]) },
}))

jest.mock("@react-native-community/slider", () =>
  jest.fn(() => mockReact.createElement(mockView)),
)

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: { resolvedLanguage: "en", language: "en" },
  }),
}))

jest.mock("@/src/components", () => ({
  Button: jest.fn(
    ({
      accessibilityLabel,
      children,
      onPress,
      title,
    }: {
      accessibilityLabel?: string
      children?: mockReact.ReactNode
      onPress?: () => void
      title?: string
    }) =>
      mockReact.createElement(
        mockPressable,
        { accessibilityLabel, accessibilityRole: "button", onPress },
        children ?? mockReact.createElement(mockText, null, title),
      ),
  ),
  ListMenuRow: jest.fn(
    ({
      title,
      value,
      actions,
      onPressAction,
    }: {
      title: string
      value?: string
      actions?: { id: string; title: string }[]
      onPressAction?: (event: { nativeEvent: { event: string } }) => void
    }) =>
      mockReact.createElement(
        mockView,
        null,
        mockReact.createElement(mockText, null, title),
        value ? mockReact.createElement(mockText, null, value) : null,
        actions?.map((action) =>
          mockReact.createElement(
            mockPressable,
            {
              accessibilityLabel: action.id,
              accessibilityRole: "button",
              key: action.id,
              onPress: () =>
                onPressAction?.({ nativeEvent: { event: action.id } }),
            },
            mockReact.createElement(mockText, null, action.title),
          ),
        ),
      ),
  ),
  ListRow: jest.fn(({ title, value }: { title: string; value?: string }) =>
    mockReact.createElement(
      mockView,
      null,
      mockReact.createElement(mockText, null, title),
      value ? mockReact.createElement(mockText, null, value) : null,
    ),
  ),
  Screen: jest.fn(({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockView, null, children),
  ),
  SectionCard: jest.fn(({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockView, null, children),
  ),
  SectionLabel: jest.fn(({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockText, null, children),
  ),
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    backgroundSecondary: "#eee",
    border: "#ddd",
    borderStrong: "#ccc",
    primary: "#c4622d",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
  }),
}))

jest.mock("@/src/services/core/tts", () => ({
  getTtsConfig: jest.fn().mockResolvedValue(mockProviderConfig),
  setTtsDefaultEngine: jest.fn(),
  setTtsPlayback: jest.fn(),
  setTtsVoice: jest.fn(),
  synthesizeTts: jest.fn(),
}))

jest.mock("@/src/services/fs/path", () => ({
  toFileUri: (path: string) => `file://${path}`,
}))

jest.mock("@/tw", () => ({
  Text: mockText,
  View: mockView,
}))

describe("TtsSettingsScreen preview", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPlaybackRate = 1
    jest.mocked(getTtsConfig).mockResolvedValue(mockProviderConfig)
    jest.mocked(synthesizeTts).mockResolvedValue({
      path: "/tmp/preview.mp3",
      mimeType: "audio/mpeg",
      timings: [],
    })
  })

  it.each([
    undefined,
    1.5,
  ])("previews with the selected provider, voice and artifact playback rate %s", async (playbackRate) => {
    jest.mocked(synthesizeTts).mockResolvedValue({
      path: "/tmp/preview.mp3",
      mimeType: "audio/mpeg",
      timings: [],
      playbackRate,
    })
    render(<TtsSettingsScreen />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText("✓ reader-voice · Multilingual")).toBeTruthy()

    const action = await screen.findByRole("button", {
      name: "settings.tts.previewAction",
    })
    fireEvent.press(action)

    await waitFor(() =>
      expect(synthesizeTts).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "openai",
          voiceId: "reader-voice",
          speed: 1.25,
          text: "settings.tts.previewText",
          language: "en",
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    )
    await waitFor(() =>
      expect(mockUseAudioPlayer).toHaveBeenLastCalledWith(
        "file:///tmp/preview.mp3",
      ),
    )
    expect(mockAudioPlayer.replace).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(showAlertWithStatusBarRestore).not.toHaveBeenCalled()
      expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1)
    })
    expect(mockAudioPlayer.play).toHaveReturnedWith(playbackRate ?? 1)
    expect(screen.queryByText("settings.tts.volume")).toBeNull()
    expect(screen.queryByText("settings.tts.followText")).toBeNull()
  })

  it("cancels an in-flight provider preview from the unified control", async () => {
    jest.mocked(synthesizeTts).mockImplementation(() => new Promise(() => {}))
    render(<TtsSettingsScreen />)
    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.press(
      await screen.findByRole("button", {
        name: "settings.tts.previewAction",
      }),
    )
    const generating = await screen.findByRole("button", {
      name: "settings.tts.previewGenerating",
    })
    const signal = jest.mocked(synthesizeTts).mock.calls[0]?.[1]?.signal

    fireEvent.press(generating)

    expect(signal?.aborted).toBe(true)
    expect(mockAudioPlayer.pause).not.toHaveBeenCalled()
    expect(mockAudioPlayer.replace).not.toHaveBeenCalled()
  })

  it("switches to a provider without a confirmation or refresh action", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue({
      ...mockProviderConfig,
      defaultEngine: { kind: "system" },
    })
    jest.mocked(setTtsDefaultEngine).mockResolvedValue(mockProviderConfig)

    render(<TtsSettingsScreen />)

    fireEvent.press(
      await screen.findByRole("button", {
        name: "engine:provider:openai",
      }),
    )

    await waitFor(() =>
      expect(setTtsDefaultEngine).toHaveBeenCalledWith({
        kind: "provider",
        profileId: "openai",
      }),
    )
    expect(showAlertWithStatusBarRestore).not.toHaveBeenCalled()
    expect(screen.queryByText("settings.tts.refreshVoices")).toBeNull()
  })
})
