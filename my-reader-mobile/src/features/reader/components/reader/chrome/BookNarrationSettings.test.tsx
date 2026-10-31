import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react-native"
import * as mockReact from "react"
import {
  Pressable as mockPressable,
  Text as mockText,
  TextInput as mockTextInput,
  View as mockView,
} from "react-native"
import type { Library } from "@my-reader/tools/types/library"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
import type { MobileTtsConfig } from "@/src/services/core/tts"
import { BookNarrationSettings } from "./BookNarrationSettings"

const mockSave = jest.fn()
const mockListVoices = jest.fn()
jest.mock("@/src/domain/llm/use-book-narration", () => ({
  useBookNarration: () => ({
    query: {
      data: {
        bookId: 1,
        enabled: true,
        mergeSources: [],
        characters: [
          {
            id: "narrator",
            name: "Narrator",
            nicknames: [],
            description: "",
            instructions: "",
          },
          {
            id: "alice",
            name: "Alice",
            nicknames: [],
            description: "",
            instructions: "Softly",
          },
        ],
      },
    },
    save: { mutate: mockSave },
    importCharacters: {},
    previewMerge: {},
    merge: {},
  }),
}))
jest.mock("@/src/services/core/tts", () => ({
  listTtsVoices: (...args: unknown[]) => mockListVoices(...args),
}))
jest.mock("@/src/services/core/llm", () => ({ getLlmConfig: jest.fn() }))
jest.mock("@my-reader/readium", () => ({
  tts: {
    getSystemVoices: () =>
      Promise.resolve([{ id: "system-voice", name: "System Voice" }]),
  },
}))
jest.mock("react-i18next", () => ({
  ...jest.requireActual("react-i18next"),
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/components", () => ({
  FormSwitch: () => null,
  Button: ({
    title,
    onPress,
    disabled,
  }: {
    title: string
    onPress: () => void
    disabled: boolean
  }) =>
    mockReact.createElement(
      mockPressable,
      {
        accessibilityRole: "button",
        accessibilityLabel: title,
        disabled,
        onPress,
      },
      mockReact.createElement(mockText, null, title),
    ),
}))
jest.mock("@/tw", () => ({
  View: mockView,
  Text: mockText,
  Pressable: mockPressable,
  TouchableHighlight: jest.requireActual("react-native").TouchableHighlight,
}))
jest.mock("./NarrationMergeEditor", () => ({
  NarrationMergeEditor: () => null,
}))
jest.mock("./ReaderTtsSettingsFields", () => ({
  ProviderTextField: ({
    value,
    onChangeText,
    testID,
  }: {
    value: string
    onChangeText: (text: string) => void
    testID: string
  }) => mockReact.createElement(mockTextInput, { value, onChangeText, testID }),
  ReaderTtsMenuRow: ({
    title,
    value,
    actions,
    onSelect,
  }: {
    title: string
    value: string
    actions: { id: string; title: string }[]
    onSelect: (id: string) => void
  }) =>
    mockReact.createElement(
      mockView,
      null,
      mockReact.createElement(mockText, { testID: title }, value),
      ...actions.map((action) =>
        mockReact.createElement(
          mockPressable,
          {
            key: action.id,
            testID: `${title}-${action.id}`,
            onPress: () => onSelect(action.id),
          },
          mockReact.createElement(mockText, null, action.title),
        ),
      ),
    ),
}))

const config: MobileTtsConfig = {
  schemaVersion: 2,
  providers: [],
  defaultEngine: { kind: "provider", profileId: "one" },
  voices: [],
  playback: {
    speed: 1,
    pitch: 1,
    skipPageBreaks: false,
    skipFootnotes: false,
    announceContext: false,
  },
  profiles: ["one", "two"].map((id) => ({
    id,
    name: id,
    model: "tts",
    kind: "openAiCompatible",
    endpoint: "https://example.com/v1",
    voices: ["A"],
    responseFormat: "mp3",
    revision: 1,
    hasCredential: false,
  })),
}

beforeEach(() => {
  jest.clearAllMocks()
  mockListVoices.mockResolvedValue([{ id: "A", language: "zh" }])
})

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: Infinity } },
        })
      }
    >
      <BookNarrationSettings
        book={{
          library: { id: "library" } as Library,
          bookId: 1,
          title: "Book",
          authors: [],
          language: "zh",
        }}
        config={config}
        readingVoice={{ engine: "provider", profileId: "one", voiceId: "A" }}
        palette={{} as ReaderChromePalette}
      />
    </QueryClientProvider>,
  )
}

it("keeps an unconfigured character on the default model without saving a fixed voice", () => {
  mount()
  fireEvent.press(screen.getByRole("button", { name: "narration.edit" }))
  fireEvent.press(screen.getByRole("button", { name: "Alice" }))
  expect(screen.getByTestId("narration.provider")).toHaveTextContent(
    "narration.defaultModel",
  )
  expect(screen.queryByTestId("narration.voice")).toBeNull()
  expect(screen.getByTestId("narration.provider-default")).toBeTruthy()
  expect(screen.queryByTestId("narration.voice-default")).toBeNull()
  fireEvent.press(screen.getByRole("button", { name: "llm.save" }))
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      characters: expect.arrayContaining([
        expect.objectContaining({
          id: "alice",
        }),
      ]),
    }),
    expect.any(Object),
  )
  expect(
    mockSave.mock.calls[0][0].characters.find(
      (character: { id: string }) => character.id === "alice",
    ).voice,
  ).toBeUndefined()
})

it.each([
  "two",
  "system",
])("requires a concrete voice after switching to %s", async (model) => {
  mount()
  fireEvent.press(screen.getByRole("button", { name: "narration.edit" }))
  fireEvent.press(screen.getByRole("button", { name: "Alice" }))
  fireEvent.press(screen.getByTestId(`narration.provider-${model}`))
  expect(screen.getByRole("button", { name: "llm.save" })).toBeDisabled()
  expect(screen.getByTestId("narration.voice")).toHaveTextContent("")
  expect(screen.queryByTestId("narration.voice-default")).toBeNull()
  fireEvent.press(
    await screen.findByTestId(
      `narration.voice-${model === "system" ? "system-voice" : "A"}`,
    ),
  )
  expect(screen.getByRole("button", { name: "llm.save" })).not.toBeDisabled()
  fireEvent.press(screen.getByTestId("narration.provider-default"))
  expect(screen.queryByTestId("narration.voice")).toBeNull()
  fireEvent.press(screen.getByRole("button", { name: "llm.save" }))
  expect(
    mockSave.mock.calls[0][0].characters.find(
      (character: { id: string }) => character.id === "alice",
    ).voice,
  ).toBeUndefined()
})

const mockStopPreview = jest.fn()
const mockPreviewOptions = jest.fn()
jest.mock("@/src/features/reader/tts/use-reader-tts-preview", () => ({
  useReaderTtsPreview: (options: unknown) => {
    mockPreviewOptions(options)
    return {
      canPreview: true,
      state: "idle",
      start: jest.fn(),
      stop: mockStopPreview,
    }
  },
}))
jest.mock("@expo/ui/community/bottom-sheet", () => ({
  BottomSheetScrollView: jest.requireActual("react-native").ScrollView,
  BottomSheetTextInput: jest.requireActual("react-native").TextInput,
}))
jest.mock("@/src/components/streaming-status-line", () => ({
  StreamingStatusLine: ({ label, text }: any) =>
    jest
      .requireActual("react")
      .createElement(
        jest.requireActual("react-native").Text,
        null,
        text || label,
      ),
}))
jest.mock("@/src/components/ui/native-select-menu", () => ({
  NativeSelectMenu: ({ children, actions, onSelect }: any) => {
    const React = jest.requireActual("react")
    const { View, Pressable, Text } = jest.requireActual("react-native")
    const [open, setOpen] = React.useState(false)
    return React.createElement(
      View,
      null,
      children(() => setOpen(true)),
      open
        ? actions.map((action: any) =>
            React.createElement(
              Pressable,
              {
                key: action.id,
                accessibilityRole: "button",
                accessibilityLabel: action.title,
                disabled: action.attributes?.disabled,
                onPress: () => {
                  setOpen(false)
                  onSelect(action.id)
                },
              },
              React.createElement(Text, null, action.title),
            ),
          )
        : null,
    )
  },
}))

it("previews the inherited reader voice with draft instructions and cancels without saving", () => {
  mount()
  fireEvent.press(screen.getByRole("button", { name: "narration.edit" }))
  fireEvent.press(screen.getByRole("button", { name: "Alice" }))
  fireEvent.changeText(screen.getByTestId("narration-instructions"), "gentle")
  expect(mockPreviewOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({
        defaultEngine: { kind: "provider", profileId: "one" },
      }),
      voiceId: "A",
      instructions: "gentle",
    }),
  )
  fireEvent.press(screen.getByRole("button", { name: "llm.cancel" }))
  expect(mockStopPreview).toHaveBeenCalled()
  expect(mockSave).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: "Alice" })).toBeTruthy()
})
