import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import * as mockReact from "react"
import {
  ActionSheetIOS,
  Pressable as mockPressable,
  Text as mockText,
  TextInput as mockTextInput,
  View as mockView,
} from "react-native"

import {
  upsertTtsProfile,
  discoverQwenTtsVoices,
} from "@/src/services/core/tts"
import TtsProviderProfileScreen from "./tts-provider-profile-screen"

const mockRouterBack = jest.fn()
const mockUseScreenHeader = jest.fn((options: unknown) => ({
  options,
  toolbar: null,
}))

jest.mock("expo-router", () => ({
  Stack: { Screen: jest.fn(() => null) },
  router: { back: mockRouterBack },
  useLocalSearchParams: () => ({}),
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("@react-native-menu/menu", () => ({
  MenuView: mockView,
}))

jest.mock("@/src/components", () => ({
  Button: jest.fn(() => null),
  FormFieldSwitch: jest.fn(() => null),
  FormLabeledFieldRow: jest.fn(
    ({ children, label }: { children: mockReact.ReactNode; label: string }) =>
      mockReact.createElement(
        mockView,
        null,
        mockReact.createElement(mockText, null, label),
        children,
      ),
  ),
  ListRow: jest.fn(
    ({
      detail,
      onPress,
      title,
    }: {
      detail?: string
      onPress?: () => void
      title: string
    }) =>
      mockReact.createElement(
        mockPressable,
        { accessibilityLabel: title, accessibilityRole: "button", onPress },
        mockReact.createElement(mockText, null, title),
        detail ? mockReact.createElement(mockText, null, detail) : null,
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

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    backgroundSecondary: "#eee",
    border: "#ddd",
    danger: "#b00",
    primary: "#c4622d",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
  }),
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))

jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: (options: unknown) => mockUseScreenHeader(options),
}))

jest.mock("@/src/navigation/toolbar-action-helpers", () => ({
  createSaveAction: (action: unknown) => action,
}))

jest.mock("@/src/services/core/tts", () => ({
  ...jest.requireActual("@/test/fixtures/qwen-tts"),
  discoverQwenTtsVoices: jest.fn(),
  getTtsConfig: jest.fn(),
  removeTtsProfile: jest.fn(),
  upsertTtsProfile: jest.fn(),
}))

jest.mock("@/tw", () => ({
  Text: mockText,
  TextInput: mockTextInput,
  View: mockView,
}))

describe("TtsProviderProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(upsertTtsProfile).mockResolvedValue({} as never)
    jest.mocked(discoverQwenTtsVoices).mockResolvedValue([])
  })

  it.each([
    [
      "tokenPlan",
      "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
      "longanhuan_v3.6",
    ],
    ["qianwen", "https://maas.qianwenaiapi.com/api/v1", "longanlingxin"],
    ["dashscope", "https://dashscope.aliyuncs.com/api/v1", "longanlingxin"],
  ])("creates the %s source with its own defaults and credential hint", async (id, endpoint, voice) => {
    render(<TtsProviderProfileScreen />)
    fireEvent.press(
      screen.getByRole("button", { name: `qwenTts.sources.${id}.title` }),
    )
    expect(screen.getByTestId("tts-provider-endpoint").props.value).toBe(
      endpoint,
    )
    expect(
      screen.getByTestId("tts-provider-credential").props.placeholder,
    ).toBe(`qwenTts.sources.${id}.credential`)
    const header = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      right?: { onPress: () => void }[]
    }
    act(() => header.right?.[0]?.onPress())
    await waitFor(() =>
      expect(upsertTtsProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            kind: "qwen",
            name: `qwenTts.sources.${id}.title`,
            endpoint,
            defaultVoice: voice,
            model: "qwen-audio-3.0-tts-plus",
          }),
        }),
      ),
    )
  })

  it("does not reuse credentials or manual voices when selecting a different source", () => {
    render(<TtsProviderProfileScreen />)
    fireEvent.press(
      screen.getByRole("button", { name: "qwenTts.sources.tokenPlan.title" }),
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-credential"),
      "sk-sp-fixture",
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-voices"),
      "subscription-voice",
    )
    const header = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      left?: { onPress: () => void }[]
    }
    act(() => header.left?.[0]?.onPress())
    fireEvent.press(
      screen.getByRole("button", { name: "qwenTts.sources.qianwen.title" }),
    )
    expect(screen.getByTestId("tts-provider-credential").props.value).toBe("")
    expect(screen.getByTestId("tts-provider-voices").props.value).toBe("")
    expect(screen.getByText("龙安灵心")).toBeTruthy()
  })

  it("loads account voices for the selected Qwen model and saves the chosen voice", async () => {
    jest
      .mocked(discoverQwenTtsVoices)
      .mockResolvedValue([
        { id: "my-cloned-voice", name: "my-cloned-voice", language: "zh" },
      ])
    const choose = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions")
    render(<TtsProviderProfileScreen />)
    fireEvent.press(
      screen.getByRole("button", { name: "qwenTts.sources.tokenPlan.title" }),
    )
    expect(screen.getByText("龙安欢")).toBeTruthy()
    expect(screen.getByTestId("tts-provider-endpoint").props.value).toBe(
      "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-endpoint"),
      "https://dashscope.aliyuncs.com/api/v1",
    )
    choose.mockImplementationOnce((_options, callback) => callback(2))
    fireEvent.press(screen.getByTestId("tts-provider-model"))
    expect(screen.queryByText("龙安欢")).toBeNull()
    fireEvent.changeText(screen.getByTestId("tts-provider-credential"), "key")
    await waitFor(() =>
      expect(discoverQwenTtsVoices).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "qwen3-tts-vc-2026-01-22",
          credential: "key",
        }),
        expect.any(AbortSignal),
      ),
    )
    choose.mockImplementationOnce((_options, callback) => callback(0))
    fireEvent.press(screen.getByTestId("tts-provider-default-voice"))
    expect(screen.getByText("my-cloned-voice")).toBeTruthy()
    const header = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      right?: { onPress: () => void }[]
    }
    act(() => header.right?.[0]?.onPress())
    await waitFor(() =>
      expect(upsertTtsProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            kind: "qwen",
            model: "qwen3-tts-vc-2026-01-22",
            responseFormat: "wav",
            defaultVoice: "my-cloned-voice",
            voices: ["my-cloned-voice"],
          }),
        }),
      ),
    )
  })

  it("adds a provider through type selection and a dedicated form step", () => {
    render(<TtsProviderProfileScreen />)

    expect(screen.getByText("settings.tts.providerTypeSection")).toBeTruthy()
    expect(
      screen.getByRole("button", {
        name: "settings.tts.providerKinds.openAiCompatible",
      }),
    ).toBeTruthy()
    expect(screen.queryByTestId("tts-provider-endpoint")).toBeNull()

    fireEvent.press(
      screen.getByRole("button", {
        name: "settings.tts.providerKinds.openAiCompatible",
      }),
    )

    expect(screen.getByTestId("tts-provider-endpoint")).toBeTruthy()
    expect(screen.getByTestId("tts-provider-model")).toBeTruthy()
    const formHeader = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      left?: { onPress: () => void }[]
      title?: string
    }
    expect(formHeader.title).toBe("settings.tts.addOpenAi")

    act(() => formHeader.left?.[0]?.onPress())

    expect(screen.getByText("settings.tts.providerTypeSection")).toBeTruthy()
    expect(screen.queryByTestId("tts-provider-endpoint")).toBeNull()
    expect(mockRouterBack).not.toHaveBeenCalled()
  })

  it("saves the selected OpenAI-compatible audio format", async () => {
    jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation((_options, callback) => callback(3))
    render(<TtsProviderProfileScreen />)

    fireEvent.press(
      screen.getByRole("button", {
        name: "settings.tts.providerKinds.openAiCompatible",
      }),
    )
    fireEvent.press(
      screen.getByRole("button", { name: "settings.tts.audioFormat" }),
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-voices"),
      "custom-voice",
    )
    const formHeader = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      right?: { onPress: () => void }[]
    }

    act(() => formHeader.right?.[0]?.onPress())

    await waitFor(() =>
      expect(upsertTtsProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({ responseFormat: "flac" }),
        }),
      ),
    )
  })
})
