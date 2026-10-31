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
  TextInput as mockTextInput,
  View as mockView,
} from "react-native"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import {
  getTtsConfig,
  setTtsDefaultEngine,
  synthesizeTts,
} from "@/src/services/core/tts"
import ReaderTtsSettingsSheet from "./ReaderTtsSettingsSheet"

jest.mock("./BookNarrationSettings", () => ({
  BookNarrationSettings: ({ book, onSubviewChange, children }: any) => {
    const [editing, setEditing] = mockReact.useState(false)
    return mockReact.createElement(
      mockView,
      null,
      book
        ? mockReact.createElement(
            mockPressable,
            {
              accessibilityRole: "button",
              accessibilityLabel: "Edit Alice",
              onPress: () => {
                setEditing(true)
                onSubviewChange({
                  title: "Alice",
                  onBack: () => {
                    setEditing(false)
                    onSubviewChange(null)
                  },
                })
              },
            },
            mockReact.createElement(mockText, null, "Edit Alice"),
          )
        : null,
      editing ? null : children,
    )
  },
}))

let mockPlaybackRate = 1
const mockAudioPlayer = {
  play: jest.fn(() => mockPlaybackRate),
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
const mockSpeechSpeak = jest.fn()
const mockSpeechStop = jest.fn().mockResolvedValue(undefined)
let mockBackGestureOnEnd:
  | ((event: { translationX: number; velocityX: number }) => void)
  | undefined

const mockConfig = {
  schemaVersion: 2,
  providers: [],
  defaultEngine: { kind: "system" as const },
  profiles: [
    {
      id: "openai",
      name: "OpenAI",
      kind: "openAiCompatible" as const,
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
    speed: 1,
    pitch: 1,
    skipPageBreaks: true,
    skipFootnotes: false,
    announceContext: false,
  },
}

jest.mock("@expo/ui/community/bottom-sheet", () => ({
  BottomSheetScrollView: mockView,
  BottomSheetTextInput: mockTextInput,
}))

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))
jest.mock("expo-symbols", () => ({ SymbolView: jest.fn(() => null) }))

jest.mock("expo-audio", () => ({
  useAudioPlayer: (source: string | null) => mockUseAudioPlayer(source),
  useAudioPlayerStatus: () => ({
    didJustFinish: false,
    error: null,
    isLoaded: true,
  }),
}))

jest.mock("expo-speech", () => ({
  speak: (...args: unknown[]) => mockSpeechSpeak(...args),
  stop: () => mockSpeechStop(),
}))

const mockRouterPush = jest.fn()

jest.mock("expo-router", () => ({
  router: { push: (route: string) => mockRouterPush(route) },
  useFocusEffect: (callback: () => void) =>
    mockReact.useEffect(callback, [callback]),
}))

jest.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Pan: jest.fn(() => {
      const gesture: Record<string, jest.Mock> = {}
      for (const method of [
        "activeOffsetX",
        "enabled",
        "failOffsetX",
        "failOffsetY",
        "hitSlop",
        "runOnJS",
      ]) {
        gesture[method] = jest.fn(() => gesture)
      }
      gesture.onEnd = jest.fn(
        (
          callback: (event: {
            translationX: number
            velocityX: number
          }) => void,
        ) => {
          mockBackGestureOnEnd = callback
          return gesture
        },
      )
      return gesture
    }),
  },
  GestureDetector: ({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockView, null, children),
}))

jest.mock("@my-reader/readium", () => ({
  tts: {
    getSystemVoices: jest
      .fn()
      .mockResolvedValue([
        { id: "system-voice", name: "System Voice", language: "en" },
      ]),
  },
}))

jest.mock("@react-native-menu/menu", () => ({
  MenuView: mockView,
}))

jest.mock("@/src/components/ui/ios-select-menu", () => ({
  IosSelectMenu: ({ children }: { children: mockReact.ReactNode }) =>
    mockReact.createElement(mockView, null, children),
}))

jest.mock("react-i18next", () => ({
  ...jest.requireActual("react-i18next"),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "en", language: "en" },
  }),
}))

jest.mock("@/src/services/core/tts", () => ({
  ...jest.requireActual("@/test/fixtures/qwen-tts"),
  discoverQwenTtsVoices: jest.fn().mockResolvedValue([]),
  getTtsConfig: jest.fn().mockResolvedValue(mockConfig),
  removeTtsProfile: jest.fn(),
  setTtsDefaultEngine: jest.fn().mockImplementation(async (engine) => ({
    ...mockConfig,
    defaultEngine: engine,
  })),
  setTtsPlayback: jest.fn(),
  setTtsVoice: jest.fn(),
  synthesizeTts: jest.fn(),
  upsertTtsProfile: jest.fn().mockResolvedValue(mockConfig),
}))

jest.mock("@/src/services/fs/path", () => ({
  toFileUri: (path: string) => `file://${path}`,
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))

jest.mock("@/tw", () => ({
  TouchableHighlight: jest.requireActual("react-native").TouchableHighlight,
  Text: mockText,
  View: mockView,
}))

jest.mock("./ReaderSettingsSheetContainer", () =>
  mockReact.forwardRef(function ReaderSettingsSheetContainerMock(
    {
      children,
      expanded,
      onDismiss,
    }: {
      children: mockReact.ReactNode
      expanded?: boolean
      onDismiss: () => void
    },
    ref: mockReact.Ref<unknown>,
  ) {
    mockReact.useImperativeHandle(ref, () => ({
      dismiss: onDismiss,
      present: jest.fn(),
    }))
    return mockReact.createElement(
      mockView,
      {
        accessibilityState: { expanded: Boolean(expanded) },
        testID: "reader-settings-sheet-container",
      },
      children,
    )
  }),
)

jest.mock("./SettingControls", () => ({
  SegmentPicker: ({
    label,
    onChange,
    options,
  }: {
    label: string
    onChange: (key: string) => void
    options: { key: string; label: string }[]
  }) =>
    mockReact.createElement(
      mockView,
      null,
      mockReact.createElement(mockText, null, label),
      ...options.map((option) =>
        mockReact.createElement(
          mockPressable,
          {
            accessibilityLabel: option.label,
            accessibilityRole: "button",
            key: option.key,
            onPress: () => onChange(option.key),
          },
          mockReact.createElement(mockText, null, option.label),
        ),
      ),
    ),
  SliderControl: () => null,
}))

const palette: ReaderChromePalette = {
  accent: "#C4622D",
  accentText: "#C4622D",
  actionSurface: "#FFFFFF",
  actionText: "#1C1714",
  bg: "#F7F3EC",
  border: "#D8CEC2",
  handle: "#8B8177",
  progressFill: "#8B4A2C",
  progressText: "#FFFFFF",
  segmentActive: "#F2E2D5",
  segmentIdle: "#EEE8DF",
  sheetSurface: "#F7F3EC",
  sliderTrack: "#D8CEC2",
  stepperBtn: "#E9DED2",
  text: "#1C1714",
  textFaint: "#A79A8E",
  textMuted: "#5C5349",
  tocRowActive: "#F2E2D5",
  tocRowIdle: "#EEE8DF",
}

describe("ReaderTtsSettingsSheet", () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    mockPlaybackRate = 1
    mockBackGestureOnEnd = undefined
    jest.mocked(getTtsConfig).mockResolvedValue(mockConfig)
    jest.mocked(synthesizeTts).mockResolvedValue({
      path: "/tmp/reader-preview.mp3",
      mimeType: "audio/mpeg",
      timings: [],
    })
  })

  it.each([
    undefined,
    1.5,
  ])("opens expanded and previews with the active provider and artifact playback rate %s", async (playbackRate) => {
    jest.mocked(getTtsConfig).mockResolvedValue({
      ...mockConfig,
      defaultEngine: { kind: "provider", profileId: "openai" },
    })
    jest.mocked(synthesizeTts).mockResolvedValue({
      path: "/tmp/reader-preview.mp3",
      mimeType: "audio/mpeg",
      timings: [],
      playbackRate,
    })

    render(<ReaderTtsSettingsSheet language="en" palette={palette} />)

    expect(
      screen.getByTestId("reader-settings-sheet-container").props
        .accessibilityState,
    ).toEqual({ expanded: true })
    expect(screen.queryByText("OpenAI · https://api.openai.com/v1")).toBeNull()

    fireEvent.press(
      await screen.findByRole("button", {
        name: "settings.tts.previewAction",
      }),
    )

    await waitFor(() =>
      expect(synthesizeTts).toHaveBeenCalledWith(
        expect.objectContaining({
          language: "en",
          profileId: "openai",
          text: "settings.tts.previewText",
          voiceId: "reader-voice",
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    )
    await waitFor(() =>
      expect(mockUseAudioPlayer).toHaveBeenLastCalledWith(
        "file:///tmp/reader-preview.mp3",
      ),
    )
    await waitFor(() => {
      expect(showAlertWithStatusBarRestore).not.toHaveBeenCalled()
      expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1)
    })
    expect(mockAudioPlayer.play).toHaveReturnedWith(playbackRate ?? 1)
  })

  it("previews with the selected system voice", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue({
      ...mockConfig,
      voices: [
        {
          language: "en",
          engine: "system",
          voiceId: "system-voice",
        },
      ],
    })

    render(<ReaderTtsSettingsSheet language="en" palette={palette} />)

    fireEvent.press(
      await screen.findByRole("button", {
        name: "settings.tts.previewAction",
      }),
    )

    expect(mockSpeechSpeak).toHaveBeenCalledWith(
      "settings.tts.previewText",
      expect.objectContaining({
        language: "en",
        pitch: 1,
        rate: 1,
        voice: "system-voice",
      }),
    )
  })

  it("cancels an in-flight provider preview", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue({
      ...mockConfig,
      defaultEngine: { kind: "provider", profileId: "openai" },
    })
    jest.mocked(synthesizeTts).mockImplementation(() => new Promise(() => {}))

    render(<ReaderTtsSettingsSheet language="en" palette={palette} />)

    fireEvent.press(
      await screen.findByRole("button", {
        name: "settings.tts.previewAction",
      }),
    )
    const signal = jest.mocked(synthesizeTts).mock.calls[0]?.[1]?.signal

    fireEvent.press(
      await screen.findByRole("button", {
        name: "settings.tts.previewGenerating",
      }),
    )

    expect(signal?.aborted).toBe(true)
  })

  it("dismisses reader settings before presenting the shared provider sheet", async () => {
    const onDismiss = jest.fn()
    render(
      <ReaderTtsSettingsSheet
        language="en"
        palette={palette}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.press(
      await screen.findByRole("button", {
        name: "ttsSettings.manageProviders",
      }),
    )
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(mockRouterPush).toHaveBeenCalledWith("/tts-providers")
    expect(screen.queryByTestId("reader-tts-provider-endpoint")).toBeNull()
    expect(screen.queryByText("settings.tts.addProvider")).toBeNull()
  })

  it("applies a provider engine directly and has no refresh action", async () => {
    render(<ReaderTtsSettingsSheet language="en" palette={palette} />)

    fireEvent.press(
      await screen.findByRole("button", { name: "provider:openai" }),
    )

    await waitFor(() =>
      expect(setTtsDefaultEngine).toHaveBeenCalledWith({
        kind: "provider",
        profileId: "openai",
      }),
    )
    expect(screen.queryByText("settings.tts.refreshVoices")).toBeNull()
  })
})

it("uses the role title and hides playback controls while a character subview is open", async () => {
  const book = {
    library: {
      id: "library",
      name: "Library",
      path: "",
      bookCount: 1,
      sourceType: "local" as const,
    },
    bookId: 7,
    title: "Novel",
    authors: [],
    language: "en",
  }
  render(<ReaderTtsSettingsSheet language="en" palette={palette} book={book} />)
  await screen.findByText("settings.tts.engine")
  fireEvent.press(screen.getByRole("button", { name: "Edit Alice" }))
  expect(screen.getByText("Alice")).toBeTruthy()
  expect(screen.queryByText("settings.tts.engine")).toBeNull()
  expect(screen.queryByText("settings.tts.speed")).toBeNull()
  act(() => mockBackGestureOnEnd?.({ translationX: 80, velocityX: 0 }))
  expect(screen.getByText("settings.tts.engine")).toBeTruthy()
})

// Exercise shared form controls without loading app persistence or native menu surfaces.
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))
jest.mock("@/src/components", () => ({
  ...jest.requireActual("@/src/components/ui/button"),
  ...jest.requireActual("@/src/components/ui/form-slider"),
  ...jest.requireActual("@/test/fixtures/form-controls"),
}))
