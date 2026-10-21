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
  discoverQwenTtsVoices,
  getTtsConfig,
  removeTtsProfile,
  upsertTtsProfile,
} from "@/src/services/core/tts"
import {
  showAlertWithStatusBarRestore,
  showErrorAlert,
} from "@/src/constants/alert-with-status-bar"
import TtsProviderProfileScreen from "./tts-provider-profile-screen"

const mockRouterBack = jest.fn()
const mockRouterPush = jest.fn()
const mockRouterDismissTo = jest.fn()
let mockRouteParams: { kind?: string; sourceId?: string; providerId?: string } =
  {}
const mockTranslate = (key: string) => key
const mockUseScreenHeader = jest.fn((options: unknown) => ({
  options,
  toolbar: null,
}))

jest.mock("expo-router", () => ({
  Stack: { Screen: jest.fn(() => null) },
  router: {
    back: () => mockRouterBack(),
    push: (href: unknown) => mockRouterPush(href),
    dismissTo: (href: unknown) => mockRouterDismissTo(href),
  },
  useLocalSearchParams: () => mockRouteParams,
}))

jest.mock("react-i18next", () => ({
  ...jest.requireActual("react-i18next"),
  useTranslation: () => ({ t: mockTranslate }),
}))

jest.mock("@react-native-menu/menu", () => ({
  MenuView: mockView,
}))

jest.mock("@/src/components", () => ({
  Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
    mockReact.createElement(
      mockPressable,
      { accessibilityRole: "button", accessibilityLabel: title, onPress },
      mockReact.createElement(mockText, null, title),
    ),
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
  showErrorAlert: jest.fn(),
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
  function saveForm() {
    const header = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      right?: { onPress: () => void }[]
    }
    act(() => header.right?.[0]?.onPress())
  }

  it("keeps an unsaved form open until valid voices are persisted", async () => {
    renderForm()
    saveForm()
    expect(upsertTtsProfile).not.toHaveBeenCalled()
    fireEvent.changeText(
      screen.getByTestId("tts-provider-voices"),
      " voice-a\nvoice-a\nvoice-b ",
    )
    jest.mocked(upsertTtsProfile).mockRejectedValueOnce(new Error("offline"))
    saveForm()
    await waitFor(() => expect(showErrorAlert).toHaveBeenCalled())
    expect(mockRouterDismissTo).not.toHaveBeenCalled()
    expect(screen.getByTestId("tts-provider-voices").props.value).toContain(
      "voice-b",
    )
    saveForm()
    await waitFor(() =>
      expect(mockRouterDismissTo).toHaveBeenCalledWith("/settings/tts"),
    )
    expect(upsertTtsProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          voices: ["voice-a", "voice-b"],
          defaultVoice: "voice-a",
        }),
      }),
    )
  })

  it("requires confirmation and successful persistence before leaving a deleted provider", async () => {
    mockRouteParams = { providerId: "fixture-provider" }
    jest.mocked(getTtsConfig).mockResolvedValue({
      profiles: [
        {
          id: "fixture-provider",
          kind: "openAiCompatible",
          name: "Fixture",
          endpoint: "http://127.0.0.1:5050/v1",
          model: "fixture",
          responseFormat: "mp3",
          voices: ["voice-a"],
          defaultVoice: "voice-a",
          enabled: true,
          hasCredential: true,
        },
      ],
    } as never)
    render(<TtsProviderProfileScreen />)
    await waitFor(() =>
      expect(screen.getByTestId("tts-provider-name").props.value).toBe(
        "Fixture",
      ),
    )
    fireEvent.press(
      screen.getByRole("button", { name: "settings.tts.removeProvider" }),
    )
    expect(removeTtsProfile).not.toHaveBeenCalled()
    const buttons = jest
      .mocked(showAlertWithStatusBarRestore)
      .mock.calls.at(-1)?.[2]
    jest
      .mocked(removeTtsProfile)
      .mockRejectedValueOnce(new Error("storage unavailable"))
    await act(async () =>
      buttons?.find((button) => button.style === "destructive")?.onPress?.(),
    )
    await waitFor(() => expect(showErrorAlert).toHaveBeenCalled())
    expect(mockRouterDismissTo).not.toHaveBeenCalled()
    jest.mocked(removeTtsProfile).mockResolvedValue({} as never)
    await act(async () =>
      buttons?.find((button) => button.style === "destructive")?.onPress?.(),
    )
    await waitFor(() =>
      expect(mockRouterDismissTo).toHaveBeenCalledWith("/settings/tts"),
    )
    expect(removeTtsProfile).toHaveBeenLastCalledWith("fixture-provider")
  })
  function renderForm(sourceId?: string) {
    mockRouteParams = sourceId
      ? { kind: "qwen", sourceId }
      : { kind: "openAiCompatible" }
    return render(<TtsProviderProfileScreen />)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockRouteParams = {}
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
    renderForm(id)
    expect(screen.getByTestId("tts-provider-endpoint").props.value).toBe(
      endpoint,
    )
    expect(
      screen.getByTestId("tts-provider-credential").props.placeholder,
    ).toBe(`qwenTts.sources.${id}.credential`)
    expect(screen.queryByTestId("tts-provider-audio-format")).toBeNull()
    expect(screen.queryByTestId("tts-provider-voices")).toBeNull()
    expect(screen.queryByText("qwenTts.modelHint")).toBeNull()
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
            responseFormat: "mp3",
          }),
        }),
      ),
    )
    expect(mockRouterDismissTo).toHaveBeenCalledWith("/settings/tts")
  })

  it("does not reuse credentials or manual voices when selecting a different source", () => {
    const firstForm = renderForm("tokenPlan")
    fireEvent.changeText(
      screen.getByTestId("tts-provider-credential"),
      "sk-sp-fixture",
    )
    fireEvent.press(
      screen.getByRole("button", { name: "qwenTts.manualVoicesAction" }),
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-voices"),
      "subscription-voice",
    )
    firstForm.unmount()
    renderForm("qianwen")
    expect(screen.getByTestId("tts-provider-credential").props.value).toBe("")
    expect(screen.queryByTestId("tts-provider-voices")).toBeNull()
    fireEvent.press(
      screen.getByRole("button", { name: "qwenTts.manualVoicesAction" }),
    )
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
    renderForm("tokenPlan")
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

  it.each([
    [
      "settings.tts.providerKinds.openAiCompatible",
      { kind: "openAiCompatible" },
    ],
    [
      "qwenTts.sources.tokenPlan.title",
      { kind: "qwen", sourceId: "tokenPlan" },
    ],
    ["qwenTts.sources.qianwen.title", { kind: "qwen", sourceId: "qianwen" }],
    [
      "qwenTts.sources.dashscope.title",
      { kind: "qwen", sourceId: "dashscope" },
    ],
  ])("opens %s as a separate form route", (title, params) => {
    render(<TtsProviderProfileScreen />)

    expect(screen.getByText("settings.tts.providerTypeSection")).toBeTruthy()
    expect(screen.queryByTestId("tts-provider-endpoint")).toBeNull()
    fireEvent.press(screen.getByRole("button", { name: title }))
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/settings/tts-provider/form",
      params,
    })
    expect(screen.getByText("settings.tts.providerTypeSection")).toBeTruthy()
    expect(screen.queryByTestId("tts-provider-endpoint")).toBeNull()
  })

  it("saves OpenAI-compatible providers as MP3 without asking for an audio format", async () => {
    renderForm()
    expect(
      screen.queryByRole("button", { name: "settings.tts.audioFormat" }),
    ).toBeNull()
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
          profile: expect.objectContaining({ responseFormat: "mp3" }),
        }),
      ),
    )
  })
})
