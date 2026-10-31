import { useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native"
import type { Library } from "@my-reader/tools/types/library"
import {
  draftBookCharacters,
  searchBookCharacterSources,
  type BookCharacter,
} from "@/src/services/core/narration"
import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import { NarrationCharacterImport } from "./NarrationCharacterImport"

jest.mock("@/src/services/core/narration", () => ({
  draftBookCharacters: jest.fn(),
  searchBookCharacterSources: jest.fn(),
}))
jest.mock("@/src/features/reader/lib/character-introductions", () => ({
  findCharacterIntroductions: jest.fn(),
}))
jest.mock("react-i18next", () => ({
  ...jest.requireActual("react-i18next"),
  useTranslation: () => ({ t: mockTranslate }),
}))
const mockTranslate = (key: string) => key
jest.mock("@expo/ui/community/bottom-sheet", () => ({
  BottomSheetScrollView: jest.requireActual("react-native").ScrollView,
}))
jest.mock("@/tw", () => {
  const native = jest.requireActual("react-native")
  return {
    View: native.View,
    Text: native.Text,
    Pressable: native.Pressable,
    TouchableHighlight: native.TouchableHighlight,
  }
})
jest.mock("./ReaderTtsSettingsFields", () => ({
  ProviderTextField: (props: unknown) =>
    jest
      .requireActual("react")
      .createElement(jest.requireActual("react-native").TextInput, props),
}))
jest.mock("@/src/components/streaming-status-line", () => ({
  StreamingStatusLine: ({ label, text }: { label: string; text: string }) =>
    jest
      .requireActual("react")
      .createElement(
        jest.requireActual("react-native").Text,
        { accessibilityRole: "progressbar", accessibilityLabel: label },
        text || label,
      ),
}))

const source = { title: "Book", url: "https://example.com/book" }
const candidates: BookCharacter[] = [
  {
    id: "",
    name: "New",
    nicknames: [],
    description: "New description",
    instructions: "",
  },
  {
    id: "existing",
    name: "Existing",
    nicknames: [],
    description: "Existing description",
    instructions: "",
  },
]
const palette = readerChromePalette("#272018", "#f5eddc")

function mount(onImport = jest.fn(), onCancel = jest.fn()) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  function Page() {
    const [action, setAction] = useState<ReactNode>(null)
    return (
      <>
        {action}
        <NarrationCharacterImport
          book={{
            library: { id: "library" } as Library,
            bookId: 1,
            title: "Book",
            authors: [],
            language: "zh",
          }}
          mode="encyclopedia"
          palette={palette}
          saving={false}
          onCancel={onCancel}
          onImport={onImport}
          onHeaderActionChange={setAction}
        />
      </>
    )
  }
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  )
  return { onImport, onCancel }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(searchBookCharacterSources).mockResolvedValue([source])
  jest.mocked(draftBookCharacters).mockResolvedValue(candidates)
})

async function organize() {
  fireEvent.press(await screen.findByRole("checkbox", { name: "Book" }))
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "narration.organize" })),
  )
}

it("selects and clears all candidates, exposing replacement badges only for selected duplicates", async () => {
  const { onImport } = mount()
  await organize()
  expect(await screen.findByText("narration.alreadyExists")).toBeTruthy()
  expect(
    screen.getByRole("checkbox", { name: "narration.replaceCharacter" }),
  ).not.toBeChecked()
  fireEvent.press(screen.getByRole("button", { name: "common.selectAll" }))
  expect(screen.getByText("narration.willReplace")).toBeTruthy()
  for (const checkbox of screen.getAllByRole("checkbox"))
    expect(checkbox).toBeChecked()
  fireEvent.press(screen.getByRole("button", { name: "common.deselectAll" }))
  expect(
    screen.getByRole("button", { name: "narration.importSelected" }),
  ).toBeDisabled()
  expect(screen.getByText("narration.alreadyExists")).toBeTruthy()
  fireEvent.press(screen.getByRole("button", { name: "common.selectAll" }))
  fireEvent.press(
    screen.getByRole("button", { name: "narration.importSelected" }),
  )
  expect(onImport).toHaveBeenCalledWith(candidates)
})

it("cancels organizing in place, keeps the source and permits a fresh request", async () => {
  let finish!: (value: BookCharacter[]) => void
  jest.mocked(draftBookCharacters).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { onCancel, onImport } = mount()
  await organize()
  await waitFor(() => expect(draftBookCharacters).toHaveBeenCalledTimes(1))
  const call = jest.mocked(draftBookCharacters).mock.calls[0]!
  act(() => call[3]("text", "partial"))
  expect(screen.getByRole("progressbar")).toHaveTextContent("partial")
  fireEvent.press(screen.getByRole("button", { name: "llm.cancel" }))
  expect(call[4].aborted).toBe(true)
  expect(onCancel).not.toHaveBeenCalled()
  expect(screen.getByRole("checkbox", { name: "Book" })).toBeChecked()
  expect(
    screen.getByRole("button", { name: "narration.organize" }),
  ).toBeEnabled()
  await act(async () => finish(candidates))
  expect(screen.queryByRole("progressbar")).toBeNull()
  expect(screen.queryByText("New")).toBeNull()
  expect(onImport).not.toHaveBeenCalled()
  await act(async () =>
    fireEvent.press(screen.getByRole("button", { name: "narration.organize" })),
  )
  expect(await screen.findByText("New")).toBeTruthy()
})

it("uses the header search action to refresh the edited query and clears the source selection", async () => {
  mount()
  fireEvent.press(await screen.findByRole("checkbox", { name: "Book" }))
  fireEvent.changeText(
    screen.getByTestId("narration-source-query"),
    "Another Book",
  )
  fireEvent.press(screen.getByRole("button", { name: "narration.search" }))
  await waitFor(() =>
    expect(searchBookCharacterSources).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ title: "Another Book" }),
      expect.anything(),
    ),
  )
  expect(
    screen.getByRole("button", { name: "narration.organize" }),
  ).toBeDisabled()
})
