import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query"
import * as llm from "@/src/services/core/llm"
import * as narration from "@/src/services/core/narration"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import type { MobileTtsConfig } from "@/src/services/core/tts"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import type { Library } from "@my-reader/tools/types/library"
import LlmSettingsScreen from "./llm-settings-screen"
import LlmProviderFormScreen from "./llm-provider-form-screen"
import { BookNarrationSettings } from "../reader/components/reader/chrome/BookNarrationSettings"

const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }
const mockHeader = jest.fn((_options: unknown) => ({
  options: {},
  toolbar: null,
}))
let mockParams: { providerId?: string } = {}
jest.mock("expo-router", () => ({
  router: {
    push: (route: unknown) => mockRouter.push(route),
    back: () => mockRouter.back(),
    dismissTo: (route: unknown) => mockRouter.dismissTo(route),
  },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}))
jest.mock("@/src/navigation/hooks/use-screen-header", () => ({
  useScreenHeader: (options: unknown) => mockHeader(options),
}))

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/tw", () => {
  const rn = jest.requireActual("react-native")
  return { Text: rn.Text, TextInput: rn.TextInput, View: rn.View }
})
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))
jest.mock("@/src/i18n/error-message", () => ({
  errorMessage: (error: Error) => error.message,
}))
jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))
jest.mock("@my-reader/readium", () => ({
  tts: {
    getSystemVoices: jest
      .fn()
      .mockResolvedValue([{ id: "system-a", name: "System A" }]),
  },
}))
jest.mock("@/src/services/core/tts", () => ({
  listTtsVoices: jest
    .fn()
    .mockResolvedValue([{ id: "voice-a", name: "Voice A" }]),
}))
jest.mock("@/src/services/core/llm", () => ({
  getLlmConfig: jest.fn(),
  saveLlmProvider: jest.fn(),
  removeLlmProfile: jest.fn(),
  selectLlmProfile: jest.fn(),
  listLlmModels: jest.fn(),
  probeLlmProfile: jest.fn(),
}))
jest.mock("@/src/services/core/narration", () => ({
  getBookNarration: jest.fn(),
  saveBookNarration: jest.fn(),
  importBookCharacters: jest.fn(),
  previewBookNarrationMerge: jest.fn(),
  mergeBookNarration: jest.fn(),
}))
jest.mock("@/src/components", () => {
  const React = jest.requireActual("react")
  const { Pressable, Text, View } = jest.requireActual("react-native")
  const Button = ({ children, title, disabled, onPress }: any) =>
    React.createElement(
      Pressable,
      {
        accessibilityRole: "button",
        accessibilityState: { disabled: Boolean(disabled) },
        disabled,
        onPress,
      },
      children ?? React.createElement(Text, null, title),
    )
  const Row = ({ title, onPress, children, label }: any) =>
    React.createElement(
      View,
      null,
      React.createElement(Button, { title: title ?? label, onPress }),
      children,
    )
  const Menu = ({ title, actions, onPressAction }: any) =>
    React.createElement(
      View,
      { testID: title },
      actions.map((action: any) =>
        React.createElement(Button, {
          key: action.id,
          title: `${title}:${action.id}`,
          onPress: () => onPressAction({ nativeEvent: { event: action.id } }),
        }),
      ),
    )
  return {
    ...jest.requireActual("@/test/fixtures/form-controls"),
    ...jest.requireActual("@/src/components/ui/form-input-row"),
    ...jest.requireActual("@/src/components/ui/form-switch"),
    Button,
    Screen: View,
    SectionCard: View,
    SectionLabel: Text,
    IconButton: ({ label, onPress, disabled, ...props }: any) =>
      React.createElement(Button, {
        ...props,
        title: label,
        label,
        onPress,
        disabled,
      }),
    RoundIconButton: ({ label, onPress }: any) =>
      React.createElement(Button, { title: label, onPress }),
    FormLabeledFieldRow: Row,
    FormFieldSwitch: jest.requireActual("react-native").Switch,
    ListRow: Row,
    ListMenuRow: Menu,
  }
})
jest.mock("../reader/components/reader/chrome/ReaderTtsSettingsFields", () => {
  const React = jest.requireActual("react")
  const { Pressable, Text, TextInput, View } =
    jest.requireActual("react-native")
  return {
    ProviderTextField: ({ label, ...props }: any) =>
      React.createElement(TextInput, { ...props, accessibilityLabel: label }),
    ReaderTtsMenuRow: ({ title, actions, onSelect }: any) =>
      React.createElement(
        View,
        null,
        actions.map((action: any) =>
          React.createElement(
            Pressable,
            { key: action.id, onPress: () => onSelect(action.id) },
            React.createElement(Text, null, `${title}:${action.id}`),
          ),
        ),
      ),
  }
})
const profile: llm.LlmProfile = {
  id: "p",
  name: "Provider",
  protocol: "chatCompletions",
  endpoint: "http://localhost/v1",
  model: "model",
  contextWindow: 32768,
  revision: 1,
  hasCredential: true,
}
const config: llm.LlmSettings = {
  profiles: [profile],
  providers: [
    {
      ...profile,
      models: [
        {
          id: profile.id,
          model: profile.model,

          contextWindow: profile.contextWindow,
        },
      ],
    },
  ],
  defaultProfileId: "p",
}
const narrator: narration.BookCharacter = {
  id: "narrator",
  name: "Narrator",
  nicknames: [],
  description: "",
  instructions: "",
}
const alice: narration.BookCharacter = {
  id: "stable-alice",
  name: "Alice",
  nicknames: ["A"],
  description: "manual identity",
  instructions: "gentle",
  voice: { engine: "provider", profileId: "tts-a", voiceId: "voice-a" },
}
const settings: narration.BookNarrationSettings = {
  bookId: 7,
  enabled: true,
  revision: 2,
  scopeId: "book:fixture",
  mergeSources: [],
  identityRevision: 1,
  characters: [narrator, alice],
}
const book = {
  library: { id: "library" } as Library,
  bookId: 7,
  title: "Novel",
  authors: ["Writer"],
  language: "en",
}
const tts = {
  profiles: [
    { id: "tts-a", name: "A" },
    { id: "tts-b", name: "B" },
  ],
} as MobileTtsConfig
const clients: QueryClient[] = []
beforeAll(() => notifyManager.setNotifyFunction((notify) => act(notify)))
afterAll(() => notifyManager.setNotifyFunction((notify) => notify()))
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
})
function mount(kind: "settings" | "form" | "reader" = "settings") {
  const ui =
    kind === "reader" ? (
      reader()
    ) : kind === "form" ? (
      <LlmProviderFormScreen />
    ) : (
      <LlmSettingsScreen />
    )
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  clients.push(client)
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function headerAction(label: string) {
  const actions = (
    mockHeader.mock.calls.at(-1)![0] as {
      right: { label: string; onPress: () => void }[]
    }
  ).right
  act(() => actions.find((action) => action.label === label)!.onPress())
}

const onSubviewChange = jest.fn()
function reader() {
  return (
    <BookNarrationSettings
      book={book}
      onSubviewChange={onSubviewChange}
      config={tts}
      palette={{} as ReaderChromePalette}
    />
  )
}
beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  jest.mocked(llm.getLlmConfig).mockResolvedValue(config)
  jest.mocked(llm.saveLlmProvider).mockResolvedValue(config)
  jest
    .mocked(llm.removeLlmProfile)
    .mockResolvedValue({ ...config, profiles: [] })
  jest.mocked(llm.selectLlmProfile).mockResolvedValue(config)
  jest.mocked(llm.listLlmModels).mockResolvedValue(["discovered"])
  jest.mocked(llm.probeLlmProfile).mockResolvedValue(undefined)
  jest.mocked(narration.getBookNarration).mockResolvedValue(settings)
  jest
    .mocked(narration.saveBookNarration)
    .mockImplementation(async (_library, value) => value)
})
it("reloads providers from Core when the cache contains the old flat profile schema", async () => {
  mockParams = { providerId: "p" }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  clients.push(client)
  client.setQueryData(["llm-settings"], {
    profiles: [profile],
    defaultProfileId: profile.id,
  })
  render(
    <QueryClientProvider client={client}>
      <LlmProviderFormScreen />
    </QueryClientProvider>,
  )
  await screen.findByLabelText("providerEditor.modelId")
  expect(screen.getByLabelText("providerEditor.modelId").props.value).toBe(
    "model",
  )
  expect(llm.getLlmConfig).toHaveBeenCalledTimes(1)
})

it("preserves each model when switching and saves one provider with multiple models", async () => {
  mockParams = { providerId: "p" }
  mount("form")
  await screen.findByLabelText("providerEditor.modelId")
  fireEvent.press(screen.getByText("aiProviders.addModel"))
  fireEvent.changeText(
    screen.getByTestId("provider-model-id-1"),
    "second-model",
  )
  expect(screen.queryByLabelText("llm.context")).toBeNull()
  fireEvent.press(screen.getByText("providerEditor.modelDetails second-model"))
  fireEvent.changeText(screen.getByLabelText("llm.context"), "65536")
  fireEvent.press(screen.getByText("providerEditor.modelDetails model"))
  expect(screen.getByLabelText("llm.context").props.value).toBe("32768")
  expect(screen.getByDisplayValue("second-model")).toBeTruthy()
  fireEvent.press(screen.getByText("providerEditor.modelDetails second-model"))
  expect(screen.getByLabelText("llm.context").props.value).toBe("65536")
  expect(screen.getByDisplayValue("model")).toBeTruthy()
  headerAction("llm.save")
  await waitFor(() =>
    expect(llm.saveLlmProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          id: "p",
          models: [
            { id: "p", model: "model", contextWindow: 32768 },
            expect.objectContaining({
              model: "second-model",
              contextWindow: 65536,
            }),
          ],
        }),
      }),
      expect.anything(),
    ),
  )
})

it("accepts only integer digits for token limits and requires a model ID before saving", async () => {
  mount("form")
  fireEvent.changeText(screen.getByLabelText("llm.name"), "Local")
  headerAction("llm.save")
  expect(llm.saveLlmProvider).not.toHaveBeenCalled()
  fireEvent.changeText(
    screen.getByLabelText("providerEditor.modelId"),
    "manual",
  )
  fireEvent.press(screen.getByText("providerEditor.modelDetails manual"))
  fireEvent.changeText(
    screen.getByLabelText("providerEditor.maxOutput"),
    "4096",
  )
  for (const value of [
    "abc",
    "1e4",
    "-8192",
    "8192.5",
    "12345678901234567890",
  ]) {
    fireEvent.changeText(screen.getByLabelText("llm.context"), value)
    fireEvent.changeText(
      screen.getByLabelText("providerEditor.maxOutput"),
      value,
    )
  }
  expect(screen.getByLabelText("llm.context").props.value).toBe("32768")
  expect(screen.getByLabelText("providerEditor.maxOutput").props.value).toBe(
    "4096",
  )
  fireEvent.changeText(screen.getByLabelText("llm.context"), "")
  expect(screen.getByLabelText("llm.context").props.value).toBe("")
  headerAction("llm.save")
  expect(llm.saveLlmProvider).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByLabelText("llm.context"), "65536")
  fireEvent.changeText(screen.getByLabelText("providerEditor.maxOutput"), "")
  headerAction("llm.save")
  await waitFor(() =>
    expect(llm.saveLlmProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          models: [
            expect.objectContaining({
              model: "manual",
              contextWindow: 65536,
              maxOutputTokens: undefined,
            }),
          ],
        }),
      }),
      expect.anything(),
    ),
  )
})

it("saves a manually entered model without discovery, and clears connection success after changing the draft", async () => {
  mount("form")
  fireEvent.changeText(screen.getByLabelText("llm.name"), "Local")
  fireEvent.changeText(
    screen.getByLabelText("providerEditor.modelId"),
    "manual-model",
  )
  fireEvent.changeText(screen.getByLabelText("llm.key"), "secret")
  fireEvent.press(screen.getByText("llm.test"))
  await screen.findByText("llm.testPassed")
  fireEvent.changeText(
    screen.getByLabelText("providerEditor.modelId"),
    "manual-model-2",
  )
  expect(screen.queryByText("llm.testPassed")).toBeNull()
  headerAction("llm.save")
  await waitFor(() =>
    expect(llm.saveLlmProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          models: [expect.objectContaining({ model: "manual-model-2" })],
        }),
        credential: "secret",
      }),
      expect.anything(),
    ),
  )
  expect(llm.listLlmModels).not.toHaveBeenCalled()
})
it("edits without revealing saved keys, discovers models, and returns to the sheet list after saving", async () => {
  mockParams = { providerId: "p" }
  mount("form")
  await screen.findByLabelText("llm.key")
  expect(screen.getByLabelText("llm.key").props.value).toBe("")
  fireEvent.press(screen.getByText("providerEditor.fetchModels"))
  fireEvent.press(await screen.findByText("discovered"))
  fireEvent.press(screen.getByText("providerEditor.addSelected"))
  fireEvent.press(screen.getByText("providerEditor.modelDetails discovered"))
  fireEvent.press(screen.getByText("llm.protocol:responses"))
  fireEvent.changeText(screen.getByLabelText("llm.context"), "65536")
  fireEvent(screen.getByLabelText("llm.clearKey"), "valueChange", true)
  headerAction("llm.save")
  await waitFor(() =>
    expect(llm.saveLlmProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        clearCredential: true,
        provider: expect.objectContaining({
          id: "p",
          protocol: "responses",
          models: [
            expect.objectContaining({ model: "model" }),
            expect.objectContaining({
              model: "discovered",
              contextWindow: 65536,
            }),
          ],
        }),
      }),
      expect.anything(),
    ),
  )
  expect(mockRouter.dismissTo).toHaveBeenCalledWith("/llm-providers")
})

it("opens provider forms in the sheet stack and keeps selection on its list page", async () => {
  mount()
  fireEvent.press(await screen.findByText("Provider"))
  expect(mockRouter.push).toHaveBeenLastCalledWith({
    pathname: "/llm-providers/form",
    params: { providerId: "p" },
  })
  expect(screen.queryByLabelText("llm.key")).toBeNull()
  expect(mockHeader).toHaveBeenLastCalledWith(
    expect.objectContaining({ close: { variant: "layout" }, back: "hidden" }),
  )
  fireEvent.press(screen.getByText("llm.add"))
  expect(mockRouter.push).toHaveBeenLastCalledWith("/llm-providers/form")
  fireEvent.press(screen.getByText("llm.default:none"))
  await waitFor(() => expect(llm.selectLlmProfile).toHaveBeenCalled())
})

it("uses a back button and confirms deletion before removing the provider", async () => {
  mockParams = { providerId: "p" }
  mount("form")
  await screen.findByLabelText("llm.key")
  expect(screen.queryByText("llm.cancel")).toBeNull()
  expect(mockHeader.mock.calls.at(-1)?.[0]).not.toHaveProperty("close")
  const right = (
    mockHeader.mock.calls.at(-1)![0] as { right: { label: string }[] }
  ).right
  expect(right.map((action) => action.label)).toEqual([
    "rowActions.delete",
    "llm.save",
  ])
  headerAction("rowActions.delete")
  expect(llm.removeLlmProfile).not.toHaveBeenCalled()
  const remove = jest
    .mocked(showAlertWithStatusBarRestore)
    .mock.calls.at(-1)![2]!
    .find((button) => button.style === "destructive")!
  jest.mocked(llm.removeLlmProfile).mockRejectedValueOnce(new Error("offline"))
  act(() => remove.onPress?.())
  await screen.findByText("offline")
  expect(mockRouter.dismissTo).not.toHaveBeenCalled()
  headerAction("rowActions.delete")
  act(() =>
    jest
      .mocked(showAlertWithStatusBarRestore)
      .mock.calls.at(-1)![2]!
      .find((button) => button.style === "destructive")!
      .onPress?.(),
  )
  await waitFor(() =>
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/llm-providers"),
  )
})
it("shows role controls only after enabling a book with a configured LLM and acceptance", async () => {
  const completeSave: ((value: narration.BookNarrationSettings) => void)[] = []
  jest
    .mocked(narration.saveBookNarration)
    .mockImplementation(
      () => new Promise((resolve) => completeSave.push(resolve)),
    )
  jest
    .mocked(narration.getBookNarration)
    .mockResolvedValue({ ...settings, enabled: false })
  jest
    .mocked(llm.getLlmConfig)
    .mockResolvedValueOnce({ ...config, defaultProfileId: undefined })
  mount("reader")
  const toggle = await screen.findByLabelText("narration.enabled")
  expect(screen.queryByText("narration.import")).toBeNull()
  fireEvent(toggle, "valueChange", true)
  await screen.findByText("narration.llmRequired")
  expect(narration.saveBookNarration).not.toHaveBeenCalled()
  fireEvent(toggle, "valueChange", true)
  await waitFor(() => expect(showAlertWithStatusBarRestore).toHaveBeenCalled())
  const buttons = jest.mocked(showAlertWithStatusBarRestore).mock.calls[0]![2]!
  await act(async () => buttons[1]!.onPress?.())
  await waitFor(() => expect(completeSave).toHaveLength(1))
  await waitFor(() =>
    expect(screen.getByLabelText("narration.enabled")).toHaveProp(
      "disabled",
      true,
    ),
  )
  expect(screen.queryByText("narration.import")).toBeNull()
  await act(async () => completeSave[0]!({ ...settings, enabled: true }))
  await screen.findByText("narration.import")
  await waitFor(() =>
    expect(screen.getByLabelText("narration.enabled")).toHaveProp(
      "disabled",
      false,
    ),
  )
  fireEvent(screen.getByLabelText("narration.enabled"), "valueChange", false)
  await waitFor(() =>
    expect(narration.saveBookNarration).toHaveBeenLastCalledWith(
      book.library,
      expect.objectContaining({ enabled: false }),
    ),
  )
  await waitFor(() => expect(completeSave).toHaveLength(2))
  await act(async () => completeSave[1]!({ ...settings, enabled: false }))
  await waitFor(() => expect(screen.queryByText("narration.import")).toBeNull())
})
it("preserves a character ID, resets voice after provider changes and saves fixed instructions", async () => {
  mount("reader")
  fireEvent.press(await screen.findByText("Alice"))
  fireEvent.changeText(screen.getByLabelText("narration.name"), "Alice edited")
  fireEvent.changeText(screen.getByLabelText("narration.nicknames"), "A， Ally")
  fireEvent.changeText(
    screen.getByLabelText("narration.description"),
    "same person",
  )
  fireEvent.press(screen.getByText("narration.provider:tts-b"))
  fireEvent.press(screen.getByText("llm.save"))
  expect(llm.saveLlmProvider).not.toHaveBeenCalled()
  fireEvent.press(await screen.findByText("narration.voice:voice-a"))
  fireEvent.changeText(
    screen.getByLabelText("narration.instructions"),
    "soft male voice",
  )
  fireEvent.press(screen.getByText("llm.save"))
  await waitFor(() =>
    expect(narration.saveBookNarration).toHaveBeenCalledWith(
      book.library,
      expect.objectContaining({
        characters: [
          narrator,
          expect.objectContaining({
            id: "stable-alice",
            nicknames: ["A", "Ally"],
            instructions: "soft male voice",
            voice: {
              engine: "provider",
              profileId: "tts-b",
              voiceId: "voice-a",
            },
          }),
        ],
      }),
    ),
  )
  fireEvent.press(await screen.findByText("narration.add"))
  fireEvent.changeText(screen.getByLabelText("narration.name"), "New")
  fireEvent.press(screen.getByText("narration.provider:system"))
  expect(screen.queryByLabelText("narration.instructions")).toBeNull()
  fireEvent.press(await screen.findByText("narration.voice:system-a"))
  fireEvent.press(screen.getByText("llm.save"))
  await screen.findByText("New")
  fireEvent.press(screen.getByText("Alice edited"))
  fireEvent.press(screen.getByText("narration.delete"))
  await waitFor(() => expect(screen.queryByText("Alice edited")).toBeNull())
})
it("imports selected sourced candidates without overwriting manually edited identities", async () => {
  const source = {
    title: "Encyclopedia",
    url: "https://en.wikipedia.org/wiki/Novel",
  }
  jest.mocked(narration.importBookCharacters).mockResolvedValue([
    { name: "A", nicknames: [], description: "overwrite", source },
    { name: "Bob", nicknames: [], description: "friend", source },
    { name: "Skip", nicknames: [], description: "skip", source },
  ])
  mount("reader")
  fireEvent.press(await screen.findByText("narration.import"))
  await screen.findByText("Bob")
  fireEvent(screen.getByLabelText("Skip"), "valueChange", false)
  fireEvent.press(screen.getByText("narration.importSelected"))
  await waitFor(() =>
    expect(narration.saveBookNarration).toHaveBeenCalledWith(
      book.library,
      expect.objectContaining({
        characters: [
          narrator,
          alice,
          expect.objectContaining({ name: "Bob", source }),
        ],
      }),
    ),
  )
  expect(narration.importBookCharacters).toHaveBeenCalledWith(book.library, {
    bookId: 7,
    title: "Novel",
    authors: ["Writer"],
    language: "en",
  })
})

it("identifies narrator and named role editing and returns to the character list", async () => {
  mount("reader")
  fireEvent.press(await screen.findByText("narration.narrator"))
  expect(onSubviewChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: "narration.narrator" }),
  )
  expect(screen.queryByLabelText("narration.enabled")).toBeNull()
  act(() => onSubviewChange.mock.calls.at(-1)![0].onBack())
  fireEvent.press(screen.getByText("Alice"))
  expect(onSubviewChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: "Alice" }),
  )
  expect(screen.getByLabelText("narration.name")).toHaveProp("value", "Alice")
})

it("reviews a series merge and applies only after confirmation", async () => {
  const current = {
    ...settings,
    scopeId: "series",
    mergeSources: [
      {
        scopeId: "book:8",
        title: "Volume 2",
        characters: [{ ...alice, id: "other-alice" }],
      },
    ],
  }
  const plan = {
    scopeId: "series",
    sourceScopeId: "book:8",
    revision: 2,
    choices: [
      {
        characterId: "other-alice",
        targetCharacterId: "stable-alice",
        preferIncoming: false,
      },
    ],
  }
  jest.mocked(narration.getBookNarration).mockResolvedValue(current)
  jest.mocked(narration.previewBookNarrationMerge).mockResolvedValue(plan)
  jest
    .mocked(narration.mergeBookNarration)
    .mockResolvedValue({ ...settings, scopeId: "series", revision: 3 })
  mount("reader")
  fireEvent.press(await screen.findByText("narration.manualMerge"))
  await screen.findByText("Volume 2")
  expect(narration.previewBookNarrationMerge).toHaveBeenCalledWith(
    book.library,
    7,
    false,
  )
  expect(narration.mergeBookNarration).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText("narration.confirmMerge"))
  await waitFor(() =>
    expect(narration.mergeBookNarration).toHaveBeenCalledWith(
      book.library,
      7,
      plan,
    ),
  )
  await screen.findByText("narration.import")
})
