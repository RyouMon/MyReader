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
import { BookNarrationSettings } from "../reader/components/reader/chrome/BookNarrationSettings"

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
  upsertLlmProfile: jest.fn(),
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
    Button,
    Screen: View,
    SectionCard: View,
    FormLabeledFieldRow: Row,
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
  defaultProfileId: "p",
}
const narrator: narration.BookCharacter = {
  id: "narrator",
  name: "Narrator",
  aliases: [],
  identity: "",
  instructions: "",
}
const alice: narration.BookCharacter = {
  id: "stable-alice",
  name: "Alice",
  aliases: ["A"],
  identity: "manual identity",
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
    { id: "tts-a", name: "A", enabled: true },
    { id: "tts-b", name: "B", enabled: true },
  ],
} as MobileTtsConfig
const clients: QueryClient[] = []
beforeAll(() => notifyManager.setNotifyFunction((notify) => act(notify)))
afterAll(() => notifyManager.setNotifyFunction((notify) => notify()))
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
})
function mount(kind: "settings" | "reader" = "settings") {
  const ui = kind === "reader" ? reader() : <LlmSettingsScreen />
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  clients.push(client)
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
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
  jest.mocked(llm.getLlmConfig).mockResolvedValue(config)
  jest.mocked(llm.upsertLlmProfile).mockResolvedValue(config)
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
it("saves a manually entered model without discovery, and clears connection success after changing the draft", async () => {
  mount()
  fireEvent.press(await screen.findByText("llm.add"))
  fireEvent.changeText(screen.getByLabelText("llm.name"), "Local")
  fireEvent.changeText(screen.getByLabelText("llm.model"), "manual-model")
  fireEvent.changeText(screen.getByLabelText("llm.key"), "secret")
  fireEvent.press(screen.getByText("llm.test"))
  await screen.findByText("llm.testPassed")
  fireEvent.changeText(screen.getByLabelText("llm.model"), "manual-model-2")
  expect(screen.queryByText("llm.testPassed")).toBeNull()
  fireEvent.press(screen.getByText("llm.save"))
  await waitFor(() =>
    expect(llm.upsertLlmProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ model: "manual-model-2" }),
        credential: "secret",
      }),
      expect.anything(),
    ),
  )
  expect(llm.listLlmModels).not.toHaveBeenCalled()
})
it("edits and probes without revealing saved keys, discovers models, and selects or removes providers", async () => {
  mount()
  fireEvent.press(await screen.findByText("Provider"))
  expect(screen.getByLabelText("llm.key").props.value).toBe("")
  fireEvent.press(screen.getByText("llm.models"))
  fireEvent.press(await screen.findByText("llm.models:discovered"))
  fireEvent.press(screen.getByText("llm.protocol:responses"))
  fireEvent.press(screen.getByText("llm.advanced"))
  fireEvent.changeText(screen.getByLabelText("llm.context"), "65536")
  fireEvent(screen.getByLabelText("llm.clearKey"), "valueChange", true)
  fireEvent.press(screen.getByText("llm.save"))
  await waitFor(() =>
    expect(llm.upsertLlmProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        clearCredential: true,
        profile: expect.objectContaining({
          id: "p",
          protocol: "responses",
          model: "discovered",
          contextWindow: 65536,
        }),
      }),
      expect.anything(),
    ),
  )
  fireEvent.press(await screen.findByText("llm.default:none"))
  await waitFor(() => expect(llm.selectLlmProfile).toHaveBeenCalled())
  fireEvent.press(screen.getByText("Provider"))
  fireEvent.press(screen.getByText("llm.delete"))
  await waitFor(() =>
    expect(llm.removeLlmProfile).toHaveBeenCalledWith("p", expect.anything()),
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
  fireEvent.changeText(screen.getByLabelText("narration.aliases"), "A， Ally")
  fireEvent.changeText(
    screen.getByLabelText("narration.identity"),
    "same person",
  )
  fireEvent.press(screen.getByText("narration.provider:tts-b"))
  expect(screen.getByRole("button", { name: "llm.save" })).toBeDisabled()
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
            aliases: ["A", "Ally"],
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
    { name: "A", aliases: [], identity: "overwrite", source },
    { name: "Bob", aliases: [], identity: "friend", source },
    { name: "Skip", aliases: [], identity: "skip", source },
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
