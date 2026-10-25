import {
  act,
  fireEvent,
  render as renderNative,
  screen,
  waitFor,
} from "@testing-library/react-native"
import * as mockReact from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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
  saveTtsProvider,
  testTtsProvider,
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
function render(
  ui: mockReact.ComponentProps<typeof QueryClientProvider>["children"],
) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
  })
  return renderNative(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  )
}
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
  FormFieldSwitch: jest.requireActual("react-native").Switch,
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
  saveTtsProvider: jest.fn(),
  testTtsProvider: jest.fn(),
}))

jest.mock("@/tw", () => ({
  Text: mockText,
  TextInput: mockTextInput,
  View: mockView,
}))

describe("TtsProviderProfileScreen", () => {
  async function chooseModel(index: number, name: string) {
    const choose = jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation(() => {})
    await waitFor(() => {
      fireEvent.press(screen.getByTestId("tts-provider-model"))
      expect(choose).toHaveBeenLastCalledWith(
        expect.objectContaining({ options: expect.arrayContaining([name]) }),
        expect.any(Function),
      )
    })
    act(() => choose.mock.calls.at(-1)?.[1](index))
    choose.mockRestore()
  }

  function saveForm() {
    const header = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      right?: { onPress: () => void }[]
    }
    act(() => header.right?.[0]?.onPress())
  }

  it("keeps an unsaved form open until valid voices are persisted", async () => {
    renderForm()
    saveForm()
    expect(saveTtsProvider).not.toHaveBeenCalled()
    fireEvent.changeText(
      screen.getByTestId("tts-provider-voices"),
      " voice-a\nvoice-a\nvoice-b ",
    )
    jest.mocked(saveTtsProvider).mockRejectedValueOnce(new Error("offline"))
    saveForm()
    await waitFor(() => expect(showErrorAlert).toHaveBeenCalled())
    expect(mockRouterDismissTo).not.toHaveBeenCalled()
    expect(screen.getByTestId("tts-provider-voices").props.value).toContain(
      "voice-b",
    )
    saveForm()
    await waitFor(() =>
      expect(mockRouterDismissTo).toHaveBeenCalledWith("/tts-providers"),
    )
    expect(saveTtsProvider).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          voices: ["voice-a", "voice-b"],
          models: [expect.objectContaining({ defaultVoice: "voice-a" })],
        }),
      }),
    )
  })

  it("requires confirmation and successful persistence before leaving a deleted provider", async () => {
    mockRouteParams = { providerId: "fixture-provider" }
    jest.mocked(getTtsConfig).mockResolvedValue({
      providers: [
        {
          id: "fixture-provider",
          kind: "openAiCompatible",
          name: "Fixture",
          endpoint: "http://127.0.0.1:5050/v1",
          models: [
            {
              id: "fixture-model",
              model: "fixture",
              responseFormat: "mp3",
              defaultVoice: "voice-a",
              voices: [],
            },
          ],
          responseFormat: "mp3",
          voices: ["voice-a"],
          defaultVoice: "voice-a",
          enabled: true,
          hasCredential: true,
        },
      ],
    } as never)
    render(<TtsProviderProfileScreen />)
    await screen.findByRole("button", { name: "ttsSettings.test" })
    jest.mocked(testTtsProvider).mockResolvedValue(undefined)
    fireEvent.press(screen.getByRole("button", { name: "ttsSettings.test" }))
    await screen.findByText("ttsSettings.testSucceeded")
    expect(testTtsProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ id: "fixture-provider" }),
      }),
      expect.any(String),
      expect.anything(),
    )
    expect(saveTtsProvider).not.toHaveBeenCalled()
    saveForm() // The detail header opens the editor.
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
      expect(mockRouterDismissTo).toHaveBeenCalledWith("/tts-providers"),
    )
    expect(removeTtsProfile).toHaveBeenLastCalledWith("fixture-provider")
  })
  it("tests current form values without persisting and clears stale results after editing", async () => {
    jest.mocked(testTtsProvider).mockResolvedValue(undefined)
    renderForm()
    fireEvent.changeText(
      screen.getByTestId("tts-provider-endpoint"),
      "https://draft.example/v1",
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-credential"),
      "draft-key",
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-voices"),
      "custom-voice",
    )
    fireEvent.press(screen.getByRole("button", { name: "ttsSettings.test" }))
    await screen.findByText("ttsSettings.testSucceeded")
    expect(testTtsProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          endpoint: "https://draft.example/v1",
          defaultVoice: "custom-voice",
        }),
        credential: "draft-key",
      }),
      "settings.tts.previewText",
      expect.anything(),
    )
    expect(saveTtsProvider).not.toHaveBeenCalled()
    expect(mockRouterDismissTo).not.toHaveBeenCalled()
    fireEvent.changeText(
      screen.getByTestId("tts-provider-model"),
      "other-model",
    )
    expect(screen.queryByText("ttsSettings.testSucceeded")).toBeNull()
    jest.mocked(testTtsProvider).mockRejectedValueOnce(new Error("invalid key"))
    fireEvent.press(screen.getByRole("button", { name: "ttsSettings.test" }))
    await screen.findByText(/invalid key/)
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
    jest.mocked(saveTtsProvider).mockResolvedValue({} as never)
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
  ])("creates the %s source with a discovered model and manually entered system voice", async (id, endpoint, voice) => {
    renderForm(id)
    expect(screen.queryByLabelText("aiProviders.modelScopedVoices")).toBeNull()
    expect(screen.getByTestId("tts-provider-endpoint").props.value).toBe(
      endpoint,
    )
    expect(
      screen.getByTestId("tts-provider-credential").props.placeholder,
    ).toBe(`qwenTts.sources.${id}.credential`)
    expect(screen.queryByTestId("tts-provider-audio-format")).toBeNull()
    expect(screen.queryByTestId("tts-provider-voices")).toBeNull()
    expect(screen.queryByText("qwenTts.modelHint")).toBeNull()
    saveForm()
    expect(saveTtsProvider).not.toHaveBeenCalled()
    fireEvent.changeText(screen.getByTestId("tts-provider-credential"), "key")
    await chooseModel(0, "Qwen-Audio-TTS Plus")
    fireEvent.press(
      screen.getByRole("button", { name: "qwenTts.manualVoicesAction" }),
    )
    fireEvent.changeText(screen.getByTestId("tts-provider-voices"), voice)
    jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementationOnce((_options, callback) => callback(0))
    fireEvent.press(screen.getByTestId("tts-provider-default-voice"))
    const header = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      right?: { onPress: () => void }[]
    }
    act(() => header.right?.[0]?.onPress())
    await waitFor(() =>
      expect(saveTtsProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            kind: "qwen",
            name: `qwenTts.sources.${id}.title`,
            endpoint,
            models: [
              expect.objectContaining({
                defaultVoice: voice,
                model: "qwen-audio-3.0-tts-plus",
                responseFormat: "mp3",
              }),
            ],
          }),
        }),
      ),
    )
    expect(mockRouterDismissTo).toHaveBeenCalledWith("/tts-providers")
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
    expect(screen.queryByText("龙安灵心")).toBeNull()
  })

  it("loads account voices for the selected Qwen model and saves the chosen voice", async () => {
    jest
      .mocked(discoverQwenTtsVoices)
      .mockResolvedValue([
        { id: "my-cloned-voice", name: "my-cloned-voice", language: "zh" },
      ])
    renderForm("tokenPlan")
    expect(screen.getByTestId("tts-provider-endpoint").props.value).toBe(
      "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-endpoint"),
      "https://dashscope.aliyuncs.com/api/v1",
    )
    fireEvent.changeText(screen.getByTestId("tts-provider-credential"), "key")
    await chooseModel(2, "Qwen3-TTS VC")
    await waitFor(() =>
      expect(discoverQwenTtsVoices).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "qwen3-tts-vc-2026-01-22",
          credential: "key",
        }),
        expect.any(AbortSignal),
      ),
    )
    jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementationOnce((_options, callback) => callback(0))
    fireEvent.press(screen.getByTestId("tts-provider-default-voice"))
    expect(screen.getByText("my-cloned-voice")).toBeTruthy()
    const header = mockUseScreenHeader.mock.calls.at(-1)?.[0] as {
      right?: { onPress: () => void }[]
    }
    act(() => header.right?.[0]?.onPress())
    await waitFor(() =>
      expect(saveTtsProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            kind: "qwen",
            models: [
              expect.objectContaining({
                model: "qwen3-tts-vc-2026-01-22",
                responseFormat: "wav",
                defaultVoice: "my-cloned-voice",
                voices: ["my-cloned-voice"],
              }),
            ],
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
      pathname: "/tts-providers/form",
      params,
    })
    expect(screen.getByText("settings.tts.providerTypeSection")).toBeTruthy()
    expect(screen.queryByTestId("tts-provider-endpoint")).toBeNull()
  })

  it("shares OpenAI voices across models while preserving each model's instructions", async () => {
    renderForm()
    fireEvent.changeText(
      screen.getByTestId("tts-provider-voices"),
      "voice-a\nvoice-b",
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-instructions"),
      "First instructions",
    )
    fireEvent.press(
      screen.getByRole("button", { name: "aiProviders.addModel" }),
    )
    fireEvent.changeText(screen.getByTestId("tts-provider-model"), "second-tts")
    fireEvent.changeText(
      screen.getByTestId("tts-provider-default-voice"),
      "voice-b",
    )
    fireEvent.changeText(
      screen.getByTestId("tts-provider-instructions"),
      "Second instructions",
    )
    fireEvent.press(screen.getByRole("button", { name: "gpt-4o-mini-tts" }))
    expect(screen.getByTestId("tts-provider-instructions").props.value).toBe(
      "First instructions",
    )
    expect(screen.getByTestId("tts-provider-default-voice").props.value).toBe(
      "voice-a",
    )
    saveForm()
    await waitFor(() =>
      expect(saveTtsProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            voices: ["voice-a", "voice-b"],
            models: [
              expect.objectContaining({
                model: "gpt-4o-mini-tts",
                defaultVoice: "voice-a",
                voices: [],
                instructions: "First instructions",
              }),
              expect.objectContaining({
                model: "second-tts",
                defaultVoice: "voice-b",
                voices: [],
                instructions: "Second instructions",
              }),
            ],
          }),
        }),
      ),
    )
  })

  it("switches between shared and model-specific voice lists without losing voices or defaults", async () => {
    renderForm()
    fireEvent.changeText(screen.getByTestId("tts-provider-voices"), "voice-a")
    fireEvent.press(
      screen.getByRole("button", { name: "aiProviders.addModel" }),
    )
    fireEvent.changeText(screen.getByTestId("tts-provider-model"), "second-tts")
    fireEvent(
      screen.getByLabelText("aiProviders.modelScopedVoices"),
      "valueChange",
      true,
    )
    expect(screen.getByTestId("tts-provider-voices").props.value).toBe(
      "voice-a",
    )
    fireEvent.changeText(screen.getByTestId("tts-provider-voices"), "voice-b")
    fireEvent.press(screen.getByRole("button", { name: "gpt-4o-mini-tts" }))
    expect(screen.getByTestId("tts-provider-voices").props.value).toBe(
      "voice-a",
    )
    expect(screen.getByTestId("tts-provider-default-voice").props.value).toBe(
      "voice-a",
    )
    fireEvent(
      screen.getByLabelText("aiProviders.modelScopedVoices"),
      "valueChange",
      false,
    )
    expect(screen.getByTestId("tts-provider-voices").props.value).toBe(
      "voice-a\nvoice-b",
    )
    fireEvent.press(screen.getByRole("button", { name: "second-tts" }))
    expect(screen.getByTestId("tts-provider-default-voice").props.value).toBe(
      "voice-b",
    )
    saveForm()
    await waitFor(() =>
      expect(saveTtsProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            modelScopedVoices: false,
            voices: ["voice-a", "voice-b"],
          }),
        }),
      ),
    )
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
      expect(saveTtsProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.objectContaining({
            models: [expect.objectContaining({ responseFormat: "mp3" })],
          }),
        }),
      ),
    )
  })
})
