import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as tts from "@/src/services/core/tts"
import {
  showAlertWithStatusBarRestore,
  showErrorAlert,
} from "@/src/constants/alert-with-status-bar"
import TtsProviderProfileScreen from "./tts-provider-profile-screen"

const mockTranslate = (key: string) => key
const mockRouter = { back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() }
const mockHeader = jest.fn((options: unknown) => ({ options, toolbar: null }))
let mockParams: { kind?: string; sourceId?: string; providerId?: string } = {}
const mockPlayer = { play: jest.fn(), setPlaybackRate: jest.fn() }
jest.mock("expo-audio", () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ isLoaded: true }),
}))
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: {
    back: () => mockRouter.back(),
    push: (href: unknown) => mockRouter.push(href),
    dismissTo: (href: unknown) => mockRouter.dismissTo(href),
  },
  useLocalSearchParams: () => mockParams,
}))
jest.mock("@expo/vector-icons/MaterialIcons", () => "Icon")
jest.mock("expo-crypto", () => {
  let next = 0
  return { randomUUID: () => `model-${++next}` }
})
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockTranslate }),
}))
jest.mock("@/tw", () => {
  const rn = jest.requireActual("react-native")
  return { Text: rn.Text, TextInput: rn.TextInput, View: rn.View }
})
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))
jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: (options: unknown) => mockHeader(options),
}))
jest.mock("@/src/navigation/toolbar-action-helpers", () => ({
  createSaveAction: (action: unknown) => action,
}))
jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
  showErrorAlert: jest.fn(),
}))
jest.mock("@/src/i18n/error-message", () => ({
  errorMessage: (error: Error) => error.message,
}))
jest.mock("@/src/services/core/tts", () => ({
  ...jest.requireActual("@/test/fixtures/qwen-tts"),
  getQwenTtsModels: jest.fn(),
  discoverTtsModels: jest.fn(),
  discoverQwenTtsVoices: jest.fn(),
  getTtsConfig: jest.fn(),
  saveTtsProvider: jest.fn(),
  removeTtsProfile: jest.fn(),
  previewTtsProvider: jest.fn(),
}))
jest.mock("@/src/components", () => {
  const React = jest.requireActual("react")
  const { Pressable, Text, View, Switch } = jest.requireActual("react-native")
  const Button = ({
    title,
    label,
    accessibilityLabel,
    disabled,
    onPress,
  }: any) =>
    React.createElement(
      Pressable,
      {
        accessibilityRole: "button",
        accessibilityLabel: accessibilityLabel || label || title,
        accessibilityState: { disabled },
        disabled,
        onPress,
      },
      React.createElement(Text, null, title || label),
    )
  const Row = ({ title, label, detail, onPress, children }: any) =>
    React.createElement(
      View,
      null,
      React.createElement(Button, { title, label, onPress }),
      detail ? React.createElement(Text, null, detail) : null,
      children,
    )
  return {
    ...jest.requireActual("@/test/fixtures/form-controls"),
    ...jest.requireActual("@/src/components/ui/form-input-row"),
    ...jest.requireActual("@/src/components/ui/form-switch"),
    Button,
    IconButton: ({ label, onPress, disabled, ...props }: any) =>
      React.createElement(Button, {
        ...props,
        title: label,
        label,
        onPress,
        disabled,
      }),
    RoundIconButton: Button,
    ListRow: Row,
    FormLabeledFieldRow: ({ label, children }: any) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, label),
        children,
      ),
    FormFieldSwitch: Switch,
    Screen: View,
    SectionCard: View,
    SectionLabel: Text,
    ListMenuRow: ({ title, actions, onPressAction }: any) =>
      React.createElement(
        View,
        null,
        actions.map((action: any) =>
          React.createElement(Button, {
            key: action.id,
            title: `${title}:${action.id}`,
            onPress: () => onPressAction({ nativeEvent: { event: action.id } }),
          }),
        ),
      ),
  }
})
const clients: QueryClient[] = []
function mount(params = { kind: "openAiCompatible" }) {
  mockParams = params
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <TtsProviderProfileScreen />
    </QueryClientProvider>,
  )
}
function save() {
  act(() =>
    (
      mockHeader.mock.calls.at(-1)![0] as { right: { onPress: () => void }[] }
    ).right
      .at(-1)!
      .onPress(),
  )
}
function addVoice(id: string) {
  const existing = screen
    .queryAllByLabelText("providerEditor.voiceId")
    .find((input) => input.props.value === "")
  if (existing) fireEvent.changeText(existing, id)
  else {
    fireEvent.press(screen.getByText("providerEditor.addVoice"))
    fireEvent.changeText(
      screen.getAllByLabelText("providerEditor.voiceId").at(-1)!,
      id,
    )
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(tts.saveTtsProvider).mockResolvedValue({} as never)
  jest
    .mocked(tts.discoverQwenTtsVoices)
    .mockResolvedValue([{ id: "account", language: "zh" }])
  jest.mocked(tts.getQwenTtsModels).mockResolvedValue([
    {
      id: "qwen-new",
      audioFormats: ["wav"],
      supportsInstructions: true,
      voiceDiscovery: true,
      voices: [{ id: "preset", language: "zh" }],
    },
  ])
  jest.mocked(tts.previewTtsProvider).mockResolvedValue({
    path: "/cache/voice.wav",
    mimeType: "audio/wav",
    timings: [],
  })
})
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
})

it("persists model and voice IDs, keeps a failed draft open, and exposes only per-voice previews", async () => {
  mount()
  expect(mockHeader.mock.calls.at(-1)?.[0]).not.toHaveProperty("close")
  fireEvent.changeText(
    screen.getByLabelText("providerEditor.modelId"),
    "custom-model",
  )
  addVoice("custom-voice")
  expect(
    screen.getByLabelText("settings.tts.previewAction custom-voice"),
  ).toBeTruthy()
  expect(screen.queryByText("settings.tts.defaultVoice")).toBeNull()
  expect(screen.queryByText("settings.tts.instructions")).toBeNull()
  expect(screen.queryByText("ttsSettings.test")).toBeNull()
  expect(screen.queryByText("aiProviders.endpointHint")).toBeNull()
  jest.mocked(tts.saveTtsProvider).mockRejectedValueOnce(new Error("offline"))
  save()
  await waitFor(() => expect(showErrorAlert).toHaveBeenCalled())
  expect(mockRouter.dismissTo).not.toHaveBeenCalled()
  expect(screen.getByLabelText("providerEditor.voiceId").props.value).toBe(
    "custom-voice",
  )
  save()
  await waitFor(() =>
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/tts-providers"),
  )
  expect(tts.saveTtsProvider).toHaveBeenLastCalledWith(
    expect.objectContaining({
      provider: expect.objectContaining({
        models: [
          expect.objectContaining({
            model: "custom-model",
            defaultVoice: "custom-voice",
          }),
        ],
      }),
    }),
  )
})

it("keeps model fields visible and expands voices only in model-scoped mode", () => {
  mount()
  const details = "providerEditor.modelDetails gpt-4o-mini-tts"
  expect(screen.queryByLabelText(details)).toBeNull()
  addVoice("alloy")
  fireEvent(
    screen.getByLabelText("aiProviders.modelScopedVoices"),
    "valueChange",
    true,
  )
  expect(screen.getByDisplayValue("alloy")).toBeTruthy()
  fireEvent.press(screen.getByLabelText(details))
  expect(screen.queryByDisplayValue("alloy")).toBeNull()
  expect(screen.getByDisplayValue("gpt-4o-mini-tts")).toBeTruthy()
  fireEvent.press(screen.getByLabelText(details))
  expect(screen.getByDisplayValue("alloy")).toBeTruthy()
  fireEvent(
    screen.getByLabelText("aiProviders.modelScopedVoices"),
    "valueChange",
    false,
  )
  expect(screen.queryByLabelText(details)).toBeNull()
  expect(screen.getByDisplayValue("alloy")).toBeTruthy()
})

it("blocks saving blank model and voice IDs in either voice scope", async () => {
  mount()
  fireEvent.changeText(screen.getByLabelText("providerEditor.modelId"), " ")
  save()
  expect(tts.saveTtsProvider).not.toHaveBeenCalled()
  fireEvent.changeText(
    screen.getByLabelText("providerEditor.modelId"),
    "manual",
  )
  addVoice(" ")
  save()
  expect(tts.saveTtsProvider).not.toHaveBeenCalled()
  fireEvent(
    screen.getByLabelText("aiProviders.modelScopedVoices"),
    "valueChange",
    true,
  )
  save()
  expect(tts.saveTtsProvider).not.toHaveBeenCalled()
  fireEvent.changeText(
    screen.getByLabelText("providerEditor.voiceId"),
    "future-voice",
  )
  save()
  await waitFor(() => expect(tts.saveTtsProvider).toHaveBeenCalled())
})

it.each([
  "tokenPlan",
  "qianwen",
  "dashscope",
])("fetches %s models explicitly and imports both preset and account voices", async (sourceId) => {
  mount({ kind: "qwen", sourceId } as never)
  expect(tts.getQwenTtsModels).not.toHaveBeenCalled()
  fireEvent.changeText(
    screen.getByTestId("tts-provider-credential"),
    "draft-key",
  )
  fireEvent.press(screen.getByText("providerEditor.fetchModels"))
  fireEvent.press(await screen.findByText("qwen-new"))
  fireEvent.press(screen.getByText("providerEditor.addSelected"))
  await screen.findByDisplayValue("account")
  expect(screen.getByDisplayValue("preset")).toBeTruthy()
  fireEvent.changeText(screen.getByDisplayValue("preset"), "future-voice")
  save()
  await waitFor(() =>
    expect(tts.saveTtsProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          models: [
            expect.objectContaining({
              model: "qwen-new",
              voices: ["future-voice", "account"],
            }),
          ],
        }),
      }),
    ),
  )
})

it("supports manually entering future model and voice IDs without fetching catalogs", async () => {
  mount({ kind: "qwen", sourceId: "dashscope" } as never)
  expect(screen.getAllByLabelText("providerEditor.modelId")).toHaveLength(1)
  expect(screen.getAllByLabelText("providerEditor.voiceId")).toHaveLength(1)
  fireEvent.changeText(
    screen.getByLabelText("providerEditor.modelId"),
    "qwen-future",
  )
  addVoice("new-voice")
  save()
  await waitFor(() => expect(tts.saveTtsProvider).toHaveBeenCalled())
  expect(tts.getQwenTtsModels).not.toHaveBeenCalled()
  expect(tts.discoverQwenTtsVoices).not.toHaveBeenCalled()
})

it("previews unsaved voice IDs with current credentials and surfaces API failures", async () => {
  mount()
  fireEvent.changeText(
    screen.getByTestId("tts-provider-credential"),
    "draft-key",
  )
  fireEvent.changeText(
    screen.getByTestId("tts-provider-endpoint"),
    "https://draft.example/v1",
  )
  addVoice("unknown-voice")
  jest
    .mocked(tts.previewTtsProvider)
    .mockRejectedValueOnce(new Error("VoiceNotFound"))
  fireEvent.press(
    screen.getByLabelText("settings.tts.previewAction unknown-voice"),
  )
  await screen.findByText("VoiceNotFound")
  fireEvent.press(
    screen.getByLabelText("settings.tts.previewAction unknown-voice"),
  )
  await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled())
  expect(tts.previewTtsProvider).toHaveBeenCalledWith(
    expect.objectContaining({
      credential: "draft-key",
      profile: expect.objectContaining({
        endpoint: "https://draft.example/v1",
        defaultVoice: "unknown-voice",
      }),
    }),
    "settings.tts.previewText",
    expect.any(AbortSignal),
  )
  expect(tts.saveTtsProvider).not.toHaveBeenCalled()
})

it("discards fetched models after the endpoint changes", async () => {
  let resolve!: (models: string[]) => void
  jest.mocked(tts.discoverTtsModels).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  mount()
  fireEvent.press(screen.getByText("providerEditor.fetchModels"))
  await waitFor(() => expect(tts.discoverTtsModels).toHaveBeenCalled())
  const signal = jest.mocked(tts.discoverTtsModels).mock.calls[0]![1]!
  fireEvent.changeText(
    screen.getByTestId("tts-provider-endpoint"),
    "https://other.example/v1",
  )
  await act(async () => resolve(["stale-model"]))
  expect(signal.aborted).toBe(true)
  expect(screen.queryByText("stale-model")).toBeNull()
})

it("requires confirmation and successful persistence before leaving a deleted provider", async () => {
  jest.mocked(tts.getTtsConfig).mockResolvedValue({
    providers: [
      {
        id: "p",
        name: "Saved",
        kind: "openAiCompatible",
        endpoint: "http://localhost/v1",
        hasCredential: true,
        modelScopedVoices: false,
        voices: ["v"],

        models: [
          {
            id: "m",
            model: "tts",

            responseFormat: "mp3",
            voices: [],

            defaultVoice: "v",
          },
        ],
      },
    ],
  } as never)
  mount({ providerId: "p" } as never)
  await screen.findByLabelText("settings.tts.previewAction v")
  await screen.findByTestId("tts-provider-name")
  act(() =>
    (
      mockHeader.mock.calls.at(-1)![0] as { right: { onPress: () => void }[] }
    ).right[0]!.onPress(),
  )
  expect(tts.removeTtsProfile).not.toHaveBeenCalled()
  const remove = jest
    .mocked(showAlertWithStatusBarRestore)
    .mock.calls.at(-1)![2]!
    .find((button) => button.style === "destructive")!
  jest.mocked(tts.removeTtsProfile).mockRejectedValueOnce(new Error("storage"))
  await act(async () => remove.onPress?.())
  await waitFor(() => expect(showErrorAlert).toHaveBeenCalled())
  expect(mockRouter.dismissTo).not.toHaveBeenCalled()
  jest.mocked(tts.removeTtsProfile).mockResolvedValue({} as never)
  await act(async () => remove.onPress?.())
  await waitFor(() =>
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/tts-providers"),
  )
})
